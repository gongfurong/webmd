/**
 * 静态页 HTML 壳 — 对齐 starlight-vanilla：
 * [nav | gutter | center[main | gutter | toc]]
 * 中栏正文滚动，底部分页固定
 */
import site from '../../site.config';
import type { Heading } from './markdown';
import type { TreeFile, TreeNode } from './scan';
import { pageHref } from './scan';

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const FAVICON =
	'data:image/svg+xml,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#3578e5"/><text x="50" y="68" text-anchor="middle" font-size="48" font-family="system-ui,sans-serif" font-weight="700" fill="#fff">MD</text></svg>`,
	);

/** 同层类型分组：mixed 不分组；files-first 文件在上；dirs-first 文件夹在上 */
export type TreeGroupMode = 'mixed' | 'files-first' | 'dirs-first';

/** 每层：先按类型分组（可选），再按文件名升/降 */
function sortTreeLevel(
	list: TreeNode[],
	order: 'asc' | 'desc',
	group: TreeGroupMode,
): TreeNode[] {
	const dir = order === 'asc' ? 1 : -1;
	const byName = (a: TreeNode, b: TreeNode) => {
		const c = a.name.localeCompare(b.name, 'zh-CN', {
			numeric: true,
			sensitivity: 'base',
		});
		return c * dir;
	};
	const rank = (n: TreeNode) => {
		if (group === 'mixed') return 0;
		const isDir = n.type === 'dir' ? 1 : 0;
		// files-first：文件 0、目录 1；dirs-first：目录 0、文件 1
		return group === 'files-first' ? isDir : 1 - isDir;
	};
	return [...list]
		.sort((a, b) => {
			const dr = rank(a) - rank(b);
			if (dr !== 0) return dr;
			return byName(a, b);
		})
		.map((n) =>
			n.type === 'dir'
				? {
						...n,
						children: sortTreeLevel(n.children || [], order, group),
					}
				: n,
		);
}

/**
 * 左侧树：
 * - 顶部「文件」+ 名序升降 + 类型分组（混/文上/夹上）
 * - content/index.md 普通 md，路由 /index/
 * - 仅展开当前路径祖先目录
 */
