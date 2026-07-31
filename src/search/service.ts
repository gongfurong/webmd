/**
 * 统一搜索服务：MiniSearch + 多字段 scopes/facets
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
	folderMatchesSelection,
	withHash,
} from './types';
import {
	escapeHtml,
	excerptHighlight,
	fieldsMatchTerms,
	fieldMatches,
	highlightText,
	literalMatches,
	splitQueryTerms,
	type CombineMode,
	type MatchMode,
} from './highlight';

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
	if (scopes.file) fields.push(...SCOPE_FIELD_MAP.file);
	if (scopes.title) fields.push(...SCOPE_FIELD_MAP.title);
	if (scopes.abstract) fields.push(...SCOPE_FIELD_MAP.abstract);
	if (scopes.body) fields.push(...SCOPE_FIELD_MAP.body);
	return [...new Set(fields)];
}

function normalizeScopes(scopes?: Partial<SearchScopes>): SearchScopes {
	return {
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
			fields: ['file', 'path', 'h1', 'h2', 'h3', 'abstract', 'body'],
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
					path: 6,
					file: 6,
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
	 * 统一入口：分面过滤 + 字段检索 + 按 scopes 高亮
	 */
	search(query: SearchQuery): SearchHit[] {
		if (!this.ready) return [];
		/** 完全匹配：保留原始查询（含空格），不做 trim */
		const strict = query.strict === true;
		const rawQ = String(query.q ?? '');
		const q = strict ? rawQ : rawQ.trim();
		if (!q) return [];

		const scopes = normalizeScopes(query.scopes);
		const fields = scopesToFields(scopes);
		// 范围全关 → 无结果
		if (!fields.length) return [];

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
		if (!terms.length) return [];

		/**
		 * 候选：
		 * - 完全匹配 / 非模糊：全库扫
		 * - 模糊：MiniSearch（多词用 combineWith）
		 */
		let candidateDocs: SearchDoc[] = [];
		if (fuzzyOn) {
			const raw = this.mini.search(q, {
				fields,
				boost: {
					path: 6,
					file: 6,
					h1: 4,
					h2: 3,
					h3: 2,
					abstract: 3,
					body: 1,
				},
				fuzzy: 0.15,
				prefix: true,
				// 多词汇组合由用户开关决定；单字中文仍可用 OR 放宽
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
						!folderMatchesSelection(doc.folder, folderSet)
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
					!folderMatchesSelection(doc.folder, folderSet)
				)
					continue;
				candidateDocs.push(doc);
			}
		}

		const hits: SearchHit[] = [];
		for (const doc of candidateDocs) {
			// 精确：整段包含（不拆词）；模糊/与或仅在非精确时生效；大小写单独控制
			let fileHit: boolean;
			let titleHit: boolean;
			let abstractHit: boolean;
			let bodyHit: boolean;
			if (strict) {
				fileHit =
					scopes.file &&
					(literalMatches(doc.file, q, caseSensitive, wholeWord) ||
						literalMatches(doc.path, q, caseSensitive, wholeWord));
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
				fileHit =
					scopes.file &&
					fieldsMatchTerms(
						[doc.file, doc.path],
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
			if (!fileHit && !titleHit && !abstractHit && !bodyHit) continue;

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
			hits.push({
				id: doc.id,
				href: doc.href,
				displayTitle: doc.displayTitle || pathText,
				format: doc.format,
				folder: doc.folder,
				match: {
					file: fileHit,
					title: titleHit,
					abstract: abstractHit,
					body: bodyHit,
				},
				pathHtml: fileHit ? hl(pathText) : escapeHtml(pathText),
				sections,
				headingHits,
				abstractHtml,
				abstractHref,
				bodyHits,
				bodyHtml: bodyHits[0]?.html,
				bodyHref: bodyHits[0]?.href,
				score: 1,
			});
		}

		// 默认按文件路径排序（locale 友好中文/数字路径）
		hits.sort((a, b) => {
			const pa = a.displayTitle || a.id || '';
			const pb = b.displayTitle || b.id || '';
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
