/**
 * Cloudflare Pages 单文件 ≤ 25 MiB：从 dist 删除超限文件（保留仓库/public 本地模型）。
 * 线上大文件由 R2 + functions/models 同源提供。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
/** 留余量，Pages 限制 25 MiB */
const MAX_BYTES = 24 * 1024 * 1024;

function walk(dir: string, acc: string[] = []): string[] {
	if (!fs.existsSync(dir)) return acc;
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) walk(p, acc);
		else acc.push(p);
	}
	return acc;
}

function main() {
	if (!fs.existsSync(distDir)) {
		console.warn('[strip-pages] no dist/, skip');
		return;
	}
	let removed = 0;
	for (const file of walk(distDir)) {
		const size = fs.statSync(file).size;
		if (size <= MAX_BYTES) continue;
		const rel = path.relative(distDir, file);
		const mb = (size / 1024 / 1024).toFixed(1);
		fs.unlinkSync(file);
		removed++;
		console.log(
			`[strip-pages] removed ${rel} (${mb} MiB > 24 MiB) — serve via R2 /models`,
		);
	}
	if (!removed) {
		console.log('[strip-pages] no oversized files in dist/');
	} else {
		console.log(
			`[strip-pages] removed ${removed} file(s). Upload models: npm run models:r2-upload`,
		);
	}
}

main();
