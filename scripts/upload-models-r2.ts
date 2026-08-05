/**
 * 将 public/models 上传到 Cloudflare R2（增量：内容未变则跳过 Put）。
 *
 * 跳过策略（默认，省 Class A / 不乱传）：
 *   仓库内 public/models/.r2-upload-manifest.json
 *   记录 相对路径 → { size, sha256, uploadedAt }
 *   与当前本地文件一致则 skip（不调用 wrangler put）。
 *   Cloudflare 不会「自动忽略相同内容」；每次 put 都是一次 Class A。
 *
 * 该 manifest **建议提交 Git**：换机 / CI / 他人 clone 后也能跳过未变文件。
 * 兼容读取旧路径 .cache/r2-upload-manifest.json（仅迁移一次，不再写入）。
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
/** 进 Git：与模型同目录，团队共享「已上传内容哈希」 */
const manifestPath = path.join(modelsRoot, '.r2-upload-manifest.json');
const legacyManifestPath = path.join(root, '.cache', 'r2-upload-manifest.json');
const force =
	process.env.WEBMD_R2_FORCE === '1' ||
	process.argv.includes('--force') ||
	process.argv.includes('-f');

type Entry = { size: number; sha256: string; uploadedAt: string };
type Manifest = {
	bucket: string;
	/** 说明：仅作跳过 Put 的本地/仓库记忆，非 Cloudflare 权威清单 */
	note?: string;
	files: Record<string, Entry>;
};

function listFiles(dir: string, base = dir): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		// 不上传 manifest 自身
		if (name === '.r2-upload-manifest.json') continue;
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
	const empty: Manifest = {
		bucket,
		note: 'sha256 of public/models files after successful R2 put; commit to git to share skip state',
		files: {},
	};
	for (const p of [manifestPath, legacyManifestPath]) {
		try {
			if (!fs.existsSync(p)) continue;
			const j = JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest;
			if (j && j.files) {
				if (p === legacyManifestPath) {
					console.log(
						'[r2-upload] migrated skip state from .cache/ → public/models/.r2-upload-manifest.json (please git commit)',
					);
				}
				return {
					bucket: j.bucket || bucket,
					note: empty.note,
					files: j.files,
				};
			}
		} catch {
			/* ignore */
		}
	}
	return empty;
}

function saveManifest(m: Manifest) {
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	m.note =
		'sha256 of public/models files after successful R2 put; commit to git to share skip state';
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

	// 即使全 skip 也写入仓库路径 manifest（迁移自 .cache / 同步 bucket 字段）
	saveManifest(manifest);

	console.log(
		`[r2-upload] done. uploaded=${uploaded} skipped=${skipped} total=${files.length}`,
	);
	if (uploaded === 0 && skipped > 0) {
		console.log(
			'[r2-upload] 无 Class A Put（全跳过）。强制重传: npm run models:r2-upload -- --force',
		);
	}
	console.log(
		`[r2-upload] manifest → ${path.relative(root, manifestPath)} （请 git commit 以便他人跳过）`,
	);
	console.log(
		'[r2-upload] Pages binding: MODELS →',
		bucket,
		'| 验收 /models/.../config.json',
	);
}

main();
