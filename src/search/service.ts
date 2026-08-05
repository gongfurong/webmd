/**
 * 统一搜索服务：MiniSearch 关键词 + 可选本地向量（混合，无大模型）
 * UI 只调用 search() / getFacets()，不写第二套逻辑
 */
import MiniSearch from 'minisearch';
import type {
	FacetCounts,
	SearchBodyHit,
	SearchDoc,
	SearchHit,
	SearchHeadingHit,
	SearchIndexFile,
	SearchProseHit,
	SearchQuery,
	SearchScopes,
	SearchSection,
} from './types';
import {
	DEFAULT_SCOPES,
	SCOPE_FIELD_MAP,
	folderAncestors,
	filePathMatchesSelection,
	withHash,
} from './types';
import {
	escapeHtml,
	excerptHighlight,
	fieldsMatchTerms,
	fieldMatches,
	highlightText,
	highlightTextWithVectorExpand,
	literalMatches,
	splitQueryTerms,
	stripHighlightHtml,
	type CombineMode,
	type MatchMode,
} from './highlight';
import {
	highlightVectorText,
	loadVectorIndex,
	vectorSearch,
} from './vector';
import { expandVectorQueries } from './vector-expand';

/**
 * 路径行高亮：仅高亮「允许且应亮」的段。
 * - highlightFolder：高亮目录段（最后一个 / 之前）
 * - highlightFile：高亮文件名段
 * 关「文件夹」时 highlightFolder 必须为 false，避免目录词被染上（含纯向量结果）。
 */
function buildPathHtmlByMatch(
	pathText: string,
	fileName: string,
	highlightFolder: boolean,
	highlightFile: boolean,
	hl: (text: string) => string,
): string {
	const full = String(pathText || fileName || '');
	if (!full) return '';
	if (!highlightFolder && !highlightFile) return escapeHtml(full);

	const slash = full.lastIndexOf('/');
	if (slash < 0) {
		return highlightFile ? hl(full) : escapeHtml(full);
	}
	const folderPart = full.slice(0, slash);
	const filePart = full.slice(slash + 1) || fileName;
	const folderHtml = highlightFolder
		? hl(folderPart)
		: escapeHtml(folderPart);
	const fileHtml = highlightFile ? hl(filePart) : escapeHtml(filePart);
	return `${folderHtml}/${fileHtml}`;
}

/** 段内是否出现查询/扩展词（用于向量结果按范围决定能否染路径） */
function segmentHasQueryTerms(
	text: string,
	q: string,
	expandQ: string,
): boolean {
	const t = String(text || '');
	if (!t) return false;
	if (fieldMatches(t, q, 'fuzzy', 'OR', false, false)) return true;
	const eq = String(expandQ || '').trim();
	if (eq && fieldMatches(t, eq, 'fuzzy', 'OR', false, false)) return true;
	return false;
}

/**
 * 是否存在「可展示的向量侧词」：双色高亮后必须出现 ms-mark--vector（青绿）。
 * 仅 field 命中扩展词但界面染不出绿 → 不算双（避免只有黄「编程」却标双）。
 */
function hasVisibleVectorExpandMark(
	text: string,
	_keywordQ: string,
	expandQ: string,
	hlDual: (s: string) => string,
): boolean {
	const bag = String(text || '').trim();
	if (!bag || !String(expandQ || '').trim()) return false;
	// reHlDual 内部：查询词琥珀 + 扩展词青绿；无青绿 class 即无可展示向量侧词
	return hlDual(bag).includes('ms-mark--vector');
}

/**
 * 纯向量入选：必须能在路径/文件名/摘要上高亮到查询或扩展词（可解释）。
 * 且遵守文件夹范围：字面只在未勾选的目录上 → 丢弃。
 */
