/**
 * MiniSearch 全屏搜索 UI（对齐 starlight-vanilla Search.astro）
 * 左：搜索筛选 · 中：结果 · 右：结果筛选
 */
import { getSearchService } from './service';
import type { SearchHit, SearchScopes } from './types';
import {
	ensureVectorEmbedder,
	getLastVectorDiag,
	isVectorEmbedderReady,
} from './vector';
import {
	DEFAULT_SCOPES,
	buildSearchFileTree,
	filePathMatchesSelection,
	type SearchTreeNode,
} from './types';

type Side = 'left' | 'right';
const NONE = '__none__';
/** 搜索左/右栏文件树：单开 / 多开各自独立（默认单开） */
const MS_TREE_ACCORDION_KEY: Record<'left' | 'right', string> = {
	left: 'webmd-ms-tree-accordion-left',
	right: 'webmd-ms-tree-accordion-right',
};

function getMsTreeAccordion(side: 'left' | 'right'): boolean {
	try {
		// 兼容旧键：仅 left 迁移一次
		if (side === 'left') {
			const legacy = localStorage.getItem('webmd-ms-tree-accordion');
			if (legacy === '0' || legacy === '1') {
				if (localStorage.getItem(MS_TREE_ACCORDION_KEY.left) == null) {
					localStorage.setItem(MS_TREE_ACCORDION_KEY.left, legacy);
				}
				localStorage.removeItem('webmd-ms-tree-accordion');
			}
		}
		const v = localStorage.getItem(MS_TREE_ACCORDION_KEY[side]);
		if (v === '0') return false;
		if (v === '1') return true;
	} catch {
		/* ignore */
	}
	return true;
}

