/**
 * 视频封面
 *
 * 约定（与 scripts/lib/res-dir.ts 全站统一）：
 *   content/video/foo.mp4
 *   content/video/_Res_foo.mp4/poster.jpg   ← `_Res_` + 完整文件名（含扩展名）
 * 兼容旧夹：`_Res_foo`（无扩展名）只读查找，新生成一律规范名。
 *
 * 两阶段（制作站点 vs 渲染页面）：
 * 1) **制作/重建站点**（`prepareAllVideoPosters`）
 *    - 本机有 ffmpeg 且资源夹尚无有效图 → 抽帧写入 poster.jpg
 *    - 已有有效图 → 不覆盖
 * 2) **渲染**只绑定磁盘上校验通过的封面；不抽帧
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TreeFile } from './scan';
import {
	contentUrl,
	ensureSiblingResDir,
	findSiblingResDir,
} from './res-dir';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const POSTER_BASENAMES = [
	'poster',
	'cover',
	'thumb',
	'thumbnail',
	'preview',
	'封面',
];

let ffmpegPathCache: string | null | undefined;

function findFfmpeg(): string | null {
	if (ffmpegPathCache !== undefined) return ffmpegPathCache;
	const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {
		encoding: 'utf8',
		shell: true,
	});
	const line = (which.stdout || '')
		.split(/\r?\n/)
		.map((s) => s.trim())
		.find((s) => s && !s.toLowerCase().includes('info:'));
	if (line && fs.existsSync(line)) {
		ffmpegPathCache = line;
		return ffmpegPathCache;
	}
	const t = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: true });
	ffmpegPathCache = t.status === 0 ? 'ffmpeg' : null;
	return ffmpegPathCache;
}

/** 封面文件是否可用：存在、是文件、非空、扩展名合法 */
function isValidPosterFile(absPath: string): boolean {
	try {
		if (!fs.existsSync(absPath)) return false;
		const st = fs.statSync(absPath);
		if (!st.isFile() || st.size < 32) return false;
		const ext = path.extname(absPath).toLowerCase();
		return IMAGE_EXT.has(ext);
	} catch {
		return false;
	}
}

/**
 * 在资源夹内挑选**通过校验**的封面文件名（仅 basename）。
 * 跳过：已删残留名、0 字节、非图片扩展名。
 */
function pickPosterFile(resAbs: string): string | null {
	let names: string[];
	try {
		names = fs.readdirSync(resAbs);
	} catch {
		return null;
	}

	const valid = names.filter((n) => {
		if (n.startsWith('.')) return false;
		return isValidPosterFile(path.join(resAbs, n));
	});
	if (!valid.length) return null;

	const lowerMap = new Map(valid.map((n) => [n.toLowerCase(), n]));

	for (const base of POSTER_BASENAMES) {
		for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']) {
			const hit = lowerMap.get(base + ext);
			if (hit) return hit;
		}
	}

	valid.sort((a, b) => a.localeCompare(b, 'zh-CN'));
	return valid[0] ?? null;
}

export type ResolvedPoster = {
	/** /content/... URL，可写 poster= */
	url: string;
	/** content 相对路径 */
	relPosix: string;
	/** 磁盘绝对路径 */
	absPath: string;
	/** 资源夹是否与视频 stem/完整文件名一致 */
	resDirName: string;
};

/**
 * 解析并校验封面：资源夹（规范名或旧 stem 名）+ 有效图片文件。
 */
export function resolveVideoPosterDetailed(
	contentDir: string,
	relPath: string,
): ResolvedPoster | null {
	const absVideo = path.join(contentDir, relPath);
	if (!fs.existsSync(absVideo) || !fs.statSync(absVideo).isFile()) return null;

	const res = findSiblingResDir(contentDir, relPath);
	if (!res) return null;

	const file = pickPosterFile(res.abs);
	if (!file) return null;

	const absPath = path.join(res.abs, file);
	if (!isValidPosterFile(absPath)) return null;

	const relPosix = `${res.relPosix}/${file}`.replace(/\\/g, '/');
	return {
		url: contentUrl(relPosix),
		relPosix,
		absPath,
		resDirName: res.name,
	};
}

/**
 * 只解析：同名 _Res_ 夹内是否已有**有效**封面 → /content/... URL。
 * 文件缺失/空文件/夹名不一致 → null（不绑定）。
 */
export function resolveVideoPoster(
	contentDir: string,
	relPath: string,
): string | null {
	return resolveVideoPosterDetailed(contentDir, relPath)?.url ?? null;
}

/**
 * 单视频抽帧（制作站点时由 prepareAllVideoPosters 调用）。
 * 有 ffmpeg 且尚无有效图 → 写入 `_Res_<完整文件名>/poster.jpg`；已有图不覆盖。
 */
