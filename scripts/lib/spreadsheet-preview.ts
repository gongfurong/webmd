/**
 * 表格预览：CSV 源文件 + Excel→CSV
 *
 * 约定（与 res-dir 统一）：
 *   sample.csv              → 直接当表渲染
 *   sample.xlsx
 *   _Res_sample.xlsx/
 *     Demo.csv              ← 每个 sheet 一个 CSV（sheet 名作文件名，非法字符替换）
 *     说明.csv
 *
 * 制作站点：用 SheetJS 读 xlsx 写出 CSV（不依赖 LibreOffice）。
 * 已有同名 CSV 且非空 → 不覆盖。
 * 渲染：HTML 表格（有表头行样式），比「Excel→PDF」更有表格感。
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { TreeFile } from './scan';
import {
	contentFileParts,
	contentUrl,
	ensureSiblingResDir,
	findSiblingResDir,
} from './res-dir';

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

/** sheet 名 → 安全文件名（保留中文） */
export function sheetNameToCsvBase(sheetName: string): string {
	const s = String(sheetName || 'Sheet')
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
		.replace(/^\.+/, '_')
		.trim() || 'Sheet';
	return s.length > 80 ? s.slice(0, 80) : s;
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * 轻量 CSV 解析（支持 "..." 字段内逗号/换行、RFC4180 双引号转义）
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let i = 0;
	let inQuotes = false;
	const s = String(text || '').replace(/^\uFEFF/, '');

	const pushCell = () => {
		row.push(cell);
		cell = '';
	};
	const pushRow = () => {
		// 跳过全空行
		if (row.some((c) => c.length > 0)) rows.push(row);
		row = [];
	};

	while (i < s.length) {
		const ch = s[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (s[i + 1] === '"') {
					cell += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			cell += ch;
			i++;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (ch === ',') {
			pushCell();
			i++;
			continue;
		}
		if (ch === '\r') {
			i++;
			continue;
		}
		if (ch === '\n') {
			pushCell();
			pushRow();
			i++;
			continue;
		}
		cell += ch;
		i++;
	}
	// 最后一格/行
	if (cell.length || row.length) {
		pushCell();
		pushRow();
	}
	return rows;
}

/** 把二维表渲染成 HTML table（仅表格本身，无说明文案） */
export function renderTableHtml(
	rows: string[][],
	opts?: { maxRows?: number },
): string {
	if (!rows.length) {
		return `<div class="sheet-table-wrap"><table class="sheet-table"><tbody></tbody></table></div>`;
	}
	const maxRows = opts?.maxRows ?? 500;
	const head = rows[0] || [];
	const body = rows.slice(1, maxRows);

	let html = `<div class="sheet-table-wrap"><table class="sheet-table"><thead><tr>`;
	for (const h of head) {
		html += `<th>${escHtml(h)}</th>`;
	}
	// 仅一行：同时作表头与数据
	if (rows.length === 1) {
		html += `</tr></thead><tbody><tr>`;
		for (const h of head) html += `<td>${escHtml(h)}</td>`;
		html += `</tr></tbody></table></div>`;
		return html;
	}
	html += `</tr></thead><tbody>`;
	for (const r of body) {
		html += `<tr>`;
		const n = Math.max(head.length, r.length);
		for (let c = 0; c < n; c++) {
			html += `<td>${escHtml(r[c] ?? '')}</td>`;
		}
		html += `</tr>`;
	}
	html += `</tbody></table></div>`;
	return html;
}

/** 与代码块同款：类型栏 + 复制；正文仅转换结果（表） */
const SHEET_ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHEET_ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

function rawCsvForCopy(csvText: string): string {
	return String(csvText || '')
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n');
}

function wrapSheetBlock(opts: {
	label: string;
	rawCsv: string;
	tableHtml: string;
}): string {
	const label = escHtml(opts.label);
	// pre 供复制（与 .webmd-code__copy 逻辑一致）；visually 隐藏，不展示源码
	const raw = escHtml(rawCsvForCopy(opts.rawCsv));
	return (
		`<div class="webmd-code sheet-block">` +
		`<div class="webmd-code__bar" role="toolbar" aria-label="${label}">` +
		`<div class="webmd-code__meta">` +
		`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
		`<span class="webmd-code__title">${label}</span>` +
		`</div>` +
		`<button type="button" class="webmd-code__copy" title="复制 CSV" aria-label="复制 CSV">${SHEET_ICON_COPY}${SHEET_ICON_CHECK}</button>` +
		`</div>` +
		`<pre class="sheet-copy-source" hidden>${raw}</pre>` +
		opts.tableHtml +
		`</div>`
	);
}

export function renderCsvDocumentHtml(
	csvText: string,
	_opts?: { title?: string },
): string {
	const rows = parseCsv(csvText);
	const table = renderTableHtml(rows);
	// 仅：类型栏(CSV) + 复制 + 表内容，无额外说明
	return wrapSheetBlock({
		label: 'CSV',
		rawCsv: csvText,
		tableHtml: table,
	});
}

export type ExcelCsvSheet = {
	/** sheet 显示名 */
	name: string;
	/** 磁盘上的 csv 相对 content 路径 */
	relPosix: string;
	absPath: string;
	url: string;
	text: string;
};

const SHEETS_ORDER_FILE = '_sheets.json';

type SheetsOrderMeta = { order: string[] };

function readSheetsOrder(resAbs: string): string[] | null {
	const p = path.join(resAbs, SHEETS_ORDER_FILE);
	try {
		if (!fs.existsSync(p)) return null;
		const j = JSON.parse(fs.readFileSync(p, 'utf8')) as SheetsOrderMeta;
		return Array.isArray(j.order) ? j.order.map(String) : null;
	} catch {
		return null;
	}
}

function writeSheetsOrder(resAbs: string, order: string[]) {
	const p = path.join(resAbs, SHEETS_ORDER_FILE);
	try {
		fs.writeFileSync(
			p,
			JSON.stringify({ order }, null, 2) + '\n',
			'utf8',
		);
	} catch {
		/* ignore */
	}
}

/** 读取 _Res_<xlsx>/ 下已有 CSV；顺序与原 Excel sheet 一致（见 _sheets.json） */
export function resolveExcelCsvSheets(
	contentDir: string,
	relXlsxPath: string,
): ExcelCsvSheet[] {
	const res = findSiblingResDir(contentDir, relXlsxPath);
	if (!res) return [];
	let names: string[];
	try {
		names = fs.readdirSync(res.abs);
	} catch {
		return [];
	}
	const byBase = new Map<string, ExcelCsvSheet>();
	for (const n of names) {
		if (!n.toLowerCase().endsWith('.csv')) continue;
		if (n.startsWith('.')) continue;
		const absPath = path.join(res.abs, n);
		try {
			const st = fs.statSync(absPath);
			if (!st.isFile() || st.size < 1) continue;
			// 显式 UTF-8（含 BOM 时 Node 会保留 \uFEFF，parseCsv 会去掉）
			const text = fs.readFileSync(absPath, { encoding: 'utf8' });
			const relPosix = `${res.relPosix}/${n}`.replace(/\\/g, '/');
			const base = n.replace(/\.csv$/i, '');
			byBase.set(base, {
				name: base,
				relPosix,
				absPath,
				url: contentUrl(relPosix),
				text,
			});
		} catch {
			/* skip */
		}
	}
	if (!byBase.size) return [];

	// 优先：导出时写入的原 workbook 顺序
	const order = readSheetsOrder(res.abs);
	const sheets: ExcelCsvSheet[] = [];
	if (order?.length) {
		for (const name of order) {
			const hit =
				byBase.get(name) ||
				byBase.get(sheetNameToCsvBase(name));
			if (hit) {
				sheets.push(hit);
				byBase.delete(hit.name);
			}
		}
	}
	// 未登记的 csv 附在后面
	const rest = [...byBase.values()].sort((a, b) =>
		a.name.localeCompare(b.name, 'zh-CN'),
	);
	return sheets.concat(rest);
}

/**
 * Excel 预览：转换后的各 sheet 表 + 与代码块同款类型栏/复制。
 * 多 sheet 时仅保留页签切换（原 workbook 结构），不附加说明/下载文案。
 */
export function renderExcelCsvPreviewHtml(
	sheets: ExcelCsvSheet[],
	_opts?: { downloadUrl: string; downloadName: string },
): string {
	if (!sheets.length) return '';

	const panels = sheets
		.map((s, i) => {
			const rows = parseCsv(s.text);
			const table = renderTableHtml(rows);
			// 类型栏固定为 CSV（与源 csv 页一致）；sheet 名只用于页签切换
			const block = wrapSheetBlock({
				label: 'CSV',
				rawCsv: s.text,
				tableHtml: table,
			});
			return `<div class="sheet-panel${i === 0 ? ' is-active' : ''}" data-sheet-panel="${i}" role="tabpanel"${i === 0 ? '' : ' hidden'}>${block}</div>`;
		})
		.join('');

	// 单 sheet：与独立 .csv 页相同（类型栏 CSV + 表）
	if (sheets.length === 1) {
		return `<div class="sheet-preview" data-sheet-preview="xlsx">${panels}</div>`;
	}

	// 多 sheet：按钮切换工作表（名来自原 Excel）；下方仍是纯 CSV 类型栏+表
	const tabs = sheets
		.map(
			(s, i) =>
				`<button type="button" class="sheet-tab${i === 0 ? ' is-active' : ''}" data-sheet-tab="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}">${escHtml(s.name)}</button>`,
		)
		.join('');

	return `<div class="sheet-preview" data-sheet-preview="xlsx" data-sheet-tabs>
  <div class="sheet-tabs" role="tablist" aria-label="工作表">${tabs}</div>
  <div class="sheet-panels">${panels}</div>
</div>`;
}

function isValidCsvFile(abs: string): boolean {
	try {
		if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
		return fs.statSync(abs).size >= 1;
	} catch {
		return false;
	}
}

/**
 * Excel → 各 sheet 一个 CSV，写入 `_Res_<完整文件名>/`
 * 已有对应 csv 且非空 → 跳过该 sheet（不覆盖）
 */
export function maybeExportExcelCsvs(
	contentDir: string,
	relPath: string,
): { sheets: number; written: number } {
	const abs = path.join(contentDir, relPath);
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
		return { sheets: 0, written: 0 };
	}
	if (!isSpreadsheetFile({ path: relPath, ext: path.extname(relPath), name: path.basename(relPath) })) {
		return { sheets: 0, written: 0 };
	}

	const res = ensureSiblingResDir(contentDir, relPath);
	if (!res) return { sheets: 0, written: 0 };

	let wb: XLSX.WorkBook;
	try {
		// ESM 下 xlsx 的 readFile 可能不可用，统一用 buffer
		const buf = fs.readFileSync(abs);
		wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
	} catch (e) {
		console.warn('[site] 读取 Excel 失败:', relPath, e);
		return { sheets: 0, written: 0 };
	}

	let written = 0;
	const names = wb.SheetNames || [];
	// 始终记录原 sheet 顺序（供预览默认打开第一个工作表，而不是按文件名排序）
	const orderBases = names.map((n) => sheetNameToCsvBase(n));
	writeSheetsOrder(res.abs, orderBases);

	for (const sheetName of names) {
		const sheet = wb.Sheets[sheetName];
		if (!sheet) continue;
		const base = sheetNameToCsvBase(sheetName);
		const outName = `${base}.csv`;
		const outAbs = path.join(res.abs, outName);
		if (isValidCsvFile(outAbs)) continue;

		const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
		try {
			// UTF-8 + BOM：中文在 Windows / Excel 下可正确识别；parseCsv 会剥 BOM
			const body = csv.endsWith('\n') ? csv : csv + '\n';
			fs.writeFileSync(outAbs, '\uFEFF' + body, 'utf8');
			written++;
		} catch (e) {
			console.warn('[site] 写 CSV 失败:', outAbs, e);
		}
	}
	return { sheets: names.length, written };
}

export function prepareAllExcelCsvs(
	contentDir: string,
	files: TreeFile[],
): { tried: number; written: number } {
	const list = files.filter((f) => isSpreadsheetFile(f));
	let written = 0;
	for (const f of list) {
		const r = maybeExportExcelCsvs(contentDir, f.path);
		written += r.written;
	}
	return { tried: list.length, written };
}
