/**
 * Vite：打包客户端 + dev 时按需 SSG 渲染页面 + /content 直读源目录
 */
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
	getTreeAndFiles,
	isHomeUrl,
	matchFileByUrl,
	renderFilePage,
	renderSiteHome,
} from './scripts/lib/render-page';
import { buildSearchIndex } from './scripts/lib/search-index';
import { getWebmdBuildInfo } from './scripts/lib/version';

const root = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(root, 'content');

const port = Number(process.env.PORT) || 18087;
// 默认 0.0.0.0：同 Wi‑Fi 手机可访问；仅本机可设 HOST=127.0.0.1
const host = process.env.HOST || '0.0.0.0';

const webmdBuild = getWebmdBuildInfo();

function runScan(): void {
	const script = path.join(root, 'scripts/scan-content.ts');
	const r = spawnSync('npx', ['tsx', script], {
		cwd: root,
		stdio: 'inherit',
		shell: true,
	});
	if (r.status !== 0) throw new Error('[scan] failed');
}

function webmdPlugin() {
	return {
		name: 'webmd',
		buildStart() {
			runScan();
		},
		configureServer(server: import('vite').ViteDevServer) {
			server.watcher.add(contentDir);

			// content 变更 = 重新制作内容侧：重扫树 + 视频封面抽帧（与 build 同源）
			let rescanTimer: ReturnType<typeof setTimeout> | null = null;
			const contentRoot = path.resolve(contentDir);
			const scheduleRescan = (file?: string) => {
				if (file) {
					const norm = path.resolve(file);
					if (
						norm !== contentRoot &&
						!norm.startsWith(contentRoot + path.sep)
					) {
						return;
					}
				}
				if (rescanTimer) clearTimeout(rescanTimer);
				rescanTimer = setTimeout(() => {
					rescanTimer = null;
					try {
						console.log('[site] content 变更 → 重扫 / 视频封面');
						runScan();
					} catch (e) {
						console.error('[site] rescan failed', e);
					}
				}, 400);
			};
			server.watcher.on('add', scheduleRescan);
			server.watcher.on('unlink', scheduleRescan);
			server.watcher.on('change', scheduleRescan);

			// MiniSearch 索引（dev 每次现算）
			server.middlewares.use((req, res, next) => {
				const rawUrl = req.url?.split('?')[0] || '';
				if (rawUrl !== '/search-index.json') return next();
				try {
					const idx = buildSearchIndex(contentDir);
					res.setHeader('Content-Type', 'application/json; charset=utf-8');
					res.setHeader('Cache-Control', 'no-cache');
					res.end(JSON.stringify(idx));
				} catch (e) {
					console.error(e);
					res.statusCode = 500;
					res.end('{"docs":[],"facets":{"format":{},"folder":{}}}');
				}
			});

			// 开发态：同构建管线渲染完整 HTML（正文嵌入）
			server.middlewares.use((req, res, next) => {
				const rawUrl = req.url?.split('?')[0] || '/';
				if (
					rawUrl.startsWith('/@') ||
					rawUrl.startsWith('/src/') ||
					rawUrl.startsWith('/node_modules') ||
					rawUrl.startsWith('/assets/') ||
					rawUrl.startsWith('/content/') ||
					// 浏览器端 embedding 模型（public/models）
					rawUrl.startsWith('/models/') ||
					rawUrl === '/search-index.json' ||
					rawUrl === '/vector-index.json' ||
					rawUrl === '/tree.json' ||
					rawUrl === '/favicon.ico' ||
					rawUrl.endsWith('.js') ||
					rawUrl.endsWith('.css') ||
					rawUrl.endsWith('.ts') ||
					rawUrl.endsWith('.map') ||
					rawUrl.endsWith('.json') ||
					rawUrl.endsWith('.onnx') ||
					rawUrl.endsWith('.wasm') ||
					rawUrl.endsWith('.svg') ||
					rawUrl.endsWith('.png') ||
					rawUrl.endsWith('.jpg') ||
					rawUrl.endsWith('.jpeg') ||
					rawUrl.endsWith('.webp') ||
					rawUrl.endsWith('.gif') ||
					rawUrl.endsWith('.mp4') ||
					rawUrl.endsWith('.webm') ||
					rawUrl.endsWith('.mp3') ||
					rawUrl.endsWith('.woff') ||
					rawUrl.endsWith('.woff2')
				) {
					return next();
				}

				try {
					const { tree, files } = getTreeAndFiles(contentDir);
					const ctx = {
						contentDir,
						assetJs: '/src/client.ts',
						assetCss: '/src/style.css',
					};
					// 站级主页 /
					if (isHomeUrl(rawUrl)) {
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						res.end(renderSiteHome(tree, ctx));
						return;
					}
					const file = matchFileByUrl(rawUrl, files);
					if (!file) {
						res.statusCode = 404;
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						res.end(
							`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>404</title></head><body style="font-family:system-ui;padding:2rem"><h1>未找到页面</h1><p><code>${rawUrl.replace(/</g, '')}</code></p><p><a href="/">返回主页</a></p></body></html>`,
						);
						return;
					}

					const html = renderFilePage(file, files, tree, ctx);
					res.setHeader('Content-Type', 'text/html; charset=utf-8');
					res.end(html);
				} catch (e) {
					console.error(e);
					next(e as Error);
				}
			});

			// 原始 content 文件（含 _Res_* 内封面；音视频需 Range）
			server.middlewares.use((req, res, next) => {
				const raw = req.url?.split('?')[0] || '';
				if (!raw.startsWith('/content/')) return next();
				let rel = decodeURIComponent(raw.replace(/^\/content\/?/, ''));
				rel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
				const filePath = path.join(contentDir, rel);
				// Windows 路径前缀比较：统一大小写与分隔符
				const rootNorm = path.resolve(contentDir);
				const fileNorm = path.resolve(filePath);
				if (
					fileNorm !== rootNorm &&
					!fileNorm.startsWith(rootNorm + path.sep)
				) {
					res.statusCode = 403;
					res.end('Forbidden');
					return;
				}
				if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
					res.statusCode = 404;
					res.end('Not found');
					return;
				}
				sendContentFile(req, res, filePath);
			});
		},
	};
}

