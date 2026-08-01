/**
 * 站点内容扫描（制作/重建网站的公共入口之一）：
 * - content/ → public/tree.json
 * - 视频：有 ffmpeg → `_Res_<完整文件名>/poster.jpg`
 * - Word/PPT：有 LibreOffice → `_Res_<完整文件名>/preview.pdf`
 * - 表格预览：不在此预生成；浏览器 SheetJS 读原文件（见 excel-viewer）
 *
 * 由 `npm run scan`、vite 启动/打包的 buildStart、以及 content 变更重扫调用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../site.config';
import { flattenFiles, scanContent } from './lib/scan';
import { prepareAllVideoPosters } from './lib/video-poster';
import { prepareAllOfficePreviews } from './lib/office-preview';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, site.content.root);
const publicDir = path.join(root, 'public');
const outTree = path.join(publicDir, 'tree.json');

const tree = scanContent(contentDir);
const files = flattenFiles(tree.children);
const posters = prepareAllVideoPosters(contentDir, files);
if (posters.skippedNoFfmpeg) {
	console.log(
		'[site] 视频封面：本机无 ffmpeg，跳过抽帧（手塞 _Res_* 图仍会在渲染时绑定）',
	);
} else if (posters.tried) {
	console.log(
		`[site] 视频封面：检查 ${posters.tried} 个，新生成 ${posters.generated} 个`,
	);
}
// Word/PPT → PDF（需 LibreOffice）
const office = prepareAllOfficePreviews(contentDir, files);
if (office.skippedNoSoffice) {
	console.log(
		'[site] Office→PDF：本机无 LibreOffice，跳过（Word/PPT；手塞 preview.pdf 仍绑定）',
	);
} else if (office.tried) {
	console.log(
		`[site] Office→PDF：检查 ${office.tried} 个，新生成 ${office.generated} 个`,
	);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outTree, JSON.stringify(tree, null, 2), 'utf8');
console.log('[scan] tree → public/tree.json（未复制 content/）');
console.log(
	'[scan] top-level:',
	tree.children.map((c) => c.name).join(', ') || '(empty)',
);
