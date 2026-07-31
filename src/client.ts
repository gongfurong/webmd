/**
 * 静态页客户端：布局拖拽/收起、移动端抽屉、代码复制、大纲、PDF Blob、搜索
 * 布局契约对齐 starlight-vanilla：[nav | g | center[main | g | toc]]
 */
import site from '../site.config';
import './style.css';
import 'katex/dist/katex.min.css';
import { mountSearch } from './search/ui';
import mermaid from 'mermaid';
import renderMathInElement from 'katex/contrib/auto-render';

const STORAGE = 'webmd-layout-v2';
const GUTTER = 6;

type LayoutState = {
	nav: number;
	toc: number;
	navCollapsed: boolean;
	tocCollapsed: boolean;
};

function clamp(n: number, a: number, b: number) {
	return Math.min(b, Math.max(a, n));
}

function loadState(): LayoutState {
	try {
		const j = JSON.parse(localStorage.getItem(STORAGE) || '{}') as Partial<LayoutState>;
		return {
			nav: clamp(Number(j.nav) || site.layout.navWidth, site.layout.navMin, site.layout.navMax),
			toc: clamp(Number(j.toc) || site.layout.tocWidth, site.layout.tocMin, site.layout.tocMax),
			navCollapsed: Boolean(j.navCollapsed),
			tocCollapsed: Boolean(j.tocCollapsed),
		};
	} catch {
		return {
			nav: site.layout.navWidth,
			toc: site.layout.tocWidth,
			navCollapsed: false,
			tocCollapsed: false,
		};
	}
}

function saveState(s: LayoutState) {
	try {
		localStorage.setItem(STORAGE, JSON.stringify(s));
	} catch {
		/* ignore */
	}
}

/* ========== 主题：浅色 / 深色 两态切换（太阳 ⇄ 月亮） ==========
 * 正文样式：plugin-github-light/dark 已常驻 CSS，靠 html[data-theme] 切换
 */
const THEME_KEY = 'webmd-theme';
type ThemeMode = 'light' | 'dark';

function parseTheme(v: unknown): ThemeMode | null {
	return v === 'light' || v === 'dark' ? v : null;
}

function loadTheme(): ThemeMode {
	try {
		const stored = parseTheme(localStorage.getItem(THEME_KEY));
		if (stored) return stored;
	} catch {
		/* ignore */
	}
	// 兼容旧版 auto：按系统解析一次后固定为 light/dark
	try {
		const legacy = localStorage.getItem(THEME_KEY);
		if (legacy === 'auto') {
			return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
	} catch {
		/* ignore */
	}
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storeTheme(theme: ThemeMode) {
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		/* ignore */
	}
}

function applyTheme(theme: ThemeMode) {
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.style.colorScheme = theme;
	storeTheme(theme);

	const isDark = theme === 'dark';
	document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((btn) => {
		btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
		// 当前浅色 → 显示月亮（点一下切深色）；当前深色 → 显示太阳
		btn.title = isDark ? '切换浅色模式' : '切换深色模式';
		btn.setAttribute('aria-label', isDark ? '切换浅色模式' : '切换深色模式');
	});
	// Mermaid 图主题跟站点：切换后强制重绘
	void renderMermaidBlocks({ reset: true });
}

function toggleTheme() {
	const cur = parseTheme(document.documentElement.dataset.theme) || loadTheme();
	applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function bindTheme() {
	applyTheme(loadTheme());
	document.addEventListener('click', (ev) => {
		const btn = (ev.target as HTMLElement).closest(
			'[data-theme-toggle]',
		) as HTMLButtonElement | null;
		if (!btn) return;
		ev.preventDefault();
		toggleTheme();
	});
}

function isMobile(): boolean {
	return window.matchMedia(`(max-width: ${site.layout.navHideBelow}px)`).matches;
}

function isTocBreakpoint(): boolean {
	return window.matchMedia(`(min-width: ${site.layout.tocHideBelow + 1}px)`).matches;
}

/** 铺满阅读：收起左右栏，再次点击恢复进入前状态 */
let focusRead: {
	active: boolean;
	prevNav: boolean;
	prevToc: boolean;
} = { active: false, prevNav: false, prevToc: false };

function syncFocusReadButtons() {
	const on = focusRead.active;
	document.querySelectorAll<HTMLElement>('[data-focus-read]').forEach((btn) => {
		btn.classList.toggle('is-active', on);
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		btn.title = on ? '退出铺满（恢复左右栏）' : '铺满屏幕宽度（收起左右栏）';
		btn.setAttribute('aria-label', on ? '退出铺满' : '铺满屏幕宽度');
	});
}

function toggleFocusRead() {
	if (isMobile()) return;
	const s = loadState();
	if (!focusRead.active) {
		focusRead = {
			active: true,
			prevNav: s.navCollapsed,
			prevToc: s.tocCollapsed,
		};
		s.navCollapsed = true;
		s.tocCollapsed = true;
		applyLayout(s);
	} else {
		s.navCollapsed = focusRead.prevNav;
		s.tocCollapsed = focusRead.prevToc;
		focusRead.active = false;
		applyLayout(s);
	}
	syncFocusReadButtons();
}

function applyLayout(s: LayoutState) {
	const shell = document.querySelector<HTMLElement>('[data-wiki-shell]');
	if (!shell) return;

	const mobile = isMobile();
	// 右栏大纲：仅受用户收起/展开 + 窄屏断点影响，不因文件格式自动隐藏
	const tocAvailable = !mobile && isTocBreakpoint();
	const navOpen = !mobile && !s.navCollapsed;
	const tocOpen = tocAvailable && !s.tocCollapsed;

	const navW = navOpen ? s.nav : 0;
	const tocW = tocOpen ? s.toc : 0;
	const gNav = navOpen ? GUTTER : 0;
	const gToc = tocOpen ? GUTTER : 0;

	shell.style.setProperty('--wiki-nav', `${navW}px`);
	shell.style.setProperty('--wiki-g-nav', `${gNav}px`);
	shell.style.setProperty('--wiki-toc', `${tocW}px`);
	shell.style.setProperty('--wiki-g-toc', `${gToc}px`);
	document.documentElement.style.setProperty('--header-h', `${site.layout.headerHeight}px`);

	shell.classList.toggle('nav-collapsed', !mobile && s.navCollapsed);
	shell.classList.toggle('toc-collapsed', !tocOpen);
	shell.classList.toggle('has-toc-col', tocOpen);
	shell.classList.toggle('nav-edge-visible', !mobile && s.navCollapsed);
	shell.classList.toggle('toc-edge-visible', tocAvailable && s.tocCollapsed);
	shell.classList.toggle('is-mobile', mobile);
	// 两侧都收起：阅读区接近整屏
	shell.classList.toggle(
		'panels-collapsed',
		!mobile && s.navCollapsed && (!tocAvailable || s.tocCollapsed),
	);

	document.querySelectorAll<HTMLElement>('.wiki-edge-btn--nav').forEach((b) => {
		b.hidden = mobile || !s.navCollapsed;
	});
	document.querySelectorAll<HTMLElement>('.wiki-edge-btn--toc').forEach((b) => {
		b.hidden = !tocAvailable || !s.tocCollapsed;
	});
	document
		.querySelectorAll<HTMLElement>(
			'[data-wiki-footer-collapse="nav"], [data-wiki-header-collapse="nav"]',
		)
		.forEach((b) => {
			b.hidden = mobile || !navOpen;
		});
	document
		.querySelectorAll<HTMLElement>(
			'[data-wiki-footer-collapse="toc"], [data-wiki-header-collapse="toc"]',
		)
		.forEach((b) => {
			b.hidden = !tocOpen;
		});

	// 用户手动展开任一侧 → 仅退出顶栏「收起左右栏」状态，绝不改内容固定/铺满
	if (focusRead.active && (navOpen || tocOpen)) {
		focusRead.active = false;
	}

	// 只更新固定模式的 max 数值；模式本身只由用户点路径栏按钮切换
	updateContentReadableMax(s);
	// 侧栏开合后重申模式（防 DOM/状态不同步）
	reassertContentWidthMode();
	saveState(s);
	syncFocusReadButtons();
}

function setMobileDrawer(open: boolean) {
	document.body.classList.toggle('mobile-nav-open', open);
	const backdrop = document.querySelector<HTMLElement>('[data-wiki-backdrop]');
	if (backdrop) backdrop.hidden = !open;
}

function bindToggles() {
	applyLayout(loadState());
	document.querySelectorAll('[data-wiki-toggle]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const s = loadState();
			const which = (btn as HTMLElement).dataset.wikiToggle;
			const el = btn as HTMLElement;

			if (isMobile() && which === 'nav') {
				setMobileDrawer(!document.body.classList.contains('mobile-nav-open'));
				return;
			}

			if (which === 'nav') {
				// 顶栏/底栏收起按钮：一律收起；边缘条：展开；其它：切换
				if (
					el.hasAttribute('data-wiki-footer-collapse') ||
					el.hasAttribute('data-wiki-header-collapse')
				)
					s.navCollapsed = true;
				else if (el.hasAttribute('data-wiki-edge')) s.navCollapsed = false;
				else s.navCollapsed = !s.navCollapsed;
			}
			if (which === 'toc') {
				if (
					el.hasAttribute('data-wiki-footer-collapse') ||
					el.hasAttribute('data-wiki-header-collapse')
				)
					s.tocCollapsed = true;
				else if (el.hasAttribute('data-wiki-edge')) s.tocCollapsed = false;
				else s.tocCollapsed = !s.tocCollapsed;
			}
			applyLayout(s);
		});
	});
	document.querySelector('[data-wiki-backdrop]')?.addEventListener('click', () => {
		setMobileDrawer(false);
	});
	document.getElementById('file-tree')?.addEventListener('click', (ev) => {
		const t = ev.target as HTMLElement;
		if (isMobile() && t.closest('a.tree-file')) setMobileDrawer(false);
	});
	window.addEventListener('resize', () => {
		applyLayout(loadState());
		if (!isMobile()) setMobileDrawer(false);
	});
}