export function renderTreeHtml(
	nodes: TreeNode[],
	activePath: string,
	opts?: { sort?: 'asc' | 'desc'; group?: TreeGroupMode },
): string {
	const sortOrder = opts?.sort === 'desc' ? 'desc' : 'asc';
	const groupMode: TreeGroupMode =
		opts?.group === 'files-first' || opts?.group === 'dirs-first'
			? opts.group
			: 'mixed';

	function isAncestorDir(dirPath: string): boolean {
		if (!dirPath) return true;
		const prefix = dirPath + '/';
		return activePath === dirPath || activePath.startsWith(prefix);
	}

	/**
	 * Windows 11 资源管理器风格（Fluent）：
	 * - 文件夹：金黄圆角 + 标签页；闭合/展开两态
	 * - 文件：白页折角 + 类型色条/符号（MD/PDF/图/视/音）
	 */
	const iconFolder = `<span class="tree-icon tree-icon--folder" aria-hidden="true">
		<svg class="tree-icon__svg tree-icon__folder-closed" width="18" height="18" viewBox="0 0 20 20" fill="none">
			<path class="tree-icon__folder-back" d="M2.4 5.1C2.4 4.22 3.12 3.5 4 3.5h3.35c.28 0 .55.1.76.28l1.05.9c.2.18.47.28.75.28H16c.88 0 1.6.72 1.6 1.6v.72H2.4V5.1Z"/>
			<path class="tree-icon__folder-body" d="M2.25 7.1h15.5c.55 0 1 .45 1 1v7.15c0 .97-.78 1.75-1.75 1.75H3c-.97 0-1.75-.78-1.75-1.75V8.1c0-.55.45-1 1-1Z"/>
			<path class="tree-icon__folder-gloss" d="M3.35 8.35h13.3c.33 0 .6.27.6.6v5.85c0 .5-.4.9-.9.9H3.65c-.5 0-.9-.4-.9-.9V8.95c0-.33.27-.6.6-.6Z"/>
		</svg>
		<svg class="tree-icon__svg tree-icon__folder-open" width="18" height="18" viewBox="0 0 20 20" fill="none">
			<path class="tree-icon__folder-back" d="M2.15 5.55c0-.75.61-1.35 1.35-1.35h3.05c.25 0 .49.09.68.25l.95.8c.19.16.43.25.68.25H15.4c.75 0 1.35.6 1.35 1.35v1.05H2.15V5.55Z"/>
			<path class="tree-icon__folder-tab" d="M1.9 8.35h16.2c.44 0 .76.42.66.84l-1.55 6.35c-.14.58-.66.98-1.26.98H4.05c-.6 0-1.12-.4-1.26-.98L1.24 9.19c-.1-.42.22-.84.66-.84Z"/>
			<path class="tree-icon__folder-body" d="M2.55 8.55h14.9l-1.35 5.55c-.08.34-.39.55-.74.55H4.64c-.35 0-.66-.21-.74-.55L2.55 8.55Z"/>
			<path class="tree-icon__folder-gloss" d="M3.55 9.45h12.9l-1.05 4.3c-.05.2-.23.35-.44.35H5.04c-.21 0-.39-.15-.44-.35l-1.05-4.3Z"/>
		</svg>
	</span>`;

	/* 通用文档底：圆角白页 + 右上折角 + 顶色条 */
	const fileDocBase = `
		<path class="tree-icon__page" d="M4 1.5C4 1.22 4.22 1 4.5 1h5.59c.27 0 .52.1.71.29l3.41 3.41c.19.19.29.44.29.71V13.5c0 .83-.67 1.5-1.5 1.5h-8A1.5 1.5 0 0 1 4 13.5V1.5Z"/>
		<path class="tree-icon__fold" d="M10.25 1.1v2.9c0 .41.34.75.75.75h2.9"/>
		<path class="tree-icon__stripe" d="M5.35 5.45h5.9" stroke-linecap="round"/>`;

	const iconFile = (kind: string): string => {
		const k = esc(kind);
		const glyph: Record<string, string> = {
			markdown: `${fileDocBase}<text class="tree-icon__badge" x="8.5" y="11.9" text-anchor="middle" font-size="4.6" font-weight="700" font-family="Segoe UI,system-ui,sans-serif">MD</text>`,
			text: `${fileDocBase}<path class="tree-icon__glyph" d="M5.5 7.9h5.5M5.5 9.85h5.5M5.5 11.8h3.6" stroke-linecap="round"/>`,
			image: `
				<path class="tree-icon__frame" d="M2.5 2.75A1.25 1.25 0 0 1 3.75 1.5h8.5A1.25 1.25 0 0 1 13.5 2.75v10.5A1.25 1.25 0 0 1 12.25 14.5h-8.5A1.25 1.25 0 0 1 2.5 13.25V2.75Z"/>
				<circle class="tree-icon__glyph-fill" cx="5.85" cy="5.6" r="1.2"/>
				<path class="tree-icon__glyph-fill" d="M3.35 12.85 6 9.55a.7.7 0 0 1 1.08 0l1.15 1.35 1.7-2.15a.7.7 0 0 1 1.12 0l2.1 2.65v1.45H3.35Z"/>`,
			video: `
				<path class="tree-icon__frame" d="M2.35 3.5A1.25 1.25 0 0 1 3.6 2.25h8.8A1.25 1.25 0 0 1 13.65 3.5v9A1.25 1.25 0 0 1 12.4 13.75H3.6A1.25 1.25 0 0 1 2.35 12.5v-9Z"/>
				<path class="tree-icon__glyph-fill" d="M6.45 5.55a.7.7 0 0 1 1.06-.6l3.7 2.2a.7.7 0 0 1 0 1.2l-3.7 2.2a.7.7 0 0 1-1.06-.6V5.55Z"/>`,
			audio: `
				<path class="tree-icon__frame" d="M2.75 2.5A1 1 0 0 1 3.75 1.5h8.5A1 1 0 0 1 13.25 2.5v11a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-11Z"/>
				<path class="tree-icon__glyph-fill" d="M7.6 4.2a.55.55 0 0 1 .55.55v5.85a1.65 1.65 0 1 1-1.1-1.55V4.75A.55.55 0 0 1 7.6 4.2Z"/>
				<path class="tree-icon__glyph" d="M10.15 6.1a2.55 2.55 0 0 1 0 3.8M11.65 4.85a4.1 4.1 0 0 1 0 6.3" stroke-linecap="round"/>`,
			pdf: `${fileDocBase}<text class="tree-icon__badge" x="8.5" y="12" text-anchor="middle" font-size="3.8" font-weight="800" font-family="Segoe UI,system-ui,sans-serif">PDF</text>`,
			file: `${fileDocBase}<path class="tree-icon__glyph" d="M5.5 8.4h5.5M5.5 10.4h4" stroke-linecap="round"/>`,
			// 侧栏按 ext 着色时也会用 tree-icon--docx 等 class（见 renderTree 调用）
			docx: `${fileDocBase}<text class="tree-icon__badge" x="8.5" y="12" text-anchor="middle" font-size="3.4" font-weight="800" font-family="Segoe UI,system-ui,sans-serif">W</text>`,
			xlsx: `${fileDocBase}<text class="tree-icon__badge" x="8.5" y="12" text-anchor="middle" font-size="3.4" font-weight="800" font-family="Segoe UI,system-ui,sans-serif">X</text>`,
			pptx: `${fileDocBase}<text class="tree-icon__badge" x="8.5" y="12" text-anchor="middle" font-size="3.4" font-weight="800" font-family="Segoe UI,system-ui,sans-serif">P</text>`,
		};
		const inner = glyph[kind] || glyph.file!;
		return `<span class="tree-icon tree-icon--file tree-icon--${k}" aria-hidden="true"><svg class="tree-icon__svg" width="18" height="18" viewBox="0 0 16 16" fill="none">${inner}</svg></span>`;
	};

	/** 本层直接文件数（不含子目录内） */
	function countDirectFiles(node: TreeNode): number {
		if (node.type !== 'dir') return 1;
		let n = 0;
		for (const c of node.children || []) {
			if (c.type === 'file') n += 1;
		}
		return n;
	}

	/** 目录下可导航文件数（递归，含子目录） */
	function countFiles(node: TreeNode): number {
		if (node.type !== 'dir') return 1;
		let n = 0;
		for (const c of node.children || []) n += countFiles(c);
		return n;
	}

	function walk(list: TreeNode[]): string {
		let html = '';
		for (const n of sortTreeLevel(list, sortOrder, groupMode)) {
			if (n.type === 'dir') {
				const onPath = isAncestorDir(n.path);
				const open = onPath ? ' open' : '';
				const pathCls = onPath ? ' is-on-path' : '';
				const direct = countDirectFiles(n);
				const total = countFiles(n);
				const hasSubdirs = (n.children || []).some((c) => c.type === 'dir');
				// 有子文件夹：(当前/总数)；否则只显示当前
				const countText = hasSubdirs
					? `(${direct}/${total})`
					: `(${direct})`;
				const countTitle = hasSubdirs
					? '本层文件数 / 含子目录共'
					: '本层文件数';
				html += `<details class="tree-dir${pathCls}" data-path="${esc(n.path)}" data-sort-name="${esc(n.name)}" data-kind="dir"${open}><summary class="tree-dir__summary"><span class="tree-dir__main">${iconFolder}<span class="tree-label">${esc(n.name)}</span><span class="tree-count" title="${countTitle}">${countText}</span></span><span class="tree-chevron" aria-hidden="true"></span></summary><div class="tree-children" data-tree-level>`;
				html += walk(n.children || []);
				html += `</div></details>`;
			} else {
				const href = pageHref(n);
				const active = n.path === activePath ? ' is-active' : '';
				const iconKey =
					n.kind === 'file' &&
					['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'].includes(
						(n.ext || '').toLowerCase().replace(/^\./, ''),
					)
						? (n.ext || '').toLowerCase().replace(/^\./, '')
						: n.kind;
				html += `<a class="tree-file${active}" href="${href}" title="${esc(n.path)}" data-path="${esc(n.path)}" data-sort-name="${esc(n.name)}" data-kind="${esc(n.kind)}">${iconFile(iconKey)}<span class="tree-label">${esc(n.name)}</span></a>`;
			}
		}
		return html;
	}

	/* 「文件」展开态：叠放文档（与收起态单页图标不同） */
	const homeIcon = `<span class="tree-home__icon" data-pane-state="expanded" aria-hidden="true"><svg class="tree-home__svg tree-home__svg--open" width="22" height="22" viewBox="0 0 24 24" fill="none"><path class="tree-home__sheet tree-home__sheet--back" d="M6 4.5A2 2 0 0 1 8 2.5h6.2c.4 0 .78.16 1.06.44l3.3 3.3c.28.28.44.66.44 1.06V16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4.5Z"/><path class="tree-home__fold" d="M14.5 2.7v3.3c0 .55.45 1 1 1h3.3"/><path class="tree-home__sheet tree-home__sheet--front" d="M4 7.5A2 2 0 0 1 6 5.5h.8V17c0 1.38 1.12 2.5 2.5 2.5H17c.55 0 1 .45 1 1s-.45 1-1 1H9.3A4.3 4.3 0 0 1 5 17.2V7.5Z"/><path class="tree-home__lines" d="M9.2 11h6.6M9.2 14h5.2" stroke-linecap="round"/></svg></span>`;
	const home = `<div class="tree-home" title="文件" aria-label="文件">${homeIcon}<span class="tree-home__label">文件</span></div>`;
	const sortBtn = `<button type="button" class="tree-sort-btn" data-tree-sort data-order="${sortOrder}" title="${sortOrder === 'asc' ? '文件名升序（点击切换降序）' : '文件名降序（点击切换升序）'}" aria-label="文件树排序：${sortOrder === 'asc' ? '升序' : '降序'}">
		<span class="tree-sort-btn__label">名序</span>
		<svg class="tree-sort-btn__arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10"/><path d="M4.5 6.5 8 3l3.5 3.5"/></svg>
	</button>`;
	// 单开/多开切换；默认单开（手风琴）。精确状态由客户端 localStorage 同步
	const accordionBtn = `<button type="button" class="tree-accordion-btn is-on" data-tree-accordion data-on="1" title="单开：同层只展开一个文件夹（点击切换为多开）" aria-label="文件夹展开：单开" aria-pressed="true"><span class="tree-accordion-btn__label">单开</span></button>`;
	// 三态短文案更清晰：混=纯名序；文=文件在上；夹=文件夹在上
	const groupLabel =
		groupMode === 'files-first' ? '文上' : groupMode === 'dirs-first' ? '夹上' : '混排';
	const groupTitle =
		groupMode === 'files-first'
			? '同层：文件在上、文件夹在下（点击切换）'
			: groupMode === 'dirs-first'
				? '同层：文件夹在上、文件在下（点击切换）'
				: '同层：不按类型，纯按文件名（点击切换）';
	const groupBtn = `<button type="button" class="tree-group-btn" data-tree-group data-mode="${groupMode}" title="${groupTitle}" aria-label="类型排序：${groupLabel}">${groupLabel}</button>`;

	// 收起在标题栏最右（滚到底/顶在其左侧）
	const collapseTop = `<button type="button" class="pane-collapse-btn pane-collapse-btn--nav" data-wiki-toggle="nav" data-wiki-header-collapse="nav" title="收起文件栏" aria-label="收起文件栏"><span aria-hidden="true">«</span></button>`;
	return `<div class="tree-top">
		<div class="pane-title-group">${home}</div>
		<div class="pane-title-tools">${sortBtn}${accordionBtn}${groupBtn}</div>
		<div class="pane-title-end">${renderScrollEdgeBtns('nav')}${collapseTop}</div>
	</div><div class="tree-body thin-scrollbar" data-tree-level>${walk(nodes)}</div>`;
}

