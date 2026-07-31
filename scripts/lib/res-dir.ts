/**
 * 内容旁路资源目录（统一约定，视频封面 / Office 预览 / 其它附件共用）
 *
 * 规范名（新生成一律用这个）：
 *   foo.mp4   →  _Res_foo.mp4/
 *   bar.docx  →  _Res_bar.docx/
 * 即：`_Res_` + **完整文件名（含扩展名）**，忽略大小写。
 *
 * 兼容查找（只读，不再新生成）：
 *   _Res_foo          （旧：仅主文件名、无扩展名）
 *   恰好 _res / _Res  （更旧的全局资源夹名）
 *
 * 不进左侧树、不进上下页；仍可通过 /content/... 访问。
 */
import fs from 'node:fs';
import path from 'node:path';
import { isResDirName } from './scan';

export type FileNameParts = {
	rel: string;
	parentRel: string;
	/** 完整文件名，含扩展名 */
	base: string;
	/** 无扩展名主文件名 */
	stem: string;
	ext: string;
};

export function contentFileParts(relPath: string): FileNameParts {
	const rel = relPath.replace(/\\/g, '/');
	const parentRel = path.posix.dirname(rel);
	const base = path.posix.basename(rel);
	const stem = base.replace(/\.[^.]+$/, '');
	const ext = path.posix.extname(base).toLowerCase().replace(/^\./, '');
	return { rel, parentRel, base, stem, ext };
}

/** 目录名是否匹配 `_Res_` + 给定后缀（忽略大小写） */
export function isResDirForSuffix(dirName: string, suffix: string): boolean {
	const lower = dirName.toLowerCase();
	if (!isResDirName(dirName)) return false;
	if (lower === '_res') return false;
	return lower === `_res_${suffix.toLowerCase()}`;
}

/**
 * 规范资源夹名：`_Res_` + 完整文件名（含扩展名）
 * 例：sample.docx → `_Res_sample.docx`
 */
export function canonicalResDirName(fileBaseName: string): string {
	return `_Res_${path.posix.basename(fileBaseName.replace(/\\/g, '/'))}`;
}

export type FoundResDir = {
	abs: string;
	relPosix: string;
	name: string;
	/** 是否规范名（完整文件名） */
	canonical: boolean;
};

/**
 * 查找与文件对应的资源夹。
 * 优先：`_Res_<完整文件名>`；其次兼容：`_Res_<无扩展名>`。
 */
export function findSiblingResDir(
	contentDir: string,
	relPath: string,
): FoundResDir | null {
	const { parentRel, base, stem } = contentFileParts(relPath);
	const parentAbs =
		parentRel === '.' ? contentDir : path.join(contentDir, parentRel);
	if (!fs.existsSync(parentAbs) || !fs.statSync(parentAbs).isDirectory()) {
		return null;
	}
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(parentAbs, { withFileTypes: true });
	} catch {
		return null;
	}

	const trySuffix = (suf: string, canonical: boolean): FoundResDir | null => {
		for (const ent of entries) {
			if (!ent.isDirectory() || !isResDirName(ent.name)) continue;
			if (!isResDirForSuffix(ent.name, suf)) continue;
			const abs = path.join(parentAbs, ent.name);
			const relPosix =
				parentRel === '.' ? ent.name : `${parentRel}/${ent.name}`;
			return { abs, relPosix, name: ent.name, canonical };
		}
		return null;
	};

	return trySuffix(base, true) || trySuffix(stem, false);
}

/**
 * 确保资源夹存在：优先复用已找到的（含旧名）；否则创建规范名 `_Res_<完整文件名>`。
 */
export function ensureSiblingResDir(
	contentDir: string,
	relPath: string,
): FoundResDir | null {
	const existing = findSiblingResDir(contentDir, relPath);
	if (existing) return existing;

	const { parentRel, base } = contentFileParts(relPath);
	const parentAbs =
		parentRel === '.' ? contentDir : path.join(contentDir, parentRel);
	const name = canonicalResDirName(base);
	const abs = path.join(parentAbs, name);
	try {
		fs.mkdirSync(abs, { recursive: true });
	} catch {
		return null;
	}
	const relPosix = parentRel === '.' ? name : `${parentRel}/${name}`;
	return { abs, relPosix, name, canonical: true };
}

export function contentUrl(relPosix: string): string {
	return (
		'/content/' +
		relPosix
			.split('/')
			.filter(Boolean)
			.map(encodeURIComponent)
			.join('/')
	);
}
