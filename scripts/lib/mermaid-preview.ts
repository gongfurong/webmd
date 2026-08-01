/**
 * Mermaid 图示 · shell（构建 / SSG / MD 代码块共用）
 *
 * 形态对齐代码块 / 表格（上类型栏 + 下内容区，同一卡片）：
 *   .webmd-code.webmd-diagram
 *     ├─ .webmd-code__bar              类型 + 复制
 *     ├─ .webmd-code__content          内容区（与代码 pre / 表 host 同级）
 *     │    └─ .mermaid[data-mermaid-canvas]  ← bind 把 DSL 画成 SVG 挂这里
 *     └─ pre.mermaid-copy-source       隐藏，仅供复制 DSL
 *
 * bind：`src/previews/mermaid.ts`
 * @see docs/diagrams.md
 */
import path from 'node:path';
import type { TreeFile } from './scan';

export function isMermaidFile(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return e === 'mmd' || e === 'mermaid';
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 从首行关键字推断类型栏副标（失败则仅 MERMAID） */
export function mermaidDiagramKind(source: string): string {
	const lines = String(source || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/);
	let first = '';
	for (const line of lines) {
		const t = line.trim();
		if (!t || t.startsWith('%%')) continue;
		first = t;
		break;
	}
	if (/^(flowchart|graph)\b/i.test(first)) return 'FLOW';
	if (/^sequenceDiagram\b/i.test(first)) return 'SEQ';
	if (/^classDiagram\b/i.test(first)) return 'CLASS';
	if (/^stateDiagram(-v2)?\b/i.test(first)) return 'STATE';
	if (/^erDiagram\b/i.test(first)) return 'ER';
	if (/^gantt\b/i.test(first)) return 'GANTT';
	if (/^pie\b/i.test(first)) return 'PIE';
	if (/^mindmap\b/i.test(first)) return 'MINDMAP';
	if (/^timeline\b/i.test(first)) return 'TIMELINE';
	if (/^gitGraph\b/i.test(first)) return 'GIT';
	if (/^C4Context\b|^C4Container\b|^C4Component\b|^C4Dynamic\b|^C4Deployment\b/i.test(first))
		return 'C4';
	if (/^journey\b/i.test(first)) return 'JOURNEY';
	if (/^quadrantChart\b/i.test(first)) return 'QUAD';
	if (/^requirementDiagram\b/i.test(first)) return 'REQ';
	if (/^sankey-beta\b|^sankey\b/i.test(first)) return 'SANKEY';
	if (/^xychart-beta\b|^xychart\b/i.test(first)) return 'XY';
	if (/^block-beta\b|^block\b/i.test(first)) return 'BLOCK';
	return '';
}

export function mermaidTypeTitle(source: string): string {
	const kind = mermaidDiagramKind(source);
	return kind ? `Mermaid · ${kind}` : 'Mermaid';
}

const ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

/** 复制钮 HTML（必须在 MD 消毒之后注入；消毒会把 button 转义成可见文本） */
export const MERMAID_COPY_BUTTON_HTML =
	`<button type="button" class="webmd-code__copy" data-mermaid-copy title="复制源码" aria-label="复制源码">${ICON_COPY}${ICON_CHECK}</button>`;

let shellId = 0;

/**
 * 输出可嵌入 MD / 整页的 Mermaid 壳（数据在属性 + 隐藏 pre；画布由 bind 填 SVG）。
 *
 * 注意：壳内**不**放 `<button>`。Markdown 管线会在 DOMPurify 前把 button
 * 整段转义成文本（与代码块一致：复制钮由消毒后的 enhance* 注入）。
 */
export function renderMermaidShell(opts: {
	source: string;
	/** 稳定 id；不传则自增 */
	id?: string;
}): string {
	const raw = String(opts.source ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/^\uFEFF/, '');
	const id = opts.id || `mermaid-${shellId++}`;
	const title = mermaidTypeTitle(raw);
	const data = encodeURIComponent(raw);
	const kind = mermaidDiagramKind(raw);

	return (
		`<div class="webmd-code webmd-diagram" data-diagram-engine="mermaid"` +
		` data-mermaid-id="${escHtml(id)}"` +
		(kind ? ` data-mermaid-kind="${escHtml(kind)}"` : '') +
		` data-mermaid-code="${data}">` +
		`<div class="webmd-code__bar" data-mermaid-bar>` +
		`<div class="webmd-code__meta">` +
		`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
		`<span class="webmd-code__title">${escHtml(title)}</span>` +
		`</div>` +
		/* 占位：enhanceMermaidCopyButtons 在消毒后替换为真实 button */
		`<span class="webmd-code__copy-slot" data-mermaid-copy-slot></span>` +
		`</div>` +
		/* 内容区：与代码块的 pre、表格的 .xs-host 同级；SVG 只挂在内部画布 */
		`<div class="webmd-code__content webmd-diagram__body" data-diagram-content>` +
		`<div class="mermaid webmd-diagram__canvas" data-mermaid-canvas data-mermaid-id="${escHtml(id)}-canvas">${escHtml(raw)}</div>` +
		`</div>` +
		`<pre class="mermaid-copy-source" hidden>${escHtml(raw)}</pre>` +
		`</div>\n`
	);
}

/**
 * 消毒之后注入复制按钮（对齐 enhanceCodeBlocksHtml）。
 * - 替换 data-mermaid-copy-slot
 * - 清掉误转义成文本的 &lt;button…&gt;（旧 HTML 缓存）
 * - 已有真实 button 则跳过
 */
export function enhanceMermaidCopyButtons(html: string): string {
	if (!html || !html.includes('webmd-diagram')) return html;
	let out = html;
	// 历史页/半成品：类型栏里被转义成可见文本的 button（属性里含 &gt; 等实体）
	out = out.replace(
		/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?&lt;\/button&gt;/gi,
		'',
	);
	// 占位 span → 真实按钮
	out = out.replace(
		/<span\b[^>]*\bdata-mermaid-copy-slot\b[^>]*>\s*<\/span>/gi,
		MERMAID_COPY_BUTTON_HTML,
	);
	// 无占位、无复制钮的 bar：在 </div> 结束 bar 前插入（meta 后）
	out = out.replace(
		/(<div\b[^>]*\bwebmd-diagram\b[^>]*>[\s\S]*?<div\b[^>]*\bwebmd-code__bar\b[^>]*>)([\s\S]*?)(<\/div>\s*<div\b[^>]*\bwebmd-code__content\b)/gi,
		(full, open: string, inner: string, close: string) => {
			if (/\bwebmd-code__copy\b/.test(inner) && !/&lt;button/i.test(inner)) {
				return full;
			}
			// 去掉残留转义与空 slot
			let cleaned = inner
				.replace(
					/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?&lt;\/button&gt;/gi,
					'',
				)
				.replace(/<span\b[^>]*\bdata-mermaid-copy-slot\b[^>]*>\s*<\/span>/gi, '');
			if (!/\bwebmd-code__copy\b/.test(cleaned)) {
				cleaned = cleaned.replace(/\s*$/, '') + MERMAID_COPY_BUTTON_HTML;
			}
			return open + cleaned + close;
		},
	);
	return out;
}
