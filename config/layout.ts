/**
 * 布局默认值（左 / 中 / 右栏等）
 * 由 site.config.ts 汇总导出；改宽度优先改本文件。
 */
export default {
	/** 顶栏高度 (px) */
	headerHeight: 56,
	/** 左：文件夹树 */
	navWidth: 280,
	navMin: 200,
	navMax: 480,
	/** 右：本页大纲 */
	tocWidth: 240,
	tocMin: 160,
	tocMax: 400,
	/** 中栏拖拽时保底 (px，预留) */
	mainMin: 360,
	/** 窄于该宽度 (px) 时隐藏右栏 */
	tocHideBelow: 900,
	/** 窄于该宽度时隐藏左栏 */
	navHideBelow: 640,
} as const;
