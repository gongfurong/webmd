/**
 * 站点主配置（入口）
 *
 * - 放：站点身份、功能总开关，以及对其它配置模块的汇总
 * - 布局 → config/layout.ts
 * - 内容约定 → config/content.ts
 * - Markdown → config/markdown.ts
 * - 本地端口 → vite.config.ts
 */
import layout from './config/layout';
import content from './config/content';
import markdown from './config/markdown';

const siteConfig = {
	site: {
		title: 'WebMD',
		description: '个人 Wiki：content 为真相，GitHub 风渲染',
	},
	layout,
	content,
	markdown,
	features: {
		toc: true,
		codeCopy: true,
		/** 构建后 Pagefind 站内搜索 */
		search: true,
	},
} as const;

export type SiteConfig = typeof siteConfig;
export default siteConfig;
