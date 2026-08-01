/**
 * PlantUML 图示 · shell（构建 / SSG / MD 代码块共用）
 *
 * 形态对齐 Mermaid（上类型栏 + 下内容区，同一卡片）：
 *   .webmd-code.webmd-diagram[data-diagram-engine="plantuml"]
 *     ├─ .webmd-code__bar
 *     ├─ .webmd-code__content > [data-plantuml-canvas]
 *     └─ pre.plantuml-copy-source
 *
 * bind：`src/previews/plantuml.ts`（@plantuml/core 浏览器引擎，无公网）
 * @see docs/diagrams.md
 */
import path from 'node:path';
import type { TreeFile } from './scan';

export function isPlantumlFile(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return e === 'puml' || e === 'plantuml' || e === 'pu';
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 从 @startuml 后/首行关键字猜副类型 */
export function plantumlDiagramKind(source: string): string {
	const text = String(source || '')
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n');
	// 去掉 start 行后找第一行有意义的指令
	const body = text
		.replace(/@startuml\b[^\n]*/i, '')
		.replace(/@enduml\b[^\n]*/i, '');
	for (const line of body.split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith("'") || t.startsWith('/')) continue;
		if (/^skinparam\b/i.test(t) || /^title\b/i.test(t) || /^scale\b/i.test(t))
			continue;
		if (/^actor\b|^usecase\b|^\(.*\)/i.test(t)) return 'USECASE';
		if (/^class\b|^interface\b|^abstract\b|^enum\b/i.test(t)) return 'CLASS';
		if (/^participant\b|^actor\b.*>|^->|^\w+\s*->/i.test(t) || /->/.test(t))
			return 'SEQ';
		if (/^state\b|^\[\*\]/i.test(t)) return 'STATE';
		if (/^component\b|^package\b|^node\b|^cloud\b|^database\b/i.test(t))
			return 'COMP';
		if (/^entity\b|^relationship\b/i.test(t)) return 'ER';
		if (/^start$|^:.*;|^if\b|^while\b|^fork\b/i.test(t)) return 'ACT';
		if (/^@startmindmap|^\* /i.test(t) || text.includes('@startmindmap'))
			return 'MINDMAP';
		if (/^@startgantt/i.test(text) || /^@startgantt/i.test(t)) return 'GANTT';
		if (/^@startsalt/i.test(text)) return 'SALT';
		if (/^@startwbs/i.test(text)) return 'WBS';
		if (/^@startjson/i.test(text) || /^@startyaml/i.test(text)) return 'DATA';
		break;
	}
	if (/@startmindmap/i.test(text)) return 'MINDMAP';
	if (/@startgantt/i.test(text)) return 'GANTT';
	if (/@startsalt/i.test(text)) return 'SALT';
	if (/@startwbs/i.test(text)) return 'WBS';
	return '';
}

export function plantumlTypeTitle(source: string): string {
	const kind = plantumlDiagramKind(source);
	return kind ? `PlantUML · ${kind}` : 'PlantUML';
}

/** 缺 @startuml/@enduml 时自动包一层，便于文内短片段 */
export function normalizePlantumlSource(source: string): string {
	const raw = String(source ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/^\uFEFF/, '')
		.trim();
	if (!raw) return '@startuml\n@enduml';
	if (/@start/i.test(raw)) return raw;
	return `@startuml\n${raw}\n@enduml`;
}

const ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export const PLANTUML_COPY_BUTTON_HTML =
	`<button type="button" class="webmd-code__copy" data-plantuml-copy title="复制源码" aria-label="复制源码">${ICON_COPY}${ICON_CHECK}</button>`;

let shellId = 0;

/**
 * PlantUML 壳。不含 `<button>`（MD 消毒会转义）；复制钮见 enhancePlantumlCopyButtons。
 */
export function renderPlantumlShell(opts: {
	source: string;
	id?: string;
}): string {
	const raw = normalizePlantumlSource(opts.source ?? '');
	const id = opts.id || `plantuml-${shellId++}`;
	const title = plantumlTypeTitle(raw);
	const data = encodeURIComponent(raw);
	const kind = plantumlDiagramKind(raw);

	return (
		`<div class="webmd-code webmd-diagram" data-diagram-engine="plantuml"` +
		` data-plantuml-id="${escHtml(id)}"` +
		(kind ? ` data-plantuml-kind="${escHtml(kind)}"` : '') +
		` data-plantuml-code="${data}">` +
		`<div class="webmd-code__bar" data-plantuml-bar>` +
		`<div class="webmd-code__meta">` +
		`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
		`<span class="webmd-code__title">${escHtml(title)}</span>` +
		`</div>` +
		`<span class="webmd-code__copy-slot" data-plantuml-copy-slot></span>` +
		`</div>` +
		`<div class="webmd-code__content webmd-diagram__body" data-diagram-content>` +
		`<div class="plantuml-canvas webmd-diagram__canvas" data-plantuml-canvas data-plantuml-id="${escHtml(id)}-canvas" id="${escHtml(id)}-canvas">` +
		`<div class="plantuml-loading" data-plantuml-loading>正在渲染 PlantUML…</div>` +
		`</div>` +
		`</div>` +
		`<pre class="plantuml-copy-source" hidden>${escHtml(raw)}</pre>` +
		`</div>\n`
	);
}

/** 消毒之后注入复制按钮（对齐 Mermaid / 代码块） */
export function enhancePlantumlCopyButtons(html: string): string {
	if (!html || !html.includes('data-diagram-engine="plantuml"')) return html;
	let out = html;
	out = out.replace(
		/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?data-plantuml-copy[\s\S]*?&lt;\/button&gt;/gi,
		'',
	);
	out = out.replace(
		/<span\b[^>]*\bdata-plantuml-copy-slot\b[^>]*>\s*<\/span>/gi,
		PLANTUML_COPY_BUTTON_HTML,
	);
	out = out.replace(
		/(<div\b[^>]*\bdata-diagram-engine="plantuml"[^>]*>[\s\S]*?<div\b[^>]*\bwebmd-code__bar\b[^>]*>)([\s\S]*?)(<\/div>\s*<div\b[^>]*\bwebmd-code__content\b)/gi,
		(full, open: string, inner: string, close: string) => {
			if (/\bwebmd-code__copy\b/.test(inner) && !/&lt;button/i.test(inner)) {
				return full;
			}
			let cleaned = inner
				.replace(
					/&lt;button\b[\s\S]*?class="webmd-code__copy"[\s\S]*?&lt;\/button&gt;/gi,
					'',
				)
				.replace(/<span\b[^>]*\bdata-plantuml-copy-slot\b[^>]*>\s*<\/span>/gi, '');
			if (!/\bwebmd-code__copy\b/.test(cleaned)) {
				cleaned = cleaned.replace(/\s*$/, '') + PLANTUML_COPY_BUTTON_HTML;
			}
			return open + cleaned + close;
		},
	);
	return out;
}
