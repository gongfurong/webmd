/**
 * MiniSearch 全屏搜索 UI（对齐 starlight-vanilla Search.astro）
 * 左：搜索筛选 · 中：结果 · 右：结果筛选
 */
import { getSearchService } from './service';
import type { SearchHit, SearchScopes } from './types';
import {
	DEFAULT_SCOPES,
	buildFolderTree,
	folderAncestors,
	folderMatchesSelection,
	sortFolderEntries,
	type FolderTreeNode,
} from './types';

type Side = 'left' | 'right';
const NONE = '__none__';

/** 搜索三栏：滚到底 + 回到顶（与主站 pane-scroll-edge 同形） */
const ICON_MS_TO_TOP = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--to-top" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14"/><path d="m5 14 7-7 7 7"/><path d="M12 7v12"/></svg>`;
const ICON_MS_TO_BOTTOM = `<svg class="wiki-breadcrumb__icon wiki-breadcrumb__icon--to-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v12"/><path d="m5 10 7 7 7-7"/><path d="M5 19h14"/></svg>`;

type MsScrollPane = 'left' | 'center' | 'right';

/** 短文案按钮；长说明放 title。滚动顶/底等直观操作用图标 */
const MS_TEXT_BTN = 'ms-text-btn';
const MS_ICON_BTN = 'wiki-breadcrumb__icon-btn ms-icon-btn';
const ICON_MS_SORT_ARROW = `<svg class="ms-sort-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10"/><path d="M4.5 6.5 8 3l3.5 3.5"/></svg>`;

function scrollEdgeHtml(pane: MsScrollPane): string {
	const topLabel =
		pane === 'left'
			? '筛选列表回到顶部'
			: pane === 'right'
				? '结果筛选回到顶部'
				: '搜索结果回到顶部';
	const bottomLabel =
		pane === 'left'
			? '筛选列表滚到底部'
			: pane === 'right'
				? '结果筛选滚到底部'
				: '搜索结果滚到底部';
	return `<span class="pane-scroll-edge ms-panel-scroll-edge">
		<button type="button" class="${MS_ICON_BTN} pane-scroll-edge-btn" data-ms-scroll-bottom="${pane}" title="${bottomLabel}" aria-label="${bottomLabel}">${ICON_MS_TO_BOTTOM}</button>
		<button type="button" class="${MS_ICON_BTN} pane-scroll-edge-btn" data-ms-scroll-top="${pane}" title="${topLabel}" aria-label="${topLabel}">${ICON_MS_TO_TOP}</button>
	</span>`;
}

const SHELL = `
<button type="button" class="ms-open" data-open-modal aria-label="搜索" aria-keyshortcuts="Control+K">
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
	<span class="ms-open-label">搜索</span>
	<kbd class="ms-open-kbd"><kbd data-mod-key>Ctrl</kbd><kbd>K</kbd></kbd>
</button>
<dialog class="ms-dialog" aria-label="搜索">
	<div class="dialog-frame">
		<!-- 窗体标题栏：关窗键在右上角（像系统窗口） -->
		<header class="ms-titlebar">
			<span class="ms-titlebar__title">搜索</span>
			<div class="ms-titlebar__tools" role="toolbar" aria-label="搜索选项">
				<div class="ms-seg" data-match-mode data-mode="fuzzy" role="group" aria-label="匹配模式" title="精确=整段一致不拆词；模糊=宽松。大小写由旁侧选项决定">
					<button type="button" class="ms-seg__opt" data-match-mode-opt="strict" title="精确：内容须整段一致（不拆词），大小写见旁侧" aria-pressed="false">精确</button>
					<button type="button" class="ms-seg__opt is-active" data-match-mode-opt="fuzzy" title="模糊：宽松匹配" aria-pressed="true">模糊</button>
				</div>
				<div class="ms-seg ms-seg--case" data-case-mode data-mode="ignore" role="group" aria-label="大小写" title="是否区分英文字母大小写（与精确/模糊正交）">
					<button type="button" class="ms-seg__opt is-active" data-case-mode-opt="ignore" title="忽略大小写：Abc 与 abc 相同" aria-label="忽略大小写" aria-pressed="true"><span class="ms-case-glyph" aria-hidden="true"><span class="ms-case-glyph__A">A</span><span class="ms-case-glyph__a">a</span></span></button>
					<button type="button" class="ms-seg__opt" data-case-mode-opt="sensitive" title="区分大小写：Abc 与 abc 不同" aria-label="区分大小写" aria-pressed="false"><span class="ms-case-glyph ms-case-glyph--strict" aria-hidden="true"><span class="ms-case-glyph__A">A</span><span class="ms-case-glyph__neq">≠</span><span class="ms-case-glyph__a">a</span></span></button>
				</div>
				<div class="ms-seg" data-token-mode data-mode="string" role="group" aria-label="串或词" title="串=可作子串命中；词=须独立词界（主要对英文；中文仍按串）">
					<button type="button" class="ms-seg__opt is-active" data-token-mode-opt="string" title="串：可包含在更长单词/句子中（cat→category）" aria-pressed="true">串</button>
					<button type="button" class="ms-seg__opt" data-token-mode-opt="word" title="词：须为独立英文词（cat 不匹配 category）；中文无词界，仍按串" aria-pressed="false">词</button>
				</div>
				<div class="ms-seg" data-combine data-mode="OR" role="group" aria-label="多词组合" title="多词：与=全部命中，或=任一命中（精确模式下不可用）">
					<button type="button" class="ms-seg__opt" data-combine-mode="AND" title="与：全部命中" aria-pressed="false">与</button>
					<button type="button" class="ms-seg__opt is-active" data-combine-mode="OR" title="或：任一命中" aria-pressed="true">或</button>
				</div>
			</div>
			<div class="ms-titlebar__controls" role="group" aria-label="窗口控制">
				<button type="button" class="ms-caption-btn ms-caption-btn--close" data-close-modal title="关闭" aria-label="关闭">
					<span class="ms-caption-btn__x" aria-hidden="true"></span>
				</button>
			</div>
		</header>
		<div class="search-shell">
			<div class="search-input-row">
				<input type="search" class="ms-input" data-search-input placeholder="搜索文档…" autocomplete="off" enterkeyhint="search" />
			</div>
			<div class="search-body" data-search-body>
				<button type="button" class="ms-drawer-backdrop" data-ms-drawer-backdrop hidden aria-label="关闭筛选面板"></button>
				<aside class="ms-panel ms-panel--left" data-ms-panel="left" aria-label="搜索筛选器">
					<div class="ms-panel-main">
						<div class="ms-panel-label">
							<div class="ms-panel-label-start">
								<span class="ms-panel-label-title">搜索筛选</span>
							</div>
							<div class="ms-panel-label-end">
								<button type="button" class="${MS_TEXT_BTN}" data-reset-left title="重置本栏筛选：全部勾选" aria-label="重置">重置</button>
								${scrollEdgeHtml('left')}
								<button type="button" class="ms-pane-collapse" data-ms-collapse="left" title="收起搜索筛选" aria-label="收起搜索筛选"><span aria-hidden="true">«</span></button>
							</div>
						</div>
						<div class="ms-panel-body thin-scrollbar" data-left-body data-ms-scroll="left"></div>
					</div>
				</aside>
				<section class="ms-panel ms-panel--center" aria-label="搜索结果">
					<div class="ms-panel-label ms-panel-label--center">
						<div class="ms-panel-label-start">
							<button type="button" class="ms-pane-expand" data-ms-expand="left" title="展开搜索筛选" aria-label="展开搜索筛选" hidden><span aria-hidden="true">&gt;&gt;</span></button>
							<span class="ms-panel-label-title">搜索结果</span>
							<span class="ms-status-inline" data-status></span>
						</div>
						<div class="ms-panel-label-end">
							<div class="ms-center-tools">
								<button type="button" class="${MS_TEXT_BTN} ms-sort-btn" data-path-sort data-order="asc" title="按文件路径排序：升序；点击切换为降序" aria-label="名序：升序" aria-pressed="false">
									<span class="ms-sort-label">名序</span>${ICON_MS_SORT_ARROW}
								</button>
								<button type="button" class="${MS_TEXT_BTN}" data-files-only aria-pressed="false" title="只显示文件路径，不展开命中标题/段落" aria-label="仅文件：关">仅文件</button>
							</div>
							${scrollEdgeHtml('center')}
							<button type="button" class="ms-pane-expand" data-ms-expand="right" title="展开结果筛选" aria-label="展开结果筛选" hidden><span aria-hidden="true">&lt;&lt;</span></button>
						</div>
					</div>
					<div class="ms-panel-body thin-scrollbar" data-ms-scroll="center"><ul class="ms-results" data-results></ul></div>
				</section>
				<aside class="ms-panel ms-panel--right" data-ms-panel="right" aria-label="结果筛选器">
					<div class="ms-panel-main">
						<div class="ms-panel-label">
							<div class="ms-panel-label-start">
								<span class="ms-panel-label-title">结果筛选</span>
							</div>
							<div class="ms-panel-label-end">
								<button type="button" class="${MS_TEXT_BTN}" data-reset-right title="重置本栏筛选：全部勾选" aria-label="重置">重置</button>
								${scrollEdgeHtml('right')}
								<button type="button" class="ms-pane-collapse" data-ms-collapse="right" title="收起结果筛选" aria-label="收起结果筛选"><span aria-hidden="true">»</span></button>
							</div>
						</div>
						<div class="ms-panel-body thin-scrollbar" data-right-body data-ms-scroll="right"></div>
					</div>
				</aside>
			</div>
		</div>
	</div>
