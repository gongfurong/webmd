/**
 * 表格预览（CSV / Excel）— 现行方案
 *
 * - **预览**：浏览器 SheetJS 读**原文件** + x-data-spreadsheet（见 `src/excel-viewer.ts`）
 * - **SSG/dev**：只出 `renderSheetApp` 壳（`data-file-url`），不嵌表数据、不预生成 CSV
 *
 * @see docs/architecture.md § 表格
 * @see docs/preview-framework.md
 */
import path from 'node:path';
import type { TreeFile } from './scan';

export const SPREADSHEET_EXTS = new Set(['xlsx', 'xls', 'ods']);

export function isSpreadsheetFile(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return SPREADSHEET_EXTS.has(e);
}

export function isCsvFile(file: Pick<TreeFile, 'ext' | 'name' | 'path'>): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return e === 'csv';
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 展示用源类型：XLSX / XLS / ODS / CSV */
export function spreadsheetSourceLabel(
	kind: 'csv' | 'xlsx' | 'xls' | 'ods' | string,
): string {
	const k = String(kind || '').toLowerCase();
	if (k === 'csv') return 'CSV';
	if (k === 'xls') return 'XLS';
	if (k === 'ods') return 'ODS';
	if (k === 'xlsx') return 'XLSX';
	return k.toUpperCase() || 'FILE';
}

/**
 * 类型栏标题：源类型本身即表格，不写「→ 转换」。
 */
export function sheetTypeTitle(sourceLabel: string): string {
	const src = (sourceLabel || 'FILE').trim() || 'FILE';
	return src;
}

/** 类型栏提醒（与标题分开，提醒色） */
export const SHEET_TYPE_NOTE = '注意：可编辑•不写回';

const SHEET_ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHEET_ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * 统一表格壳：CSV / Excel 均走客户端 SheetJS + x-data-spreadsheet。
 * SSG 只输出宿主；数据在浏览器 fetch 原文件后渲染。
 */
export function renderSheetApp(opts: {
	sourceKind: 'csv' | 'xlsx' | 'xls' | 'ods';
	fileName: string;
	fileUrl: string;
}): string {
	const sourceLabel = spreadsheetSourceLabel(opts.sourceKind);
	const typeTitle = sheetTypeTitle(sourceLabel);
	const src = escHtml(opts.fileUrl);
	const name = escHtml(opts.fileName);
	const srcKind = escHtml(opts.sourceKind);
	const srcLab = escHtml(sourceLabel);

	return (
		`<div class="sheet-app webmd-code sheet-block" data-sheet-app` +
		` data-source-kind="${srcKind}"` +
		` data-source-label="${srcLab}"` +
		` data-file-url="${src}"` +
		` data-file-name="${name}">` +
		`<div class="webmd-code__bar" role="toolbar" aria-label="表格预览">` +
		`<div class="webmd-code__meta">` +
		`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
		`<span class="webmd-code__title" data-sheet-type-title>${escHtml(typeTitle)}</span>` +
		`<span class="webmd-code__note webmd-code__note--warn" data-xs-type-note>${escHtml(SHEET_TYPE_NOTE)}</span>` +
		`<span class="webmd-code__hint" data-xs-hint hidden></span>` +
		`</div>` +
		`<div class="webmd-code__actions">` +
		`<div class="xs-density" data-xs-density role="group" aria-label="表格显示密度">` +
		`<button type="button" class="xs-density__btn" data-density="compact" aria-pressed="false" title="紧凑">紧凑</button>` +
		`<button type="button" class="xs-density__btn" data-density="standard" aria-pressed="true" title="标准">标准</button>` +
		`<button type="button" class="xs-density__btn" data-density="comfortable" aria-pressed="false" title="宽松">宽松</button>` +
		`</div>` +
		`<label class="xs-zoom" data-xs-zoom title="整体缩放 50%–200%">` +
		`<span class="xs-zoom__cap">缩放</span>` +
		`<input type="range" class="xs-zoom__range" data-xs-zoom-range min="50" max="200" step="1" value="100" aria-label="整体缩放百分比" />` +
		`<span class="xs-zoom__label" data-xs-zoom-label>100%</span>` +
		`</label>` +
		`<div class="xs-actions" role="group" aria-label="表格操作">` +
		`<button type="button" class="xs-action-btn" data-xs-select-all title="全选 / 取消全选">全选</button>` +
		`<button type="button" class="xs-action-btn" data-xs-reload title="仅重新加载并渲染中栏表格（不刷新页面、不退出全屏）">重载</button>` +
		`<button type="button" class="webmd-code__copy" data-xs-copy title="复制当前工作表为 CSV" aria-label="复制当前工作表为 CSV">${SHEET_ICON_COPY}${SHEET_ICON_CHECK}</button>` +
		`</div>` +
		`</div>` +
		`</div>` +
		`<div class="xs-status" data-xs-status>正在加载表格引擎…</div>` +
		`<div class="xs-error" data-xs-err hidden></div>` +
		`<div class="xs-host" data-xs-host></div>` +
		`</div>`
	);
}

/** 原生 .csv 文件页 */
export function renderCsvDocumentHtml(
	_csvText: string,
	opts?: { title?: string; fileUrl?: string },
): string {
	// 正文不再嵌入 CSV；浏览器按 fileUrl fetch 原文件
	return renderSheetApp({
		sourceKind: 'csv',
		fileName: opts?.title || 'data.csv',
		fileUrl: opts?.fileUrl || '',
	});
}

/** Excel 文件页（xlsx / xls / ods） */
export function renderExcelSheetApp(opts: {
	src: string;
	name: string;
}): string {
	const ext = (opts.name.match(/\.([^.]+)$/)?.[1] || 'xlsx').toLowerCase();
	const sourceKind =
		ext === 'xls' || ext === 'ods' || ext === 'xlsx'
			? (ext as 'xlsx' | 'xls' | 'ods')
			: 'xlsx';
	return renderSheetApp({
		sourceKind,
		fileName: opts.name,
		fileUrl: opts.src,
	});
}


