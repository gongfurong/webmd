/**
 * 专有画布 / 导图源文件的「导出图」旁路预览（产品 §3.1）
 *
 * - draw.io / Excalidraw：优先 preview.svg，其次 preview.png
 * - XMind / FreeMind：优先 preview.png，其次 preview.svg
 *
 * 查找顺序：
 * 1. `_Res_<完整文件名>/preview.{svg|png}`（及大小写变体）
 * 2. 同目录旁路：`stem.svg` / `stem.png`（与源文件主名相同）
 *
 * 不自动调用 draw.io/XMind 导出；作者或 CI 放入上述文件即可。
 * @see docs/diagrams.md §3.1
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TreeFile } from './scan';
import { contentFileParts, contentUrl, findSiblingResDir } from './res-dir';

/** 走导出图预览的源扩展名（小写无点） */
export const DIAGRAM_EXPORT_SOURCE_EXTS = new Set([
	'drawio',
	'dio',
	'excalidraw',
	'xmind',
	'mm',
]);

export function isDiagramExportSourceFile(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const e = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return DIAGRAM_EXPORT_SOURCE_EXTS.has(e);
}

export type DiagramExportFamily = 'svg-first' | 'png-first';

export function diagramExportFamily(ext: string): DiagramExportFamily | null {
	const e = ext.toLowerCase().replace(/^\./, '');
	if (e === 'drawio' || e === 'dio' || e === 'excalidraw') return 'svg-first';
	if (e === 'xmind' || e === 'mm') return 'png-first';
	return null;
}

/** 按族优先的预览文件名列表 */
export function preferredPreviewBasenames(family: DiagramExportFamily): string[] {
	if (family === 'svg-first') {
		return [
			'preview.svg',
			'Preview.svg',
			'PREVIEW.SVG',
			'preview.png',
			'Preview.png',
			'PREVIEW.PNG',
		];
	}
	return [
		'preview.png',
		'Preview.png',
		'PREVIEW.PNG',
		'preview.svg',
		'Preview.svg',
		'PREVIEW.SVG',
	];
}

export type DiagramExportPreview = {
	/** /content/... 可访问 URL */
	url: string;
	absPath: string;
	/** svg | png */
	format: 'svg' | 'png';
	/** res | sibling */
	via: 'res' | 'sibling';
	family: DiagramExportFamily;
};

function formatOfName(name: string): 'svg' | 'png' | null {
	const l = name.toLowerCase();
	if (l.endsWith('.svg')) return 'svg';
	if (l.endsWith('.png')) return 'png';
	return null;
}

function tryFile(
	abs: string,
	relPosix: string,
	via: 'res' | 'sibling',
	family: DiagramExportFamily,
): DiagramExportPreview | null {
	try {
		if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
		const st = fs.statSync(abs);
		if (st.size < 8) return null;
		const base = path.basename(abs);
		const format = formatOfName(base);
		if (!format) return null;
		return {
			url: contentUrl(relPosix),
			absPath: abs,
			format,
			via,
			family,
		};
	} catch {
		return null;
	}
}

/**
 * 解析旁路导出图；无则 null → 统一下载卡。
 */
export function resolveDiagramExportPreview(
	contentDir: string,
	relPath: string,
): DiagramExportPreview | null {
	const { parentRel, base, stem, ext } = contentFileParts(relPath);
	const family = diagramExportFamily(ext);
	if (!family) return null;

	const names = preferredPreviewBasenames(family);

	// 1) _Res_* / preview.*
	const res = findSiblingResDir(contentDir, relPath);
	if (res) {
		for (const name of names) {
			const abs = path.join(res.abs, name);
			const relPosix = `${res.relPosix}/${name}`;
			const hit = tryFile(abs, relPosix, 'res', family);
			if (hit) return hit;
		}
	}

	// 2) 同目录 stem.svg / stem.png（按族优先）
	const parentAbs =
		parentRel === '.' ? contentDir : path.join(contentDir, parentRel);
	const siblingOrder =
		family === 'svg-first'
			? [`${stem}.svg`, `${stem}.png`, `${base}.svg`, `${base}.png`]
			: [`${stem}.png`, `${stem}.svg`, `${base}.png`, `${base}.svg`];
	for (const name of siblingOrder) {
		// 勿把源文件自己当预览
		if (name.toLowerCase() === base.toLowerCase()) continue;
		const abs = path.join(parentAbs, name);
		const relPosix = parentRel === '.' ? name : `${parentRel}/${name}`;
		const hit = tryFile(abs, relPosix, 'sibling', family);
		if (hit) return hit;
	}

	return null;
}

function escAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * 有导出图时：与普通图片页同构，只渲染 media-stage + img。
 * 路径栏已有下载源文件；不套类型栏 / 说明文案。
 */
export function renderDiagramExportPreviewHtml(opts: {
	sourceName: string;
	sourceUrl: string;
	sourceExt: string;
	preview: DiagramExportPreview;
	bytes?: number;
}): string {
	const ext = opts.sourceExt.toLowerCase().replace(/^\./, '');
	return (
		`<div class="media-stage media-stage--image" data-media-kind="image" data-diagram-export data-source-ext="${escAttr(ext)}" data-preview-format="${escAttr(opts.preview.format)}">` +
		`<img class="media-solo" src="${escAttr(opts.preview.url)}" alt="${escAttr(opts.sourceName)}" loading="eager" decoding="async" />` +
		`</div>`
	);
}