export function renderTocHtml(headings: Heading[]): string {
	if (!headings.length) {
		return `<div class="toc-empty">本页暂无大纲</div>`;
	}
	return headings
		.map(
			(h) =>
				`<a class="depth-${h.depth}" href="#${esc(h.id)}">${esc(h.text)}</a>`,
		)
		.join('');
}

export function renderInlineTocHtml(headings: Heading[]): string {
	if (!headings.length) return '';
	const items = headings
		.map(
			(h) =>
				`<a class="depth-${h.depth}" href="#${esc(h.id)}">${esc(h.text)}</a>`,
		)
		.join('');
	return `<details class="inline-toc">
  <summary class="inline-toc__summary">本页大纲</summary>
  <nav class="inline-toc__nav thin-scrollbar" aria-label="本页大纲（文内）">${items}</nav>
</details>`;
}

const KIND_LABEL: Record<string, string> = {
	markdown: 'Markdown',
	text: '文本',
	image: '图片',
	video: '视频',
	audio: '音频',
	pdf: 'PDF',
	file: '文件',
};

function formatBytesForCrumb(n: number): string {
	if (!Number.isFinite(n) || n < 0) return '';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const ICON_HOME = `<svg class="wiki-breadcrumb__home-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
/** 复制路径：链接图标（比双页复制更贴「路径/URL」） */
const ICON_DOWNLOAD = `<svg class="wiki-breadcrumb__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>`;
/** 回到顶部 / 滚到底部 */
const ICON_TO_TOP = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--to-top" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14"/><path d="m5 14 7-7 7 7"/><path d="M12 7v12"/></svg>`;
const ICON_TO_BOTTOM = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--to-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v12"/><path d="m5 10 7 7 7-7"/><path d="M5 19h14"/></svg>`;

type ScrollPaneTarget = 'main' | 'nav' | 'toc';

function scrollPaneSelector(target: ScrollPaneTarget): string {
	if (target === 'nav') return '.tree-body';
	if (target === 'toc') return '#doc-toc';
	return "[data-wiki-scroll],.center-scroll";
}

/**
 * 滚到底 + 回到顶（顺序：底在前、顶在后）。
 * target: main=中间正文 | nav=左侧文件树 | toc=右侧大纲
 */
function renderScrollEdgeBtns(target: ScrollPaneTarget = 'main'): string {
	const sel = scrollPaneSelector(target);
	const topLabel =
		target === 'nav' ? '文件列表回到顶部' : target === 'toc' ? '大纲回到顶部' : '回到顶部';
	const bottomLabel =
		target === 'nav' ? '文件列表滚到底部' : target === 'toc' ? '大纲滚到底部' : '滚到底部';
	const topInline =
		"if(window.__webmdScrollTop){window.__webmdScrollTop(this);return false;}" +
		`var e=document.querySelector('${sel}');if(e){e.scrollTop=0;}` +
		(target === 'main'
			? "if(location.hash){try{history.replaceState(null,'',location.pathname+location.search);}catch(x){}}"
			: '') +
		"return false;";
	const bottomInline =
		"if(window.__webmdScrollBottom){window.__webmdScrollBottom(this);return false;}" +
		`var e=document.querySelector('${sel}');if(e){e.scrollTop=e.scrollHeight;}` +
		"return false;";
	const bottomBtn = `<button type="button" class="wiki-breadcrumb__icon-btn pane-scroll-edge-btn pane-scroll-bottom-btn" data-scroll-bottom="${target}" title="${bottomLabel}" aria-label="${bottomLabel}" onclick="${bottomInline}">${ICON_TO_BOTTOM}</button>`;
	const topBtn = `<button type="button" class="wiki-breadcrumb__icon-btn pane-scroll-edge-btn pane-scroll-top-btn" data-scroll-top="${target}" title="${topLabel}" aria-label="${topLabel}" onclick="${topInline}">${ICON_TO_TOP}</button>`;
	// 路径栏无 pane-title-end 包裹时仍顶到最右
	const endClass = target === 'main' ? 'pane-scroll-edge pane-scroll-edge--trail' : 'pane-scroll-edge';
	return `<span class="${endClass}">${bottomBtn}${topBtn}</span>`;
}
/** 铺满 / 退出铺满（展开四角）— 顶栏收起左右栏 */
const ICON_EXPAND = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--expand" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>`;
const ICON_COLLAPSE = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--collapse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 7"/><path d="M21 9V3h-6"/><path d="m3 21 7-7"/><path d="M3 15v6h6"/></svg>`;
/** 中栏内容宽度：铺满 ↔ 固定最大宽度居中
 * fill：中间框 + 上下左右四向外扩箭头（区别于顶栏「收起侧栏」的对角展开）
 * fixed：中间窄栏 + 两侧竖线（居中留白）
 */
const ICON_CONTENT_FILL = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--content-fill" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="m9 4 3-2 3 2M9 20l3 2 3-2M4 9l-2 3 2 3M20 9l2 3-2 3"/></svg>`;
const ICON_CONTENT_FIXED = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--content-fixed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="4" width="8" height="16" rx="1.5"/><path d="M3 7v10M21 7v10"/></svg>`;

/** 路径栏：正文宽度切换（铺满 / 固定居中） */
function renderContentWidthBtn(): string {
	// 注意：data-content-width-toggle 不可与 html[data-content-width] 同名，否则 closest 会点哪都命中
	return `<button type="button" class="wiki-breadcrumb__icon-btn wiki-breadcrumb__width-btn" data-content-width-toggle title="固定宽度居中（当前为铺满）" aria-label="固定宽度居中" aria-pressed="false">${ICON_CONTENT_FILL}${ICON_CONTENT_FIXED}</button>`;
}
/** 主题：太阳 / 月亮 两态切换（对齐 Docusaurus 风格） */
const ICON_THEME_SUN = `<svg class="theme-toggle__icon theme-toggle__icon--sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const ICON_THEME_MOON = `<svg class="theme-toggle__icon theme-toggle__icon--moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
/** 顶栏主页图标（点图标/站名回主页） */
const ICON_BRAND_HOME = `<svg class="brand__icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
/** 窄屏顶栏：与宽屏「文件」标题同款叠放文档图标 */
const ICON_PANEL_FILES = `<svg class="panel-btn__glyph panel-btn__glyph--files" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="panel-btn__sheet panel-btn__sheet--back" d="M6 4.5A2 2 0 0 1 8 2.5h6.2c.4 0 .78.16 1.06.44l3.3 3.3c.28.28.44.66.44 1.06V16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4.5Z"/><path class="panel-btn__fold" d="M14.5 2.7v3.3c0 .55.45 1 1 1h3.3"/><path class="panel-btn__sheet panel-btn__sheet--front" d="M4 7.5A2 2 0 0 1 6 5.5h.8V17c0 1.38 1.12 2.5 2.5 2.5H17c.55 0 1 .45 1 1s-.45 1-1 1H9.3A4.3 4.3 0 0 1 5 17.2V7.5Z"/><path class="panel-btn__lines" d="M9.2 11h6.6M9.2 14h5.2" stroke-linecap="round"/></svg>`;
/** 窄屏顶栏：与宽屏「大纲」标题同款文档+横线图标 */
const ICON_PANEL_TOC = `<svg class="panel-btn__glyph panel-btn__glyph--toc" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path class="panel-btn__toc-fill" d="M2.5 3.25C2.5 2.56 3.06 2 3.75 2h8.5c.69 0 1.25.56 1.25 1.25v9.5c0 .69-.56 1.25-1.25 1.25h-8.5C3.06 14 2.5 13.44 2.5 12.75v-9.5Z"/><path class="panel-btn__toc-lines" d="M5 5.25h6M5 8h6M5 10.75h4" stroke-linecap="round"/></svg>`;

/** 防 FOUC：主题 + 正文宽度（宽屏默认 fill，窄屏默认 fixed，与 client defaultContentWidth 一致） */
const THEME_BOOT_SCRIPT = `(function(){try{var k='webmd-theme';var p=localStorage.getItem(k);var t=(p==='light'||p==='dark')?p:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;var w=localStorage.getItem('webmd-content-width');if(w==='fixed'||w==='fill')r.dataset.contentWidth=w;else r.dataset.contentWidth=matchMedia('(max-width: 640px)').matches?'fixed':'fill';r.style.setProperty('--content-readable-max','100%');}catch(e){document.documentElement.dataset.theme='light';try{document.documentElement.dataset.contentWidth=matchMedia('(max-width: 640px)').matches?'fixed':'fill';document.documentElement.style.setProperty('--content-readable-max','100%');}catch(e2){document.documentElement.dataset.contentWidth='fill';}}})();`;

function renderThemeToggle(): string {
	return `<button type="button" class="theme-toggle" data-theme-toggle title="切换深色模式" aria-label="切换深色模式" aria-pressed="false">${ICON_THEME_SUN}${ICON_THEME_MOON}</button>`;
}

/** GitHub 图标（官方 mark 简化路径） */
const ICON_GITHUB = `<svg class="header-github__icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.157-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.272.098-2.65 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844a9.56 9.56 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.378.203 2.397.1 2.65.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48A10.02 10.02 0 0 0 22 12c0-5.523-4.477-10-10-10Z"/></svg>`;

function renderGithubLink(url: string): string {
	const href = String(url || '').trim();
	if (!href) return '';
	return `<a class="header-github" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="在 GitHub 上查看">${ICON_GITHUB}</a>`;
}

/**
 * 顶部统一路径栏：content 相对路径 + 可选大小/类型 + 复制/下载
 * 正文区不再重复文件名、路径、大小
 *
 * 窄宽时由客户端测量省略：
 * - 文件夹路径优先压成 …/尾段（如 …/sub），避免 //
 * - 文件名尽量保留，仍不够时再中间省略 xxx…xxx
 */
export function renderBreadcrumb(
	file: TreeFile,
	opts?: { bytes?: number },
): string {
	const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
	const fileName = parts.length ? parts[parts.length - 1]! : file.name;
	const dirParts = parts.slice(0, -1);
	const dirJoined = dirParts.join('/');

	const crumbs: string[] = [];
	crumbs.push(
		`<a class="wiki-breadcrumb__home" href="/" title="主页" aria-label="主页">${ICON_HOME}</a>`,
	);
	if (dirJoined) {
		crumbs.push(`<span class="wiki-breadcrumb__sep" aria-hidden="true">/</span>`);
		crumbs.push(
			`<span class="wiki-breadcrumb__dirs" data-middle-ellipsis data-ellipsis-full="${esc(dirJoined)}" title="${esc(dirJoined)}">${esc(dirJoined)}</span>`,
		);
	}
	crumbs.push(`<span class="wiki-breadcrumb__sep" aria-hidden="true">/</span>`);
	crumbs.push(
		`<span class="wiki-breadcrumb__current" aria-current="page" data-middle-ellipsis data-ellipsis-full="${esc(fileName)}" title="${esc(file.path)}">${esc(fileName)}</span>`,
	);
	const metaParts: string[] = [];
	if (opts?.bytes != null && Number.isFinite(opts.bytes)) {
		const sz = formatBytesForCrumb(opts.bytes);
		if (sz) metaParts.push(sz);
	}
	const kind = KIND_LABEL[file.kind] || file.kind;
	if (kind) metaParts.push(kind);
	const meta =
		metaParts.length > 0
			? `<span class="wiki-breadcrumb__meta" aria-label="文件信息">${metaParts
					.map((p) => `<span class="wiki-breadcrumb__chip">${esc(p)}</span>`)
					.join('')}</span>`
			: '';
	const pathAttr = esc(file.path);
	const downloadHref = esc(file.url);
	const downloadName = esc(file.name);
	const metaLine = metaParts.length ? metaParts.join(' · ') : '';
	const actions = `<div class="wiki-breadcrumb__actions">
		<button type="button" class="wiki-breadcrumb__icon-btn wiki-breadcrumb__url-btn" data-path-reveal-btn title="查看完整 URL" aria-label="查看完整 URL" aria-haspopup="dialog"><span class="wiki-breadcrumb__url-btn-label">URL</span></button>
		${renderContentWidthBtn()}
		<a class="wiki-breadcrumb__icon-btn" href="${downloadHref}" download="${downloadName}" title="下载文件" aria-label="下载文件">${ICON_DOWNLOAD}</a>
		${renderScrollEdgeBtns('main')}
	</div>`;
	/* 点击路径/URL 按钮弹出完整 URL；宽度随 URL 自适应；可分别复制可读/转义 */
	const popover = `<div class="wiki-breadcrumb__popover" data-path-popover hidden role="dialog" aria-label="完整 URL">
		<div class="wiki-breadcrumb__popover-head">
			<span class="wiki-breadcrumb__popover-title">完整 URL</span>
			<button type="button" class="wiki-breadcrumb__popover-close" data-path-popover-close title="关闭" aria-label="关闭">×</button>
		</div>
		<div class="wiki-breadcrumb__popover-block">
			<span class="wiki-breadcrumb__popover-label">可读（非转义）</span>
			<code class="wiki-breadcrumb__popover-path" data-path-popover-text data-path-popover-plain></code>
		</div>
		<div class="wiki-breadcrumb__popover-block">
			<span class="wiki-breadcrumb__popover-label">转义（percent-encode）</span>
			<code class="wiki-breadcrumb__popover-path wiki-breadcrumb__popover-path--encoded" data-path-popover-encoded></code>
		</div>
		${metaLine ? `<div class="wiki-breadcrumb__popover-meta">${esc(metaLine)}</div>` : ''}
		<div class="wiki-breadcrumb__popover-actions">
			<button type="button" class="wiki-breadcrumb__popover-btn" data-copy-url-plain data-copy-path="${pathAttr}" title="复制中文原样的完整 URL">复制可读 URL</button>
			<button type="button" class="wiki-breadcrumb__popover-btn wiki-breadcrumb__popover-btn--secondary" data-copy-url-encoded data-copy-path="${pathAttr}" title="复制 %E4%B8%AD 形式的完整 URL">复制转义 URL</button>
			<button type="button" class="wiki-breadcrumb__popover-btn wiki-breadcrumb__popover-btn--ghost" data-copy-rel-path data-copy-path="${pathAttr}" title="仅路径，不含域名">复制相对路径</button>
		</div>
	</div>`;
	return `<nav class="wiki-breadcrumb" aria-label="文件路径" data-full-path="${pathAttr}">
		<div class="wiki-breadcrumb__trail" data-path-reveal role="button" tabindex="0" title="点击查看完整 URL" aria-expanded="false" aria-haspopup="dialog">${crumbs.join('')}</div>
		${meta}
		${actions}
		${popover}
	</nav>`;
}

/**
 * 底部分页：固定「上一页（」「）」「（」「）下一页」，文件名中间省略（xxx…xxx）
 */
export function renderPager(
	prev: TreeFile | null,
	next: TreeFile | null,
): string {
	const prevHtml = prev
		? `<a class="wiki-pager__btn wiki-pager__btn--prev" href="${pageHref(prev)}" rel="prev" title="上一页：${esc(prev.name)}"><span class="wiki-pager__chevron">‹</span><span class="wiki-pager__text"><span class="wiki-pager__fixed">上一页（</span><span class="wiki-pager__name" data-middle-ellipsis data-ellipsis-full="${esc(prev.name)}">${esc(prev.name)}</span><span class="wiki-pager__fixed">）</span></span></a>`
		: `<span class="wiki-pager__slot"></span>`;
	const nextHtml = next
		? `<a class="wiki-pager__btn wiki-pager__btn--next" href="${pageHref(next)}" rel="next" title="下一页：${esc(next.name)}"><span class="wiki-pager__text"><span class="wiki-pager__fixed">（</span><span class="wiki-pager__name" data-middle-ellipsis data-ellipsis-full="${esc(next.name)}">${esc(next.name)}</span><span class="wiki-pager__fixed">）下一页</span></span><span class="wiki-pager__chevron">›</span></a>`
		: `<span class="wiki-pager__slot"></span>`;
	const single = !(prev && next) ? ' wiki-pager--single' : '';
	return `<div class="wiki-pager${single}">${prevHtml}${nextHtml}</div>`;
}

export type PageModel = {
	siteTitle: string;
	pageTitle: string;
	description?: string;
	activePath: string;
	/** 附加到 body 的 class，如 is-pdf-page */
	bodyClass?: string;
	treeHtml: string;
	tocHtml: string;
	inlineTocHtml: string;
	breadcrumbHtml: string;
	bodyHtml: string;
	pagerHtml: string;
	assetJs: string;
	assetCss: string;
	navWidth: number;
	tocWidth: number;
	headerHeight: number;
};

export function renderPage(m: PageModel): string {
	const desc = m.description
		? `\n  <meta name="description" content="${esc(m.description)}" />`
		: '';
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="${esc(m.siteTitle)}" />
  <title>${esc(m.pageTitle)} | ${esc(m.siteTitle)}</title>${desc}
  <link rel="icon" href="${FAVICON}" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <script>${THEME_BOOT_SCRIPT}</script>
  <link rel="stylesheet" href="${m.assetCss}" />
  <style>
    :root {
      --header-h: ${m.headerHeight}px;
      --wiki-nav: ${m.navWidth}px;
      --wiki-toc: ${m.tocWidth}px;
      --wiki-g-nav: 6px;
      --wiki-g-toc: 6px;
    }
  </style>
</head>
<body class="wiki-body${m.bodyClass ? ` ${esc(m.bodyClass)}` : ''}">
  <header class="app-header">
    <div class="header-left">
      <button type="button" class="panel-btn panel-btn--menu" data-wiki-toggle="nav" data-wiki-drawer-nav title="文件" aria-label="打开文件导航">${ICON_PANEL_FILES}</button>
      <a class="brand" href="/" title="主页" aria-label="主页：${esc(m.siteTitle)}"><span class="brand__icon">${ICON_BRAND_HOME}</span><span class="brand__title">${esc(m.siteTitle)}</span></a>
    </div>
    <div class="header-center">
      <div id="search" class="webmd-search"></div>
    </div>
    <div class="header-right">
      <div class="header-right__tools">
        ${renderGithubLink(site.site.githubUrl ?? '')}
        ${renderThemeToggle()}
        <button type="button" class="header-focus-btn" data-focus-read title="铺满屏幕宽度（收起左右栏）" aria-label="铺满屏幕宽度" aria-pressed="false">${ICON_EXPAND}${ICON_COLLAPSE}</button>
      </div>
      <button type="button" class="panel-btn panel-btn--toc" data-wiki-toggle="toc" data-wiki-drawer-toc title="大纲" aria-label="打开本页大纲">${ICON_PANEL_TOC}</button>
    </div>
  </header>
  <div class="drawer-backdrop" data-wiki-backdrop hidden></div>
  <div class="app-shell has-toc-col" data-wiki-shell>
    <!-- 左：文件树 | 拖缝 | 中栏(正文|拖缝|大纲) -->
    <aside class="wiki-nav pane-left" data-wiki-nav>
      <nav class="file-tree thin-scrollbar" id="file-tree" aria-label="文件导航">${m.treeHtml}</nav>
      <!-- 展开态：底部收起（与原先一致） -->
      <button type="button" class="wiki-collapse-btn wiki-collapse-btn--nav" data-wiki-toggle="nav" data-wiki-footer-collapse="nav" title="收起文件栏" aria-label="收起文件栏">
        <span aria-hidden="true">«</span>
      </button>
    </aside>
    <div class="wiki-gutter wiki-gutter--nav" data-wiki-gutter="nav" title="拖动调整左侧宽度"></div>

    <div class="wiki-center" data-wiki-center>
      <div class="wiki-main" data-wiki-main>
        <!-- 路径栏固定顶栏（不随正文滚动） -->
        <div class="pane-bar pane-bar--center" data-wiki-crumb>${m.breadcrumbHtml}</div>
        <div class="center-scroll thin-scrollbar" data-wiki-scroll>
          ${m.inlineTocHtml}
          <article class="markdown-body" id="content">${m.bodyHtml}</article>
        </div>
        <footer class="wiki-page-footer">${m.pagerHtml}</footer>
      </div>
      <div class="wiki-gutter wiki-gutter--toc" data-wiki-gutter="toc" title="拖动调整大纲宽度"></div>
      <aside class="wiki-toc pane-right" data-wiki-toc>
        <div class="pane-bar pane-bar--toc pane-title">
          <div class="pane-title-group">
            <span class="pane-title__icon" data-pane-state="expanded" aria-hidden="true"><svg class="pane-title__svg pane-title__svg--open" width="16" height="16" viewBox="0 0 16 16" fill="none"><path class="pane-title__icon-fill" d="M2.5 3.25C2.5 2.56 3.06 2 3.75 2h8.5c.69 0 1.25.56 1.25 1.25v9.5c0 .69-.56 1.25-1.25 1.25h-8.5C3.06 14 2.5 13.44 2.5 12.75v-9.5Z"/><path class="pane-title__icon-lines" d="M5 5.25h6M5 8h6M5 10.75h4" stroke-linecap="round"/></svg></span>
            <span class="pane-title__text">大纲</span>
          </div>
          <div class="pane-title-end">${renderScrollEdgeBtns('toc')}<button type="button" class="pane-collapse-btn pane-collapse-btn--toc" data-wiki-toggle="toc" data-wiki-header-collapse="toc" title="收起大纲" aria-label="收起大纲"><span aria-hidden="true">»</span></button></div>
        </div>
        <nav class="doc-toc thin-scrollbar" id="doc-toc" aria-label="本页大纲">${m.tocHtml}</nav>
        <!-- 展开态：底部收起 -->
        <button type="button" class="wiki-collapse-btn wiki-collapse-btn--toc" data-wiki-toggle="toc" data-wiki-footer-collapse="toc" title="收起大纲" aria-label="收起大纲">
          <span aria-hidden="true">»</span>
        </button>
      </aside>
    </div>

    <!-- 收起态：全高长条；上图标 / 中展开 / 下展开，点任意处均可展开 -->
    <button type="button" class="wiki-rail-btn wiki-edge-btn wiki-edge-btn--nav" data-wiki-toggle="nav" data-wiki-edge="nav" data-pane-state="collapsed" hidden title="展开文件栏" aria-label="展开文件栏">
      <span class="wiki-rail-btn__head" aria-hidden="true">
        <!-- 同形叠放多文件；CSS 用中性色（展开顶栏为蓝色） -->
        <svg class="wiki-rail-btn__glyph wiki-rail-btn__glyph--files wiki-rail-btn__glyph--closed" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path class="wiki-rail-btn__sheet wiki-rail-btn__sheet--back" d="M6 4.5A2 2 0 0 1 8 2.5h6.2c.4 0 .78.16 1.06.44l3.3 3.3c.28.28.44.66.44 1.06V16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4.5Z"/>
          <path class="wiki-rail-btn__fold" d="M14.5 2.7v3.3c0 .55.45 1 1 1h3.3"/>
          <path class="wiki-rail-btn__sheet wiki-rail-btn__sheet--front" d="M4 7.5A2 2 0 0 1 6 5.5h.8V17c0 1.38 1.12 2.5 2.5 2.5H17c.55 0 1 .45 1 1s-.45 1-1 1H9.3A4.3 4.3 0 0 1 5 17.2V7.5Z"/>
          <path class="wiki-rail-btn__lines" d="M9.2 11h6.6M9.2 14h5.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="wiki-rail-btn__mid" aria-hidden="true"><span class="wiki-rail-btn__chev">&gt;&gt;</span></span>
      <span class="wiki-rail-btn__foot" aria-hidden="true"><span class="wiki-rail-btn__chev">&gt;&gt;</span></span>
    </button>
    <button type="button" class="wiki-rail-btn wiki-edge-btn wiki-edge-btn--toc" data-wiki-toggle="toc" data-wiki-edge="toc" data-pane-state="collapsed" hidden title="展开大纲" aria-label="展开大纲">
      <span class="wiki-rail-btn__head" aria-hidden="true">
        <!-- 同形：页 + 三条横线；CSS 中性灰（展开顶栏为蓝色） -->
        <svg class="wiki-rail-btn__glyph wiki-rail-btn__glyph--toc wiki-rail-btn__glyph--closed" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path class="wiki-rail-btn__toc-page" d="M2.5 3.25C2.5 2.56 3.06 2 3.75 2h8.5c.69 0 1.25.56 1.25 1.25v9.5c0 .69-.56 1.25-1.25 1.25h-8.5C3.06 14 2.5 13.44 2.5 12.75v-9.5Z"/>
          <path class="wiki-rail-btn__toc-lines" d="M5 5.25h6M5 8h6M5 10.75h4" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="wiki-rail-btn__mid" aria-hidden="true"><span class="wiki-rail-btn__chev">&lt;&lt;</span></span>
      <span class="wiki-rail-btn__foot" aria-hidden="true"><span class="wiki-rail-btn__chev">&lt;&lt;</span></span>
    </button>
  </div>
  <script type="module" src="${m.assetJs}"></script>
</body>
</html>`;
}