function bindGutters() {
	document.querySelectorAll<HTMLElement>('[data-wiki-gutter]').forEach((g) => {
		g.addEventListener('pointerdown', (ev) => {
			if (isMobile()) return;
			ev.preventDefault();
			document.body.classList.add('is-col-resizing');
			const which = g.dataset.wikiGutter as 'nav' | 'toc';
			const startX = ev.clientX;
			const st0 = loadState();
			const startNav = st0.nav;
			const startToc = st0.toc;

			const onMove = (e: PointerEvent) => {
				const dx = e.clientX - startX;
				const next = { ...loadState() };
				if (which === 'nav') {
					next.nav = clamp(startNav + dx, site.layout.navMin, site.layout.navMax);
					next.navCollapsed = false;
				} else {
					next.toc = clamp(startToc - dx, site.layout.tocMin, site.layout.tocMax);
					next.tocCollapsed = false;
				}
				applyLayout(next);
			};
			const onUp = () => {
				document.body.classList.remove('is-col-resizing');
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
			};
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		});
	});
}

const TREE_SORT_KEY = 'webmd-tree-sort';
const TREE_GROUP_KEY = 'webmd-tree-group';

type TreeGroupMode = 'mixed' | 'files-first' | 'dirs-first';

function getTreeSortOrder(): 'asc' | 'desc' {
	try {
		const v = localStorage.getItem(TREE_SORT_KEY);
		return v === 'desc' ? 'desc' : 'asc';
	} catch {
		return 'asc';
	}
}

function setTreeSortOrder(order: 'asc' | 'desc') {
	try {
		localStorage.setItem(TREE_SORT_KEY, order);
	} catch {
		/* ignore */
	}
}

function getTreeGroupMode(): TreeGroupMode {
	try {
		const v = localStorage.getItem(TREE_GROUP_KEY);
		if (v === 'files-first' || v === 'dirs-first' || v === 'mixed') return v;
	} catch {
		/* ignore */
	}
	return 'mixed';
}

function setTreeGroupMode(mode: TreeGroupMode) {
	try {
		localStorage.setItem(TREE_GROUP_KEY, mode);
	} catch {
		/* ignore */
	}
}

function nextTreeGroupMode(mode: TreeGroupMode): TreeGroupMode {
	if (mode === 'mixed') return 'files-first';
	if (mode === 'files-first') return 'dirs-first';
	return 'mixed';
}

function groupModeLabel(mode: TreeGroupMode): string {
	if (mode === 'files-first') return '文上';
	if (mode === 'dirs-first') return '夹上';
	return '混排';
}

function groupModeTitle(mode: TreeGroupMode): string {
	if (mode === 'files-first') return '同层：文件在上、文件夹在下（点击切换）';
	if (mode === 'dirs-first') return '同层：文件夹在上、文件在下（点击切换）';
	return '同层：不按类型，纯按文件名（点击切换）';
}