function pureVectorAllowedByScopes(
	scopes: SearchScopes,
	parts: {
		folder: string;
		file: string;
		path: string;
		snippet: string;
	},
	q: string,
	expandQ: string,
): boolean {
	const pathText = parts.path || '';
	const slash = pathText.lastIndexOf('/');
	const folderPart =
		parts.folder ||
		(slash >= 0 ? pathText.slice(0, slash) : '');
	const filePart =
		parts.file ||
		(slash >= 0 ? pathText.slice(slash + 1) : pathText);

	const inFolder = segmentHasQueryTerms(folderPart, q, expandQ);
	const inFile = segmentHasQueryTerms(filePart, q, expandQ);
	const inSnippet = segmentHasQueryTerms(parts.snippet || '', q, expandQ);

	// 无任何可高亮字面 → 不入选（纯「分数近」不够）
	if (!inFolder && !inFile && !inSnippet) return false;

	// 查询字面只沾目录、目录范围未开 → 不要
	if (inFolder && !scopes.folder && !inFile && !inSnippet) return false;

	if (scopes.folder && inFolder) return true;
	if (scopes.file && inFile) return true;
	if ((scopes.abstract || scopes.body) && inSnippet) return true;
	return false;
}

/** 单文件段落命中上限（摘要+正文合计，避免刷屏） */
const MAX_PROSE_HITS = 8;
/** 段落摘录：命中词前后各约 60 字 */
const PROSE_EXCERPT_RADIUS = 60;

/** 中英混合分词：英文词 + 中文单字/双字 */
export function searchTokenize(text: string): string[] {
	const normalized = String(text || '').toLowerCase();
	const parts = normalized.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
	const out: string[] = [];
	for (const p of parts) {
		if (/[\u4e00-\u9fff]/.test(p)) {
			for (let i = 0; i < p.length; i++) {
				out.push(p[i]!);
				if (i + 1 < p.length) out.push(p.slice(i, i + 2));
			}
		} else if (p.length) {
			out.push(p);
		}
	}
	return out;
}

function scopesToFields(scopes: SearchScopes): string[] {
	const fields: string[] = [];
	if (scopes.folder) fields.push(...SCOPE_FIELD_MAP.folder);
	if (scopes.file) fields.push(...SCOPE_FIELD_MAP.file);
	if (scopes.title) fields.push(...SCOPE_FIELD_MAP.title);
	if (scopes.abstract) fields.push(...SCOPE_FIELD_MAP.abstract);
	if (scopes.body) fields.push(...SCOPE_FIELD_MAP.body);
	return [...new Set(fields)];
}

function normalizeScopes(scopes?: Partial<SearchScopes>): SearchScopes {
	return {
		folder: scopes?.folder ?? DEFAULT_SCOPES.folder,
		file: scopes?.file ?? DEFAULT_SCOPES.file,
		title: scopes?.title ?? DEFAULT_SCOPES.title,
		abstract: scopes?.abstract ?? DEFAULT_SCOPES.abstract,
		body: scopes?.body ?? DEFAULT_SCOPES.body,
	};
}

export class SearchService {
	private mini: MiniSearch<SearchDoc>;
	private docsById = new Map<string, SearchDoc>();
	private facetCounts: FacetCounts = { format: {}, folder: {} };
	private ready = false;

	constructor() {
		this.mini = new MiniSearch<SearchDoc>({
			// path 仍存但不进检索字段：文件名=file，目录=folder，避免「勾文件却扫整条路径」
			fields: ['file', 'folder', 'h1', 'h2', 'h3', 'abstract', 'body'],
			storeFields: [
				'id',
				'href',
				'file',
				'path',
				'h1',
				'h2',
				'h3',
				'abstract',
				'body',
				'format',
				'folder',
				'displayTitle',
			],
			idField: 'id',
			tokenize: searchTokenize,
			processTerm: (term) => term.toLowerCase(),
			searchOptions: {
				boost: {
					file: 6,
					folder: 5,
					h1: 4,
					h2: 3,
					h3: 2,
					abstract: 3,
					body: 1,
				},
				fuzzy: 0.15,
				prefix: true,
				combineWith: 'AND',
			},
		});
	}

	get isReady() {
		return this.ready;
	}

