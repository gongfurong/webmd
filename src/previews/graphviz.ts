/**
 * 图示适配器 · Graphviz（MD 文内 + 独立 .dot / .gv）
 *
 * - shell：`scripts/lib/graphviz-preview.ts`
 * - bind：本文件 · `@hpcc-js/wasm-graphviz`（WASM，无公网）
 * - style：复用 `.webmd-diagram`；独立页 `is-graphviz-page`
 *
 * @see docs/diagrams.md
 */
import { Graphviz } from '@hpcc-js/wasm-graphviz';

let enginePromise: Promise<Graphviz> | null = null;

function loadGraphviz(): Promise<Graphviz> {
	if (!enginePromise) {
		enginePromise = Graphviz.load().catch((err) => {
			enginePromise = null;
			throw err;
		});
	}
	return enginePromise;
}

function decodeSource(host: HTMLElement): string {
	const encoded = host.getAttribute('data-graphviz-code');
	if (encoded) {
		try {
			return decodeURIComponent(encoded);
		} catch {
			return encoded;
		}
	}
	return host.querySelector('.graphviz-copy-source')?.textContent || '';
}

function canvasOf(host: HTMLElement): HTMLElement | null {
	return host.querySelector<HTMLElement>('[data-graphviz-canvas]');
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function showError(canvas: HTMLElement, src: string, err: unknown): void {
	const msg = err instanceof Error ? err.message : String(err);
	canvas.classList.add('is-graphviz-error');
	canvas.innerHTML =
		`<div class="graphviz-error" role="alert">` +
		`<strong>Graphviz 渲染失败</strong>` +
		`<pre class="graphviz-error__detail">${escapeHtml(msg)}</pre>` +
		`<details class="graphviz-error__src"><summary>源码</summary><pre>${escapeHtml(src)}</pre></details>` +
		`</div>`;
}

export async function renderGraphvizBlocks(opts?: {
	reset?: boolean;
}): Promise<void> {
	const root = document.getElementById('content') || document;
	const hosts = Array.from(
		root.querySelectorAll<HTMLElement>(
			'.webmd-diagram[data-diagram-engine="graphviz"]',
		),
	);
	if (!hosts.length) return;

	const force = Boolean(opts?.reset);
	const jobs: { canvas: HTMLElement; src: string }[] = [];

	for (const host of hosts) {
		const canvas = canvasOf(host);
		if (!canvas) continue;
		if (
			!force &&
			canvas.querySelector('svg') &&
			!canvas.classList.contains('is-graphviz-error')
		) {
			continue;
		}
		const src = decodeSource(host).trim();
		if (!src) continue;
		canvas.classList.remove('is-graphviz-error');
		canvas.innerHTML =
			`<div class="graphviz-loading" data-graphviz-loading>正在渲染 Graphviz…</div>`;
		jobs.push({ canvas, src });
	}
	if (!jobs.length) return;

	let gv: Graphviz;
	try {
		gv = await loadGraphviz();
	} catch (err) {
		for (const { canvas, src } of jobs) showError(canvas, src, err);
		return;
	}

	for (const { canvas, src } of jobs) {
		try {
			const svg = gv.dot(src);
			canvas.innerHTML = svg;
			const el = canvas.querySelector('svg');
			if (el) el.classList.add('graphviz-svg');
			canvas.classList.remove('is-graphviz-error');
		} catch (err) {
			console.warn('[webmd] graphviz render failed', err);
			showError(canvas, src, err);
		}
	}
}

export function bindGraphviz(): void {
	void renderGraphvizBlocks();
}