const CONTENT_TYPES: Record<string, string> = {
	'.md': 'text/markdown; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.ogv': 'video/ogg',
	'.mov': 'video/quicktime',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.m4a': 'audio/mp4',
	'.pdf': 'application/pdf',
};

/**
 * 静态 content 发送：Content-Length + Accept-Ranges + 可选 206。
 * 浏览器 <video>/<audio> 依赖 Range 拉元数据与 seek；整文件 200 无 CL 时常卡在 00:00。
 */
function sendContentFile(
	req: import('http').IncomingMessage,
	res: import('http').ServerResponse,
	filePath: string,
): void {
	const ext = path.extname(filePath).toLowerCase();
	const stat = fs.statSync(filePath);
	const size = stat.size;
	const type = CONTENT_TYPES[ext] || 'application/octet-stream';
	const rawUrl = req.url || '';
	const wantDownload = /[?&](dl|download)=1(?:&|$)/.test(rawUrl);
	const baseName = path.basename(filePath);
	const asciiName = baseName.replace(/[^\w.\u4e00-\u9fff-]+/g, '_') || 'download';
	const disposition = wantDownload ? 'attachment' : ext === '.pdf' ? 'inline' : 'inline';

	res.setHeader('Content-Type', type);
	res.setHeader('Accept-Ranges', 'bytes');
	res.setHeader('Cache-Control', 'public, max-age=0');
	res.setHeader('X-Content-Type-Options', 'nosniff');
	// PDF 默认 inline 便于预览；?dl=1 强制 attachment（客户端下载兜底）
	if (ext === '.pdf' || wantDownload) {
		res.setHeader(
			'Content-Disposition',
			`${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
		);
	}

	if (req.method === 'HEAD') {
		res.setHeader('Content-Length', String(size));
		res.statusCode = 200;
		res.end();
		return;
	}

	const range = req.headers.range;
	if (range) {
		// bytes=start-end | bytes=start-
		const m = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (!m) {
			res.statusCode = 416;
			res.setHeader('Content-Range', `bytes */${size}`);
			res.end();
			return;
		}
		let start = m[1] === '' ? 0 : parseInt(m[1], 10);
		let end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
		if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
			res.statusCode = 416;
			res.setHeader('Content-Range', `bytes */${size}`);
			res.end();
			return;
		}
		end = Math.min(end, size - 1);
		const chunk = end - start + 1;
		res.statusCode = 206;
		res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
		res.setHeader('Content-Length', String(chunk));
		fs.createReadStream(filePath, { start, end }).pipe(res);
		return;
	}

	res.statusCode = 200;
	res.setHeader('Content-Length', String(size));
	fs.createReadStream(filePath).pipe(res);
}

export default defineConfig({
	root,
	publicDir: 'public',
	// 客户端可读构建版本（仅调试/对齐；不参与缓存失效）
	define: {
		__WEBMD_VERSION__: JSON.stringify(webmdBuild.version),
		__WEBMD_COMMIT__: JSON.stringify(webmdBuild.commit),
		__WEBMD_BUILT_AT__: JSON.stringify(webmdBuild.builtAt),
		__WEBMD_LABEL__: JSON.stringify(webmdBuild.label),
	},
	server: {
		host,
		port,
		strictPort: false,
		fs: { allow: [root] },
	},
	preview: {
		host,
		port,
		strictPort: false,
	},
	// SheetJS 仅 Excel 页动态 import，预构建避免 dev 解析怪异
	optimizeDeps: {
		include: ['xlsx'],
		// PlantUML / transformers+onnxruntime：Vite prebundle 会打坏 ort registerBackend
		exclude: [
			'@plantuml/core',
			'@xenova/transformers',
			'onnxruntime-web',
		],
	},
	// wasm 原样交给浏览器
	assetsInclude: ['**/*.wasm'],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		commonjsOptions: {
			// ort 的 UMD 勿被 rollup 错误折叠
			transformMixedEsModules: true,
		},
		rollupOptions: {
			input: path.resolve(root, 'src/client.ts'),
			output: {
				entryFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]',
				chunkFileNames: 'assets/[name]-[hash].js',
			},
		},
	},
	plugins: [webmdPlugin()],
});
