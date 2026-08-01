/**
 * Office 预览（Word / Excel / PPT 等）
 *
 * 方案：制作站点时 LibreOffice → PDF，页面用 PDF.js。
 * 资源夹与视频封面同一套（scripts/lib/res-dir.ts）：
 *   sample.docx → _Res_sample.docx/preview.pdf
 *
 * 制作站点：有 LibreOffice 且尚无有效 preview.pdf → 转换；已有不覆盖。
 * 渲染：只绑定磁盘上的 preview.pdf。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import type { TreeFile } from './scan';
import {
	contentFileParts,
	contentUrl,
	ensureSiblingResDir,
	findSiblingResDir,
} from './res-dir';

/** 可尝试转 PDF 预览的扩展名（小写，无点） */
/** 走 LibreOffice→PDF 的类型（表格 xlsx/xls/ods 走浏览器 SheetJS 预览，不走 PDF） */
export const OFFICE_EXTS = new Set([
	'docx',
	'doc',
	'pptx',
	'ppt',
	'odt',
	'odp',
	'rtf',
]);

/** 仍算 Office 文件（树图标等），含表格 */
export const OFFICE_ALL_EXTS = new Set([
	...OFFICE_EXTS,
	'xlsx',
	'xls',
	'ods',
]);

const PREVIEW_NAMES = ['preview.pdf', 'Preview.pdf', 'PREVIEW.PDF'];

let sofficeCache: string | null | undefined;

export function isOfficeExt(ext: string): boolean {
	const e = ext.toLowerCase().replace(/^\./, '');
	return OFFICE_EXTS.has(e);
}

export function isOfficeFile(file: Pick<TreeFile, 'ext' | 'name' | 'path'>): boolean {
	const fromExt = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return OFFICE_ALL_EXTS.has(fromExt);
}

/** 是否用 LO 转 PDF（不含表格） */
export function isOfficePdfConvertible(
	file: Pick<TreeFile, 'ext' | 'name' | 'path'>,
): boolean {
	const fromExt = (file.ext || path.extname(file.name || file.path || ''))
		.toLowerCase()
		.replace(/^\./, '');
	return OFFICE_EXTS.has(fromExt);
}

function isValidPreviewPdf(absPath: string): boolean {
	try {
		if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return false;
		const st = fs.statSync(absPath);
		if (st.size < 64) return false;
		const fd = fs.openSync(absPath, 'r');
		const buf = Buffer.alloc(5);
		fs.readSync(fd, buf, 0, 5, 0);
		fs.closeSync(fd);
		return buf.toString('latin1') === '%PDF-';
	} catch {
		return false;
	}
}

function pickPreviewPdf(resAbs: string): string | null {
	let names: string[];
	try {
		names = fs.readdirSync(resAbs);
	} catch {
		return null;
	}
	const lowerMap = new Map(names.map((n) => [n.toLowerCase(), n]));
	for (const want of PREVIEW_NAMES) {
		const hit = lowerMap.get(want.toLowerCase());
		if (hit && isValidPreviewPdf(path.join(resAbs, hit))) return hit;
	}
	const pdfs = names.filter(
		(n) =>
			n.toLowerCase().endsWith('.pdf') &&
			!n.startsWith('.') &&
			isValidPreviewPdf(path.join(resAbs, n)),
	);
	pdfs.sort((a, b) => a.localeCompare(b, 'zh-CN'));
	return pdfs[0] ?? null;
}

export type ResolvedOfficePreview = {
	url: string;
	relPosix: string;
	absPath: string;
};

export function resolveOfficePreview(
	contentDir: string,
	relPath: string,
): ResolvedOfficePreview | null {
	const absOffice = path.join(contentDir, relPath);
	if (!fs.existsSync(absOffice) || !fs.statSync(absOffice).isFile()) return null;
	if (!isOfficeExt(path.extname(relPath))) return null;

	const res = findSiblingResDir(contentDir, relPath);
	if (!res) return null;
	const file = pickPreviewPdf(res.abs);
	if (!file) return null;
	const absPath = path.join(res.abs, file);
	const relPosix = `${res.relPosix}/${file}`.replace(/\\/g, '/');
	return { url: contentUrl(relPosix), relPosix, absPath };
}

