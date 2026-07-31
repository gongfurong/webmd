/**
 * MiniSearch 统一索引（与 starlight-vanilla 契约一致）
 * 字段：file / path / h1–h3 / abstract / body / format / folder
 *
 * 摘要 = 第一段非标题正文（+ 可选 FM）；正文 = 其余段落（互斥）
 * 标题 slug 尽量与 marked-gfm-heading-id 接近（搜索索引用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { flattenFiles, pageHref, scanContent, type FileKind, type TreeFile } from './scan';

const MAX_BODY = 20000;
const MAX_ABSTRACT = 4000;
const MAX_PART = 4000;

const FORMAT_LABEL: Record<string, string> = {
	markdown: 'Markdown',
	text: '文本',
	image: '图片',
	video: '视频',
	audio: '音频',
	pdf: 'PDF',
	file: '其他',
};

export type SearchHeading = { depth: number; text: string; slug: string };
export type SearchBodyPart = {
	slug: string;
	text: string;
	heading?: string;
	depth?: number;
};

export type SearchDoc = {
	id: string;
	href: string;
	file: string;
	path: string;
	h1: string;
	h2: string;
	h3: string;
	abstract: string;
	abstractSlug?: string;
	body: string;
	headings?: SearchHeading[];
	bodyParts?: SearchBodyPart[];
	format: string;
	folder: string;
	displayTitle: string;
};

export type SearchIndexFile = {
	version: number;
	engine: string;
	generatedAt: string;
	docs: SearchDoc[];
	facets: { format: Record<string, number>; folder: Record<string, number> };
};

function stripCodeAndLinks(raw: string): string {
	return String(raw || '')
		.replace(/```[\s\S]*?```/g, '\n')
		.replace(/`[^`]+`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[*_~]+/g, ' ');
}

function cleanInline(s: string): string {
	return String(s || '')
		.replace(/[#>*_`~\-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function formatLabel(kind: FileKind | string): string {
	return FORMAT_LABEL[kind] || kind || '其他';
}

/** 文件所在目录（完整相对路径）；根下文件 → 根目录 */
export function parentFolder(filePath: string): string {
	const parts = String(filePath || '')
		.replace(/\\/g, '/')
		.split('/')
		.filter(Boolean);
	if (parts.length <= 1) return '根目录';
	return parts.slice(0, -1).join('/');
}

/** 目录自身 + 所有上级，用于分面多层展示与计数 */
export function folderAncestors(folder: string): string[] {
	if (!folder || folder === '根目录') return ['根目录'];
	const parts = folder.split('/').filter(Boolean);
	const keys: string[] = [];
	for (let i = 1; i <= parts.length; i++) {
		keys.push(parts.slice(0, i).join('/'));
	}
	return keys;
}

/**
 * 与页面 TOC 接近：marked-gfm-heading-id 对中文常保留原文；
 * 英文标题 lower + 空白转 -。重复标题加 -n。
 */
function createSlugger() {
	const used = new Map<string, number>();
	return (title: string): string => {
		let base = String(title)
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			// 去掉多数标点，保留中英文与数字与 -
			.replace(/[^\w\u4e00-\u9fff-]/g, '');
		if (!base) base = 'section';
		const n = used.get(base) || 0;
		used.set(base, n + 1);
		return n === 0 ? base : `${base}-${n}`;
	};
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(raw || ''));
	if (!m) return { meta: {}, content: String(raw || '') };
	const meta: Record<string, string> = {};
	for (const line of m[1]!.split(/\r?\n/)) {
		const kv = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
		if (!kv) continue;
		const key = kv[1]!.toLowerCase();
		let val = kv[2]!.trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		meta[key] = val;
	}
	return { meta, content: String(raw || '').slice(m[0].length) };
}

