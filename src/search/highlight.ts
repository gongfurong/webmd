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

/**
 * 完全匹配：查询串不做任何处理，大小写/空格敏感，整段原样包含
 */
export function literalMatches(text: string, query: string): boolean {
	const plain = String(text ?? '');
	const q = String(query ?? '');
	if (!q) return false;
	return plain.includes(q);
}

/** 单词汇是否命中一段文本 */
export function termMatches(
	text: string,
	term: string,
	mode: MatchMode = 'fuzzy',
): boolean {
	const plain = String(text || '');
	const t = String(term || '').trim();
	if (!t || !plain) return false;
	if (mode === 'exact') {
		return plain.toLowerCase().includes(t.toLowerCase());
	}
	const lower = plain.toLowerCase();
	for (const v of expandFuzzyVariants(t)) {
		if (!v) continue;
		if (/^[\x00-\x7F]+$/.test(v)) {
			if (lower.includes(v.toLowerCase())) return true;
		} else if (plain.includes(v)) {
			return true;
		}
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
): boolean {
	const terms = splitQueryTerms(query);
	if (!terms.length) return false;
	if (combine === 'AND') {
		return terms.every((t) => termMatches(text, t, mode));
	}
	return terms.some((t) => termMatches(text, t, mode));
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
): boolean {
	const terms = splitQueryTerms(query);
	if (!terms.length) return false;
	const hit = (term: string) =>
		fields.some((f) => termMatches(f, term, mode));
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

/**
 * 在纯文本上高亮；按分隔符拆词后分别高亮
 * strict：只高亮原样查询串（大小写敏感）
 */
export function highlightText(
	text: string,
	query: string,
	mode: MatchMode = 'fuzzy',
	_combine: CombineMode = 'AND',
	strict = false,
): string {
	const plain = String(text || '');
	if (!plain) return '';
	if (strict) {
		const q = String(query ?? '');
		if (!q) return escapeHtml(plain);
		// 大小写敏感、原样子串高亮
		type R = [number, number];
		const ranges: R[] = [];
		let from = 0;
		while (from < plain.length) {
			const i = plain.indexOf(q, from);
			if (i < 0) break;
			ranges.push([i, i + q.length]);
			from = i + Math.max(q.length, 1);
		}
		if (!ranges.length) return escapeHtml(plain);
		let out = '';
		let cur = 0;
		for (const [a, b] of ranges) {
			if (a > cur) out += escapeHtml(plain.slice(cur, a));
			out += `<mark>${escapeHtml(plain.slice(a, b))}</mark>`;
			cur = b;
		}
		if (cur < plain.length) out += escapeHtml(plain.slice(cur));
		return out;
	}

	const q = String(query || '').trim();
	if (!q) return escapeHtml(plain);

	const terms = highlightTerms(q, mode);
	type R = [number, number];
	const ranges: R[] = [];
	const lower = plain.toLowerCase();

	for (const term of terms) {
		const ascii = /^[\x00-\x7F]+$/.test(term);
		const needle = ascii ? term.toLowerCase() : term;
		const hay = ascii ? lower : plain;
		let from = 0;
		while (from < hay.length) {
			const i = hay.indexOf(needle, from);
			if (i < 0) break;
			ranges.push([i, i + term.length]);
			from = i + Math.max(term.length, 1);
		}
	}

	if (!ranges.length) return escapeHtml(plain);

	ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
	const merged: R[] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push([r[0], r[1]]);
	}

	let out = '';
	let cur = 0;
	for (const [a, b] of merged) {
		if (a > cur) out += escapeHtml(plain.slice(cur, a));
		out += `<mark>${escapeHtml(plain.slice(a, b))}</mark>`;
		cur = b;
	}
	if (cur < plain.length) out += escapeHtml(plain.slice(cur));
	return out;
}

/** 从长正文取含关键词的摘录并高亮 */
export function excerptHighlight(
	text: string,
	query: string,
	radius = 100,
	mode: MatchMode = 'fuzzy',
	combine: CombineMode = 'AND',
	strict = false,
): string {
	// 完全匹配：保留原文空白，不折叠空格
	const plain = strict
		? String(text || '')
		: String(text || '').replace(/\s+/g, ' ').trim();
	if (!plain) return '';

	if (strict) {
		const q = String(query ?? '');
		if (!q) {
			const head = plain.slice(0, radius * 2);
			return escapeHtml(head) + (plain.length > head.length ? '…' : '');
		}
		const i = plain.indexOf(q);
		if (i < 0) {
			const head = plain.slice(0, radius * 2);
			return escapeHtml(head) + (plain.length > head.length ? '…' : '');
		}
		const start = Math.max(0, i - radius);
		const end = Math.min(plain.length, i + q.length + radius);
		const slice =
			(start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
		return highlightText(slice, q, mode, combine, true);
	}

	const q = String(query || '').trim();
	if (!q) {
		const head = plain.slice(0, radius * 2);
		return escapeHtml(head) + (plain.length > head.length ? '…' : '');
	}

	const terms = highlightTerms(q, mode);
	let best = -1;
	let bestTerm = '';
	const lower = plain.toLowerCase();
	for (const term of terms) {
		const ascii = /^[\x00-\x7F]+$/.test(term);
		const i = ascii ? lower.indexOf(term.toLowerCase()) : plain.indexOf(term);
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
	return highlightText(slice, query, mode, combine, false);
}