/**
 * 站级主页 → dist/index.html
 * 与 content/index.md 无关；后者是普通文档 /index/
 */
export function renderHomePage(m: {
	siteTitle: string;
	siteDescription?: string;
	assetJs: string;
	assetCss: string;
	treeHtml: string;
	navWidth: number;
	tocWidth: number;
	headerHeight: number;
}): string {
	const desc = m.siteDescription || '';
	const crumb = `<nav class="wiki-breadcrumb" aria-label="主页">
		<div class="wiki-breadcrumb__trail">
			<span class="wiki-breadcrumb__home is-current" title="主页" aria-current="page">${ICON_HOME}</span>
			<span class="wiki-breadcrumb__sep" aria-hidden="true">/</span>
			<span class="wiki-breadcrumb__current" aria-current="page">主页</span>
		</div>
		${desc ? `<span class="wiki-breadcrumb__meta"><span class="wiki-breadcrumb__chip">${esc(desc)}</span></span>` : ''}
		<div class="wiki-breadcrumb__actions">${renderContentWidthBtn()}</div>
	</nav>`;
	const body = `<div class="home-hero">
  <h1 class="home-hero__title">${esc(m.siteTitle)}</h1>
  ${desc ? `<p class="home-hero__desc">${esc(desc)}</p>` : ''}
  <div class="home-hero__actions">
    <a class="home-hero__btn home-hero__btn--primary" href="/index/">打开 index.md</a>
    <a class="home-hero__btn" href="/guides/example/">浏览文档示例</a>
  </div>
  <div class="home-hero__cards">
    <section class="home-card">
      <h2>内容</h2>
      <p>所有可预览文件放在 <code>content/</code>。点顶栏主页图标或站名进入首页；左侧「文件」下为文件树（含 <code>index.md</code>）。</p>
    </section>
    <section class="home-card">
      <h2>预览</h2>
      <p>Markdown、图片、音视频、PDF、代码等直接打开即可预览；顶部路径栏提供复制与下载。</p>
    </section>
    <section class="home-card">
      <h2>搜索</h2>
      <p>顶栏搜索支持多字段与筛选；请用 <kbd>Ctrl</kbd>+<kbd>K</kbd> 快速打开。</p>
    </section>
  </div>
</div>`;
	return renderPage({
		siteTitle: m.siteTitle,
		pageTitle: '主页',
		description: desc || m.siteTitle,
		activePath: '__home__',
		bodyClass: 'is-home-page',
		treeHtml: m.treeHtml,
		tocHtml: '<div class="toc-empty">主页无大纲</div>',
		inlineTocHtml: '',
		breadcrumbHtml: crumb,
		bodyHtml: body,
		pagerHtml: '',
		assetJs: m.assetJs,
		assetCss: m.assetCss,
		navWidth: m.navWidth,
		tocWidth: m.tocWidth,
		headerHeight: m.headerHeight,
	});
}