	/** 从 /search-index.json 加载 */
	async load(url = '/search-index.json'): Promise<void> {
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) throw new Error(`search-index ${res.status}`);
		const data = (await res.json()) as SearchIndexFile;
		this.loadFromData(data);
	}

	loadFromData(data: SearchIndexFile) {
		this.mini.removeAll();
		this.docsById.clear();
		const docs = data.docs || [];
		this.mini.addAll(docs);
		for (const d of docs) this.docsById.set(d.id, d);
		this.facetCounts = data.facets || this.computeFacets(docs);
		this.ready = true;
	}

	getFacets(): FacetCounts {
		return this.facetCounts;
	}

	/** 全部可搜索文档（侧栏文件树） */
	getDocs(): SearchDoc[] {
		return [...this.docsById.values()];
	}

	private computeFacets(docs: SearchDoc[]): FacetCounts {
		const format: Record<string, number> = {};
		const folder: Record<string, number> = {};
		for (const d of docs) {
			format[d.format] = (format[d.format] || 0) + 1;
			folder[d.folder] = (folder[d.folder] || 0) + 1;
		}
		for (const key of Object.keys(folder)) {
			for (const a of folderAncestors(key)) {
				if (folder[a] == null) folder[a] = 0;
			}
		}
		return { format, folder };
	}

	/**
	 * 统一入口：关键词（MiniSearch）+ 可选向量；async 因向量需本地 embed
	 */
	async search(query: SearchQuery): Promise<SearchHit[]> {
		if (!this.ready) return [];
		/** 完全匹配：保留原始查询（含空格），不做 trim */
		const strict = query.strict === true;
		const rawQ = String(query.q ?? '');
		const q = strict ? rawQ : rawQ.trim();
		if (!q) return [];

		const scopes = normalizeScopes(query.scopes);
		const fields = scopesToFields(scopes);
		// 关键词侧：范围全关则不做关键词检索（仍可走向量）
		const keywordWanted = fields.length > 0;
		// 仅当 UI 明确打开向量时启用（默认关；需模型加载成功后才勾选）
		const vectorWanted = query.vectorEnabled === true;

		const formatSet = new Set(query.facets?.format || []);
		const folderSet = new Set(query.facets?.folder || []);
		const limit = query.limit ?? 40;
		const fuzzyOn = !strict && query.fuzzy !== false;
		const matchMode: MatchMode = fuzzyOn ? 'fuzzy' : 'exact';
		const combine: CombineMode =
			query.combine === 'OR' || query.combine === 'AND'
				? query.combine
				: 'AND';
		/** 默认忽略大小写；与精确/模糊正交 */
		const caseSensitive = query.caseSensitive === true;
		/** 词模式：主要约束拉丁词边界；中文仍按串 */
		const wholeWord = query.wholeWord === true;
		const terms = strict ? [q] : splitQueryTerms(q);
		if (keywordWanted && !terms.length && !vectorWanted) return [];

		/**
		 * 关键词候选：
		 * - 完全匹配 / 非模糊：全库扫
		 * - 模糊：MiniSearch（多词用 combineWith）
		 */
		let candidateDocs: SearchDoc[] = [];
		if (keywordWanted && terms.length) {
			if (fuzzyOn) {
				const raw = this.mini.search(q, {
					fields,
					boost: {
						file: 6,
						folder: 5,
						h1: 4,
						h2: 3,
						h3: 2,
						abstract: 3,
						body: 1,
					},
					fuzzy: 0.15,
					prefix: true,
					combineWith:
						terms.length > 1
							? combine
							: q.length <= 2 || /[\u4e00-\u9fff]/.test(q)
								? 'OR'
								: 'AND',
					filter: (result) => {
						const doc = this.docsById.get(String(result.id));
						if (!doc) return false;
						if (formatSet.size && !formatSet.has(doc.format)) return false;
						if (
							folderSet.size &&
							!filePathMatchesSelection(doc.path, folderSet)
						)
							return false;
						return true;
					},
				});
				for (const r of raw) {
					const doc = this.docsById.get(String(r.id));
					if (doc) candidateDocs.push(doc);
				}
			} else {
				for (const doc of this.docsById.values()) {
					if (formatSet.size && !formatSet.has(doc.format)) continue;
					if (
						folderSet.size &&
						!filePathMatchesSelection(doc.path, folderSet)
					)
						continue;
					candidateDocs.push(doc);
				}
			}
		}

		const hitsById = new Map<string, SearchHit>();
		const hits: SearchHit[] = [];
		for (const doc of candidateDocs) {
			// 精确：整段包含（不拆词）；模糊/与或仅在非精确时生效；大小写单独控制
			// 文件 = 仅文件名；文件夹 = 仅目录路径（doc.folder），互不混用完整 path
			let folderHit: boolean;
			let fileHit: boolean;
			let titleHit: boolean;
			let abstractHit: boolean;
			let bodyHit: boolean;
			const folderText = doc.folder || '';
			if (strict) {
				folderHit =
					scopes.folder &&
					literalMatches(folderText, q, caseSensitive, wholeWord);
				fileHit =
					scopes.file &&
					literalMatches(doc.file, q, caseSensitive, wholeWord);
				titleHit =
					scopes.title &&
					(literalMatches(doc.h1, q, caseSensitive, wholeWord) ||
						literalMatches(doc.h2, q, caseSensitive, wholeWord) ||
						literalMatches(doc.h3, q, caseSensitive, wholeWord));
				abstractHit =
					scopes.abstract &&
					literalMatches(doc.abstract || '', q, caseSensitive, wholeWord);
				bodyHit =
					scopes.body &&
					literalMatches(doc.body, q, caseSensitive, wholeWord);
			} else {
				folderHit =
					scopes.folder &&
					fieldMatches(
						folderText,
						q,
						matchMode,
						combine,
						caseSensitive,
						wholeWord,
					);
				fileHit =
					scopes.file &&
					fieldMatches(
						doc.file,
						q,
						matchMode,
						combine,
						caseSensitive,
						wholeWord,
					);
				titleHit =
					scopes.title &&
					fieldsMatchTerms(
						[doc.h1, doc.h2, doc.h3],
						q,
						matchMode,
						combine,
						caseSensitive,
						wholeWord,
					);
				abstractHit =
					scopes.abstract &&
					fieldMatches(
						doc.abstract || '',
						q,
						matchMode,
						combine,
						caseSensitive,
						wholeWord,
					);
				bodyHit =
					scopes.body &&
					fieldMatches(
						doc.body,
						q,
						matchMode,
						combine,
						caseSensitive,
						wholeWord,
					);
			}
			if (
				!folderHit &&
				!fileHit &&
				!titleHit &&
				!abstractHit &&
				!bodyHit
			)
				continue;

			const headingBySlug = new Map(
				(doc.headings || []).map((h) => [h.slug, h])
			);

			const textHit = (text: string) =>
				strict
					? literalMatches(text, q, caseSensitive, wholeWord)
					: fieldMatches(
							text,
							q,
							matchMode,
							combine,
							caseSensitive,
							wholeWord,
						);
			// 关键字阶段只染查询词（琥珀）。扩展青绿仅在后面打成「双」时补上，避免「全是关却一片绿」
			const hl = (text: string) =>
				highlightText(
					text,
					q,
					matchMode,
					combine,
					strict,
					caseSensitive,
					wholeWord,
				);
			const ex = (text: string) =>
				excerptHighlight(
					text,
					q,
					PROSE_EXCERPT_RADIUS,
					matchMode,
					combine,
					strict,
					caseSensitive,
					wholeWord,
				);

			// 标题命中（h1–h3）
			const titleSlugSet = new Set<string>();
			const headingHits: SearchHeadingHit[] = [];
			if (titleHit && doc.headings?.length) {
				for (const h of doc.headings) {
					if (h.depth > 3) continue;
					if (h.text && textHit(h.text)) {
						titleSlugSet.add(h.slug);
						headingHits.push({
							html: hl(h.text),
							href: withHash(doc.href, h.slug),
							depth: h.depth,
							slug: h.slug,
						});
					}
				}
			} else if (titleHit) {
				for (const [depth, block] of [
					[1, doc.h1],
					[2, doc.h2],
					[3, doc.h3],
				] as const) {
					if (!block) continue;
					for (const line of block.split('\n')) {
						if (line && textHit(line)) {
							headingHits.push({
								html: hl(line),
								href: doc.href,
								depth,
							});
						}
					}
				}
			}

			/**
			 * 段落命中：摘要 = 第一段正文（挂 abstractSlug 下）；
			 * 正文 = 其余段落。统一按 slug 归组，再按文中 h* 顺序出 sections。
			 */
			type ProseAcc = {
				html: string;
				href: string;
				slug: string;
				kind: 'abstract' | 'body';
			};
			const proseList: ProseAcc[] = [];

			let abstractHtml: string | undefined;
			let abstractHref: string | undefined;
			if (abstractHit && doc.abstract) {
				const slug = doc.abstractSlug || '';
				abstractHtml = ex(doc.abstract);
				abstractHref = withHash(doc.href, slug || undefined);
				proseList.push({
					html: abstractHtml,
					href: abstractHref,
					slug,
					kind: 'abstract',
				});
			}

			const bodyHits: SearchBodyHit[] = [];
			if (bodyHit) {
				const parts = doc.bodyParts || [];
				const matched = parts.filter((p) => textHit(p.text));
				const list = matched.length
					? matched
					: doc.body
						? [{ slug: '', text: doc.body, heading: undefined, depth: undefined }]
						: [];

				const room = Math.max(0, MAX_PROSE_HITS - proseList.length);
				for (const part of list.slice(0, room)) {
					const slug = part.slug || '';
					const html = ex(part.text);
					const href = withHash(doc.href, slug || undefined);
					const hMeta =
						(slug && headingBySlug.get(slug)) ||
						(part.heading
							? { text: part.heading, depth: part.depth ?? 0, slug }
							: undefined);
					bodyHits.push({
						html,
						href,
						kind: 'body',
						headingHtml: hMeta?.text
							? escapeHtml(hMeta.text)
							: undefined,
						depth: hMeta?.depth || undefined,
						slug: slug || undefined,
					});
					proseList.push({ html, href, slug, kind: 'body' });
				}
			}

			// slug → 段落（保持 proseList 文档顺序）
			const proseBySlug = new Map<string, SearchProseHit[]>();
			for (const p of proseList) {
				const key = p.slug || '';
				if (!proseBySlug.has(key)) proseBySlug.set(key, []);
				proseBySlug.get(key)!.push({
					html: p.html,
					href: p.href,
					kind: p.kind,
				});
			}

			/** 按原文 h* 顺序组装；无标题段落在前 */
			const sections: SearchSection[] = [];
			const usedSlugs = new Set<string>();

			const noSlugProse = proseBySlug.get('') || [];
			if (noSlugProse.length) {
				usedSlugs.add('');
				sections.push({ prose: noSlugProse });
			}

			const docHeadings = doc.headings || [];
			if (docHeadings.length) {
				for (const h of docHeadings) {
					const titleMatched = titleSlugSet.has(h.slug);
					const prose = proseBySlug.get(h.slug) || [];
					if (!titleMatched && !prose.length) continue;
					usedSlugs.add(h.slug);
					sections.push({
						slug: h.slug,
						depth: h.depth,
						titleMatched,
						// 有对应 h* 就显示；标题命中则高亮，否则原文（段落挂靠用）
						headingHtml: titleMatched ? hl(h.text) : escapeHtml(h.text),
						headingHref: withHash(doc.href, h.slug),
						prose,
					});
				}
			} else {
				// 无 headings 元数据：标题命中扁平列出
				for (const t of headingHits) {
					const slug = t.slug || '';
					if (slug) usedSlugs.add(slug);
					sections.push({
						slug: slug || undefined,
						depth: t.depth,
						titleMatched: true,
						headingHtml: t.html,
						headingHref: t.href,
						prose: slug ? proseBySlug.get(slug) || [] : [],
					});
				}
			}

			// 残余 slug（索引有 slug 但不在 headings 里）
			for (const [slug, prose] of proseBySlug) {
				if (usedSlugs.has(slug) || !slug) continue;
				const h = headingBySlug.get(slug);
				sections.push({
					slug,
					depth: h?.depth,
					titleMatched: false,
					headingHtml: h?.text ? escapeHtml(h.text) : undefined,
					headingHref: withHash(doc.href, slug),
					prose,
				});
			}

			const pathText = doc.path || doc.file;
			const hit: SearchHit = {
				id: doc.id,
				href: doc.href,
				displayTitle: doc.displayTitle || pathText,
				format: doc.format,
				folder: doc.folder,
				match: {
					folder: folderHit,
					file: fileHit,
					title: titleHit,
					abstract: abstractHit,
					body: bodyHit,
				},
				sources: { keyword: true, vector: false },
				pathHtml: buildPathHtmlByMatch(
					pathText,
					doc.file,
					// 未勾文件夹：目录段永不匹配/高亮；勾了才允许对目录段 hl
					Boolean(scopes.folder && folderHit),
					Boolean(scopes.file && fileHit),
					hl,
				),
				sections,
				headingHits,
				abstractHtml,
				abstractHref,
				bodyHits,
				bodyHtml: bodyHits[0]?.html,
				bodyHref: bodyHits[0]?.href,
				score: 1,
			};
			hitsById.set(doc.id, hit);
			hits.push(hit);
		}

		// —— 向量检索（本地 embedding，可选）——
		if (vectorWanted) {
			try {
				await loadVectorIndex();
				const { hits: vHits } = await vectorSearch(q, {
					// 宽一点：保证关键字已中的文能并成「双」；纯向量再在下方收紧
					limit: Math.min(60, Math.max(limit, 40)),
					minScore: 0.8,
					formatSet,
					filePathSet: folderSet,
					filePathMatches: filePathMatchesSelection,
				});
				const vecExpandQ = expandVectorQueries(q).join(' ');
				const reHlDual = (text: string) =>
					highlightTextWithVectorExpand(
						text,
						q,
						vecExpandQ,
						matchMode,
						combine,
						strict,
						caseSensitive,
						wholeWord,
					);
				const peakVec = vHits[0]?.score ?? 0;
				const expandTerms = expandVectorQueries(q);
				const hlQ = expandTerms.join(' ');

				for (const vh of vHits) {
					const existing = hitsById.get(vh.item.id);
					if (existing) {
						// 双方式：关键字已中 + 向量候选 + 可见区有青绿扩展词
						// 未勾「文件夹」：目录段不参与证据、不匹配、不高亮
						const fullPath =
							existing.id ||
							(existing.folder
								? `${existing.folder}/${existing.displayTitle}`
								: existing.displayTitle);
						const slash = fullPath.lastIndexOf('/');
						const folderPart =
							slash >= 0 ? fullPath.slice(0, slash) : '';
						const filePart =
							slash >= 0
								? fullPath.slice(slash + 1)
								: fullPath;
						const pathEvidence = [
							scopes.folder ? folderPart : '',
							scopes.file ? filePart : '',
						]
							.filter(Boolean)
							.join('\n');
						const visibleBag = [
							pathEvidence,
							existing.displayTitle,
							...(existing.headingHits || []).map((h) =>
								stripHighlightHtml(h.html),
							),
							...(existing.sections || []).flatMap((s) => [
								s.headingHtml
									? stripHighlightHtml(s.headingHtml)
									: '',
								...(s.prose || []).map((p) =>
									stripHighlightHtml(p.html),
								),
							]),
							existing.abstractHtml
								? stripHighlightHtml(existing.abstractHtml)
								: '',
							...(existing.bodyHits || []).map((b) =>
								stripHighlightHtml(b.html),
							),
						]
							.filter(Boolean)
							.join('\n');
						if (
							!hasVisibleVectorExpandMark(
								visibleBag,
								q,
								vecExpandQ,
								reHlDual,
							)
						) {
							continue;
						}
						// 路径分段高亮：仅勾选的范围可染（关文件夹 → 目录段纯文本）
						const pathHtmlDual = buildPathHtmlByMatch(
							fullPath,
							filePart || existing.displayTitle,
							Boolean(scopes.folder),
							Boolean(scopes.file),
							reHlDual,
						);
						const sectionDual = (existing.sections || []).map(
							(sec) => ({
								...sec,
								headingHtml: sec.headingHtml
									? reHlDual(
											stripHighlightHtml(sec.headingHtml),
										)
									: sec.headingHtml,
								prose: (sec.prose || []).map((p) => ({
									...p,
									html: reHlDual(stripHighlightHtml(p.html)),
								})),
							}),
						);
						const headingDual = (existing.headingHits || []).map(
							(h) => ({
								...h,
								html: reHlDual(stripHighlightHtml(h.html)),
							}),
						);
						const bodyDual = (existing.bodyHits || []).map((b) => ({
							...b,
							html: reHlDual(stripHighlightHtml(b.html)),
						}));
						const abstractDual = existing.abstractHtml
							? reHlDual(
									stripHighlightHtml(existing.abstractHtml),
								)
							: existing.abstractHtml;
						const anyGreen = [
							// 路径：只认允许高亮的段（buildPathHtml 已处理）
							pathHtmlDual,
							abstractDual,
							...headingDual.map((h) => h.html),
							...bodyDual.map((b) => b.html),
							...sectionDual.flatMap((s) => [
								s.headingHtml || '',
								...(s.prose || []).map((p) => p.html),
							]),
						].some((h) =>
							String(h || '').includes('ms-mark--vector'),
						);
						if (!anyGreen) continue;

						existing.sources.vector = true;
						existing.vectorScore = vh.score;
						existing.score = Math.max(existing.score, 1 + vh.score);
						existing.pathHtml = pathHtmlDual;
						existing.sections = sectionDual;
						existing.headingHits = headingDual;
						existing.bodyHits = bodyDual;
						existing.abstractHtml = abstractDual;
						if (existing.bodyHtml && bodyDual[0]) {
							existing.bodyHtml = bodyDual[0].html;
						} else if (existing.bodyHtml) {
							existing.bodyHtml = reHlDual(
								stripHighlightHtml(existing.bodyHtml),
							);
						}
						continue;
					}
					// 纯向量：分数门槛 + 必须能在路径/摘要高亮到查询或扩展词
					if (peakVec > 0 && vh.score < peakVec - 0.04) continue;
					if (vh.score < 0.83) continue;

					const pathText = vh.item.path || vh.item.file;
					const titleText = vh.item.displayTitle || pathText;
					const snip = vh.item.snippet || '';
					const vMark = 'ms-mark--vector';
					if (
						!pureVectorAllowedByScopes(
							scopes,
							{
								folder: vh.item.folder || '',
								file: vh.item.file || '',
								path: pathText,
								snippet: snip,
							},
							q,
							hlQ,
						)
					) {
						continue;
					}
					// 路径分段：关「文件夹」绝不匹配/高亮目录段；关「文件」不染文件名
					const slash = pathText.lastIndexOf('/');
					const folderPart =
						slash >= 0 ? pathText.slice(0, slash) : '';
					const filePart =
						slash >= 0
							? pathText.slice(slash + 1)
							: pathText || vh.item.file;
					// 可展示袋：不含未勾选范围的路径段
					const showBag = [
						scopes.folder ? folderPart : '',
						scopes.file ? filePart : '',
						titleText,
						snip,
					]
						.filter(Boolean)
						.join('\n');
					if (!segmentHasQueryTerms(showBag, q, hlQ)) continue;

					const snipHtml = snip
						? await highlightVectorText(snip, hlQ, null, vMark)
						: '';
					const folderHtml =
						scopes.folder && folderPart
							? await highlightVectorText(
									folderPart,
									hlQ,
									null,
									vMark,
								)
							: escapeHtml(folderPart);
					const fileHtml = scopes.file
						? await highlightVectorText(
								filePart || vh.item.file,
								hlQ,
								null,
								vMark,
							)
						: escapeHtml(filePart || vh.item.file || '');
					const pathLineHtml = folderPart
						? `${folderHtml}/${fileHtml}`
						: fileHtml;
					const vectorOnly: SearchHit = {
						id: vh.item.id,
						href: vh.item.href,
						displayTitle: titleText,
						format: vh.item.format,
						folder: vh.item.folder,
						match: {
							// 纯向量不记关键字范围命中，避免结果筛选误出「文件夹」
							folder: false,
							file: false,
							title: false,
							abstract: Boolean(snip),
							body: Boolean(snip),
						},
						sources: { keyword: false, vector: true },
						vectorScore: vh.score,
						pathHtml: pathLineHtml,
						sections: snipHtml
							? [
									{
										prose: [
											{
												html: snipHtml,
												href: vh.item.href,
												kind: 'abstract',
											},
										],
									},
								]
							: [],
						headingHits: [],
						bodyHits: [],
						score: vh.score,
					};
					hitsById.set(vh.item.id, vectorOnly);
					hits.push(vectorOnly);
				}
			} catch (e) {
				console.warn('[search] vector branch failed', e);
			}
		}

		// 最终列表序由 UI（方式序 / 名序）决定；此处仅稳定完整路径序作兜底
		hits.sort((a, b) => {
			const pa = a.id || a.displayTitle || '';
			const pb = b.id || b.displayTitle || '';
			return pa.localeCompare(pb, 'zh-CN', {
				numeric: true,
				sensitivity: 'base',
			});
		});

		return hits.slice(0, limit);
	}
}

/** 单例：页面内复用 */
let singleton: SearchService | null = null;

export function getSearchService(): SearchService {
	if (!singleton) singleton = new SearchService();
	return singleton;
}