</dialog>
`;

function escapeAttr(s: string) {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function mountSearch(mount: HTMLElement) {
	mount.classList.add('webmd-ms-search');
	mount.innerHTML = SHELL;

	const root = mount;
	const openBtn = root.querySelector<HTMLButtonElement>('[data-open-modal]')!;
	const closeBtn = root.querySelector<HTMLButtonElement>('[data-close-modal]')!;
	const dialog = root.querySelector('dialog')!;
	const dialogFrame = root.querySelector('.dialog-frame')!;
	const input = root.querySelector<HTMLInputElement>('[data-search-input]')!;
	const leftBody = root.querySelector<HTMLElement>('[data-left-body]')!;
	const rightBody = root.querySelector<HTMLElement>('[data-right-body]')!;
	const resultsEl = root.querySelector<HTMLElement>('[data-results]')!;
	const statusEl = root.querySelector<HTMLElement>('[data-status]')!;
	const filesOnlyBtn = root.querySelector<HTMLButtonElement>('[data-files-only]')!;
	const matchModeSeg = root.querySelector<HTMLElement>('[data-match-mode]')!;
	const combineToggle = root.querySelector<HTMLElement>('[data-combine]')!;
	const caseModeSeg = root.querySelector<HTMLElement>('[data-case-mode]')!;
	const tokenModeSeg = root.querySelector<HTMLElement>('[data-token-mode]')!;
	const combineOpts = () =>
		[...combineToggle.querySelectorAll<HTMLButtonElement>('[data-combine-mode]')];
	const matchModeOpts = () =>
		[...matchModeSeg.querySelectorAll<HTMLButtonElement>('[data-match-mode-opt]')];
	const caseModeOpts = () =>
		[...caseModeSeg.querySelectorAll<HTMLButtonElement>('[data-case-mode-opt]')];
	const tokenModeOpts = () =>
		[...tokenModeSeg.querySelectorAll<HTMLButtonElement>('[data-token-mode-opt]')];
	const pathSortBtn = root.querySelector<HTMLButtonElement>('[data-path-sort]')!;
	const modKey = root.querySelector<HTMLElement>('[data-mod-key]');
	const searchBody = root.querySelector<HTMLElement>('[data-search-body]')!;
	const leftPanel = root.querySelector<HTMLElement>('[data-ms-panel="left"]')!;
	const rightPanel = root.querySelector<HTMLElement>('[data-ms-panel="right"]')!;

	/*
	 * 布局模式判定（只看视口宽高，不区分设备）：
	 * - 窄屏 narrow：宽度不足，或矮视口 → 全屏 + 侧栏抽屉 + 互斥
	 * - 宽屏 wide：居中卡片 + 三栏 + 按宽度自动收栏
	 *
	 * 与 CSS 中 @media (max-width: 49.99rem), (max-height: 32rem) and (max-width: 56rem) 对齐
	 * 宽度够但高度矮时靠 max-height，避免误用宽屏三栏把内容挤没。
	 */
	const MS_BREAK_RIGHT = 1020;
	const MS_BREAK_LEFT = 760;
	const MS_NARROW_MQ =
		'(max-width: 49.99rem), (max-height: 32rem) and (max-width: 56rem)';
	const paneUi = {
		left: {
			collapsed: false,
			userForcedCollapsed: false,
			userForcedExpanded: false,
		},
		right: {
			collapsed: false,
			userForcedCollapsed: false,
			userForcedExpanded: false,
		},
	};

	const isNarrowSearch = () =>
		typeof matchMedia === 'function' && matchMedia(MS_NARROW_MQ).matches;

	const drawerBackdrop = root.querySelector<HTMLElement>('[data-ms-drawer-backdrop]');

	const applyPaneCollapse = () => {
		const L = paneUi.left.collapsed;
		const R = paneUi.right.collapsed;
		const narrow = isNarrowSearch();
		const drawerOpen = narrow && (!L || !R);
		root.classList.toggle('is-narrow-search', narrow);
		dialog.classList.toggle('is-narrow-search', narrow);
		searchBody.classList.toggle('is-left-collapsed', L);
		searchBody.classList.toggle('is-right-collapsed', R);
		searchBody.classList.toggle('has-drawer-open', drawerOpen);
		leftPanel.classList.toggle('is-collapsed', L);
		rightPanel.classList.toggle('is-collapsed', R);
		// 收起后不占位；中间结果栏永不 hidden
		leftPanel.hidden = L;
		rightPanel.hidden = R;
		// 中间栏始终可见（侧栏 hidden 后靠固定 grid-column 占结果列）
		const centerPanel = root.querySelector<HTMLElement>('.ms-panel--center');
		if (centerPanel) {
			centerPanel.hidden = false;
			centerPanel.classList.remove('is-collapsed');
		}
		if (drawerBackdrop) drawerBackdrop.hidden = !drawerOpen;
		const expandLeft = root.querySelector<HTMLElement>('[data-ms-expand="left"]');
		const expandRight = root.querySelector<HTMLElement>('[data-ms-expand="right"]');
		if (expandLeft) expandLeft.hidden = !L;
		if (expandRight) expandRight.hidden = !R;
		leftPanel.setAttribute('aria-expanded', L ? 'false' : 'true');
		rightPanel.setAttribute('aria-expanded', R ? 'false' : 'true');
	};

	const recomputeAutoPanes = () => {
		const w = searchBody.clientWidth || dialog.clientWidth || window.innerWidth || 0;
		if (w <= 0) return;

		// —— 窄屏：默认双收，互斥钉开 ——
		if (isNarrowSearch()) {
			if (!paneUi.left.userForcedExpanded) paneUi.left.collapsed = true;
			if (!paneUi.right.userForcedExpanded) paneUi.right.collapsed = true;
			if (!paneUi.left.collapsed && !paneUi.right.collapsed) {
				paneUi.right.collapsed = true;
				paneUi.right.userForcedExpanded = false;
			}
			applyPaneCollapse();
			return;
		}

		// —— 宽屏：按宽度自动收右 → 收左 ——
		if (w < MS_BREAK_RIGHT) {
			if (!paneUi.right.userForcedExpanded) paneUi.right.collapsed = true;
		} else {
			paneUi.right.userForcedExpanded = false;
			if (!paneUi.right.userForcedCollapsed) paneUi.right.collapsed = false;
		}
		if (w < MS_BREAK_LEFT) {
			if (!paneUi.left.userForcedExpanded) paneUi.left.collapsed = true;
		} else {
			paneUi.left.userForcedExpanded = false;
			if (!paneUi.left.userForcedCollapsed) paneUi.left.collapsed = false;
		}
		applyPaneCollapse();
	};

	const setPaneCollapsed = (
		side: 'left' | 'right',
		collapsed: boolean,
		fromUser: boolean,
	) => {
		paneUi[side].collapsed = collapsed;
		if (fromUser) {
			if (collapsed) {
				paneUi[side].userForcedCollapsed = true;
				paneUi[side].userForcedExpanded = false;
			} else {
				paneUi[side].userForcedExpanded = true;
				paneUi[side].userForcedCollapsed = false;
				// 仅窄屏：互斥，展开一侧时收起另一侧
				if (isNarrowSearch()) {
					const other = side === 'left' ? 'right' : 'left';
					paneUi[other].collapsed = true;
					paneUi[other].userForcedExpanded = false;
					paneUi[other].userForcedCollapsed = false;
				}
			}
		}
		applyPaneCollapse();
	};

	root.addEventListener('click', (ev) => {
		const t = ev.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		if (!el) return;
		// 窄屏抽屉遮罩：点空白关闭当前展开的筛选
		if (el.closest('[data-ms-drawer-backdrop]') && root.contains(el)) {
			ev.preventDefault();
			if (!paneUi.left.collapsed) setPaneCollapsed('left', true, true);
			if (!paneUi.right.collapsed) setPaneCollapsed('right', true, true);
			return;
		}
		const collapseBtn = el.closest(
			'[data-ms-collapse]',
		) as HTMLElement | null;
		if (collapseBtn && root.contains(collapseBtn)) {
			ev.preventDefault();
			const side = collapseBtn.getAttribute('data-ms-collapse');
			if (side === 'left' || side === 'right') {
				setPaneCollapsed(side, true, true);
			}
			return;
		}
		const expandBtn = el.closest('[data-ms-expand]') as HTMLElement | null;
		if (expandBtn && root.contains(expandBtn)) {
			ev.preventDefault();
			const side = expandBtn.getAttribute('data-ms-expand');
			if (side === 'left' || side === 'right') {
				// 宽度仍不够时允许临时展开（用户钉开），直到再次收起或刷新
				setPaneCollapsed(side, false, true);
			}
		}
	});

	const paneRo =
		typeof ResizeObserver !== 'undefined'
			? new ResizeObserver(() => recomputeAutoPanes())
			: null;
	paneRo?.observe(searchBody);
	paneRo?.observe(dialog);
	// 视口宽高变化时重新判定窄屏 / 宽屏
	window.addEventListener('orientationchange', () => {
		window.setTimeout(() => recomputeAutoPanes(), 100);
	});
	window.addEventListener('resize', () => {
		recomputeAutoPanes();
	});
	const msScrollEl = (pane: string): HTMLElement | null =>
		root.querySelector<HTMLElement>(`[data-ms-scroll="${pane}"]`);

	const pinMsScroll = (el: HTMLElement | null, top: number) => {
		if (!el) return;
		el.scrollTop = top;
		try {
			el.scrollTo({ top, left: 0, behavior: 'auto' });
		} catch {
			el.scrollTop = top;
		}
	};

	const flashMsBtn = (btn: HTMLElement, msg: string) => {
		btn.classList.add('is-acted');
		const base = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
		btn.title = msg;
		window.setTimeout(() => {
			btn.classList.remove('is-acted');
			btn.title = base;
		}, 900);
	};

	// 三栏标题最右：滚到底 / 回到顶
	root.addEventListener('click', (ev) => {
		const t = ev.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		if (!el) return;
		const bottomBtn = el.closest(
			'[data-ms-scroll-bottom]',
		) as HTMLElement | null;
		if (bottomBtn && root.contains(bottomBtn)) {
			ev.preventDefault();
			const pane = bottomBtn.getAttribute('data-ms-scroll-bottom') || '';
			const body = msScrollEl(pane);
			const go = () => {
				if (!body) return;
				body.scrollTop = body.scrollHeight;
				pinMsScroll(body, Math.max(0, body.scrollHeight - body.clientHeight));
			};
			go();
			requestAnimationFrame(go);
			flashMsBtn(
				bottomBtn,
				!body || body.scrollHeight <= body.clientHeight + 2
					? '已在底部'
					: '已到底部',
			);
			return;
		}
		const topBtn = el.closest('[data-ms-scroll-top]') as HTMLElement | null;
		if (topBtn && root.contains(topBtn)) {
			ev.preventDefault();
			const pane = topBtn.getAttribute('data-ms-scroll-top') || '';
			const body = msScrollEl(pane);
			pinMsScroll(body, 0);
			requestAnimationFrame(() => pinMsScroll(body, 0));
			flashMsBtn(
				topBtn,
				!body || body.scrollHeight <= body.clientHeight + 2
					? '已在顶部'
					: '已回到顶部',
			);
		}
	});

	if (modKey && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
		modKey.textContent = '⌘';
		openBtn.setAttribute('aria-keyshortcuts', 'Meta+K');
	}

	const service = getSearchService();

	let leftScopes: SearchScopes = { ...DEFAULT_SCOPES };
	let leftFormat = new Set<string>();
	let leftFolder = new Set<string>();
	let rightScopes: SearchScopes = { ...DEFAULT_SCOPES };
	let rightFormat = new Set<string>();
	let rightFolder = new Set<string>();
	let filesOnly = false;
	/** 匹配：模糊（宽松）↔ 精确（不拆词）；精确时与/或置灰。大小写单独选项 */
	let matchMode: 'fuzzy' | 'strict' = 'fuzzy';
	let combineMode: 'AND' | 'OR' = 'OR';
	/** ignore=忽略大小写（默认）；sensitive=区分大小写 */
	let caseMode: 'ignore' | 'sensitive' = 'ignore';
	/** string=串/子串（默认）；word=词边界（主要英文） */
	let tokenMode: 'string' | 'word' = 'string';
	let pathSort: 'asc' | 'desc' = 'asc';
	let lastBaseHits: SearchHit[] = [];
	let debounceTimer: number | null = null;

	const syncPathSortBtn = () => {
		const asc = pathSort === 'asc';
		pathSortBtn.dataset.order = pathSort;
		pathSortBtn.title = asc
			? '按文件路径排序：升序；点击切换为降序'
			: '按文件路径排序：降序；点击切换为升序';
		pathSortBtn.setAttribute('aria-label', asc ? '名序：升序' : '名序：降序');
		pathSortBtn.setAttribute('aria-pressed', asc ? 'false' : 'true');
		pathSortBtn.classList.toggle('is-active', !asc);
	};
	syncPathSortBtn();

	const syncCombineBtn = () => {
		const strict = matchMode === 'strict';
		combineToggle.dataset.mode = combineMode;
		combineToggle.title = strict
			? '精确模式下「与/或」不可用（整段匹配、不拆词）'
			: '多词组合：与=全部命中，或=任一命中';
		combineToggle.classList.toggle('is-disabled', strict);
		combineToggle.setAttribute('aria-disabled', strict ? 'true' : 'false');
		combineOpts().forEach((btn) => {
			const mode = btn.getAttribute('data-combine-mode') as 'AND' | 'OR';
			const on = mode === combineMode;
			btn.classList.toggle('is-active', on && !strict);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
			btn.disabled = strict;
		});
	};
	syncCombineBtn();

	const syncCaseModeBtn = () => {
		const ignore = caseMode === 'ignore';
		caseModeSeg.dataset.mode = caseMode;
		caseModeSeg.title = ignore
			? '大小写：Aa 忽略 · Abc 与 abc 相同'
			: '大小写：A≠a 区分 · Abc 与 abc 不同';
		caseModeOpts().forEach((btn) => {
			const mode = btn.getAttribute('data-case-mode-opt');
			const on = mode === caseMode;
			btn.classList.toggle('is-active', on);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
	};
	syncCaseModeBtn();

	const syncTokenModeBtn = () => {
		const asWord = tokenMode === 'word';
		tokenModeSeg.dataset.mode = tokenMode;
		tokenModeSeg.title = asWord
			? '词：英文须独立词界（cat≠category）；中文仍按串'
			: '串：可作任意子串命中（cat→category）';
		tokenModeOpts().forEach((btn) => {
			const mode = btn.getAttribute('data-token-mode-opt');
			const on = mode === tokenMode;
			btn.classList.toggle('is-active', on);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
	};
	syncTokenModeBtn();

	const syncMatchModeBtn = () => {
		const fuzzy = matchMode === 'fuzzy';
		matchModeSeg.dataset.mode = matchMode;
		matchModeSeg.title = fuzzy
			? '匹配：模糊 · 宽松（精确时与/或不可用；大小写见旁侧）'
			: '匹配：精确 · 整段一致不拆词（大小写见旁侧；与/或不可用）';
		matchModeOpts().forEach((btn) => {
			const mode = btn.getAttribute('data-match-mode-opt');
			const on = mode === matchMode;
			btn.classList.toggle('is-active', on);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
		// 精确时与/或置灰
		syncCombineBtn();
	};
	syncMatchModeBtn();

	const syncFilesOnlyBtn = () => {
		filesOnlyBtn.setAttribute('aria-pressed', filesOnly ? 'true' : 'false');
		filesOnlyBtn.classList.toggle('is-active', filesOnly);
		filesOnlyBtn.textContent = '仅文件';
		filesOnlyBtn.title = filesOnly
			? '只显示文件路径：开 · 点击关闭（显示命中段落）'
			: '只显示文件路径：关 · 点击开启（隐藏命中段落）';
		filesOnlyBtn.setAttribute(
			'aria-label',
			filesOnly ? '仅文件：开' : '仅文件：关',
		);
	};
	syncFilesOnlyBtn();

	const sortHitsByPath = (hits: SearchHit[]): SearchHit[] => {
		const dir = pathSort === 'asc' ? 1 : -1;
		return [...hits].sort((a, b) => {
			const pa = a.displayTitle || a.id || '';
			const pb = b.displayTitle || b.id || '';
			return (
				dir *
				pa.localeCompare(pb, 'zh-CN', { numeric: true, sensitivity: 'base' })
			);
		});
	};

	const prepareDisplayHits = (): SearchHit[] =>
		sortHitsByPath(applyRightFilter(lastBaseHits)).slice(0, 50);

	const closeModal = () => {
		if (dialog.open) dialog.close();
	};

	const onWindowClick = (event: MouseEvent) => {
		const t = event.target;
		if (!(t instanceof Element) && !(t instanceof Text)) return;
		const el = t instanceof Text ? t.parentElement : t;
		if (!el) return;
		const link = el.closest('a[href]');
		if (link) {
			closeModal();
			return;
		}
		if (document.body.contains(el) && !dialogFrame.contains(el)) closeModal();
	};

	const setSearchModalLock = (on: boolean) => {
		document.body.toggleAttribute('data-search-modal-open', on);
		document.documentElement.toggleAttribute('data-search-modal-open', on);
		if (!on) {
			document.body.style.removeProperty('touch-action');
			document.documentElement.style.removeProperty('touch-action');
			document.documentElement.style.removeProperty('overflow');
			// 关闭搜索后把 document 滚回 0，避免窄屏顶栏被带出视口
			try {
				window.scrollTo(0, 0);
			} catch {
				/* ignore */
			}
			document.documentElement.scrollTop = 0;
			document.body.scrollTop = 0;
		}
	};

	const openModal = (event?: MouseEvent) => {
		event?.stopPropagation();
		// 打开前关掉可能挡住的抽屉
		document.body.classList.remove('nav-drawer-open', 'toc-drawer-open');
		const backdrop = document.querySelector<HTMLElement>('[data-wiki-backdrop]');
		if (backdrop) backdrop.hidden = true;
		dialog.showModal();
		setSearchModalLock(true);
		input.focus();
		window.setTimeout(() => window.addEventListener('click', onWindowClick), 0);
		// 量宽：窄视口优先收右再收左
		requestAnimationFrame(() => recomputeAutoPanes());
		window.setTimeout(() => recomputeAutoPanes(), 50);
	};

	openBtn.addEventListener('click', openModal);
	closeBtn.addEventListener('click', closeModal);
	dialog.addEventListener('close', () => {
		setSearchModalLock(false);
		window.removeEventListener('click', onWindowClick);
	});
	// Esc / 异常关闭也清锁
	dialog.addEventListener('cancel', () => {
		setSearchModalLock(false);
	});
	resultsEl.addEventListener('click', (event) => {
		const t = event.target;
		const el = t instanceof Text ? t.parentElement : t instanceof Element ? t : null;
		if (el?.closest('a[href]')) closeModal();
	});
	window.addEventListener('keydown', (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			dialog.open ? closeModal() : openModal();
		}
	});

	const scopeLabels: { key: keyof SearchScopes; label: string }[] = [
		{ key: 'file', label: '文件' },
		{ key: 'title', label: '标题' },
		{ key: 'abstract', label: '摘要' },
		{ key: 'body', label: '正文' },
	];

	// 与左侧导航完全相同的文件夹图标（复用 tree-icon 类与 SVG）
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

	const renderFolderTreeHtml = (
		nodes: FolderTreeNode[],
		selected: Set<string>,
		allOn: boolean,
		depth = 0,
	): string => {
		return nodes
			.map((node) => {
				const on = allOn || selected.has(node.path);
				const hasKids = node.children.length > 0;
				// 左：勾选+图标+名+(总数/本层) 紧跟；右：折叠箭头
				const row = `<div class="ms-folder-row" style="--ms-folder-depth:${depth}">
					<label class="ms-filter-value ms-folder-item" title="${escapeAttr(node.path)}">
						<input type="checkbox" data-facet="folder" data-value="${escapeAttr(node.path)}" ${on ? 'checked' : ''} />
						${iconFolder}
						<span class="ms-filter-label">${escapeAttr(node.label)}</span><span class="ms-filter-count" title="${hasKids ? '本层文件数 / 含子目录共' : '本层文件数'}">${hasKids ? `(${node.count}/${node.total})` : `(${node.count})`}</span>
					</label>
					${
						hasKids
							? `<button type="button" class="ms-folder-twist" aria-expanded="false" title="展开/折叠" data-folder-twist aria-label="展开/折叠"><span class="ms-folder-chevron" aria-hidden="true"></span></button>`
							: `<span class="ms-folder-twist-spacer" aria-hidden="true"></span>`
					}
				</div>`;
				const kids = hasKids
					? `<div class="ms-folder-children" hidden>${renderFolderTreeHtml(node.children, selected, allOn, depth + 1)}</div>`
					: '';
				return `<div class="ms-folder-node" data-folder-path="${escapeAttr(node.path)}">${row}${kids}</div>`;
			})
			.join('');
	};

	const facetBlockHtml = (
		_side: Side,
		name: string,
		group: string,
		entries: [string, number][],
		selected: Set<string>,
	) => {
		if (!entries.length) return '';
		const allOn = selected.size === 0;
		const body =
			group === 'folder'
				? `<div class="ms-folder-tree">${renderFolderTreeHtml(buildFolderTree(entries), selected, allOn)}</div>`
				: entries
						.map(([val, count]) => {
							const on = allOn || selected.has(val);
							return `<label class="ms-filter-value">
							<input type="checkbox" data-facet="${escapeAttr(group)}" data-value="${escapeAttr(val)}" ${on ? 'checked' : ''} />
							<span class="ms-filter-label">${escapeAttr(val)}<span class="ms-filter-count">(${count})</span></span>
						</label>`;
						})
						.join('');
		return `
		<div class="ms-filter-block is-open" data-group="${escapeAttr(group)}">
			<div class="ms-filter-head">
				<input type="checkbox" class="ms-group-switch" ${allOn ? 'checked' : ''} title="全选 / 全取消" />
				<button type="button" class="ms-filter-collapse" aria-expanded="true">
					<span class="ms-filter-title">${escapeAttr(name)}</span>
					<span class="ms-chevron" aria-hidden="true"></span>
				</button>
			</div>
			<div class="ms-filter-group">
				${body}
			</div>
		</div>`;
	};

	const scopeBlockHtml = (scopes: SearchScopes, available?: SearchScopes) => {
		const items = scopeLabels.filter(({ key }) => !available || available[key]);
		if (!items.length) return '';
		const allOn = items.every(({ key }) => scopes[key]);
		const someOn = items.some(({ key }) => scopes[key]);
		return `
		<div class="ms-filter-block is-open" data-group="scope">
			<div class="ms-filter-head">
				<input type="checkbox" class="ms-group-switch" ${allOn ? 'checked' : ''} ${!allOn && someOn ? 'data-indeterminate' : ''} title="全选 / 全取消" />
				<button type="button" class="ms-filter-collapse" aria-expanded="true">
					<span class="ms-filter-title">范围</span>
					<span class="ms-chevron" aria-hidden="true"></span>
				</button>
			</div>
			<div class="ms-filter-group">
				${items
					.map(
						({ key, label }) => `
					<label class="ms-filter-value">
						<input type="checkbox" data-scope="${key}" ${scopes[key] ? 'checked' : ''} />
						<span>${label}</span>
					</label>`,
					)
					.join('')}
			</div>
		</div>`;
	};

	const syncIndeterminate = (panel: HTMLElement) => {
		panel.querySelectorAll<HTMLInputElement>('[data-indeterminate]').forEach((el) => {
			el.indeterminate = true;
			el.removeAttribute('data-indeterminate');
		});
		panel.querySelectorAll<HTMLElement>('.ms-filter-block').forEach((block) => {
			const sw = block.querySelector<HTMLInputElement>('.ms-group-switch');
			const boxes = [
				...block.querySelectorAll<HTMLInputElement>('input[data-scope], input[data-facet]'),
			];
			if (!sw || !boxes.length) return;
			const n = boxes.filter((b) => b.checked).length;
			sw.checked = n === boxes.length;
			sw.indeterminate = n > 0 && n < boxes.length;
		});
	};

	const renderLeft = () => {
		const facets = service.getFacets();
		const formats = Object.entries(facets.format || {})
			.filter(([, c]) => c > 0)
			.sort((a, b) => a[0].localeCompare(b[0], 'zh')) as [string, number][];
		const folders = sortFolderEntries(
			Object.entries(facets.folder || {}).filter(([, c]) => c > 0) as [
				string,
				number,
			][],
		);
		leftBody.innerHTML =
			scopeBlockHtml(leftScopes) +
			facetBlockHtml('left', '格式', 'format', formats, leftFormat) +
			facetBlockHtml('left', '目录', 'folder', folders, leftFolder);
		syncIndeterminate(leftBody);
	};

	const buildRightOptions = (hits: SearchHit[]) => {
		const scopeAvail: SearchScopes = {
			file: leftScopes.file && hits.some((h) => h.match.file),
			title: leftScopes.title && hits.some((h) => h.match.title),
			abstract: leftScopes.abstract && hits.some((h) => h.match.abstract),
			body: leftScopes.body && hits.some((h) => h.match.body),
		};
		const formats: Record<string, number> = {};
		const folders: Record<string, number> = {};
		for (const h of hits) {
			formats[h.format] = (formats[h.format] || 0) + 1;
			folders[h.folder] = (folders[h.folder] || 0) + 1;
		}
		for (const key of Object.keys(folders)) {
			for (const a of folderAncestors(key)) {
				if (folders[a] == null) folders[a] = 0;
			}
		}
		return {
			scopeAvail,
			formats: Object.entries(formats).sort((a, b) =>
				a[0].localeCompare(b[0], 'zh'),
			) as [string, number][],
			folders: sortFolderEntries(Object.entries(folders) as [string, number][]),
		};
	};

	const readFacetSelection = (panel: HTMLElement, group: string): Set<string> => {
		const boxes = [
			...panel.querySelectorAll<HTMLInputElement>(`input[data-facet="${group}"]`),
		];
		if (!boxes.length) return new Set();
		const on = boxes.filter((b) => b.checked).map((b) => b.dataset.value!).filter(Boolean);
		if (on.length === 0) return new Set([NONE]);
		if (on.length === boxes.length) return new Set();
		return new Set(on);
	};

	const readScopesFrom = (panel: HTMLElement): SearchScopes => {
		const scope: SearchScopes = { file: false, title: false, abstract: false, body: false };
		panel.querySelectorAll<HTMLInputElement>('input[data-scope]').forEach((el) => {
			const k = el.dataset.scope as keyof SearchScopes;
			if (k) scope[k] = el.checked;
		});
		return scope;
	};

	const resetRightFromHits = (hits: SearchHit[]) => {
		const { scopeAvail, formats, folders } = buildRightOptions(hits);
		rightScopes = {
			file: !!scopeAvail.file,
			title: !!scopeAvail.title,
			abstract: !!scopeAvail.abstract,
			body: !!scopeAvail.body,
		};
		rightFormat = new Set();
		rightFolder = new Set();
		if (!input.value.trim() || !hits.length) {
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			return;
		}
		rightBody.innerHTML =
			scopeBlockHtml(rightScopes, scopeAvail) +
			facetBlockHtml('right', '格式', 'format', formats, rightFormat) +
			facetBlockHtml('right', '目录', 'folder', folders, rightFolder);
		syncIndeterminate(rightBody);
	};

	const projectHitForRight = (h: SearchHit): SearchHit => {
		if (
			rightScopes.file &&
			!rightScopes.title &&
			!rightScopes.abstract &&
			!rightScopes.body
		) {
			return { ...h, sections: [] };
		}
		const sections: SearchHit['sections'] = [];
		for (const sec of h.sections || []) {
			const prose = (sec.prose || []).filter((p) => {
				if (p.kind === 'abstract') return rightScopes.abstract;
				if (p.kind === 'body') return rightScopes.body;
				return false;
			});
			const titleShow = !!(rightScopes.title && sec.titleMatched && sec.headingHtml);
			const headingHtml = titleShow
				? sec.headingHtml
				: prose.length && sec.headingHtml
					? sec.headingHtml
					: undefined;
			if (!headingHtml && !prose.length) continue;
			sections.push({ ...sec, headingHtml, titleMatched: titleShow, prose });
		}
		return { ...h, sections };
	};

	const applyRightFilter = (hits: SearchHit[]): SearchHit[] => {
		const scopeOn =
			rightScopes.file ||
			rightScopes.title ||
			rightScopes.abstract ||
			rightScopes.body;
		return hits
			.filter((h) => {
				if (!scopeOn) return false;
				const scopeOk =
					(rightScopes.file && h.match.file) ||
					(rightScopes.title && h.match.title) ||
					(rightScopes.abstract && h.match.abstract) ||
					(rightScopes.body && h.match.body);
				if (!scopeOk) return false;
				if (rightFormat.has(NONE) || rightFolder.has(NONE)) return false;
				if (rightFormat.size && !rightFormat.has(h.format)) return false;
				if (
					rightFolder.size &&
					!folderMatchesSelection(h.folder, rightFolder)
				)
					return false;
				return true;
			})
			.map((h) => projectHitForRight(h))
			.filter((h) => {
				if (rightScopes.file && h.match.file) return true;
				return h.sections.some((s) => s.headingHtml || s.prose.length);
			});
	};

	const renderResults = (hits: SearchHit[], q: string) => {
		if (!q.trim()) {
			statusEl.textContent = '';
			resultsEl.innerHTML = '';
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			return;
		}
		if (!hits.length) {
			statusEl.textContent = '· 0 条';
			resultsEl.innerHTML = '';
			return;
		}
		statusEl.textContent = `· ${hits.length} 条`;

		const branch = (kind: 'mid' | 'end' | 'pipe' | 'blank') => {
			const ch =
				kind === 'mid' ? '├─' : kind === 'end' ? '└─' : kind === 'pipe' ? '│' : ' ';
			return `<span class="ms-tree-g" data-k="${kind}" aria-hidden="true">${ch}</span>`;
		};

		resultsEl.innerHTML = hits
			.map((h) => {
				const pathLine = h.pathHtml || h.displayTitle;
				const sections = filesOnly || !h.sections?.length ? [] : h.sections;
				const sectionsHtml =
					sections.length > 0
						? `<div class="ms-hit-tree">${sections
								.map((sec, si) => {
									const d =
										sec.depth && sec.depth >= 1 && sec.depth <= 6
											? sec.depth
											: 2;
									const secLast = si === sections.length - 1;
									const nProse = sec.prose?.length || 0;
									const hasHeading = !!sec.headingHtml;
									const rows: string[] = [];
									if (hasHeading) {
										const tKind = secLast ? 'end' : 'mid';
										const vert = secLast ? 'blank' : 'pipe';
										rows.push(
											`<div class="ms-tree-row">${branch(tKind)}<a class="ms-hit-heading ms-hit-heading--h${d} ms-hit-sublink" href="${escapeAttr(sec.headingHref || h.href)}">${sec.headingHtml}</a></div>`,
										);
										(sec.prose || []).forEach((p, pi) => {
											const last = pi === nProse - 1;
											rows.push(
												`<div class="ms-tree-row">${branch(vert)}${branch(last ? 'end' : 'mid')}<a class="ms-hit-prose ms-hit-sublink" href="${escapeAttr(p.href || h.href)}">${p.html}</a></div>`,
											);
										});
									} else {
										(sec.prose || []).forEach((p, pi) => {
											const last = secLast && pi === nProse - 1;
											rows.push(
												`<div class="ms-tree-row">${branch(last ? 'end' : 'mid')}<a class="ms-hit-prose ms-hit-sublink" href="${escapeAttr(p.href || h.href)}">${p.html}</a></div>`,
											);
										});
									}
									return `<div class="ms-tree-block">${rows.join('')}</div>`;
								})
								.join('')}</div>`
						: '';
				return `<li class="ms-hit"><div class="ms-hit-card"><a class="ms-hit-path-link" href="${escapeAttr(h.href)}"><div class="ms-hit-path">${pathLine}</div></a>${sectionsHtml}</div></li>`;
			})
			.join('');
	};

	const runLeftSearch = () => {
		if (!service.isReady) {
			statusEl.textContent = '· 加载中…';
			return;
		}
		const q = matchMode === 'strict' ? input.value : input.value.trim();
		if (!q) {
			lastBaseHits = [];
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			renderResults([], '');
			return;
		}
		if (leftBody.querySelector('input[data-scope]')) {
			leftScopes = readScopesFrom(leftBody);
		} else {
			leftScopes = { ...DEFAULT_SCOPES };
		}
		leftFormat = readFacetSelection(leftBody, 'format');
		leftFolder = readFacetSelection(leftBody, 'folder');
		if (leftFormat.has(NONE) || leftFolder.has(NONE)) {
			lastBaseHits = [];
			resetRightFromHits([]);
			renderResults([], q);
			statusEl.textContent = '· 无匹配';
			return;
		}
		lastBaseHits = service.search({
			q,
			scopes: leftScopes,
			facets: { format: [...leftFormat], folder: [...leftFolder] },
			limit: 200,
			fuzzy: matchMode === 'fuzzy',
			combine: combineMode,
			strict: matchMode === 'strict',
			caseSensitive: caseMode === 'sensitive',
			wholeWord: tokenMode === 'word',
		});
		resetRightFromHits(lastBaseHits);
		renderResults(prepareDisplayHits(), q);
	};

	const runRightFilterOnly = () => {
		const q = input.value.trim();
		if (!q || !lastBaseHits.length) {
			renderResults([], q);
			return;
		}
		const scopeDom = readScopesFrom(rightBody);
		if (rightBody.querySelector('input[data-scope="file"]')) rightScopes.file = scopeDom.file;
		if (rightBody.querySelector('input[data-scope="title"]'))
			rightScopes.title = scopeDom.title;
		if (rightBody.querySelector('input[data-scope="abstract"]'))
			rightScopes.abstract = scopeDom.abstract;
		if (rightBody.querySelector('input[data-scope="body"]')) rightScopes.body = scopeDom.body;
		rightFormat = readFacetSelection(rightBody, 'format');
		rightFolder = readFacetSelection(rightBody, 'folder');
		syncIndeterminate(rightBody);
		renderResults(prepareDisplayHits(), q);
	};

	const scheduleLeft = () => {
		if (debounceTimer != null) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = null;
			runLeftSearch();
		}, 100);
	};

	input.addEventListener('input', () => scheduleLeft());

	const bindPanel = (panel: HTMLElement, side: Side) => {
		panel.addEventListener('click', (e) => {
			const twist = (e.target as HTMLElement).closest(
				'[data-folder-twist]',
			) as HTMLButtonElement | null;
			if (twist) {
				e.preventDefault();
				e.stopPropagation();
				const node = twist.closest('.ms-folder-node');
				const kids = node?.querySelector(
					':scope > .ms-folder-children',
				) as HTMLElement | null;
				if (!node || !kids) return;
				const open = kids.hasAttribute('hidden');
				if (open) kids.removeAttribute('hidden');
				else kids.setAttribute('hidden', '');
				twist.setAttribute('aria-expanded', open ? 'true' : 'false');
				twist.classList.toggle('is-open', open);
				// 节点与文件夹图标同步开合态
				node.classList.toggle('is-open', open);
				return;
			}
			const collapse = (e.target as HTMLElement).closest(
				'.ms-filter-collapse',
			) as HTMLButtonElement | null;
			if (!collapse) return;
			const block = collapse.closest('.ms-filter-block');
			const group = block?.querySelector('.ms-filter-group') as HTMLElement | null;
			if (!block || !group) return;
			const open = !block.classList.contains('is-open');
			block.classList.toggle('is-open', open);
			group.hidden = !open;
			collapse.setAttribute('aria-expanded', open ? 'true' : 'false');
		});
		panel.addEventListener('change', (e) => {
			const t = e.target as HTMLInputElement;
			if (!(t instanceof HTMLInputElement)) return;
			if (t.matches('.ms-group-switch')) {
				const block = t.closest('.ms-filter-block');
				const on = t.checked;
				block
					?.querySelectorAll<HTMLInputElement>('input[data-scope], input[data-facet]')
					.forEach((box) => {
						box.checked = on;
					});
				t.indeterminate = false;
			} else if (!t.matches('input[data-scope], input[data-facet]')) {
				return;
			}
			if (side === 'left') scheduleLeft();
			else runRightFilterOnly();
		});
	};

	bindPanel(leftBody, 'left');
	bindPanel(rightBody, 'right');

	const checkAllIn = (panel: HTMLElement) => {
		panel
			.querySelectorAll<HTMLInputElement>(
				'input[data-scope], input[data-facet], .ms-group-switch',
			)
			.forEach((box) => {
				box.checked = true;
				box.indeterminate = false;
			});
	};

	root.querySelector('[data-reset-left]')?.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		leftScopes = { ...DEFAULT_SCOPES };
		leftFormat = new Set();
		leftFolder = new Set();
		renderLeft();
		checkAllIn(leftBody);
		scheduleLeft();
	});
	root.querySelector('[data-reset-right]')?.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!lastBaseHits.length) return;
		resetRightFromHits(lastBaseHits);
		runRightFilterOnly();
	});
	filesOnlyBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		filesOnly = !filesOnly;
		syncFilesOnlyBtn();
		if (!input.value.trim()) return;
		renderResults(prepareDisplayHits(), input.value.trim());
	});
	matchModeSeg.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const t = e.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		const opt = el?.closest?.('[data-match-mode-opt]') as HTMLButtonElement | null;
		if (!opt || !matchModeSeg.contains(opt)) return;
		const next = opt.getAttribute('data-match-mode-opt');
		if (next !== 'fuzzy' && next !== 'strict') return;
		if (matchMode === next) return;
		matchMode = next;
		syncMatchModeBtn();
		scheduleLeft();
	});
	combineToggle.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (matchMode === 'strict' || combineToggle.classList.contains('is-disabled')) return;
		const t = e.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		const opt = el?.closest?.('[data-combine-mode]') as HTMLButtonElement | null;
		if (!opt || !combineToggle.contains(opt)) return;
		const next = opt.getAttribute('data-combine-mode');
		if (next !== 'AND' && next !== 'OR') return;
		if (combineMode === next) return;
		combineMode = next;
		syncCombineBtn();
		scheduleLeft();
	});
	caseModeSeg.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const t = e.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		const opt = el?.closest?.('[data-case-mode-opt]') as HTMLButtonElement | null;
		if (!opt || !caseModeSeg.contains(opt)) return;
		const next = opt.getAttribute('data-case-mode-opt');
		if (next !== 'ignore' && next !== 'sensitive') return;
		if (caseMode === next) return;
		caseMode = next;
		syncCaseModeBtn();
		scheduleLeft();
	});
	tokenModeSeg.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const t = e.target;
		const el =
			t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
		const opt = el?.closest?.('[data-token-mode-opt]') as HTMLButtonElement | null;
		if (!opt || !tokenModeSeg.contains(opt)) return;
		const next = opt.getAttribute('data-token-mode-opt');
		if (next !== 'string' && next !== 'word') return;
		if (tokenMode === next) return;
		tokenMode = next;
		syncTokenModeBtn();
		scheduleLeft();
	});
	pathSortBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		pathSort = pathSort === 'asc' ? 'desc' : 'asc';
		syncPathSortBtn();
		if (!input.value.trim() || !lastBaseHits.length) return;
		renderResults(prepareDisplayHits(), input.value.trim());
	});

	statusEl.textContent = '· 加载中…';
	service
		.load('/search-index.json')
		.then(() => {
			renderLeft();
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			statusEl.textContent = '';
			if (input.value.trim()) scheduleLeft();
		})
		.catch((err) => {
			console.error('[search]', err);
			statusEl.textContent = '· 索引不可用';
		});
}
