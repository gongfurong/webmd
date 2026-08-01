/**
 * 静态站点生成：每个可导航文件 → 内嵌正文的 HTML
 * 前置：vite 已产出 dist/assets/*
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../site.config';
import { pageOutDir } from './lib/scan';
import { getTreeAndFiles, renderFilePage, renderSiteHome } from './lib/render-page';
import { render404Page, renderTreeHtml } from './lib/template';
import { buildSearchIndex } from './lib/search-index';
import { prepareAllVideoPosters } from './lib/video-poster';
import { prepareAllOfficePreviews } from './lib/office-preview';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, site.content.root);
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');

function findAssets(): { js: string; css: string } {
	const assetsDir = path.join(distDir, 'assets');
	if (!fs.existsSync(assetsDir)) {
		return { js: '/assets/client.js', css: '/assets/style.css' };
	}
	const files = fs.readdirSync(assetsDir);
	const js = files.find((f) => f.endsWith('.js'));
	const css = files.find((f) => f.endsWith('.css'));
	return {
		js: js ? `/assets/${js}` : '/assets/client.js',
		css: css ? `/assets/${css}` : '/assets/style.css',
	};
}

function main() {
	if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

	const { tree, files } = getTreeAndFiles(contentDir);
	// 重建静态站：与 scan 同一制作管线（抽帧 / Word·PPT→PDF；不覆盖已有）
	// 表格：不预生成 CSV；页面壳 + 浏览器 SheetJS 读 /content 原文件
	const posters = prepareAllVideoPosters(contentDir, files);
	if (posters.skippedNoFfmpeg) {
		console.log('[site] 视频封面：无 ffmpeg，跳过抽帧');
	} else if (posters.tried) {
		console.log(
			`[site] 视频封面：检查 ${posters.tried} 个，新生成 ${posters.generated} 个`,
		);
	}
	const office = prepareAllOfficePreviews(contentDir, files);
	if (office.skippedNoSoffice) {
		console.log('[site] Office→PDF：无 LibreOffice，跳过（Word/PPT）');
	} else if (office.tried) {
		console.log(
			`[site] Office→PDF：检查 ${office.tried} 个，新生成 ${office.generated} 个`,
		);
	}

	fs.mkdirSync(publicDir, { recursive: true });
	const treeJson = JSON.stringify(tree, null, 2);
	fs.writeFileSync(path.join(distDir, 'tree.json'), treeJson, 'utf8');
	fs.writeFileSync(path.join(publicDir, 'tree.json'), treeJson, 'utf8');

	const distContent = path.join(distDir, 'content');
	if (fs.existsSync(distContent)) fs.rmSync(distContent, { recursive: true, force: true });
	// 含 _Res_*（封面/附件不进树，但需可访问）
	fs.cpSync(contentDir, distContent, { recursive: true });
	console.log('[ssg] content/ → dist/content/');

	const assets = findAssets();
	const ctx = { contentDir, assetJs: assets.js, assetCss: assets.css };

	// 站级主页 dist/index.html（非 content/index.md）
	const homeHtml = renderSiteHome(tree, ctx);
	fs.writeFileSync(path.join(distDir, 'index.html'), homeHtml, 'utf8');

	let count = 0;
	for (const file of files) {
		const html = renderFilePage(file, files, tree, ctx);
		const outRel = pageOutDir(file);
		// index.md → dist/index/index.html，勿覆盖站级 dist/index.html
		const outDir = outRel ? path.join(distDir, outRel) : path.join(distDir, '_page');
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
		count++;
	}

	const notFound = render404Page({
		siteTitle: site.site.title,
		assetJs: assets.js,
		assetCss: assets.css,
		treeHtml: renderTreeHtml(tree.children, ''),
		navWidth: site.layout.navWidth,
		tocWidth: site.layout.tocWidth,
		headerHeight: site.layout.headerHeight,
	});
	fs.writeFileSync(path.join(distDir, '404.html'), notFound, 'utf8');

	const searchIdx = buildSearchIndex(contentDir);
	const searchJson = JSON.stringify(searchIdx);
	fs.writeFileSync(path.join(distDir, 'search-index.json'), searchJson, 'utf8');
	fs.writeFileSync(path.join(publicDir, 'search-index.json'), searchJson, 'utf8');
	console.log(
		`[ssg] wrote home + ${count} content pages + 404.html + search-index (${searchIdx.docs.length} docs, minisearch) → dist/`,
	);
}

main();
