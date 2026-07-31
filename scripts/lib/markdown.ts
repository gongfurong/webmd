/**
 * 构建期 Markdown 渲染 — 逐行对齐「本地 Markdown 查看器」content.js
 * https://github.com/mutsuya117/local-markdown-viewer
 *
 * 插件管线：
 *   marked@17 + 自定义 heading/code renderer
 *   → marked.parse（hooks 内 hljs）
 *   → 危险标签整段转义为文本
 *   → DOMPurify.sanitize（GitHub 兼容标签表）
 *
 * WebMD 仅在 enhanceCodeBlocksHtml 增加类型栏+复制（消毒之后、可信 DOM）。
 */
import { Marked, Renderer, type Tokens } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'isomorphic-dompurify';
import type { TreeFile } from './scan';

/**
 * 插件 content.js generateSlug（github-slugger 简化实现，字符表一致）
 */
function generateSlug(text: string): string {
	if (!text) return '';
	return String(text)
		.toLowerCase()
		.trim()
		.replace(/[\x00-\x1f\x7f-\x9f]/g, '')
		// 句读・括弧・スラッシュ・コロン等；ハイフン/アンダースコアは保持
		.replace(/[!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~・（）「」『』【】]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function escapeHtml(s: string): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 反转 marked 对 code 的实体，等价浏览器 textContent */
function decodeHtmlEntities(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/gi, "'")
		.replace(/&amp;/g, '&');
}

/**
 * 每次 parse 新建 renderer + usedIds（与插件每次打开文件时状态一致）
 */
function createPluginMarked() {
	const usedIds = new Map<string, number>();
	const renderer = new Renderer();

	// 插件 renderer.heading（marked v13+ token 对象；slug 算法 = 插件 generateSlug）
	renderer.heading = function (this: Renderer, token: Tokens.Heading): string {
		const headingText = this.parser.parseInline(token.tokens);
		const headingLevel = token.depth;
		// 与插件：headingRaw = text.raw || text.text
		const headingRaw = token.raw || token.text || '';
		let slug = generateSlug(headingRaw);
		if (!slug) slug = 'section';
		if (usedIds.has(slug)) {
			const count = (usedIds.get(slug) || 0) + 1;
			usedIds.set(slug, count);
			slug = `${slug}-${count}`;
		} else {
			usedIds.set(slug, 0);
		}
		return `<h${headingLevel} id="${slug}">${headingText}</h${headingLevel}>\n`;
	};

	// 插件 mermaid：```mermaid → <div class="mermaid">，由客户端 mermaid.js 画成图
	const originalCode = renderer.code.bind(renderer);
	let mermaidCounter = 0;
	renderer.code = function (this: Renderer, token: Tokens.Code): string {
		const codeText = token.text ?? '';
		const codeLang = (token.lang || '').trim();
		if (codeLang === 'mermaid') {
			const id = `mermaid-source-${mermaidCounter++}`;
			// URI 编码单行属性，避免换行导致 DOMPurify 丢掉 data-mermaid-code
			const data = encodeURIComponent(codeText);
			return `<div class="mermaid" data-mermaid-id="${id}" data-mermaid-code="${data}">${escapeHtml(codeText)}</div>\n`;
		}
		return originalCode(token);
	};

	// 独立实例（每次 parse 新建，usedIds 与插件「每页」一致）
	const instance = new Marked();
	instance.use({
		renderer,
		gfm: true,
		breaks: true,
	});
	return instance;
}

/**
 * 插件 hooks.postprocess：querySelectorAll('pre code') + language-(\w+) / highlightAuto
 */
function highlightPreCodeBlocks(html: string): string {
	return html.replace(
		/<pre><code(?:\s+class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/gi,
		(_full, cls: string | undefined, body: string) => {
			let classes = (cls || '').trim();
			// 插件：className.match(/language-(\w+)/) —— 仅 \w
			const langMatch = classes.match(/language-(\w+)/);
			const text = decodeHtmlEntities(body);
			let out = body;
			try {
				if (langMatch) {
					const lang = langMatch[1]!;
					if (hljs.getLanguage(lang)) {
						out = hljs.highlight(text, { language: lang }).value;
						if (!/\bhljs\b/.test(classes)) {
							classes = classes ? `${classes} hljs` : 'hljs';
						}
					}
					// 指定了语言但 hljs 不认识：与插件一样不改
				} else if (text.trim()) {
					out = hljs.highlightAuto(text).value;
					if (!/\bhljs\b/.test(classes)) {
						classes = classes ? `${classes} hljs` : 'hljs';
					}
				}
			} catch {
				/* 失败保留 */
			}
			const classAttr = classes ? ` class="${classes}"` : '';
			return `<pre><code${classAttr}>${out}</code></pre>`;
		},
	);
}

/**
 * 插件：DOMPurify 前把危险标签「整段转义成文本」（GitHub 风格可见转义，而非直接删除）
 */
const DANGEROUS_TAGS = [
	'script',
	'iframe',
	'object',
	'embed',
	'style',
	'link',
	'form',
	'button',
	'select',
	'textarea',
	'option',
] as const;

function escapeDangerousTagsAsText(html: string): string {
	let out = html;
	for (const tag of DANGEROUS_TAGS) {
		const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
		const close = new RegExp(`</${tag}>`, 'gi');
		out = out.replace(open, (m) => escapeHtml(m));
		out = out.replace(close, (m) => escapeHtml(m));
	}
	return out;
}

/** 插件 DOMPurify.sanitize 配置（ALLOWED_TAGS / ATTR / URI） */
const PURIFY_CONFIG = {
	ALLOWED_TAGS: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'a',
		'ul',
		'ol',
		'li',
		'blockquote',
		'code',
		'pre',
		'strong',
		'em',
		'b',
		'i',
		'img',
		'table',
		'thead',
		'tbody',
		'tfoot',
		'tr',
		'th',
		'td',
		'div',
		'span',
		'br',
		'hr',
		'del',
		's',
		'ins',
		'input',
		'details',
		'summary',
		'kbd',
		'mark',
		'sub',
		'sup',
		'abbr',
		'cite',
		'q',
		'time',
		'dl',
		'dt',
		'dd',
		'u',
		'center',
	],
	ALLOWED_ATTR: [
		'href',
		'src',
		'alt',
		'class',
		'id',
		'align',
		'width',
		'height',
		'title',
		'type',
		'checked',
		'disabled',
		'target',
		'rel',
		'open',
		'datetime',
		'style',
		'clear',
		'colspan',
		'rowspan',
		'border',
		'cellpadding',
		'cellspacing',
		'dir',
		'lang',
		'name',
		'value',
		'cite',
		'abbr',
		// WebMD mermaid 重绘需要（插件用内存 Map；我们用 data-*）
		'data-mermaid-id',
		'data-mermaid-code',
	],
	ALLOW_DATA_ATTR: false,
	ALLOW_UNKNOWN_PROTOCOLS: false,
	ALLOWED_URI_REGEXP:
		/^(?:(?:(?:f|ht)tps?|mailto|tel|data|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * 插件 content.js：escape 危险标签 → DOMPurify + style 恶意值剥离
 */
function sanitizeLikePlugin(html: string): string {
	const rawHtml = escapeDangerousTagsAsText(html);

	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		// Node 环境无全局 Element；用 nodeType + hasAttribute
		if (!node || node.nodeType !== 1) return;
		const el = node as unknown as {
			hasAttribute: (n: string) => boolean;
			getAttribute: (n: string) => string | null;
			removeAttribute: (n: string) => void;
		};
		if (!el.hasAttribute('style')) return;
		const style = el.getAttribute('style') || '';
		if (
			/javascript:/i.test(style) ||
			/expression\(/i.test(style) ||
			/behavior:/i.test(style) ||
			/binding:/i.test(style) ||
			/@import/i.test(style)
		) {
			el.removeAttribute('style');
		}
	});

	try {
		return String(
			DOMPurify.sanitize(rawHtml, {
				ALLOWED_TAGS: [...PURIFY_CONFIG.ALLOWED_TAGS],
				ALLOWED_ATTR: [...PURIFY_CONFIG.ALLOWED_ATTR],
				ALLOW_DATA_ATTR: PURIFY_CONFIG.ALLOW_DATA_ATTR,
				ALLOW_UNKNOWN_PROTOCOLS: PURIFY_CONFIG.ALLOW_UNKNOWN_PROTOCOLS,
				ALLOWED_URI_REGEXP: PURIFY_CONFIG.ALLOWED_URI_REGEXP,
			}),
		);
	} finally {
		DOMPurify.removeAllHooks();
	}
}

/* ========== YAML frontmatter → 表格（插件 extractFrontmatter 同逻辑） ========== */

type FmScalar = { type: 'scalar'; text: string };
type FmList = { type: 'list'; items: string[] };
type FmMap = { type: 'map'; pairs: { key: string; value: FmValue }[] };
type FmValue = FmScalar | FmList | FmMap;

function stripFrontmatterQuotes(s: string): string {
	const t = s.trim();
	if (
		t.length >= 2 &&
		((t[0] === '"' && t[t.length - 1] === '"') ||
			(t[0] === "'" && t[t.length - 1] === "'"))
	) {
		return t.slice(1, -1);
	}
	return t;
}

function parseFrontmatterYaml(body: string): {
	pairs: { key: string; value: FmValue }[];
	clean: boolean;
} {
	const lines: { indent: number; content: string }[] = [];
	for (const raw of body.split(/\r?\n/)) {
		if (/^\s*$/.test(raw)) continue;
		if (/^\s*#/.test(raw)) continue;
		const indent = (raw.match(/^ */) || [''])[0].length;
		lines.push({ indent, content: raw.slice(indent) });
	}

	let pos = 0;
	let clean = true;

	function parseNodes(level: number): { key: string; value: FmValue }[] {
		const pairs: { key: string; value: FmValue }[] = [];
		while (pos < lines.length && lines[pos]!.indent === level) {
			const content = lines[pos]!.content;
			if (content === '-' || content.startsWith('- ')) break;
			const m = content.match(/^([^:]+):(?:\s+(.*))?$/);
			if (!m) {
				clean = false;
				pos++;
				continue;
			}
			const key = m[1]!.trim();
			const inline = m[2] || '';
			pos++;
			if (inline !== '') {
				pairs.push({
					key,
					value: { type: 'scalar', text: stripFrontmatterQuotes(inline) },
				});
				continue;
			}
			if (pos < lines.length && lines[pos]!.indent > level) {
				const childLevel = lines[pos]!.indent;
				const childContent = lines[pos]!.content;
				if (childContent === '-' || childContent.startsWith('- ')) {
					const items: string[] = [];
					while (
						pos < lines.length &&
						lines[pos]!.indent === childLevel &&
						(lines[pos]!.content === '-' || lines[pos]!.content.startsWith('- '))
					) {
						const itemText =
							lines[pos]!.content === '-' ? '' : lines[pos]!.content.slice(2);
						items.push(stripFrontmatterQuotes(itemText));
						pos++;
					}
					pairs.push({ key, value: { type: 'list', items } });
				} else {
					const childPairs = parseNodes(childLevel);
					pairs.push({ key, value: { type: 'map', pairs: childPairs } });
				}
			} else {
				pairs.push({ key, value: { type: 'scalar', text: '' } });
			}
		}
		return pairs;
	}

	const pairs = parseNodes(0);
	if (pos !== lines.length) clean = false;
	return { pairs, clean };
}

function renderFrontmatterValue(value: FmValue): string {
	if (value.type === 'scalar') return escapeHtml(value.text);
	if (value.type === 'list') {
		if (value.items.length === 0) return '';
		return (
			'<ul>' +
			value.items.map((it) => `<li>${escapeHtml(it)}</li>`).join('') +
			'</ul>'
		);
	}
	if (value.type === 'map') {
		if (value.pairs.length === 0) return '';
		return (
			'<table class="frontmatter-table">' +
			value.pairs
				.map(
					(p) =>
						`<tr><th>${escapeHtml(p.key)}</th><td>${renderFrontmatterValue(p.value)}</td></tr>`,
				)
				.join('') +
			'</table>'
		);
	}
	return '';
}

/** 插件 extractFrontmatter：仅当块可完整解析为 YAML 时才切出 */
export function extractFrontmatter(
	text: string,
): { html: string; rest: string } | null {
	const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!match) return null;
	const { pairs, clean } = parseFrontmatterYaml(match[1]!);
	if (!clean || pairs.length === 0) return null;
	const rows = pairs
		.map(
			(p) =>
				`<tr><th>${escapeHtml(p.key)}</th><td>${renderFrontmatterValue(p.value)}</td></tr>`,
		)
		.join('');
	const html = `<table class="frontmatter-table">${rows}</table>\n`;
	return { html, rest: text.slice(match[0].length) };
}

/**
 * 插件：在 marked 前保护 $$ / \[ \] / \( \) 显示/行内公式，
 * 避免 breaks:true 把多行 $$ 拆成 <br> 导致 KaTeX 失效。
 * 不保护 $...$（与插件一致，HTML 后再启发式转换）。
 */
function protectDisplayMath(md: string): {
	text: string;
	blocks: string[];
	disabled: string[];
} {
	const blocks: string[] = [];
	const disabled: string[] = [];
	let text = md;

	const protect = (re: RegExp, stripLen: number) => {
		text = text.replace(re, (match) => {
			const content = match.slice(stripLen, match.length - stripLen);
			if (!/[a-zA-Z0-9]/.test(content)) {
				const ph = `DISABLED_MATH_${disabled.length}_PLACEHOLDER`;
				disabled.push(match);
				return ph;
			}
			const ph = `MATH_BLOCK_${blocks.length}_PLACEHOLDER`;
			blocks.push(match);
			return ph;
		});
	};

	protect(/\$\$[\s\S]*?\$\$/g, 2);
	protect(/\\\[[\s\S]*?\\\]/g, 2);
	protect(/\\\([\s\S]*?\\\)/g, 2);

	return { text, blocks, disabled };
}

function restoreMathPlaceholders(
	html: string,
	blocks: string[],
	disabled: string[],
): string {
	let out = html;
	blocks.forEach((block, i) => {
		out = out.split(`MATH_BLOCK_${i}_PLACEHOLDER`).join(block);
	});
	disabled.forEach((block, i) => {
		out = out.split(`DISABLED_MATH_${i}_PLACEHOLDER`).join(block);
	});
	return out;
}

/** 插件等价 HTML（无复制栏）：frontmatter → 保护公式 → marked → hljs → 消毒 → 还原公式 */
export function renderMarkdown(source: string): string {
	let body = String(source ?? '');
	let frontHtml = '';
	const fm = extractFrontmatter(body);
	if (fm) {
		frontHtml = fm.html;
		body = fm.rest;
	}

	const { text: protectedBody, blocks, disabled } = protectDisplayMath(body);

	const m = createPluginMarked();
	let raw = m.parse(protectedBody, { async: false }) as string;
	raw = highlightPreCodeBlocks(raw);
	// 先消毒再还原公式，避免公式内特殊字符被误伤；公式来自源文经我们保护
	let cleaned = sanitizeLikePlugin(frontHtml + raw);
	cleaned = restoreMathPlaceholders(cleaned, blocks, disabled);
	return cleaned;
}

/** 兼容旧 API：createMarkdownIt().render(src) */
export function createMarkdownIt(_opts?: {
	html?: boolean;
	linkify?: boolean;
	typographer?: boolean;
}) {
	return {
		render: (src: string) => renderMarkdown(src),
	};
}

export function encodeContentUrl(pathFromContentRoot: string): string {
	return (
		'/content/' +
		String(pathFromContentRoot)
			.replace(/^\/+/, '')
			.split('/')
			.filter(Boolean)
			.map((seg) => encodeURIComponent(seg))
			.join('/')
	);
}

/**
 * 资源 URL 改写：
 * - /files/... → /content/...（starlight 遗留路径）
 * - 媒体标签 src 中的 /f/... 若像原始文件路径 → /content/...
 * - **Markdown 链接 /f/... 保持为预览页路由**（不要改成 raw）
 */
export function rewriteProjectAssetUrls(text: string): string {
	let s = String(text ?? '');
	// 遗留 /files/ → /content/
	s = s.replace(/(["'(])\/files\/([^"')\s>]+)/g, (_m, q: string, p: string) => {
		return q + encodeContentUrl(p);
	});
	s = s.replace(/\]\(\/files\/([^)]+)\)/g, (_m, p: string) => `](${encodeContentUrl(p)})`);

	// HTML 属性 src/href="/f/path.ext" → 对真实媒体文件用 /content/；保留尾斜杠预览路径
	s = s.replace(
		/(src|href)=(["'])\/f\/([^"']+)\2/gi,
		(_m, attr: string, quote: string, p: string) => {
			const clean = String(p).replace(/\/+$/, '');
			// 有预览页语义的链接（带尾斜杠或 .md）仍可指向 /f/；媒体直接用 content
			if (/\.(md|mdx)(\/)?$/i.test(clean)) {
				return `${attr}=${quote}/f/${p}${quote}`;
			}
			return `${attr}=${quote}${encodeContentUrl(decodeURIComponent(clean))}${quote}`;
		},
	);

	// Markdown 链接 [x](/f/...) 保持 /f/（全页预览路由）
	// 仅当目标是明确的 raw 资源且无尾斜杠、且写在 img 语法里时改写
	s = s.replace(/!\[([^\]]*)\]\(\/f\/([^)]+)\)/g, (_m, alt: string, p: string) => {
		const clean = decodeURIComponent(String(p).replace(/\/+$/, ''));
		return `![${alt}](${encodeContentUrl(clean)})`;
	});

	return s;
}

/** 相对路径 ./xx、../xx 改为 /content/<dir>/xx；.md 相对链改为站内页路由 */
export function rewriteRelativeToContent(mdSource: string, filePath: string): string {
	const dir = filePath.includes('/') ? filePath.replace(/\/[^/]+$/, '') : '';
	return mdSource.replace(
		/(!?\[[^\]]*\]\()(\.[^)\s]+)(\))|(src|href)=(["'])(\.[^"']+)\5/g,
		(full, g1, relMd, g3, attr, quote, relHtml) => {
			const rel = relMd || relHtml;
			if (!rel || !rel.startsWith('.')) return full;
			const joined = pathPosixResolve(dir, rel);
			// 相对 .md 链接 → 页面路径
			if (g1 && !String(g1).startsWith('!') && /\.(md|mdx)$/i.test(joined)) {
				const noExt = joined.replace(/\.(md|mdx)$/i, '');
				const page =
					noExt === 'index'
						? '/'
						: '/' + noExt.split('/').map(encodeURIComponent).join('/') + '/';
				return `${g1}${page}${g3}`;
			}
			const abs = encodeContentUrl(joined);
			if (g1) return `${g1}${abs}${g3}`;
			return `${attr}=${quote}${abs}${quote}`;
		},
	);
}

function pathPosixResolve(fromDir: string, rel: string): string {
	const base = fromDir ? fromDir.split('/') : [];
	const parts = rel.split('/');
	for (const p of parts) {
		if (p === '.' || p === '') continue;
		if (p === '..') base.pop();
		else base.push(p);
	}
	return base.join('/');
}

function escAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;');
}

function formatBytes(n: number): string {
	if (!Number.isFinite(n) || n < 0) return '';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const MIME: Record<string, string> = {
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	m4a: 'audio/mp4',
	mp4: 'video/mp4',
	webm: 'video/webm',
	ogv: 'video/ogg',
	mov: 'video/quicktime',
	pdf: 'application/pdf',
};

/**
 * 正文区只渲染预览内容，不重复路径/文件名/大小。
 * 路径与大小统一由顶部 breadcrumb 展示。
 */
export function wrapAsMarkdown(
	file: TreeFile,
	rawText: string,
	_opts?: { bytes?: number },
): string {
	const title = file.name;
	const mime = MIME[file.ext] || '';

	switch (file.kind) {
		case 'markdown': {
			let s = rewriteProjectAssetUrls(rawText);
			s = rewriteRelativeToContent(s, file.path);
			return s;
		}
		case 'image':
			// 全页媒体舞台：比例不变，适应可视高度（非 markdown 包裹）
			return `<div class="media-stage media-stage--image" data-media-kind="image">
<img class="media-solo" src="${escAttr(file.url)}" alt="${escAttr(title)}" loading="eager" decoding="async" />
</div>`;
		case 'video':
			return `<div class="media-stage media-stage--video" data-media-kind="video">
<video class="media-solo media-video" controls preload="metadata" playsinline${mime ? ` data-mime="${escAttr(mime)}"` : ''}>
<source src="${escAttr(file.url)}"${mime ? ` type="${escAttr(mime)}"` : ''} />
你的浏览器不支持 HTML5 视频，请<a href="${escAttr(file.url)}">下载文件</a>。
</video>
</div>`;
		case 'audio':
			return `<div class="media-stage media-stage--audio" data-media-kind="audio">
<audio class="media-audio" controls preload="metadata">
<source src="${escAttr(file.url)}"${mime ? ` type="${escAttr(mime)}"` : ''} />
你的浏览器不支持 HTML5 音频，请<a href="${escAttr(file.url)}">下载文件</a>。
</audio>
</div>`;
		case 'pdf':
			// 与 starlight PdfEmbed 一致：纯 pdf-shell，base64 → Blob iframe
			return `<div class="pdf-shell" data-pdf-name="${escAttr(title)}" data-pdf-src="${escAttr(file.url)}">
<script type="application/pdf-base64"></script>
<div class="pdf-status" data-pdf-status>正在准备 PDF 预览…</div>
<iframe class="pdf-frame" title="${escAttr(title)}" data-pdf-frame hidden></iframe>
<div class="pdf-error" data-pdf-err hidden></div>
</div>
`;
		case 'text': {
			const lang = file.ext || 'text';
			const body = rawText ?? '';
			// 文本/代码：仅内容，无路径/文件名/大小（统一在顶部路径栏）
			return `\`\`\`${lang}\n${body}\n\`\`\`\n`;
		}
		default:
			return `暂无内置预览，请[下载](${file.url})。\n`;
	}
}

/** 供 breadcrumb 等展示用 */
export { formatBytes };

export type Heading = { depth: number; id: string; text: string };

export function extractHeadings(html: string): Heading[] {
	const heads: Heading[] = [];
	const re = /<h([1-6])\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const text = m[3]
			.replace(/<[^>]+>/g, '')
			.replace(/^#\s*/, '')
			.trim();
		heads.push({ depth: Number(m[1]), id: m[2], text });
	}
	return heads;
}

const LANG_LABEL: Record<string, string> = {
	python: 'Python',
	py: 'Python',
	javascript: 'JavaScript',
	js: 'JavaScript',
	typescript: 'TypeScript',
	ts: 'TypeScript',
	json: 'JSON',
	bash: 'Shell',
	sh: 'Shell',
	css: 'CSS',
	html: 'HTML',
	xml: 'XML',
	txt: 'TXT',
	text: 'TXT',
	yaml: 'YAML',
	yml: 'YAML',
	md: 'Markdown',
	markdown: 'Markdown',
	csv: 'CSV',
	tsx: 'TSX',
	jsx: 'JSX',
};

/** 代码栏图标（与路径栏复制按钮同系 stroke 图标） */
const CODE_ICON_COPY = `<svg class="webmd-code__icon webmd-code__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CODE_ICON_CHECK = `<svg class="webmd-code__icon webmd-code__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * 唯一 WebMD 增量：title 栏（语言类型）+ 图标复制按钮。
 * 不改 pre/code 内部结构与 class（保持插件/GitHub 渲染）。
 */
export function enhanceCodeBlocksHtml(html: string): string {
	return html.replace(
		/<pre(\s[^>]*)?>([\s\S]*?)<\/pre>/gi,
		(_full, attrs: string | undefined, inner: string) => {
			const langMatch = String(inner).match(
				/class="[^"]*(?:language|lang)-([a-z0-9_+-]+)/i,
			);
			const lang = (langMatch?.[1] || 'text').toLowerCase();
			const label = LANG_LABEL[lang] || (lang === 'text' ? 'Code' : lang.toUpperCase());
			const preAttrs = attrs ?? '';
			return (
				`<div class="webmd-code">` +
				`<div class="webmd-code__bar" role="toolbar" aria-label="代码：${label}">` +
				`<div class="webmd-code__meta">` +
				`<span class="webmd-code__dots" aria-hidden="true"><span></span><span></span><span></span></span>` +
				`<span class="webmd-code__title">${label}</span>` +
				`</div>` +
				`<button type="button" class="webmd-code__copy" title="复制代码" aria-label="复制代码">${CODE_ICON_COPY}${CODE_ICON_CHECK}</button>` +
				`</div>` +
				`<pre${preAttrs}>${inner}</pre>` +
				`</div>`
			);
		},
	);
}