/** 对 data-tree-level 容器：先类型分组，再按 data-sort-name 名序（递归） */
function sortTreeLevelEl(
	container: HTMLElement,
	order: 'asc' | 'desc',
	group: TreeGroupMode,
) {
	const kids = [...container.children] as HTMLElement[];
	const dir = order === 'asc' ? 1 : -1;
	const rank = (el: HTMLElement) => {
		if (group === 'mixed') return 0;
		const kind = el.dataset.kind || '';
		const isDir = kind === 'dir' || el.classList.contains('tree-dir') ? 1 : 0;
		return group === 'files-first' ? isDir : 1 - isDir;
	};
	kids.sort((a, b) => {
		const dr = rank(a) - rank(b);
		if (dr !== 0) return dr;
		const na = a.dataset.sortName || '';
		const nb = b.dataset.sortName || '';
		return (
			dir *
			na.localeCompare(nb, 'zh-CN', { numeric: true, sensitivity: 'base' })
		);
	});
	for (const k of kids) {
		container.appendChild(k);
		const sub = k.querySelector(':scope > .tree-children') as HTMLElement | null;
		if (sub) sortTreeLevelEl(sub, order, group);
	}
}

function applyFileTreeSort(
	order: 'asc' | 'desc' = getTreeSortOrder(),
	group: TreeGroupMode = getTreeGroupMode(),
) {
	const tree = document.getElementById('file-tree');
	if (!tree) return;
	const root = tree.querySelector<HTMLElement>('.tree-body[data-tree-level]');
	if (root) sortTreeLevelEl(root, order, group);

	const sortBtn = tree.querySelector<HTMLButtonElement>('[data-tree-sort]');
	if (sortBtn) {
		sortBtn.dataset.order = order;
		sortBtn.title =
			order === 'asc' ? '文件名升序（点击切换降序）' : '文件名降序（点击切换升序）';
		sortBtn.setAttribute(
			'aria-label',
			`文件树排序：${order === 'asc' ? '升序' : '降序'}`,
		);
	}

	const groupBtn = tree.querySelector<HTMLButtonElement>('[data-tree-group]');
	if (groupBtn) {
		const label = groupModeLabel(group);
		groupBtn.dataset.mode = group;
		groupBtn.textContent = label;
		groupBtn.title = groupModeTitle(group);
		groupBtn.setAttribute('aria-label', `类型排序：${label}`);
	}
}

function bindFileTreeSort() {
	const tree = document.getElementById('file-tree');
	if (!tree) return;
	applyFileTreeSort();

	tree.querySelector<HTMLButtonElement>('[data-tree-sort]')?.addEventListener(
		'click',
		(e) => {
			e.preventDefault();
			e.stopPropagation();
			const next = getTreeSortOrder() === 'asc' ? 'desc' : 'asc';
			setTreeSortOrder(next);
			applyFileTreeSort(next, getTreeGroupMode());
		},
	);

	tree.querySelector<HTMLButtonElement>('[data-tree-group]')?.addEventListener(
		'click',
		(e) => {
			e.preventDefault();
			e.stopPropagation();
			const next = nextTreeGroupMode(getTreeGroupMode());
			setTreeGroupMode(next);
			applyFileTreeSort(getTreeSortOrder(), next);
		},
	);
}

/* ========== 中栏正文宽度：铺满 | 固定最大宽度居中 ==========
 * 固定模式 max ≈ 视口 − 左栏 − 右栏 − 缝 − 内边距
 * 这是「最大宽度」：窗口变窄时随视口缩小；收起侧栏时 max 不加大，正文居中
 */
const CONTENT_WIDTH_KEY = 'webmd-content-width';
type ContentWidthMode = 'fill' | 'fixed';

/** 中栏水平内边距估算（与 .center-scroll padding 对齐） */
const CONTENT_PAD_X = 32;

/**
 * 固定模式 max-width：始终按「左栏+右栏都展开」的设计宽度从视口扣减。
 * 只收起一侧 / 两侧都收起：中栏变宽，但 max 不加大，正文居中不贴边。
 * 不读取当前是否 collapsed，避免收起后 max 跟着变大。
 */
function updateContentReadableMax(s?: LayoutState) {
	const st = s ?? loadState();
	const tocAvail = !isMobile() && isTocBreakpoint();
	// 设计宽度：即使用户已收起侧栏，仍按展开态栏宽扣减
	const navW = Math.max(st.nav, site.layout.navMin);
	const tocW = tocAvail ? Math.max(st.toc, site.layout.tocMin) : 0;
	const gutters = GUTTER + (tocAvail ? GUTTER : 0);
	const max = Math.max(
		280,
		Math.round(window.innerWidth - navW - tocW - gutters - CONTENT_PAD_X),
	);
	document.documentElement.style.setProperty('--content-readable-max', `${max}px`);
}

function loadContentWidth(): ContentWidthMode {
	try {
		const v = localStorage.getItem(CONTENT_WIDTH_KEY);
		if (v === 'fixed' || v === 'fill') return v;
	} catch {
		/* ignore */
	}
	return 'fill'; // 默认铺满中栏
}

function storeContentWidth(mode: ContentWidthMode) {
	try {
		localStorage.setItem(CONTENT_WIDTH_KEY, mode);
	} catch {
		/* ignore */
	}
}

function syncContentWidthButtons(mode: ContentWidthMode) {
	const isFixed = mode === 'fixed';
	document.querySelectorAll<HTMLElement>('[data-content-width-toggle]').forEach((btn) => {
		btn.setAttribute('aria-pressed', isFixed ? 'true' : 'false');
		btn.title = isFixed
			? '铺满中栏（随中栏变宽）'
			: '固定最大宽度居中（侧栏开合不改此模式）';
		btn.setAttribute(
			'aria-label',
			isFixed ? '铺满中栏宽度' : '固定最大宽度居中',
		);
		// 图标样式由 html[data-content-width] 控制，这里只同步无障碍属性
		btn.classList.toggle('is-fixed', isFixed);
		btn.classList.toggle('is-fill', !isFixed);
	});
}

/** 从 localStorage 重申模式到 html，侧栏/软导航后调用；不会改用户选择 */
function reassertContentWidthMode() {
	const mode = loadContentWidth();
	const root = document.documentElement;
	if (root.dataset.contentWidth !== mode) {
		root.dataset.contentWidth = mode;
	}
	// 保证有明确取值（缺省 fill）
	if (root.dataset.contentWidth !== 'fixed' && root.dataset.contentWidth !== 'fill') {
		root.dataset.contentWidth = 'fill';
	}
	syncContentWidthButtons(
		root.dataset.contentWidth === 'fixed' ? 'fixed' : 'fill',
	);
}

/**
 * 仅用户点击路径栏宽度按钮时调用。
 * 侧栏展开/收起、拖拽、resize 不得改模式。
 */