export function render404Page(m: {
	siteTitle: string;
	assetJs: string;
	assetCss: string;
	treeHtml: string;
	navWidth: number;
	tocWidth: number;
	headerHeight: number;
}): string {
	return renderPage({
		siteTitle: m.siteTitle,
		pageTitle: '未找到页面',
		description: '404',
		activePath: '',
		treeHtml: m.treeHtml,
		tocHtml: '<div class="toc-empty">—</div>',
		inlineTocHtml: '',
		breadcrumbHtml: `<nav class="wiki-breadcrumb" aria-label="文件路径"><div class="wiki-breadcrumb__trail"><a class="wiki-breadcrumb__home" href="/" title="主页" aria-label="主页">${ICON_HOME}</a><span class="wiki-breadcrumb__sep" aria-hidden="true">/</span><span class="wiki-breadcrumb__current" aria-current="page">404</span></div><div class="wiki-breadcrumb__actions">${renderContentWidthBtn()}</div></nav>`,
		bodyHtml: `<h1>页面未找到</h1><p>链接可能已失效，或文件尚未放入 <code>content/</code>。</p><p><a href="/">返回主页</a></p>`,
		pagerHtml: '',
		assetJs: m.assetJs,
		assetCss: m.assetCss,
		navWidth: m.navWidth,
		tocWidth: m.tocWidth,
		headerHeight: m.headerHeight,
	});
}
