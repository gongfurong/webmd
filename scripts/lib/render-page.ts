/**
 * 渲染单页 HTML（SSG 与 dev 中间件共用）
 */
import fs from 'node:fs';
import path from 'node:path';
import site from '../../site.config';
import {
	flattenFiles,
	pageHref,
	scanContent,
	type TreeFile,
	type TreeJson,
} from './scan';
import {
	createMarkdownIt,
	enhanceCodeBlocksHtml,
	extractHeadings,
	wrapAsMarkdown,
} from './markdown';
import {
	renderBreadcrumb,
	renderHomePage,
	renderMobileTocHtml,
	renderPage,
	renderPager,
	renderTocHtml,
	renderTreeHtml,
} from './template';

export type RenderCtx = {
	contentDir: string;
	assetJs: string;
	assetCss: string;
	tree?: TreeJson;
	files?: TreeFile[];
};

function readFileRaw(contentDir: string, file: TreeFile): string {
	const full = path.join(contentDir, file.path);
	if (!fs.existsSync(full)) return '';
	if (file.kind === 'markdown' || file.kind === 'text') {
		return fs.readFileSync(full, 'utf8');
	}
	return '';
}

function fileBytes(contentDir: string, file: TreeFile): number | undefined {
	const full = path.join(contentDir, file.path);
	try {
		if (fs.existsSync(full)) return fs.statSync(full).size;
	} catch {
		/* ignore */
	}
	return undefined;
}

export function getTreeAndFiles(contentDir: string): {
	tree: TreeJson;
	files: TreeFile[];
} {
	const tree = scanContent(contentDir);
	return { tree, files: flattenFiles(tree.children) };
}

export function renderFilePage(
	file: TreeFile,
	files: TreeFile[],
	tree: TreeJson,
	ctx: RenderCtx,
): string {
	const i = files.findIndex((f) => f.path === file.path);
	const prev = i > 0 ? files[i - 1]! : null;
	const next = i >= 0 && i < files.length - 1 ? files[i + 1]! : null;

	const md = createMarkdownIt();
	const bytes = fileBytes(ctx.contentDir, file);
	const source = wrapAsMarkdown(file, readFileRaw(ctx.contentDir, file), {
		bytes,
	});
	// 媒体/PDF 为完整 HTML 片段，勿再过 marked
	const isRawHtml =
		file.kind === 'pdf' ||
		file.kind === 'image' ||
		file.kind === 'video' ||
		file.kind === 'audio';
	let bodyHtml = isRawHtml ? source : md.render(source);

	// PDF：构建期 / 渲染期嵌入 base64（与 starlight 一致，避免直链下载）
	if (file.kind === 'pdf') {
		const full = path.join(ctx.contentDir, file.path);
		let b64 = '';
		try {
			if (fs.existsSync(full)) b64 = fs.readFileSync(full).toString('base64');
		} catch {
			/* ignore */
		}
		bodyHtml = bodyHtml.replace(
			/<script type="application\/pdf-base64"><\/script>/,
			`<script type="application/pdf-base64">${b64}</script>`,
		);
	}

	if (site.features.codeCopy && !isRawHtml) {
		bodyHtml = enhanceCodeBlocksHtml(bodyHtml);
	}
	const headings = isRawHtml ? [] : extractHeadings(bodyHtml);

	// text 页：仅宽度自适应；媒体页：高度比例自适应
	const bodyClass =
		file.kind === 'pdf'
			? 'is-pdf-page is-media-page'
			: file.kind === 'image'
				? 'is-media-page is-image-page'
				: file.kind === 'video'
					? 'is-media-page is-video-page'
					: file.kind === 'audio'
						? 'is-media-page is-audio-page'
						: file.kind === 'markdown' || file.kind === 'text'
							? 'is-text-page'
							: 'is-text-page';

	return renderPage({
		siteTitle: site.site.title,
		pageTitle: file.name,
		description: `${file.kind} · ${file.path}`,
		activePath: file.path,
		bodyClass,
		treeHtml: renderTreeHtml(tree.children, file.path),
		// 大纲始终渲染；无标题时显示「本页暂无大纲」——是否收起由用户决定
		tocHtml: site.features.toc ? renderTocHtml(headings) : '',
		mobileTocHtml: site.features.toc ? renderMobileTocHtml(headings) : '',
		// 路径 + 大小/类型统一在顶部；正文不再重复
		breadcrumbHtml: renderBreadcrumb(file, { bytes }),
		bodyHtml,
		pagerHtml: renderPager(prev, next),
		assetJs: ctx.assetJs,
		assetCss: ctx.assetCss,
		navWidth: site.layout.navWidth,
		tocWidth: site.layout.tocWidth,
		headerHeight: site.layout.headerHeight,
	});
}

/**
 * 规范化 pathname：解码、统一前导 /、去掉尾斜杠（根除外）
 * 必须与 pageHref 的「逻辑路径」比较，不能拿 decode 后的串去比 encode 后的 href
 * （否则中文路径永远匹配失败 → dev 掉进首页 index.md）
 */
function normalizeUrlPath(pathname: string): string {
	let p = (pathname || '/').split('?')[0] || '/';
	// 反复 decode，兼容部分环境双重编码
	for (let i = 0; i < 3; i++) {
		try {
			const d = decodeURIComponent(p);
			if (d === p) break;
			p = d;
		} catch {
			break;
		}
	}
	if (!p.startsWith('/')) p = '/' + p;
	// 去掉 hash 残留
	p = p.split('#')[0] || '/';
	if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
	return p || '/';
}

/** 文件 → 逻辑 URL 路径（已 decode，无尾斜杠）。主页 / 不映射到任何 content 文件 */
function fileLogicalPath(file: TreeFile): string {
	if (file.kind === 'markdown') {
		const noExt = file.path.replace(/\.(md|mdx)$/i, '');
		return normalizeUrlPath('/' + noExt);
	}
	return normalizeUrlPath('/f/' + file.path);
}

/** 是否站级主页 URL（/ 或空） */
export function isHomeUrl(pathname: string): boolean {
	const want = normalizeUrlPath(pathname);
	return want === '/' || want === '';
}

/** 渲染站级主页 HTML */
export function renderSiteHome(
	tree: TreeJson,
	ctx: RenderCtx,
): string {
	return renderHomePage({
		siteTitle: site.site.title,
		siteDescription: site.site.description,
		assetJs: ctx.assetJs,
		assetCss: ctx.assetCss,
		treeHtml: renderTreeHtml(tree.children, '__home__'),
		navWidth: site.layout.navWidth,
		tocWidth: site.layout.tocWidth,
		headerHeight: site.layout.headerHeight,
	});
}

/** URL pathname → TreeFile（不含 / 主页） */
export function matchFileByUrl(pathname: string, files: TreeFile[]): TreeFile | null {
	const want = normalizeUrlPath(pathname);

	// 站级主页不由 content 文件承担
	if (want === '/') return null;

	for (const f of files) {
		if (fileLogicalPath(f) === want) return f;
		// 兼容：直接按 content 相对路径访问 /notes/hello.md
		if (normalizeUrlPath('/' + f.path) === want) return f;
		// 兼容：pageHref 编码串与 want 在 normalize 后相等（双重保险）
		if (normalizeUrlPath(pageHref(f)) === want) return f;
	}

	return null;
}