function applyContentWidth(mode: ContentWidthMode) {
	document.documentElement.dataset.contentWidth = mode;
	storeContentWidth(mode);
	updateContentReadableMax();
	syncContentWidthButtons(mode);
}

function toggleContentWidth() {
	const cur = loadContentWidth();
	applyContentWidth(cur === 'fill' ? 'fixed' : 'fill');
}

function bindContentWidth() {
	// 启动：恢复用户锁定的模式（默认 fill）
	applyContentWidth(loadContentWidth());
	// 只绑在按钮上：切勿用 closest('[data-content-width]')，
	// 因为 html 上也有 data-content-width，会导致点哪都切换固定/铺满
	document.addEventListener('click', (ev) => {
		const btn = (ev.target as HTMLElement).closest(
			'[data-content-width-toggle]',
		) as HTMLButtonElement | null;
		if (!btn) return;
		ev.preventDefault();
		ev.stopPropagation();
		toggleContentWidth();
	});
	// 窗口变化只重算 max 数值，不改 fill/fixed
	window.addEventListener(
		'resize',
		() => {
			updateContentReadableMax();
			reassertContentWidthMode();
		},
		{ passive: true },
	);
}

type ScrollPaneTarget = 'main' | 'nav' | 'toc';

function resolveScrollPaneTarget(
	btn?: HTMLElement | null,
	attr: 'data-scroll-top' | 'data-scroll-bottom' = 'data-scroll-top',
): ScrollPaneTarget {
	const raw = (btn?.getAttribute(attr) || 'main').toLowerCase();
	if (raw === 'nav' || raw === 'toc' || raw === 'main') return raw;
	return 'main';
}

function scrollPaneEl(target: ScrollPaneTarget): HTMLElement | null {
	if (target === 'nav') {
		return (
			document.querySelector<HTMLElement>('.tree-body') ||
			document.querySelector<HTMLElement>('#file-tree')
		);
	}
	if (target === 'toc') {
		return document.querySelector<HTMLElement>('#doc-toc');
	}
	return (
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('.center-scroll')
	);
}

function pinScroll(el: HTMLElement | null | undefined, top: number) {
	if (!el) return;
	el.scrollTop = top;
	el.scrollLeft = 0;
	try {
		el.scrollTo({ top, left: 0, behavior: 'auto' });
	} catch {
		el.scrollTop = top;
	}
}

function flashScrollBtn(btn: HTMLElement, msg: string) {
	btn.classList.add('is-acted');
	const base = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
	btn.title = msg;
	window.setTimeout(() => {
		btn.classList.remove('is-acted');
		btn.title = base;
	}, 900);
}

/** 指定栏回到顶部（main / nav / toc） */
function scrollCenterToTop(btn?: HTMLElement | null) {
	const target = resolveScrollPaneTarget(btn, 'data-scroll-top');
	const pane = scrollPaneEl(target);

	if (target === 'main') {
		if (location.hash) {
			try {
				history.replaceState(null, '', location.pathname + location.search);
			} catch {
				/* ignore */
			}
		}
		const content =
			document.getElementById('content') ||
			document.querySelector<HTMLElement>('.center-scroll > .markdown-body');
		pinScroll(pane, 0);
		if (content) {
			try {
				content.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
			} catch {
				/* ignore */
			}
			pinScroll(pane, 0);
		}
		try {
			window.scrollTo(0, 0);
		} catch {
			/* ignore */
		}
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
	} else {
		pinScroll(pane, 0);
	}

	window.requestAnimationFrame(() => pinScroll(pane, 0));
	window.setTimeout(() => pinScroll(pane, 0), 40);

	try {
		saveViewState(location.pathname);
	} catch {
		/* ignore */
	}

	if (btn) {
		const atTop = !pane || pane.scrollHeight <= pane.clientHeight + 2;
		flashScrollBtn(btn, atTop ? '已在顶部' : '已回到顶部');
	}
}

/** 指定栏滚到底部（main / nav / toc） */
function scrollPaneToBottom(btn?: HTMLElement | null) {
	const target = resolveScrollPaneTarget(btn, 'data-scroll-bottom');
	const pane = scrollPaneEl(target);
	const go = () => {
		if (!pane) return;
		const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
		pinScroll(pane, max);
		// 再钉一次，应对图片/公式后高度变化
		pane.scrollTop = pane.scrollHeight;
	};
	go();
	window.requestAnimationFrame(go);
	window.setTimeout(go, 40);
	window.setTimeout(go, 200);

	try {
		saveViewState(location.pathname);
	} catch {
		/* ignore */
	}

	if (btn) {
		const noScroll = !pane || pane.scrollHeight <= pane.clientHeight + 2;
		flashScrollBtn(btn, noScroll ? '已在底部' : '已到底部');
	}
}

// 尽早挂全局，供内联 onclick / 调试调用
;(
	window as unknown as {
		__webmdScrollTop?: (b?: HTMLElement | null) => void;
		__webmdScrollBottom?: (b?: HTMLElement | null) => void;
	}
).__webmdScrollTop = scrollCenterToTop;
;(
	window as unknown as {
		__webmdScrollTop?: (b?: HTMLElement | null) => void;
		__webmdScrollBottom?: (b?: HTMLElement | null) => void;
	}
).__webmdScrollBottom = scrollPaneToBottom;

let scrollEdgeClickBound = false;

function bindBreadcrumbActions() {
	document.querySelectorAll<HTMLButtonElement>('[data-copy-url], [data-copy-path]').forEach((btn) => {
		if (btn.dataset.bound) return;
		btn.dataset.bound = '1';
		btn.addEventListener('click', async () => {
			// 完整 URL + 扩展名：优先 content 相对路径（如 量子/手册.md）
			// 不 percent-encode，中文原样；站内可匹配 /path/file.md
			let fullUrl = '';
			const rel = (btn.getAttribute('data-copy-path') || '')
				.replace(/\\/g, '/')
				.replace(/^\/+/, '');
			if (rel) {
				fullUrl = `${location.origin}/${rel}`;
			} else {
				try {
					fullUrl = `${location.origin}${decodeURI(location.pathname)}${location.search}`;
				} catch {
					fullUrl = `${location.origin}${location.pathname}${location.search}`;
				}
			}
			if (!fullUrl) return;
			try {
				await navigator.clipboard.writeText(fullUrl);
				btn.classList.add('is-copied');
				btn.title = '已复制链接';
				btn.setAttribute('aria-label', '已复制链接');
				window.setTimeout(() => {
					btn.classList.remove('is-copied');
					btn.title = '复制完整链接';
					btn.setAttribute('aria-label', '复制完整链接');
				}, 1400);
			} catch {
				btn.title = '复制失败';
				btn.setAttribute('aria-label', '复制失败');
				window.setTimeout(() => {
					btn.title = '复制完整链接';
					btn.setAttribute('aria-label', '复制完整链接');
				}, 1400);
			}
		});
	});
	// 文档级委托：回顶 / 到底（软导航后仍可用）
	if (!scrollEdgeClickBound) {
		scrollEdgeClickBound = true;
		const onScrollEdge = (ev: Event) => {
			const raw = ev.target;
			const el =
				raw instanceof Element
					? raw
					: raw instanceof Node
						? raw.parentElement
						: null;
			const bottomBtn = el?.closest?.(
				'[data-scroll-bottom]',
			) as HTMLElement | null;
			if (bottomBtn) {
				scrollPaneToBottom(bottomBtn);
				return;
			}
			const topBtn = el?.closest?.('[data-scroll-top]') as HTMLElement | null;
			if (topBtn) {
				scrollCenterToTop(topBtn);
			}
		};
		document.addEventListener('click', onScrollEdge, true);
	}
	// 软导航后路径栏重挂：只同步按钮态，不改 localStorage 里的模式
	reassertContentWidthMode();
	// 顶栏「收起左右栏」铺满：委托一次即可
	syncFocusReadButtons();
}