function setMsTreeAccordion(side: 'left' | 'right', on: boolean) {
	try {
		localStorage.setItem(MS_TREE_ACCORDION_KEY[side], on ? '1' : '0');
	} catch {
		/* ignore */
	}
}

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
				<label class="ms-vector-enable" title="默认关闭。首次勾选将加载模型（约 118MB，同源 /models 或镜像）；加载成功后才启用向量检索。">
					<input type="checkbox" data-vector-enable />
					<span class="ms-vector-enable__text">向量搜索</span>
				</label>
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
								<button type="button" class="${MS_TEXT_BTN}" data-reset-left title="重置本栏筛选：恢复默认（文件夹默认不勾）" aria-label="重置">重置</button>
								<button type="button" class="${MS_TEXT_BTN} ms-tree-accordion-btn is-on" data-ms-tree-accordion="left" data-on="1" aria-pressed="true" title="单开：同层只展开一个文件夹（点击切换为多开）" aria-label="文件夹展开：单开"><span class="ms-tree-accordion-btn__label">单开</span></button>
								${scrollEdgeHtml('left')}
								<button type="button" class="ms-pane-collapse" data-ms-collapse="left" title="收起搜索筛选" aria-label="收起搜索筛选"><span aria-hidden="true">«</span></button>
							</div>
						</div>
						<div class="ms-panel-body thin-scrollbar" data-left-body data-ms-scroll="left"></div>
					</div>
				</aside>
				<div class="ms-gutter ms-gutter--left" data-ms-gutter="left" role="separator" aria-orientation="vertical" aria-label="拖拽调整搜索筛选宽度" title="拖拽调整宽度"></div>
				<section class="ms-panel ms-panel--center" aria-label="搜索结果">
					<div class="ms-panel-label ms-panel-label--center">
						<div class="ms-panel-label-start">
							<button type="button" class="ms-pane-expand" data-ms-expand="left" title="展开搜索筛选" aria-label="展开搜索筛选" hidden><span aria-hidden="true">&gt;&gt;</span></button>
							<span class="ms-panel-label-title">搜索结果</span>
							<span class="ms-status-inline" data-status></span>
						</div>
						<div class="ms-panel-label-end">
							<div class="ms-center-tools">
								<label class="ms-method-sort-check" title="勾选：先双方式，再关键字，再纯向量；组内名序。取消：全部仅按名序">
									<input type="checkbox" data-method-sort checked />
									<span class="ms-method-sort-check__text">搜索方式排序</span>
								</label>
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
				<div class="ms-gutter ms-gutter--right" data-ms-gutter="right" role="separator" aria-orientation="vertical" aria-label="拖拽调整结果筛选宽度" title="拖拽调整宽度"></div>
				<aside class="ms-panel ms-panel--right" data-ms-panel="right" aria-label="结果筛选器">
					<div class="ms-panel-main">
						<div class="ms-panel-label">
							<div class="ms-panel-label-start">
								<span class="ms-panel-label-title">结果筛选</span>
							</div>
							<div class="ms-panel-label-end">
								<button type="button" class="${MS_TEXT_BTN}" data-reset-right title="重置本栏筛选：恢复默认（范围与默认一致）" aria-label="重置">重置</button>
								<button type="button" class="${MS_TEXT_BTN} ms-tree-accordion-btn is-on" data-ms-tree-accordion="right" data-on="1" aria-pressed="true" title="单开：同层只展开一个文件夹（点击切换为多开）" aria-label="文件夹展开：单开"><span class="ms-tree-accordion-btn__label">单开</span></button>
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
	const methodSortEl = () =>
		root.querySelector<HTMLInputElement>('input[data-method-sort]');
	const pathSortBtn = root.querySelector<HTMLButtonElement>('[data-path-sort]')!;
	const modKey = root.querySelector<HTMLElement>('[data-mod-key]');
	const searchBody = root.querySelector<HTMLElement>('[data-search-body]')!;
	const leftPanel = root.querySelector<HTMLElement>('[data-ms-panel="left"]')!;
	const rightPanel = root.querySelector<HTMLElement>('[data-ms-panel="right"]')!;
	const leftGutter = root.querySelector<HTMLElement>('[data-ms-gutter="left"]');
	const rightGutter = root.querySelector<HTMLElement>('[data-ms-gutter="right"]');

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
	/** 侧栏宽：px，localStorage 记忆 */
	const MS_SIDE_W_KEY = {
		left: 'webmd-ms-left-w',
		right: 'webmd-ms-right-w',
	} as const;
	/** 可拖到的最窄 */
	const MS_SIDE_MIN = 240;
	const MS_SIDE_MAX = 480;
	const MS_SIDE_DEFAULT = 240;

	const clampMsSide = (n: number) =>
		Math.min(MS_SIDE_MAX, Math.max(MS_SIDE_MIN, Math.round(n)));

	const loadMsSideWidth = (side: 'left' | 'right'): number => {
		try {
			const v = Number(localStorage.getItem(MS_SIDE_W_KEY[side]));
			if (Number.isFinite(v) && v > 0) return clampMsSide(v);
		} catch {
			/* ignore */
		}
		return MS_SIDE_DEFAULT;
	};

	const saveMsSideWidth = (side: 'left' | 'right', px: number) => {
		try {
			localStorage.setItem(MS_SIDE_W_KEY[side], String(clampMsSide(px)));
		} catch {
			/* ignore */
		}
	};

	const applyMsSideWidths = (leftPx?: number, rightPx?: number) => {
		const L = leftPx ?? loadMsSideWidth('left');
		const R = rightPx ?? loadMsSideWidth('right');
		searchBody.style.setProperty('--ms-left-w', `${clampMsSide(L)}px`);
		searchBody.style.setProperty('--ms-right-w', `${clampMsSide(R)}px`);
	};
	applyMsSideWidths();

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
		// gutter 随侧栏：收起/窄屏抽屉不显示拖拽条
		if (leftGutter) leftGutter.hidden = L || narrow;
		if (rightGutter) rightGutter.hidden = R || narrow;
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

	/** 宽屏：拖拽 gutter 调整左右筛选栏宽度 */
	const bindMsGutters = () => {
		const bindOne = (gutter: HTMLElement | null, side: 'left' | 'right') => {
			if (!gutter || gutter.dataset.msGutterBound === '1') return;
			gutter.dataset.msGutterBound = '1';
			gutter.addEventListener('pointerdown', (ev) => {
				if (isNarrowSearch()) return;
				if (side === 'left' && paneUi.left.collapsed) return;
				if (side === 'right' && paneUi.right.collapsed) return;
				ev.preventDefault();
				document.body.classList.add('is-col-resizing');
				gutter.classList.add('is-dragging');
				const startX = ev.clientX;
				const startW = loadMsSideWidth(side);
				const onMove = (e: PointerEvent) => {
					const dx = e.clientX - startX;
					// 左栏：向右拖加宽；右栏：向左拖加宽
					const next =
						side === 'left' ? startW + dx : startW - dx;
					applyMsSideWidths(
						side === 'left' ? next : undefined,
						side === 'right' ? next : undefined,
					);
				};
				const onUp = (e: PointerEvent) => {
					document.body.classList.remove('is-col-resizing');
					gutter.classList.remove('is-dragging');
					window.removeEventListener('pointermove', onMove);
					window.removeEventListener('pointerup', onUp);
					const dx = e.clientX - startX;
					const next =
						side === 'left' ? startW + dx : startW - dx;
					const clamped = clampMsSide(next);
					saveMsSideWidth(side, clamped);
					applyMsSideWidths(
						side === 'left' ? clamped : undefined,
						side === 'right' ? clamped : undefined,
					);
				};
				window.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', onUp);
			});
		};
		bindOne(leftGutter, 'left');
		bindOne(rightGutter, 'right');
	};
	bindMsGutters();

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

	/** 默认勾选：先关键字（含双命中），再纯向量；组内名序 */
	const isMethodSortOn = () => methodSortEl()?.checked !== false;

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

	/** 名序 / 路径展示键：用完整 id（content 相对路径），勿用 displayTitle（可能是 h1 标题） */
	const pathKey = (h: SearchHit) => h.id || h.displayTitle || '';

	const cmpPath = (a: SearchHit, b: SearchHit) => {
		const dir = pathSort === 'asc' ? 1 : -1;
		return (
			dir *
			pathKey(a).localeCompare(pathKey(b), 'zh-CN', {
				numeric: true,
				sensitivity: 'base',
			})
		);
	};

	/** 搜索方式排序：双方式 → 关键字 → 纯向量（数字越小越靠前） */
	const methodRank = (h: SearchHit) => {
		const src = h.sources || { keyword: true, vector: false };
		if (src.keyword && src.vector) return 0;
		if (src.keyword) return 1;
		if (src.vector) return 2;
		return 3;
	};

	const sortHitsForDisplay = (hits: SearchHit[]): SearchHit[] => {
		const byMethod = isMethodSortOn();
		return [...hits].sort((a, b) => {
			if (byMethod) {
				const ma = methodRank(a);
				const mb = methodRank(b);
				if (ma !== mb) return ma - mb;
			}
			return cmpPath(a, b);
		});
	};

	/** 右栏筛选 + 方式序/名序后的全部结果（未截断） */
	const getFilteredHits = (): SearchHit[] =>
		sortHitsForDisplay(applyRightFilter(lastBaseHits));

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
		{ key: 'folder', label: '文件夹' },
		{ key: 'file', label: '文件' },
		{ key: 'title', label: '标题' },
		{ key: 'abstract', label: '摘要' },
		{ key: 'body', label: '正文' },
	];

	// 与左侧导航相同的文件夹图标
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
	const iconFile = `<span class="tree-icon tree-icon--file tree-icon--markdown" aria-hidden="true"><svg class="tree-icon__svg" width="18" height="18" viewBox="0 0 16 16" fill="none"><path class="tree-icon__page" d="M4 1.5C4 1.22 4.22 1 4.5 1h5.59c.27 0 .52.1.71.29l3.41 3.41c.19.19.29.44.29.71V13.5c0 .83-.67 1.5-1.5 1.5h-8A1.5 1.5 0 0 1 4 13.5V1.5Z"/><path class="tree-icon__fold" d="M10.25 1.1v2.9c0 .41.34.75.75.75h2.9"/><path class="tree-icon__stripe" d="M5.35 5.45h5.9" stroke-linecap="round"/><text class="tree-icon__badge" x="8.5" y="11.9" text-anchor="middle" font-size="4.6" font-weight="700" font-family="Segoe UI,system-ui,sans-serif">MD</text></svg></span>`;

	/** 文件是否在选中集合（allOn 或 path 命中） */
	const fileSelected = (
		path: string,
		selected: Set<string>,
		allOn: boolean,
	): boolean => allOn || selected.has(path);

	/** 目录：子树内所有文件是否均选中 / 部分 / 无 */
	const dirCheckState = (
		node: SearchTreeNode,
		selected: Set<string>,
		allOn: boolean,
	): 'all' | 'some' | 'none' => {
		if (node.kind === 'file') {
			return fileSelected(node.path, selected, allOn) ? 'all' : 'none';
		}
		const files: string[] = [];
		const walk = (n: SearchTreeNode) => {
			if (n.kind === 'file') files.push(n.path);
			else n.children.forEach(walk);
		};
		walk(node);
		if (!files.length) return 'none';
		let on = 0;
		for (const p of files) if (fileSelected(p, selected, allOn)) on++;
		if (on === 0) return 'none';
		if (on === files.length) return 'all';
		return 'some';
	};

	const renderSearchTreeHtml = (
		nodes: SearchTreeNode[],
		selected: Set<string>,
		allOn: boolean,
		depth = 0,
	): string => {
		return nodes
			.map((node) => {
				if (node.kind === 'file') {
					const on = fileSelected(node.path, selected, allOn);
					return `<div class="ms-folder-node ms-file-node" data-kind="file" data-folder-path="${escapeAttr(node.path)}">
						<div class="ms-folder-row" style="--ms-folder-depth:${depth}">
							<span class="ms-folder-twist-spacer" aria-hidden="true"></span>
							<label class="ms-filter-value ms-folder-item" title="${escapeAttr(node.path)}">
								<input type="checkbox" data-facet="file" data-value="${escapeAttr(node.path)}" ${on ? 'checked' : ''} />
								${iconFile}
								<span class="ms-filter-label">${escapeAttr(node.label)}</span>
							</label>
						</div>
					</div>`;
				}
				// 空目录不渲染（建树时已剪）
				if (node.total <= 0) return '';
				const st = dirCheckState(node, selected, allOn);
				const on = st === 'all';
				const indet = st === 'some';
				const hasKids = node.children.length > 0;
				const countTitle =
					node.count !== node.total
						? '本层文件数 / 含子目录共'
						: '文件数';
				const countText =
					node.count !== node.total
						? `(${node.count}/${node.total})`
						: `(${node.total})`;
				// 折叠钮在最左，再是勾选 + 图标 + 名
				const row = `<div class="ms-folder-row" style="--ms-folder-depth:${depth}">
					${
						hasKids
							? `<button type="button" class="ms-folder-twist" aria-expanded="false" title="展开/折叠" data-folder-twist aria-label="展开/折叠"><span class="ms-folder-chevron" aria-hidden="true"></span></button>`
							: `<span class="ms-folder-twist-spacer" aria-hidden="true"></span>`
					}
					<label class="ms-filter-value ms-folder-item" title="${escapeAttr(node.path)}">
						<input type="checkbox" data-facet="folder" data-value="${escapeAttr(node.path)}" ${on ? 'checked' : ''}${indet ? ' data-indeterminate' : ''} />
						${iconFolder}
						<span class="ms-filter-label">${escapeAttr(node.label)}</span><span class="ms-filter-count" title="${countTitle}">${countText}</span>
					</label>
				</div>`;
				const kids = hasKids
					? `<div class="ms-folder-children" hidden>${renderSearchTreeHtml(node.children, selected, allOn, depth + 1)}</div>`
					: '';
				return `<div class="ms-folder-node" data-kind="dir" data-folder-path="${escapeAttr(node.path)}">${row}${kids}</div>`;
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
		if (!entries.length && group !== 'files') return '';
		const allOn = selected.size === 0;
		const body = entries
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

	/** 「文件」块：文件夹+文件树；勾选递归；筛选按文件 path */
	const filesBlockHtml = (
		tree: SearchTreeNode[],
		selected: Set<string>,
	) => {
		if (!tree.length) return '';
		const allOn = selected.size === 0;
		// 预计算标题旁「已勾/总数」（渲染后 DOM 再 sync 一次）
		let totalFiles = 0;
		const walkCount = (nodes: SearchTreeNode[]) => {
			for (const n of nodes) {
				if (n.kind === 'file') totalFiles += 1;
				else walkCount(n.children);
			}
		};
		walkCount(tree);
		const checkedGuess = allOn
			? totalFiles
			: Math.min(selected.size, totalFiles);
		return `
		<div class="ms-filter-block is-open" data-group="files">
			<div class="ms-filter-head">
				<input type="checkbox" class="ms-group-switch" ${allOn ? 'checked' : ''} title="全选 / 全取消全部文件与文件夹" />
				<button type="button" class="ms-filter-collapse" aria-expanded="true">
					<span class="ms-filter-title">文件</span>
					<span class="ms-filter-count ms-files-summary" data-ms-files-summary title="已勾选文件数 / 全部文件数">(${checkedGuess}/${totalFiles})</span>
					<span class="ms-chevron" aria-hidden="true"></span>
				</button>
			</div>
			<div class="ms-filter-group">
				<div class="ms-folder-tree" data-ms-file-tree>${renderSearchTreeHtml(tree, selected, allOn)}</div>
			</div>
		</div>`;
	};

	/** 读某栏「文件」树勾选统计（与标题旁数字同一套） */
	const readFilesSummaryCounts = (
		panel: HTMLElement,
	): { checked: number; total: number } => {
		const block = panel.querySelector<HTMLElement>(
			'.ms-filter-block[data-group="files"]',
		);
		if (!block) return { checked: 0, total: 0 };
		const boxes = [
			...block.querySelectorAll<HTMLInputElement>('input[data-facet="file"]'),
		];
		const total = boxes.length;
		const checked = boxes.filter((b) => b.checked).length;
		return { checked, total };
	};

	/** 更新「文件」标题旁：已勾选文件数 / 全部文件数（仅文件树，不含范围/格式） */
	const updateFilesSummary = (panel: HTMLElement) => {
		const { checked, total } = readFilesSummaryCounts(panel);
		const summary = panel.querySelector<HTMLElement>('[data-ms-files-summary]');
		if (summary) {
			summary.textContent = `(${checked}/${total})`;
			summary.title = `已勾选文件数 / 全部文件数：${checked}/${total}`;
		}
	};

	/**
	 * 搜索结果标题后：(可展示条数 / 结果文件总数)
	 * - 分子 = 范围 + 格式 + 文件勾选 全部右筛后的真实列表条数（getFilteredHits）
	 * - 分母 = 右侧「文件」树文件总数（与文件栏分母一致；无树时用 lastBaseHits）
	 * 注意：分子可因范围/格式小于「文件」已勾选数，这是预期行为。
	 */
	const syncResultCountStatus = (displayHits?: SearchHit[]) => {
		const q = input.value.trim();
		if (!q) {
			statusEl.textContent = '';
			statusEl.removeAttribute('title');
			return;
		}
		const shown =
			displayHits != null ? displayHits.length : getFilteredHits().length;
		const filesBlock = rightBody.querySelector(
			'.ms-filter-block[data-group="files"]',
		);
		const total = filesBlock
			? readFilesSummaryCounts(rightBody).total
			: lastBaseHits.length;
		const diag = getLastVectorDiag();
		const vecHint =
			diag.ok && typeof diag.hitCount === 'number'
				? `；向量命中 ${diag.hitCount}（top ${diag.topScore?.toFixed(2) ?? '-'}）`
				: diag.reason
					? `；向量未生效：${diag.reason}`
					: '';
		statusEl.textContent = `(${shown}/${total})`;
		statusEl.title = `可展示 ${shown} 条（范围·格式·文件筛选后）/ 结果共 ${total} 个文件${vecHint}`;
	};

	/** 自底向上同步文件夹勾选 / indeterminate */
	const syncFileTreeChecks = (treeRoot: HTMLElement) => {
		const dirs = [
			...treeRoot.querySelectorAll<HTMLElement>(
				'.ms-folder-node[data-kind="dir"]',
			),
		];
		dirs.sort(
			(a, b) =>
				(b.dataset.folderPath || '').split('/').filter(Boolean).length -
				(a.dataset.folderPath || '').split('/').filter(Boolean).length,
		);
		for (const dir of dirs) {
			const fileBoxes = [
				...dir.querySelectorAll<HTMLInputElement>('input[data-facet="file"]'),
			];
			const folderBox = dir.querySelector<HTMLInputElement>(
				':scope > .ms-folder-row input[data-facet="folder"]',
			);
			if (!folderBox) continue;
			if (!fileBoxes.length) {
				folderBox.checked = false;
				folderBox.indeterminate = false;
				continue;
			}
			const n = fileBoxes.filter((b) => b.checked).length;
			folderBox.checked = n === fileBoxes.length;
			folderBox.indeterminate = n > 0 && n < fileBoxes.length;
		}
		const panel = treeRoot.closest('[data-left-body], [data-right-body]') as
			| HTMLElement
			| null;
		if (panel) updateFilesSummary(panel);
	};

	const scopeBlockHtml = (
		scopes: SearchScopes,
		available?: SearchScopes,
		counts?: Partial<Record<keyof SearchScopes, number>>,
	) => {
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
					.map(({ key, label }) => {
						const n = counts?.[key];
						const countHtml =
							typeof n === 'number'
								? `<span class="ms-filter-count">(${n})</span>`
								: '';
						return `
					<label class="ms-filter-value">
						<input type="checkbox" data-scope="${key}" ${scopes[key] ? 'checked' : ''} />
						<span class="ms-filter-label">${label}${countHtml}</span>
					</label>`;
					})
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
		const fileTree = buildSearchFileTree(service.getDocs());
		leftBody.innerHTML =
			scopeBlockHtml(leftScopes) +
			facetBlockHtml('left', '格式', 'format', formats, leftFormat) +
			filesBlockHtml(fileTree, leftFolder);
		const tree = leftBody.querySelector<HTMLElement>('[data-ms-file-tree]');
		if (tree) syncFileTreeChecks(tree);
		updateFilesSummary(leftBody);
		syncIndeterminate(leftBody);
	};

	const hitMethodKind = (
		h: SearchHit,
	): 'keyword' | 'dual' | 'vector' | null => {
		const src = h.sources || { keyword: true, vector: false };
		if (src.keyword && src.vector) return 'dual';
		if (src.keyword) return 'keyword';
		if (src.vector) return 'vector';
		return null;
	};

	const buildRightOptions = (hits: SearchHit[]) => {
		const scopeCounts: Record<keyof SearchScopes, number> = {
			folder: 0,
			file: 0,
			title: 0,
			abstract: 0,
			body: 0,
		};
		let pureKeyword = 0;
		let pureVector = 0;
		let dual = 0;
		const formats: Record<string, number> = {};
		for (const h of hits) {
			const kind = hitMethodKind(h);
			if (kind === 'keyword') pureKeyword++;
			else if (kind === 'vector') pureVector++;
			else if (kind === 'dual') dual++;
			if (h.match.folder) scopeCounts.folder++;
			if (h.match.file) scopeCounts.file++;
			if (h.match.title) scopeCounts.title++;
			if (h.match.abstract) scopeCounts.abstract++;
			if (h.match.body) scopeCounts.body++;
			formats[h.format] = (formats[h.format] || 0) + 1;
		}
		const scopeAvail: SearchScopes = {
			// 结果侧：有文件夹命中才显示「文件夹」（在文件之上）
			folder: scopeCounts.folder > 0,
			file: leftScopes.file && scopeCounts.file > 0,
			title: leftScopes.title && scopeCounts.title > 0,
			abstract: leftScopes.abstract && scopeCounts.abstract > 0,
			body: leftScopes.body && scopeCounts.body > 0,
		};
		const fileTree = buildSearchFileTree(
			hits.map((h) => ({
				path: h.id,
				file: h.id.split('/').pop() || h.displayTitle,
			})),
		);
		return {
			scopeAvail,
			scopeCounts,
			pureKeyword,
			pureVector,
			dual,
			formats: Object.entries(formats).sort((a, b) =>
				a[0].localeCompare(b[0], 'zh'),
			) as [string, number][],
			fileTree,
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

	/** 读文件树勾选 → 文件 path 集合（空=全选，NONE=全不选） */
	const readFilePathSelection = (panel: HTMLElement): Set<string> => {
		return readFacetSelection(panel, 'file');
	};

	const readScopesFrom = (panel: HTMLElement): SearchScopes => {
		const scope: SearchScopes = {
			folder: false,
			file: false,
			title: false,
			abstract: false,
			body: false,
		};
		panel.querySelectorAll<HTMLInputElement>('input[data-scope]').forEach((el) => {
			const k = el.dataset.scope as keyof SearchScopes;
			if (k) scope[k] = el.checked;
		});
		return scope;
	};

	/**
	 * 从当前 DOM 读某 facet 各 value 勾选；并归纳 all / none / partial。
	 * 无对应勾选框时返回 null（表示尚无状态，按「全选」处理）。
	 */
	const readFacetCheckMap = (
		panel: HTMLElement,
		group: string,
	): { mode: 'all' | 'none' | 'partial'; checked: Map<string, boolean> } | null => {
		const boxes = [
			...panel.querySelectorAll<HTMLInputElement>(
				`input[data-facet="${group}"]`,
			),
		];
		if (!boxes.length) return null;
		const checked = new Map<string, boolean>();
		let onN = 0;
		for (const b of boxes) {
			const v = b.dataset.value;
			if (!v) continue;
			checked.set(v, b.checked);
			if (b.checked) onN++;
		}
		if (!checked.size) return null;
		const mode: 'all' | 'none' | 'partial' =
			onN === 0 ? 'none' : onN === checked.size ? 'all' : 'partial';
		return { mode, checked };
	};

	/**
	 * 合并旧勾选与新可选值：
	 * - 旧项：保持原勾选
	 * - 新出现的项：默认勾选（便于看到新结果）；若整体原为「全不选」则新项也不勾
	 * 返回 facet 用的 Set：空=全选，NONE=全不选，否则为已勾 value 集合
	 */
	const mergeFacetSelection = (
		available: string[],
		prev: { mode: 'all' | 'none' | 'partial'; checked: Map<string, boolean> } | null,
		forceAll: boolean,
	): Set<string> => {
		if (forceAll || !prev) return new Set();
		if (prev.mode === 'none') return new Set([NONE]);
		if (prev.mode === 'all') return new Set();
		const on: string[] = [];
		for (const v of available) {
			if (prev.checked.has(v)) {
				if (prev.checked.get(v)) on.push(v);
			} else {
				// 本次结果新出现的选项 → 默认勾选
				on.push(v);
			}
		}
		if (!on.length) return new Set([NONE]);
		if (on.length === available.length) return new Set();
		return new Set(on);
	};

	const collectFilePathsFromTree = (nodes: SearchTreeNode[]): string[] => {
		const out: string[] = [];
		const walk = (list: SearchTreeNode[]) => {
			for (const n of list) {
				if (n.kind === 'file') out.push(n.path);
				else walk(n.children);
			}
		};
		walk(nodes);
		return out;
	};

	/**
	 * 按当前 hits 刷新右侧结果筛选。
	 * - preserve=true（默认，每次搜索）：不重置勾选，只去掉本次没有的项、加上新项
	 * - preserve=false（点「重置」）：全部恢复为全选
	 */
	const updateRightFromHits = (
		hits: SearchHit[],
		opts?: { preserve?: boolean },
	) => {
		const preserve = opts?.preserve !== false;
		const hasPanel = Boolean(
			rightBody.querySelector('input[data-facet], input[data-scope]'),
		);

		// 搜索前快照（仅 preserve 且面板已有内容时）
		let prevMethod: Set<string> | null = null;
		let prevScopes: SearchScopes | null = null;
		let prevFormat: ReturnType<typeof readFacetCheckMap> = null;
		let prevFile: ReturnType<typeof readFacetCheckMap> = null;
		if (preserve && hasPanel) {
			prevMethod = readFacetSelection(rightBody, 'method');
			if (rightBody.querySelector('input[data-scope]')) {
				prevScopes = readScopesFrom(rightBody);
			}
			prevFormat = readFacetCheckMap(rightBody, 'format');
			prevFile = readFacetCheckMap(rightBody, 'file');
		}

		if (!input.value.trim() || !hits.length) {
			// 无结果：清空可选项 UI，但保留内存中的勾选偏好，下次有结果时再用
			if (!preserve) {
				rightScopes = { ...DEFAULT_SCOPES };
				rightFormat = new Set();
				rightFolder = new Set();
				rightMethod = new Set();
			} else if (prevMethod) {
				rightMethod = prevMethod;
			}
			if (prevScopes) rightScopes = prevScopes;
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			return;
		}

		const {
			scopeAvail,
			scopeCounts,
			pureKeyword,
			pureVector,
			dual,
			formats,
			fileTree,
		} = buildRightOptions(hits);
		const formatKeys = formats.map(([k]) => k);
		const filePaths = collectFilePathsFromTree(fileTree);
		const showDualMethod = dual > 0;
		// 有纯向量结果时才展示「向量搜索」筛选项
		const showVectorMethod = pureVector > 0;
		const visibleMethodKeys = [
			'keyword',
			...(showVectorMethod ? (['vector'] as const) : []),
			...(showDualMethod ? (['dual'] as const) : []),
		];

		if (!preserve) {
			// 重置：范围 = 默认勾选 ∩ 当前结果可用项（文件夹默认关，不因「有命中」强行打开）
			rightScopes = {
				folder: !!scopeAvail.folder && DEFAULT_SCOPES.folder,
				file: !!scopeAvail.file && DEFAULT_SCOPES.file,
				title: !!scopeAvail.title && DEFAULT_SCOPES.title,
				abstract: !!scopeAvail.abstract && DEFAULT_SCOPES.abstract,
				body: !!scopeAvail.body && DEFAULT_SCOPES.body,
			};
			rightFormat = new Set();
			rightFolder = new Set();
			rightMethod = new Set();
		} else {
			// 搜索方式：优先 DOM 快照，缺省项保留内存偏好
			if (prevMethod) {
				rightMethod = mergeMethodSelectionFromDom(
					prevMethod,
					rightMethod,
					rightBody,
				);
			}
			// 范围：保留用户对各 scope 的勾选；展示时仅显示 available
			if (prevScopes) {
				rightScopes = { ...prevScopes };
			}
			rightScopes = {
				folder: rightScopes.folder,
				file: rightScopes.file,
				title: rightScopes.title,
				abstract: rightScopes.abstract,
				body: rightScopes.body,
			};
			rightFormat = mergeFacetSelection(formatKeys, prevFormat, false);
			rightFolder = mergeFacetSelection(filePaths, prevFile, false);
		}

		// 展示用 method：只渲染当前可见项，内存 rightMethod 可含隐藏偏好
		const methodForUi = projectMethodForVisible(
			rightMethod,
			visibleMethodKeys,
		);

		// 结果中新出现「文件夹」项时：按默认策略（DEFAULT_SCOPES.folder，当前为关）
		if (
			scopeAvail.folder &&
			!rightBody.querySelector('input[data-scope="folder"]')
		) {
			rightScopes.folder = DEFAULT_SCOPES.folder;
		}
		const scopesForUi: SearchScopes = {
			folder: scopeAvail.folder ? rightScopes.folder : false,
			file: scopeAvail.file ? rightScopes.file : false,
			title: scopeAvail.title ? rightScopes.title : false,
			abstract: scopeAvail.abstract ? rightScopes.abstract : false,
			body: scopeAvail.body ? rightScopes.body : false,
		};

		// 勾选状态就绪后再算分子（受范围·格式·文件影响）
		const methodVis = computeMethodVisibleCounts(hits);

		rightBody.innerHTML =
			methodBlockHtml(methodForUi, {
				dualVisible: methodVis.dualVisible,
				dualTotal: dual,
				keywordVisible: methodVis.pureKeywordVisible,
				keywordTotal: pureKeyword,
				vectorVisible: methodVis.pureVectorVisible,
				vectorTotal: pureVector,
				showDual: showDualMethod,
				showVector: showVectorMethod,
			}) +
			scopeBlockHtml(scopesForUi, scopeAvail, scopeCounts) +
			facetBlockHtml('right', '格式', 'format', formats, rightFormat) +
			filesBlockHtml(fileTree, rightFolder);
		const tree = rightBody.querySelector<HTMLElement>('[data-ms-file-tree]');
		if (tree) syncFileTreeChecks(tree);
		updateFilesSummary(rightBody);
		syncIndeterminate(rightBody);
	};

	/** 兼容：强制全选刷新（右侧「重置」） */
	const resetRightFromHits = (hits: SearchHit[]) =>
		updateRightFromHits(hits, { preserve: false });

	/** 结果筛选：搜索方式（keyword / dual / vector），空 Set = 全选 */
	let rightMethod = new Set<string>();

	const methodPrefOn = (sel: Set<string>, key: string): boolean => {
		if (sel.has(NONE)) return false;
		if (sel.size === 0) return true;
		return sel.has(key);
	};

	/** 将偏好投影到当前可见勾选框（不改内存） */
	const projectMethodForVisible = (
		sel: Set<string>,
		visible: string[],
	): Set<string> => {
		if (sel.has(NONE)) return new Set([NONE]);
		if (sel.size === 0) return new Set(); // 全选可见项
		const on = visible.filter((k) => sel.has(k));
		if (!on.length) return new Set([NONE]);
		if (on.length === visible.length) return new Set();
		return new Set(on);
	};

	/**
	 * 从 DOM 读搜索方式；对当前未渲染的项（如无纯向量时无 vector 框）保留 oldPref。
	 */
	const mergeMethodSelectionFromDom = (
		fromDom: Set<string>,
		oldPref: Set<string>,
		panel: HTMLElement,
	): Set<string> => {
		const boxes = [
			...panel.querySelectorAll<HTMLInputElement>(
				'input[data-facet="method"]',
			),
		];
		const present = new Set(
			boxes.map((b) => b.dataset.value!).filter(Boolean),
		);
		if (!present.size) return oldPref;
		// DOM 上三项都在 → 直接用 DOM
		if (
			present.has('keyword') &&
			present.has('dual') &&
			present.has('vector')
		) {
			return fromDom;
		}
		const kw = present.has('keyword')
			? methodPrefOn(fromDom, 'keyword')
			: methodPrefOn(oldPref, 'keyword');
		const dual = present.has('dual')
			? methodPrefOn(fromDom, 'dual')
			: methodPrefOn(oldPref, 'dual');
		const vec = present.has('vector')
			? methodPrefOn(fromDom, 'vector')
			: methodPrefOn(oldPref, 'vector');
		if (!kw && !dual && !vec) return new Set([NONE]);
		if (kw && dual && vec) return new Set();
		const next = new Set<string>();
		if (kw) next.add('keyword');
		if (dual) next.add('dual');
		if (vec) next.add('vector');
		return next;
	};

	const methodBlockHtml = (
		selected: Set<string>,
		opts: {
			/** 分子：下方范围/格式/文件勾选后可显示数 */
			dualVisible: number;
			/** 分母：该类结果总数（旧「分子」语义） */
			dualTotal: number;
			keywordVisible: number;
			keywordTotal: number;
			vectorVisible: number;
			vectorTotal: number;
			showDual: boolean;
			showVector: boolean;
		},
	) => {
		const allOn = selected.size === 0;
		type MethodRow = {
			val: string;
			label: string;
			/** 展示用计数文案，已含括号 */
			countText: string;
			title: string;
		};
		const pair = (vis: number, total: number) =>
			`(${Math.min(vis, total)}/${total})`;
		const tip = (vis: number, total: number, kind: string) =>
			`${kind}：可显示 ${Math.min(vis, total)} / 共 ${total}（受下方范围·格式·文件勾选影响）`;
		// 顺序：双方式 → 关键字 → 向量
		const rows: MethodRow[] = [];
		if (opts.showDual) {
			rows.push({
				val: 'dual',
				label: '双方式搜索',
				countText: pair(opts.dualVisible, opts.dualTotal),
				title: tip(opts.dualVisible, opts.dualTotal, '双方式'),
			});
		}
		rows.push({
			val: 'keyword',
			label: '关键字搜索',
			countText: pair(opts.keywordVisible, opts.keywordTotal),
			title: tip(opts.keywordVisible, opts.keywordTotal, '纯关键字'),
		});
		if (opts.showVector) {
			rows.push({
				val: 'vector',
				label: '向量搜索',
				countText: pair(opts.vectorVisible, opts.vectorTotal),
				title: tip(opts.vectorVisible, opts.vectorTotal, '纯向量'),
			});
		}
		const body = rows
			.map(({ val, label, countText, title }) => {
				const checked = selected.has(NONE)
					? false
					: allOn || selected.has(val);
				return `<label class="ms-filter-value" title="${title}">
					<input type="checkbox" data-facet="method" data-value="${val}" ${checked ? 'checked' : ''} />
					<span class="ms-filter-label">${label}<span class="ms-filter-count">${countText}</span></span>
				</label>`;
			})
			.join('');
		const nOn = selected.has(NONE)
			? 0
			: allOn
				? rows.length
				: rows.filter((r) => selected.has(r.val)).length;
		const swChecked = nOn === rows.length && rows.length > 0;
		const swIndet = nOn > 0 && nOn < rows.length;
		return `
		<div class="ms-filter-block is-open" data-group="method">
			<div class="ms-filter-head">
				<input type="checkbox" class="ms-group-switch" ${swChecked ? 'checked' : ''} ${swIndet ? 'data-indeterminate' : ''} title="全选 / 全取消" />
				<button type="button" class="ms-filter-collapse" aria-expanded="true">
					<span class="ms-filter-title">搜索方式</span>
					<span class="ms-chevron" aria-hidden="true"></span>
				</button>
			</div>
			<div class="ms-filter-group">
				${body}
			</div>
		</div>`;
	};

	const projectHitForRight = (h: SearchHit): SearchHit => {
		if (
			(rightScopes.folder || rightScopes.file) &&
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

	/**
	 * 范围 / 格式 / 文件（不含搜索方式）是否仍可展示。
	 * 与 applyRightFilter 一致。
	 */
	const hitPassesRightMeta = (h: SearchHit): boolean => {
		const src = h.sources || { keyword: true, vector: false };
		const pureVec = src.vector && !src.keyword;
		if (rightFormat.has(NONE) || rightFolder.has(NONE)) return false;
		if (rightFormat.size && !rightFormat.has(h.format)) return false;
		if (rightFolder.size && !filePathMatchesSelection(h.id, rightFolder))
			return false;
		if (pureVec) return true;
		const scopeOn =
			rightScopes.folder ||
			rightScopes.file ||
			rightScopes.title ||
			rightScopes.abstract ||
			rightScopes.body;
		if (!scopeOn) return false;
		const scopeOk =
			(rightScopes.folder && h.match.folder) ||
			(rightScopes.file && h.match.file) ||
			(rightScopes.title && h.match.title) ||
			(rightScopes.abstract && h.match.abstract) ||
			(rightScopes.body && h.match.body);
		if (!scopeOk) return false;
		const projected = projectHitForRight(h);
		if (rightScopes.folder && h.match.folder) return true;
		if (rightScopes.file && h.match.file) return true;
		return projected.sections.some(
			(s) => s.headingHtml || (s.prose && s.prose.length),
		);
	};

	/** 分母=该类总数；分子=下方筛选后可显示数（≤分母） */
	const computeMethodVisibleCounts = (hits: SearchHit[]) => {
		let pureKeyword = 0;
		let pureVector = 0;
		let dual = 0;
		let pureKeywordVisible = 0;
		let pureVectorVisible = 0;
		let dualVisible = 0;
		for (const h of hits) {
			const kind = hitMethodKind(h);
			if (!kind) continue;
			const vis = hitPassesRightMeta(h);
			if (kind === 'keyword') {
				pureKeyword++;
				if (vis) pureKeywordVisible++;
			} else if (kind === 'vector') {
				pureVector++;
				if (vis) pureVectorVisible++;
			} else {
				dual++;
				if (vis) dualVisible++;
			}
		}
		return {
			pureKeyword,
			pureVector,
			dual,
			pureKeywordVisible: Math.min(pureKeywordVisible, pureKeyword),
			pureVectorVisible: Math.min(pureVectorVisible, pureVector),
			dualVisible: Math.min(dualVisible, dual),
		};
	};

	/** 只刷新搜索方式后的 (分子/分母)，不重建勾选 */
	const refreshMethodCountLabels = (hits: SearchHit[]) => {
		const c = computeMethodVisibleCounts(hits);
		const setCount = (val: string, visible: number, total: number) => {
			const input = rightBody.querySelector<HTMLInputElement>(
				`input[data-facet="method"][data-value="${val}"]`,
			);
			const label = input?.closest('label');
			const el = label?.querySelector<HTMLElement>('.ms-filter-count');
			if (el) {
				el.textContent = `(${visible}/${total})`;
				label?.setAttribute(
					'title',
					`当前可显示 ${visible} / 该类共 ${total}（受范围·格式·文件勾选影响）`,
				);
			}
		};
		setCount('dual', c.dualVisible, c.dual);
		setCount('keyword', c.pureKeywordVisible, c.pureKeyword);
		setCount('vector', c.pureVectorVisible, c.pureVector);
	};

	const applyRightFilter = (hits: SearchHit[]): SearchHit[] => {
		// 搜索方式：空=全选；NONE=全不选；
		// keyword=纯关键字；dual=双命中；vector=纯向量（互不重叠）
		if (rightMethod.has(NONE)) return [];
		const methodAll = rightMethod.size === 0;
		const wantKw = methodAll || rightMethod.has('keyword');
		const wantDual = methodAll || rightMethod.has('dual');
		const wantVec = methodAll || rightMethod.has('vector');
		return hits
			.filter((h) => {
				const kind = hitMethodKind(h);
				const methodOk =
					(wantKw && kind === 'keyword') ||
					(wantDual && kind === 'dual') ||
					(wantVec && kind === 'vector');
				if (!methodOk) return false;
				return hitPassesRightMeta(h);
			})
			.map((h) => projectHitForRight(h));
	};

	/** 渲染结果列表；标题 (可展示/结果文件总数) 与列表同源 */
	const renderResults = (hits: SearchHit[], q: string) => {
		if (!q.trim()) {
			statusEl.textContent = '';
			statusEl.removeAttribute('title');
			resultsEl.innerHTML = '';
			rightBody.innerHTML = `<p class="ms-panel-empty">搜索后显示可筛选项</p>`;
			return;
		}
		syncResultCountStatus(hits);
		if (!hits.length) {
			resultsEl.innerHTML = '';
			return;
		}

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
				const src = h.sources || { keyword: true, vector: false };
				const pureVec = src.vector && !src.keyword;
				const dual = src.keyword && src.vector;
				const hitCls = pureVec
					? 'ms-hit is-vector-only'
					: dual
						? 'ms-hit is-hybrid'
						: 'ms-hit is-keyword-only';
				const badge = pureVec
					? `<span class="ms-hit-badge ms-hit-badge--vector" title="纯向量命中">向</span>`
					: dual
						? `<span class="ms-hit-badge ms-hit-badge--hybrid" title="关键字 + 向量双命中">双</span>`
						: `<span class="ms-hit-badge ms-hit-badge--keyword" title="关键字命中">关</span>`;
				return `<li class="${hitCls}"><div class="ms-hit-card"><a class="ms-hit-path-link" href="${escapeAttr(h.href)}"><div class="ms-hit-path">${badge}<span class="ms-hit-path__text">${pathLine}</span></div></a>${sectionsHtml}</div></li>`;
			})
			.join('');
	};

	const vectorEnableEl = () =>
		root.querySelector<HTMLInputElement>('[data-vector-enable]');
	const vectorEnableLabel = () =>
		root.querySelector<HTMLLabelElement>('.ms-vector-enable');
	const vectorEnableText = () =>
		root.querySelector<HTMLElement>('.ms-vector-enable__text');

	/** 仅勾选且模型已就绪时才真正开向量 */
	const isVectorEnabled = () => {
		const el = vectorEnableEl();
		return Boolean(el?.checked && !el.disabled && isVectorEmbedderReady());
	};

	let vectorLoadInFlight = false;

	const setVectorControlLoading = (loading: boolean) => {
		const label = vectorEnableLabel();
		const cb = vectorEnableEl();
		const text = vectorEnableText();
		if (!label || !cb || !text) return;
		vectorLoadInFlight = loading;
		label.classList.toggle('is-loading', loading);
		cb.disabled = loading;
		text.textContent = loading ? '加载模型' : '向量搜索';
		label.title = loading
			? '正在加载向量模型，请稍候…'
			: '默认关闭。首次勾选将加载模型（约 118MB）；成功后才启用向量检索。';
	};

	const showVectorLoadError = (reason: string) => {
		const msg = reason || '向量模型加载失败';
		statusEl.textContent = '向量模型加载失败';
		statusEl.title = msg;
		try {
			window.alert(`向量模型加载失败\n\n${msg}`);
		} catch {
			/* ignore */
		}
	};

	const runLeftSearch = () => {
		void (async () => {
			if (!service.isReady) {
				statusEl.textContent = '';
				statusEl.title = '索引加载中…';
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
			leftFolder = readFilePathSelection(leftBody);
			const lTree = leftBody.querySelector<HTMLElement>('[data-ms-file-tree]');
			if (lTree) syncFileTreeChecks(lTree);
			if (leftFormat.has(NONE) || leftFolder.has(NONE)) {
				lastBaseHits = [];
				updateRightFromHits([], { preserve: true });
				renderResults([], q);
				return;
			}
			const vectorOn = isVectorEnabled();
			if (vectorOn) {
				statusEl.textContent = '…';
				statusEl.title =
					'向量检索准备中（e5-small，同源 /models 或镜像；首次较慢）…';
			}
			try {
				lastBaseHits = await service.search({
					q,
					scopes: leftScopes,
					facets: { format: [...leftFormat], folder: [...leftFolder] },
					vectorEnabled: vectorOn,
					limit: 10000,
					fuzzy: matchMode === 'fuzzy',
					combine: combineMode,
					strict: matchMode === 'strict',
					caseSensitive: caseMode === 'sensitive',
					wholeWord: tokenMode === 'word',
				});
			} catch (e) {
				console.warn('[search] failed', e);
				lastBaseHits = [];
			}
			if (vectorOn) {
				const diag = getLastVectorDiag();
				if (!diag.ok && diag.reason) {
					console.warn('[search] vector inactive:', diag.reason);
					statusEl.title = `向量未生效：${diag.reason}（结果可能仅有关键词）`;
				}
			}
			// 保留右侧勾选（含搜索方式），仅增删本次结果中的选项
			updateRightFromHits(lastBaseHits, { preserve: true });
			rightFormat = readFacetSelection(rightBody, 'format');
			rightFolder = readFilePathSelection(rightBody);
			// 搜索方式：勿在左侧重搜后用「不完整 DOM」覆盖内存（关向量时没有向量勾选框）
			syncRightMethodFromDomPreserveVectorPref();
			if (rightBody.querySelector('input[data-scope]')) {
				const fromDom = readScopesFrom(rightBody);
				for (const k of scopeLabels.map((s) => s.key)) {
					if (rightBody.querySelector(`input[data-scope="${k}"]`)) {
						rightScopes[k] = fromDom[k];
					}
				}
			}
			renderResults(getFilteredHits(), q);
		})();
	};

	const runRightFilterOnly = () => {
		const q = input.value.trim();
		if (!q || !lastBaseHits.length) {
			renderResults([], q);
			return;
		}
		const scopeDom = readScopesFrom(rightBody);
		if (rightBody.querySelector('input[data-scope="folder"]'))
			rightScopes.folder = scopeDom.folder;
		if (rightBody.querySelector('input[data-scope="file"]')) rightScopes.file = scopeDom.file;
		if (rightBody.querySelector('input[data-scope="title"]'))
			rightScopes.title = scopeDom.title;
		if (rightBody.querySelector('input[data-scope="abstract"]'))
			rightScopes.abstract = scopeDom.abstract;
		if (rightBody.querySelector('input[data-scope="body"]')) rightScopes.body = scopeDom.body;
		rightFormat = readFacetSelection(rightBody, 'format');
		rightFolder = readFilePathSelection(rightBody);
		syncRightMethodFromDomPreserveVectorPref();
		const rTree = rightBody.querySelector<HTMLElement>('[data-ms-file-tree]');
		if (rTree) syncFileTreeChecks(rTree);
		updateFilesSummary(rightBody);
		syncIndeterminate(rightBody);
		// 范围/格式/文件变化 → 刷新搜索方式 (可显示/该类总数)
		refreshMethodCountLabels(lastBaseHits);
		renderResults(getFilteredHits(), q);
	};

	/** 从右侧 DOM 同步搜索方式；缺失的 dual/vector 勾选框保留内存偏好 */
	const syncRightMethodFromDomPreserveVectorPref = () => {
		const boxes = [
			...rightBody.querySelectorAll<HTMLInputElement>(
				'input[data-facet="method"]',
			),
		];
		if (!boxes.length) return;
		const fromDom = readFacetSelection(rightBody, 'method');
		rightMethod = mergeMethodSelectionFromDom(
			fromDom,
			rightMethod,
			rightBody,
		);
	};

	const scheduleLeft = () => {
		if (debounceTimer != null) window.clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => {
			debounceTimer = null;
			runLeftSearch();
		}, 100);
	};

	input.addEventListener('input', () => scheduleLeft());
	// 向量开关：默认关；首次勾选先加载模型（按钮「加载模型」+ 置灰），成功才打钩启用
	root
		.querySelector<HTMLInputElement>('[data-vector-enable]')
		?.addEventListener('click', (e) => {
			const cb = e.currentTarget as HTMLInputElement;
			if (vectorLoadInFlight) {
				e.preventDefault();
				return;
			}
			// click 时浏览器已切换 checked：true=用户想打开，false=想关闭
			if (!cb.checked) {
				// 关闭：立即仅关键字
				scheduleLeft();
				return;
			}
			// 想打开
			if (isVectorEmbedderReady()) {
				scheduleLeft();
				return;
			}
			// 尚未加载：先取消勾选，加载完成再勾选
			e.preventDefault();
			cb.checked = false;
			void (async () => {
				setVectorControlLoading(true);
				statusEl.textContent = '…';
				statusEl.title =
					'正在加载向量模型（e5-small，约 118MB；同源 /models 或镜像）…';
				try {
					const ok = await ensureVectorEmbedder();
					setVectorControlLoading(false);
					if (ok && isVectorEmbedderReady()) {
						cb.checked = true;
						statusEl.textContent = '';
						statusEl.title = '向量模型已就绪';
						scheduleLeft();
					} else {
						cb.checked = false;
						const diag = getLastVectorDiag();
						showVectorLoadError(
							diag.reason || '无法加载 embedding 模型，请检查 /models 或网络',
						);
					}
				} catch (err) {
					setVectorControlLoading(false);
					cb.checked = false;
					showVectorLoadError(
						err instanceof Error ? err.message : String(err),
					);
				}
			})();
		});

	const syncMsTreeAccordionBtn = (side: Side) => {
		const btn = root.querySelector<HTMLButtonElement>(
			`[data-ms-tree-accordion="${side}"]`,
		);
		if (!btn) return;
		const on = getMsTreeAccordion(side);
		const label = on ? '单开' : '多开';
		btn.dataset.on = on ? '1' : '0';
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		btn.classList.toggle('is-on', on);
		const labelEl = btn.querySelector('.ms-tree-accordion-btn__label');
		if (labelEl) labelEl.textContent = label;
		else btn.textContent = label;
		if (on) {
			btn.title = '单开：同层只展开一个文件夹（点击切换为多开）';
			btn.setAttribute('aria-label', '文件夹展开：单开');
		} else {
			btn.title = '多开：可同时展开多个文件夹（点击切换为单开）';
			btn.setAttribute('aria-label', '文件夹展开：多开');
		}
	};

	/** 关闭某一文件夹节点（隐藏 children + 更新 twist） */
	const closeMsFolderNode = (node: Element) => {
		const kids = node.querySelector(
			':scope > .ms-folder-children',
		) as HTMLElement | null;
		const twist = node.querySelector(
			':scope > .ms-folder-row [data-folder-twist]',
		) as HTMLButtonElement | null;
		if (kids) kids.setAttribute('hidden', '');
		if (twist) {
			twist.setAttribute('aria-expanded', 'false');
			twist.classList.remove('is-open');
		}
		node.classList.remove('is-open');
	};

	/** 单开：同父层其它已展开的文件夹收起（按侧栏独立） */
	const enforceMsTreeAccordion = (side: Side, openedNode: Element) => {
		if (!getMsTreeAccordion(side)) return;
		const parent = openedNode.parentElement;
		if (!parent) return;
		for (const sib of parent.children) {
			if (sib === openedNode) continue;
			if (
				sib instanceof HTMLElement &&
				sib.classList.contains('ms-folder-node') &&
				sib.dataset.kind === 'dir' &&
				sib.classList.contains('is-open')
			) {
				closeMsFolderNode(sib);
			}
		}
	};

	/** 切到单开时：该侧文件树每层只保留第一个已展开目录 */
	const collapseMsTreeToAccordion = (side: Side) => {
		if (!getMsTreeAccordion(side)) return;
		const panel = side === 'left' ? leftBody : rightBody;
		panel.querySelectorAll<HTMLElement>('[data-ms-file-tree]').forEach((tree) => {
			const walkLevel = (container: Element) => {
				const openDirs = [...container.children].filter(
					(el): el is HTMLElement =>
						el instanceof HTMLElement &&
						el.classList.contains('ms-folder-node') &&
						el.dataset.kind === 'dir' &&
						el.classList.contains('is-open'),
				);
				if (openDirs.length > 1) {
					for (let i = 1; i < openDirs.length; i++) {
						closeMsFolderNode(openDirs[i]!);
					}
				}
				for (const child of container.children) {
					if (!(child instanceof HTMLElement)) continue;
					const kids = child.querySelector(':scope > .ms-folder-children');
					if (kids) walkLevel(kids);
				}
			};
			walkLevel(tree);
		});
	};

	const bindMsTreeAccordionBtn = (side: Side) => {
		syncMsTreeAccordionBtn(side);
		root
			.querySelector(`[data-ms-tree-accordion="${side}"]`)
			?.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const next = !getMsTreeAccordion(side);
				setMsTreeAccordion(side, next);
				syncMsTreeAccordionBtn(side);
				if (next) collapseMsTreeToAccordion(side);
			});
	};
	bindMsTreeAccordionBtn('left');
	bindMsTreeAccordionBtn('right');

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
				if (open) {
					kids.removeAttribute('hidden');
					// 本侧单开：同层其它夹收起
					enforceMsTreeAccordion(side, node);
				} else kids.setAttribute('hidden', '');
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
					?.querySelectorAll<HTMLInputElement>(
						'input[data-scope], input[data-facet]',
					)
					.forEach((box) => {
						box.checked = on;
						box.indeterminate = false;
					});
				t.indeterminate = false;
				const tree = block?.querySelector<HTMLElement>('[data-ms-file-tree]');
				if (tree) syncFileTreeChecks(tree);
			} else if (t.matches('input[data-facet="folder"]')) {
				// 文件夹勾选：递归子文件 + 子文件夹
				const node = t.closest('.ms-folder-node[data-kind="dir"]');
				const on = t.checked;
				t.indeterminate = false;
				node
					?.querySelectorAll<HTMLInputElement>(
						'input[data-facet="file"], input[data-facet="folder"]',
					)
					.forEach((box) => {
						box.checked = on;
						box.indeterminate = false;
					});
				const tree = t.closest('[data-ms-file-tree]') as HTMLElement | null;
				if (tree) syncFileTreeChecks(tree);
			} else if (t.matches('input[data-facet="file"]')) {
				// 单文件：向上同步文件夹 indeterminate
				const tree = t.closest('[data-ms-file-tree]') as HTMLElement | null;
				if (tree) syncFileTreeChecks(tree);
			} else if (!t.matches('input[data-scope], input[data-facet]')) {
				return;
			}
			// 子项勾选变化后，刷新各组「全选/半选/全不选」组开关
			syncIndeterminate(panel);
			if (side === 'left') scheduleLeft();
			else runRightFilterOnly();
		});
	};

	bindPanel(leftBody, 'left');
	bindPanel(rightBody, 'right');

	root.querySelector('[data-reset-left]')?.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		// 恢复默认：范围用 DEFAULT_SCOPES（文件夹默认关），格式/文件空 Set = 全选
		leftScopes = { ...DEFAULT_SCOPES };
		leftFormat = new Set();
		leftFolder = new Set();
		renderLeft();
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
		if (!input.value.trim() || !lastBaseHits.length) return;
		renderResults(getFilteredHits(), input.value.trim());
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
	methodSortEl()?.addEventListener('change', () => {
		if (!input.value.trim() || !lastBaseHits.length) return;
		renderResults(getFilteredHits(), input.value.trim());
	});
	pathSortBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		pathSort = pathSort === 'asc' ? 'desc' : 'asc';
		syncPathSortBtn();
		if (!input.value.trim() || !lastBaseHits.length) return;
		renderResults(getFilteredHits(), input.value.trim());
	});

	statusEl.textContent = '';
	statusEl.title = '索引加载中…';
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
			statusEl.textContent = '';
			statusEl.title = '索引不可用';
		});
}
