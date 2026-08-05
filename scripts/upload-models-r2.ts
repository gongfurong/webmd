/**
 * 将 public/models 上传到 Cloudflare R2，供 Pages Function 同源提供。
 *
 * 前置：
 *   1. npx wrangler login
 *   2. npx wrangler r2 bucket create webmd-models   # 若尚未创建
 *   3. Pages 项目绑定 R2：binding 名 MODELS → 桶 webmd-models
 *
 * 用法：
 *   npm run models:r2-upload
 *   WEBMD_R2_BUCKET=my-bucket npm run models:r2-upload
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VECTOR_MODEL_ID } from '../src/search/vector-shared';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = path.join(root, 'public', 'models');
const bucket = process.env.WEBMD_R2_BUCKET || 'webmd-models';

function listFiles(dir: string, base = dir): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) out.push(...listFiles(p, base));
		else out.push(path.relative(base, p).replace(/\\/g, '/'));
	}
	return out;
}

function main() {
	const idPath = path.join(modelsRoot, ...VECTOR_MODEL_ID.split('/'));
	if (!fs.existsSync(idPath)) {
		console.error(
			`[r2-upload] missing ${path.relative(root, idPath)}. Run: npm run vector-models`,
		);
		process.exit(1);
	}

	const files = listFiles(modelsRoot);
	if (!files.length) {
		console.error('[r2-upload] no files under public/models');
		process.exit(1);
	}

	console.log(`[r2-upload] bucket=${bucket} files=${files.length}`);
	console.log(
		'[r2-upload] keys are relative to models/ root (e.g. Xenova/multilingual-e5-small/...)',
	);

	for (const rel of files) {
		const filePath = path.join(modelsRoot, rel);
		const key = rel; // Xenova/.../onnx/model_quantized.onnx
		const r2Uri = `${bucket}/${key}`;
		console.log(`[r2-upload] put ${r2Uri}`);
		const r = spawnSync(
			'npx',
			[
				'wrangler',
				'r2',
				'object',
				'put',
				r2Uri,
				'--file',
				filePath,
				'--remote',
			],
			{ cwd: root, stdio: 'inherit', shell: true },
		);
		if (r.status !== 0) {
			console.error(`[r2-upload] failed: ${r2Uri}`);
			process.exit(r.status || 1);
		}
	}

	console.log('[r2-upload] done.');
	console.log(
		'[r2-upload] 确认 Pages → Settings → Functions → R2 bindings: MODELS →',
		bucket,
	);
	console.log(
		'[r2-upload] 部署后访问 /models/Xenova/multilingual-e5-small/config.json 应 200',
	);
}

main();