function bindFocusRead() {
	document.addEventListener('click', (ev) => {
		const btn = (ev.target as HTMLElement).closest(
			'[data-focus-read]',
		) as HTMLButtonElement | null;
		if (!btn) return;
		ev.preventDefault();
		ev.stopPropagation();
		toggleFocusRead();
	});
}

function bindCodeCopy() {
	document.querySelectorAll<HTMLButtonElement>('.webmd-code__copy').forEach((btn) => {
		if (btn.dataset.bound) return;
		btn.dataset.bound = '1';
		btn.addEventListener('click', async () => {
			const pre = btn.closest('.webmd-code')?.querySelector('pre');
			const text = pre?.textContent || '';
			const reset = () => {
				btn.classList.remove('is-copied', 'is-failed');
				btn.title = '复制代码';
				btn.setAttribute('aria-label', '复制代码');
			};
			try {
				await navigator.clipboard.writeText(text);
				btn.classList.remove('is-failed');
				btn.classList.add('is-copied');
				btn.title = '已复制';
				btn.setAttribute('aria-label', '已复制');
				window.setTimeout(reset, 1500);
			} catch {
				btn.classList.remove('is-copied');
				btn.classList.add('is-failed');
				btn.title = '复制失败';
				btn.setAttribute('aria-label', '复制失败');
				window.setTimeout(reset, 1500);
			}
		});
	});
}

/* ========== Mermaid：图主题跟随站点 light/dark（与 MD 正文一致） ========== */
let mermaidTheme: 'default' | 'dark' | null = null;

function siteIsDark(): boolean {
	return document.documentElement.dataset.theme === 'dark';
}

/** 按当前站点主题初始化/重配 mermaid（白→default，黑→dark） */
function configureMermaidForSiteTheme() {
	const theme = siteIsDark() ? 'dark' : 'default';
	if (mermaidTheme === theme) return;
	mermaid.initialize({
		startOnLoad: false,
		theme,
		securityLevel: 'strict',
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
	});
	mermaidTheme = theme;
}

async function renderMermaidBlocks(opts?: { reset?: boolean }) {
	const root = document.getElementById('content') || document;
	const elements = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'));
	if (!elements.length) return;

	const themeChanged =
		(siteIsDark() && mermaidTheme !== 'dark') ||
		(!siteIsDark() && mermaidTheme !== 'default');
	const force = Boolean(opts?.reset || themeChanged);
	configureMermaidForSiteTheme();

	const toRender: HTMLElement[] = [];
	for (const el of elements) {
		if (!force && el.querySelector('svg')) continue;
		let src = '';
		const encoded = el.getAttribute('data-mermaid-code');
		if (encoded) {
			try {
				src = decodeURIComponent(encoded);
			} catch {
				src = encoded;
			}
		} else if (!el.querySelector('svg')) {
			src = el.textContent || '';
		}
		if (!src.trim()) continue;
		el.removeAttribute('data-processed');
		el.textContent = src;
		toRender.push(el);
	}
	if (!toRender.length) return;
	try {
		await mermaid.run({ nodes: toRender });
	} catch (err) {
		console.warn('[webmd] mermaid render failed', err);
	}
}

/* ========== KaTeX（插件：GitHub 启发式 $ 配对 → auto-render） ========== */