export function maybeGenerateVideoPoster(
	contentDir: string,
	relPath: string,
): boolean {
	const absVideo = path.join(contentDir, relPath);
	if (!fs.existsSync(absVideo) || !fs.statSync(absVideo).isFile()) return false;

	// 已有有效封面 → 不碰
	if (resolveVideoPosterDetailed(contentDir, relPath)) return false;

	const ffmpeg = findFfmpeg();
	if (!ffmpeg) return false;

	const res = ensureSiblingResDir(contentDir, relPath);
	if (!res) return false;
	const resAbs = res.abs;

	// 夹内已有有效图（再验一次）
	if (pickPosterFile(resAbs)) return false;

	const outPath = path.join(resAbs, 'poster.jpg');
	// Windows 下中文路径：在 content 父目录 cwd + 相对路径，减少 ffmpeg 编码问题
	const videoBase = path.basename(absVideo);
	const videoParent = path.dirname(absVideo);
	const outRelFromVideoParent = path.relative(videoParent, outPath);
	const attempts: { args: string[]; cwd: string }[] = [
		{
			cwd: videoParent,
			args: [
				'-y',
				'-ss',
				'0.5',
				'-i',
				videoBase,
				'-frames:v',
				'1',
				'-q:v',
				'4',
				'-update',
				'1',
				outRelFromVideoParent,
			],
		},
		{
			cwd: videoParent,
			args: [
				'-y',
				'-ss',
				'0',
				'-i',
				videoBase,
				'-frames:v',
				'1',
				'-q:v',
				'4',
				'-update',
				'1',
				outRelFromVideoParent,
			],
		},
	];
	for (const { args, cwd } of attempts) {
		const r = spawnSync(ffmpeg, args, {
			cwd,
			encoding: 'utf8',
			windowsHide: true,
			timeout: 90000,
		});
		if (r.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 32) {
			return true;
		}
	}
	// 抽帧失败：留下空 _Res_ 夹亦可，用户可手塞图
	return false;
}

/**
 * 渲染期绑定：只解析已有封面，不抽帧。
 * 抽帧请走站点制作路径 `prepareAllVideoPosters`。
 */
export function ensureVideoPoster(
	contentDir: string,
	relPath: string,
): string | null {
	return resolveVideoPoster(contentDir, relPath);
}

/**
 * 从 /content/... 视频 URL 得到 content 相对路径（去掉 query/hash）。
 */
export function contentRelFromVideoSrc(src: string): string | null {
	const raw = String(src || '')
		.trim()
		.split(/[?#]/)[0];
	if (!raw) return null;
	try {
		const pathOnly = raw.startsWith('http')
			? new URL(raw).pathname
			: raw;
		const m = pathOnly.match(/^\/content\/(.+)$/i);
		if (!m) return null;
		return decodeURIComponent(m[1]);
	} catch {
		return null;
	}
}

/**
 * Markdown 正文里的 <video>：若未写 poster，且 src 指向 /content/ 视频，
 * 则绑定同名 `_Res_*` 下**已有**封面（与全页同一文件）。渲染期不抽帧。
 */
export function injectInlineVideoPosters(
	contentDir: string,
	html: string,
): string {
	return String(html ?? '').replace(
		/<video\b([^>]*)>([\s\S]*?)<\/video>/gi,
		(full, attrs: string, inner: string) => {
			if (/\bposter\s*=/i.test(attrs)) return full;

			const fromVideo = /\ssrc\s*=\s*(["'])([^"']+)\1/i.exec(attrs);
			const fromSource = /<source\b[^>]*\ssrc\s*=\s*(["'])([^"']+)\1/i.exec(
				inner,
			);
			const src = (fromVideo?.[2] || fromSource?.[2] || '').trim();
			const rel = contentRelFromVideoSrc(src);
			if (!rel) return full;

			const poster = resolveVideoPoster(contentDir, rel);
			if (!poster) return full;

			const rest = String(attrs || '').replace(/^\s*/, ' ');
			return `<video poster="${poster.replace(/"/g, '&quot;')}"${rest}>${inner}</video>`;
		},
	);
}

/**
 * 制作/重建站点时批量抽帧（有 ffmpeg 且尚无有效封面时）。
 * 不限于某一个 npm 命令：凡「重新制作网站」的路径都应调用
 *（scan、vite buildStart、SSG 等）。
 */
export function prepareAllVideoPosters(
	contentDir: string,
	files: TreeFile[],
): { tried: number; generated: number; skippedNoFfmpeg: boolean } {
	const videos = files.filter((f) => f.kind === 'video');
	if (!videos.length) {
		return { tried: 0, generated: 0, skippedNoFfmpeg: false };
	}
	if (!findFfmpeg()) {
		return { tried: videos.length, generated: 0, skippedNoFfmpeg: true };
	}
	let generated = 0;
	for (const f of videos) {
		if (maybeGenerateVideoPoster(contentDir, f.path)) generated++;
	}
	return { tried: videos.length, generated, skippedNoFfmpeg: false };
}
