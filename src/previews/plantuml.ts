/**
 * 图示适配器 · PlantUML（MD 文内 + 独立 .puml 文件）
 *
 * 框架四段：
 * - prepare：无（客户端引擎，不依赖公网）
 * - shell：`scripts/lib/plantuml-preview.ts`
 * - bind：本文件（@plantuml/core TeaVM + viz-global）
 * - style：复用 `.webmd-diagram`；独立页 `is-plantuml-page`
 *
 * 引擎：https://www.npmjs.com/package/@plantuml/core
 * 注意：render/renderToString 异步且共享内部状态 → 串行渲染
 *
 * @see docs/diagrams.md
 */

type PlantumlApi = {
	renderToString: (
		lines: string[],
		onSuccess: (svg: string) => void,
		onError: (message: string) => void,
	) => void;
	render: (
		lines: string[],
		targetId: string,
		options?: { dark?: boolean },
	) => void;
};

let enginePromise: Promise<PlantumlApi> | null = null;
let vizReady = false;

function siteIsDark(): boolean {
	return document.documentElement.dataset.theme === 'dark';
}

function loadClassicScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			`script[data-plantuml-viz="1"]`,
		);
		if (existing) {
			if (vizReady || existing.dataset.loaded === '1') {
				vizReady = true;
				resolve();
				return;
			}
			existing.addEventListener('load', () => resolve(), { once: true });
			existing.addEventListener(
				'error',
				() => reject(new Error('Failed to load viz-global.js')),
				{ once: true },
			);
			return;
		}
		const s = document.createElement('script');
		s.src = src;
		s.async = true;
		s.dataset.plantumlViz = '1';
		s.onload = () => {
			s.dataset.loaded = '1';
			vizReady = true;
			resolve();
		};
		s.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.appendChild(s);
	});
}

async function loadPlantumlEngine(): Promise<PlantumlApi> {
	if (!enginePromise) {
		enginePromise = (async () => {
			// viz-global 必须是经典脚本（挂全局），不能当 ESM 用
			const vizUrl = (
				await import('@plantuml/core/viz-global.js?url')
			).default as string;
			await loadClassicScript(vizUrl);
			const mod = (await import('@plantuml/core')) as PlantumlApi;
			return mod;
		})().catch((err) => {
			enginePromise = null;
			throw err;
		});
	}
	return enginePromise;
}

function decodePlantumlSource(host: HTMLElement): string {
	const encoded = host.getAttribute('data-plantuml-code');
	if (encoded) {
		try {
			return decodeURIComponent(encoded);
		} catch {
			return encoded;
		}
	}
	const pre = host.querySelector('.plantuml-copy-source');
	return pre?.textContent || '';
}

function canvasOf(host: HTMLElement): HTMLElement | null {
	return host.querySelector<HTMLElement>('[data-plantuml-canvas]');
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function showPlantumlError(canvas: HTMLElement, src: string, err: unknown): void {
	const msg = err instanceof Error ? err.message : String(err);
	canvas.classList.add('is-plantuml-error');
	canvas.innerHTML =
		`<div class="plantuml-error" role="alert">` +
		`<strong>PlantUML 渲染失败</strong>` +
		`<pre class="plantuml-error__detail">${escapeHtml(msg)}</pre>` +
		`<details class="plantuml-error__src"><summary>源码</summary><pre>${escapeHtml(src)}</pre></details>` +
		`</div>`;
}

/** 串行：render 写入指定 id 的节点（支持 dark） */
function renderIntoCanvas(
	api: PlantumlApi,
	lines: string[],
	canvas: HTMLElement,
	dark: boolean,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!canvas.id) {
			canvas.id = `plantuml-canvas-${Math.random().toString(36).slice(2, 10)}`;
		}
		canvas.innerHTML = '';
		let settled = false;
		const finish = (err?: Error) => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			clearTimeout(timer);
			if (err) reject(err);
			else resolve();
		};
		const observer = new MutationObserver(() => {
			if (canvas.querySelector('svg')) finish();
		});
		observer.observe(canvas, { childList: true, subtree: true });
		const timer = window.setTimeout(() => {
			if (canvas.querySelector('svg')) finish();
			else finish(new Error('PlantUML 渲染超时'));
		}, 45000);
		try {
			api.render(lines, canvas.id, dark ? { dark: true } : undefined);
		} catch (e) {
			finish(e instanceof Error ? e : new Error(String(e)));
		}
	});
}

/**
 * 渲染页内所有 PlantUML 壳。串行调用引擎（共享内部状态）。
 */
export async function renderPlantumlBlocks(opts?: {
	reset?: boolean;
}): Promise<void> {
	const root = document.getElementById('content') || document;
	const hosts = Array.from(
		root.querySelectorAll<HTMLElement>(
			'.webmd-diagram[data-diagram-engine="plantuml"]',
		),
	);
	if (!hosts.length) return;

	const force = Boolean(opts?.reset);
	const jobs: { host: HTMLElement; canvas: HTMLElement; src: string }[] = [];

	for (const host of hosts) {
		const canvas = canvasOf(host);
		if (!canvas) continue;
		if (
			!force &&
			canvas.querySelector('svg') &&
			!canvas.classList.contains('is-plantuml-error')
		) {
			continue;
		}
		const src = decodePlantumlSource(host).trim();
		if (!src) continue;
		canvas.classList.remove('is-plantuml-error');
		canvas.innerHTML =
			`<div class="plantuml-loading" data-plantuml-loading>正在渲染 PlantUML…</div>`;
		jobs.push({ host, canvas, src });
	}
	if (!jobs.length) return;

	let api: PlantumlApi;
	try {
		api = await loadPlantumlEngine();
	} catch (err) {
		for (const { canvas, src } of jobs) {
			showPlantumlError(canvas, src, err);
		}
		return;
	}

	// 官方文档：同一 JS 上下文必须串行，否则结果互相覆盖
	const dark = siteIsDark();
	for (const { canvas, src } of jobs) {
		const lines = src.split(/\r\n|\r|\n/);
		try {
			await renderIntoCanvas(api, lines, canvas, dark);
			const svg = canvas.querySelector('svg');
			if (svg) svg.classList.add('plantuml-svg');
			canvas.classList.remove('is-plantuml-error');
		} catch (err) {
			console.warn('[webmd] plantuml render failed', err);
			showPlantumlError(canvas, src, err);
		}
	}
}

export function bindPlantuml(): void {
	void renderPlantumlBlocks();
}