/** 插件 applyGitHubHeuristics：有效 $...$ → \(...\)，标题内跳过 */
function applyKatexGitHubHeuristics(element: HTMLElement) {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) => {
			if (!node.nodeValue || !node.nodeValue.includes('$')) {
				return NodeFilter.FILTER_SKIP;
			}
			let parent = node.parentElement;
			while (parent) {
				if (/^H[1-6]$/.test(parent.tagName)) return NodeFilter.FILTER_SKIP;
				// 代码块内不处理
				if (parent.tagName === 'CODE' || parent.tagName === 'PRE') {
					return NodeFilter.FILTER_SKIP;
				}
				if (parent.classList?.contains('mermaid')) return NodeFilter.FILTER_SKIP;
				parent = parent.parentElement;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const nodesToProcess: Text[] = [];
	let n: Node | null;
	while ((n = walker.nextNode())) nodesToProcess.push(n as Text);

	for (const textNode of nodesToProcess) {
		let text = textNode.nodeValue || '';
		const dollarPositions: { index: number; canOpen: boolean; canClose: boolean }[] =
			[];
		for (let i = 0; i < text.length; i++) {
			if (text[i] !== '$') continue;
			// 转义 \$ 跳过
			if (i > 0 && text[i - 1] === '\\') continue;
			const prevChar = i > 0 ? text.charCodeAt(i - 1) : null;
			const nextChar = i < text.length - 1 ? text.charCodeAt(i + 1) : null;
			const canOpen =
				nextChar !== null && nextChar !== 0x20 && nextChar !== 0x09;
			const isAlnum = (c: number | null) =>
				c !== null &&
				((c >= 0x30 && c <= 0x39) ||
					(c >= 0x41 && c <= 0x5a) ||
					(c >= 0x61 && c <= 0x7a));
			const canClose =
				prevChar !== null &&
				prevChar !== 0x20 &&
				prevChar !== 0x09 &&
				(nextChar === null || !isAlnum(nextChar));
			dollarPositions.push({ index: i, canOpen, canClose });
		}

		const pairs: { start: number; end: number }[] = [];
		let di = 0;
		while (di < dollarPositions.length - 1) {
			const openPos = dollarPositions[di]!;
			const nextPos = dollarPositions[di + 1]!;
			if (openPos.canOpen && nextPos.canClose) {
				// 跳过 $$ 显示公式（交给 auto-render 的 $$）
				if (nextPos.index === openPos.index + 1) {
					di++;
					continue;
				}
				pairs.push({ start: openPos.index, end: nextPos.index });
				di += 2;
			} else {
				di++;
			}
		}

		for (let pi = pairs.length - 1; pi >= 0; pi--) {
			const { start, end } = pairs[pi]!;
			const content = text.substring(start + 1, end);
			if (!/[a-zA-Z0-9]/.test(content)) continue;
			const replacement = `\\(${content}\\)`;
			text = text.substring(0, start) + replacement + text.substring(end + 1);
		}
		textNode.nodeValue = text;
	}
}

function renderKatexBlocks() {
	const el = document.querySelector<HTMLElement>('.markdown-body');
	if (!el) return;
	// 已渲染过的 katex 节点不再重复启发式破坏
	try {
		applyKatexGitHubHeuristics(el);
		renderMathInElement(el, {
			delimiters: [
				{ left: '$$', right: '$$', display: true },
				{ left: '\\[', right: '\\]', display: true },
				{ left: '\\(', right: '\\)', display: false },
			],
			throwOnError: false,
			errorColor: '#cc0000',
			strict: 'warn',
			trust: false,
			// 忽略 code / pre / mermaid
			ignoredTags: [
				'script',
				'noscript',
				'style',
				'textarea',
				'pre',
				'code',
				'option',
			],
			ignoredClasses: ['mermaid', 'webmd-code'],
		});
	} catch (err) {
		console.warn('[webmd] katex render failed', err);
	}
}

let tocSpyAbort: AbortController | null = null;

function bindTocSpy() {
	tocSpyAbort?.abort();
	tocSpyAbort = new AbortController();
	const { signal } = tocSpyAbort;

	const toc = document.getElementById('doc-toc');
	const scrollEl =
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('[data-wiki-main]');
	const content = document.getElementById('content');
	if (!toc || !scrollEl || !content) return;
	const heads = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
	if (!heads.length) return;

	const mark = () => {
		const links = [
			...toc.querySelectorAll('a'),
			...document.querySelectorAll('.mobile-toc__nav a'),
		];
		let current: Element | undefined = links[0];
		for (const h of heads) {
			if (h.getBoundingClientRect().top <= 120) {
				const hit = links.find((l) => l.getAttribute('href') === `#${h.id}`);
				if (hit) current = hit;
			}
		}
		links.forEach((l) => l.classList.toggle('is-active', l === current));
	};

	scrollEl.addEventListener('scroll', mark, { passive: true, signal });
	mark();

	document.querySelectorAll('.mobile-toc__nav a').forEach((a) => {
		a.addEventListener(
			'click',
			() => {
				const d = a.closest('details');
				if (d) d.open = false;
			},
			{ signal },
		);
	});
}

function b64ToUint8(b64: string): Uint8Array {
	const bin = atob(b64.replace(/\s/g, ''));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * PDF 预览 — 对齐 starlight PdfEmbed：
 * 构建期 base64 → Blob URL + iframe（浏览器内置 PDF）
 * 无额外工具条；不直链强制下载
 */
function bindPdfEmbeds() {
	document.querySelectorAll<HTMLElement>('.pdf-shell').forEach((root) => {
		if (root.dataset.bound) return;
		root.dataset.bound = '1';
		const status = root.querySelector<HTMLElement>('[data-pdf-status]');
		const frame = root.querySelector<HTMLIFrameElement>('[data-pdf-frame]');
		const err = root.querySelector<HTMLElement>('[data-pdf-err]');
		const el = root.querySelector('script[type="application/pdf-base64"]');
		const b64 = (el?.textContent || '').trim();
		const fallbackSrc = root.dataset.pdfSrc || '';

		const showBlob = (data: Uint8Array) => {
			if (data.byteLength < 8) throw new Error(`PDF 数据过短 (${data.byteLength})`);
			const magic = new TextDecoder('latin1').decode(data.slice(0, 5));
			if (magic !== '%PDF-') throw new Error(`无效 PDF 头: ${JSON.stringify(magic)}`);
			// 拷贝到新 ArrayBuffer，满足 BlobPart 类型
			const copy = new Uint8Array(data.byteLength);
			copy.set(data);
			const blob = new Blob([copy.buffer], { type: 'application/pdf' });
			const url = URL.createObjectURL(blob);
			root.dataset.blobUrl = url;
			if (frame) {
				// 与 starlight 一致：toolbar + navpanes + FitH
				frame.src = url + '#toolbar=1&navpanes=1&scrollbar=1&view=FitH';
				frame.hidden = false;
			}
			if (status) status.hidden = true;
		};

		if (b64) {
			try {
				showBlob(b64ToUint8(b64));
			} catch (e) {
				if (status) status.hidden = true;
				if (err) {
					err.hidden = false;
					err.textContent = e instanceof Error ? e.message : String(e);
				}
			}
			return;
		}

		// 无 base64 时再 fetch（兼容旧页）
		if (!fallbackSrc) {
			if (status) status.hidden = true;
			if (err) {
				err.hidden = false;
				err.textContent = '构建时未嵌入 PDF 数据';
			}
			return;
		}

		void (async () => {
			try {
				const res = await fetch(fallbackSrc);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				showBlob(new Uint8Array(await res.arrayBuffer()));
			} catch (e) {
				if (status) status.hidden = true;
				if (err) {
					err.hidden = false;
					err.textContent = e instanceof Error ? e.message : String(e);
				}
			}
		})();
	});

	window.addEventListener('pagehide', () => {
		document.querySelectorAll<HTMLElement>('[data-blob-url]').forEach((el) => {
			const u = el.dataset.blobUrl;
			if (u) URL.revokeObjectURL(u);
		});
	});
}

function bindSearch() {
	const mount = document.getElementById('search');
	if (!mount || !site.features.search) return;
	mountSearch(mount);
}

function bindSmoothAnchors() {
	document.addEventListener('click', (ev) => {
		const a = (ev.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
		if (!a) return;
		const id = decodeURIComponent(a.getAttribute('href') || '').slice(1);
		if (!id) return;
		const el = document.getElementById(id);
		if (!el) return;
		ev.preventDefault();
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	});
}

/** 站内文档链接：软导航，只换中间栏 + 右侧大纲，左侧树不整页闪 */
function isSoftNavLink(a: HTMLAnchorElement): boolean {
	if (a.hasAttribute('download') || a.target === '_blank') return false;
	const raw = a.getAttribute('href');
	if (
		!raw ||
		raw.startsWith('#') ||
		raw.startsWith('mailto:') ||
		raw.startsWith('javascript:')
	)
		return false;
	let url: URL;
	try {
		url = new URL(a.href, location.href);
	} catch {
		return false;
	}
	if (url.origin !== location.origin) return false;
	const p = url.pathname;
	// 原始资源 / 构建产物，不走软导航
	if (
		p.startsWith('/content/') ||
		p.startsWith('/src/') ||
		p.startsWith('/assets/') ||
		p.startsWith('/@')
	)
		return false;
	if (/\.(js|css|map|json)$/i.test(p)) return false;
	return true;
}

function syncTreeActiveFromDoc(doc: Document) {
	const tree = document.getElementById('file-tree');
	if (!tree) return;
	const active = doc.querySelector<HTMLElement>('#file-tree .tree-file.is-active');
	const path = active?.dataset.path || '';
	tree.querySelectorAll('.tree-file.is-active').forEach((el) => {
		el.classList.remove('is-active');
	});
	// 路径高亮（祖先目录主题色）
	tree.querySelectorAll('.tree-dir.is-on-path').forEach((el) => {
		el.classList.remove('is-on-path');
	});
	// 站级主页：无文件高亮，「文件」标题保持固定无状态
	if (!path || path === '__home__') {
		return;
	}
	const link = tree.querySelector<HTMLElement>(
		`.tree-file[data-path="${CSS.escape(path)}"]`,
	);
	if (link) {
		link.classList.add('is-active');
		// 展开并标记祖先目录
		let p: HTMLElement | null = link.parentElement;
		while (p && p !== tree) {
			if (p.classList.contains('tree-dir') && p instanceof HTMLDetailsElement) {
				p.open = true;
				p.classList.add('is-on-path');
			}
			p = p.parentElement;
		}
	}
}

function rebindPageWidgets() {
	bindCodeCopy();
	bindBreadcrumbActions();
	bindPdfEmbeds();
	bindTocSpy();
	// 顶栏铺满按钮不在中间栏，软导航后只需同步状态
	syncFocusReadButtons();
	// 先公式再 mermaid（避免互相干扰）
	renderKatexBlocks();
	void renderMermaidBlocks();
}

let softNavBusy = false;
/** 软导航进行中又点了别的链接：只跟最新一次 */
let softNavQueued: { href: string; push: boolean } | null = null;

function normalizePathname(p: string): string {
	if (!p || p === '/') return '/';
	// 统一无尾斜杠再比，避免 /a 与 /a/ 被当成同页误判
	return p.replace(/\/+$/, '') || '/';
}

async function softNavigate(href: string, opts?: { push?: boolean }) {
	const push = opts?.push !== false;
	const url = new URL(href, location.href);
	// 同页仅 hash：交给浏览器默认
	if (
		normalizePathname(url.pathname) === normalizePathname(location.pathname) &&
		url.search === location.search &&
		url.hash
	) {
		return;
	}
	// 忙碌时排队最新目标，避免 preventDefault 后直接 return 导致“点了没反应”
	if (softNavBusy) {
		softNavQueued = { href: url.href, push };
		return;
	}

	// 离开当前页前记下滚动与目录展开
	saveViewState(location.pathname);

	softNavBusy = true;
	const main = document.querySelector<HTMLElement>('[data-wiki-main]');
	main?.classList.add('is-soft-nav');
	// 防止异常路径卡死 busy
	const busyWatch = window.setTimeout(() => {
		if (softNavBusy) softNavBusy = false;
	}, 15000);
	try {
		const res = await fetch(url.pathname + url.search, {
			headers: { Accept: 'text/html' },
			credentials: 'same-origin',
			cache: 'no-cache',
		});
		if (!res.ok) {
			location.href = url.href;
			return;
		}
		const html = await res.text();
		const doc = new DOMParser().parseFromString(html, 'text/html');

		// 标题
		document.title = doc.title || document.title;

		// body 页面态 class（媒体页 is-image-page 等）
		const nextBodyClass = doc.body.className;
		if (nextBodyClass) document.body.className = nextBodyClass;
		else document.body.className = '';

		// 路径栏（固定顶栏，不在滚动区内）
		const nextCrumb = doc.querySelector('[data-wiki-crumb]');
		const curCrumb = document.querySelector('[data-wiki-crumb]');
		if (nextCrumb && curCrumb) {
			curCrumb.innerHTML = nextCrumb.innerHTML;
		}

		// 中间滚动区：mobile toc + article
		const nextScroll = doc.querySelector('[data-wiki-scroll]');
		const curScroll = document.querySelector('[data-wiki-scroll]');
		if (nextScroll && curScroll) {
			curScroll.innerHTML = nextScroll.innerHTML;
		} else if (!curScroll) {
			// 结构异常：硬跳转
			location.href = url.href;
			return;
		}

		// 右侧大纲
		const nextToc = doc.querySelector('#doc-toc');
		const curToc = document.querySelector('#doc-toc');
		if (nextToc && curToc) curToc.innerHTML = nextToc.innerHTML;

		// 底部分页
		const nextFooter = doc.querySelector('.wiki-page-footer');
		const curFooter = document.querySelector('.wiki-page-footer');
		if (nextFooter && curFooter) curFooter.innerHTML = nextFooter.innerHTML;

		// 先改 URL，再同步树高亮
		if (push) {
			history.pushState({ soft: true }, '', url.pathname + url.search + url.hash);
		}

		// 左侧高亮（不替换整棵树；不恢复旧 openDirs，避免盖掉当前高亮路径）
		syncTreeActiveFromDoc(doc);

		rebindPageWidgets();
		// 软导航会换路径栏按钮 DOM：重申用户锁定的固定/铺满
		reassertContentWidthMode();
		updateContentReadableMax();
		if (isMobile()) setMobileDrawer(false);

		// 只恢复主栏/大纲滚动；目录展开以当前树 + 高亮路径为准
		const saved = loadViewState(url.pathname);
		const scrollEl = document.querySelector<HTMLElement>('[data-wiki-scroll]');
		if (scrollEl) {
			if (url.hash) {
				const id = decodeURIComponent(url.hash.slice(1));
				const target = id ? document.getElementById(id) : null;
				if (target) target.scrollIntoView({ block: 'start' });
				else scrollEl.scrollTop = saved?.scrollMain ?? 0;
			} else if (saved && saved.scrollMain > 0) {
				scrollEl.scrollTop = saved.scrollMain;
			} else {
				scrollEl.scrollTop = 0;
			}
		}
		const tocEl = document.querySelector<HTMLElement>('#doc-toc');
		if (tocEl && saved) tocEl.scrollTop = saved.scrollToc || 0;
	} catch {
		location.href = url.href;
	} finally {
		window.clearTimeout(busyWatch);
		main?.classList.remove('is-soft-nav');
		softNavBusy = false;
		const q = softNavQueued;
		softNavQueued = null;
		if (q) {
			void softNavigate(q.href, { push: q.push });
		}
	}
}

function bindSoftNav() {
	document.addEventListener(
		'click',
		(ev) => {
			if (ev.button !== 0) return;
			if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
			const a = (ev.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
			if (!a || !isSoftNavLink(a)) return;
			// 仅拦截站内导航相关区域 + 正文内链
			if (
				!a.closest('#file-tree') &&
				!a.closest('.wiki-page-footer') &&
				!a.closest('#content') &&
				!a.closest('.wiki-breadcrumb') &&
				!a.closest('.home-hero') &&
				!a.closest('.brand')
			) {
				return;
			}
			const url = new URL(a.href, location.href);
			// 纯 hash（同页锚点）
			if (
				normalizePathname(url.pathname) === normalizePathname(location.pathname) &&
				url.search === location.search &&
				url.hash
			) {
				return;
			}
			// 已被其它逻辑取消时，仍尝试软导航（勿因 defaultPrevented 直接放弃）
			ev.preventDefault();
			ev.stopPropagation();
			void softNavigate(url.href, { push: true });
		},
		true,
	);

	window.addEventListener('popstate', () => {
		void softNavigate(location.href, { push: false });
	});
}

/* ========== 刷新 / 软导航：保持滚动条与目录展开 ========== */
const VIEW_PREFIX = 'webmd-view:';

type ViewState = {
	scrollMain: number;
	scrollTree: number;
	scrollToc: number;
	/** 左侧展开目录的 data-path */
	openDirs: string[];
	/** 可选：hash（URL 已有则优先 URL） */
	hash?: string;
};

function viewStorageKey(path = location.pathname): string {
	return VIEW_PREFIX + (path || '/');
}

function scrollEls() {
	return {
		main: document.querySelector<HTMLElement>('[data-wiki-scroll]'),
		tree:
			document.querySelector<HTMLElement>('.tree-body') ||
			document.querySelector<HTMLElement>('#file-tree'),
		toc: document.querySelector<HTMLElement>('#doc-toc'),
	};
}

function captureOpenDirs(): string[] {
	const out: string[] = [];
	document.querySelectorAll<HTMLDetailsElement>('#file-tree details.tree-dir[open]').forEach((d) => {
		const p = d.dataset.path;
		if (p) out.push(p);
	});
	return out;
}

function applyOpenDirs(paths: string[]) {
	const set = new Set(paths);
	document.querySelectorAll<HTMLDetailsElement>('#file-tree details.tree-dir').forEach((d) => {
		const p = d.dataset.path;
		if (!p) return;
		d.open = set.has(p);
	});
}

function saveViewState(path = location.pathname) {
	const { main, tree, toc } = scrollEls();
	const state: ViewState = {
		scrollMain: main?.scrollTop ?? 0,
		scrollTree: tree?.scrollTop ?? 0,
		scrollToc: toc?.scrollTop ?? 0,
		openDirs: captureOpenDirs(),
		hash: location.hash || undefined,
	};
	try {
		sessionStorage.setItem(viewStorageKey(path), JSON.stringify(state));
	} catch {
		/* ignore */
	}
}

function loadViewState(path = location.pathname): ViewState | null {
	try {
		const raw = sessionStorage.getItem(viewStorageKey(path));
		if (!raw) return null;
		const j = JSON.parse(raw) as Partial<ViewState>;
		return {
			scrollMain: Number(j.scrollMain) || 0,
			scrollTree: Number(j.scrollTree) || 0,
			scrollToc: Number(j.scrollToc) || 0,
			openDirs: Array.isArray(j.openDirs) ? j.openDirs.map(String) : [],
			hash: typeof j.hash === 'string' ? j.hash : undefined,
		};
	} catch {
		return null;
	}
}

function restoreViewState(path = location.pathname) {
	const st = loadViewState(path);
	if (!st) return;

	applyOpenDirs(st.openDirs);

	const applyScroll = () => {
		const { main, tree, toc } = scrollEls();
		if (tree) tree.scrollTop = st.scrollTree;
		if (toc) toc.scrollTop = st.scrollToc;
		// 有 hash 时让锚点优先；否则恢复主栏滚动
		if (location.hash) {
			const id = decodeURIComponent(location.hash.slice(1));
			const target = id ? document.getElementById(id) : null;
			if (target) {
				target.scrollIntoView({ block: 'start' });
				return;
			}
		}
		if (main) main.scrollTop = st.scrollMain;
	};

	// 布局/字体/图片可能改变高度：多帧再设一次
	applyScroll();
	requestAnimationFrame(() => {
		applyScroll();
		requestAnimationFrame(applyScroll);
	});
	window.addEventListener('load', applyScroll, { once: true });
}

function bindViewPersistence() {
	// 禁止浏览器只恢复 window 滚动（中栏是独立滚动容器）
	try {
		if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
	} catch {
		/* ignore */
	}

	// 滚动时节流写入，刷新前尽量有最新位置
	let t: number | null = null;
	const schedule = () => {
		if (t != null) return;
		t = window.setTimeout(() => {
			t = null;
			saveViewState();
		}, 120);
	};

	const { main, tree, toc } = scrollEls();
	main?.addEventListener('scroll', schedule, { passive: true });
	tree?.addEventListener('scroll', schedule, { passive: true });
	toc?.addEventListener('scroll', schedule, { passive: true });

	// 目录展开/折叠
	document.getElementById('file-tree')?.addEventListener(
		'toggle',
		(ev) => {
			const t = ev.target as HTMLElement;
			if (t instanceof HTMLDetailsElement && t.classList.contains('tree-dir')) {
				schedule();
			}
		},
		true,
	);

	// 刷新 / 关页 / 跳转前落盘
	window.addEventListener('pagehide', () => saveViewState());
	window.addEventListener('beforeunload', () => saveViewState());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') saveViewState();
	});
}

bindTheme();
bindToggles();
bindGutters();
bindCodeCopy();
bindContentWidth();
bindBreadcrumbActions();
bindFocusRead();
bindFileTreeSort();
bindTocSpy();
bindPdfEmbeds();
bindSmoothAnchors();
bindSoftNav();
bindSearch();
bindViewPersistence();
restoreViewState();
renderKatexBlocks();
void renderMermaidBlocks().then(() => {
	// Mermaid 渲染后高度变化，再恢复一次主栏滚动
	restoreViewState();
});
