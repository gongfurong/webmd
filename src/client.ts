/**
 * 静态页客户端：布局拖拽/收起、移动端抽屉、代码复制、大纲、PDF.js 阅读器、搜索
 * 布局契约对齐 starlight-vanilla：[nav | g | center[main | g | toc]]
 */
import site from '../site.config';
import './style.css';
import 'katex/dist/katex.min.css';
import { mountSearch } from './search/ui';
import renderMathInElement from 'katex/contrib/auto-render';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { bindExcelViewers, prefetchSheetEngines } from './excel-viewer';
import { renderMermaidBlocks } from './previews/mermaid';
import { renderPlantumlBlocks } from './previews/plantuml';
import { renderGraphvizBlocks } from './previews/graphviz';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 构建注入（vite define）；仅展示/调试，不驱动缓存失效 */
declare const __WEBMD_VERSION__: string;
declare const __WEBMD_COMMIT__: string;
declare const __WEBMD_BUILT_AT__: string;
declare const __WEBMD_LABEL__: string;

const WEBMD_BUILD = {
	version: typeof __WEBMD_VERSION__ !== 'undefined' ? __WEBMD_VERSION__ : '0.0.0',
	commit: typeof __WEBMD_COMMIT__ !== 'undefined' ? __WEBMD_COMMIT__ : '',
	builtAt: typeof __WEBMD_BUILT_AT__ !== 'undefined' ? __WEBMD_BUILT_AT__ : '',
	label: typeof __WEBMD_LABEL__ !== 'undefined' ? __WEBMD_LABEL__ : '0.0.0',
};

// 控制台 / 调试：window.__WEBMD__
try {
	(
		window as unknown as {
			__WEBMD__?: typeof WEBMD_BUILD;
		}
	).__WEBMD__ = WEBMD_BUILD;
	console.info(
		`[WebMD] ${WEBMD_BUILD.label}` +
			(WEBMD_BUILD.builtAt ? ` · built ${WEBMD_BUILD.builtAt}` : ''),
	);
} catch {
	/* ignore */
}

const STORAGE = 'webmd-layout-v2';
/** 三栏分割线宽度（细线）；拖拽热区靠 CSS 伪元素扩大，不占额外空白 */
const GUTTER = 1;

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
	// 浏览器顶栏/PWA 状态栏色随主题
	document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
		m.setAttribute('content', isDark ? '#0d1117' : '#ffffff');
	});
	document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((btn) => {
		btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
		// 当前浅色 → 显示月亮（点一下切深色）；当前深色 → 显示太阳
		btn.title = isDark ? '切换浅色模式' : '切换深色模式';
		btn.setAttribute('aria-label', isDark ? '切换浅色模式' : '切换深色模式');
	});
	// 图示主题跟站点：切换后强制重绘
	void renderMermaidBlocks({ reset: true });
	void renderPlantumlBlocks({ reset: true });
	void renderGraphvizBlocks({ reset: true });
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

/**
 * 很窄视口（默认 ≤640）：顶栏紧凑布局等。
 * 与设备类型无关——宽屏缩窗也会进入。
 */
function isNarrowViewport(): boolean {
	return window.matchMedia(`(max-width: ${site.layout.navHideBelow}px)`).matches;
}

/**
 * 抽屉视口：
 * - 宽度 ≤ tocHideBelow（默认 900）
 * - 或「矮屏 + 不太宽」：手机横屏常见 800–1000×390，宽度略超 900 时若仍用桌面三栏，
 *   左右栏吃掉中栏 → 固定版心又按 视口−280−240 算会又窄又不居中
 */
function isDrawerViewport(): boolean {
	if (window.matchMedia(`(max-width: ${site.layout.tocHideBelow}px)`).matches) {
		return true;
	}
	// 横屏手机 / 矮窗：强制抽屉（与 CSS 媒体条件保持一致）
	return window.matchMedia('(max-height: 500px) and (max-width: 1100px)').matches;
}

