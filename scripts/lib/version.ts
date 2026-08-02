/**
 * 构建/运行时版本信息（对齐发版、排障用）。
 * 注意： intentionally 不参与页面缓存失效——各页仍靠自身 ETag/正文对比。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export type WebmdBuildInfo = {
	/** package.json version，如 0.2.0 */
	version: string;
	/** 短 commit，如 a1b2c3d；不可用时为空 */
	commit: string;
	/** ISO 构建时间 */
	builtAt: string;
	/** 展示用：0.2.0+a1b2c3d 或 0.2.0 */
	label: string;
};

let _cached: WebmdBuildInfo | null = null;

function readPkgVersion(): string {
	try {
		const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
		const j = JSON.parse(raw) as { version?: string };
		return (j.version || '0.0.0').trim() || '0.0.0';
	} catch {
		return '0.0.0';
	}
}

function readCommit(): string {
	const env =
		process.env.CF_PAGES_COMMIT_SHA ||
		process.env.GITHUB_SHA ||
		process.env.COMMIT_REF ||
		process.env.VERCEL_GIT_COMMIT_SHA ||
		'';
	if (env) return String(env).trim().slice(0, 7);
	try {
		return execSync('git rev-parse --short HEAD', {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
			.trim()
			.slice(0, 7);
	} catch {
		return '';
	}
}

/** 每次构建/进程内固定一次，避免同次 build 时间戳乱跳 */
export function getWebmdBuildInfo(): WebmdBuildInfo {
	if (_cached) return _cached;
	const version = readPkgVersion();
	const commit = readCommit();
	const builtAt = new Date().toISOString();
	const label = commit ? `${version}+${commit}` : version;
	_cached = { version, commit, builtAt, label };
	return _cached;
}
