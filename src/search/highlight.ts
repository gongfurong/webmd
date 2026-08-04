/** 转义 HTML */
export function escapeHtml(s: string): string {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export type MatchMode = 'fuzzy' | 'exact';
export type CombineMode = 'AND' | 'OR';

/**
 * 多词汇分隔：空格/全角空格、中英文逗号
 * 点号等不算分隔（1.jpg 仍是一词）
 * 例：`1.jpg foo` / `1.jpg，图` / `a,b` → 多词
 */
export function splitQueryTerms(query: string): string[] {
	return String(query || '')
		.trim()
		.split(/[\s\u3000,，]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

/** 模糊用：在单词汇上扩展（不去掉原词；不按 . 再拆，避免 1.jpg → 1） */
function expandFuzzyVariants(term: string): string[] {
	const t = String(term || '').trim();
	if (!t) return [];
	const set = new Set<string>();
	set.add(t);
	// 去扩展名变体（可选辅助）：仅当整词像文件名时
	const noExt = t.replace(/\.[a-z0-9]{1,8}$/i, '');
	if (noExt && noExt !== t && noExt.length >= 2) set.add(noExt);
	// 中文滑窗 2–4
	const cjk = [...t].filter((ch) => /[\u4e00-\u9fff]/.test(ch)).join('');
	for (let n = Math.min(4, cjk.length); n >= 2; n--) {
		for (let i = 0; i + n <= cjk.length; i++) {
			set.add(cjk.slice(i, i + n));
		}
	}
	return [...set].sort((a, b) => b.length - a.length);
}

/** 含汉字等：词边界对中文几乎无意义，词模式仍按串处理 */
export function hasCjk(s: string): boolean {
	return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(s);
}

/**
 * 适合「词边界」的拉丁词形（英数 + 少量内部符号）。
 * 中文、纯符号、空格句等走串匹配。
 */
export function isLatinWordToken(term: string): boolean {
	const t = String(term || '').trim();
	if (!t || hasCjk(t)) return false;
	// 允许 file_name、don't、well-known 等
	return /^[A-Za-z0-9](?:[A-Za-z0-9_'.-]*[A-Za-z0-9])?$/.test(t) || /^[A-Za-z0-9]+$/.test(t);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在 plain 中找 needle 的所有区间。
 * wholeWord + 拉丁词：两侧不能是字母数字下划线；中文/非拉丁仍为子串。
 */
export function findAllRanges(
	plain: string,
	needle: string,
	caseSensitive = false,
	wholeWord = false,
): [number, number][] {
	const ranges: [number, number][] = [];
	if (!needle || !plain) return ranges;

	const useWord =
		wholeWord && isLatinWordToken(needle) && !hasCjk(needle);

	if (useWord) {
		const flags = caseSensitive ? 'gu' : 'giu';
		const re = new RegExp(
			`(?<![A-Za-z0-9_])${escapeRegExp(needle)}(?![A-Za-z0-9_])`,
			flags,
		);
		let m: RegExpExecArray | null;
		// 防止 zero-length 死循环
		re.lastIndex = 0;
		while ((m = re.exec(plain)) !== null) {
			const i = m.index;
			const len = m[0].length;
			if (len <= 0) {
				re.lastIndex++;
				continue;
			}
			ranges.push([i, i + len]);
			if (re.lastIndex === i) re.lastIndex++;
		}
		return ranges;
	}

	// 串：子串包含
	if (caseSensitive) {
		let from = 0;
		while (from < plain.length) {
			const i = plain.indexOf(needle, from);
			if (i < 0) break;
			ranges.push([i, i + needle.length]);
			from = i + Math.max(needle.length, 1);
		}
		return ranges;
	}
	const lower = plain.toLowerCase();
	const n = needle.toLowerCase();
	let from = 0;
	while (from < lower.length) {
		const i = lower.indexOf(n, from);
		if (i < 0) break;
		ranges.push([i, i + needle.length]);
		from = i + Math.max(needle.length, 1);
	}
	return ranges;
}

/**
 * 完全匹配（整段查询串连续包含，不拆词）
 * caseSensitive / wholeWord 见上
 */
export function literalMatches(
	text: string,
	query: string,
	caseSensitive = false,
	wholeWord = false,
): boolean {
	const plain = String(text ?? '');
	const q = String(query ?? '');
	if (!q) return false;
	return findAllRanges(plain, q, caseSensitive, wholeWord).length > 0;
}

/** 单词汇是否命中一段文本 */
export function termMatches(
	text: string,
	term: string,
	mode: MatchMode = 'fuzzy',
	caseSensitive = false,
	wholeWord = false,
): boolean {
	const plain = String(text || '');
	const t = String(term || '').trim();
	if (!t || !plain) return false;
	if (mode === 'exact') {
		return findAllRanges(plain, t, caseSensitive, wholeWord).length > 0;
	}
	// 模糊：变体扩展；词模式下拉丁变体也要求词界
	for (const v of expandFuzzyVariants(t)) {
		if (!v) continue;
		if (findAllRanges(plain, v, caseSensitive, wholeWord).length > 0) return true;
	}
	return false;
}

/**
 * 多词汇 + 组合：字段是否命中
 * - 空格分出的每个词独立判断
 * - combine AND：所有词都要命中本字段
 * - combine OR：任一词命中即可
 */
export function fieldMatches(
	text: string,
	query: string,
	mode: MatchMode = 'fuzzy',
	combine: CombineMode = 'AND',
	caseSensitive = false,
	wholeWord = false,
): boolean {
	const terms = splitQueryTerms(query);
	if (!terms.length) return false;
	if (combine === 'AND') {
		return terms.every((t) =>
			termMatches(text, t, mode, caseSensitive, wholeWord),
		);
	}
	return terms.some((t) => termMatches(text, t, mode, caseSensitive, wholeWord));
}

/**
 * 多个字段（如 file+path）作为一组范围：
 * AND：每个词至少落在组内某一字段
 * OR：任一词落在组内任一字段
 */
export function fieldsMatchTerms(
	fields: string[],
	query: string,
	mode: MatchMode = 'fuzzy',
	combine: CombineMode = 'AND',
	caseSensitive = false,
	wholeWord = false,
): boolean {
	const terms = splitQueryTerms(query);
	if (!terms.length) return false;
	const hit = (term: string) =>
		fields.some((f) => termMatches(f, term, mode, caseSensitive, wholeWord));
	if (combine === 'AND') return terms.every(hit);
	return terms.some(hit);
}

/** 用于高亮的词列表（按词长降序，避免短词抢先） */
function highlightTerms(query: string, mode: MatchMode): string[] {
	const base = splitQueryTerms(query);
	if (!base.length) return [];
	if (mode === 'exact') {
		return [...base].sort((a, b) => b.length - a.length);
	}
	const set = new Set<string>();
	for (const t of base) {
		for (const v of expandFuzzyVariants(t)) set.add(v);
	}
	return [...set].sort((a, b) => b.length - a.length);
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
	if (!ranges.length) return [];
	ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
	const merged: [number, number][] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push([r[0], r[1]]);
	}
	return merged;
}

function paintRanges(
	plain: string,
	ranges: [number, number][],
	markClass?: string,
): string {
	if (!ranges.length) return escapeHtml(plain);
	const cls =
		markClass && /^[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*$/.test(markClass)
			? ` class="${markClass}"`
			: '';
	let out = '';
	let cur = 0;
	for (const [a, b] of ranges) {
		if (a > cur) out += escapeHtml(plain.slice(cur, a));
		out += `<mark${cls}>${escapeHtml(plain.slice(a, b))}</mark>`;
		cur = b;
	}
	if (cur < plain.length) out += escapeHtml(plain.slice(cur));
	return out;
}

type TaggedRange = { a: number; b: number; cls?: string };

/** 按区间染色；重叠时先写入的优先（调用方应先放关键字再放向量） */
function paintTaggedRanges(plain: string, tagged: TaggedRange[]): string {
	if (!tagged.length) return escapeHtml(plain);
	// 切成互不重叠的原子段，每段取「最先覆盖」的 class
	const points = new Set<number>([0, plain.length]);
	for (const t of tagged) {
		points.add(Math.max(0, t.a));
		points.add(Math.min(plain.length, t.b));
	}
	const sorted = [...points].sort((x, y) => x - y);
	let out = '';
	for (let i = 0; i < sorted.length - 1; i++) {
		const a = sorted[i]!;
		const b = sorted[i + 1]!;
		if (a >= b) continue;
		const mid = (a + b) / 2;
		let cls: string | undefined;
		for (const t of tagged) {
			if (mid >= t.a && mid < t.b) {
				cls = t.cls;
				break;
			}
		}
		const slice = escapeHtml(plain.slice(a, b));
		if (cls && /^[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*$/.test(cls)) {
			out += `<mark class="${cls}">${slice}</mark>`;
		} else if (cls === '' || cls === undefined) {
			// cls 显式空字符串 = 默认关键字 mark；undefined 且未命中 = 纯文本
			const covered = tagged.some((t) => mid >= t.a && mid < t.b);
			out += covered ? `<mark>${slice}</mark>` : slice;
		} else {
			out += slice;
		}
	}
	return out;
}

function rangesForQuery(
	plain: string,
	query: string,
	mode: MatchMode,
	strict: boolean,
	caseSensitive: boolean,
	wholeWord: boolean,
): [number, number][] {
	if (!plain || !query) return [];
	if (strict) {
		return findAllRanges(plain, query, caseSensitive, wholeWord);
	}
	const terms = highlightTerms(query, mode);
	const ranges: [number, number][] = [];
	for (const term of terms) {
		ranges.push(...findAllRanges(plain, term, caseSensitive, wholeWord));
	}
	return mergeRanges(ranges);
}

/**
 * 在纯文本上高亮；按分隔符拆词后分别高亮
 * strict：只高亮整段查询串（不拆词）；大小写/词界由参数决定
 * markClass：可选，如纯向量命中用 ms-mark--vector
 */
export function highlightText(
	text: string,
	query: string,
	mode: MatchMode = 'fuzzy',
	_combine: CombineMode = 'AND',
	strict = false,
	caseSensitive = false,
	wholeWord = false,
	markClass?: string,
): string {
	const plain = String(text || '');
	if (!plain) return '';
	const q = strict ? String(query ?? '') : String(query || '').trim();
	if (!q) return escapeHtml(plain);
	return paintRanges(
		plain,
		rangesForQuery(plain, q, mode, strict, caseSensitive, wholeWord),
		markClass,
	);
}

/**
 * 关键字 + 向量扩展词双色高亮：
 * - 用户查询词 → 默认琥珀色 mark
 * - 向量扩展词（如 等待→await）中「多出来」的命中 → 青绿 ms-mark--vector
 * 重叠区间优先关键字色。
 */
export function highlightTextWithVectorExpand(
	text: string,
	keywordQuery: string,
	vectorExpandQuery: string,
	mode: MatchMode = 'fuzzy',
	_combine: CombineMode = 'AND',
	strict = false,
	caseSensitive = false,
	wholeWord = false,
): string {
	const plain = String(text || '');
	if (!plain) return '';
	const kq = strict
		? String(keywordQuery ?? '')
		: String(keywordQuery || '').trim();
	const vq = String(vectorExpandQuery || '').trim();
	if (!kq && !vq) return escapeHtml(plain);

	const kwRanges = kq
		? rangesForQuery(plain, kq, mode, strict, caseSensitive, wholeWord)
		: [];
	const vecRanges = vq
		? rangesForQuery(plain, vq, 'fuzzy', false, false, false)
		: [];

	const tagged: TaggedRange[] = [];
	// 先关键字（空 class → 默认 mark）
	for (const [a, b] of kwRanges) tagged.push({ a, b, cls: '' });
	// 再向量色：仅补「未被关键字覆盖」的片段（按原子切分在 paint 里用先到先得）
	for (const [a, b] of vecRanges) {
		tagged.push({ a, b, cls: 'ms-mark--vector' });
	}
	// 关键字须优先：把关键字段挪到前面
	tagged.sort((x, y) => {
		const px = x.cls === '' ? 0 : 1;
		const py = y.cls === '' ? 0 : 1;
		if (px !== py) return px - py;
		return x.a - y.a;
	});
	return paintTaggedRanges(plain, tagged);
}

/** 去掉高亮 HTML，还原纯文本（再高亮用） */
export function stripHighlightHtml(html: string): string {
	return String(html || '')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

/** 从长正文取含关键词的摘录并高亮 */
export function excerptHighlight(
	text: string,
	query: string,
	radius = 100,
	mode: MatchMode = 'fuzzy',
	combine: CombineMode = 'AND',
	strict = false,
	caseSensitive = false,
	wholeWord = false,
	markClass?: string,
	/** 向量扩展查询串；有则与关键字双色高亮 */
	vectorExpandQuery?: string,
): string {
	// 完全匹配：保留原文空白，不折叠空格
	const plain = strict
		? String(text || '')
		: String(text || '').replace(/\s+/g, ' ').trim();
	if (!plain) return '';

	const paintSlice = (slice: string, strictMode: boolean) => {
		const vq = String(vectorExpandQuery || '').trim();
		if (vq) {
			return highlightTextWithVectorExpand(
				slice,
				query,
				vq,
				mode,
				combine,
				strictMode,
				caseSensitive,
				wholeWord,
			);
		}
		return highlightText(
			slice,
			query,
			mode,
			combine,
			strictMode,
			caseSensitive,
			wholeWord,
			markClass,
		);
	};

	if (strict) {
		const q = String(query ?? '');
		if (!q) {
			const head = plain.slice(0, radius * 2);
			return escapeHtml(head) + (plain.length > head.length ? '…' : '');
		}
		const ranges = findAllRanges(plain, q, caseSensitive, wholeWord);
		const i = ranges[0]?.[0] ?? -1;
		if (i < 0) {
			const head = plain.slice(0, radius * 2);
			return escapeHtml(head) + (plain.length > head.length ? '…' : '');
		}
		const start = Math.max(0, i - radius);
		const end = Math.min(plain.length, i + q.length + radius);
		const slice =
			(start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
		return paintSlice(slice, true);
	}

	const q = String(query || '').trim();
	if (!q) {
		const head = plain.slice(0, radius * 2);
		return escapeHtml(head) + (plain.length > head.length ? '…' : '');
	}

	// 锚点：关键字词 + 向量扩展词，优先靠前的命中
	const anchorTerms = [
		...highlightTerms(q, mode),
		...highlightTerms(String(vectorExpandQuery || '').trim(), 'fuzzy'),
	];
	let best = -1;
	let bestTerm = '';
	for (const term of anchorTerms) {
		const ranges = findAllRanges(plain, term, caseSensitive, wholeWord);
		const i = ranges[0]?.[0] ?? -1;
		if (i >= 0 && (best < 0 || i < best)) {
			best = i;
			bestTerm = term;
		}
	}
	if (best < 0) {
		const head = plain.slice(0, radius * 2);
		return escapeHtml(head) + (plain.length > head.length ? '…' : '');
	}
	const start = Math.max(0, best - radius);
	const end = Math.min(plain.length, best + bestTerm.length + radius);
	const slice =
		(start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
	return paintSlice(slice, false);
}
