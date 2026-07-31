/**
 * Markdown 渲染说明（实现见 scripts/lib/markdown.ts）
 *
 * 与「本地 Markdown 查看器」对齐，固定使用：
 *   marked + gfm + breaks + gfmHeadingId + highlight.js postprocess
 * 下列字段保留给 site.config 兼容，构建期已不再分支使用。
 */
export default {
	/** 插件等价：允许 raw HTML（再由构建侧控制） */
	html: true,
	linkify: true,
	typographer: false,
	/** 与插件 breaks: true 一致 */
	breaks: true,
	engine: 'marked' as const,
};
