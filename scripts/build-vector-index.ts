/**
 * 单独构建向量索引：npm run vector-index
 * 也可由 build-site 在写完 search-index 后调用
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSearchIndex } from './lib/search-index';
import { buildAndWriteVectorIndex } from './lib/vector-index';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

async function main() {
	const searchIdx = buildSearchIndex(contentDir);
	fs.mkdirSync(publicDir, { recursive: true });
	fs.writeFileSync(
		path.join(publicDir, 'search-index.json'),
		JSON.stringify(searchIdx),
		'utf8',
	);
	console.log(`[vector] search docs: ${searchIdx.docs.length}`);
	await buildAndWriteVectorIndex(
		searchIdx,
		publicDir,
		fs.existsSync(distDir) ? distDir : undefined,
	);
}

main().catch((e) => {
	console.error('[vector] failed', e);
	process.exit(1);
});
