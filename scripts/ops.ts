/**
 * WebMD 运维一键入口（Node 跨平台，Mac/Windows 通用）
 *
 *   npx tsx scripts/ops.ts <command> [options]
 *   npm run ops -- <command>
 *
 * 命令：
 *   dev          本地开发服务 (npm run dev)
 *   build        生产构建 dist
 *   r2           增量上传 public/models → R2（内容未变跳过）
 *   r2:force     强制全量上传 R2
 *   git          git add -A && commit && push（无变更则跳过）
 *   r2-git       先 r2 再 git
 *   ship         同 r2-git（上线常用：模型增量 + 推送触发 Pages）
 *   all          build + r2 + git（完整本地构建并上线准备）
 *
 * git 提交说明：
 *   --message "..."  或环境变量 OPS_GIT_MSG
 *   默认：chore: ship YYYY-MM-DD HH:mm
 *
 * 安全：
 *   r2 默认哈希跳过，避免重复 Put 刷 Class A
 *   git 无 --force push
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(
	cmd: string,
	args: string[],
	opts?: { allowFail?: boolean },
): number {
	console.log(`\n[ops] $ ${cmd} ${args.join(' ')}\n`);
	const r = spawnSync(cmd, args, {
		cwd: root,
		stdio: 'inherit',
		shell: true,
		env: process.env,
	});
	const code = r.status ?? 1;
	if (code !== 0 && !opts?.allowFail) {
		console.error(`[ops] failed (${code}): ${cmd}`);
		process.exit(code);
	}
	return code;
}

function npmRun(script: string, extraArgs: string[] = []) {
	// npm run script -- args
	if (extraArgs.length) {
		return run('npm', ['run', script, '--', ...extraArgs]);
	}
	return run('npm', ['run', script]);
}

function parseArgs(argv: string[]) {
	const args = argv.slice(2);
	const cmd = (args[0] || 'help').toLowerCase();
	let message = process.env.OPS_GIT_MSG || '';
	const rest: string[] = [];
	for (let i = 1; i < args.length; i++) {
		const a = args[i]!;
		if (a === '--message' || a === '-m') {
			message = args[++i] || message;
		} else {
			rest.push(a);
		}
	}
	return { cmd, message, rest };
}

function gitHasChanges(): boolean {
	const r = spawnSync('git', ['status', '--porcelain'], {
		cwd: root,
		encoding: 'utf8',
		shell: true,
	});
	return Boolean(r.stdout && r.stdout.trim());
}

function opsGit(message: string) {
	run('git', ['status', '-sb']);
	if (!gitHasChanges()) {
		console.log('[ops] git: working tree clean, skip commit/push');
		// 仍尝试 push（可能本地有未推送提交）
		run('git', ['push'], { allowFail: true });
		return;
	}
	const msg =
		message.trim() ||
		`chore: ship ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
	run('git', ['add', '-A']);
	// 允许 hooks；空提交不用
	const c = spawnSync('git', ['commit', '-m', msg], {
		cwd: root,
		stdio: 'inherit',
		shell: true,
	});
	if (c.status !== 0) {
		console.error('[ops] git commit failed (maybe nothing staged / hook)');
		process.exit(c.status || 1);
	}
	run('git', ['push']);
}

function help() {
	console.log(`
WebMD ops — 一键运维（跨平台）

  npm run ops -- dev
  npm run ops -- build
  npm run ops -- r2              # 增量上传 R2（推荐）
  npm run ops -- r2:force        # 强制全量 R2
  npm run ops -- git -m "说明"
  npm run ops -- r2-git -m "说明"
  npm run ops -- ship -m "说明"  # = r2-git
  npm run ops -- all -m "说明"   # build + r2 + git

双击（仓库根目录 ops/）：
  Windows: *.cmd    macOS: *.command

R2 跳过逻辑：.cache/r2-upload-manifest.json（本地 sha256，不上传则不产生 Class A）
强制：npm run models:r2-upload -- --force
`);
}

function main() {
	const { cmd, message } = parseArgs(process.argv);

	switch (cmd) {
		case 'help':
		case '-h':
		case '--help':
			help();
			break;
		case 'dev':
		case 'local':
			npmRun('dev');
			break;
		case 'build':
			npmRun('build');
			break;
		case 'r2':
			npmRun('models:r2-upload');
			break;
		case 'r2:force':
		case 'r2-force':
			npmRun('models:r2-upload', ['--force']);
			break;
		case 'git':
			opsGit(message);
			break;
		case 'r2-git':
		case 'r2_git':
		case 'ship':
			npmRun('models:r2-upload');
			opsGit(message);
			break;
		case 'all':
		case 'full':
			npmRun('build');
			npmRun('models:r2-upload');
			opsGit(message);
			break;
		default:
			console.error(`[ops] unknown command: ${cmd}`);
			help();
			process.exit(1);
	}
}

main();
