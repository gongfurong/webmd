/**
 * content 扫盘：树 + 扁平导航序列（排除 _res）
 */
import fs from 'node:fs';
import path from 'node:path';

export type FileKind = 'markdown' | 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'file';

export type TreeFile = {
	type: 'file';
	name: string;
	path: string;
	ext: string;
	kind: FileKind;
	url: string;
};

export type TreeDir = {
	type: 'dir';
	name: string;
	path: string;
	children: TreeNode[];
};

export type TreeNode = TreeFile | TreeDir;

export type TreeJson = {
	generatedAt: string;
	root: string;
	children: TreeNode[];
};

const TEXT_EXT = new Set([
	'.md',
	'.mdx',
	'.txt',
	'.json',
	'.yaml',
	'.yml',
	'.csv',
	'.py',
	'.js',
	'.ts',
	'.mjs',
	'.css',
	'.html',
	'.sh',
	'.log',
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.mov']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const PDF_EXT = new Set(['.pdf']);

export function isResDirName(name: string): boolean {
	return name.length >= 2 && name[0] === '_' && name.slice(1).toLowerCase() === 'res';
}

function kindOf(ext: string): FileKind {
	const e = ext.toLowerCase();
	if (e === '.md' || e === '.mdx') return 'markdown';
	if (TEXT_EXT.has(e)) return 'text';
	if (IMAGE_EXT.has(e)) return 'image';
	if (VIDEO_EXT.has(e)) return 'video';
	if (AUDIO_EXT.has(e)) return 'audio';
	if (PDF_EXT.has(e)) return 'pdf';
	return 'file';
}

/**
 * 站点页面路径
 * - 主页 / 是站级 index.html，不由 content 文件映射
 * - Markdown：去扩展名，如 index.md → /index/ ；notes/hello.md → /notes/hello/
 * - 其它：/f/...
 */
export function pageHref(file: TreeFile): string {
	if (file.kind === 'markdown') {
		const noExt = file.path.replace(/\.(md|mdx)$/i, '');
		return '/' + noExt.split('/').map(encodeURIComponent).join('/') + '/';
	}
	return '/f/' + file.path.split('/').map(encodeURIComponent).join('/') + '/';
}

/** 磁盘输出相对 dist 的目录（无尾斜杠文件名）；主页 dist/index.html 单独写出 */
export function pageOutDir(file: TreeFile): string {
	if (file.kind === 'markdown') {
		return file.path.replace(/\.(md|mdx)$/i, '');
	}
	return path.posix.join('f', file.path);
}

function walk(dir: string, base = ''): TreeNode[] {
	const nodes: TreeNode[] = [];
	if (!fs.existsSync(dir)) return nodes;

	const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
		if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
		return a.name.localeCompare(b.name, 'zh-CN');
	});

	for (const ent of entries) {
		if (ent.name.startsWith('.')) continue;
		const rel = base ? `${base}/${ent.name}` : ent.name;
		const full = path.join(dir, ent.name);

		if (ent.isDirectory()) {
			if (isResDirName(ent.name)) continue;
			nodes.push({
				type: 'dir',
				name: ent.name,
				path: rel,
				children: walk(full, rel),
			});
		} else {
			const ext = path.extname(ent.name);
			nodes.push({
				type: 'file',
				name: ent.name,
				path: rel,
				ext: ext.slice(1).toLowerCase(),
				kind: kindOf(ext),
				url: `/content/${rel.split('/').map(encodeURIComponent).join('/')}`,
			});
		}
	}
	return nodes;
}

export function scanContent(contentDir: string): TreeJson {
	return {
		generatedAt: new Date().toISOString(),
		root: 'content',
		children: walk(contentDir),
	};
}

export function flattenFiles(nodes: TreeNode[]): TreeFile[] {
	const out: TreeFile[] = [];
	function walkNodes(list: TreeNode[]) {
		for (const n of list) {
			if (n.type === 'file') out.push(n);
			else walkNodes(n.children || []);
		}
	}
	walkNodes(nodes);
	return out;
}
