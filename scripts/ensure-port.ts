/**
 * 启动前端口策略（产品需求优先）：
 * 1. 优先端口空闲 → 使用该端口
 * 2. 被本项目旧 vite 占用 → 结束旧进程，复用固定端口
 * 3. 被其它进程占用 → 不杀，交给 Vite（strictPort: false）换新端口
 *
 * 默认端口须与 vite.config.ts 中一致（或统一用环境变量 PORT）
 */
import { execSync } from 'node:child_process';

const PREFERRED = Number(process.env.PORT) || 18087;

function isWin(): boolean {
	return process.platform === 'win32';
}

function getPidsOnPort(port: number): number[] {
	const pids = new Set<number>();
	try {
		if (isWin()) {
			const out = execSync(
				`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
				{ encoding: 'utf8', windowsHide: true },
			);
			for (const line of out.split(/\r?\n/)) {
				const n = Number(line.trim());
				if (Number.isFinite(n) && n > 0) pids.add(n);
			}
		} else {
			const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
				encoding: 'utf8',
			});
			for (const line of out.split(/\r?\n/)) {
				const n = Number(line.trim());
				if (Number.isFinite(n) && n > 0) pids.add(n);
			}
		}
	} catch {
		/* empty */
	}
	return [...pids];
}

function getCmdLine(pid: number): string {
	try {
		if (isWin()) {
			return execSync(
				`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
				{ encoding: 'utf8', windowsHide: true },
			).trim();
		}
		return execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim();
	} catch {
		return '';
	}
}

/** 是否为本仓库的开发服务（vite / 本脚本） */
function isSelfService(cmd: string): boolean {
	if (!cmd) return false;
	const lower = cmd.toLowerCase().replace(/\\/g, '/');
	const inProject =
		lower.includes('/webmd/') ||
		lower.includes('/webmd') ||
		lower.includes('\\webmd\\') ||
		lower.includes('\\webmd');
	const looksLikeDev = lower.includes('vite') || lower.includes('ensure-port');
	return inProject && looksLikeDev;
}

function killPid(pid: number): void {
	try {
		if (isWin()) {
			execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
		} else {
			process.kill(pid, 'SIGTERM');
		}
	} catch {
		/* ignore */
	}
}

function sleep(ms: number): void {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		/* spin */
	}
}

const pids = getPidsOnPort(PREFERRED);

if (pids.length === 0) {
	console.log(`[port] ${PREFERRED} 空闲 → 使用固定端口`);
	process.exit(0);
}

let killed = 0;
let foreign = 0;

for (const pid of pids) {
	const cmd = getCmdLine(pid);
	if (isSelfService(cmd)) {
		console.log(`[port] 结束本项目旧进程 PID ${pid}`);
		if (cmd) console.log(`       ${cmd.slice(0, 140)}${cmd.length > 140 ? '…' : ''}`);
		killPid(pid);
		killed++;
	} else {
		foreign++;
		console.log(`[port] ${PREFERRED} 被其它进程占用 PID ${pid} → 不杀，将换新端口`);
		if (cmd) console.log(`       ${cmd.slice(0, 140)}${cmd.length > 140 ? '…' : ''}`);
	}
}

if (killed > 0) {
	sleep(500);
	for (const pid of getPidsOnPort(PREFERRED)) {
		if (isSelfService(getCmdLine(pid))) {
			killPid(pid);
			sleep(200);
		}
	}
	if (getPidsOnPort(PREFERRED).length === 0) {
		console.log(`[port] 已释放 → 使用固定端口 ${PREFERRED}`);
	} else {
		console.log(`[port] 释放后仍有占用 → Vite 将换新端口`);
	}
} else if (foreign > 0) {
	console.log(`[port] 外部占用 → Vite 将自动换端口`);
}

process.exit(0);