export function findSoffice(): string | null {
	if (sofficeCache !== undefined) return sofficeCache;

	const which = spawnSync(
		process.platform === 'win32' ? 'where' : 'which',
		['soffice'],
		{ encoding: 'utf8', shell: true },
	);
	const line = (which.stdout || '')
		.split(/\r?\n/)
		.map((s) => s.trim())
		.find((s) => s && !s.toLowerCase().includes('info:'));
	if (line && fs.existsSync(line)) {
		sofficeCache = line;
		return sofficeCache;
	}

	const candidates: string[] = [];
	if (process.platform === 'win32') {
		const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
		const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
		const local = process.env.LOCALAPPDATA || '';
		candidates.push(
			path.join(pf, 'LibreOffice', 'program', 'soffice.exe'),
			path.join(pf86, 'LibreOffice', 'program', 'soffice.exe'),
			path.join(local, 'Programs', 'LibreOffice', 'program', 'soffice.exe'),
		);
	} else if (process.platform === 'darwin') {
		candidates.push(
			'/Applications/LibreOffice.app/Contents/MacOS/soffice',
			'/usr/local/bin/soffice',
			'/opt/homebrew/bin/soffice',
		);
	} else {
		candidates.push(
			'/usr/bin/soffice',
			'/usr/bin/libreoffice',
			'/snap/bin/libreoffice',
		);
	}
	for (const c of candidates) {
		if (c && fs.existsSync(c)) {
			sofficeCache = c;
			return sofficeCache;
		}
	}

	const t = spawnSync(process.platform === 'win32' ? 'soffice.exe' : 'soffice', [
		'--version',
	], { encoding: 'utf8', shell: true, timeout: 15000 });
	if (t.status === 0) {
		sofficeCache = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
		return sofficeCache;
	}

	sofficeCache = null;
	return null;
}

/**
 * 有 LibreOffice 且尚无有效预览 PDF 时转换。
 * 输出：`_Res_<完整文件名>/preview.pdf`
 */
export function maybeConvertOfficePreview(
	contentDir: string,
	relPath: string,
): boolean {
	const absOffice = path.join(contentDir, relPath);
	if (!fs.existsSync(absOffice) || !fs.statSync(absOffice).isFile()) return false;
	if (!isOfficeExt(path.extname(relPath))) return false;
	if (resolveOfficePreview(contentDir, relPath)) return false;

	const soffice = findSoffice();
	if (!soffice) return false;

	const res = ensureSiblingResDir(contentDir, relPath);
	if (!res) return false;
	if (pickPreviewPdf(res.abs)) return false;

	const { stem } = contentFileParts(relPath);
	const outPath = path.join(res.abs, 'preview.pdf');
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'webmd-lo-'));
	const profileDir = path.join(tmpRoot, 'profile');
	fs.mkdirSync(profileDir, { recursive: true });

	const profileUri =
		'file:///' +
		profileDir.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1:');

	const parentAbs = path.dirname(absOffice);
	const args = [
		'--headless',
		'--nologo',
		'--nofirststartwizard',
		'--norestore',
		`-env:UserInstallation=${profileUri}`,
		'--convert-to',
		'pdf',
		'--outdir',
		tmpRoot,
		absOffice,
	];

	try {
		const r = spawnSync(soffice, args, {
			encoding: 'utf8',
			windowsHide: true,
			timeout: 180000,
			cwd: parentAbs,
		});
		const expected = path.join(tmpRoot, `${stem}.pdf`);
		let produced: string | null = null;
		if (fs.existsSync(expected) && isValidPreviewPdf(expected)) {
			produced = expected;
		} else {
			try {
				const pdfs = fs
					.readdirSync(tmpRoot)
					.filter((n) => n.toLowerCase().endsWith('.pdf'))
					.map((n) => path.join(tmpRoot, n));
				produced = pdfs.find((p) => isValidPreviewPdf(p)) || null;
			} catch {
				produced = null;
			}
		}
		if (!produced) {
			if (r.status !== 0) {
				console.warn(
					`[site] Office 转 PDF 失败: ${relPath}`,
					(r.stderr || r.stdout || '').slice(0, 200),
				);
			}
			return false;
		}
		fs.copyFileSync(produced, outPath);
		return isValidPreviewPdf(outPath);
	} catch (e) {
		console.warn('[site] Office 转 PDF 异常:', relPath, e);
		return false;
	} finally {
		try {
			fs.rmSync(tmpRoot, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
}

export function prepareAllOfficePreviews(
	contentDir: string,
	files: TreeFile[],
): { tried: number; generated: number; skippedNoSoffice: boolean } {
	// 仅 Word/PPT 等走 PDF；xlsx 不在此处理
	const officeFiles = files.filter((f) => isOfficePdfConvertible(f));
	if (!officeFiles.length) {
		return { tried: 0, generated: 0, skippedNoSoffice: false };
	}
	if (!findSoffice()) {
		return {
			tried: officeFiles.length,
			generated: 0,
			skippedNoSoffice: true,
		};
	}
	let generated = 0;
	for (const f of officeFiles) {
		if (maybeConvertOfficePreview(contentDir, f.path)) generated++;
	}
	return {
		tried: officeFiles.length,
		generated,
		skippedNoSoffice: false,
	};
}
