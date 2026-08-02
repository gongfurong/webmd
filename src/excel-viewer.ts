/**
 * 表格预览：SheetJS + x-data-spreadsheet
 *
 * - 单元格文本 / 工作表增删改名：只读（mode:read + 底栏锁）
 * - 显示向操作可用：列宽行高、缩放、选区、自动列宽/行高等
 * - 源文件永不写回；下载走站点统一顶栏；可重载丢弃会话显示调整
 *
 * @see https://docs.sheetjs.com/docs/demos/grid/xspreadsheet/
 */
import type { WorkBook, WorkSheet } from 'xlsx';

type XlsxMod = typeof import('xlsx');

type XsCell = {
	text?: string;
	style?: number;
	merge?: [number, number];
};
type XsRow = { cells?: Record<number, XsCell>; height?: number };
type XsStyle = Record<string, unknown>;
type XsSheet = {
	name: string;
	freeze?: string;
	styles?: XsStyle[];
	merges?: string[];
	rows: Record<number, XsRow> & { len?: number };
	cols: Record<number, { width?: number }> & { len?: number };
};

/** x-spreadsheet 内部实例（无完整类型，仅用到的字段） */
type XsDataInternal = {
	rows?: {
		len?: number;
		getHeight?: (ri: number) => number;
		setHeight?: (ri: number, h: number) => void;
	};
	cols?: {
		len?: number;
		getWidth?: (ci: number) => number;
		setWidth?: (ci: number, w: number) => void;
	};
	selector?: {
		range?: { sri: number; sci: number; eri: number; eci: number };
	};
	getCell?: (ri: number, ci: number) => { text?: string } | null;
	getCellRectByXY?: (
		x: number,
		y: number,
	) => { ri: number; ci: number; left?: number; top?: number };
	setColWidth?: (ci: number, width: number) => void;
	setRowHeight?: (ri: number, height: number) => void;
	settings?: { style?: { font?: { size?: number } } };
};

type XsSheetInternal = {
	focusing?: boolean;
	data?: XsDataInternal;
	selector?: {
		set: (ri: number, ci: number, indexesUpdated?: boolean) => void;
		setEnd: (ri: number, ci: number, moving?: boolean) => void;
		reset?: () => void;
		range?: { sri: number; sci: number; eri: number; eci: number };
	};
	toolbar?: { reset?: () => void };
	table?: { render?: () => void };
	reload?: () => XsSheetInternal;
	trigger?: (name: string, ...args: unknown[]) => void;
};

type XsSelRange = { sri: number; sci: number; eri: number; eci: number };

type XsInstance = {
	loadData: (data: XsSheet[] | XsSheet) => XsInstance;
	getData: () => XsSheet[];
	reRender?: () => XsInstance;
	change?: (cb: (data: XsSheet[]) => void) => XsInstance;
	on?: (event: string, cb: (...args: unknown[]) => void) => void;
	sheet?: XsSheetInternal;
};

type XsFactory = (
	el: HTMLElement | string,
	opts?: Record<string, unknown>,
) => XsInstance;

const MAX_ROWS = 5000;
const MAX_COLS = 200;
const DENSITY_STORAGE_KEY = 'webmd.sheet.density';
const ZOOM_STORAGE_KEY = 'webmd.sheet.zoom';
/** 滑块缩放范围（百分比）；改字号/行高/列宽，不用 CSS zoom（会弄坏工具栏与命中） */
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
/** x-spreadsheet fontSizes 映射表（仅这些 pt 能正确转 px） */
const XS_FONT_PTS = [
	7.5, 8, 9, 10, 10.5, 11, 12, 14, 15, 16, 18, 22, 24, 26, 36, 42,
];

export function clampSheetZoom(n: number): number {
	if (!Number.isFinite(n)) return 100;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n)));
}

export function readStoredZoom(): number {
	try {
		const n = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
		if (Number.isFinite(n)) return clampSheetZoom(n);
	} catch {
		/* private mode */
	}
	return 100;
}

export function writeStoredZoom(z: number): void {
	try {
		localStorage.setItem(ZOOM_STORAGE_KEY, String(clampSheetZoom(z)));
	} catch {
		/* ignore */
	}
}

function nearestFontPt(pt: number): number {
	let best = XS_FONT_PTS[0]!;
	let bestD = Math.abs(best - pt);
	for (const p of XS_FONT_PTS) {
		const d = Math.abs(p - pt);
		if (d < bestD) {
			best = p;
			bestD = d;
		}
	}
	return best;
}

/** 在 100% 逻辑数据与显示缩放之间换算行列几何 */
function scaleXsSheets(data: XsSheet[], factor: number): XsSheet[] {
	const f = factor;
	if (!Number.isFinite(f) || f <= 0) {
		return JSON.parse(JSON.stringify(data)) as XsSheet[];
	}
	if (Math.abs(f - 1) < 0.002) {
		return JSON.parse(JSON.stringify(data)) as XsSheet[];
	}
	return data.map((sheet) => {
		const cols: XsSheet['cols'] = {};
		if (typeof sheet.cols?.len === 'number') cols.len = sheet.cols.len;
		for (const key of Object.keys(sheet.cols || {})) {
			if (key === 'len') continue;
			const c = Number(key);
			if (Number.isNaN(c)) continue;
			const w = sheet.cols![c]?.width;
			if (typeof w === 'number' && w > 0) {
				cols[c] = { width: Math.max(28, Math.round(w * f)) };
			}
		}
		const rows: XsSheet['rows'] = {};
		if (typeof sheet.rows?.len === 'number') rows.len = sheet.rows.len;
		for (const key of Object.keys(sheet.rows || {})) {
			if (key === 'len') continue;
			const r = Number(key);
			if (Number.isNaN(r)) continue;
			const row = sheet.rows![r];
			if (!row) continue;
			const next: XsRow = {
				cells: row.cells ? { ...row.cells } : {},
			};
			if (typeof row.height === 'number' && row.height > 0) {
				next.height = Math.max(14, Math.round(row.height * f));
			}
			rows[r] = next;
		}
		return {
			...sheet,
			styles: sheet.styles ? [...sheet.styles] : [],
			merges: sheet.merges ? [...sheet.merges] : [],
			cols,
			rows,
		};
	});
}

function syncZoomUi(root: HTMLElement, z: number): void {
	const pct = clampSheetZoom(z);
	// 类型栏旧滑块（兼容）+ 工具栏数字输入
	const range = root.querySelector<HTMLInputElement>('[data-xs-zoom-range]');
	const label = root.querySelector<HTMLElement>('[data-xs-zoom-label]');
	const num = root.querySelectorAll<HTMLInputElement>('[data-xs-zoom-input]');
	if (range && Number(range.value) !== pct) range.value = String(pct);
	if (label) label.textContent = `${pct}%`;
	num.forEach((el) => {
		if (Number(el.value) !== pct) el.value = String(pct);
	});
	root.dataset.xsZoom = String(pct);
}

/** 密度档：字号须落在 x-spreadsheet fontSizes 映射表内 */
export type SheetDensityId = 'compact' | 'standard' | 'comfortable';

export type SheetDensity = {
	id: SheetDensityId;
	label: string;
	fontPt: number;
	rowH: number;
	colW: number;
	colMin: number;
	colMax: number;
	charPx: number;
	padPx: number;
	indexWidth: number;
	geometryScale: number;
	contentBoost: number;
	sampleRows: number;
};

export const SHEET_DENSITIES: Record<SheetDensityId, SheetDensity> = {
	compact: {
		id: 'compact',
		label: '紧凑',
		fontPt: 10,
		rowH: 25,
		colW: 100,
		colMin: 48,
		colMax: 320,
		charPx: 7.5,
		padPx: 12,
		indexWidth: 46,
		geometryScale: 1,
		contentBoost: 0.82,
		sampleRows: 80,
	},
	standard: {
		id: 'standard',
		label: '标准',
		fontPt: 11,
		rowH: 28,
		colW: 108,
		colMin: 56,
		colMax: 400,
		charPx: 9,
		padPx: 18,
		indexWidth: 52,
		geometryScale: 1.04,
		contentBoost: 0.88,
		sampleRows: 100,
	},
	comfortable: {
		id: 'comfortable',
		label: '宽松',
		fontPt: 12,
		rowH: 32,
		colW: 120,
		colMin: 64,
		colMax: 480,
		charPx: 10,
		padPx: 24,
		indexWidth: 56,
		geometryScale: 1.08,
		contentBoost: 0.92,
		sampleRows: 120,
	},
};

export function isSheetDensityId(v: string): v is SheetDensityId {
	return v === 'compact' || v === 'standard' || v === 'comfortable';
}

export function readStoredDensity(): SheetDensityId {
	try {
		const v = localStorage.getItem(DENSITY_STORAGE_KEY);
		if (v && isSheetDensityId(v)) return v;
	} catch {
		/* private mode */
	}
	return 'standard';
}

export function writeStoredDensity(id: SheetDensityId): void {
	try {
		localStorage.setItem(DENSITY_STORAGE_KEY, id);
	} catch {
		/* ignore */
	}
}

function clampColW(px: number, d: SheetDensity): number {
	return Math.min(d.colMax, Math.max(d.colMin, Math.round(px)));
}

function sourceColWidthPx(
	sheet: WorkSheet,
	c: number,
	d: SheetDensity,
): number | null {
	const cols = sheet['!cols'] as
		| { wpx?: number; wch?: number; width?: number; MDW?: number }[]
		| undefined;
	const def = cols?.[c];
	if (!def) return null;
	if (typeof def.wpx === 'number' && def.wpx > 0) {
		return clampColW(def.wpx * d.geometryScale, d);
	}
	const mdw = typeof def.MDW === 'number' && def.MDW > 0 ? def.MDW : 7;
	const chars =
		typeof def.wch === 'number' && def.wch > 0
			? def.wch
			: typeof def.width === 'number' && def.width > 0
				? def.width
				: 0;
	if (chars > 0) {
		const raw = ((256 * chars + Math.floor(128 / mdw)) / 256) * mdw;
		return clampColW(raw * d.geometryScale, d);
	}
	return null;
}

function sourceRowHeightPx(
	sheet: WorkSheet,
	r: number,
	d: SheetDensity,
): number | null {
	const rows = sheet['!rows'] as { hpx?: number; hpt?: number }[] | undefined;
	const def = rows?.[r];
	if (!def) return null;
	if (typeof def.hpx === 'number' && def.hpx > 0) {
		return Math.max(18, Math.round(def.hpx * d.geometryScale));
	}
	if (typeof def.hpt === 'number' && def.hpt > 0) {
		return Math.max(18, Math.round(((def.hpt * 96) / 72) * d.geometryScale));
	}
	return null;
}

/** 显示文本：优先格式化串；有公式时用 =f（与官方 stox 一致，便于引擎公式栏） */
function cellDisplayText(cell: {
	w?: string;
	v?: unknown;
	f?: string;
	t?: string;
}): string {
	if (cell.f != null && String(cell.f).length > 0) {
		const f = String(cell.f);
		return f.startsWith('=') ? f : `=${f}`;
	}
	if (cell.w != null) return String(cell.w);
	if (cell.v != null) {
		if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
		return String(cell.v);
	}
	return '';
}

