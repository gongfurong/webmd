/**
 * 将 public/models 上传到 Cloudflare R2（增量：内容未变则跳过 Put）。
 *
 * 跳过策略（默认，省 Class A / 不乱传）：
 *   本地 .cache/r2-upload-manifest.json 记录 路径 → { size, sha256 }
 *   与当前文件一致则 skip（不调用 wrangler put）。
 *   Cloudflare 不会「自动忽略相同内容」；每次 put 都是一次 Class A。
 *
 * 强制全量：npm run models:r2-upload -- --force
 * 或 WEBMD_R2_FORCE=1
 *
 * 前置：wrangler login；桶 webmd-models；Pages binding MODELS
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VECTOR_MODEL_ID } from '../src/search/vector-shared';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = path.join(root, 'public', 'models');
const bucket = process.env.WEBMD_R2_BUCKET || 'webmd-models';
const manifestPath = path.join(root, '.cache', 'r2-upload-manifest.json');
const force =
	process.env.WEBMD_R2_FORCE === '1' ||
	process.argv.includes('--force') ||
	process.argv.includes('-f');

type Entry = { size: number; sha256: string; uploadedAt: string };
type Manifest = {
	bucket: string;
	files: Record<string, Entry>;
};

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

function sha256File(filePath: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(fs.readFileSync(filePath));
	return hash.digest('hex');
}

function loadManifest(): Manifest {
	try {
		if (fs.existsSync(manifestPath)) {
			const j = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
			if (j && j.files) return j;
		}
	} catch {
		/* ignore */
	}
	return { bucket, files: {} };
}

function saveManifest(m: Manifest) {
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');
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

	const manifest = loadManifest();
	// 换桶则清空跳过依据
	if (manifest.bucket && manifest.bucket !== bucket) {
		console.log(
			`[r2-upload] bucket changed ${manifest.bucket} → ${bucket}, reset skip manifest`,
		);
		manifest.files = {};
	}
	manifest.bucket = bucket;

	console.log(
		`[r2-upload] bucket=${bucket} files=${files.length} force=${force ? 'yes' : 'no (hash skip)'}`,
	);
	console.log(`[r2-upload] manifest ${path.relative(root, manifestPath)}`);

	let uploaded = 0;
	let skipped = 0;

	for (const rel of files) {
		const filePath = path.join(modelsRoot, rel);
		const st = fs.statSync(filePath);
		const digest = sha256File(filePath);
		const prev = manifest.files[rel];
		if (
			!force &&
			prev &&
			prev.size === st.size &&
			prev.sha256 === digest
		) {
			console.log(`[r2-upload] skip (unchanged) ${rel}`);
			skipped++;
			continue;
		}

		const r2Uri = `${bucket}/${rel}`;
		console.log(
			`[r2-upload] put ${r2Uri} (${(st.size / 1024 / 1024).toFixed(2)} MB)`,
		);
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
		manifest.files[rel] = {
			size: st.size,
			sha256: digest,
			uploadedAt: new Date().toISOString(),
		};
		// 每成功一个就落盘，中断也可续传
		saveManifest(manifest);
		uploaded++;
	}

	console.log(
		`[r2-upload] done. uploaded=${uploaded} skipped=${skipped} total=${files.length}`,
	);
	if (uploaded === 0 && skipped > 0) {
		console.log(
			'[r2-upload] 无 Class A Put（全跳过）。强制重传: npm run models:r2-upload -- --force',
		);
	}
	console.log(
		'[r2-upload] Pages binding: MODELS →',
		bucket,
		'| 验收 /models/.../config.json',
	);
}

main();
