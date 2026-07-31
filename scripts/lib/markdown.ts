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
import path from 'node:path';
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
		// 文内嵌入音视频（Markdown 里写 HTML5）
		'video',
		'audio',
		'source',
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
		// video / audio
		'controls',
		'preload',
		'poster',
		'playsinline',
		'webkit-playsinline',
		'loop',
		'muted',
		'autoplay',
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
 * PDF.js 阅读器壳（真 PDF 页 / Office 转出的 preview.pdf 共用）
 * @param previewSrc 预览 PDF 的 /content/... URL（嵌入 base64 时仍作 fallback fetch）
 * @param downloadHref 工具栏「下载」：真 PDF 用自身；Office 用原 docx/xlsx/pptx
 * @param downloadName 下载文件名
 */
export function renderPdfViewerShell(opts: {
	title: string;
	previewSrc: string;
	downloadHref: string;
	downloadName?: string;
	/** 原 Office 文件 URL；有则 data-office-src，下载走原件 */
	officeSrc?: string;
}): string {
	const previewSrc = escAttr(opts.previewSrc);
	const downloadHref = escAttr(opts.downloadHref);
	const downloadName = escAttr(opts.downloadName || opts.title);
	const officeAttr = opts.officeSrc
		? ` data-office-src="${escAttr(opts.officeSrc)}"`
		: '';
	const dlTitle = opts.officeSrc ? '下载原文件' : '下载 PDF';
	return `<div class="pdf-shell" data-pdf-name="${downloadName}" data-pdf-src="${previewSrc}"${officeAttr}>
<script type="application/pdf-base64"></script>
<div class="pdf-status" data-pdf-status>正在准备 PDF 预览…</div>
<div class="pdf-viewer" data-pdf-viewer hidden>
  <div class="pdf-toolbar" role="toolbar" aria-label="PDF 工具栏">
    <button type="button" class="pdf-tb-btn" data-pdf-toggle-thumbs title="分页导航" aria-label="分页导航" aria-pressed="false">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="5" rx="1"/><rect x="14" y="11" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="3" rx="1"/></svg>
    </button>
    <span class="pdf-tb-sep" aria-hidden="true"></span>
    <button type="button" class="pdf-tb-btn" data-pdf-prev title="上一页" aria-label="上一页">‹</button>
    <label class="pdf-page-jump">
      <input type="number" class="pdf-page-input" data-pdf-page min="1" value="1" inputmode="numeric" aria-label="页码" />
      <span class="pdf-page-of">/</span>
      <span data-pdf-pages>1</span>
    </label>
    <button type="button" class="pdf-tb-btn" data-pdf-next title="下一页" aria-label="下一页">›</button>
    <span class="pdf-tb-sep" aria-hidden="true"></span>
    <button type="button" class="pdf-tb-btn" data-pdf-zoom-out title="缩小" aria-label="缩小">−</button>
    <span class="pdf-zoom-label" data-pdf-zoom-label>100%</span>
    <button type="button" class="pdf-tb-btn" data-pdf-zoom-in title="放大" aria-label="放大">+</button>
    <button type="button" class="pdf-tb-btn pdf-tb-text" data-pdf-fit title="适应宽度" aria-label="适应宽度">宽</button>
    <span class="pdf-tb-spacer"></span>
    <a class="pdf-tb-btn pdf-tb-text" data-pdf-download href="${downloadHref}" download="${downloadName}" title="${escAttr(dlTitle)}">下载</a>
  </div>
  <div class="pdf-body">
    <aside class="pdf-thumbs" data-pdf-thumbs-pane hidden aria-label="页面缩略图">
      <div class="pdf-thumbs-list" data-pdf-thumbs-list></div>
    </aside>
    <div class="pdf-pages" data-pdf-pages-scroll tabindex="0" role="region" aria-label="PDF 页面"></div>
  </div>
</div>
<div class="pdf-error" data-pdf-err hidden></div>
</div>
`;
}

/** 扩展名 → 人类可读类型（统一下载卡用） */
const FILE_TYPE_LABEL: Record<string, string> = {
	docx: 'Word 文档',
	doc: 'Word 文档（旧格式）',
	xlsx: 'Excel 表格',
	xls: 'Excel 表格（旧格式）',
	pptx: 'PowerPoint 演示文稿',
	ppt: 'PowerPoint（旧格式）',
	odt: 'OpenDocument 文本',
	ods: 'OpenDocument 表格',
	odp: 'OpenDocument 演示',
	rtf: 'RTF 文档',
	zip: '压缩包',
	'7z': '压缩包',
	rar: '压缩包',
	gz: '压缩包',
	tar: '压缩包',
	exe: '可执行文件',
	dll: '动态库',
	wasm: 'WebAssembly',
	bin: '二进制文件',
	dat: '数据文件',
	iso: '镜像文件',
	dmg: '磁盘镜像',
	apk: 'Android 安装包',
	ipa: 'iOS 应用包',
	// 图示 / 建模（当前无专用预览 → 统一下载卡）
	puml: 'PlantUML 图',
	plantuml: 'PlantUML 图',
	uml: 'UML 模型',
	drawio: 'diagrams.net 图',
	dio: 'diagrams.net 图',
	xmind: 'XMind 思维导图',
	mm: 'FreeMind 思维导图',
	mindnode: 'MindNode 导图',
	vsdx: 'Visio 图',
};

/**
 * 无法在线预览时的统一展示卡（所有 kind=file / 缺预览资源共用）。
 * 始终提供下载原文件；可选「在新标签打开」直链。
 */
