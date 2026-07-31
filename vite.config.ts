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

const root = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(root, 'content');

const port = Number(process.env.PORT) || 18087;
const host = process.env.HOST || '127.0.0.1';

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
					rawUrl === '/search-index.json' ||
					rawUrl === '/tree.json' ||
					rawUrl === '/favicon.ico' ||
					rawUrl.endsWith('.js') ||
					rawUrl.endsWith('.css') ||
					rawUrl.endsWith('.ts') ||
					rawUrl.endsWith('.map') ||
					rawUrl.endsWith('.json') ||
					rawUrl.endsWith('.svg') ||
					rawUrl.endsWith('.png') ||
					rawUrl.endsWith('.jpg') ||
					rawUrl.endsWith('.jpeg') ||
					rawUrl.endsWith('.webp') ||
					rawUrl.endsWith('.gif') ||
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

			// 原始 content 文件
			server.middlewares.use((req, res, next) => {
				const raw = req.url?.split('?')[0] || '';
				if (!raw.startsWith('/content/')) return next();
				let rel = decodeURIComponent(raw.replace(/^\/content\/?/, ''));
				rel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
				const filePath = path.join(contentDir, rel);
				if (!filePath.startsWith(contentDir)) {
					res.statusCode = 403;
					res.end('Forbidden');
					return;
				}
				if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
					res.statusCode = 404;
					res.end('Not found');
					return;
				}
				const ext = path.extname(filePath).toLowerCase();
				const types: Record<string, string> = {
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
					'.mp3': 'audio/mpeg',
					'.pdf': 'application/pdf',
				};
				res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
				if (ext === '.pdf') {
					const name = path.basename(filePath).replace(/[^\w.\u4e00-\u9fff-]+/g, '_');
					res.setHeader(
						'Content-Disposition',
						`inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
					);
					res.setHeader('X-Content-Type-Options', 'nosniff');
				}
				fs.createReadStream(filePath).pipe(res);
			});
		},
	};
}

export default defineConfig({
	root,
	publicDir: 'public',
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
	build: {
		outDir: 'dist',
		emptyOutDir: true,
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
