/**
 * content 扫盘：树 + 扁平导航序列（排除 _Res_ 前缀 / 旧名 _res，忽略大小写）
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
	// Mermaid 独立源文件 → 文件页同文内引擎渲染
	'.mmd',
	'.mermaid',
	// PlantUML 独立源文件 → 同 shell/bind（@plantuml/core 客户端）
	'.puml',
	'.plantuml',
	'.pu',
	// Graphviz DOT
	'.dot',
	'.gv',
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.mov']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const PDF_EXT = new Set(['.pdf']);

/**
 * 资源目录（不进树、不进上下页，但仍可 /content 访问）：
 * - 完整前缀 `_Res_`（忽略大小写），如 `_Res_demo`、`_res_MyVideo`
 * - 兼容旧名：恰好 `_res` / `_Res` / `_RES`
 */
export function isResDirName(name: string): boolean {
	const lower = name.toLowerCase();
	if (lower === '_res') return true;
	return lower.startsWith('_res_');
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
 * 预览页统一挂在 `/pages/` 下，相对路径与 content 一致，便于对照维护。
 * - 主页 `/` → dist/index.html（站级，不在 pages 内）
 * - Markdown：去扩展名 → /pages/notes/hello/ ← content/notes/hello.md
 * - 其它文件：保留扩展名 → /pages/image/1.jpg/ ← content/image/1.jpg
 * - 原件始终在 /content/...（dist/content 拷贝）
 */
export const PAGES_ROOT = 'pages';

export function pageHref(file: TreeFile): string {
	const segs = (rel: string) =>
		[PAGES_ROOT, ...rel.split('/').filter(Boolean)]
			.map(encodeURIComponent)
			.join('/');
	if (file.kind === 'markdown') {
		const noExt = file.path.replace(/\.(md|mdx)$/i, '');
		return '/' + segs(noExt) + '/';
	}
	return '/' + segs(file.path) + '/';
}

/** 磁盘输出相对 dist 的目录（无尾斜杠）；主页 dist/index.html 单独写出 */
export function pageOutDir(file: TreeFile): string {
	if (file.kind === 'markdown') {
		return path.posix.join(
			PAGES_ROOT,
			file.path.replace(/\.(md|mdx)$/i, ''),
		);
	}
	return path.posix.join(PAGES_ROOT, file.path);
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
