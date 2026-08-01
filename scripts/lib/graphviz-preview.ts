/**
 * Graphviz 图示 · shell（构建 / SSG / MD 代码块共用）
 *
 * 形态对齐 Mermaid / PlantUML：
 *   .webmd-code.webmd-diagram[data-diagram-engine="graphviz"]
 *     ├─ .webmd-code__bar
 *     ├─ .webmd-code__content > [data-graphviz-canvas]
 *     └─ pre.graphviz-copy-source
 *
 * bind：`src/previews/graphviz.ts`（@hpcc-js/wasm-graphviz）
 * @see docs/diagrams.md
 */
import path from 'node:path';
import type { TreeFile } from './scan';

export function isGraphvizFile(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return e === 'dot' || e === 'gv' || e === 'graphviz';
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 从 digraph/graph/strict 等猜副类型 */
export function graphvizDiagramKind(source: string): string {
	const text = String(source || '')
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n');
	for (const line of text.split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('//') || t.startsWith('#')) continue;
		if (/^strict\s+digraph\b/i.test(t) || /^digraph\b/i.test(t)) return 'DIGRAPH';
		if (/^strict\s+graph\b/i.test(t) || /^graph\b/i.test(t)) return 'GRAPH';
		break;
	}
	return 'DOT';
}

export function graphvizTypeTitle(source: string): string {
	const kind = graphvizDiagramKind(source);
	return kind === 'DOT' ? 'Graphviz' : `Graphviz · ${kind}`;
}

const ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export const GRAPHVIZ_COPY_BUTTON_HTML =
	`<button type="button" class="webmd-code__copy" data-graphviz-copy title="复制源码" aria-label="复制源码">${ICON_COPY}${ICON_CHECK}</button>`;

let shellId = 0;

export function renderGraphvizShell(opts: {
	source: string;
	id?: string;
}): string {
	const raw = String(opts.source ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/^\uFEFF/, '');
	const id = opts.id || `graphviz-${shellId++}`;
	const title = graphvizTypeTitle(raw);
	const data = encodeURIComponent(raw);
	const kind = graphvizDiagramKind(raw);

	return (
		`<div class="webmd-code webmd-diagram" data-diagram-engine="graphviz"` +
		` data-graphviz-id="${escHtml(id)}"` +
		` data-graphviz-kind="${escHtml(kind)}"` +
		` data-graphviz-code="${data}">` +
		`<div class="webmd-code__bar" data-graphviz-bar>` +
		`<div class="webmd-code__meta">` +
		`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
		`<span class="webmd-code__title">${escHtml(title)}</span>` +
		`</div>` +
		`<span class="webmd-code__copy-slot" data-graphviz-copy-slot></span>` +
		`</div>` +
		`<div class="webmd-code__content webmd-diagram__body" data-diagram-content>` +
		`<div class="graphviz-canvas webmd-diagram__canvas" data-graphviz-canvas data-graphviz-id="${escHtml(id)}-canvas">` +
		`<div class="graphviz-loading" data-graphviz-loading>正在渲染 Graphviz…</div>` +
		`</div>` +
		`</div>` +
		`<pre class="graphviz-copy-source" hidden>${escHtml(raw)}</pre>` +
		`</div>\n`
	);
}

export function enhanceGraphvizCopyButtons(html: string): string {
	if (!html || !html.includes('data-diagram-engine="graphviz"')) return html;
	let out = html;
	out = out.replace(
		/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?data-graphviz-copy[\s\S]*?&lt;\/button&gt;/gi,
		'',
	);
	out = out.replace(
		/<span\b[^>]*\bdata-graphviz-copy-slot\b[^>]*>\s*<\/span>/gi,
		GRAPHVIZ_COPY_BUTTON_HTML,
	);
	out = out.replace(
		/(<div\b[^>]*\bdata-diagram-engine="graphviz"[^>]*>[\s\S]*?<div\b[^>]*\bwebmd-code__bar\b[^>]*>)([\s\S]*?)(<\/div>\s*<div\b[^>]*\bwebmd-code__content\b)/gi,
		(full, open: string, inner: string, close: string) => {
			if (/\bwebmd-code__copy\b/.test(inner) && !/&lt;button/i.test(inner)) {
				return full;
			}
			let cleaned = inner
				.replace(
					/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?&lt;\/button&gt;/gi,
					'',
				)
				.replace(/<span\b[^>]*\bdata-graphviz-copy-slot\b[^>]*>\s*<\/span>/gi, '');
			if (!/\bwebmd-code__copy\b/.test(cleaned)) {
				cleaned = cleaned.replace(/\s*$/, '') + GRAPHVIZ_COPY_BUTTON_HTML;
			}
			return open + cleaned + close;
		},
	);
	return out;
}
