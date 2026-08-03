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
	pageBuildFields,
	renderBreadcrumb,
	renderHomePage,
	renderInlineTocHtml,
	renderPage,
	renderPager,
	renderTocHtml,
	renderTreeHtml,
} from './template';
import { ensureVideoPoster, injectInlineVideoPosters } from './video-poster';
import {
	isOfficePdfConvertible,
	resolveOfficePreview,
} from './office-preview';
import {
	isCsvFile,
	isSpreadsheetFile,
	renderCsvDocumentHtml,
	renderExcelSheetApp,
} from './spreadsheet-preview';
import {
	enhanceMermaidCopyButtons,
	isMermaidFile,
	renderMermaidShell,
} from './mermaid-preview';
import {
	enhancePlantumlCopyButtons,
	isPlantumlFile,
	renderPlantumlShell,
} from './plantuml-preview';
import {
	enhanceGraphvizCopyButtons,
	isGraphvizFile,
	renderGraphvizShell,
} from './graphviz-preview';
import {
	isDiagramExportSourceFile,
	resolveDiagramExportPreview,
} from './diagram-export-preview';

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
	const officePrev =
		isOfficePdfConvertible(file)
			? resolveOfficePreview(ctx.contentDir, file.path)
			: null;
	// 表格：仅输出 sheet-app 壳，数据浏览器 fetch 原文件（SheetJS + x-spreadsheet）
	const sheetAppHtml = isSpreadsheetFile(file)
		? renderExcelSheetApp({ src: file.url, name: file.name })
		: isCsvFile(file)
			? renderCsvDocumentHtml('', {
					title: file.name,
					fileUrl: file.url,
				})
			: null;
	// Mermaid / PlantUML 独立文件：与文内同壳，不过假 MD
	const mermaidAppHtml = isMermaidFile(file)
		? renderMermaidShell({
				source: readFileRaw(ctx.contentDir, file),
				id: `file-${file.path.replace(/[^\w.-]+/g, '-')}`,
			})
		: null;
	const plantumlAppHtml = isPlantumlFile(file)
		? renderPlantumlShell({
				source: readFileRaw(ctx.contentDir, file),
				id: `file-${file.path.replace(/[^\w.-]+/g, '-')}`,
			})
		: null;
	const graphvizAppHtml = isGraphvizFile(file)
		? renderGraphvizShell({
				source: readFileRaw(ctx.contentDir, file),
				id: `file-${file.path.replace(/[^\w.-]+/g, '-')}`,
			})
		: null;

	const diagramExportPrev = isDiagramExportSourceFile(file)
		? resolveDiagramExportPreview(ctx.contentDir, file.path)
		: null;

	const source = wrapAsMarkdown(file, readFileRaw(ctx.contentDir, file), {
		bytes,
		officePreviewUrl: officePrev?.url ?? null,
		diagramExportPreview: diagramExportPrev,
		contentDir: ctx.contentDir,
	});
	// 媒体/PDF/Office/表格/独立图示预览为完整 HTML，勿再过 marked
	const isRawHtml =
		file.kind === 'pdf' ||
		file.kind === 'image' ||
		file.kind === 'video' ||
		file.kind === 'audio' ||
		file.kind === 'file' ||
		Boolean(sheetAppHtml) ||
		Boolean(mermaidAppHtml) ||
		Boolean(plantumlAppHtml) ||
		Boolean(graphvizAppHtml);
	let bodyHtml = sheetAppHtml
		? sheetAppHtml
		: mermaidAppHtml
			? mermaidAppHtml
			: plantumlAppHtml
				? plantumlAppHtml
				: graphvizAppHtml
					? graphvizAppHtml
					: isRawHtml
						? source
						: md.render(source);

	// 全页视频文件：绑定 _Res_* 封面
	if (file.kind === 'video') {
		const posterUrl = ensureVideoPoster(ctx.contentDir, file.path);
		if (posterUrl) {
			bodyHtml = bodyHtml.replace(
				/<video\b(?![^>]*\bposter=)/,
				`<video poster="${posterUrl.replace(/"/g, '&quot;')}"`,
			);
		}
	}

	// Markdown 文内 <video src="/content/...">：同一套 _Res_* 封面文件
	if (file.kind === 'markdown') {
		bodyHtml = injectInlineVideoPosters(ctx.contentDir, bodyHtml);
	}

	// PDF / Office 预览：嵌入 preview 的 base64（Office 用 _Res_*/preview.pdf）
	const pdfEmbedAbs =
		file.kind === 'pdf'
			? path.join(ctx.contentDir, file.path)
			: officePrev?.absPath || null;
	if (pdfEmbedAbs && bodyHtml.includes('application/pdf-base64')) {
		let b64 = '';
		try {
			if (fs.existsSync(pdfEmbedAbs)) {
				b64 = fs.readFileSync(pdfEmbedAbs).toString('base64');
			}
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
	// 图示复制钮：必须在 MD 消毒之后注入（button 在消毒前会被转义成可见文本）
	if (site.features.codeCopy) {
		bodyHtml = enhanceMermaidCopyButtons(bodyHtml);
		bodyHtml = enhancePlantumlCopyButtons(bodyHtml);
		bodyHtml = enhanceGraphvizCopyButtons(bodyHtml);
	}
	const headings = isRawHtml ? [] : extractHeadings(bodyHtml);

	/*
	 * 统一页面态：
	 * - Markdown：is-markdown-page + is-text-page → 可用固定/铺满版心
	 * - 其它所有文件：is-file-page；具体类型叠 is-pdf-page 等
	 * - Office 有预览 PDF 时按 PDF 页布局；无预览时 is-binary-page
	 */
	const bodyClass = (() => {
		if (file.kind === 'markdown') return 'is-text-page is-markdown-page';
		const filePage = 'is-file-page';
		if (file.kind === 'pdf') return `${filePage} is-pdf-page is-media-page`;
		if (file.kind === 'image') return `${filePage} is-media-page is-image-page`;
		if (file.kind === 'video') return `${filePage} is-media-page is-video-page`;
		if (file.kind === 'audio') return `${filePage} is-media-page is-audio-page`;
		if (file.kind === 'text') {
			if (isCsvFile(file))
				return `${filePage} is-text-page is-sheet-page is-sheet-app-page is-xs-page`;
			// TreeFile.ext 无点；独立图示页：文件页 + mermaid 卡，勿挂 is-markdown-page（避免 MD 版心规则搅布局）
			const ext = (file.ext || '').toLowerCase().replace(/^\./, '');
			if (ext === 'mmd' || ext === 'mermaid') {
				return `${filePage} is-text-page is-mermaid-page`;
			}
			if (ext === 'puml' || ext === 'plantuml' || ext === 'pu') {
				return `${filePage} is-text-page is-plantuml-page`;
			}
			if (ext === 'dot' || ext === 'gv' || ext === 'graphviz') {
				return `${filePage} is-text-page is-graphviz-page`;
			}
			return `${filePage} is-text-page is-source-page`;
		}
		if (isSpreadsheetFile(file)) {
			return `${filePage} is-sheet-page is-office-page is-sheet-app-page is-xs-page`;
		}
		if (officePrev) {
			return `${filePage} is-pdf-page is-media-page is-office-page`;
		}
		// 画布/导图源 + 旁路导出图：与纯图片页相同布局（正文仅 media-stage）
		if (diagramExportPrev) {
			return `${filePage} is-media-page is-image-page`;
		}
		return `${filePage} is-binary-page`;
	})();

	return renderPage({
		siteTitle: site.site.title,
		pageTitle: file.name,
		description: `${file.kind} · ${file.path}`,
		activePath: file.path,
		bodyClass,
		treeHtml: renderTreeHtml(tree.children, file.path),
		// 大纲始终渲染；无标题时显示「本页暂无大纲」——是否收起由用户决定
		tocHtml: site.features.toc ? renderTocHtml(headings) : '',
		inlineTocHtml: site.features.toc ? renderInlineTocHtml(headings) : '',
		// 路径 + 大小/类型统一在顶部；正文不再重复
		breadcrumbHtml: renderBreadcrumb(file, { bytes }),
		bodyHtml,
		pagerHtml: renderPager(prev, next),
		assetJs: ctx.assetJs,
		assetCss: ctx.assetCss,
		navWidth: site.layout.navWidth,
		tocWidth: site.layout.tocWidth,
		headerHeight: site.layout.headerHeight,
		...pageBuildFields(),
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
	// 与 pageHref 一致（decode 后比）
	return normalizeUrlPath(pageHref(file));
}

/**
 * 旧链接兼容：生成若干等价 want，便于 /f/... 与「无 pages 前缀」仍能打开。
 */
function urlMatchCandidates(pathname: string): string[] {
	const want = normalizeUrlPath(pathname);
	const out = new Set<string>([want]);
	// /f/a/b → /pages/a/b
	if (want === '/f' || want.startsWith('/f/')) {
		const rest = want === '/f' ? '' : want.slice(3);
		out.add(normalizeUrlPath('/pages/' + rest));
	}
	// /notes/hello → /pages/notes/hello（旧 md 直链）
	if (want !== '/' && !want.startsWith('/pages/') && !want.startsWith('/content/')) {
		out.add(normalizeUrlPath('/pages' + want));
	}
	// /pages/f/a → /pages/a（误写）
	if (want.startsWith('/pages/f/')) {
		out.add(normalizeUrlPath('/pages/' + want.slice('/pages/f/'.length)));
	}
	return [...out];
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
		...pageBuildFields(),
	});
}

/** URL pathname → TreeFile（不含 / 主页） */
export function matchFileByUrl(pathname: string, files: TreeFile[]): TreeFile | null {
	const candidates = urlMatchCandidates(pathname);

	// 站级主页不由 content 文件承担
	if (candidates.length === 1 && candidates[0] === '/') return null;
	if (candidates.every((c) => c === '/' || c === '')) return null;

	for (const want of candidates) {
		if (want === '/' || want === '') continue;
		for (const f of files) {
			if (fileLogicalPath(f) === want) return f;
			// 兼容：直接按 content 相对路径访问 /notes/hello.md 或 /content/...
			if (normalizeUrlPath('/' + f.path) === want) return f;
			if (normalizeUrlPath('/content/' + f.path) === want) return f;
			// 兼容：pageHref 编码串
			if (normalizeUrlPath(pageHref(f)) === want) return f;
		}
	}

	return null;
}