function splitMarkdown(raw: string) {
	const { meta, content } = parseFrontmatter(raw);
	const bodySrc = stripCodeAndLinks(content);
	const lines = bodySrc.split(/\r?\n/);
	const slugOf = createSlugger();

	const headings: SearchHeading[] = [];
	const h1: string[] = [];
	const h2: string[] = [];
	const h3: string[] = [];
	const proseParas: { text: string; slug: string }[] = [];
	let paraBuf: string[] = [];
	let currentSlug = '';

	const flushPara = () => {
		const text = paraBuf.join(' ').trim();
		paraBuf = [];
		if (text) proseParas.push({ text, slug: currentSlug });
	};

	for (const line of lines) {
		const hm = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (hm) {
			flushPara();
			const depth = hm[1]!.length;
			const title = cleanInline(hm[2]!);
			if (!title) continue;
			const slug = slugOf(title);
			headings.push({ depth, text: title, slug });
			if (depth === 1) h1.push(title);
			else if (depth === 2) h2.push(title);
			else if (depth === 3) h3.push(title);
			currentSlug = slug;
			continue;
		}
		const t = cleanInline(line);
		if (!t) {
			flushPara();
			continue;
		}
		paraBuf.push(t);
	}
	flushPara();

	const fmAbstract = cleanInline(meta.description || meta.summary || meta.abstract || '');
	const firstPara = proseParas[0];
	const abstractCore = firstPara?.text || '';
	const abstract = [fmAbstract, abstractCore].filter(Boolean).join(' ').slice(0, MAX_ABSTRACT);
	const abstractSlug = firstPara?.slug || '';

	const restParas = proseParas.slice(1);
	const headingBySlug = new Map(
		headings.map((h) => [h.slug, { depth: h.depth, text: h.text }] as const),
	);

	const bodyParts: SearchBodyPart[] = [];
	for (const p of restParas) {
		const text = p.text.trim();
		if (!text) continue;
		const h = p.slug ? headingBySlug.get(p.slug) : undefined;
		bodyParts.push({
			slug: p.slug || '',
			text: text.slice(0, MAX_PART),
			...(h ? { heading: h.text, depth: h.depth } : {}),
		});
	}

	const body = restParas
		.map((p) => p.text)
		.join(' ')
		.slice(0, MAX_BODY);

	return { h1, h2, h3, abstract, abstractSlug, body, headings, bodyParts };
}

function isTextualKind(kind: FileKind): boolean {
	return kind === 'markdown' || kind === 'text';
}

function fileToDoc(contentDir: string, f: TreeFile): SearchDoc {
	const fileName = f.name;
	const pathLabel = f.path.replace(/\\/g, '/');
	const format = formatLabel(f.kind);
	const folder = parentFolder(f.path);
	const href = pageHref(f);
	const full = path.join(contentDir, f.path);

	let h1: string[] = [];
	let h2: string[] = [];
	let h3: string[] = [];
	let abstract = '';
	let abstractSlug = '';
	let body = '';
	let headings: SearchHeading[] = [];
	let bodyParts: SearchBodyPart[] = [];

	if (f.kind === 'markdown' && fs.existsSync(full)) {
		try {
			const parts = splitMarkdown(fs.readFileSync(full, 'utf8'));
			h1 = parts.h1;
			h2 = parts.h2;
			h3 = parts.h3;
			abstract = parts.abstract;
			abstractSlug = parts.abstractSlug;
			body = parts.body;
			headings = parts.headings;
			bodyParts = parts.bodyParts;
		} catch {
			body = `${fileName} ${pathLabel}`;
		}
	} else if (isTextualKind(f.kind) && fs.existsSync(full)) {
		try {
			const fullText = stripCodeAndLinks(fs.readFileSync(full, 'utf8'));
			const paras = fullText
				.split(/\n\s*\n/)
				.map((p) => cleanInline(p))
				.filter(Boolean);
			abstract = (paras[0] || '').slice(0, MAX_ABSTRACT);
			const rest = paras.slice(1);
			body = rest.join(' ').slice(0, MAX_BODY);
			bodyParts = rest.map((text) => ({
				slug: '',
				text: text.slice(0, MAX_PART),
			}));
		} catch {
			body = `${fileName} ${pathLabel}`;
		}
	} else {
		// 媒体等：文件名 + 路径可搜
		body = `${fileName} ${pathLabel} ${f.kind} ${f.ext}`;
	}

	const join = (arr: string[]) => (arr.length ? arr.join('\n') : '');

	return {
		id: pathLabel,
		href,
		file: fileName,
		path: pathLabel,
		h1: join(h1),
		h2: join(h2),
		h3: join(h3),
		abstract,
		abstractSlug,
		body,
		headings,
		bodyParts,
		format,
		folder,
		displayTitle: pathLabel,
	};
}

export function buildSearchIndex(contentDir: string): SearchIndexFile {
	const tree = scanContent(contentDir);
	const files = flattenFiles(tree.children);
	const docs = files.map((f) => fileToDoc(contentDir, f));
	const formats: Record<string, number> = {};
	const folders: Record<string, number> = {};
	for (const d of docs) {
		formats[d.format] = (formats[d.format] || 0) + 1;
		// 计数 = 直接位于该目录的文件数（与筛选「最深目录必须勾选」一致）
		folders[d.folder] = (folders[d.folder] || 0) + 1;
	}
	// 补全祖先节点，便于树形展示（无直属文件时 count 为 0）
	for (const key of Object.keys(folders)) {
		for (const a of folderAncestors(key)) {
			if (folders[a] == null) folders[a] = 0;
		}
	}
	return {
		version: 4,
		engine: 'minisearch',
		generatedAt: new Date().toISOString(),
		docs,
		facets: { format: formats, folder: folders },
	};
}
