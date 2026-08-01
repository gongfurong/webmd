/**
 * 表格预览：SheetJS + x-data-spreadsheet 全面能力
 *
 * - 浏览器内：工具栏 / 右键 / 底栏 / 编辑 / 格式 / 冻结 / 筛选 / 打印…
 * - 源文件：只读加载，永不写回；下载走站点统一顶栏
 * - 可「从源重新加载」丢弃会话改动；复制 CSV 到剪贴板
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
	const range = root.querySelector<HTMLInputElement>('[data-xs-zoom-range]');
	const label = root.querySelector<HTMLElement>('[data-xs-zoom-label]');
	if (range && Number(range.value) !== pct) range.value = String(pct);
	if (label) label.textContent = `${pct}%`;
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
		await import('x-data-spreadsheet/dist/xspreadsheet.css');
		await import(
			/* @vite-ignore */ 'x-data-spreadsheet/dist/xspreadsheet.js'
		);
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

async function readWorkbook(
	XLSX: XlsxMod,
	fileUrl: string,
	sourceKind: string,
): Promise<WorkBook> {
	const res = await fetch(fileUrl, {
		credentials: 'same-origin',
		cache: 'no-cache',
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	if (sourceKind === 'csv') {
		const text = await res.text();
		return XLSX.read(text.replace(/^\uFEFF/, ''), {
			type: 'string',
			raw: false,
			cellDates: true,
		});
	}

	const buf = await res.arrayBuffer();
	return XLSX.read(buf, {
		type: 'array',
		cellDates: true,
		cellNF: true,
		cellStyles: true,
		cellFormula: true,
		sheetStubs: true,
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
 * 工具栏：先给足宽度让 moreResize 排出常用按钮，再去掉库的 -60 空隙。
 * 不要 max-content（会把按钮量窄后全进「更多」）。
 */
function reflowXsToolbar(host: HTMLElement): void {
	const tb = host.querySelector<HTMLElement>('.x-spreadsheet-toolbar');
	if (!tb) return;
	const full = Math.max(
		320,
		Math.floor(host.clientWidth || host.getBoundingClientRect().width || 0),
	);
	// 全宽测量
	tb.style.setProperty('width', `${full}px`, 'important');
	tb.style.setProperty('max-width', '100%', 'important');
	tb.style.setProperty('box-sizing', 'border-box', 'important');
	hideXsPrintButton(host);
}

/**
 * x-data-spreadsheet 无「自动列宽/行高」API。
 * 挂在上方工具栏**左侧**，紧挨撤销/字体等按钮组。
 */
function injectToolbarFitBar(
	host: HTMLElement,
	handlers: { onFitCol: () => void; onFitRow: () => void },
): void {
	const toolbar = host.querySelector<HTMLElement>('.x-spreadsheet-toolbar');
	if (!toolbar) return;
	const btns = toolbar.querySelector<HTMLElement>('.x-spreadsheet-toolbar-btns');
	// 优先塞进 btns 最前，与撤销/字体同一条左对齐菜单流
	const mountParent = btns || toolbar;
	let bar = toolbar.querySelector<HTMLElement>('[data-xs-fit-bar]');
	if (!bar) {
		bar = document.createElement('div');
		bar.className = 'xs-fit-bar';
		bar.dataset.xsFitBar = '1';
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', '行列自适应');
		bar.innerHTML =
			`<button type="button" class="xs-fit-bar__btn" data-xs-fit-col title="按当前选区内容自动调整列宽">自动列宽</button>` +
			`<button type="button" class="xs-fit-bar__btn" data-xs-fit-row title="按当前选区内容自动调整行高">自动行高</button>`;
		mountParent.insertBefore(bar, mountParent.firstChild);
	} else if (bar.parentElement !== mountParent || mountParent.firstChild !== bar) {
		// moreResize 会重写 btns 子节点，可能把我们的 bar 挤掉——每次挂回最左
		mountParent.insertBefore(bar, mountParent.firstChild);
	}
	const colBtn = bar.querySelector<HTMLButtonElement>('[data-xs-fit-col]');
	const rowBtn = bar.querySelector<HTMLButtonElement>('[data-xs-fit-row]');
	if (colBtn) colBtn.onclick = () => handlers.onFitCol();
	if (rowBtn) rowBtn.onclick = () => handlers.onFitRow();
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

/** 宿主是否在全屏元素内（中栏 data-wiki-main 全屏） */
function isHostInFullscreen(host: HTMLElement): boolean {
	const fs = document.fullscreenElement;
	if (!fs || !(fs instanceof HTMLElement)) return false;
	return fs === host || fs.contains(host);
}

/** 宿主吃满中栏；中栏全屏时按 wiki-main 视口量宽高 */
function layoutHost(host: HTMLElement): { w: number; h: number } {
	const sheetRoot = host.closest<HTMLElement>('[data-sheet-app]');
	const main = host.closest<HTMLElement>('[data-wiki-main]');
	const isFs = isHostInFullscreen(host);

	let w: number;
	let h: number;

	if (isFs && main && document.fullscreenElement === main) {
		const footer = main.querySelector<HTMLElement>('.wiki-page-footer');
		const hostTop = host.getBoundingClientRect().top;
		const footerTop = footer?.getBoundingClientRect().top;
		const bottom =
			footerTop != null && footerTop > hostTop + 80
				? footerTop - 4
				: main.getBoundingClientRect().bottom - 4;
		w = Math.max(320, Math.floor(main.clientWidth || window.innerWidth || 0));
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
		const parent = host.parentElement;
		const parentW = parent
			? Math.floor(
					parent.clientWidth || parent.getBoundingClientRect().width,
				)
			: 0;
		const rootW = sheetRoot
			? Math.floor(
					sheetRoot.clientWidth ||
						sheetRoot.getBoundingClientRect().width,
				)
			: 0;
		w = Math.max(320, parentW || rootW || Math.floor(rect.width) || 0);
	}

	const prevH = host.style.height;
	const prevW = host.style.width;
	const hCss = `${h}px`;
	const wCss = `${w}px`;
	if (prevH !== hCss) {
		host.style.setProperty('height', hCss, 'important');
		host.style.setProperty('min-height', hCss, 'important');
	}
	if (prevW !== wCss) {
		host.style.setProperty('width', wCss, 'important');
		host.style.setProperty('max-width', wCss, 'important');
	}
	return { w, h };
}

function syncDensityButtons(root: HTMLElement, id: SheetDensityId): void {
	root.querySelectorAll<HTMLElement>('[data-density]').forEach((btn) => {
		const on = btn.dataset.density === id;
		btn.classList.toggle('is-active', on);
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
	});
	root.dataset.density = id;
}

function setSessionHint(root: HTMLElement, dirty: boolean): void {
	const hint = root.querySelector<HTMLElement>('[data-xs-hint]');
	if (!hint) return;
	// 类型说明在标题：`XLSX → 表格（可编辑但不会写回源文件）`；hint 仅标会话脏状态
	if (dirty) {
		hint.hidden = false;
		hint.textContent = '浏览器内已修改';
		hint.classList.add('is-dirty');
	} else {
		hint.hidden = true;
		hint.textContent = '';
		hint.classList.remove('is-dirty');
	}
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
		const reloadBtn = root.querySelector<HTMLButtonElement>('[data-xs-reload]');
		const selectAllBtn = root.querySelector<HTMLButtonElement>('[data-xs-select-all]');
		const fileUrl = root.dataset.fileUrl || '';
		const fileName = root.dataset.fileName || 'workbook';
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
		let densityId = readStoredDensity();
		let density = SHEET_DENSITIES[densityId];
		/** 显示缩放 %；逻辑数据始终按 100% 几何存放 */
		let zoomPct = readStoredZoom();
		/** 密度 stox 后的 100% 逻辑表；编辑后回写此结构 */
		let logicalData: XsSheet[] | null = null;
		let lastThemeDark = isSiteDark();
		syncDensityButtons(root, densityId);
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
			root.classList.add('is-session-dirty');
		};

		const clearDirty = () => {
			sessionDirty = false;
			setSessionHint(root, false);
			root.classList.remove('is-session-dirty');
		};

		const fitHandlers = {
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
		};

		/** 防止 resize ↔ relayout ↔ ResizeObserver 递归把页面卡死 */
		let relayoutScheduled = false;
		let relayouting = false;
		const relayout = () => {
			if (!host || !xs || destroyed || relayouting) return;
			if (relayoutScheduled) return;
			relayoutScheduled = true;
			requestAnimationFrame(() => {
				relayoutScheduled = false;
				if (!host || !xs || destroyed) return;
				relayouting = true;
				try {
					layoutHost(host);
					// 只 reRender，不要 window.dispatchEvent('resize')
					// （原先会同步再次触发本 relayout → 死循环卡死）
					xs.reRender?.();
					hideXsPrintButton(host);
					reflowXsToolbar(host);
					// moreResize 会清空 toolbar-btns，把自动列宽/行高挂回最左
					injectToolbarFitBar(host, fitHandlers);
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
				// 全面能力：浏览器内可编辑；永不写源
				mode: 'edit',
				showToolbar: true,
				showGrid: true,
				showContextmenu: true,
				showBottomBar: true,
				style: sheetDefaultStyle(fontPt),
				view: {
					height: () => Math.max(240, layoutHost(host).h),
					// 至少 640，避免 moreResize 把按钮全塞进「更多」
					width: () =>
						Math.max(640, layoutHost(host).w, host.clientWidth || 0),
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
			xs.change?.(() => {
				markDirty();
				captureLogicalFromXs();
			});
			layoutHost(host);
			hideXsPrintButton(host);
			reflowXsToolbar(host);
			// 上栏最左：自动列宽/行高（框架无内置）
			injectToolbarFitBar(host, fitHandlers);
			relayout();
			// 库 constructor 里 setTimeout(0) moreResize；之后再挂回最左
			window.setTimeout(() => {
				if (destroyed || !host) return;
				reflowXsToolbar(host);
				injectToolbarFitBar(host, fitHandlers);
				window.dispatchEvent(new Event('resize'));
				window.setTimeout(() => {
					if (destroyed) return;
					hideXsPrintButton(host);
					reflowXsToolbar(host);
					injectToolbarFitBar(host, fitHandlers);
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

		const zoomRange = root.querySelector<HTMLInputElement>(
			'[data-xs-zoom-range]',
		);
		zoomRange?.addEventListener('input', () => {
			const z = Number(zoomRange.value);
			syncZoomUi(root, z);
			applyZoom(z, false);
		});
		zoomRange?.addEventListener('change', () => {
			applyZoom(Number(zoomRange.value), true);
		});

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

		selectAllBtn?.addEventListener('click', () => {
			if (!toggleSelectAllGrid(xs)) {
				window.alert('表格尚未就绪');
			}
		});

		/**
		 * 有未保存修改时的确认：用页内条，不用 window.confirm
		 * （原生对话框会打断浏览器 Fullscreen，且像「整页刷新」）。
		 */
		const confirmDiscardIfDirty = (action: string): Promise<boolean> => {
			if (!sessionDirty) return Promise.resolve(true);
			return new Promise((resolve) => {
				let bar = root.querySelector<HTMLElement>('[data-xs-confirm]');
				if (!bar) {
					bar = document.createElement('div');
					bar.className = 'xs-confirm';
					bar.dataset.xsConfirm = '1';
					bar.setAttribute('role', 'status');
					const after =
						root.querySelector('.webmd-code__bar') || root.firstChild;
					if (after?.parentElement === root) {
						root.insertBefore(bar, after.nextSibling);
					} else {
						root.insertBefore(bar, root.firstChild);
					}
				}
				bar.hidden = false;
				const safeAction = action
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');
				bar.innerHTML =
					`<span class="xs-confirm__msg">浏览器内有修改。${safeAction}将丢弃这些修改（仅重绘中栏表格，不刷新页面、不写源文件）。</span>` +
					`<span class="xs-confirm__actions">` +
					`<button type="button" class="xs-confirm__btn xs-confirm__btn--ok" data-xs-confirm-ok>继续</button>` +
					`<button type="button" class="xs-confirm__btn" data-xs-confirm-cancel>取消</button>` +
					`</span>`;
				const done = (ok: boolean) => {
					bar!.hidden = true;
					bar!.innerHTML = '';
					resolve(ok);
				};
				bar.querySelector('[data-xs-confirm-ok]')?.addEventListener(
					'click',
					() => done(true),
					{ once: true },
				);
				bar.querySelector('[data-xs-confirm-cancel]')?.addEventListener(
					'click',
					() => done(false),
					{ once: true },
				);
			});
		};

		const applyDensity = (id: SheetDensityId) => {
			if (destroyed || !wb || !XLSXref) return;
			if (id === densityId) return;
			void (async () => {
				const ok = await confirmDiscardIfDirty(
					'切换显示密度会按源文件重新生成表格',
				);
				if (!ok || destroyed || !wb || !XLSXref) return;
				densityId = id;
				density = SHEET_DENSITIES[id];
				writeStoredDensity(id);
				syncDensityButtons(root, id);
				const data = stox(XLSXref, wb, density);
				if (!data.length) return;
				clearDirty();
				// 只重建表格引擎 DOM，不动页面路由 / 全屏
				mountGrid(data);
				relayout();
			})();
		};

		root.querySelectorAll<HTMLButtonElement>('[data-density]').forEach(
			(btn) => {
				btn.addEventListener('click', () => {
					const id = btn.dataset.density;
					if (!id || !isSheetDensityId(id)) return;
					applyDensity(id);
				});
			},
		);

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

		// —— 重载：只重新 fetch 源文件并重绘中栏表格，不刷新页面、不退出全屏 ——
		reloadBtn?.addEventListener('click', () => {
			if (!XLSXref || !x_spreadsheet) return;
			void (async () => {
				const ok = await confirmDiscardIfDirty('重新加载');
				if (!ok || destroyed || !XLSXref || !x_spreadsheet) return;
				try {
					if (status) {
						status.hidden = false;
						status.textContent = '正在重新加载表格…';
					}
					wb = await readWorkbook(XLSXref, fileUrl, sourceKind);
					const data = stox(XLSXref, wb, density);
					if (!data.length) throw new Error('工作簿为空');
					if (status) status.hidden = true;
					clearDirty();
					mountGrid(data);
					if (!destroyed) relayout();
				} catch (e) {
					showError(e instanceof Error ? e.message : String(e));
				}
			})();
		});

		// 中栏通用全屏：由路径栏 [data-center-fullscreen] 触发；此处跟着重算表格尺寸
		const onCenterFs = () => {
			if (destroyed || !isHostInFullscreen(host)) {
				// 退出全屏也要清锁定宽
				if (!document.fullscreenElement) {
					host.style.removeProperty('width');
					host.style.removeProperty('max-width');
					host.style.removeProperty('height');
					host.style.removeProperty('min-height');
					relayout();
				}
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
				if (status) {
					status.hidden = false;
					status.textContent = '正在加载表格引擎…';
				}
				const [XLSX, xsFactory] = await Promise.all([
					import('xlsx'),
					loadXsFactory(),
				]);
				if (destroyed) return;
				XLSXref = XLSX;
				x_spreadsheet = xsFactory;

				if (status) status.textContent = `正在读取 ${fileName}…`;
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

		window.addEventListener('resize', relayout);
		const ro =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => relayout())
				: null;
		const center = document.querySelector(
			'[data-wiki-scroll], .center-scroll',
		);
		if (center) ro?.observe(center);
		ro?.observe(root);

		root.addEventListener(
			'webmd:dispose',
			() => {
				destroyed = true;
				window.removeEventListener('resize', relayout);
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