function rgbToHex(rgb: string | undefined): string | undefined {
	if (!rgb) return undefined;
	const s = String(rgb).replace(/^#/, '');
	if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
	if (/^[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(2)}`; // AARRGGBB → RRGGBB
	return undefined;
}

/** SheetJS cell.s（若社区版有）→ x-spreadsheet style 片段 */
function mapCellStyle(s: unknown): XsStyle | null {
	if (!s || typeof s !== 'object') return null;
	const st = s as {
		patternType?: string;
		fgColor?: { rgb?: string };
		bgColor?: { rgb?: string };
		font?: {
			bold?: boolean;
			italic?: boolean;
			underline?: boolean;
			strike?: boolean;
			color?: { rgb?: string };
			sz?: number;
			name?: string;
		};
		alignment?: {
			horizontal?: string;
			vertical?: string;
			wrapText?: boolean;
		};
		border?: Record<string, { style?: string; color?: { rgb?: string } }>;
	};
	const out: XsStyle = {};
	const font: Record<string, unknown> = {};
	if (st.font?.bold) font.bold = true;
	if (st.font?.italic) font.italic = true;
	if (st.font?.name) font.name = st.font.name;
	if (typeof st.font?.sz === 'number' && st.font.sz > 0) {
		// x-s 用 pt；SheetJS sz 多为 pt
		font.size = st.font.sz;
	}
	if (Object.keys(font).length) out.font = font;
	if (st.font?.underline) out.underline = true;
	if (st.font?.strike) out.strike = true;
	const fg = rgbToHex(st.font?.color?.rgb);
	if (fg) out.color = fg;
	const bg =
		rgbToHex(st.fgColor?.rgb) ||
		rgbToHex(st.bgColor?.rgb) ||
		undefined;
	if (bg) out.bgcolor = bg;
	const h = st.alignment?.horizontal?.toLowerCase();
	if (h === 'left' || h === 'center' || h === 'right') out.align = h;
	const v = st.alignment?.vertical?.toLowerCase();
	if (v === 'top' || v === 'center' || v === 'middle' || v === 'bottom') {
		out.valign = v === 'center' ? 'middle' : v;
	}
	if (st.alignment?.wrapText) out.textwrap = true;

	if (st.border && typeof st.border === 'object') {
		const b: Record<string, string[]> = {};
		for (const side of ['top', 'bottom', 'left', 'right'] as const) {
			const edge = st.border[side];
			if (!edge) continue;
			const col = rgbToHex(edge.color?.rgb) || '#000000';
			// x-s border: [style, color] e.g. ['thin', '#000']
			b[side] = [edge.style || 'thin', col];
		}
		if (Object.keys(b).length) out.border = b;
	}

	return Object.keys(out).length ? out : null;
}

function styleKey(st: XsStyle): string {
	return JSON.stringify(st);
}

/** 一次扫描抽样行，算各列内容宽（避免每列重复扫表） */
function contentColWidths(
	XLSX: XlsxMod,
	ws: WorkSheet,
	maxR: number,
	maxC: number,
	d: SheetDensity,
): number[] {
	const maxCh = new Array(maxC + 1).fill(6) as number[];
	const last = Math.min(maxR, d.sampleRows - 1);
	for (let r = 0; r <= last; r++) {
		for (let c = 0; c <= maxC; c++) {
			const cell = ws[XLSX.utils.encode_cell({ r, c })] as
				| { w?: string; v?: unknown; f?: string }
				| undefined;
			if (!cell) continue;
			const t = cellDisplayText(cell);
			let ch = 0;
			for (const x of t) ch += x.charCodeAt(0) > 255 ? 2 : 1;
			if (ch > maxCh[c]!) maxCh[c] = ch;
		}
	}
	return maxCh.map((ch) => clampColW(ch * d.charPx + d.padPx, d));
}

/**
 * SheetJS workbook → x-spreadsheet loadData
 * 几何 + 合并 + 公式 + 有限样式（取决于 SheetJS 是否解析出 cell.s）
 */
function stox(
	XLSX: XlsxMod,
	wb: WorkBook,
	d: SheetDensity,
): XsSheet[] {
	const out: XsSheet[] = [];
	for (const name of wb.SheetNames) {
		const ws = wb.Sheets[name];
		const styles: XsStyle[] = [];
		const styleIndex = new Map<string, number>();
		const internStyle = (st: XsStyle): number => {
			const k = styleKey(st);
			const hit = styleIndex.get(k);
			if (hit != null) return hit;
			const idx = styles.length;
			styles.push(st);
			styleIndex.set(k, idx);
			return idx;
		};

		const sheet: XsSheet = {
			name: name || 'Sheet',
			freeze: 'A1',
			styles: [],
			merges: [],
			rows: {},
			cols: {},
		};
		if (!ws || !ws['!ref']) {
			sheet.rows.len = 100;
			sheet.cols.len = 26;
			out.push(sheet);
			continue;
		}
		const range = XLSX.utils.decode_range(ws['!ref']);
		// 从 A1 起算，避免丢前导空行/列（官方 stox 同理）
		const maxR = Math.min(Math.max(range.e.r, 0), MAX_ROWS - 1);
		const maxC = Math.min(Math.max(range.e.c, 0), MAX_COLS - 1);

		const merges =
			(ws['!merges'] as
				| { s: { r: number; c: number }; e: { r: number; c: number } }[]
				| undefined) || [];
		for (const m of merges) {
			if (m.s.r > maxR || m.s.c > maxC) continue;
			const eR = Math.min(m.e.r, maxR);
			const eC = Math.min(m.e.c, maxC);
			sheet.merges!.push(
				`${XLSX.utils.encode_cell(m.s)}:${XLSX.utils.encode_cell({ r: eR, c: eC })}`,
			);
			const row = (sheet.rows[m.s.r] ||= { cells: {} });
			const cells = (row.cells ||= {});
			const origin = (cells[m.s.c] ||= { text: '' });
			origin.merge = [eR - m.s.r, eC - m.s.c];
		}

		const byContentW = contentColWidths(XLSX, ws, maxR, maxC, d);
		for (let c = 0; c <= maxC; c++) {
			const srcW = sourceColWidthPx(ws, c, d);
			const byContent = byContentW[c] ?? d.colW;
			if (srcW != null) {
				sheet.cols[c] = {
					width: clampColW(
						Math.max(srcW, byContent * d.contentBoost),
						d,
					),
				};
			} else {
				sheet.cols[c] = {
					width: clampColW(Math.max(d.colW, byContent), d),
				};
			}
		}

		// 仅遍历工作表已有单元格键，避免 maxR×maxC 空扫（CSV 稀疏时尤其重要）
		const cellAddrs = Object.keys(ws).filter((k) => !k.startsWith('!'));
		for (const addr of cellAddrs) {
			let coord: { r: number; c: number };
			try {
				coord = XLSX.utils.decode_cell(addr);
			} catch {
				continue;
			}
			if (coord.r > maxR || coord.c > maxC || coord.r < 0 || coord.c < 0)
				continue;
			const cell = ws[addr] as
				| { w?: string; v?: unknown; f?: string; s?: unknown }
				| undefined;
			if (!cell) continue;
			const row: XsRow = sheet.rows[coord.r] || { cells: {} };
			row.cells = row.cells || {};
			if (row.height == null) {
				const srcH = sourceRowHeightPx(ws, coord.r, d);
				row.height =
					srcH != null ? Math.max(d.rowH * 0.85, srcH) : d.rowH;
			}
			const text = cellDisplayText(cell);
			const mapped = mapCellStyle(cell.s);
			const styleIdx = mapped != null ? internStyle(mapped) : undefined;
			const existing = row.cells[coord.c];
			if (existing) {
				existing.text = text;
				if (styleIdx != null) existing.style = styleIdx;
			} else {
				const xc: XsCell = { text };
				if (styleIdx != null) xc.style = styleIdx;
				row.cells[coord.c] = xc;
			}
			sheet.rows[coord.r] = row;
		}
		// 默认行高由 options.row.height 提供；仅补有内容行的 height 即可
		sheet.styles = styles;
		// 网格略大于内容区，但不要无故拉到 5000 导致引擎卡顿
		sheet.rows.len = Math.min(
			MAX_ROWS,
			Math.max(maxR + 20, Math.min(maxR + 5, 80), 40),
		);
		sheet.cols.len = Math.min(
			MAX_COLS,
			Math.max(maxC + 3, Math.min(maxC + 2, 26), 10),
		);
		out.push(sheet);
	}
	return out;
}

/**
 * x-spreadsheet getData → SheetJS workbook（用于导出会话副本，不写源）
 * 基于官方 xtos
 */
function xtos(XLSX: XlsxMod, sdata: XsSheet[]): WorkBook {
	const out = XLSX.utils.book_new();
	for (const xws of sdata) {
		const ws: WorkSheet = {};
		const rowobj = xws.rows || {};
		const maxCoord = { r: 0, c: 0 };
		const len =
			typeof rowobj.len === 'number' ? rowobj.len : MAX_ROWS;
		for (let ri = 0; ri < len; ri++) {
			const row = rowobj[ri];
			if (!row?.cells) continue;
			for (const k of Object.keys(row.cells)) {
				const idx = +k;
				if (Number.isNaN(idx)) continue;
				if (ri > maxCoord.r) maxCoord.r = ri;
				if (idx > maxCoord.c) maxCoord.c = idx;
				const cell = row.cells[idx];
				let cellText = cell?.text;
				let type: 's' | 'n' | 'b' | 'z' = 's';
				let v: string | number | boolean = '';
				if (cellText == null || cellText === '') {
					type = 'z';
					v = '';
				} else if (
					typeof cellText === 'string' &&
					cellText.startsWith('=')
				) {
					type = 's';
					v = cellText;
				} else if (
					typeof cellText === 'string' &&
					cellText.trim() !== '' &&
					!Number.isNaN(Number(cellText))
				) {
					type = 'n';
					v = Number(cellText);
				} else if (
					typeof cellText === 'string' &&
					(cellText.toLowerCase() === 'true' ||
						cellText.toLowerCase() === 'false')
				) {
					type = 'b';
					v = cellText.toLowerCase() === 'true';
				} else {
					v = String(cellText);
				}
				const ref = XLSX.utils.encode_cell({ r: ri, c: idx });
				const cobj: { v: unknown; t: string; f?: string } = {
					v,
					t: type,
				};
				if (type === 's' && typeof v === 'string' && v.startsWith('=')) {
					cobj.f = v.slice(1);
					cobj.v = v;
				}
				ws[ref] = cobj;
				if (cell?.merge != null) {
					if (!ws['!merges']) ws['!merges'] = [];
					(ws['!merges'] as { s: { r: number; c: number }; e: { r: number; c: number } }[]).push({
						s: { r: ri, c: idx },
						e: {
							r: ri + cell.merge[0],
							c: idx + cell.merge[1],
						},
					});
				}
			}
			if (typeof row.height === 'number' && row.height > 0) {
				if (!ws['!rows']) ws['!rows'] = [];
				(ws['!rows'] as { hpx?: number }[])[ri] = { hpx: row.height };
			}
		}
		// 列宽
		const colLen =
			typeof xws.cols?.len === 'number' ? xws.cols.len : maxCoord.c + 1;
		const colsArr: { wpx?: number }[] = [];
		for (let c = 0; c < colLen; c++) {
			const w = xws.cols?.[c]?.width;
			if (typeof w === 'number' && w > 0) colsArr[c] = { wpx: w };
		}
		if (colsArr.length) ws['!cols'] = colsArr;

		ws['!ref'] = XLSX.utils.encode_range({
			s: { r: 0, c: 0 },
			e: maxCoord,
		});
		XLSX.utils.book_append_sheet(out, ws, xws.name || 'Sheet');
	}
	return out;
}

function flashBtn(btn: HTMLElement, ok: boolean): void {
	btn.classList.add(ok ? 'is-copied' : 'is-failed');
	window.setTimeout(
		() => btn.classList.remove('is-copied', 'is-failed'),
		1200,
	);
}

function gridExtent(data: XsDataInternal): { maxR: number; maxC: number } {
	return {
		maxR: Math.max(0, (data.rows?.len ?? 1) - 1),
		maxC: Math.max(0, (data.cols?.len ?? 1) - 1),
	};
}

/** 是否已全选（与 selectAllGrid 同一范围） */
function isGridFullySelected(xs: XsInstance | null): boolean {
	const data = xs?.sheet?.data;
	const range =
		data?.selector?.range ?? xs?.sheet?.selector?.range ?? null;
	if (!data || !range) return false;
	const { maxR, maxC } = gridExtent(data);
	return (
		range.sri === 0 &&
		range.sci === 0 &&
		range.eri >= maxR &&
		range.eci >= maxC
	);
}

/**
 * 全选当前表「网格范围」（rows.len × cols.len）。
 * 库本身无 Ctrl+A：selectorSet(ri=-1,ci=-1) 会直接 return。
 */
function selectAllGrid(xs: XsInstance | null): boolean {
	const sheet = xs?.sheet;
	const sel = sheet?.selector;
	const data = sheet?.data;
	if (!sheet || !sel || !data) return false;
	const { maxR, maxC } = gridExtent(data);
	sel.set(0, 0, true);
	sel.setEnd(maxR, maxC, false);
	sheet.toolbar?.reset?.();
	sheet.table?.render?.();
	try {
		sheet.trigger?.(
			'cells-selected',
			data,
			{ sri: 0, sci: 0, eri: maxR, eci: maxC },
		);
	} catch {
		/* ignore */
	}
	sheet.focusing = true;
	return true;
}

/** 取消全选：回到单格 A1 */
function clearGridSelection(xs: XsInstance | null): boolean {
	const sheet = xs?.sheet;
	const sel = sheet?.selector;
	if (!sheet || !sel) return false;
	sel.set(0, 0, true);
	sheet.toolbar?.reset?.();
	sheet.table?.render?.();
	try {
		sheet.trigger?.('cell-selected', sheet.data?.getCell?.(0, 0), 0, 0);
	} catch {
		/* ignore */
	}
	sheet.focusing = true;
	return true;
}

/** 左上角 / Ctrl+A：全选 ↔ 取消全选 */
function toggleSelectAllGrid(xs: XsInstance | null): boolean {
	if (!xs) return false;
	if (isGridFullySelected(xs)) return clearGridSelection(xs);
	return selectAllGrid(xs);
}

/**
 * 左上角「行号×列标」交叉格：Excel 式全选。
 * 库 selectorSet(-1,-1) 会直接 return，需在捕获阶段拦截。
 */
function isCornerHeaderClick(
	xs: XsInstance,
	host: HTMLElement,
	evt: MouseEvent,
): boolean {
	const data = xs.sheet?.data;
	const getRect = data?.getCellRectByXY;
	if (!data || !getRect) return false;
	const overlayer = host.querySelector<HTMLElement>(
		'.x-spreadsheet-overlayer',
	);
	if (!overlayer) return false;
	// 事件可能落在 overlayer 子节点上，用相对 overlayer 的坐标
	const r = overlayer.getBoundingClientRect();
	const x = evt.clientX - r.left;
	const y = evt.clientY - r.top;
	if (x < 0 || y < 0) return false;
	const cell = getRect.call(data, x, y);
	return cell.ri === -1 && cell.ci === -1;
}

function activeSheetName(
	root: HTMLElement,
	xs: XsInstance | null,
	fallback: string[],
): string {
	const tab = root.querySelector(
		'.x-spreadsheet-menu .active, .x-spreadsheet-bottombar .active, .x-spreadsheet-bottombar li.active',
	);
	const fromDom = tab?.textContent?.trim();
	if (fromDom) return fromDom;
	try {
		const data = xs?.getData?.();
		if (data?.[0]?.name) return data[0].name;
	} catch {
		/* ignore */
	}
	return fallback[0] || 'Sheet1';
}

let xsFactoryPromise: Promise<XsFactory> | null = null;

async function loadXsFactory(): Promise<XsFactory> {
	if (xsFactoryPromise) return xsFactoryPromise;
	xsFactoryPromise = (async () => {
		// CSS + 引擎并行（locale 依赖引擎已挂 window）
		await Promise.all([
			import('x-data-spreadsheet/dist/xspreadsheet.css'),
			import(
				/* @vite-ignore */ 'x-data-spreadsheet/dist/xspreadsheet.js'
			),
		]);
		// 中文 locale（依赖 window.x_spreadsheet 已挂载）
		// @ts-expect-error 无类型声明的 UMD locale 包
		await import(/* @vite-ignore */ 'x-data-spreadsheet/dist/locale/zh-cn.js');
		const w = window as unknown as {
			x_spreadsheet?: XsFactory & {
				locale?: (lang: string, message?: unknown) => void;
				$messages?: Record<string, unknown>;
			};
		};
		if (typeof w.x_spreadsheet !== 'function') {
			throw new Error('x-data-spreadsheet 未挂载 window.x_spreadsheet');
		}
		const msg = w.x_spreadsheet.$messages?.['zh-cn'];
		if (msg && typeof w.x_spreadsheet.locale === 'function') {
			w.x_spreadsheet.locale('zh-cn', msg);
		}
		return w.x_spreadsheet;
	})();
	return xsFactoryPromise;
}

/** 预热表格引擎（软导航进表前可调用，减少首屏等待） */
export function prefetchSheetEngines(): void {
	void loadXsFactory();
	void import('xlsx');
}

/** 表格原文件内存缓存（再进同一表跳过网络与部分解码） */
const SHEET_FILE_CACHE_MAX = 12;
const sheetFileTextCache = new Map<string, string>();
const sheetFileBufCache = new Map<string, ArrayBuffer>();

function lruPut<T>(map: Map<string, T>, key: string, val: T, max: number): void {
	if (map.has(key)) map.delete(key);
	map.set(key, val);
	while (map.size > max) {
		const k = map.keys().next().value as string | undefined;
		if (k == null) break;
		map.delete(k);
	}
}

async function readWorkbook(
	XLSX: XlsxMod,
	fileUrl: string,
	sourceKind: string,
): Promise<WorkBook> {
	if (sourceKind === 'csv') {
		let text = sheetFileTextCache.get(fileUrl);
		if (text == null) {
			const res = await fetch(fileUrl, {
				credentials: 'same-origin',
				cache: 'default',
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			text = await res.text();
			lruPut(sheetFileTextCache, fileUrl, text, SHEET_FILE_CACHE_MAX);
		}
		return XLSX.read(text.replace(/^\uFEFF/, ''), {
			type: 'string',
			raw: false,
			cellDates: true,
		});
	}

	let buf = sheetFileBufCache.get(fileUrl);
	if (buf == null) {
		const res = await fetch(fileUrl, {
			credentials: 'same-origin',
			cache: 'default',
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		buf = await res.arrayBuffer();
		lruPut(sheetFileBufCache, fileUrl, buf, SHEET_FILE_CACHE_MAX);
	}
	// 预览只需值/公式/日期；cellStyles/cellNF/sheetStubs 显著拖慢大表解析
	return XLSX.read(buf, {
		type: 'array',
		cellDates: true,
		cellNF: false,
		cellStyles: false,
		cellFormula: true,
		sheetStubs: false,
	});
}

/** 站点是否暗色（html[data-theme=dark]） */
function isSiteDark(): boolean {
	return document.documentElement.dataset.theme === 'dark';
}

/**
 * 暗色与站点一致（html[data-theme=dark] GitHub 风）：
 * bg #0d1117 · muted/elevated #161b22 · fg #e6edf3 · border #30363d · accent #2f81f7
 */
const XS_DARK = {
	bg: '#0d1117',
	header: '#161b22',
	grid: '#30363d',
	text: '#e6edf3',
	textMuted: '#8b949e',
	surface: '#161b22',
	border: '#30363d',
	accent: '#2f81f7',
} as const;

/** 默认单元格样式：暗色用站点同款 token */
function sheetDefaultStyle(fontPt: number): Record<string, unknown> {
	const dark = isSiteDark();
	return {
		bgcolor: dark ? XS_DARK.bg : '#ffffff',
		align: 'left',
		valign: 'middle',
		textwrap: false,
		strike: false,
		underline: false,
		color: dark ? XS_DARK.text : '#1f2328',
		font: {
			name: 'Microsoft YaHei, Segoe UI, Arial, sans-serif',
			size: fontPt,
			bold: false,
			italic: false,
		},
	};
}

function canvasInDarkHost(canvas: HTMLCanvasElement | null | undefined): boolean {
	if (!canvas?.closest) return false;
	const host = canvas.closest('.xs-host');
	if (!host) return false;
	return (
		host.classList.contains('is-xs-dark') ||
		document.documentElement.dataset.theme === 'dark'
	);
}

/** 库表头/网格/默认浅色 → 站点暗色（保留用户自定义色） */
function mapCanvasPaintColor(v: string): string {
	const s = v.replace(/\s+/g, '').toLowerCase();
	if (s === 'white') return XS_DARK.bg;
	if (/^rgba?\(255,255,255(?:,1(?:\.0+)?)?\)$/.test(s)) return XS_DARK.bg;
	const table: Record<string, string> = {
		'#fff': XS_DARK.bg,
		'#ffffff': XS_DARK.bg,
		'#fefefe': XS_DARK.bg,
		'#fafafa': XS_DARK.bg,
		'#f6f8fa': XS_DARK.header,
		'#f4f5f8': XS_DARK.header,
		'#f3f3f3': XS_DARK.header,
		'#eeeeee': XS_DARK.header,
		'#e6e6e6': XS_DARK.grid,
		'#e0e2e4': XS_DARK.border,
		'#d0d7de': XS_DARK.border,
		'#c0c0c0': XS_DARK.grid,
		'#585757': XS_DARK.textMuted,
		'#666666': XS_DARK.textMuted,
		'#333333': XS_DARK.text,
		'#0a0a0a': XS_DARK.text,
		'#1f2328': XS_DARK.text,
		'#000': XS_DARK.text,
		'#000000': XS_DARK.text,
		'rgb(255,255,255)': XS_DARK.bg,
		'rgb(244,245,248)': XS_DARK.header,
		'rgb(246,248,250)': XS_DARK.header,
		'rgb(230,230,230)': XS_DARK.grid,
		'rgb(224,226,228)': XS_DARK.border,
		'rgb(88,87,87)': XS_DARK.textMuted,
		'rgb(31,35,40)': XS_DARK.text,
		'rgb(10,10,10)': XS_DARK.text,
		'rgb(0,0,0)': XS_DARK.text,
	};
	return table[s] || v;
}

let canvasThemePatched = false;
/** getContext 级补丁：暗色宿主内 remap fill/stroke（比只改 prototype 稳） */
function ensureCanvasThemePatch(): void {
	if (canvasThemePatched) return;
	canvasThemePatched = true;
	const fillDesc = Object.getOwnPropertyDescriptor(
		CanvasRenderingContext2D.prototype,
		'fillStyle',
	);
	const strokeDesc = Object.getOwnPropertyDescriptor(
		CanvasRenderingContext2D.prototype,
		'strokeStyle',
	);
	const origGetContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (
		this: HTMLCanvasElement,
		type: string,
		...rest: unknown[]
	) {
		const ctx = (
			origGetContext as (
				t: string,
				...a: unknown[]
			) => RenderingContext | null
		).call(this, type, ...rest);
		if (
			type !== '2d' ||
			!ctx ||
			(ctx as CanvasRenderingContext2D & { __webmdXs?: boolean }).__webmdXs
		) {
			return ctx;
		}
		const c2d = ctx as CanvasRenderingContext2D & { __webmdXs?: boolean };
		c2d.__webmdXs = true;
		const mapIf = (v: string | CanvasGradient | CanvasPattern) => {
			if (typeof v !== 'string' || !canvasInDarkHost(this)) return v;
			return mapCanvasPaintColor(v);
		};
		if (fillDesc?.get && fillDesc.set) {
			Object.defineProperty(c2d, 'fillStyle', {
				configurable: true,
				enumerable: true,
				get() {
					return fillDesc.get!.call(this);
				},
				set(v: string | CanvasGradient | CanvasPattern) {
					fillDesc.set!.call(this, mapIf(v));
				},
			});
		}
		if (strokeDesc?.get && strokeDesc.set) {
			Object.defineProperty(c2d, 'strokeStyle', {
				configurable: true,
				enumerable: true,
				get() {
					return strokeDesc.get!.call(this);
				},
				set(v: string | CanvasGradient | CanvasPattern) {
					strokeDesc.set!.call(this, mapIf(v));
				},
			});
		}
		return ctx;
	} as typeof HTMLCanvasElement.prototype.getContext;
}

/** 隐藏打印按钮（库无配置项）；用 display:none 保留布局测量，避免 moreResize 全挤进 … */
function hideXsPrintButton(host: HTMLElement): void {
	host
		.querySelectorAll<HTMLElement>(
			'.x-spreadsheet-toolbar-btn .x-spreadsheet-icon-img.print',
		)
		.forEach((icon) => {
			const btn = icon.closest<HTMLElement>('.x-spreadsheet-toolbar-btn');
			if (btn) {
				btn.style.display = 'none';
				btn.setAttribute('aria-hidden', 'true');
				btn.dataset.xsHiddenPrint = '1';
			}
		});
	host
		.querySelectorAll<HTMLElement>('.x-spreadsheet-print')
		.forEach((el) => {
			el.style.display = 'none';
		});
}

/**
 * 工具栏贴满宿主宽。
 * 库 moreResize 会写 `width: widthFn()-60`，右侧留下 ~60px 白洞（红框空白）；
 * 用 !important 压掉，并在「更多」为空时隐藏其按钮。
 */
function reflowXsToolbar(host: HTMLElement): void {
	const tb = host.querySelector<HTMLElement>('.x-spreadsheet-toolbar');
	if (!tb) return;
	// 用 100% 贴宿主，勿写死像素（侧栏开合后易留右侧空白）
	tb.style.setProperty('width', '100%', 'important');
	tb.style.setProperty('max-width', '100%', 'important');
	tb.style.setProperty('min-width', '100%', 'important');
	tb.style.setProperty('box-sizing', 'border-box', 'important');
	// 清掉库残留的固定 px（部分路径只改 style.width 不带 important）
	if (tb.style.width && tb.style.width !== '100%') {
		tb.style.setProperty('width', '100%', 'important');
	}
	hideXsPrintButton(host);
	// moreResize 之后再按左侧自定义条宽度收库按钮
	if (tb.querySelector(':scope > [data-xs-ops-bar]')) {
		balanceToolbarWithOps(host);
	} else {
		hideEmptyToolbarMore(tb);
	}
}

/** 「更多」无溢出按钮时隐藏，避免右上角空占位 */
function hideEmptyToolbarMore(toolbar: HTMLElement): void {
	const moreContent = toolbar.querySelector<HTMLElement>(
		'.x-spreadsheet-toolbar-more',
	);
	const moreBtn = moreContent
		? moreContent.closest<HTMLElement>('.x-spreadsheet-toolbar-btn')
		: null;
	if (!moreBtn) return;
	if (!moreContent || moreContent.childElementCount === 0) {
		moreBtn.style.setProperty('display', 'none', 'important');
	} else {
		moreBtn.style.removeProperty('display');
	}
}

/**
 * 文本只读（mode:read）之外：锁住底栏「加 sheet / 改名 / 删表」。
 * 仍可点击切换已有工作表。
 */
function applySheetReadonlyChrome(host: HTMLElement): void {
	host.classList.add('is-xs-readonly');
	// 每次挂载都压住隐藏 input（选区会 focus → 手机弹键盘）
	suppressSpreadsheetKeyboard(host);
	const bar = host.querySelector<HTMLElement>('.x-spreadsheet-bottombar');
	if (!bar) return;
	if (bar.dataset.xsReadonlyBound === '1') return;
	bar.dataset.xsReadonlyBound = '1';
	// 捕获阶段拦住改名、删除菜单；加号用 CSS 隐藏
	bar.addEventListener(
		'dblclick',
		(ev) => {
			ev.preventDefault();
			ev.stopPropagation();
		},
		true,
	);
	bar.addEventListener(
		'contextmenu',
		(ev) => {
			ev.preventDefault();
			ev.stopPropagation();
		},
		true,
	);
	// 若有残留「添加」按钮点击
	bar.addEventListener(
		'click',
		(ev) => {
			const t = ev.target;
			if (!(t instanceof Element)) return;
			if (
				t.closest('.x-spreadsheet-icon-img.add') ||
				t.closest('.x-spreadsheet-icon.add') ||
				t.closest('[class*="icon-img"][class*="add"]')
			) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		},
		true,
	);
}

/**
 * 库选区带 hide-input，每次选区变化会 .focus() → 手机弹键盘、地址栏跳动。
 * 只读预览下禁用该焦点与编辑框焦点；缩放数字框仍可点。
 */
function suppressSpreadsheetKeyboard(host: HTMLElement): void {
	const neuter = (el: HTMLInputElement | HTMLTextAreaElement) => {
		el.setAttribute('readonly', 'readonly');
		el.setAttribute('inputmode', 'none');
		el.setAttribute('tabindex', '-1');
		el.setAttribute('autocomplete', 'off');
		// 避免 iOS 仍尝试弹键盘
		el.style.position = 'absolute';
		el.style.opacity = '0';
		el.style.pointerEvents = 'none';
		el.style.width = '1px';
		el.style.height = '1px';
		el.style.fontSize = '16px'; // 防止 iOS 缩放
		try {
			el.blur();
		} catch {
			/* ignore */
		}
	};

	host
		.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
			'.hide-input input, .hide-input textarea, .x-spreadsheet-editor textarea, .x-spreadsheet-editor input',
		)
		.forEach(neuter);

	if (host.dataset.xsKbGuard === '1') return;
	host.dataset.xsKbGuard = '1';
	host.addEventListener(
		'focusin',
		(ev) => {
			const t = ev.target;
			if (!(t instanceof HTMLElement)) return;
			// 允许自定义缩放数字框
			if (t.closest('[data-xs-zoom-input], .xs-ops-bar__zoom-input')) return;
			if (
				t.matches(
					'input, textarea, [contenteditable="true"], [contenteditable=""]',
				) ||
				t.closest('.hide-input, .x-spreadsheet-editor')
			) {
				ev.preventDefault();
				ev.stopPropagation();
				if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
					neuter(t);
				}
				try {
					(t as HTMLElement).blur();
				} catch {
					/* ignore */
				}
				// 焦点移出，避免 iOS 地址栏跟随输入态
				const ae = document.activeElement;
				if (ae instanceof HTMLElement && host.contains(ae)) {
					ae.blur();
				}
			}
		},
		true,
	);
}

export type XsToolbarOpsHandlers = {
	onReload: () => void;
	onSelectAll: () => void;
	onFitCol: () => void;
	onFitRow: () => void;
	/** 数字缩放 50–200 */
	onZoom: (pct: number, immediate: boolean) => void;
	/** 当前缩放 %，用于注入后同步输入框 */
	zoomPct: number;
};

/**
 * 自定义操作与库按钮同一行：挂在 toolbar 最左、toolbar-btns **外面**（兄弟节点）。
 * 勿塞进 toolbar-btns（会被 moreResize 清空）；挂好后 balance 把溢出库按钮收进「更多」。
 * 顺序：重载 → 全选 → 自动列宽 → 自动行高 → 缩放 → | 库菜单…
 */
function injectToolbarOpsBar(
	host: HTMLElement,
	handlers: XsToolbarOpsHandlers,
): void {
	const toolbar = host.querySelector<HTMLElement>('.x-spreadsheet-toolbar');
	if (!toolbar) return;
	const btns = toolbar.querySelector<HTMLElement>('.x-spreadsheet-toolbar-btns');

	// 清掉误放位置：btns 内、x-spreadsheet 顶层独立行
	btns
		?.querySelectorAll('[data-xs-ops-bar], [data-xs-fit-bar]')
		.forEach((el) => el.remove());
	host
		.querySelectorAll(
			'.x-spreadsheet > [data-xs-ops-bar], :scope > [data-xs-ops-bar]',
		)
		.forEach((el) => {
			if (el.parentElement !== toolbar) el.remove();
		});

	let bar = toolbar.querySelector<HTMLElement>(':scope > [data-xs-ops-bar]');
	const zoomVal = String(clampSheetZoom(handlers.zoomPct));
	if (!bar) {
		bar = document.createElement('div');
		bar.className = 'xs-ops-bar';
		bar.dataset.xsOpsBar = '1';
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', '表格操作');
		bar.innerHTML =
			`<button type="button" class="xs-ops-bar__btn" data-xs-reload title="仅重新加载并渲染中栏表格（不刷新页面、不退出全屏）">重载</button>` +
			`<button type="button" class="xs-ops-bar__btn" data-xs-select-all title="全选 / 取消全选">全选</button>` +
			`<button type="button" class="xs-ops-bar__btn" data-xs-fit-col title="按当前选区内容自动调整列宽">自动列宽</button>` +
			`<button type="button" class="xs-ops-bar__btn" data-xs-fit-row title="按当前选区内容自动调整行高">自动行高</button>` +
			`<label class="xs-ops-bar__zoom" data-xs-zoom title="整体缩放 50%–200%（填数字）">` +
			`<span class="xs-ops-bar__zoom-cap">缩放</span>` +
			`<input type="number" class="xs-ops-bar__zoom-input" data-xs-zoom-input min="50" max="200" step="1" value="${zoomVal}" aria-label="缩放百分比" />` +
			`<span class="xs-ops-bar__zoom-suffix">%</span>` +
			`</label>`;
	}
	// 同一行最左：toolbar 的第一个子节点，btns 在后
	if (btns) {
		if (bar.parentElement !== toolbar || bar.nextElementSibling !== btns) {
			toolbar.insertBefore(bar, btns);
		}
	} else if (bar.parentElement !== toolbar) {
		toolbar.insertBefore(bar, toolbar.firstChild);
	}

	const reloadBtn = bar.querySelector<HTMLButtonElement>('[data-xs-reload]');
	const selectAllBtn = bar.querySelector<HTMLButtonElement>(
		'[data-xs-select-all]',
	);
	const colBtn = bar.querySelector<HTMLButtonElement>('[data-xs-fit-col]');
	const rowBtn = bar.querySelector<HTMLButtonElement>('[data-xs-fit-row]');
	const zoomInput = bar.querySelector<HTMLInputElement>('[data-xs-zoom-input]');

	if (reloadBtn) reloadBtn.onclick = () => handlers.onReload();
	if (selectAllBtn) selectAllBtn.onclick = () => handlers.onSelectAll();
	if (colBtn) colBtn.onclick = () => handlers.onFitCol();
	if (rowBtn) rowBtn.onclick = () => handlers.onFitRow();

	if (zoomInput) {
		if (Number(zoomInput.value) !== clampSheetZoom(handlers.zoomPct)) {
			zoomInput.value = zoomVal;
		}
		zoomInput.onchange = () => {
			const raw = zoomInput.value.trim();
			const z = raw === '' ? handlers.zoomPct : Number(raw);
			const next = Number.isFinite(z) ? z : handlers.zoomPct;
			zoomInput.value = String(clampSheetZoom(next));
			handlers.onZoom(next, true);
		};
		zoomInput.onkeydown = (ev) => {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				zoomInput.blur();
			}
		};
		zoomInput.onblur = () => {
			const raw = zoomInput.value.trim();
			const z = raw === '' ? handlers.zoomPct : Number(raw);
			const next = clampSheetZoom(
				Number.isFinite(z) ? z : handlers.zoomPct,
			);
			if (next !== handlers.zoomPct || String(next) !== zoomInput.value) {
				zoomInput.value = String(next);
				handlers.onZoom(next, true);
			}
		};
	}

	// 自定义条占宽后，把装不下的库按钮收进「更多」
	balanceToolbarWithOps(host);
	// 库 moreResize 绑在 window.resize：之后再 balance 一次
	if (host.dataset.xsToolbarBalanceBound !== '1') {
		host.dataset.xsToolbarBalanceBound = '1';
		window.addEventListener('resize', () => {
			if (destroyedHost(host)) return;
			requestAnimationFrame(() => {
				if (destroyedHost(host)) return;
				// 若 ops 被 moreResize 误伤，由 inject 路径重挂；此处只平衡
				if (host.querySelector('[data-xs-ops-bar]')) {
					balanceToolbarWithOps(host);
				}
			});
		});
	}
}

function destroyedHost(host: HTMLElement): boolean {
	return !host.isConnected;
}

/**
 * moreResize 按「整条 toolbar 宽」排库按钮，不认左侧自定义条。
 * 自定义条挂上后：把 btns 里装不下的按钮挪进 .x-spreadsheet-toolbar-more，
 * 并同步下拉 content 宽度（与库 moreResize 的 sumWidth2 一致）。
 */
function balanceToolbarWithOps(host: HTMLElement): void {
	const toolbar = host.querySelector<HTMLElement>('.x-spreadsheet-toolbar');
	const ops = toolbar?.querySelector<HTMLElement>(':scope > [data-xs-ops-bar]');
	const btns = toolbar?.querySelector<HTMLElement>('.x-spreadsheet-toolbar-btns');
	if (!toolbar || !btns) return;

	const moreContent = toolbar.querySelector<HTMLElement>(
		'.x-spreadsheet-toolbar-more',
	);
	const moreBtn = moreContent
		? moreContent.closest<HTMLElement>('.x-spreadsheet-toolbar-btn')
		: null;
	const dropdownContent = moreContent?.parentElement as HTMLElement | null;

	const opsW = ops?.offsetWidth ?? 0;
	if (opsW > 0) {
		btns.style.maxWidth = `calc(100% - ${opsW + 8}px)`;
	} else {
		btns.style.removeProperty('max-width');
	}

	if (!moreContent || !moreBtn) return;

	const sumVisible = (): number => {
		let s = 0;
		for (const c of Array.from(btns.children) as HTMLElement[]) {
			if (c === moreBtn && moreContent.childElementCount === 0) continue;
			if (c === moreBtn && c.style.display === 'none') continue;
			s += c.offsetWidth + 2;
		}
		return s;
	};

	// 与库一致：overflow 按原序 append 进 more（勿 insertBefore 颠倒）
	let guard = 40;
	while (guard-- > 0) {
		const avail = btns.clientWidth;
		if (avail < 8) break;
		if (moreContent.childElementCount > 0) {
			moreBtn.style.display = '';
		}
		if (sumVisible() <= avail + 1) break;
		const kids = (Array.from(btns.children) as HTMLElement[]).filter(
			(c) => c !== moreBtn,
		);
		if (kids.length === 0) break;
		const last = kids[kids.length - 1]!;
		moreContent.appendChild(last);
		moreBtn.style.display = '';
	}

	if (moreContent.childElementCount > 0) {
		moreBtn.style.removeProperty('display');
		// 量「更多」内按钮总宽，只写 more 面板自身（勿波及色板/线框等子下拉）
		let sumW = 12;
		for (const c of Array.from(moreContent.children) as HTMLElement[]) {
			const prev = c.style.display;
			c.style.display = 'inline-block';
			sumW += Math.max(c.offsetWidth, 28) + 4;
			if (prev) c.style.display = prev;
			else c.style.removeProperty('display');
		}
		const panelW = Math.min(420, Math.max(160, sumW));
		if (dropdownContent?.classList.contains('x-spreadsheet-dropdown-content')) {
			dropdownContent.style.width = `${panelW}px`;
			dropdownContent.style.maxWidth = 'min(420px, 92vw)';
			// 标记：仅 more 外壳，子下拉用 CSS :not 保护
			dropdownContent.dataset.xsMorePanel = '1';
		}
		moreContent.style.width = '100%';
		// 子下拉若被库写成窄 width，清掉，交给 CSS max-content
		moreContent
			.querySelectorAll<HTMLElement>('.x-spreadsheet-dropdown-content')
			.forEach((el) => {
				if (el.dataset.xsMorePanel === '1') return;
				el.style.removeProperty('width');
				el.style.removeProperty('max-width');
			});
	} else {
		// 无溢出：隐藏「…」，否则右上角会留一块空白占位
		moreBtn.style.setProperty('display', 'none', 'important');
		if (
			dropdownContent?.classList.contains('x-spreadsheet-dropdown-content')
		) {
			dropdownContent.style.removeProperty('width');
			dropdownContent.style.removeProperty('max-width');
			delete dropdownContent.dataset.xsMorePanel;
		}
	}

	// 再次压掉 moreResize 的 widthFn()-60 白洞
	toolbar.style.setProperty('width', '100%', 'important');
	toolbar.style.setProperty('max-width', '100%', 'important');
	toolbar.style.setProperty('min-width', '100%', 'important');
}

function syncXsThemeClass(root: HTMLElement, host?: HTMLElement | null): void {
	const dark = isSiteDark();
	root.classList.toggle('is-xs-dark', dark);
	host?.classList.toggle('is-xs-dark', dark);
	document.body.classList.toggle('is-xs-dark', dark);
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureTextPx(text: string, fontPx: number): number {
	if (!_measureCtx) {
		const c = document.createElement('canvas');
		_measureCtx = c.getContext('2d');
	}
	const ctx = _measureCtx;
	if (!ctx) return text.length * fontPx * 0.6;
	ctx.font = `${fontPx}px "Microsoft YaHei","Segoe UI",sans-serif`;
	return ctx.measureText(text).width;
}

function fontPtToPx(pt: number): number {
	// 与 x-s 映射表大致一致
	const map: Record<number, number> = {
		10: 13,
		11: 15,
		12: 16,
		14: 18.7,
	};
	return map[pt] ?? Math.round((pt * 96) / 72);
}

/** 读取当前选区（整行/整列时 range 已覆盖整行或整列） */
function getXsSelectionRange(xs: XsInstance): XsSelRange | null {
	const data = xs.sheet?.data;
	const r =
		data?.selector?.range ??
		xs.sheet?.selector?.range ??
		null;
	if (
		!r ||
		typeof r.sri !== 'number' ||
		typeof r.sci !== 'number' ||
		typeof r.eri !== 'number' ||
		typeof r.eci !== 'number'
	) {
		return null;
	}
	return { sri: r.sri, sci: r.sci, eri: r.eri, eci: r.eci };
}

/**
 * 行列尺寸变化后，按原选区重算选区像素框（否则蓝框还停在旧宽高上）。
 */
function refreshSelectionAfterFit(
	xs: XsInstance,
	saved: XsSelRange | null,
): void {
	const sheet = xs.sheet;
	const sel = sheet?.selector;
	const data = sheet?.data;
	if (!sheet || !sel || !data) {
		xs.reRender?.();
		return;
	}
	const range = saved ?? getXsSelectionRange(xs);
	if (range) {
		const { maxR, maxC } = gridExtent(data);
		const sri = Math.max(0, Math.min(range.sri, maxR));
		const sci = Math.max(0, Math.min(range.sci, maxC));
		const eri = Math.max(sri, Math.min(range.eri, maxR));
		const eci = Math.max(sci, Math.min(range.eci, maxC));
		// 写回 data.selector.range，再驱动 UI 选区
		if (data.selector?.range) {
			data.selector.range.sri = sri;
			data.selector.range.sci = sci;
			data.selector.range.eri = eri;
			data.selector.range.eci = eci;
		}
		sel.set(sri, sci, true);
		sel.setEnd(eri, eci, false);
		sel.reset?.();
	}
	sheet.toolbar?.reset?.();
	sheet.table?.render?.();
	xs.reRender?.();
	sheet.focusing = true;
}

/** 自动列宽：严格按当前选区的列；测宽只用选区内行 */
function autofitColumns(xs: XsInstance | null, fontPt: number): boolean {
	const data = xs?.sheet?.data;
	if (!xs || !data?.setColWidth || !data.getCell) return false;
	const colLen = Math.max(1, data.cols?.len ?? 26);
	const rowLen = Math.min(Math.max(1, data.rows?.len ?? 50), 2000);
	const range = getXsSelectionRange(xs);
	const saved = range ? { ...range } : null;
	// 无选区：整表列；有选区：仅选中的列
	let c0 = 0;
	let c1 = colLen - 1;
	let r0 = 0;
	let r1 = rowLen - 1;
	if (range) {
		c0 = Math.max(0, Math.min(range.sci, colLen - 1));
		c1 = Math.max(c0, Math.min(range.eci, colLen - 1));
		r0 = Math.max(0, Math.min(range.sri, rowLen - 1));
		r1 = Math.max(r0, Math.min(range.eri, rowLen - 1));
	}
	const fontPx = fontPtToPx(fontPt);
	const pad = 20;
	const maxW = 560;
	const minW = 36;
	for (let ci = c0; ci <= c1; ci++) {
		let maxPx = minW;
		for (let ri = r0; ri <= r1; ri++) {
			const cell = data.getCell(ri, ci);
			const t = cell?.text != null ? String(cell.text) : '';
			if (!t) continue;
			const w = measureTextPx(t, fontPx) + pad;
			if (w > maxPx) maxPx = w;
		}
		const headerLabel =
			ci < 26
				? String.fromCharCode(65 + ci)
				: `C${ci + 1}`;
		const headerW = measureTextPx(headerLabel, fontPx) + pad;
		data.setColWidth(
			ci,
			Math.min(maxW, Math.max(minW, Math.ceil(Math.max(maxPx, headerW)))),
		);
	}
	refreshSelectionAfterFit(xs, saved);
	return true;
}

/** 自动行高：严格按当前选区的行；测高只用选区内列 */
function autofitRows(xs: XsInstance | null, fontPt: number): boolean {
	const data = xs?.sheet?.data;
	if (!xs || !data?.setRowHeight || !data.getCell) return false;
	const colLen = Math.min(Math.max(1, data.cols?.len ?? 26), 200);
	const rowLen = Math.min(Math.max(1, data.rows?.len ?? 50), 5000);
	const range = getXsSelectionRange(xs);
	const saved = range ? { ...range } : null;
	let r0 = 0;
	let r1 = rowLen - 1;
	let c0 = 0;
	let c1 = colLen - 1;
	if (range) {
		r0 = Math.max(0, Math.min(range.sri, rowLen - 1));
		r1 = Math.max(r0, Math.min(range.eri, rowLen - 1));
		c0 = Math.max(0, Math.min(range.sci, colLen - 1));
		c1 = Math.max(c0, Math.min(range.eci, colLen - 1));
	}
	const fontPx = fontPtToPx(fontPt);
	const lineH = Math.max(18, Math.round(fontPx * 1.4 + 10));
	const colWDefault = 100;
	for (let ri = r0; ri <= r1; ri++) {
		let lines = 1;
		for (let ci = c0; ci <= c1; ci++) {
			const cell = data.getCell(ri, ci);
			const t = cell?.text != null ? String(cell.text) : '';
			if (!t) continue;
			const colW =
				typeof data.cols?.getWidth === 'function'
					? data.cols.getWidth(ci)
					: colWDefault;
			const textW = measureTextPx(t, fontPx);
			const wrapLines = Math.max(
				1,
				Math.ceil(textW / Math.max(24, colW - 14)),
			);
			const nl = t.split(/\r?\n/).length;
			lines = Math.max(lines, wrapLines, nl);
		}
		const h = Math.min(240, Math.max(lineH, lineH * Math.min(lines, 10)));
		data.setRowHeight(ri, h);
	}
	refreshSelectionAfterFit(xs, saved);
	return true;
}

/** 宿主是否在全屏元素内（原生 :fullscreen 或手机伪全屏） */
function isHostInFullscreen(host: HTMLElement): boolean {
	if (document.body.classList.contains('is-center-pseudo-fs')) {
		const main = host.closest('[data-wiki-main]');
		return Boolean(main);
	}
	const fs =
		document.fullscreenElement ||
		(document as Document & { webkitFullscreenElement?: Element | null })
			.webkitFullscreenElement;
	if (!fs || !(fs instanceof HTMLElement)) return false;
	return fs === host || fs.contains(host);
}

/** 只测量中栏可用宽高，**不写** host 样式（供 view.width / 防循环） */
function measureHostSize(host: HTMLElement): { w: number; h: number } {
	const sheetRoot = host.closest<HTMLElement>('[data-sheet-app]');
	const main = host.closest<HTMLElement>('[data-wiki-main]');
	const scroll = host.closest<HTMLElement>('[data-wiki-scroll], .center-scroll');
	const mdBody = host.closest<HTMLElement>('.markdown-body');
	const isFs = isHostInFullscreen(host);

	const measureAvailW = (): number => {
		if (
			isFs &&
			main &&
			(document.fullscreenElement === main ||
				document.body.classList.contains('is-center-pseudo-fs'))
		) {
			return Math.floor(main.clientWidth || window.innerWidth || 0);
		}
		// 优先中栏 main/scroll（左栏收起后最先变宽）；勿用 .wiki-center
		//（含大纲列时会偏大）。host 若残留旧 px 宽会偏小，放最后。
		const ordered = [
			main?.clientWidth,
			scroll?.clientWidth,
			mdBody?.clientWidth,
			sheetRoot?.clientWidth,
			host.parentElement?.clientWidth,
			host.clientWidth,
		];
		for (const c of ordered) {
			const n = Math.floor(c || 0);
			if (n >= 200) return n;
		}
		return Math.floor(host.getBoundingClientRect().width || 320);
	};

	let w: number;
	let h: number;
	const nativeFs =
		main &&
		(document.fullscreenElement === main ||
			(document as Document & { webkitFullscreenElement?: Element | null })
				.webkitFullscreenElement === main);
	const pseudoFs =
		document.body.classList.contains('is-center-pseudo-fs') && Boolean(main);
	if (isFs && main && (nativeFs || pseudoFs)) {
		const footer = main.querySelector<HTMLElement>('.wiki-page-footer');
		const hostTop = host.getBoundingClientRect().top;
		const footerTop = footer?.getBoundingClientRect().top;
		const bottom =
			footerTop != null && footerTop > hostTop + 80
				? footerTop - 4
				: main.getBoundingClientRect().bottom - 4;
		// 返回外框尺寸（含滚动条槽）；画布再扣 gutter 见 canvasViewSize
		w = Math.max(320, measureAvailW());
		h = Math.max(280, Math.floor(bottom - hostTop));
	} else {
		const footer = document.querySelector<HTMLElement>('.wiki-page-footer');
		let bottom = window.innerHeight - 4;
		if (footer) {
			const fr = footer.getBoundingClientRect();
			if (fr.height > 0 && fr.top < window.innerHeight && fr.top > 80) {
				bottom = Math.min(bottom, fr.top - 4);
			}
		}
		const rect = host.getBoundingClientRect();
		h = Math.max(280, Math.floor(bottom - rect.top));
		w = Math.max(320, measureAvailW());
	}
	return { w, h };
}

/** 表格引擎 view：与宿主外框一致（滚动条由库叠在表上，勿再扣 gutter 改几何） */
function canvasViewSize(host: HTMLElement): { w: number; h: number } {
	const { w, h } = measureHostSize(host);
	return {
		w: Math.max(320, w),
		h: Math.max(240, h),
	};
}

/**
 * 贴满宿主；补滚动条旁的灰底垫片（行号列下方 / 右下角交叉），
 * 避免露出白色。不改库 scrollbar 的 width/height（滚动比例基准）。
 */
function fitSheetChrome(host: HTMLElement): void {
	const root = host.querySelector<HTMLElement>('.x-spreadsheet');
	const sheet = host.querySelector<HTMLElement>('.x-spreadsheet-sheet');
	const vSb = host.querySelector<HTMLElement>(
		'.x-spreadsheet-scrollbar.vertical',
	);
	const hSb = host.querySelector<HTMLElement>(
		'.x-spreadsheet-scrollbar.horizontal',
	);
	if (root) {
		root.style.setProperty('width', '100%', 'important');
		root.style.setProperty('max-width', '100%', 'important');
		root.style.setProperty('height', '100%', 'important');
		root.style.setProperty('box-sizing', 'border-box', 'important');
	}
	if (sheet) {
		sheet.style.setProperty('width', '100%', 'important');
		sheet.style.setProperty('max-width', '100%', 'important');
		sheet.style.setProperty('box-sizing', 'border-box', 'important');
		sheet.style.setProperty('flex', '1 1 auto', 'important');
		sheet.style.setProperty('min-height', '0', 'important');
		sheet.style.removeProperty('padding-right');
		sheet.style.removeProperty('padding-bottom');
		sheet.style.removeProperty('height');
	}
	for (const el of [vSb, hSb]) {
		if (!el) continue;
		el.style.removeProperty('top');
		el.style.removeProperty('left');
		el.style.removeProperty('max-height');
		el.style.removeProperty('max-width');
		if (el.style.height === 'auto') el.style.removeProperty('height');
		if (el.style.width === 'auto') el.style.removeProperty('width');
	}
	// 横条不盖行号列 → 左下空白；两滚动条交叉 → 右下空白。垫灰底与轨道同色。
	if (sheet) ensureScrollbarPads(sheet, hSb, vSb);
	// 常驻拇指 + 端点按钮；表体滑动时库改 scrollTop → 拇指跟着动
	bindXsScrollChrome(host);
}

/** 左下（行号下）+ 右下（纵横条交叉）灰垫，消除露白 */
function ensureScrollbarPads(
	sheet: HTMLElement,
	hSb: HTMLElement | null,
	vSb: HTMLElement | null,
): void {
	const ensure = (key: string, cls: string): HTMLElement => {
		let el = sheet.querySelector<HTMLElement>(`[data-xs-sb-pad="${key}"]`);
		if (!el) {
			el = document.createElement('div');
			el.dataset.xsSbPad = key;
			el.className = `xs-sb-pad xs-sb-pad--${cls}`;
			el.setAttribute('aria-hidden', 'true');
			sheet.appendChild(el);
		}
		return el;
	};
	const bl = ensure('bl', 'bl');
	const br = ensure('br', 'br');

	const sheetR = sheet.getBoundingClientRect();
	const hVis = hSb && !hSb.hidden && getComputedStyle(hSb).display !== 'none';
	const vVis = vSb && !vSb.hidden && getComputedStyle(vSb).display !== 'none';

	if (hVis && hSb) {
		const hR = hSb.getBoundingClientRect();
		const sbH = Math.max(10, Math.round(hR.height) || 12);
		const leftGap = Math.max(0, Math.round(hR.left - sheetR.left));
		const rightGap = Math.max(0, Math.round(sheetR.right - hR.right));
		if (leftGap > 1) {
			bl.hidden = false;
			bl.style.width = `${leftGap}px`;
			bl.style.height = `${sbH}px`;
		} else {
			bl.hidden = true;
		}
		const brW = Math.max(
			rightGap,
			vVis && vSb ? Math.round(vSb.getBoundingClientRect().width) || 12 : 12,
		);
		if (brW > 1) {
			br.hidden = false;
			br.style.width = `${brW}px`;
			br.style.height = `${sbH}px`;
		} else {
			br.hidden = true;
		}
	} else {
		bl.hidden = true;
		br.hidden = true;
	}
}

/**
 * 库 scrollbar 容器 + 自绘 chrome（拇指 + 两端一键到头/尾）。
 * 表体滑动/滚轮都会改 sb.scrollTop|Left → scroll 事件刷新拇指（进度同步）。
 * PC/手机同一套，隐藏系统条只留 chrome。
 */
function bindXsScrollChrome(host: HTMLElement): void {
	const attach = (sb: HTMLElement | null, vertical: boolean) => {
		if (!sb) return;
		sb.classList.add('is-xs-sb-chrome');

		let chrome = sb.querySelector<HTMLElement>(':scope > .xs-sb-chrome');
		if (!chrome) {
			chrome = document.createElement('div');
			chrome.className = `xs-sb-chrome ${vertical ? 'xs-sb-chrome--v' : 'xs-sb-chrome--h'}`;
			const startLabel = vertical ? '滚到顶部' : '滚到最左';
			const endLabel = vertical ? '滚到底部' : '滚到最右';
			const startGlyph = vertical ? '▲' : '◀';
			const endGlyph = vertical ? '▼' : '▶';
			chrome.innerHTML =
				`<button type="button" class="xs-sb-btn xs-sb-btn--start" title="${startLabel}" aria-label="${startLabel}">${startGlyph}</button>` +
				`<div class="xs-sb-track" data-xs-sb-track>` +
				`<div class="xs-sb-thumb" data-xs-sb-thumb></div>` +
				`</div>` +
				`<button type="button" class="xs-sb-btn xs-sb-btn--end" title="${endLabel}" aria-label="${endLabel}">${endGlyph}</button>`;
			sb.appendChild(chrome);

			const track = chrome.querySelector<HTMLElement>('[data-xs-sb-track]')!;
			const thumb = chrome.querySelector<HTMLElement>('[data-xs-sb-thumb]')!;
			const startBtn = chrome.querySelector<HTMLButtonElement>('.xs-sb-btn--start')!;
			const endBtn = chrome.querySelector<HTMLButtonElement>('.xs-sb-btn--end')!;

			const maxScroll = () =>
				Math.max(
					0,
					(vertical ? sb.scrollHeight : sb.scrollWidth) -
						(vertical ? sb.clientHeight : sb.clientWidth),
				);

			const refresh = () => syncXsSbThumb(sb, track, thumb, vertical);
			sb.addEventListener('scroll', refresh, { passive: true });

			startBtn.addEventListener('click', (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				if (vertical) sb.scrollTop = 0;
				else sb.scrollLeft = 0;
				refresh();
			});
			endBtn.addEventListener('click', (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				if (vertical) sb.scrollTop = maxScroll();
				else sb.scrollLeft = maxScroll();
				refresh();
			});

			// 拖拇指
			let dragging = false;
			let startPtr = 0;
			let startScr = 0;
			thumb.addEventListener('pointerdown', (ev) => {
				if (ev.button !== 0 && ev.pointerType === 'mouse') return;
				ev.preventDefault();
				ev.stopPropagation();
				dragging = true;
				startPtr = vertical ? ev.clientY : ev.clientX;
				startScr = vertical ? sb.scrollTop : sb.scrollLeft;
				thumb.classList.add('is-active');
				thumb.setPointerCapture(ev.pointerId);
			});
			thumb.addEventListener('pointermove', (ev) => {
				if (!dragging) return;
				ev.preventDefault();
				const trackLen = vertical ? track.clientHeight : track.clientWidth;
				const content = vertical ? sb.scrollHeight : sb.scrollWidth;
				const view = vertical ? sb.clientHeight : sb.clientWidth;
				const ms = Math.max(0, content - view);
				if (ms <= 0 || trackLen <= 0) return;
				const thumbLen = Math.max(
					24,
					Math.round((trackLen * view) / content),
				);
				const travel = Math.max(1, trackLen - thumbLen);
				const delta = (vertical ? ev.clientY : ev.clientX) - startPtr;
				const next = startScr + (delta / travel) * ms;
				if (vertical) sb.scrollTop = next;
				else sb.scrollLeft = next;
			});
			const endDrag = (ev: PointerEvent) => {
				if (!dragging) return;
				dragging = false;
				thumb.classList.remove('is-active');
				try {
					thumb.releasePointerCapture(ev.pointerId);
				} catch {
					/* ignore */
				}
			};
			thumb.addEventListener('pointerup', endDrag);
			thumb.addEventListener('pointercancel', endDrag);

			// 点轨道跳转
			track.addEventListener('pointerdown', (ev) => {
				if ((ev.target as HTMLElement).closest?.('[data-xs-sb-thumb]'))
					return;
				ev.preventDefault();
				const rect = track.getBoundingClientRect();
				const trackLen = vertical ? track.clientHeight : track.clientWidth;
				const content = vertical ? sb.scrollHeight : sb.scrollWidth;
				const view = vertical ? sb.clientHeight : sb.clientWidth;
				const ms = Math.max(0, content - view);
				if (ms <= 0) return;
				const thumbLen = Math.max(
					24,
					Math.round((trackLen * view) / content),
				);
				const click = vertical
					? ev.clientY - rect.top
					: ev.clientX - rect.left;
				const ratio =
					(click - thumbLen / 2) / Math.max(1, trackLen - thumbLen);
				const next = Math.min(ms, Math.max(0, ratio * ms));
				if (vertical) sb.scrollTop = next;
				else sb.scrollLeft = next;
			});
		}

		const track = sb.querySelector<HTMLElement>('[data-xs-sb-track]');
		const thumb = sb.querySelector<HTMLElement>('[data-xs-sb-thumb]');
		if (track && thumb) syncXsSbThumb(sb, track, thumb, vertical);

		// 库 hide() 时 chrome 一并藏
		const hidden =
			sb.hidden || getComputedStyle(sb).display === 'none';
		const ch = sb.querySelector<HTMLElement>(':scope > .xs-sb-chrome');
		if (ch) ch.style.display = hidden ? 'none' : '';
	};

	attach(
		host.querySelector<HTMLElement>('.x-spreadsheet-scrollbar.vertical'),
		true,
	);
	attach(
		host.querySelector<HTMLElement>(
			'.x-spreadsheet-scrollbar.horizontal',
		),
		false,
	);
}

function syncXsSbThumb(
	sb: HTMLElement,
	track: HTMLElement,
	thumb: HTMLElement,
	vertical: boolean,
): void {
	const trackLen = vertical ? track.clientHeight : track.clientWidth;
	const content = vertical ? sb.scrollHeight : sb.scrollWidth;
	const view = vertical ? sb.clientHeight : sb.clientWidth;
	const scroll = vertical ? sb.scrollTop : sb.scrollLeft;
	if (trackLen <= 0) return;
	if (content <= view + 1) {
		thumb.style.opacity = '0.4';
		if (vertical) {
			thumb.style.height = `${Math.round(trackLen * 0.4)}px`;
			thumb.style.transform = 'translateY(0)';
		} else {
			thumb.style.width = `${Math.round(trackLen * 0.4)}px`;
			thumb.style.transform = 'translateX(0)';
		}
		return;
	}
	thumb.style.opacity = '1';
	const thumbLen = Math.max(24, Math.round((trackLen * view) / content));
	const ms = content - view;
	const travel = Math.max(1, trackLen - thumbLen);
	const pos = (scroll / ms) * travel;
	if (vertical) {
		thumb.style.height = `${thumbLen}px`;
		thumb.style.width = '';
		thumb.style.transform = `translate3d(0,${pos}px,0)`;
	} else {
		thumb.style.width = `${thumbLen}px`;
		thumb.style.height = '';
		thumb.style.transform = `translate3d(${pos}px,0,0)`;
	}
}

/** 侧栏开合后需完整 sheetReset；仅 reRender 不会更新 sheet/overlayer 宽度 */
function reloadXsLayout(
	xs: XsInstance | null | undefined,
	host?: HTMLElement | null,
): void {
	if (!xs) return;
	if (typeof xs.sheet?.reload === 'function') {
		xs.sheet.reload();
	} else {
		xs.reRender?.();
	}
	if (host) fitSheetChrome(host);
}

/**
 * 测量并必要时写入宿主尺寸。
 * 返回 { w, h, changed }；changed=false 时调用方勿 reRender（防工具栏闪烁死循环）。
 */
function layoutHost(host: HTMLElement): { w: number; h: number; changed: boolean } {
	const isFs = isHostInFullscreen(host);
	// 表格页始终按中栏实际宽度铺满（不受「固定版心」夹窄），
	// 否则收起侧栏后 host 仍卡在旧 px 宽，右侧空白。
	const fillMode = true;
	const outer = measureHostSize(host);
	let changed = false;

	const hCss = `${outer.h}px`;
	if (host.style.height !== hCss || host.style.minHeight !== hCss) {
		host.style.setProperty('height', hCss, 'important');
		host.style.setProperty('min-height', hCss, 'important');
		changed = true;
	}

	if (fillMode && !isFs) {
		const needW =
			host.style.width !== '100%' ||
			(host.style.maxWidth !== '' && host.style.maxWidth !== 'none');
		if (needW) {
			host.style.setProperty('width', '100%', 'important');
			host.style.setProperty('max-width', 'none', 'important');
			changed = true;
		}
		void host.offsetWidth;
	} else {
		// 全屏：用测量像素钉死外框
		const wCss = `${outer.w}px`;
		if (host.style.width !== wCss || host.style.maxWidth !== wCss) {
			host.style.setProperty('width', wCss, 'important');
			host.style.setProperty('max-width', wCss, 'important');
			changed = true;
		}
	}
	// 返回画布尺寸（供 layout key / 引擎 view）
	const canvas = canvasViewSize(host);
	return { w: canvas.w, h: canvas.h, changed };
}

/** 会话脏标记（类型栏已统一为类型+复制，无旁注文案） */
function setSessionHint(root: HTMLElement, dirty: boolean): void {
	root.classList.toggle('is-session-dirty', dirty);
}

/**
 * 绑定所有 [data-sheet-app]
 */
export function bindExcelViewers(): void {
	document.querySelectorAll<HTMLElement>('[data-sheet-app]').forEach((root) => {
		if (root.dataset.bound === '1') return;
		root.dataset.bound = '1';

		// 页面态 class 以 SSG bodyClass 为准；此处仅作兜底，离开页由 softNav PAGE_STATE 清掉
		if (!document.body.classList.contains('is-sheet-app-page')) {
			document.body.classList.add('is-sheet-app-page');
		}
		if (!document.body.classList.contains('is-xs-page')) {
			document.body.classList.add('is-xs-page');
		}

		const host = root.querySelector<HTMLElement>('[data-xs-host]');
		const status = root.querySelector<HTMLElement>('[data-xs-status]');
		const errEl = root.querySelector<HTMLElement>('[data-xs-err]');
		const copyBtn = root.querySelector<HTMLButtonElement>('[data-xs-copy]');
		const fileUrl = root.dataset.fileUrl || '';
		const sourceKind = (root.dataset.sourceKind || 'xlsx').toLowerCase();

		if (!host || !fileUrl) {
			if (status) status.hidden = true;
			if (errEl) {
				errEl.hidden = false;
				errEl.textContent = '缺少表格地址';
			}
			return;
		}

		let xs: XsInstance | null = null;
		let wb: WorkBook | null = null;
		let XLSXref: XlsxMod | null = null;
		let x_spreadsheet: XsFactory | null = null;
		let destroyed = false;
		let sessionDirty = false;
		// 密度 UI 已下线；固定标准档（仍可读本地旧值，避免改数据口径）
		const densityId = readStoredDensity();
		const density = SHEET_DENSITIES[densityId];
		/** 显示缩放 %；逻辑数据始终按 100% 几何存放 */
		let zoomPct = readStoredZoom();
		/** 密度 stox 后的 100% 逻辑表；编辑后回写此结构 */
		let logicalData: XsSheet[] | null = null;
		let lastThemeDark = isSiteDark();
		root.dataset.density = densityId;
		syncZoomUi(root, zoomPct);
		syncXsThemeClass(root, host);
		ensureCanvasThemePatch();
		setSessionHint(root, false);

		const showError = (msg: string) => {
			if (status) status.hidden = true;
			if (errEl) {
				errEl.hidden = false;
				errEl.textContent = msg;
			}
		};

		const markDirty = () => {
			if (sessionDirty) return;
			sessionDirty = true;
			setSessionHint(root, true);
		};

		const clearDirty = () => {
			sessionDirty = false;
			setSessionHint(root, false);
		};

		/** 工具栏自定义操作（重载/全选/自适应/缩放）；zoomPct 随闭包更新 */
		const getOpsHandlers = (): XsToolbarOpsHandlers => ({
			onReload: () => {
				if (!XLSXref || !x_spreadsheet) return;
				// 直接重载：不二次确认、不写状态条（顶栏 soft-nav loading 已足够）
				void (async () => {
					if (destroyed || !XLSXref || !x_spreadsheet) return;
					try {
						if (status) status.hidden = true;
						if (errEl) errEl.hidden = true;
						wb = await readWorkbook(XLSXref, fileUrl, sourceKind);
						const data = stox(XLSXref, wb, density);
						if (!data.length) throw new Error('工作簿为空');
						clearDirty();
						mountGrid(data);
						if (!destroyed) relayout();
					} catch (e) {
						showError(e instanceof Error ? e.message : String(e));
					}
				})();
			},
			onSelectAll: () => {
				if (!toggleSelectAllGrid(xs)) {
					window.alert('表格尚未就绪');
				}
			},
			onFitCol: () => {
				if (
					!autofitColumns(
						xs,
						nearestFontPt(density.fontPt * (zoomPct / 100)),
					)
				)
					return;
				markDirty();
				captureLogicalFromXs();
				relayout();
			},
			onFitRow: () => {
				if (
					!autofitRows(
						xs,
						nearestFontPt(density.fontPt * (zoomPct / 100)),
					)
				)
					return;
				markDirty();
				captureLogicalFromXs();
				relayout();
			},
			onZoom: (z, immediate) => {
				applyZoom(z, immediate);
			},
			get zoomPct() {
				return zoomPct;
			},
		});

		const injectOps = () => injectToolbarOpsBar(host, getOpsHandlers());

		/** 防止 resize ↔ relayout ↔ ResizeObserver 递归闪烁 */
		let relayoutScheduled = false;
		let relayouting = false;
		let lastLayoutKey = '';
		const relayout = (force = false) => {
			if (!host || !xs || destroyed || relayouting) return;
			if (relayoutScheduled) return;
			relayoutScheduled = true;
			requestAnimationFrame(() => {
				relayoutScheduled = false;
				if (!host || !xs || destroyed) return;
				relayouting = true;
				try {
					const { w, h, changed } = layoutHost(host);
					const key = `${w}x${h}`;
					// 尺寸未变：不 reload（否则工具栏 moreResize 反复重写 DOM → 闪烁）
					if (!force && !changed && key === lastLayoutKey) {
						if (!host.querySelector('[data-xs-ops-bar]')) {
							injectOps();
						}
						return;
					}
					lastLayoutKey = key;
					// 完整 sheetReset：侧栏开合后更新 canvas / overlayer / 滚动条槽
					// （仅 reRender 不会改 sheet 宽度 → 右侧空白）
					reloadXsLayout(xs, host);
					fitSheetChrome(host);
					hideXsPrintButton(host);
					reflowXsToolbar(host);
					// moreResize 会清空 toolbar-btns，把操作栏挂回最左
					injectOps();
				} finally {
					relayouting = false;
				}
			});
		};

		/** 把当前引擎里的表（显示缩放）折回 100% 逻辑数据 */
		const captureLogicalFromXs = () => {
			if (!xs) return;
			try {
				const raw = xs.getData() as XsSheet[];
				if (!raw?.length) return;
				logicalData = scaleXsSheets(raw, 100 / zoomPct);
			} catch {
				/* ignore */
			}
		};

		const mountGrid = (data100: XsSheet[]) => {
			if (!x_spreadsheet || !host) return;
			logicalData = data100;
			const zf = zoomPct / 100;
			const display = scaleXsSheets(data100, zf);
			host.innerHTML = '';
			// 清掉可能残留的 CSS zoom/transform
			host.style.removeProperty('zoom');
			const d = density;
			const fontPt = nearestFontPt(d.fontPt * zf);
			const rowH = Math.max(16, Math.round(d.rowH * zf));
			const colW = Math.max(36, Math.round(d.colW * zf));
			const indexW = Math.max(36, Math.round(d.indexWidth * zf));
			const minW = Math.max(24, Math.round(d.colMin * zf));
			syncXsThemeClass(root, host);
			// 先保证宿主有宽，toolbar moreResize 的 widthFn 才能排出常用按钮
			layoutHost(host);
			xs = x_spreadsheet(host, {
				// read：不可改单元格文本 / 粘贴 / 插删行列（仍可拖列宽行高、滚动、选区）
				// 底栏保留切表，但禁止加/删/改名（见 applySheetReadonlyChrome）
				mode: 'read',
				showToolbar: true,
				showGrid: true,
				showContextmenu: false,
				showBottomBar: true,
				style: sheetDefaultStyle(fontPt),
				view: {
					// 仅测量，勿在回调里写 host 样式（会触发 RO → 闪烁）
					height: () => Math.max(240, canvasViewSize(host).h),
					// 至少 640，避免 moreResize 把按钮全塞进「更多」
					width: () =>
						Math.max(
							640,
							canvasViewSize(host).w,
							host.clientWidth || 0,
						),
				},
				row: {
					len: Math.min(
						MAX_ROWS,
						Math.max(80, ...display.map((s) => s.rows.len || 80)),
					),
					height: rowH,
				},
				col: {
					len: Math.min(
						MAX_COLS,
						Math.max(26, ...display.map((s) => s.cols.len || 26)),
					),
					width: colW,
					indexWidth: indexW,
					minWidth: minW,
				},
			});
			xs.loadData(display);
			// 只读文本下：列宽/行高仍可能触发 change；仅几何变更可标脏（会话内）
			xs.change?.(() => {
				markDirty();
				captureLogicalFromXs();
			});
			layoutHost(host);
			fitSheetChrome(host);
			requestAnimationFrame(() => {
				if (!destroyed) fitSheetChrome(host);
			});
			hideXsPrintButton(host);
			applySheetReadonlyChrome(host);
			reflowXsToolbar(host);
			// 上栏最左：重载/全选/列宽/行高/缩放
			injectOps();
			relayout();
			// 库 constructor 里 setTimeout(0) moreResize；之后再挂回最左
			window.setTimeout(() => {
				if (destroyed || !host) return;
				applySheetReadonlyChrome(host);
				reflowXsToolbar(host);
				injectOps();
				window.dispatchEvent(new Event('resize'));
				window.setTimeout(() => {
					if (destroyed) return;
					// resize 会触发库 sheetReset，再贴一次最右/最底
					fitSheetChrome(host);
					hideXsPrintButton(host);
					applySheetReadonlyChrome(host);
					reflowXsToolbar(host);
					injectOps();
				}, 30);
			}, 20);
		};

		/** 站点明暗切换：重建以应用默认色 + canvas remap class */
		const onThemeAttr: MutationCallback = () => {
			const dark = isSiteDark();
			if (dark === lastThemeDark) return;
			lastThemeDark = dark;
			syncXsThemeClass(root, host);
			if (!xs || !logicalData) return;
			captureLogicalFromXs();
			if (logicalData?.length) mountGrid(logicalData);
		};
		const themeObs = new MutationObserver(onThemeAttr);
		themeObs.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		});

		let zoomTimer: ReturnType<typeof setTimeout> | null = null;
		const applyZoom = (z: number, immediate = false) => {
			if (destroyed) return;
			const next = clampSheetZoom(z);
			syncZoomUi(root, next);
			const run = () => {
				zoomTimer = null;
				if (destroyed) return;
				// 先把当前显示折回逻辑，再按新缩放挂载（保留会话修改）
				captureLogicalFromXs();
				zoomPct = next;
				writeStoredZoom(next);
				if (logicalData?.length) mountGrid(logicalData);
			};
			if (immediate) {
				if (zoomTimer) clearTimeout(zoomTimer);
				run();
			} else {
				if (zoomTimer) clearTimeout(zoomTimer);
				zoomTimer = setTimeout(run, 80);
			}
		};

		/** 左上角交叉格点击 → 全选（捕获阶段抢在库 mousedown 之前） */
		const onCornerSelectAll = (evt: MouseEvent) => {
			if (!xs || destroyed || evt.button !== 0) return;
			if (!host.contains(evt.target as Node)) return;
			if (!isCornerHeaderClick(xs, host, evt)) return;
			evt.preventDefault();
			evt.stopPropagation();
			// 点一次全选，再点取消（与 Excel 角标切换一致）
			toggleSelectAllGrid(xs);
		};
		host.addEventListener('mousedown', onCornerSelectAll, true);

		/** Ctrl/Cmd+A：全选 / 再按取消 */
		const onSelectAllKey = (evt: KeyboardEvent) => {
			if (!(evt.ctrlKey || evt.metaKey)) return;
			if (evt.key !== 'a' && evt.key !== 'A') return;
			const t = evt.target as HTMLElement | null;
			if (
				t &&
				(t.tagName === 'INPUT' ||
					t.tagName === 'TEXTAREA' ||
					t.isContentEditable)
			) {
				return;
			}
			const inHost =
				host.contains(t) ||
				root.contains(t) ||
				Boolean(xs?.sheet?.focusing);
			if (!inHost) return;
			if (!xs) return;
			evt.preventDefault();
			evt.stopPropagation();
			toggleSelectAllGrid(xs);
		};
		window.addEventListener('keydown', onSelectAllKey, true);

		// —— 复制当前会话活动表为 CSV（优先 getData，保证含浏览器内改动）——
		copyBtn?.addEventListener('click', async () => {
			if (!XLSXref || !xs) return;
			try {
				const sdata = xs.getData();
				const name = activeSheetName(
					root,
					xs,
					sdata.map((s) => s.name),
				);
				const sheet =
					sdata.find((s) => s.name === name) || sdata[0];
				if (!sheet) throw new Error('无工作表');
				const tmp = xtos(XLSXref, [sheet]);
				const ws = tmp.Sheets[tmp.SheetNames[0]!];
				const csv = XLSXref.utils.sheet_to_csv(ws, {
					FS: ',',
					RS: '\n',
				});
				await navigator.clipboard.writeText(csv);
				flashBtn(copyBtn, true);
			} catch {
				flashBtn(copyBtn, false);
			}
		});

		// 中栏通用全屏：由路径栏 [data-center-fullscreen] 触发；此处跟着重算表格尺寸
		const onCenterFs = () => {
			if (destroyed || !isHostInFullscreen(host)) {
				// 退出原生/伪全屏都清锁定宽
				host.style.removeProperty('width');
				host.style.removeProperty('max-width');
				host.style.removeProperty('height');
				host.style.removeProperty('min-height');
				relayout();
				return;
			}
			host.style.removeProperty('width');
			host.style.removeProperty('max-width');
			host.style.removeProperty('height');
			host.style.removeProperty('min-height');
			const afterFsLayout = () => {
				if (destroyed) return;
				layoutHost(host);
				reflowXsToolbar(host);
				xs?.reRender?.();
				relayout();
			};
			requestAnimationFrame(() => {
				afterFsLayout();
				requestAnimationFrame(afterFsLayout);
			});
		};
		document.addEventListener('fullscreenchange', onCenterFs);

		void (async () => {
			try {
				// 不展示「加载引擎/解析/渲染」文案：顶栏 soft-nav loading 已足够
				if (status) status.hidden = true;
				if (errEl) errEl.hidden = true;
				const [XLSX, xsFactory] = await Promise.all([
					import('xlsx'),
					loadXsFactory(),
				]);
				if (destroyed) return;
				XLSXref = XLSX;
				x_spreadsheet = xsFactory;

				wb = await readWorkbook(XLSX, fileUrl, sourceKind);
				if (destroyed) return;

				const data = stox(XLSX, wb, density);
				if (!data.length) throw new Error('工作簿为空');

				if (status) status.hidden = true;
				if (errEl) errEl.hidden = true;
				clearDirty();
				mountGrid(data);
			} catch (e) {
				if (!destroyed)
					showError(e instanceof Error ? e.message : String(e));
			}
		})();

		// 窗口级：防抖，避免侧栏动画期间连续 reRender
		let winResizeT: number | null = null;
		const onWinResize = () => {
			if (winResizeT) window.clearTimeout(winResizeT);
			winResizeT = window.setTimeout(() => {
				winResizeT = null;
				relayout();
			}, 80);
		};
		window.addEventListener('resize', onWinResize);
		// 仅观察中栏（侧栏开合），勿观察 host 自身（layoutHost 改 host 会循环）
		let lastRoW = 0;
		const ro =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver((entries) => {
						const entry = entries[0];
						const nw = Math.round(entry?.contentRect?.width || 0);
						if (nw > 0 && Math.abs(nw - lastRoW) < 2) return;
						if (nw > 0) lastRoW = nw;
						relayout();
					})
				: null;
		// 观察中栏/壳层宽度（左栏收起、右大纲开合、拖拽改宽）
		const center = document.querySelector(
			'[data-wiki-scroll], .center-scroll',
		);
		const wikiMain = document.querySelector('[data-wiki-main], .wiki-main');
		const wikiCenter = document.querySelector('.wiki-center');
		const appShell = document.querySelector('.app-shell');
		if (center) ro?.observe(center);
		if (wikiMain && wikiMain !== center) ro?.observe(wikiMain);
		if (wikiCenter) ro?.observe(wikiCenter);
		if (appShell) ro?.observe(appShell);
		// 勿 ro.observe(root/host)：写 height/width 会持续触发

		root.addEventListener(
			'webmd:dispose',
			() => {
				destroyed = true;
				if (winResizeT) window.clearTimeout(winResizeT);
				window.removeEventListener('resize', onWinResize);
				window.removeEventListener('keydown', onSelectAllKey, true);
				host.removeEventListener('mousedown', onCornerSelectAll, true);
				document.removeEventListener('fullscreenchange', onCenterFs);
				themeObs.disconnect();
				ro?.disconnect();
				xs = null;
				wb = null;
				host.innerHTML = '';
				// 本页若已无其它 sheet-app，去掉兜底页面态（软导航也会按 PAGE_STATE 覆盖）
				if (!document.querySelector('[data-sheet-app]')) {
					document.body.classList.remove('is-sheet-app-page', 'is-xs-page');
				}
			},
			{ once: true },
		);
	});
}
