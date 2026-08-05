/**
 * 下载 multilingual-e5-small 量化权重到 public/models/
 * （本地浏览器 + 本机构建 vector-index 共用；线上再 models:r2-upload）
 * npm run vector-models
 *
 * 优先 hf-mirror.com，失败再试 huggingface.co
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VECTOR_MODEL_ID } from '../src/search/vector-shared';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'public', 'models', ...VECTOR_MODEL_ID.split('/'));

const FILES = [
	'config.json',
	'tokenizer.json',
	'tokenizer_config.json',
	'special_tokens_map.json',
	'sentencepiece.bpe.model',
	'quant_config.json',
	'onnx/model_quantized.onnx',
];

const MIRRORS = [
	'https://hf-mirror.com',
	'https://huggingface.co',
];

async function download(url: string, dest: string): Promise<void> {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
	const buf = Buffer.from(await res.arrayBuffer());
	fs.writeFileSync(dest, buf);
	const mb = (buf.length / 1024 / 1024).toFixed(1);
	console.log(`[vector-models] ok ${path.relative(root, dest)} (${mb} MB)`);
}

async function main() {
	console.log(`[vector-models] → ${path.relative(root, outRoot)}`);
	for (const rel of FILES) {
		const dest = path.join(outRoot, rel);
		if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
			console.log(`[vector-models] skip exists ${rel}`);
			continue;
		}
		let lastErr: unknown;
		for (const host of MIRRORS) {
			const url = `${host}/${VECTOR_MODEL_ID}/resolve/main/${rel}`;
			try {
				console.log(`[vector-models] get ${url}`);
				await download(url, dest);
				lastErr = null;
				break;
			} catch (e) {
				lastErr = e;
				console.warn(`[vector-models] fail ${host}:`, e);
			}
		}
		if (lastErr) throw lastErr;
	}
	console.log(
		'[vector-models] done. Local: public/models + vector-index build; online: npm run models:r2-upload',
	);
}

main().catch((e) => {
	console.error('[vector-models] failed', e);
	process.exit(1);
});