export function renderUnsupportedFileCard(opts: {
	name: string;
	url: string;
	ext?: string;
	bytes?: number;
	/** 额外说明（缺省用通用文案） */
	hint?: string;
}): string {
	const ext = (opts.ext || path.extname(opts.name) || '')
		.toLowerCase()
		.replace(/^\./, '');
	const badge = (ext || 'FILE').toUpperCase();
	const label =
		FILE_TYPE_LABEL[ext] || (ext ? `${ext.toUpperCase()} 文件` : '未知类型文件');
	const size =
		opts.bytes != null && Number.isFinite(opts.bytes)
			? formatBytes(opts.bytes)
			: '';
	const hint =
		opts.hint ||
		'此类型暂不支持在浏览器内预览。你可以下载到本地后用对应应用打开。';

	const metaParts = [
		ext ? `.${ext}` : '',
		size,
		'可下载',
	].filter(Boolean);

	return `<div class="file-unsupported" data-file-ext="${escAttr(ext || 'file')}">
  <div class="file-unsupported__badge">${escAttr(badge)}</div>
  <h2 class="file-unsupported__title">${escAttr(label)}</h2>
  <p class="file-unsupported__name" title="${escAttr(opts.name)}">${escAttr(opts.name)}</p>
  <p class="file-unsupported__meta">${escAttr(metaParts.join(' · '))}</p>
  <p class="file-unsupported__desc">${escAttr(hint)}</p>
  <div class="file-unsupported__actions">
    <a class="file-unsupported__dl" href="${escAttr(opts.url)}" download="${escAttr(opts.name)}">下载文件</a>
    <a class="file-unsupported__open" href="${escAttr(opts.url)}" target="_blank" rel="noopener noreferrer">打开原文件</a>
  </div>
</div>
`;
}

/**
 * 正文区只渲染预览内容，不重复路径/文件名/大小。
 * 路径与大小统一由顶部 breadcrumb 展示。
 *
 * @param opts.officePreviewUrl 若 Office 已有 preview.pdf，则渲染 PDF 阅读器
 * @param opts.excelCsvHtml 若 Excel 已导出 CSV，则渲染表格预览 HTML
 */
export function wrapAsMarkdown(
	file: TreeFile,
	rawText: string,
	_opts?: {
		bytes?: number;
		officePreviewUrl?: string | null;
		excelCsvHtml?: string | null;
	},
): string {
	const title = file.name;
	const mime = MIME[file.ext] || '';
	const officePreviewUrl = _opts?.officePreviewUrl || null;
	const excelCsvHtml = _opts?.excelCsvHtml || null;

	switch (file.kind) {
		case 'markdown': {
			let s = rewriteProjectAssetUrls(rawText);
			s = rewriteRelativeToContent(s, file.path);
			return s;
		}
		case 'image':
			// 全页媒体舞台：比例不变，适应可视高度（非 markdown 包裹）
			// SVG 与位图同走 img；宽屏/窄屏均依赖 .media-stage 最小高度兜底
			return `<div class="media-stage media-stage--image" data-media-kind="image">
<img class="media-solo" src="${escAttr(file.url)}" alt="${escAttr(title)}" loading="eager" decoding="async" />
</div>`;
		case 'video': {
			// #t=0.001：多数浏览器会解码该时刻作初始画面（预览）；下载链仍用无 fragment 的 url
			const src = file.url;
			const previewSrc = `${src}#t=0.001`;
			return `<div class="media-stage media-stage--video" data-media-kind="video">
<video class="media-solo media-video" controls preload="auto" playsinline webkit-playsinline${mime ? ` data-mime="${escAttr(mime)}"` : ''}>
<source src="${escAttr(previewSrc)}"${mime ? ` type="${escAttr(mime)}"` : ''} />
你的浏览器不支持 HTML5 视频，请<a href="${escAttr(src)}">下载文件</a>。
</video>
</div>`;
		}
		case 'audio':
			return `<div class="media-stage media-stage--audio" data-media-kind="audio">
<audio class="media-audio" controls preload="metadata">
<source src="${escAttr(file.url)}"${mime ? ` type="${escAttr(mime)}"` : ''} />
你的浏览器不支持 HTML5 音频，请<a href="${escAttr(file.url)}">下载文件</a>。
</audio>
</div>`;
		case 'pdf':
			return renderPdfViewerShell({
				title,
				previewSrc: file.url,
				downloadHref: file.url,
				downloadName: title,
			});
		case 'text': {
			// CSV 表 HTML 由 render-page 直接注入（opts 里不走本分支的 markdown）
			const lang = file.ext || 'text';
			const body = rawText ?? '';
			return `\`\`\`${lang}\n${body}\n\`\`\`\n`;
		}
		default: {
			const ext = (file.ext || '').toLowerCase().replace(/^\./, '');
			// Excel：有导出 CSV 时用表格预览 HTML
			if (
				['xlsx', 'xls', 'ods'].includes(ext) &&
				excelCsvHtml &&
				!excelCsvHtml.includes('file-unsupported')
			) {
				return excelCsvHtml;
			}
			// Word/PPT：有 preview.pdf → PDF.js
			const officePdfLike = [
				'docx',
				'doc',
				'pptx',
				'ppt',
				'odt',
				'odp',
				'rtf',
			].includes(ext);
			if (officePdfLike && officePreviewUrl) {
				return renderPdfViewerShell({
					title,
					previewSrc: officePreviewUrl,
					downloadHref: file.url,
					downloadName: title,
					officeSrc: file.url,
				});
			}
			// 其余（含未导出 CSV 的 Excel、缺 PDF 的 Word/PPT、zip…）：统一下载卡
			return renderUnsupportedFileCard({
				name: file.name,
				url: file.url,
				ext,
				bytes: _opts?.bytes,
			});
		}
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