/** 宽屏下大纲栏是否可用（宽度大于 tocHideBelow） */
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
	if (isNarrowViewport()) return;
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

	const narrow = isNarrowViewport();
	// ≤tocHideBelow：左右都改上层抽屉，grid 不再为侧栏留列
	const drawerUi = isDrawerViewport();
	// 右栏大纲：仅宽屏分栏模式可「常驻展开」；抽屉模式不占列
	const tocAvailable = !drawerUi && isTocBreakpoint();
	const navOpen = !drawerUi && !s.navCollapsed;
	const tocOpen = tocAvailable && !s.tocCollapsed;

	const navW = navOpen ? s.nav : 0;
	const tocW = tocOpen ? s.toc : 0;
	// 收起侧栏时仍保留 1px 分割线（抽屉模式不占列）
	const gNav = drawerUi ? 0 : GUTTER;
	const gToc = drawerUi || !tocAvailable ? 0 : GUTTER;

	shell.style.setProperty('--wiki-nav', `${navW}px`);
	shell.style.setProperty('--wiki-g-nav', `${gNav}px`);
	shell.style.setProperty('--wiki-toc', `${tocW}px`);
	shell.style.setProperty('--wiki-g-toc', `${gToc}px`);
	document.documentElement.style.setProperty('--header-h', `${site.layout.headerHeight}px`);

	// 抽屉模式：不打 nav-collapsed / edge-visible（否则会留左侧 rail 长条占位）
	shell.classList.toggle('nav-collapsed', !drawerUi && s.navCollapsed);
	// 抽屉模式：不要 toc-collapsed，否则 visibility/pointer-events 锁死抽屉
	shell.classList.toggle('toc-collapsed', !tocOpen && !drawerUi);
	// has-toc-col = 右栏「占位列」存在（展开大纲 或 收起竖条+分割线），
	// 勿用 tocOpen：收起时若去掉 has-toc-col，:not(.has-toc-col) 会把 gutter/rail 列清成 0
	// → 右侧无分割线、无大纲竖条图标。
	shell.classList.toggle('has-toc-col', tocAvailable || drawerUi);
	shell.classList.toggle('nav-edge-visible', !drawerUi && s.navCollapsed);
	shell.classList.toggle('toc-edge-visible', tocAvailable && s.tocCollapsed);
	shell.classList.toggle('is-narrow', narrow);
	shell.classList.toggle('is-drawer-ui', drawerUi);
	// 大纲栏始终由用户控制显隐，勿 hidden 自动藏栏
	const tocPane = shell.querySelector<HTMLElement>('[data-wiki-toc]');
	const tocGutter = shell.querySelector<HTMLElement>('[data-wiki-gutter="toc"]');
	if (tocPane) {
		tocPane.hidden = false;
		tocPane.removeAttribute('aria-hidden');
	}
	if (tocGutter) {
		tocGutter.hidden = false;
	}
	// 两侧都收起：阅读区接近整屏（仅宽屏分栏）
	shell.classList.toggle(
		'panels-collapsed',
		!drawerUi && s.navCollapsed && (!tocAvailable || s.tocCollapsed),
	);

	// 边缘长条：只在宽屏收起侧栏时出现；抽屉模式一律隐藏
	document.querySelectorAll<HTMLElement>('.wiki-edge-btn--nav').forEach((b) => {
		b.hidden = drawerUi || !s.navCollapsed;
	});
	document.querySelectorAll<HTMLElement>('.wiki-edge-btn--toc').forEach((b) => {
		b.hidden = !tocAvailable || !s.tocCollapsed;
	});
	document
		.querySelectorAll<HTMLElement>(
			'[data-wiki-footer-collapse="nav"], [data-wiki-header-collapse="nav"]',
		)
		.forEach((b) => {
			b.hidden = drawerUi || !navOpen;
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
	// 先写完分栏 CSS 变量再量中栏，避免读到旧宽度
	void shell.offsetWidth;
	updateContentReadableMax(s);
	// 侧栏开合后重申模式（防 DOM/状态不同步）
	reassertContentWidthMode();
	saveState(s);
	syncFocusReadButtons();
	// 中栏宽度变了 → 路径/分页中间省略重算；再量一次版心
	// 表格由中栏 ResizeObserver 响应，勿在此无脑 dispatch resize（会闪烁）
	requestAnimationFrame(() => {
		updateContentReadableMax(s);
		refreshAllMiddleEllipsis();
	});
}

function syncDrawerBackdrop() {
	const open =
		document.body.classList.contains('nav-drawer-open') ||
		document.body.classList.contains('toc-drawer-open');
	const backdrop = document.querySelector<HTMLElement>('[data-wiki-backdrop]');
	if (backdrop) backdrop.hidden = !open;
}

function setNavDrawer(open: boolean) {
	document.body.classList.toggle('nav-drawer-open', open);
	if (open) document.body.classList.remove('toc-drawer-open');
	syncDrawerBackdrop();
}

function setTocDrawer(open: boolean) {
	document.body.classList.toggle('toc-drawer-open', open);
	if (open) document.body.classList.remove('nav-drawer-open');
	syncDrawerBackdrop();
}

function closeAllDrawers() {
	document.body.classList.remove('nav-drawer-open', 'toc-drawer-open');
	syncDrawerBackdrop();
}

/** 把 document / visualViewport 滚回 0，避免窄屏整页被带跑后看不见 header */
function pinDocumentScroll() {
	try {
		window.scrollTo(0, 0);
	} catch {
		/* ignore */
	}
	document.documentElement.scrollTop = 0;
	document.body.scrollTop = 0;
	try {
		// iOS 有时只动 visualViewport
		const vv = window.visualViewport;
		if (vv && typeof (vv as VisualViewport & { offsetTop?: number }).offsetTop === 'number') {
			// 无法直接设 visualViewport.offsetTop；靠 body fixed + scroll 0 兜底
		}
	} catch {
		/* ignore */
	}
}

/** 实测顶栏高度（含 safe-area），供抽屉/遮罩 top 对齐，避免盖住或漏缝 */
function syncAppHeaderOffset() {
	const header = document.querySelector<HTMLElement>('.app-header');
	const h = header?.getBoundingClientRect().height;
	const px = h && h > 0 ? `${Math.round(h)}px` : null;
	if (px) {
		document.documentElement.style.setProperty('--app-header-offset', px);
	} else {
		document.documentElement.style.removeProperty('--app-header-offset');
	}
}

/**
 * iOS Safari 地址栏显隐会改 visualViewport：用其高度贴合 body，尽量多占可视区。
 * 无法强制隐藏浏览器栏；「添加到主屏幕」standalone 才真正无地址栏。
 */
function syncVisualViewportShell() {
	const vv = window.visualViewport;
	const body = document.body;
	if (!body?.classList.contains('wiki-body')) return;
	if (!vv) {
		body.style.removeProperty('height');
		return;
	}
	// 仅在与 layout viewport 差异明显时写入，避免干扰桌面
	const layoutH = window.innerHeight;
	const visualH = vv.height;
	if (Math.abs(layoutH - visualH) < 2 && Math.abs(vv.offsetTop) < 1) {
		body.style.removeProperty('height');
		body.style.removeProperty('top');
		body.style.removeProperty('transform');
		return;
	}
	body.style.height = `${Math.round(visualH)}px`;
	// 地址栏收起/展开时 offsetTop 可能非 0，避免整页悬空
	if (vv.offsetTop > 0.5) {
		body.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
	} else {
		body.style.removeProperty('transform');
	}
	syncAppHeaderOffset();
}

function bindVisualViewportShell() {
	const vv = window.visualViewport;
	const onChange = () => {
		syncVisualViewportShell();
	};
	if (vv) {
		vv.addEventListener('resize', onChange);
		vv.addEventListener('scroll', onChange);
	}
	window.addEventListener('resize', onChange);
	window.addEventListener('orientationchange', () => {
		window.setTimeout(onChange, 50);
		window.setTimeout(onChange, 300);
	});
	onChange();
}

/**
 * 在指定滚动容器内滚到目标，禁止用 Element.scrollIntoView（会带动 window/body，
 * 窄屏常见后果：整页上移、顶栏滚出视口、页面“卡住”）。
 */
function scrollElWithinPane(
	el: HTMLElement,
	pane: HTMLElement | null | undefined,
	opts?: { behavior?: ScrollBehavior; offset?: number },
) {
	// 默认 auto：smooth 会与软导航抢同一滚动容器（见 forcePaneScrollTop 注释）
	const behavior = opts?.behavior ?? 'auto';
	const offset = opts?.offset ?? 8;
	if (!pane) {
		// 无独立滚动容器时仍避免 scrollIntoView 动 window：用最近可滚祖先
		let p: HTMLElement | null = el.parentElement;
		while (p && p !== document.body) {
			const st = getComputedStyle(p);
			const oy = st.overflowY;
			if (
				(oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
				p.scrollHeight > p.clientHeight + 1
			) {
				pane = p;
				break;
			}
			p = p.parentElement;
		}
	}
	if (!pane) {
		pinDocumentScroll();
		return;
	}
	// 先取消可能进行中的 smooth
	try {
		pane.style.scrollBehavior = 'auto';
	} catch {
		/* ignore */
	}
	const er = el.getBoundingClientRect();
	const pr = pane.getBoundingClientRect();
	const next = pane.scrollTop + (er.top - pr.top) - offset;
	const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
	const top = Math.max(0, Math.min(max, next));
	if (behavior === 'smooth') {
		try {
			pane.scrollTo({ top, left: 0, behavior: 'smooth' });
		} catch {
			pane.scrollTop = top;
		}
	} else {
		forcePaneScrollTop(pane, top);
	}
	pinDocumentScroll();
}

/** 清理可能卡住的滚动锁 / 抽屉态（搜索关闭失败、软导航中断等） */
function resetViewportChrome() {
	const dlg = document.querySelector<HTMLDialogElement>('.ms-dialog');
	// 搜索 dialog 仍打开时保留 modal 锁，只清抽屉与 document 滚动
	if (!dlg?.open) {
		document.body.removeAttribute('data-search-modal-open');
		document.documentElement.removeAttribute('data-search-modal-open');
		document.body.style.removeProperty('touch-action');
		document.documentElement.style.removeProperty('touch-action');
	}
	document.body.classList.remove(
		'nav-drawer-open',
		'toc-drawer-open',
		'is-col-resizing',
	);
	// 不要 removeProperty('position')：body 靠 CSS position:fixed 钉住视口
	document.body.style.removeProperty('overflow');
	document.body.style.removeProperty('top');
	document.body.style.removeProperty('width');
	document.body.style.removeProperty('left');
	document.body.style.removeProperty('right');
	document.body.style.removeProperty('height');
	document.documentElement.style.removeProperty('overflow');
	pinDocumentScroll();
	syncAppHeaderOffset();
	syncDrawerBackdrop();
	// 软导航中断时可能残留
	document.querySelector<HTMLElement>('[data-wiki-main]')?.classList.remove('is-soft-nav');
}

function bindToggles() {
	applyLayout(loadState());
	document.querySelectorAll('[data-wiki-toggle]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const s = loadState();
			const which = (btn as HTMLElement).dataset.wikiToggle;
			const el = btn as HTMLElement;

			// 抽屉视口：左右统一上层抽屉，不改 grid 分栏状态
			if (isDrawerViewport() && which === 'nav') {
				setNavDrawer(!document.body.classList.contains('nav-drawer-open'));
				return;
			}
			if (isDrawerViewport() && which === 'toc') {
				setTocDrawer(!document.body.classList.contains('toc-drawer-open'));
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
		closeAllDrawers();
	});
	document.getElementById('file-tree')?.addEventListener('click', (ev) => {
		const t = ev.target as HTMLElement;
		if (isDrawerViewport() && t.closest('a.tree-file')) setNavDrawer(false);
	});
	// 点大纲锚点后关闭抽屉
	document.getElementById('doc-toc')?.addEventListener('click', (ev) => {
		const t = ev.target as HTMLElement;
		if (isDrawerViewport() && t.closest('a[href^="#"]')) setTocDrawer(false);
	});
	window.addEventListener('resize', () => {
		applyLayout(loadState());
		if (!isDrawerViewport()) {
			setNavDrawer(false);
			setTocDrawer(false);
		}
		syncAppHeaderOffset();
		pinDocumentScroll();
	});
	window.addEventListener('orientationchange', () => {
		window.setTimeout(() => {
			resetViewportChrome();
			applyLayout(loadState());
		}, 50);
		window.setTimeout(() => {
			syncAppHeaderOffset();
			pinDocumentScroll();
		}, 300);
	});
	// 从后台回到前台 / bfcache 恢复时清掉卡住的锁
	window.addEventListener('pageshow', () => {
		resetViewportChrome();
		applyLayout(loadState());
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			// 仅清异常锁：若搜索 dialog 仍 open 则保留 modal 标记
			const dlg = document.querySelector<HTMLDialogElement>('.ms-dialog');
			if (!dlg?.open) {
				document.body.removeAttribute('data-search-modal-open');
				document.documentElement.removeAttribute('data-search-modal-open');
				document.body.style.removeProperty('touch-action');
			}
			pinDocumentScroll();
			syncAppHeaderOffset();
		}
	});
	// iOS 地址栏伸缩 / 软键盘：visualViewport 变化时把 document 钉回 0
	const vv = window.visualViewport;
	if (vv) {
		const onVv = () => {
			pinDocumentScroll();
			syncAppHeaderOffset();
		};
		vv.addEventListener('resize', onVv);
		vv.addEventListener('scroll', onVv);
	}
	// 任何 window 滚动都立刻拉回（双保险）
	window.addEventListener(
		'scroll',
		() => {
			if (window.scrollY !== 0 || window.scrollX !== 0) pinDocumentScroll();
		},
		{ passive: true },
	);
	syncAppHeaderOffset();
	// 首帧布局后再量一次顶栏
	requestAnimationFrame(() => syncAppHeaderOffset());
}

function bindGutters() {
	document.querySelectorAll<HTMLElement>('[data-wiki-gutter]').forEach((g) => {
		g.addEventListener('pointerdown', (ev) => {
			if (isNarrowViewport()) return;
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
/** 同层文件夹手风琴：开启后每层只展开一个 */
const TREE_ACCORDION_KEY = 'webmd-tree-accordion';

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
	// 默认：文件在上（文上）；名升 / 单开 见 getTreeSortOrder / getTreeAccordion
	return 'files-first';
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

/** 默认单开；仅 localStorage 明确为 0 时才多开 */
function getTreeAccordion(): boolean {
	try {
		const v = localStorage.getItem(TREE_ACCORDION_KEY);
		if (v === '0') return false;
		if (v === '1') return true;
	} catch {
		/* ignore */
	}
	return true;
}

function setTreeAccordion(on: boolean) {
	try {
		localStorage.setItem(TREE_ACCORDION_KEY, on ? '1' : '0');
	} catch {
		/* ignore */
	}
}

function syncTreeAccordionBtn() {
	const tree = document.getElementById('file-tree');
	const btn = tree?.querySelector<HTMLButtonElement>('[data-tree-accordion]');
	if (!btn) return;
	const on = getTreeAccordion();
	const label = on ? '单开' : '多开';
	btn.dataset.on = on ? '1' : '0';
	btn.setAttribute('aria-pressed', on ? 'true' : 'false');
	btn.classList.toggle('is-on', on);
	const labelEl = btn.querySelector('.tree-accordion-btn__label');
	if (labelEl) labelEl.textContent = label;
	else btn.textContent = label;
	if (on) {
		btn.title =
			'单开：只展开「当前文件路径」与 focus 目录相关文件夹，其余折叠（点击切换为多开）';
		btn.setAttribute('aria-label', '文件夹展开：单开');
	} else {
		btn.title =
			'多开：可同时展开多个文件夹；当前路径与 focus 仍会保持展开（点击切换为单开）';
		btn.setAttribute('aria-label', '文件夹展开：多开');
	}
}

/* ========== 文件树三态 ==========
 * 常规：无 is-on-path / is-tree-focus
 * 进入（is-on-path）：当前打开的文件祖先目录
 * focus（is-tree-focus）：用户点文件夹，或打开文件时 focus 到文件所在目录
 * 单开：仅展开「进入链 ∪ focus 链」；多开：保证这两条链展开，其余不强制关
 */
/** content 相对路径：当前 focus 的文件夹（至多一个） */
let treeFocusDirPath = '';
/** 程序改 open 时跳过 toggle 监听，避免循环 */
let treeStateApplying = false;

function normalizeTreeRel(path: string): string {
	return (path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/** 文件 content 路径 → 所在目录（根下文件则 ''） */
function parentDirOfFile(filePath: string): string {
	const rel = normalizeTreeRel(filePath);
	if (!rel) return '';
	const i = rel.lastIndexOf('/');
	return i < 0 ? '' : rel.slice(0, i);
}

/** 目录自身 + 全部祖先路径 */
function dirAncestorChain(dirPath: string): string[] {
	const rel = normalizeTreeRel(dirPath);
	if (!rel) return [];
	const parts = rel.split('/').filter(Boolean);
	const out: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		out.push(parts.slice(0, i + 1).join('/'));
	}
	return out;
}

function getActiveTreeFilePath(tree: HTMLElement): string {
	const active = tree.querySelector<HTMLElement>('.tree-file.is-active');
	const p = active?.dataset.path || '';
	if (!p || p === '__home__') return '';
	return normalizeTreeRel(p);
}

/**
 * 应用进入 / focus class 与 open 集合。
 * opts.scroll / flash：定位 focus 目录（路径栏、正文文件夹链）
 */
function applyTreeOpenState(opts?: {
	scroll?: boolean;
	flash?: boolean;
	/** 滚动目标：默认 focus 目录；打开文件时可滚到文件 */
	scrollFilePath?: string;
}): void {
	const tree = document.getElementById('file-tree');
	if (!tree) return;

	const filePath = getActiveTreeFilePath(tree);
	const enterParent = parentDirOfFile(filePath);
	const mustOpen = new Set<string>();
	for (const d of dirAncestorChain(enterParent)) mustOpen.add(d);
	const focusRel = normalizeTreeRel(treeFocusDirPath);
	for (const d of dirAncestorChain(focusRel)) mustOpen.add(d);

	treeStateApplying = true;
	try {
		// —— class：进入 / focus ——
		tree.querySelectorAll('.tree-dir.is-on-path').forEach((el) => {
			el.classList.remove('is-on-path');
		});
		tree.querySelectorAll('.tree-dir.is-tree-focus').forEach((el) => {
			el.classList.remove('is-tree-focus');
		});

		for (const d of dirAncestorChain(enterParent)) {
			const el = tree.querySelector(`.tree-dir[data-path="${CSS.escape(d)}"]`);
			el?.classList.add('is-on-path');
		}
		if (focusRel) {
			const fel = tree.querySelector(
				`.tree-dir[data-path="${CSS.escape(focusRel)}"]`,
			);
			fel?.classList.add('is-tree-focus');
		}

		// —— open ——
		const accordion = getTreeAccordion();
		tree.querySelectorAll<HTMLDetailsElement>('details.tree-dir').forEach((d) => {
			const p = d.dataset.path || '';
			if (accordion) {
				// 单开：不在「进入∪focus」链上的一律折叠
				d.open = mustOpen.has(p);
			} else if (mustOpen.has(p)) {
				// 多开：只保证链上展开，不关用户已开的其它夹
				d.open = true;
			}
		});
	} finally {
		treeStateApplying = false;
	}

	const pane =
		tree.querySelector<HTMLElement>('.tree-body') ||
		document.querySelector<HTMLElement>('.tree-body');

	if (opts?.scrollFilePath) {
		const fp = normalizeTreeRel(opts.scrollFilePath);
		const fileEl = tree.querySelector<HTMLElement>(
			`.tree-file[data-path="${CSS.escape(fp)}"]`,
		);
		if (fileEl) {
			if (opts.flash) {
				fileEl.classList.remove('is-tree-flash');
				void fileEl.offsetWidth;
				fileEl.classList.add('is-tree-flash');
				window.setTimeout(() => fileEl.classList.remove('is-tree-flash'), 1400);
			}
			if (opts.scroll !== false) {
				requestAnimationFrame(() => {
					scrollElWithinPane(fileEl, pane, { behavior: 'auto', offset: 10 });
				});
			}
			return;
		}
	}

	if ((opts?.scroll || opts?.flash) && focusRel) {
		const focusEl = tree.querySelector<HTMLElement>(
			`.tree-dir[data-path="${CSS.escape(focusRel)}"]`,
		);
		if (!focusEl) return;
		const scrollTarget =
			focusEl.querySelector<HTMLElement>(':scope > .tree-dir__summary') ||
			focusEl;
		if (opts.flash) {
			focusEl.classList.remove('is-tree-flash');
			void focusEl.offsetWidth;
			focusEl.classList.add('is-tree-flash');
			window.setTimeout(() => focusEl.classList.remove('is-tree-flash'), 1400);
		}
		if (opts.scroll) {
			requestAnimationFrame(() => {
				scrollElWithinPane(scrollTarget, pane, { behavior: 'auto', offset: 10 });
				requestAnimationFrame(() => {
					scrollElWithinPane(scrollTarget, pane, {
						behavior: 'auto',
						offset: 10,
					});
				});
			});
		}
	}
}

/** 设置 focus 目录（点文件夹 / 路径栏 / 正文链） */
function setTreeFocusDir(
	dirPath: string,
	opts?: { scroll?: boolean; flash?: boolean },
): void {
	treeFocusDirPath = normalizeTreeRel(dirPath);
	applyTreeOpenState({
		scroll: opts?.scroll ?? true,
		flash: opts?.flash ?? true,
	});
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
		groupBtn.classList.toggle(
			'is-active',
			group === 'files-first' || group === 'dirs-first',
		);
	}

	// 名序/分组变了 → 上一页/下一页按树中当前文件顺序重算
	refreshWikiPagerFromTree();
}

/** 转义 HTML 文本/属性（分页按钮动态生成用） */
function escapeHtmlText(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function treeFileDisplayName(a: HTMLAnchorElement): string {
	return (
		a.dataset.sortName ||
		a.querySelector('.tree-label')?.textContent?.trim() ||
		a.getAttribute('title') ||
		a.textContent?.trim() ||
		''
	);
}

/**
 * 按左侧文件树「当前 DOM 顺序」刷新底部分页上一页/下一页。
 * 构建期 pager 跟扫描顺序；客户端改名序/分组后必须重算。
 */
function refreshWikiPagerFromTree() {
	const footer = document.querySelector<HTMLElement>('.wiki-page-footer');
	if (!footer) return;

	const tree = document.getElementById('file-tree');
	if (!tree) return;

	const files = [
		...tree.querySelectorAll<HTMLAnchorElement>('a.tree-file[href]'),
	];
	if (files.length === 0) return;

	let idx = files.findIndex((a) => a.classList.contains('is-active'));
	if (idx < 0) {
		const here = normalizePathname(location.pathname);
		idx = files.findIndex((a) => {
			try {
				return (
					normalizePathname(new URL(a.href, location.href).pathname) === here
				);
			} catch {
				return false;
			}
		});
	}
	// 主页等非文件页：不动 footer
	if (idx < 0) return;

	const prev = idx > 0 ? files[idx - 1]! : null;
	const next = idx < files.length - 1 ? files[idx + 1]! : null;

	const prevName = prev ? treeFileDisplayName(prev) : '';
	const nextName = next ? treeFileDisplayName(next) : '';
	const prevHref = prev?.getAttribute('href') || '';
	const nextHref = next?.getAttribute('href') || '';

	const prevHtml = prev
		? `<a class="wiki-pager__btn wiki-pager__btn--prev" href="${escapeHtmlText(prevHref)}" rel="prev" title="上一页：${escapeHtmlText(prevName)}"><span class="wiki-pager__chevron">‹</span><span class="wiki-pager__text"><span class="wiki-pager__fixed">上一页（</span><span class="wiki-pager__name" data-middle-ellipsis data-ellipsis-full="${escapeHtmlText(prevName)}">${escapeHtmlText(prevName)}</span><span class="wiki-pager__fixed">）</span></span></a>`
		: `<span class="wiki-pager__slot"></span>`;
	const nextHtml = next
		? `<a class="wiki-pager__btn wiki-pager__btn--next" href="${escapeHtmlText(nextHref)}" rel="next" title="下一页：${escapeHtmlText(nextName)}"><span class="wiki-pager__text"><span class="wiki-pager__fixed">（</span><span class="wiki-pager__name" data-middle-ellipsis data-ellipsis-full="${escapeHtmlText(nextName)}">${escapeHtmlText(nextName)}</span><span class="wiki-pager__fixed">）下一页</span></span><span class="wiki-pager__chevron">›</span></a>`
		: `<span class="wiki-pager__slot"></span>`;
	const single = !(prev && next) ? ' wiki-pager--single' : '';
	footer.innerHTML = `<div class="wiki-pager${single}">${prevHtml}${nextHtml}</div>`;

	// 新分页文件名需要中间省略
	requestAnimationFrame(() => refreshAllMiddleEllipsis(footer));
}

function bindFileTreeSort() {
	const tree = document.getElementById('file-tree');
	if (!tree) return;
	// 首屏 / 重绑：进入由 is-active 推导，focus 默认同文件所在目录
	const active0 = tree.querySelector<HTMLElement>('.tree-file.is-active');
	const p0 = active0?.dataset.path;
	if (p0 && p0 !== '__home__') {
		treeFocusDirPath = parentDirOfFile(p0);
	}
	if (tree.dataset.treeToolsBound === '1') {
		applyFileTreeSort();
		syncTreeAccordionBtn();
		applyTreeOpenState();
		return;
	}
	tree.dataset.treeToolsBound = '1';
	applyFileTreeSort();
	syncTreeAccordionBtn();
	applyTreeOpenState();

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

	tree.querySelector<HTMLButtonElement>('[data-tree-accordion]')?.addEventListener(
		'click',
		(e) => {
			e.preventDefault();
			e.stopPropagation();
			const next = !getTreeAccordion();
			setTreeAccordion(next);
			syncTreeAccordionBtn();
			// 切到单开：立刻按「进入∪focus」收拢；多开只保证链上展开
			applyTreeOpenState();
		},
	);

	// 用户点 summary 展开/折叠 → 改 focus（进入态只由当前文件决定）
	tree.addEventListener(
		'toggle',
		(ev) => {
			if (treeStateApplying) return;
			const t = ev.target;
			if (!(t instanceof HTMLDetailsElement) || !t.classList.contains('tree-dir')) {
				return;
			}
			const path = normalizeTreeRel(t.dataset.path || '');
			if (!path) return;
			if (t.open) {
				// 点开文件夹 = focus 到该目录
				treeFocusDirPath = path;
				applyTreeOpenState();
			} else {
				// 用户收起：若收的是 focus 夹则清 focus；进入链仍由 apply 强制展开（单开）
				if (normalizeTreeRel(treeFocusDirPath) === path) {
					treeFocusDirPath = '';
				}
				applyTreeOpenState();
			}
		},
		true,
	);
}

/* ========== 中栏正文宽度：铺满 | 固定最大宽度居中 ==========
 * 固定模式 max ≈ 视口 − 左栏max − 右栏max − 缝 − 内边距
 * 收起侧栏 / 中栏变宽时 max 不跟着涨，正文在中栏内居中
 */
/** v2：默认改为铺满自适应；旧 key 不再读取以免卡在 fixed */
const CONTENT_WIDTH_KEY = 'webmd-content-width-v2';
type ContentWidthMode = 'fill' | 'fixed';

/**
 * 中栏正文 max-width（通用，不限 PC）：
 * - fill：100% 吃满中栏
 * - fixed + 宽屏（宽 > navHideBelow）：
 *     上限 = 视口 − 左栏 max − 右栏 max − 缝 − 边距（用可拖最大宽，非默认宽）
 *     中栏可用宽 > 上限 → 强制该上限并 margin-inline:auto 居中
 *     中栏更窄 → 用满中栏
 * - fixed + 窄屏：公式会过小 → 用满中栏内容盒
 */
function measureCenterContentBox(): number {
	const el =
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('[data-wiki-main]');
	if (!el || el.clientWidth <= 0) return 0;
	const cs = getComputedStyle(el);
	const pl = parseFloat(cs.paddingLeft) || 0;
	const pr = parseFloat(cs.paddingRight) || 0;
	return Math.max(0, el.clientWidth - pl - pr);
}

/**
 * 固定居中的设计上限：屏宽 − 左右栏**可拖到的最大宽**（非默认宽），与是否收起无关。
 */
function fixedReadableDesignCap(): number {
	return Math.max(
		200,
		window.innerWidth -
			site.layout.navMax -
			site.layout.tocMax -
			GUTTER * 2 -
			24,
	);
}

const PORTRAIT_INNER_KEY = 'webmd-portrait-inner-w';
const PORTRAIT_CONTENT_KEY = 'webmd-portrait-content-w';

/** 竖屏时记下宽度，横屏固定版心不得小于该值 */
function rememberPortraitMetrics(contentBox: number) {
	if (window.innerWidth > window.innerHeight) return;
	try {
		sessionStorage.setItem(
			PORTRAIT_INNER_KEY,
			String(Math.round(window.innerWidth)),
		);
		if (contentBox > 0) {
			sessionStorage.setItem(
				PORTRAIT_CONTENT_KEY,
				String(Math.round(contentBox)),
			);
		}
	} catch {
		/* ignore */
	}
}

/**
 * 横屏固定版心的最小宽度 = 竖屏时的宽度（不得更窄）。
 * 优先用竖屏时记下的中栏/视口宽；否则用 screen 短边 / 当前 innerHeight 兜底。
 */
function portraitWidthFloor(contentBox: number): number {
	const w = window.innerWidth;
	const h = window.innerHeight;
	if (w <= h) return 0;

	let storedContent = 0;
	let storedInner = 0;
	try {
		storedContent = Number(sessionStorage.getItem(PORTRAIT_CONTENT_KEY)) || 0;
		storedInner = Number(sessionStorage.getItem(PORTRAIT_INNER_KEY)) || 0;
	} catch {
		/* ignore */
	}

	// 多数手机 screen 宽高不随旋转对调，短边 ≈ 竖屏 CSS 宽
	let shortCss = Math.min(window.screen?.width || 0, window.screen?.height || 0);
	if (shortCss > w && window.devicePixelRatio > 1) {
		shortCss = Math.round(shortCss / window.devicePixelRatio);
	}
	// 过滤桌面/异常值
	if (shortCss < 280 || shortCss > w || shortCss > 700) shortCss = 0;

	const candidates = [storedContent, storedInner, shortCss, Math.round(h)].filter(
		(n) => n >= 280,
	);
	if (!candidates.length) return 0;

	// 地板 ≤ 当前中栏（不能超过可用宽）
	return Math.min(contentBox, Math.max(...candidates));
}

function updateContentReadableMax(_s?: LayoutState) {
	const mode =
		document.documentElement.dataset.contentWidth === 'fixed' ? 'fixed' : 'fill';
	if (mode === 'fill') {
		document.documentElement.style.setProperty('--content-readable-max', '100%');
		return;
	}

	const apply = () => {
		const contentBox = measureCenterContentBox();
		if (contentBox <= 0) {
			document.documentElement.style.setProperty('--content-readable-max', '100%');
			return;
		}
		// 竖屏：记下真实宽度，供横屏当地板
		rememberPortraitMetrics(contentBox);

		// 窄屏竖屏：用满中栏（≈竖屏宽）
		if (isNarrowViewport() && window.innerWidth <= window.innerHeight) {
			document.documentElement.style.setProperty(
				'--content-readable-max',
				`${Math.max(200, Math.round(contentBox))}px`,
			);
			return;
		}

		// 固定上限：屏−左右栏 max；横屏再抬到 ≥ 竖屏宽度
		const designCap = fixedReadableDesignCap();
		const floor = portraitWidthFloor(contentBox);
		// cap 至少为 floor，保证不会小于竖屏宽（在中栏装得下的前提下）
		const cap = Math.max(designCap, floor, 200);
		const fixedMax = Math.round(Math.min(contentBox, cap));
		// 双重保险：若算出比 floor 还窄且中栏够宽，抬到 floor
		const finalMax =
			floor > 0 && contentBox >= floor
				? Math.max(fixedMax, Math.round(floor))
				: Math.max(200, fixedMax);

		document.documentElement.style.setProperty(
			'--content-readable-max',
			`${Math.min(contentBox, finalMax)}px`,
		);
	};

	apply();
	if (measureCenterContentBox() <= 0) {
		requestAnimationFrame(apply);
	}
}

/** 无用户记忆时：默认铺满中栏（自适应可用宽度）；底栏分页高度固定不变 */
function defaultContentWidth(): ContentWidthMode {
	return 'fill';
}

function loadContentWidth(): ContentWidthMode {
	try {
		const v = localStorage.getItem(CONTENT_WIDTH_KEY);
		if (v === 'fixed' || v === 'fill') return v;
	} catch {
		/* ignore */
	}
	return defaultContentWidth();
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
	// 保证有明确取值（缺省随宽/窄屏）
	if (root.dataset.contentWidth !== 'fixed' && root.dataset.contentWidth !== 'fill') {
		root.dataset.contentWidth = defaultContentWidth();
	}
	syncContentWidthButtons(
		root.dataset.contentWidth === 'fixed' ? 'fixed' : 'fill',
	);
}

/**
 * 仅用户点击路径栏宽度按钮时调用。
 * 侧栏展开/收起、拖拽、resize 不得改模式。
 * 只改 html[data-content-width] + CSS，不换 DOM、不做软导航。
 */
function applyContentWidth(mode: ContentWidthMode) {
	document.documentElement.dataset.contentWidth = mode;
	storeContentWidth(mode);
	updateContentReadableMax();
	syncContentWidthButtons(mode);
	// 铺满/固定切换：防抖一次 resize，供表格量宽（非每帧）
	requestAnimationFrame(() => {
		window.setTimeout(() => {
			window.dispatchEvent(new Event('resize'));
		}, 50);
	});
}

/** 记录中栏当前阅读锚点，布局变宽/变窄后仍对齐同一位置 */
function captureMainScrollAnchor(pane: HTMLElement): {
	scrollTop: number;
	el: Element | null;
	offsetInPane: number;
} {
	const scrollTop = pane.scrollTop;
	const paneTop = pane.getBoundingClientRect().top;
	const content =
		pane.querySelector('.markdown-body') ||
		pane.querySelector('#content') ||
		pane;
	const nodes = content.querySelectorAll(
		'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,table,img,video,audio,.is-media-line,.webmd-code,.webmd-diagram,.mermaid,.plantuml-canvas,.graphviz-canvas',
	);
	for (const el of nodes) {
		const r = el.getBoundingClientRect();
		// 第一个底部仍在视口上沿之下的块 = 当前阅读起点
		if (r.bottom > paneTop + 4) {
			return { scrollTop, el, offsetInPane: r.top - paneTop };
		}
	}
	return { scrollTop, el: null, offsetInPane: 0 };
}

function restoreMainScrollAnchor(
	pane: HTMLElement,
	anchor: ReturnType<typeof captureMainScrollAnchor>,
) {
	const apply = () => {
		if (anchor.el && anchor.el.isConnected) {
			const paneTop = pane.getBoundingClientRect().top;
			const r = anchor.el.getBoundingClientRect();
			const delta = r.top - paneTop - anchor.offsetInPane;
			if (Math.abs(delta) > 0.5) pane.scrollTop += delta;
		} else {
			pane.scrollTop = anchor.scrollTop;
		}
	};
	apply();
	// 字体/图片/ max-width 过渡后再钉一次
	requestAnimationFrame(() => {
		apply();
		requestAnimationFrame(apply);
	});
	window.setTimeout(apply, 50);
	window.setTimeout(apply, 200);
}

function toggleContentWidth() {
	const pane =
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('.center-scroll');
	const anchor = pane ? captureMainScrollAnchor(pane) : null;

	const cur = loadContentWidth();
	applyContentWidth(cur === 'fill' ? 'fixed' : 'fill');

	// 仅布局：重算路径省略 + 保持滚动锚点，绝不 scrollTo(0)
	requestAnimationFrame(() => {
		refreshAllMiddleEllipsis();
		if (pane && anchor) restoreMainScrollAnchor(pane, anchor);
	});
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
	// 必须打断进行中的 smooth 滚动（大纲锚点），否则会继续改同一 scroll 容器
	try {
		el.style.scrollBehavior = 'auto';
	} catch {
		/* ignore */
	}
	el.scrollTop = top;
	el.scrollLeft = 0;
	try {
		el.scrollTo({ top, left: 0, behavior: 'auto' });
	} catch {
		el.scrollTop = top;
	}
}

/**
 * 强力重置滚动容器（部分移动浏览器 WebKit：大纲定位后换页常出现「空白，拖一下才有内容」）。
 * 原因：smooth 动画未取消 + 换 innerHTML 后 scrollTop 仍超高 → 视口落在内容外。
 */
function forcePaneScrollTop(el: HTMLElement | null | undefined, top: number) {
	if (!el) return;
	const t = Math.max(0, top);
	try {
		el.style.scrollBehavior = 'auto';
	} catch {
		/* ignore */
	}
	// 1) 直接赋值打断 smooth
	el.scrollTop = t;
	el.scrollLeft = 0;
	try {
		el.scrollTo({ top: t, left: 0, behavior: 'auto' });
	} catch {
		el.scrollTop = t;
	}
	// 2) 强制 reflow，让 WebKit 重新计算 maxScroll
	void el.offsetHeight;
	const max = Math.max(0, el.scrollHeight - el.clientHeight);
	const clamped = Math.min(t, max);
	el.scrollTop = clamped;
	// 3) 顶位置再 nudge 一次，踢掉合成层残留偏移
	if (clamped === 0) {
		el.scrollTop = 1;
		void el.offsetHeight;
		el.scrollTop = 0;
	}
	try {
		el.scrollTo({ top: clamped, left: 0, behavior: 'auto' });
	} catch {
		el.scrollTop = clamped;
	}
	// 4) 轻量合成层刷新（不长期挂 transform，避免影响子项 fixed）
	const prevTransform = el.style.transform;
	el.style.transform = 'translateZ(0)';
	void el.offsetHeight;
	if (prevTransform) el.style.transform = prevTransform;
	else el.style.removeProperty('transform');
}

/** 取消中栏/大纲上可能未完成的 smooth 滚动 */
function cancelMainPaneScrollAnimations() {
	const main =
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('.center-scroll');
	const toc = document.querySelector<HTMLElement>('#doc-toc');
	// 先钉在当前值以取消动画，软导航里再设目标
	if (main) {
		const y = main.scrollTop;
		forcePaneScrollTop(main, y);
	}
	if (toc) {
		const y = toc.scrollTop;
		forcePaneScrollTop(toc, y);
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
		// 只滚中栏容器，禁止 content.scrollIntoView（会把整页顶飞导致 header 消失）
		pinScroll(pane, 0);
		pinDocumentScroll();
	} else {
		pinScroll(pane, 0);
	}

	window.requestAnimationFrame(() => {
		pinScroll(pane, 0);
		pinDocumentScroll();
	});
	window.setTimeout(() => {
		pinScroll(pane, 0);
		pinDocumentScroll();
	}, 40);

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

/* ========== 省略：分页文件名中间 … ；路径文件夹写成 …/尾段 ========== */

/** 按码点截断为 head…tail（maxUnits 含省略号占 1） */
function middleEllipsizeText(text: string, maxUnits: number): string {
	const chars = Array.from(text);
	if (chars.length <= maxUnits) return text;
	if (maxUnits <= 1) return '…';
	const budget = maxUnits - 1;
	const left = Math.ceil(budget / 2);
	const right = Math.floor(budget / 2);
	if (right <= 0) return chars.slice(0, Math.max(0, budget)).join('') + '…';
	return chars.slice(0, left).join('') + '…' + chars.slice(chars.length - right).join('');
}

function codePointLen(s: string): number {
	return Array.from(s).length;
}

/** 分页等：按元素 clientWidth 做中间省略 */
function refreshMiddleEllipsis(el: HTMLElement) {
	const full =
		el.getAttribute('data-ellipsis-full') ??
		el.getAttribute('title') ??
		el.textContent ??
		'';
	if (!el.hasAttribute('data-ellipsis-full')) {
		el.setAttribute('data-ellipsis-full', full);
	}
	if (!el.getAttribute('title')) el.setAttribute('title', full);

	el.textContent = full;
	const avail = el.clientWidth;
	if (avail < 2) return;
	if (el.scrollWidth <= avail + 1) return;

	const n = codePointLen(full);
	let lo = 1;
	let hi = n;
	let best = '…';
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const candidate = middleEllipsizeText(full, mid);
		el.textContent = candidate;
		if (el.scrollWidth <= avail + 1) {
			best = candidate;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	el.textContent = best || '…';
}

/** 显示/隐藏目录组及其前的分隔符（避免 //） */
function setBreadcrumbDirsVisible(dirs: HTMLElement, on: boolean) {
	dirs.hidden = !on;
	const prev = dirs.previousElementSibling;
	if (prev instanceof HTMLElement && prev.classList.contains('wiki-breadcrumb__sep')) {
		prev.hidden = !on;
	}
}

/** 恢复目录组内各段可见（不销毁可点按钮） */
function resetBreadcrumbDirSegs(dirs: HTMLElement) {
	const lead = dirs.querySelector<HTMLElement>('[data-dirs-lead-ellipsis]');
	if (lead) lead.hidden = true;
	dirs.querySelectorAll<HTMLElement>('[data-crumb-dir]').forEach((el) => {
		el.hidden = false;
	});
	dirs.querySelectorAll<HTMLElement>('.wiki-breadcrumb__sep--in-dirs').forEach((el) => {
		el.hidden = false;
	});
}

/**
 * 窄宽时从左藏目录段，保留靠近文件的尾段；前缀显示 …
 */
function collapseBreadcrumbDirSegs(dirs: HTMLElement, trail: HTMLElement) {
	const segs = [
		...dirs.querySelectorAll<HTMLElement>('[data-crumb-dir]'),
	];
	if (segs.length === 0) return;
	const lead = dirs.querySelector<HTMLElement>('[data-dirs-lead-ellipsis]');
	const fits = () => breadcrumbTrailFits(trail);
	if (fits()) return;

	// 先尽量只显示尾段：从左逐个隐藏
	for (let i = 0; i < segs.length; i++) {
		if (fits()) break;
		// 至少保留最后一段目录（若还有）
		if (i >= segs.length - 1 && segs.length > 1) break;
		segs[i]!.hidden = true;
		const sep = segs[i]!.nextElementSibling;
		if (
			sep instanceof HTMLElement &&
			sep.classList.contains('wiki-breadcrumb__sep--in-dirs')
		) {
			sep.hidden = true;
		}
		if (lead) lead.hidden = false;
	}
}

/**
 * trail 是否放得下：累加子项「内容宽」scrollWidth。
 * 不能用 trail.scrollWidth——flex+overflow:hidden 时子项被裁切后
 * scrollWidth≈clientWidth，会误判「够宽」从而仍显示完整文件夹。
 */
function breadcrumbTrailFits(trail: HTMLElement): boolean {
	const avail = trail.clientWidth;
	if (avail < 2) return true;
	let need = 0;
	for (const child of Array.from(trail.children) as HTMLElement[]) {
		if (child.hidden) continue;
		const st = getComputedStyle(child);
		// 目录组：量内部可见子项之和（勿用被裁切的 scrollWidth）
		if (child.classList.contains('wiki-breadcrumb__dirs')) {
			let inner = 0;
			for (const sub of Array.from(child.children) as HTMLElement[]) {
				if (sub.hidden) continue;
				const sst = getComputedStyle(sub);
				inner +=
					sub.scrollWidth +
					(parseFloat(sst.marginLeft) || 0) +
					(parseFloat(sst.marginRight) || 0);
			}
			need +=
				inner +
				(parseFloat(st.marginLeft) || 0) +
				(parseFloat(st.marginRight) || 0);
			continue;
		}
		need +=
			child.scrollWidth +
			(parseFloat(st.marginLeft) || 0) +
			(parseFloat(st.marginRight) || 0);
	}
	return need <= avail + 1;
}

/**
 * 路径栏整条 trail（文件名优先）：
 * 1) 宽够 → 全部目录段
 * 2) 不够 → 从左藏目录段，前缀 …
 * 3) 仍不够 → 文件名中间省略
 * 4) 极端窄 → 隐藏整个目录组，只留 🏠 / 文件名
 */
function refreshBreadcrumbTrail(trail: HTMLElement) {
	const dirs = trail.querySelector<HTMLElement>('.wiki-breadcrumb__dirs');
	const file = trail.querySelector<HTMLElement>('.wiki-breadcrumb__current');
	const fullDirs = (dirs?.getAttribute('data-ellipsis-full') ?? '').replace(
		/\\/g,
		'/',
	);
	const fullFile = (
		file?.getAttribute('data-ellipsis-full') ??
		file?.getAttribute('title') ??
		file?.textContent ??
		''
	).trim();

	if (dirs) {
		setBreadcrumbDirsVisible(dirs, true);
		resetBreadcrumbDirSegs(dirs);
	}
	if (file) {
		const ff = file.getAttribute('data-ellipsis-full') || fullFile;
		if (!file.getAttribute('data-ellipsis-full') && ff) {
			file.setAttribute('data-ellipsis-full', ff);
		}
		file.textContent = file.getAttribute('data-ellipsis-full') || fullFile;
	}

	if (trail.clientWidth < 2) return;
	const fits = () => breadcrumbTrailFits(trail);
	if (fits()) return;

	// —— 宽度不够：从左收目录段 ——
	if (dirs && fullDirs) {
		collapseBreadcrumbDirSegs(dirs, trail);
	}

	// 文件名仍放不下 → 中间省略
	if (!fits() && file) {
		const ff = file.getAttribute('data-ellipsis-full') || fullFile;
		const n = codePointLen(ff);
		let lo = 1;
		let hi = n;
		let best = '…';
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const candidate = middleEllipsizeText(ff, mid);
			file.textContent = candidate;
			if (fits()) {
				best = candidate;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		file.textContent = best || '…';
	}

	// 仍溢出：藏掉整个目录组
	if (!fits() && dirs && fullDirs) {
		setBreadcrumbDirsVisible(dirs, false);
		if (file) {
			const ff = file.getAttribute('data-ellipsis-full') || fullFile;
			file.textContent = ff;
			if (!fits()) {
				const n = codePointLen(ff);
				let lo = 1;
				let hi = n;
				let best = '…';
				while (lo <= hi) {
					const mid = (lo + hi) >> 1;
					const candidate = middleEllipsizeText(ff, mid);
					file.textContent = candidate;
					if (fits()) {
						best = candidate;
						lo = mid + 1;
					} else {
						hi = mid - 1;
					}
				}
				file.textContent = best || '…';
			}
		}
	}
}

function refreshAllMiddleEllipsis(root: ParentNode = document) {
	// 路径栏按 trail 整组处理（避免 dirs flex 撑空、//、测量互相打架）
	root.querySelectorAll<HTMLElement>('.wiki-breadcrumb__trail').forEach((trail) => {
		refreshBreadcrumbTrail(trail);
	});
	// 其它（分页文件名等）
	root.querySelectorAll<HTMLElement>('[data-middle-ellipsis]').forEach((el) => {
		if (el.closest('.wiki-breadcrumb__trail')) return;
		refreshMiddleEllipsis(el);
	});
}

let middleEllipsisRo: ResizeObserver | null = null;
const middleEllipsisObserved = new WeakSet<Element>();

function observeMiddleEllipsisEl(el: Element) {
	if (!middleEllipsisRo || middleEllipsisObserved.has(el)) return;
	middleEllipsisObserved.add(el);
	middleEllipsisRo.observe(el);
	// 观察父级（flex 分配变化时常是 trail / btn 变宽，子项 clientWidth 才变）
	const parent = el.parentElement;
	if (parent && !middleEllipsisObserved.has(parent)) {
		middleEllipsisObserved.add(parent);
		middleEllipsisRo.observe(parent);
	}
}

function bindMiddleEllipsis() {
	if (typeof ResizeObserver !== 'undefined' && !middleEllipsisRo) {
		let t: number | null = null;
		middleEllipsisRo = new ResizeObserver(() => {
			if (t != null) window.clearTimeout(t);
			t = window.setTimeout(() => {
				t = null;
				refreshAllMiddleEllipsis();
			}, 40);
		});
		window.addEventListener('resize', () => refreshAllMiddleEllipsis());
	}
	document.querySelectorAll('[data-middle-ellipsis]').forEach((el) => {
		observeMiddleEllipsisEl(el);
	});
	// 路径 trail 整组观察（宽度变化时重算 …/ 与文件名）
	document.querySelectorAll('.wiki-breadcrumb__trail, .wiki-breadcrumb').forEach((el) => {
		observeMiddleEllipsisEl(el);
	});
	// 双 rAF：等 flex/字体布局稳定后再量
	requestAnimationFrame(() => {
		refreshAllMiddleEllipsis();
		requestAnimationFrame(() => refreshAllMiddleEllipsis());
	});
}

function relPathFromDataset(el: Element): string {
	let p = (el.getAttribute('data-copy-path') || '')
		.replace(/\\/g, '/')
		.replace(/^\/+/, '');
	try {
		p = decodeURIComponent(p);
	} catch {
		try {
			p = decodeURI(p);
		} catch {
			/* keep */
		}
	}
	return p;
}

/** 规范化相对路径（decode、去前导 /） */
function normalizeRelPath(rel: string): string {
	let path = (rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
	if (!path) return '';
	try {
		path = decodeURIComponent(path);
	} catch {
		try {
			path = decodeURI(path);
		} catch {
			/* keep raw */
		}
	}
	return path;
}

/**
 * 完整 URL（非转义）：origin + 路径，中文/空格原样。
 */
function fullUrlFromRel(rel: string): string {
	const path = normalizeRelPath(rel);
	if (path) return `${location.origin}/${path}`;
	try {
		return `${location.origin}${decodeURI(location.pathname)}${location.search}`;
	} catch {
		return `${location.origin}${location.pathname}${location.search}`;
	}
}

/**
 * 完整 URL（转义）：路径各段 percent-encode，便于粘贴到只认 ASCII 的场景。
 */
function fullUrlEncodedFromRel(rel: string): string {
	const path = normalizeRelPath(rel);
	if (path) {
		const encoded = path
			.split('/')
			.map((seg) => encodeURIComponent(seg))
			.join('/');
		return `${location.origin}/${encoded}`;
	}
	// 回退：对当前 pathname 分段编码
	try {
		const raw = decodeURI(location.pathname);
		const encoded = raw
			.split('/')
			.map((seg) => (seg ? encodeURIComponent(seg) : ''))
			.join('/');
		return `${location.origin}${encoded}${location.search}`;
	} catch {
		return location.href;
	}
}

let _measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidthPx(text: string, font: string): number {
	try {
		if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
		const ctx = _measureCanvas.getContext('2d');
		if (!ctx) return text.length * 8;
		ctx.font = font;
		return ctx.measureText(text).width;
	} catch {
		return text.length * 8;
	}
}

async function copyTextWithFeedback(
	btn: HTMLElement,
	text: string,
	okTitle: string,
	failTitle: string,
) {
	if (!text) return;
	try {
		await navigator.clipboard.writeText(text);
		btn.classList.add('is-copied');
		const prev = btn.textContent;
		if (btn.matches('.wiki-breadcrumb__popover-btn')) {
			btn.textContent = '已复制';
			window.setTimeout(() => {
				btn.classList.remove('is-copied');
				if (prev) btn.textContent = prev;
			}, 1400);
		} else {
			btn.title = okTitle;
			btn.setAttribute('aria-label', okTitle);
			window.setTimeout(() => {
				btn.classList.remove('is-copied');
				btn.title = '复制完整链接';
				btn.setAttribute('aria-label', '复制完整链接');
			}, 1400);
		}
	} catch {
		if (btn.matches('.wiki-breadcrumb__popover-btn')) {
			const prev = btn.textContent;
			btn.textContent = failTitle;
			window.setTimeout(() => {
				if (prev) btn.textContent = prev;
			}, 1400);
		} else {
			btn.title = failTitle;
			btn.setAttribute('aria-label', failTitle);
			window.setTimeout(() => {
				btn.title = '复制完整链接';
				btn.setAttribute('aria-label', '复制完整链接');
			}, 1400);
		}
	}
}

function closeAllPathPopovers() {
	document.querySelectorAll<HTMLElement>('[data-path-popover]').forEach((pop) => {
		pop.hidden = true;
		pop.style.removeProperty('position');
		pop.style.removeProperty('left');
		pop.style.removeProperty('top');
		pop.style.removeProperty('width');
		pop.style.removeProperty('max-width');
		pop.style.removeProperty('max-height');
		pop.style.removeProperty('overflow-y');
		pop.style.removeProperty('transform');
	});
	document.querySelectorAll<HTMLElement>('[data-path-reveal-btn]').forEach((t) => {
		t.setAttribute('aria-expanded', 'false');
	});
}

/** 确保左侧文件树可见（收起时展开；抽屉视口打开导航抽屉） */
function ensureFileTreeVisible() {
	if (isDrawerViewport()) {
		setNavDrawer(true);
		return;
	}
	const s = loadState();
	if (s.navCollapsed) {
		s.navCollapsed = false;
		saveState(s);
		applyLayout(s);
	}
}

/**
 * 路径栏「根目录」：左侧文件树滚到顶部（不进主页）。
 */
function scrollFileTreeToRoot() {
	ensureFileTreeVisible();
	closeAllPathPopovers();
	const tree = document.getElementById('file-tree');
	const pane =
		tree?.querySelector<HTMLElement>('.tree-body') ||
		document.querySelector<HTMLElement>('.tree-body');
	if (!pane) return;
	// 根目录：清 focus；进入态仍跟当前文件（若有）
	treeFocusDirPath = '';
	applyTreeOpenState();
	try {
		pane.style.scrollBehavior = 'auto';
	} catch {
		/* ignore */
	}
	forcePaneScrollTop(pane, 0);
	// 顶栏「文件」标题短暂高亮，示意已在根
	const home = tree?.querySelector<HTMLElement>('.tree-home');
	if (home) {
		home.classList.remove('is-tree-flash');
		void home.offsetWidth;
		home.classList.add('is-tree-flash');
		window.setTimeout(() => home.classList.remove('is-tree-flash'), 1400);
	}
}

/** 左侧树是否存在该 content 相对目录 */
function treeHasDir(rel: string): boolean {
	const path = (rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	if (!path) return false;
	const tree = document.getElementById('file-tree');
	if (!tree) return false;
	return Boolean(
		tree.querySelector(`.tree-dir[data-path="${CSS.escape(path)}"]`),
	);
}

/**
 * 正文站内文件夹链 → 与路径栏一致的 content 相对路径。
 * 支持：`#tree-dir=...`（构建改写）、`/content/dir/`、树中存在的路径。
 */
function resolveInternalTreeDirPath(a: HTMLAnchorElement): string | null {
	const raw = (a.getAttribute('href') || '').trim();
	if (!raw || raw.startsWith('mailto:') || raw.startsWith('javascript:')) {
		return null;
	}
	// 构建期改写：#tree-dir=term%2F...
	if (raw.startsWith('#tree-dir=')) {
		try {
			const p = decodeURIComponent(raw.slice('#tree-dir='.length))
				.replace(/\\/g, '/')
				.replace(/^\/+|\/+$/g, '');
			return p || null;
		} catch {
			return null;
		}
	}
	let url: URL;
	try {
		url = new URL(a.href, location.href);
	} catch {
		return null;
	}
	if (url.origin !== location.origin) return null;
	let pathname = url.pathname || '';
	try {
		pathname = decodeURIComponent(pathname);
	} catch {
		/* keep */
	}
	pathname = pathname.replace(/\\/g, '/');
	// /content/term/foo/ 或无尾斜杠
	if (pathname === '/content' || pathname.startsWith('/content/')) {
		const rel = pathname
			.replace(/^\/content\/?/, '')
			.replace(/\/+$/, '');
		if (rel && treeHasDir(rel)) return rel;
		// 构建后尚未校验树时：尾斜杠仍视为目录意图
		if (rel && /\/$/.test(url.pathname)) return rel;
		return null;
	}
	// /pages/term/foo/ ：无对应文件页、但是树里的目录 → 定位树
	if (pathname === '/pages' || pathname.startsWith('/pages/')) {
		const rel = pathname.replace(/^\/pages\/?/, '').replace(/\/+$/, '');
		if (rel && treeHasDir(rel)) return rel;
	}
	return null;
}

/** 若为站内文件夹链：定位左侧树并返回 true（调用方应 preventDefault） */
function tryRevealInternalFolderLink(a: HTMLAnchorElement): boolean {
	const rel = resolveInternalTreeDirPath(a);
	if (!rel || !treeHasDir(rel)) return false;
	revealInFileTree(rel, 'dir');
	return true;
}

/**
 * 路径栏 / 正文文件夹链：
 * - 点目录 → 只改 focus（不改进入）
 * - 点文件名 → focus 到该文件所在目录并滚到文件
 */
function revealInFileTree(path: string, kind: 'dir' | 'file' = 'dir') {
	const rel = normalizeTreeRel(path);
	if (!rel) return;

	ensureFileTreeVisible();
	closeAllPathPopovers();

	const tree = document.getElementById('file-tree');
	if (!tree) return;

	if (kind === 'file') {
		const fileEl = tree.querySelector(
			`.tree-file[data-path="${CSS.escape(rel)}"]`,
		);
		if (!fileEl) return;
		// focus = 文件所在目录（根文件则无 focus 夹）
		treeFocusDirPath = parentDirOfFile(rel);
		applyTreeOpenState({
			scroll: true,
			flash: true,
			scrollFilePath: rel,
		});
		return;
	}

	const dirEl = tree.querySelector(
		`.tree-dir[data-path="${CSS.escape(rel)}"]`,
	);
	if (!dirEl) return;
	setTreeFocusDir(rel, { scroll: true, flash: true });
}

/** 文件信息弹层：水平居中；宽度跟屏走，尽量一行显示完整路径（不先卡 560 再左右滚） */
function positionPathPopover(pop: HTMLElement) {
	const margin = 16;
	// 几乎全宽可用，仅留边距（旧逻辑 max 560 导致路径被夹窄、出横向滚动条）
	const maxW = Math.max(280, window.innerWidth - margin * 2);
	const maxH = window.innerHeight - margin * 2;

	const plainEl = pop.querySelector<HTMLElement>('[data-path-popover-plain]');
	const encEl = pop.querySelector<HTMLElement>('[data-path-popover-encoded]');
	const sample = plainEl || encEl;
	const font = sample
		? getComputedStyle(sample).font
		: '500 0.8125rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
	const plain = plainEl?.textContent || '';
	const enc = encEl?.textContent || '';
	const textW = Math.max(
		measureTextWidthPx(plain, font),
		measureTextWidthPx(enc, font),
	);
	// 弹层左右 padding + code 内边距 + 边框
	const chromeX = 56;
	const actionsMin = 360;
	const minW = Math.min(320, maxW);
	// 理想宽度 = 最长路径一行 + 边距；不超过屏宽
	const ideal = Math.ceil(textW + chromeX);
	const width = Math.min(maxW, Math.max(minW, ideal, actionsMin));

	// 屏宽够 → 单行不换行、不滚；只有整屏仍放不下才换行
	const canSingleLine = ideal <= maxW;
	[plainEl, encEl].forEach((el) => {
		if (!el) return;
		el.classList.toggle('is-wrap', !canSingleLine);
		el.classList.remove('is-overflow');
	});
	pop.classList.remove('is-overflow-y');

	const crumb =
		pop.closest('.wiki-breadcrumb') ||
		document.querySelector('.pane-bar--center') ||
		document.querySelector('.app-header');
	const crumbBottom =
		crumb instanceof HTMLElement
			? crumb.getBoundingClientRect().bottom
			: 48;
	const top = Math.max(margin, Math.round(crumbBottom + 8));

	pop.hidden = false;
	pop.style.position = 'fixed';
	pop.style.width = `${Math.round(width)}px`;
	pop.style.maxWidth = `${maxW}px`;
	pop.style.maxHeight = `${Math.max(120, maxH - (top - margin))}px`;
	pop.style.overflowY = 'hidden';
	pop.style.overflowX = 'hidden';
	pop.style.transform = 'none';
	const left = Math.max(margin, (window.innerWidth - width) / 2);
	pop.style.left = `${Math.round(left)}px`;
	pop.style.top = `${top}px`;

	// 量完若仍略宽：优先再拉宽弹层（不超过 maxW），避免左右滚动条
	requestAnimationFrame(() => {
		let need = width;
		[plainEl, encEl].forEach((el) => {
			if (!el || el.classList.contains('is-wrap')) return;
			const sw = el.scrollWidth;
			const cw = el.clientWidth;
			if (sw > cw + 1) {
				// code 比内容窄 → 弹层需再加 (sw - cw)
				need = Math.max(need, width + (sw - cw) + 8);
			}
		});
		need = Math.min(maxW, need);
		if (need > width + 1) {
			pop.style.width = `${Math.round(need)}px`;
			const left2 = Math.max(margin, (window.innerWidth - need) / 2);
			pop.style.left = `${Math.round(left2)}px`;
		}
		requestAnimationFrame(() => {
			[plainEl, encEl].forEach((el) => {
				if (!el || el.classList.contains('is-wrap')) {
					el?.classList.remove('is-overflow');
					return;
				}
				// 仍超（极长 URL 整屏都放不下）才允许横向滚
				el.classList.toggle(
					'is-overflow',
					el.scrollWidth > el.clientWidth + 1,
				);
			});
			pop.classList.toggle(
				'is-overflow-y',
				pop.scrollHeight > pop.clientHeight + 1,
			);
			if (pop.classList.contains('is-overflow-y')) {
				pop.style.overflowY = 'auto';
			}
		});
	});
}

function openPathPopover(anchor: HTMLElement) {
	const nav = anchor.closest('.wiki-breadcrumb');
	const pop = nav?.querySelector<HTMLElement>('[data-path-popover]');
	if (!pop) return;
	// 关闭其它
	document.querySelectorAll<HTMLElement>('[data-path-popover]').forEach((p) => {
		if (p !== pop) {
			p.hidden = true;
		}
	});
	document.querySelectorAll<HTMLElement>('[data-path-reveal-btn]').forEach((t) => {
		if (t !== anchor) t.setAttribute('aria-expanded', 'false');
	});
	const rel = (nav?.getAttribute('data-full-path') || '').replace(/\\/g, '/');
	const plain = fullUrlFromRel(rel);
	const encoded = fullUrlEncodedFromRel(rel);
	const plainEl = pop.querySelector<HTMLElement>('[data-path-popover-plain]');
	const encEl = pop.querySelector<HTMLElement>('[data-path-popover-encoded]');
	if (plainEl) {
		plainEl.textContent = plain;
		plainEl.setAttribute('title', plain);
	}
	if (encEl) {
		encEl.textContent = encoded;
		encEl.setAttribute('title', encoded);
	}
	const infoBtn =
		(anchor.matches('[data-path-reveal-btn]') ? anchor : null) ||
		nav?.querySelector<HTMLElement>('[data-path-reveal-btn]');
	positionPathPopover(pop);
	infoBtn?.setAttribute('aria-expanded', 'true');
}

function togglePathPopover(anchor: HTMLElement) {
	const nav = anchor.closest('.wiki-breadcrumb');
	const pop = nav?.querySelector<HTMLElement>('[data-path-popover]');
	if (!pop) return;
	if (!pop.hidden) {
		closeAllPathPopovers();
		return;
	}
	openPathPopover(anchor);
}

let pathRevealBound = false;

function bindPathReveal() {
	if (pathRevealBound) return;
	pathRevealBound = true;

	document.addEventListener('click', (ev) => {
		const t = ev.target;
		if (!(t instanceof Element)) return;

		// 弹层：复制可读 URL（非转义）
		const copyPlain = t.closest('[data-copy-url-plain]') as HTMLElement | null;
		if (copyPlain) {
			ev.preventDefault();
			ev.stopPropagation();
			const rel = relPathFromDataset(copyPlain);
			void copyTextWithFeedback(
				copyPlain,
				fullUrlFromRel(rel),
				'已复制可读 URL',
				'复制失败',
			);
			return;
		}

		// 弹层：复制转义 URL
		const copyEnc = t.closest('[data-copy-url-encoded]') as HTMLElement | null;
		if (copyEnc) {
			ev.preventDefault();
			ev.stopPropagation();
			const rel = relPathFromDataset(copyEnc);
			void copyTextWithFeedback(
				copyEnc,
				fullUrlEncodedFromRel(rel),
				'已复制转义 URL',
				'复制失败',
			);
			return;
		}

		// 弹层：复制相对路径
		const copyRel = t.closest('[data-copy-rel-path]') as HTMLElement | null;
		if (copyRel) {
			ev.preventDefault();
			ev.stopPropagation();
			const rel = relPathFromDataset(copyRel);
			void copyTextWithFeedback(copyRel, rel, '已复制路径', '复制失败');
			return;
		}

		// 关闭按钮
		if (t.closest('[data-path-popover-close]')) {
			ev.preventDefault();
			ev.stopPropagation();
			closeAllPathPopovers();
			return;
		}

		// 点在弹层内（含路径选区、复制按钮）：绝不关闭
		if (t.closest('[data-path-popover], .wiki-breadcrumb__popover')) {
			ev.stopPropagation();
			return;
		}

		// 路径栏根目录图标 → 左侧树滚到顶部（不进主页）
		const treeRoot = t.closest('[data-tree-scroll-root]') as HTMLElement | null;
		if (treeRoot) {
			ev.preventDefault();
			ev.stopPropagation();
			scrollFileTreeToRoot();
			return;
		}

		// 路径栏目录/文件名 → 左侧树定位（不打开信息弹层、不跳转）
		const treeFocus = t.closest('[data-tree-focus]') as HTMLElement | null;
		if (treeFocus) {
			ev.preventDefault();
			ev.stopPropagation();
			const path = treeFocus.getAttribute('data-tree-focus') || '';
			const kindAttr = treeFocus.getAttribute('data-tree-focus-kind');
			const kind: 'dir' | 'file' =
				kindAttr === 'file' ? 'file' : 'dir';
			revealInFileTree(path, kind);
			return;
		}

		// 正文内站内文件夹链（#tree-dir= / /content/目录）→ 同路径栏：只定位树
		const folderA = t.closest('a[href]') as HTMLAnchorElement | null;
		if (
			folderA &&
			(folderA.closest('#content') || folderA.closest('.markdown-body'))
		) {
			if (tryRevealInternalFolderLink(folderA)) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
		}

		// 仅 info 按钮打开/关闭文件信息弹层
		const infoBtn = t.closest('[data-path-reveal-btn]') as HTMLElement | null;
		if (infoBtn) {
			ev.preventDefault();
			ev.stopPropagation();
			togglePathPopover(infoBtn);
			return;
		}

		// 点弹层外空白：关闭
		closeAllPathPopovers();
	});

	document.addEventListener('keydown', (ev) => {
		if (ev.key === 'Escape') {
			closeAllPathPopovers();
			return;
		}
		// 仅 info 按钮支持键盘打开
		const t = ev.target;
		if (!(t instanceof HTMLElement)) return;
		if (!t.matches('[data-path-reveal-btn]')) return;
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			togglePathPopover(t);
		}
	});

	// 页面滚动/改尺寸时关掉；弹层内部滚动（路径条）不关
	window.addEventListener(
		'scroll',
		(ev) => {
			const raw = ev.target;
			const el =
				raw instanceof Element
					? raw
					: raw instanceof Node
						? raw.parentElement
						: null;
			if (el?.closest?.('[data-path-popover], .wiki-breadcrumb__popover')) {
				return;
			}
			closeAllPathPopovers();
		},
		true,
	);
	window.addEventListener('resize', () => {
		closeAllPathPopovers();
	});
}

function bindBreadcrumbActions() {
	// 复制链接已并入 URL 弹层（可读 / 转义 / 相对路径）
	bindPathReveal();
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

/** 中栏全屏按钮态（:fullscreen 或伪全屏 class） */
function syncCenterFullscreenButtons(on: boolean): void {
	document.querySelectorAll<HTMLButtonElement>('[data-center-fullscreen]').forEach((btn) => {
		btn.classList.toggle('is-active', on);
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		btn.title = on ? '退出中栏全屏' : '中栏全屏';
		btn.setAttribute('aria-label', on ? '退出中栏全屏' : '中栏全屏');
	});
}

function isCenterFullscreenOn(): boolean {
	const main = document.querySelector<HTMLElement>('[data-wiki-main]');
	if (!main) return false;
	if (document.fullscreenElement === main) return true;
	const doc = document as Document & {
		webkitFullscreenElement?: Element | null;
	};
	if (doc.webkitFullscreenElement === main) return true;
	return document.body.classList.contains('is-center-pseudo-fs');
}

function afterCenterFullscreenLayout(): void {
	const main = document.querySelector<HTMLElement>('[data-wiki-main]');
	if (main) {
		main
			.querySelectorAll<HTMLElement>('[data-xs-host]')
			.forEach((host) => {
				host.style.removeProperty('width');
				host.style.removeProperty('max-width');
				host.style.removeProperty('height');
				host.style.removeProperty('min-height');
			});
	}
	requestAnimationFrame(() => {
		window.dispatchEvent(new Event('resize'));
	});
}

/** 进入伪全屏（iOS 等无元素 Fullscreen API 时） */
function enterCenterPseudoFullscreen(): void {
	document.body.classList.add('is-center-pseudo-fs');
	// 抽屉/侧栏先收起，避免挡内容
	try {
		if (isDrawerViewport()) {
			setNavDrawer(false);
			setTocDrawer(false);
		}
		closeAllDrawers();
	} catch {
		/* ignore */
	}
	syncCenterFullscreenButtons(true);
	afterCenterFullscreenLayout();
}

function exitCenterPseudoFullscreen(): void {
	if (!document.body.classList.contains('is-center-pseudo-fs')) return;
	document.body.classList.remove('is-center-pseudo-fs');
	syncCenterFullscreenButtons(false);
	afterCenterFullscreenLayout();
}

async function requestCenterFullscreen(main: HTMLElement): Promise<void> {
	const el = main as HTMLElement & {
		webkitRequestFullscreen?: () => void | Promise<void>;
		webkitRequestFullScreen?: () => void | Promise<void>;
	};
	// 已在伪全屏 → 退出
	if (document.body.classList.contains('is-center-pseudo-fs')) {
		exitCenterPseudoFullscreen();
		return;
	}
	// 已在原生全屏 → 退出
	const fsEl =
		document.fullscreenElement ||
		(document as Document & { webkitFullscreenElement?: Element | null })
			.webkitFullscreenElement;
	if (fsEl === main) {
		const doc = document as Document & {
			exitFullscreen?: () => Promise<void>;
			webkitExitFullscreen?: () => void;
		};
		if (doc.exitFullscreen) await doc.exitFullscreen();
		else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
		return;
	}
	if (fsEl) {
		const doc = document as Document & {
			exitFullscreen?: () => Promise<void>;
			webkitExitFullscreen?: () => void;
		};
		if (doc.exitFullscreen) await doc.exitFullscreen();
		else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
	}

	// 尝试原生 Fullscreen API（桌面 Chrome/Firefox/Safari 新版本）
	try {
		if (typeof main.requestFullscreen === 'function') {
			await main.requestFullscreen();
			return;
		}
		if (typeof el.webkitRequestFullscreen === 'function') {
			await Promise.resolve(el.webkitRequestFullscreen());
			return;
		}
		if (typeof el.webkitRequestFullScreen === 'function') {
			await Promise.resolve(el.webkitRequestFullScreen());
			return;
		}
	} catch {
		/* iOS 常抛错或无权限 → 伪全屏 */
	}
	// 手机 Safari 等：元素全屏不可用，用 fixed 铺满视口
	enterCenterPseudoFullscreen();
}

/**
 * 中栏（data-wiki-main）全屏：路径栏图标。
 * 桌面走 Fullscreen API；手机用 CSS 伪全屏（iOS 不支持任意元素 requestFullscreen）。
 */
function bindCenterFullscreen(): void {
	document.addEventListener('click', (ev) => {
		const btn = (ev.target as HTMLElement).closest(
			'[data-center-fullscreen]',
		) as HTMLButtonElement | null;
		if (!btn) return;
		ev.preventDefault();
		ev.stopPropagation();
		const main = document.querySelector<HTMLElement>('[data-wiki-main]');
		if (!main) return;
		void requestCenterFullscreen(main).catch(() => {
			enterCenterPseudoFullscreen();
		});
	});
	const onFsChange = () => {
		// 进入原生全屏时清掉伪全屏 class
		if (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
			document.body.classList.remove('is-center-pseudo-fs');
		}
		syncCenterFullscreenButtons(isCenterFullscreenOn());
		afterCenterFullscreenLayout();
	};
	document.addEventListener('fullscreenchange', onFsChange);
	document.addEventListener('webkitfullscreenchange', onFsChange);
	// 伪全屏下：系统返回键 / Escape 退出
	document.addEventListener('keydown', (ev) => {
		if (ev.key === 'Escape' && document.body.classList.contains('is-center-pseudo-fs')) {
			exitCenterPseudoFullscreen();
		}
	});
}

function bindCodeCopy() {
	document.querySelectorAll<HTMLButtonElement>('.webmd-code__copy').forEach((btn) => {
		if (btn.dataset.bound) return;
		btn.dataset.bound = '1';
		btn.addEventListener('click', async () => {
			const root = btn.closest('.webmd-code');
			const sheetApp = btn.closest<HTMLElement>('[data-sheet-app]');
			const diagramApp = btn.closest<HTMLElement>(
				'.webmd-diagram[data-diagram-engine="mermaid"], .webmd-diagram[data-diagram-engine="plantuml"], .webmd-diagram[data-diagram-engine="graphviz"]',
			);
			// 表格应用：只复制当前 sheet 的 CSV
			let pre: HTMLElement | null | undefined;
			if (sheetApp) {
				const i = sheetApp.dataset.activeSheet || '0';
				pre =
					sheetApp.querySelector<HTMLElement>(
						`pre.sheet-copy-source[data-sheet-copy="${i}"]`,
					) ||
					sheetApp.querySelector<HTMLElement>(
						`.sheet-panel.is-active pre.sheet-copy-source`,
					);
			} else if (diagramApp) {
				// 图示：复制 DSL 源码（隐藏 pre）
				pre =
					diagramApp.querySelector<HTMLElement>('pre.mermaid-copy-source') ||
					diagramApp.querySelector<HTMLElement>('pre.plantuml-copy-source') ||
					diagramApp.querySelector<HTMLElement>('pre.graphviz-copy-source');
			} else {
				// 代码块：pre 可见源码；旧 sheet-block
				pre =
					root?.querySelector<HTMLElement>('pre.sheet-copy-source') ||
					root?.querySelector('pre');
			}
			const text = pre?.textContent || '';
			const isSheet = Boolean(
				sheetApp || root?.classList.contains('sheet-block'),
			);
			const isDiagram = Boolean(diagramApp);
			const labelCopy = isSheet
				? '复制当前表 CSV'
				: isDiagram
					? '复制源码'
					: '复制代码';
			const reset = () => {
				btn.classList.remove('is-copied', 'is-failed');
				btn.title = labelCopy;
				btn.setAttribute('aria-label', labelCopy);
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

/* Mermaid 图示 → src/previews/mermaid.ts（文内 flowchart/类图/时序/mindmap…） */

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
			ignoredClasses: [
				'mermaid',
				'webmd-code',
				'plantuml-canvas',
				'graphviz-canvas',
				'webmd-diagram',
			],
		});
	} catch (err) {
		console.warn('[webmd] katex render failed', err);
	}
}

let tocSpyAbort: AbortController | null = null;
/** 点击大纲后短时锁定选中，避免短文几乎不滚时 spy 又盖成最后一节 */
let tocClickLockUntil = 0;
let tocClickLockId = '';

/** 大纲 a[href] → 标题 id（兼容编码与裸 #） */
function tocLinkId(href: string | null | undefined): string {
	if (!href) return '';
	let s = href.trim();
	// 完整 URL 时只取 hash
	const hashIdx = s.indexOf('#');
	if (hashIdx >= 0) s = s.slice(hashIdx + 1);
	else if (s.startsWith('#')) s = s.slice(1);
	if (!s) return '';
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

function collectTocLinks(): HTMLAnchorElement[] {
	const toc = document.getElementById('doc-toc');
	const list: HTMLAnchorElement[] = [];
	if (toc) list.push(...toc.querySelectorAll<HTMLAnchorElement>('a[href]'));
	list.push(
		...document.querySelectorAll<HTMLAnchorElement>('.inline-toc__nav a[href]'),
	);
	return list;
}

/** 按标题 id 设置大纲选中（点击跳转后立刻反馈） */
function setTocActiveById(id: string): void {
	const want = (id || '').trim();
	if (!want) return;
	const links = collectTocLinks();
	if (!links.length) return;
	let matched = false;
	for (const l of links) {
		const on = tocLinkId(l.getAttribute('href')) === want;
		l.classList.toggle('is-active', on);
		if (on) matched = true;
	}
	// 未匹配到时不强行清空，交给 spy
	if (!matched && links[0]) {
		/* keep */
	}
}

function bindTocSpy() {
	tocSpyAbort?.abort();
	tocSpyAbort = new AbortController();
	const { signal } = tocSpyAbort;

	const toc = document.getElementById('doc-toc');
	const scrollEl =
		document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
		document.querySelector<HTMLElement>('.center-scroll') ||
		document.querySelector<HTMLElement>('[data-wiki-main]');
	const content = document.getElementById('content');
	if (!toc || !scrollEl || !content) return;
	const heads = [
		...content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
	].filter((h) => h.id);
	if (!heads.length) return;

	/**
	 * 滚动 spy：取「中栏顶部附近」最后经过的标题。
	 * 用相对 scroll 容器的坐标；href 与 id 比较时 decode（中文/全角）。
	 * 点击锁定期内不覆盖用户刚点的项（短文几乎不滚时否则会一直亮最后一节）。
	 */
	const mark = () => {
		const links = collectTocLinks();
		if (!links.length) return;
		if (Date.now() < tocClickLockUntil && tocClickLockId) {
			setTocActiveById(tocClickLockId);
			return;
		}
		const pr = scrollEl.getBoundingClientRect();
		// 路径栏下方一点：标题越过此线即视为当前节
		const line = pr.top + 56;
		let currentId = heads[0]?.id || '';
		for (const h of heads) {
			const top = h.getBoundingClientRect().top;
			if (top <= line) currentId = h.id;
			else break; // heads 为文档序，后面的更靠下
		}
		// 若第一个标题都在线下方（页顶），仍高亮第一节
		if (heads[0] && heads[0].getBoundingClientRect().top > line) {
			currentId = heads[0].id;
		}
		let current: Element | undefined;
		for (const l of links) {
			if (tocLinkId(l.getAttribute('href')) === currentId) {
				current = l;
				break;
			}
		}
		if (!current) current = links[0];
		links.forEach((l) => l.classList.toggle('is-active', l === current));
	};

	scrollEl.addEventListener('scroll', mark, { passive: true, signal });
	// 布局变化后再算一次
	requestAnimationFrame(mark);
	window.setTimeout(mark, 50);

	document.querySelectorAll('.inline-toc__nav a').forEach((a) => {
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

/** 从 /content/video/foo.mp4 推导候选封面 URL（与构建期 _Res_ 约定一致） */
function candidatePostersFromVideoSrc(src: string): string[] {
	try {
		const u = src.startsWith('http') ? new URL(src) : new URL(src, location.origin);
		const path = u.pathname;
		const m = path.match(/^\/content\/(.+)$/i);
		if (!m) return [];
		const rel = decodeURIComponent(m[1]);
		const parts = rel.split('/');
		const base = parts.pop() || '';
		const dir = parts.join('/');
		const stem = base.replace(/\.[^.]+$/, '');
		// 与 res-dir 一致：先完整文件名，再兼容旧无扩展名夹
		const names = [`_Res_${base}`, `_Res_${stem}`];
		const files = ['poster.jpg', 'poster.png', 'cover.jpg', 'cover.png', 'thumb.jpg'];
		const out: string[] = [];
		for (const n of names) {
			for (const f of files) {
				const p = dir ? `${dir}/${n}/${f}` : `${n}/${f}`;
				out.push(
					'/content/' +
						p
							.split('/')
							.map((s) => encodeURIComponent(s))
							.join('/'),
				);
			}
		}
		return out;
	} catch {
		return [];
	}
}

/**
 * 全页/文内视频封面：
 * 1) 已有 poster 属性 → 不动
 * 2) 同源 /content/ 视频 → 尝试 _Res_* 下 poster/cover 文件（与构建约定一致）
 * 3) 仍无则 canvas 抓帧（兜底）
 */
function bindVideoPosters() {
	document
		.querySelectorAll<HTMLVideoElement>(
			'video.media-video, .media-stage--video video, .markdown-body video',
		)
		.forEach((video) => {
		if (video.dataset.posterBound === '1') return;
		video.dataset.posterBound = '1';
		if (video.getAttribute('poster')) return;

		const src =
			video.currentSrc ||
			video.querySelector('source')?.getAttribute('src') ||
			video.getAttribute('src') ||
			'';

		const tryFilePosters = async (): Promise<boolean> => {
			const candidates = candidatePostersFromVideoSrc(src.split('#')[0] || src);
			for (const url of candidates) {
				try {
					const res = await fetch(url, { method: 'HEAD' });
					if (res.ok) {
						video.setAttribute('poster', url);
						return true;
					}
				} catch {
					/* next */
				}
			}
			return false;
		};

		const frameLuma = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
			try {
				const d = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
				return (d[0] + d[1] + d[2]) / 3;
			} catch {
				return 128;
			}
		};

		const capture = (): boolean => {
			if (video.videoWidth < 2 || video.videoHeight < 2) return false;
			try {
				const c = document.createElement('canvas');
				c.width = video.videoWidth;
				c.height = video.videoHeight;
				const ctx = c.getContext('2d');
				if (!ctx) return false;
				ctx.drawImage(video, 0, 0, c.width, c.height);
				if (frameLuma(ctx, c.width, c.height) < 10) return false;
				video.setAttribute('poster', c.toDataURL('image/jpeg', 0.84));
				return true;
			} catch {
				return false;
			}
		};

		const seekTo = (t: number) =>
			new Promise<void>((resolve) => {
				const done = () => {
					video.removeEventListener('seeked', done);
					resolve();
				};
				video.addEventListener('seeked', done);
				try {
					const dur = video.duration;
					const target =
						Number.isFinite(dur) && dur > 0
							? Math.min(Math.max(0, t), Math.max(0, dur - 0.05))
							: t;
					if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) {
						done();
						return;
					}
					video.currentTime = target;
				} catch {
					done();
				}
				window.setTimeout(done, 1200);
			});

		const run = async () => {
			if (video.getAttribute('poster')) return;
			// 优先用磁盘 _Res_* 封面（与全页同一文件）
			if (await tryFilePosters()) return;

			// 必须有可绘数据；过早 seek 会 abort 加载
			if (video.readyState < 2) {
				await new Promise<void>((resolve) => {
					const finish = () => {
						video.removeEventListener('loadeddata', finish);
						video.removeEventListener('canplay', finish);
						video.removeEventListener('error', finish);
						resolve();
					};
					video.addEventListener('loadeddata', finish, { once: true });
					video.addEventListener('canplay', finish, { once: true });
					video.addEventListener('error', finish, { once: true });
					window.setTimeout(finish, 10000);
				});
			}
			if (video.readyState < 2 || video.videoWidth < 2) return;
			if (!video.paused) return; // 用户已在播，勿抢控制权

			const candidates = [0.001, 0.25, 0.6, 1.2];
			for (const t of candidates) {
				if (!video.paused) return;
				await seekTo(t);
				if (capture()) break;
			}
			if (video.paused) {
				try {
					video.currentTime = 0;
				} catch {
					/* ignore */
				}
			}
		};

		void run();
	});
}

/**
 * PDF 预览 — PDF.js 自带阅读器（工具栏 + 左侧缩略图分页）
 * 不依赖系统 iframe PDF 壳（手机上常无控件/无侧栏）
 */
function bindPdfEmbeds() {
	document.querySelectorAll<HTMLElement>('.pdf-shell').forEach((root) => {
		if (root.dataset.bound) return;
		root.dataset.bound = '1';
		const status = root.querySelector<HTMLElement>('[data-pdf-status]');
		const viewer = root.querySelector<HTMLElement>('[data-pdf-viewer]');
		const err = root.querySelector<HTMLElement>('[data-pdf-err]');
		const el = root.querySelector('script[type="application/pdf-base64"]');
		const b64 = (el?.textContent || '').trim();
		const fallbackSrc = root.dataset.pdfSrc || '';
		const name = root.dataset.pdfName || 'document.pdf';

		const pagesScroll = root.querySelector<HTMLElement>('[data-pdf-pages-scroll]');
		const thumbsList = root.querySelector<HTMLElement>('[data-pdf-thumbs-list]');
		const thumbsPane = root.querySelector<HTMLElement>('[data-pdf-thumbs-pane]');
		const pageInput = root.querySelector<HTMLInputElement>('[data-pdf-page]');
		const pagesLabel = root.querySelector<HTMLElement>('[data-pdf-pages]');
		const zoomLabel = root.querySelector<HTMLElement>('[data-pdf-zoom-label]');
		const dl = root.querySelector<HTMLAnchorElement>('[data-pdf-download]');

		let pdfDoc: pdfjs.PDFDocumentProxy | null = null;
		let currentPage = 1;
		let scale = 1;
		let fitWidth = true;
		let rendering = false;
		let blobUrl = '';
		const pageEls: HTMLElement[] = [];

		const showError = (msg: string) => {
			if (status) status.hidden = true;
			if (viewer) viewer.hidden = true;
			if (err) {
				err.hidden = false;
				err.textContent = msg;
			}
		};

		const updateChrome = () => {
			const n = pdfDoc?.numPages || 1;
			if (pageInput) {
				pageInput.max = String(n);
				pageInput.value = String(currentPage);
			}
			if (pagesLabel) pagesLabel.textContent = String(n);
			if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
			thumbsList?.querySelectorAll('.pdf-thumb').forEach((t, i) => {
				t.classList.toggle('is-active', i + 1 === currentPage);
			});
		};

		const scrollToPage = (num: number, smooth = true) => {
			const el = pageEls[num - 1];
			if (!el || !pagesScroll) return;
			el.scrollIntoView({
				behavior: smooth ? 'smooth' : 'auto',
				block: 'start',
			});
			currentPage = num;
			updateChrome();
		};

		const computeFitScale = async () => {
			if (!pdfDoc || !pagesScroll) return 1;
			const page = await pdfDoc.getPage(1);
			const base = page.getViewport({ scale: 1 });
			const pad = 16;
			const w = Math.max(120, pagesScroll.clientWidth - pad);
			return Math.max(0.35, Math.min(3, w / base.width));
		};

		const renderAllPages = async () => {
			if (!pdfDoc || !pagesScroll || rendering) return;
			rendering = true;
			try {
				if (fitWidth) scale = await computeFitScale();
				pagesScroll.innerHTML = '';
				pageEls.length = 0;
				const n = pdfDoc.numPages;
				for (let i = 1; i <= n; i++) {
					const page = await pdfDoc.getPage(i);
					const viewport = page.getViewport({ scale });
					const wrap = document.createElement('div');
					wrap.className = 'pdf-page';
					wrap.dataset.page = String(i);
					wrap.setAttribute('aria-label', `第 ${i} 页`);
					const canvas = document.createElement('canvas');
					const dpr = Math.min(window.devicePixelRatio || 1, 2);
					canvas.width = Math.floor(viewport.width * dpr);
					canvas.height = Math.floor(viewport.height * dpr);
					canvas.style.width = `${viewport.width}px`;
					canvas.style.height = `${viewport.height}px`;
					const ctx = canvas.getContext('2d');
					if (!ctx) continue;
					ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
					wrap.appendChild(canvas);
					pagesScroll.appendChild(wrap);
					pageEls.push(wrap);
					await page.render({
						canvasContext: ctx,
						viewport,
						// pdfjs 4.x types
						canvas: canvas as unknown as HTMLCanvasElement,
					} as Parameters<typeof page.render>[0]).promise;
				}
				updateChrome();
				// 保持当前页在视口内
				if (currentPage >= 1 && currentPage <= n) {
					scrollToPage(currentPage, false);
				}
			} finally {
				rendering = false;
			}
		};

		const renderThumbs = async () => {
			if (!pdfDoc || !thumbsList) return;
			thumbsList.innerHTML = '';
			const n = pdfDoc.numPages;
			const thumbScale = 0.18;
			for (let i = 1; i <= n; i++) {
				const page = await pdfDoc.getPage(i);
				const viewport = page.getViewport({ scale: thumbScale });
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'pdf-thumb';
				btn.dataset.page = String(i);
				btn.setAttribute('aria-label', `跳到第 ${i} 页`);
				const canvas = document.createElement('canvas');
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				canvas.width = Math.floor(viewport.width * dpr);
				canvas.height = Math.floor(viewport.height * dpr);
				canvas.style.width = `${viewport.width}px`;
				canvas.style.height = `${viewport.height}px`;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
					await page.render({
						canvasContext: ctx,
						viewport,
						canvas: canvas as unknown as HTMLCanvasElement,
					} as Parameters<typeof page.render>[0]).promise;
				}
				const label = document.createElement('span');
				label.className = 'pdf-thumb-label';
				label.textContent = String(i);
				btn.appendChild(canvas);
				btn.appendChild(label);
				btn.addEventListener('click', () => {
					scrollToPage(i);
					// 窄屏点缩略图后收起侧栏，避免挡内容
					if (window.matchMedia('(max-width: 640px)').matches && thumbsPane) {
						thumbsPane.hidden = true;
						root
							.querySelector('[data-pdf-toggle-thumbs]')
							?.setAttribute('aria-pressed', 'false');
						root.classList.remove('pdf-thumbs-open');
					}
				});
				thumbsList.appendChild(btn);
			}
			updateChrome();
		};

		const openPdf = async (data: Uint8Array) => {
			if (data.byteLength < 8) throw new Error(`PDF 数据过短 (${data.byteLength})`);
			const magic = new TextDecoder('latin1').decode(data.slice(0, 5));
			if (magic !== '%PDF-') throw new Error(`无效 PDF 头: ${JSON.stringify(magic)}`);

			const copy = new Uint8Array(data.byteLength);
			copy.set(data);
			const blob = new Blob([copy.buffer], { type: 'application/pdf' });
			if (blobUrl) URL.revokeObjectURL(blobUrl);
			blobUrl = URL.createObjectURL(blob);
			root.dataset.blobUrl = blobUrl;
			if (dl) {
				// 下载链优先同源 /content/ 原件（手机对 blob: + download 支持差）
				const officeSrc = root.dataset.officeSrc || '';
				const fileSrc = root.dataset.pdfSrc || '';
				if (officeSrc) {
					dl.href = officeSrc;
					dl.download = name || 'document';
					dl.title = '下载原文件';
				} else if (fileSrc) {
					dl.href = fileSrc;
					dl.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
					dl.title = '下载 PDF';
				} else {
					dl.href = blobUrl;
					dl.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
				}
			}

			// pdf.js 需要可转移的 buffer 副本
			const loading = pdfjs.getDocument({ data: copy.slice() });
			pdfDoc = await loading.promise;
			if (status) status.hidden = true;
			if (viewer) viewer.hidden = false;
			if (err) err.hidden = true;

			// 桌面默认打开侧栏；窄屏默认关，点工具栏打开
			const wide = window.matchMedia('(min-width: 641px)').matches;
			if (thumbsPane) {
				thumbsPane.hidden = !wide;
				root.classList.toggle('pdf-thumbs-open', wide);
				root
					.querySelector('[data-pdf-toggle-thumbs]')
					?.setAttribute('aria-pressed', wide ? 'true' : 'false');
			}

			await renderAllPages();
			void renderThumbs();
		};

		// 工具栏
		root.querySelector('[data-pdf-toggle-thumbs]')?.addEventListener('click', () => {
			if (!thumbsPane) return;
			const open = thumbsPane.hidden;
			thumbsPane.hidden = !open;
			root.classList.toggle('pdf-thumbs-open', open);
			root
				.querySelector('[data-pdf-toggle-thumbs]')
				?.setAttribute('aria-pressed', open ? 'true' : 'false');
		});
		root.querySelector('[data-pdf-prev]')?.addEventListener('click', () => {
			if (currentPage > 1) scrollToPage(currentPage - 1);
		});
		root.querySelector('[data-pdf-next]')?.addEventListener('click', () => {
			if (pdfDoc && currentPage < pdfDoc.numPages) scrollToPage(currentPage + 1);
		});
		pageInput?.addEventListener('change', () => {
			const n = Number(pageInput.value) || 1;
			const max = pdfDoc?.numPages || 1;
			scrollToPage(Math.min(max, Math.max(1, Math.floor(n))));
		});
		root.querySelector('[data-pdf-zoom-in]')?.addEventListener('click', () => {
			fitWidth = false;
			scale = Math.min(3, scale + 0.15);
			void renderAllPages();
		});
		root.querySelector('[data-pdf-zoom-out]')?.addEventListener('click', () => {
			fitWidth = false;
			scale = Math.max(0.35, scale - 0.15);
			void renderAllPages();
		});
		root.querySelector('[data-pdf-fit]')?.addEventListener('click', () => {
			fitWidth = true;
			void renderAllPages();
		});

		// 滚动同步当前页
		pagesScroll?.addEventListener(
			'scroll',
			() => {
				if (!pagesScroll || !pageEls.length) return;
				const top = pagesScroll.scrollTop + 24;
				let best = 1;
				for (let i = 0; i < pageEls.length; i++) {
					if (pageEls[i].offsetTop <= top) best = i + 1;
				}
				if (best !== currentPage) {
					currentPage = best;
					updateChrome();
				}
			},
			{ passive: true },
		);

		// 窗口变化：适应宽度时重排
		let resizeT: number | null = null;
		const onResize = () => {
			if (!fitWidth || !pdfDoc) return;
			if (resizeT) window.clearTimeout(resizeT);
			resizeT = window.setTimeout(() => void renderAllPages(), 180);
		};
		window.addEventListener('resize', onResize);

		const boot = async () => {
			try {
				if (b64) {
					await openPdf(b64ToUint8(b64));
					return;
				}
				if (!fallbackSrc) {
					showError('构建时未嵌入 PDF 数据');
					return;
				}
				const res = await fetch(fallbackSrc);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				await openPdf(new Uint8Array(await res.arrayBuffer()));
			} catch (e) {
				showError(e instanceof Error ? e.message : String(e));
			}
		};
		void boot();
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
		// 软导航进行中忽略锚点，避免与换页抢 scroll
		if (softNavBusy) return;
		// 文件夹树定位链不走大纲逻辑
		if (a.getAttribute('href')?.startsWith('#tree-dir=')) return;
		const id = tocLinkId(a.getAttribute('href'));
		if (!id) return;
		const el = document.getElementById(id);
		if (!el) return;
		ev.preventDefault();
		const pane =
			document.querySelector<HTMLElement>('[data-wiki-scroll]') ||
			document.querySelector<HTMLElement>('.center-scroll');
		/*
		 * 窄屏必须用 auto：smooth 动画挂在可复用的 .center-scroll 上，
		 * 换文件后动画帧仍会改 scrollTop → 滚出内容区变空白，触摸才恢复。
		 * 宽屏也统一 auto，避免同类竞态；观感几乎无差。
		 */
		scrollElWithinPane(el, pane, { behavior: 'auto', offset: 12 });
		// 大纲点击：立刻切换选中 + 短时锁定（防 spy 盖掉）
		if (
			a.closest('#doc-toc') ||
			a.closest('.inline-toc') ||
			a.closest('.doc-toc')
		) {
			tocClickLockId = id;
			tocClickLockUntil = Date.now() + 600;
			setTocActiveById(id);
			// 滚动后再钉一次（forcePaneScrollTop 可能触发 scroll → spy）
			requestAnimationFrame(() => setTocActiveById(id));
		}
		// hash 编码更稳妥（中文 id）
		try {
			history.replaceState(null, '', `#${encodeURIComponent(id)}`);
		} catch {
			history.replaceState(null, '', `#${id}`);
		}
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

/**
 * 打开/切换文件页：
 * - is-active / is-on-path（进入）跟当前文件
 * - focus 同步到「该文件所在目录」
 */
function syncTreeActiveFromDoc(doc: Document) {
	const tree = document.getElementById('file-tree');
	if (!tree) return;
	const active = doc.querySelector<HTMLElement>('#file-tree .tree-file.is-active');
	const path = active?.dataset.path || '';
	tree.querySelectorAll('.tree-file.is-active').forEach((el) => {
		el.classList.remove('is-active');
	});
	// 站级主页：无文件进入态；保留用户已有 focus（若有）
	if (!path || path === '__home__') {
		applyTreeOpenState();
		return;
	}
	const link = tree.querySelector<HTMLElement>(
		`.tree-file[data-path="${CSS.escape(path)}"]`,
	);
	if (!link) {
		applyTreeOpenState();
		return;
	}
	link.classList.add('is-active');
	// 打开新文件 ≡ focus 到该文件所在目录
	treeFocusDirPath = parentDirOfFile(path);
	applyTreeOpenState();
}

/**
 * 标记 Markdown 中「单独成行」的媒体，供固定模式居中。
 * 纯 CSS :only-child 易被空白文本节点拆掉，故用 JS 识别。
 */
function markStandaloneMediaLines(root: ParentNode = document) {
	const bodies = root.querySelectorAll<HTMLElement>('.markdown-body');
	bodies.forEach((body) => {
		body.querySelectorAll('.is-media-line').forEach((el) => {
			el.classList.remove('is-media-line');
		});

		const isMediaEl = (el: Element) => {
			const t = el.tagName;
			if (t === 'IMG' || t === 'VIDEO' || t === 'AUDIO' || t === 'FIGURE') return true;
			// 全页 .media-stage 走舞台 flex 居中，勿标 is-media-line（fixed 下会 display:block 顶掉纵向居中）
			if (el.classList.contains('webmd-embed')) return true;
			// 链接里只有一张图
			if (t === 'A') {
				const kids = [...el.children];
				return kids.length === 1 && kids[0]!.tagName === 'IMG';
			}
			return false;
		};

		/** 仅显式左/右/对齐时退出固定居中；media-size-sm 只改尺寸，仍可 is-media-line */
		const wantsExplicitAlign = (el: Element) =>
			el.classList.contains('media-sm') ||
			el.classList.contains('media-left') ||
			el.classList.contains('media-right') ||
			el.hasAttribute('data-media-align');

		// 顶层直接媒体（跳过全页 media-stage）
		[...body.children].forEach((el) => {
			if (el.classList.contains('media-stage')) return;
			if (wantsExplicitAlign(el)) return;
			if (isMediaEl(el)) el.classList.add('is-media-line');
		});

		// 段落：去掉空白文本后只剩一个媒体节点
		body.querySelectorAll(':scope > p').forEach((p) => {
			const significant = [...p.childNodes].filter((n) => {
				if (n.nodeType === Node.TEXT_NODE) return Boolean(n.textContent?.trim());
				if (n.nodeType === Node.ELEMENT_NODE) return true;
				return false;
			});
			if (significant.length !== 1) return;
			const only = significant[0]!;
			if (only.nodeType === Node.ELEMENT_NODE && isMediaEl(only as Element)) {
				if (wantsExplicitAlign(only as Element) || wantsExplicitAlign(p)) return;
				p.classList.add('is-media-line');
			}
		});
	});
}

function rebindPageWidgets() {
	closeAllPathPopovers();
	bindCodeCopy();
	bindBreadcrumbActions();
	bindMiddleEllipsis();
	bindPdfEmbeds();
	bindExcelViewers();
	bindVideoPosters();
	bindTocSpy();
	// 顶栏铺满按钮不在中间栏，软导航后只需同步状态
	syncFocusReadButtons();
	// 先公式再图示（避免互相干扰）
	renderKatexBlocks();
	void renderMermaidBlocks();
	void renderPlantumlBlocks();
	void renderGraphvizBlocks();
	// 固定模式：单独成行的图/视频/音频加 is-media-line
	markStandaloneMediaLines();
}

let softNavBusy = false;
/** 世代号：连点时只应用最后一次；中间 fetch 结果丢弃 */
let softNavGen = 0;
/** 中断上一次软导航的 fetch */
let softNavAbort: AbortController | null = null;

/**
 * 软导航「页面内」会话缓存（业界 SPA：keep-alive + TTL + SWR）
 * - 先展示缓存 → 后台对比远端（ETag/正文）→ 不同才更新并（若仍在该页）静默刷新
 * - 离开后保留 SOFT_NAV_CACHE_TTL_MS，超时卸载；条数 LRU 上限
 * - 与 HTTP/CDN 缓存是两层；整页刷新清空本 Map
 */
const SOFT_NAV_CACHE_MAX = 48;
/** 离开后保留时长：10 分钟无再访问则卸载 */
const SOFT_NAV_CACHE_TTL_MS = 10 * 60 * 1000;
type SoftNavCacheEntry = {
	html: string;
	/** 最近一次访问（进入或离开时刷新），用于 TTL */
	lastAccess: number;
	/** 条件请求，304 表示未改 */
	etag?: string;
	lastModified?: string;
};
const softNavHtmlCache = new Map<string, SoftNavCacheEntry>();
const softNavPrefetching = new Set<string>();
/** 正在后台 revalidate 的 key，避免重复打 */
const softNavRevalidating = new Set<string>();
let softNavCacheSweepTimer: number | null = null;

function normalizePathname(p: string): string {
	if (!p || p === '/') return '/';
	// 统一无尾斜杠再比，避免 /a 与 /a/ 被当成同页误判
	return p.replace(/\/+$/, '') || '/';
}

function softNavCacheKey(url: URL): string {
	return normalizePathname(url.pathname) + (url.search || '');
}

function softNavCacheKeyFromPath(pathname: string, search = ''): string {
	return normalizePathname(pathname) + (search || '');
}

function softNavIsCurrentKey(key: string): boolean {
	try {
		return softNavCacheKey(new URL(location.href)) === key;
	} catch {
		return false;
	}
}

/** 扫掉超过 TTL 的条目 */
function pruneSoftNavCache(now = Date.now()): void {
	for (const [k, e] of softNavHtmlCache) {
		if (now - e.lastAccess > SOFT_NAV_CACHE_TTL_MS) {
			softNavHtmlCache.delete(k);
		}
	}
	// 仍超上限：按 lastAccess 最旧删
	while (softNavHtmlCache.size > SOFT_NAV_CACHE_MAX) {
		let oldestKey: string | null = null;
		let oldestAt = Infinity;
		for (const [k, e] of softNavHtmlCache) {
			if (e.lastAccess < oldestAt) {
				oldestAt = e.lastAccess;
				oldestKey = k;
			}
		}
		if (oldestKey == null) break;
		softNavHtmlCache.delete(oldestKey);
	}
}

function ensureSoftNavCacheSweeper(): void {
	if (softNavCacheSweepTimer != null) return;
	softNavCacheSweepTimer = window.setInterval(() => {
		pruneSoftNavCache();
	}, 60_000);
}

function getSoftNavCacheEntry(key: string): SoftNavCacheEntry | null {
	pruneSoftNavCache();
	const e = softNavHtmlCache.get(key);
	if (!e) return null;
	const now = Date.now();
	if (now - e.lastAccess > SOFT_NAV_CACHE_TTL_MS) {
		softNavHtmlCache.delete(key);
		return null;
	}
	// 再访问：续命 + LRU 挪到末尾
	e.lastAccess = now;
	softNavHtmlCache.delete(key);
	softNavHtmlCache.set(key, e);
	return e;
}

function getSoftNavCache(key: string): string | null {
	return getSoftNavCacheEntry(key)?.html ?? null;
}

function putSoftNavCache(
	key: string,
	html: string,
	meta?: { etag?: string; lastModified?: string },
): void {
	if (!key || !html) return;
	const now = Date.now();
	const prev = softNavHtmlCache.get(key);
	if (softNavHtmlCache.has(key)) softNavHtmlCache.delete(key);
	softNavHtmlCache.set(key, {
		html,
		lastAccess: now,
		etag: meta?.etag ?? prev?.etag,
		lastModified: meta?.lastModified ?? prev?.lastModified,
	});
	pruneSoftNavCache(now);
	ensureSoftNavCacheSweeper();
}

/**
 * 离开某页时调用：刷新该页 lastAccess，开始「离开后 TTL」计时。
 * 在 TTL 内再点回来仍命中；超时才卸载。
 */
function markSoftNavPageLeft(pathname: string, search = location.search): void {
	const key = softNavCacheKeyFromPath(pathname, search);
	const e = softNavHtmlCache.get(key);
	if (!e) return;
	e.lastAccess = Date.now();
	// 挪到末尾，避免刚离开就被 LRU 挤掉
	softNavHtmlCache.delete(key);
	softNavHtmlCache.set(key, e);
}

/**
 * 后台对比远端：有缓存先给用户看；仅当 200 且正文不同才更新缓存，
 * 若用户仍停留在该 URL 则静默换页（无 loading）。
 * 优先 ETag/Last-Modified 条件请求（304=未改）；无校验头则比 HTML 字符串。
 */
async function revalidateSoftNavPage(url: URL, key: string): Promise<void> {
	if (softNavRevalidating.has(key)) return;
	softNavRevalidating.add(key);
	try {
		const prev = softNavHtmlCache.get(key);
		const headers: Record<string, string> = { Accept: 'text/html' };
		if (prev?.etag) headers['If-None-Match'] = prev.etag;
		if (prev?.lastModified) headers['If-Modified-Since'] = prev.lastModified;

		const res = await fetch(url.pathname + url.search, {
			headers,
			credentials: 'same-origin',
			// 强制走协商/网络校验，避免只啃磁盘旧副本
			cache: 'no-cache',
		});

		// 未修改
		if (res.status === 304) {
			if (prev) {
				putSoftNavCache(key, prev.html, {
					etag: res.headers.get('ETag') || prev.etag,
					lastModified:
						res.headers.get('Last-Modified') || prev.lastModified,
				});
			}
			return;
		}
		if (!res.ok) return;

		const html = await res.text();
		const etag = res.headers.get('ETag') || undefined;
		const lastModified = res.headers.get('Last-Modified') || undefined;

		// 正文相同：只刷新元数据
		if (prev && prev.html === html) {
			putSoftNavCache(key, html, { etag, lastModified });
			return;
		}

		// 不同：写入新缓存；若仍在该页则静默应用
		putSoftNavCache(key, html, { etag, lastModified });
		if (!softNavIsCurrentKey(key) || softNavBusy) return;

		const doc = new DOMParser().parseFromString(html, 'text/html');
		// 仍在同页：不 pushState，不打断滚动过多（尽量保留 scroll）
		const scrollEl = document.querySelector<HTMLElement>('[data-wiki-scroll]');
		const keepScroll = scrollEl?.scrollTop ?? 0;
		applySoftNavDocument(doc, url, false);
		if (scrollEl && keepScroll > 0) {
			forcePaneScrollTop(scrollEl, keepScroll);
		}
	} catch {
		/* 后台校验失败忽略，继续用缓存 */
	} finally {
		softNavRevalidating.delete(key);
	}
}

/** 悬停/触摸时预取页面 HTML，点开即可命中缓存 */
function prefetchSoftNavPage(href: string): void {
	let url: URL;
	try {
		url = new URL(href, location.href);
	} catch {
		return;
	}
	if (url.origin !== location.origin) return;
	const key = softNavCacheKey(url);
	if (softNavHtmlCache.has(key) || softNavPrefetching.has(key)) return;
	softNavPrefetching.add(key);
	void (async () => {
		try {
			const res = await fetch(url.pathname + url.search, {
				headers: { Accept: 'text/html' },
				credentials: 'same-origin',
				// 允许浏览器 HTTP 缓存；与软导航一致
				cache: 'default',
			});
			if (!res.ok) return;
			const html = await res.text();
			putSoftNavCache(key, html, {
				etag: res.headers.get('ETag') || undefined,
				lastModified: res.headers.get('Last-Modified') || undefined,
			});
		} catch {
			/* 预取失败忽略 */
		} finally {
			softNavPrefetching.delete(key);
		}
	})();
}

/**
 * 软导航加载条：仅进度条，无文字。
 * 位置：header 下方、中栏路径栏上方（插在 [data-wiki-main] 内路径栏之前）。
 * 缓存命中时不调用，避免「再打开还转圈」。
 */
function setSoftNavLoading(on: boolean, _label?: string) {
	const main = document.querySelector<HTMLElement>('[data-wiki-main]');
	const scroll = document.querySelector<HTMLElement>('[data-wiki-scroll]');
	if (!main) return;
	main.classList.toggle('is-soft-nav', on);
	main.classList.toggle('is-soft-nav-loading', on);
	let bar = document.querySelector<HTMLElement>('[data-soft-nav-progress]');
	if (on) {
		if (!bar) {
			bar = document.createElement('div');
			bar.className = 'soft-nav-progress';
			bar.dataset.softNavProgress = '1';
			bar.setAttribute('role', 'progressbar');
			bar.setAttribute('aria-label', '页面加载中');
			bar.setAttribute('aria-busy', 'true');
			bar.innerHTML =
				`<span class="soft-nav-progress__bar" aria-hidden="true"></span>`;
		}
		// 始终挂在路径栏上方（header 下、路径上）
		const crumb = main.querySelector('.pane-bar--center, [data-wiki-crumb]');
		if (crumb && crumb.parentElement === main) {
			if (bar.nextElementSibling !== crumb) {
				main.insertBefore(bar, crumb);
			}
		} else if (bar.parentElement !== main) {
			main.insertBefore(bar, main.firstChild);
		}
		bar.hidden = false;
		if (scroll) scroll.setAttribute('aria-busy', 'true');
	} else {
		if (bar) {
			bar.hidden = true;
			bar.removeAttribute('aria-busy');
		}
		if (scroll) scroll.removeAttribute('aria-busy');
	}
}

/** 把已解析的 Document 应用到当前壳（路径栏/中栏/大纲/底栏） */
function applySoftNavDocument(doc: Document, url: URL, push: boolean): void {
	// 标题
	document.title = doc.title || document.title;

	// body 页面态 class（媒体页 is-image-page 等）——保留运行时类，勿整串覆盖
	// 注意：is-sheet-app-page / is-xs-page 等必须算页面态！
	const PAGE_STATE =
		/^is-(?:text|home|image|video|audio|pdf|binary|media|source|file|markdown|sheet|sheet-app|xs|office|xlsx)-page$/;
	const nextBodyClass = doc.body.className || '';
	const pageStates = nextBodyClass
		.split(/\s+/)
		.filter((c) => PAGE_STATE.test(c));
	const keepRuntime = Array.from(document.body.classList).filter(
		(c) => c && c !== 'wiki-body' && !PAGE_STATE.test(c),
	);
	document.body.className = ['wiki-body', ...pageStates, ...keepRuntime]
		.filter((c, i, arr) => c && arr.indexOf(c) === i)
		.join(' ');

	// 路径栏（固定顶栏，不在滚动区内）
	const nextCrumb = doc.querySelector('[data-wiki-crumb]');
	const curCrumb = document.querySelector('[data-wiki-crumb]');
	if (nextCrumb && curCrumb) {
		curCrumb.innerHTML = nextCrumb.innerHTML;
	}

	// 中间滚动区：文内大纲 + article
	const nextScroll = doc.querySelector('[data-wiki-scroll]');
	const curScroll = document.querySelector<HTMLElement>('[data-wiki-scroll]');
	if (nextScroll && curScroll) {
		forcePaneScrollTop(curScroll, 0);
		curScroll.innerHTML = nextScroll.innerHTML;
		forcePaneScrollTop(curScroll, 0);
	} else if (!curScroll) {
		location.href = url.href;
		return;
	}

	// 右侧大纲
	const nextToc = doc.querySelector('#doc-toc');
	const curToc = document.querySelector<HTMLElement>('#doc-toc');
	if (nextToc && curToc) {
		forcePaneScrollTop(curToc, 0);
		curToc.innerHTML = nextToc.innerHTML;
		forcePaneScrollTop(curToc, 0);
	}

	// 底部分页
	const nextFooter = doc.querySelector('.wiki-page-footer');
	const curFooter = document.querySelector('.wiki-page-footer');
	if (nextFooter && curFooter) curFooter.innerHTML = nextFooter.innerHTML;

	// 先改 URL，再同步树高亮
	if (push) {
		history.pushState({ soft: true }, '', url.pathname + url.search + url.hash);
	}

	syncTreeActiveFromDoc(doc);
	refreshWikiPagerFromTree();

	if (isDrawerViewport()) {
		setNavDrawer(false);
		setTocDrawer(false);
	}
	closeAllDrawers();
	exitCenterPseudoFullscreen();

	rebindPageWidgets();
	if (document.querySelector('[data-sheet-app]')) {
		prefetchSheetEngines();
	}
	reassertContentWidthMode();
	applyLayout(loadState());
	updateContentReadableMax();

	const saved = loadViewState(url.pathname);
	const scrollEl = document.querySelector<HTMLElement>('[data-wiki-scroll]');
	const tocEl = document.querySelector<HTMLElement>('#doc-toc');
	const applyMainScroll = () => {
		if (!scrollEl) return;
		if (url.hash) {
			const id = decodeURIComponent(url.hash.slice(1));
			const target = id ? document.getElementById(id) : null;
			if (target) scrollElWithinPane(target, scrollEl, { behavior: 'auto', offset: 12 });
			else forcePaneScrollTop(scrollEl, 0);
		} else if (!push && saved && saved.scrollMain > 0) {
			forcePaneScrollTop(scrollEl, saved.scrollMain);
		} else {
			forcePaneScrollTop(scrollEl, 0);
		}
		if (tocEl) {
			if (!push && saved) forcePaneScrollTop(tocEl, saved.scrollToc || 0);
			else forcePaneScrollTop(tocEl, 0);
		}
		pinDocumentScroll();
	};
	applyMainScroll();
	requestAnimationFrame(() => {
		applyMainScroll();
		requestAnimationFrame(applyMainScroll);
	});
	window.setTimeout(applyMainScroll, 50);
	window.setTimeout(applyMainScroll, 200);
	window.setTimeout(applyMainScroll, 400);
	syncAppHeaderOffset();
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

	const cacheKey = softNavCacheKey(url);
	const cachedHtml = getSoftNavCache(cacheKey);

	// 连点：中断上一次 fetch，只跟最后一次（无中间页队列）
	softNavAbort?.abort();
	const ac = new AbortController();
	softNavAbort = ac;
	const gen = ++softNavGen;

	// 离开当前页前记下滚动与目录展开（仅第一次打断时记旧页）
	if (!softNavBusy) {
		saveViewState(location.pathname);
		// 离开页：续上会话缓存 TTL（离开后保留一段时间再卸载）
		markSoftNavPageLeft(location.pathname, location.search);
	}
	cancelMainPaneScrollAnimations();

	softNavBusy = true;
	// 缓存命中：先秒开、不 loading；后台 revalidate。未命中才显示进度条
	const fromCache = Boolean(cachedHtml);
	if (!fromCache) {
		setSoftNavLoading(true);
	}

	const busyWatch = window.setTimeout(() => {
		if (softNavGen === gen) {
			softNavBusy = false;
			setSoftNavLoading(false);
		}
	}, 15000);

	try {
		let html = cachedHtml;
		if (!html) {
			const res = await fetch(url.pathname + url.search, {
				headers: { Accept: 'text/html' },
				credentials: 'same-origin',
				// 允许 HTTP 磁盘缓存；内存缓存另管「再打开不 loading」
				cache: 'default',
				signal: ac.signal,
			});
			if (gen !== softNavGen || ac.signal.aborted) return;
			if (!res.ok) {
				location.href = url.href;
				return;
			}
			html = await res.text();
			if (gen !== softNavGen || ac.signal.aborted) return;
			putSoftNavCache(cacheKey, html, {
				etag: res.headers.get('ETag') || undefined,
				lastModified: res.headers.get('Last-Modified') || undefined,
			});
		}

		const doc = new DOMParser().parseFromString(html, 'text/html');
		if (gen !== softNavGen || ac.signal.aborted) return;

		applySoftNavDocument(doc, url, push);

		// 先缓存后校验：后台对比远端，不同且仍在该页则静默换新
		if (fromCache && gen === softNavGen) {
			void revalidateSoftNavPage(url, cacheKey);
		}
	} catch (err) {
		if (
			(err instanceof DOMException && err.name === 'AbortError') ||
			(err instanceof Error && err.name === 'AbortError') ||
			gen !== softNavGen
		) {
			return;
		}
		location.href = url.href;
	} finally {
		window.clearTimeout(busyWatch);
		if (gen === softNavGen) {
			setSoftNavLoading(false);
			const scrollEl = document.querySelector<HTMLElement>('[data-wiki-scroll]');
			if (scrollEl) {
				void scrollEl.offsetHeight;
				forcePaneScrollTop(scrollEl, scrollEl.scrollTop);
			}
			softNavBusy = false;
			if (softNavAbort === ac) softNavAbort = null;
			pinDocumentScroll();
		}
	}
}

function bindSoftNav() {
	// 悬停：预取页面 HTML + 表格引擎（点开秒开/少 loading）
	const warmLink = (a: HTMLAnchorElement) => {
		const href = a.getAttribute('href') || a.href;
		if (!href) return;
		prefetchSoftNavPage(href);
		if (
			/\.(xlsx|xls|ods|csv)(\/)?([?#].*)?$/i.test(href) ||
			/\/pages\/.*\.(xlsx|xls|ods|csv)/i.test(href)
		) {
			prefetchSheetEngines();
		}
	};
	document.addEventListener(
		'pointerenter',
		(ev) => {
			const a = (ev.target as HTMLElement | null)?.closest?.(
				'#file-tree a[href], .wiki-page-footer a[href]',
			) as HTMLAnchorElement | null;
			if (a) warmLink(a);
		},
		true,
	);
	// 触摸设备无 hover：touchstart 也预取
	document.addEventListener(
		'touchstart',
		(ev) => {
			const a = (ev.target as HTMLElement | null)?.closest?.(
				'#file-tree a[href], .wiki-page-footer a[href]',
			) as HTMLAnchorElement | null;
			if (a) warmLink(a);
		},
		{ capture: true, passive: true },
	);
	document.addEventListener(
		'click',
		(ev) => {
			if (ev.button !== 0) return;
			if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
			const a = (ev.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
			if (!a) return;
			// 正文文件夹链优先：不进 soft-nav / 不 404
			if (
				(a.closest('#content') || a.closest('.markdown-body')) &&
				tryRevealInternalFolderLink(a)
			) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
			if (!isSoftNavLink(a)) return;
			if (a.closest('#file-tree') || a.closest('.wiki-page-footer')) warmLink(a);
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
			ev.preventDefault();
			ev.stopPropagation();
			void softNavigate(url.href, { push: true });
		},
		true,
	);

	window.addEventListener('popstate', () => {
		void softNavigate(location.href, { push: false });
	});

	// 首屏当前页也写入缓存，返回首页/再进本页可秒开
	try {
		const key = softNavCacheKey(new URL(location.href));
		if (!softNavHtmlCache.has(key)) {
			// 用当前 DOM 序列化成本高且缺完整 head；改为后台拉一份
			prefetchSoftNavPage(location.href);
		}
	} catch {
		/* ignore */
	}
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
		// 有 hash 时让锚点优先；否则恢复主栏滚动（勿用 scrollIntoView，会滚飞整页）
		if (location.hash) {
			const id = decodeURIComponent(location.hash.slice(1));
			const target = id ? document.getElementById(id) : null;
			if (target) {
				scrollElWithinPane(target, main, { offset: 12 });
				return;
			}
		}
		if (main) main.scrollTop = st.scrollMain;
		pinDocumentScroll();
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

/**
 * 是否按「移动端」处理下载（分享 / 强制 Blob）。
 * PC 桌面应走浏览器原生 a[download]，避免 Windows 等也弹 Web Share。
 */
function isMobileClient(): boolean {
	// UA Client Hints（Chromium）：最可靠
	const uaData = (
		navigator as Navigator & {
			userAgentData?: { mobile?: boolean };
		}
	).userAgentData;
	if (uaData && typeof uaData.mobile === 'boolean') {
		return uaData.mobile;
	}

	const ua = navigator.userAgent || '';
	if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) {
		return true;
	}
	// iPadOS 13+ 常伪装成 Mac，但带多点触控
	if (
		/iPad/i.test(ua) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	) {
		return true;
	}
	return false;
}

/** 仅 PC：Blob URL + a[download]，不走 share */
async function downloadViaBlobAnchor(url: string, filename: string): Promise<void> {
	const name = (filename || 'download').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download';
	let abs = url;
	try {
		abs = new URL(url, location.href).href;
	} catch {
		/* keep */
	}
	const res = await fetch(abs, { credentials: 'same-origin', cache: 'no-cache' });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const blob = await res.blob();
	const objectUrl = URL.createObjectURL(blob);
	try {
		const a = document.createElement('a');
		a.href = objectUrl;
		a.download = name;
		a.rel = 'noopener';
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		a.remove();
	} finally {
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
	}
}

/**
 * 移动端：fetch → Blob → 优先 Web Share「存储到文件」；否则 Blob 锚点。
 * （iOS 常忽略 a[download]，PDF 会直接打开预览）
 */
async function forceDownloadFileMobile(url: string, filename: string): Promise<void> {
	const name = (filename || 'download').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'download';
	let abs = url;
	try {
		abs = new URL(url, location.href).href;
	} catch {
		/* keep url */
	}

	const res = await fetch(abs, { credentials: 'same-origin', cache: 'no-cache' });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const blob = await res.blob();

	// Web Share 带文件：iOS/Android 可「存储到文件 / 分享」
	try {
		const file = new File([blob], name, {
			type: blob.type || 'application/octet-stream',
		});
		const nav = navigator as Navigator & {
			canShare?: (data?: ShareData) => boolean;
			share?: (data: ShareData) => Promise<void>;
		};
		if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && nav.share) {
			await nav.share({ files: [file], title: name });
			return;
		}
	} catch (e) {
		// 用户取消分享：视为完成，勿再弹下载
		if (e instanceof Error && e.name === 'AbortError') return;
	}

	// 无 Share 时：Blob URL + download
	const objectUrl = URL.createObjectURL(blob);
	try {
		const a = document.createElement('a');
		a.href = objectUrl;
		a.download = name;
		a.rel = 'noopener';
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		a.remove();
	} finally {
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
	}
}

function bindForceDownloads() {
	document.addEventListener(
		'click',
		(ev) => {
			const t = ev.target as HTMLElement | null;
			if (!t) return;
			const a = t.closest('a[download]') as HTMLAnchorElement | null;
			if (!a || a.getAttribute('aria-disabled') === 'true') return;
			// 仅处理站内 / 相对下载
			const href = a.getAttribute('href');
			if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
			let url: URL;
			try {
				url = new URL(a.href, location.href);
			} catch {
				return;
			}
			if (url.origin !== location.origin && !href.startsWith('blob:')) return;

			const filename =
				a.getAttribute('download') ||
				decodeURIComponent(url.pathname.split('/').pop() || '') ||
				'download';

			/*
			 * PC / 桌面：不拦截，交给浏览器原生 download（最稳、无 Share 面板）。
			 * blob: 链在部分桌面浏览器上原生可能不稳 → 仍用 Blob 锚点强制一次。
			 */
			if (!isMobileClient()) {
				if (href.startsWith('blob:') || url.protocol === 'blob:') {
					ev.preventDefault();
					ev.stopPropagation();
					void downloadViaBlobAnchor(url.href, filename).catch(() => {
						window.open(url.href, '_blank', 'noopener');
					});
				}
				// 普通 /content/ 同源：放行原生 <a download>
				return;
			}

			// —— 移动端：拦截 + 分享/强制下载 ——
			ev.preventDefault();
			ev.stopPropagation();

			const prevLabel = a.getAttribute('aria-label') || '';
			a.setAttribute('aria-busy', 'true');
			a.classList.add('is-downloading');
			void forceDownloadFileMobile(url.href, filename)
				.catch(() => {
					// 兜底：带 dl=1 让开发服尽量 attachment（静态托管仍可能预览）
					const fallback = new URL(url.href);
					if (!fallback.searchParams.has('dl')) fallback.searchParams.set('dl', '1');
					window.open(fallback.href, '_blank', 'noopener');
				})
				.finally(() => {
					a.removeAttribute('aria-busy');
					a.classList.remove('is-downloading');
					if (prevLabel) a.setAttribute('aria-label', prevLabel);
				});
		},
		true,
	);
}

bindTheme();
bindToggles();
bindGutters();
bindCodeCopy();
bindContentWidth();
bindBreadcrumbActions();
bindForceDownloads();
bindMiddleEllipsis();
bindFocusRead();
bindCenterFullscreen();
bindFileTreeSort();
bindTocSpy();
bindPdfEmbeds();
bindExcelViewers();
bindVideoPosters();
bindSmoothAnchors();
bindSoftNav();
bindSearch();
bindViewPersistence();
bindVisualViewportShell();
restoreViewState();
renderKatexBlocks();
markStandaloneMediaLines();
void Promise.all([
	renderMermaidBlocks(),
	renderPlantumlBlocks(),
	renderGraphvizBlocks(),
]).then(() => {
	// 图示渲染后高度变化，再恢复一次主栏滚动
	restoreViewState();
	markStandaloneMediaLines();
});
