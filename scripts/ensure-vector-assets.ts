/**
 * 确保 public/models 与（可选）vector-index 就绪，供 dev / Cloudflare 部署同源加载。
 * 缺模型时自动 npm 等价下载；大文件在仓库中经 Git LFS 跟踪。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VECTOR_MODEL_ID } from '../src/search/vector-shared';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = path.join(
	root,
	'public',
	'models',
	...VECTOR_MODEL_ID.split('/'),
);
const onnxPath = path.join(modelsRoot, 'onnx', 'model_quantized.onnx');
/** 量化包约 110MB+；小于 50MB 视为损坏/未下完 */
const MIN_ONNX_BYTES = 50 * 1024 * 1024;

function hasModels(): boolean {
	try {
		return (
			fs.existsSync(onnxPath) && fs.statSync(onnxPath).size >= MIN_ONNX_BYTES
		);
	} catch {
		return false;
	}
}

function main() {
	if (hasModels()) {
		const mb = (fs.statSync(onnxPath).size / 1024 / 1024).toFixed(1);
		console.log(
			`[vector-assets] models ok: ${path.relative(root, onnxPath)} (${mb} MB)`,
		);
		return;
	}
	console.log('[vector-assets] models missing → run vector-models …');
	const r = spawnSync('npx', ['tsx', 'scripts/download-vector-models.ts'], {
		cwd: root,
		stdio: 'inherit',
		shell: true,
	});
	if (r.status !== 0 || !hasModels()) {
		console.error(
			'[vector-assets] failed: public/models 未就绪。请检查网络后执行: npm run vector-models',
		);
		process.exit(1);
	}
	console.log('[vector-assets] models ready for same-origin /models/');
}

main();
