/**
 * 图示适配器 · Mermaid（MD 文内 + 独立 .mmd 文件）
 *
 * 框架四段：
 * - prepare：无
 * - shell：`scripts/lib/mermaid-preview.ts` → `.webmd-code.webmd-diagram`
 *           （类型栏 + 复制源码 + `.mermaid` 画布；MD 代码块与文件页共用）
 * - bind：本文件 `renderMermaidBlocks` / `bindMermaid`
 * - style：`style.css` · `.webmd-diagram` / `.mermaid`
 *
 * 数据流：
 *   源码（fence 或 .mmd 文件）
 *     → shell：data-mermaid-code + 隐藏 pre.mermaid-copy-source
 *     → DOM 进页（MD 经 marked/DOMPurify；文件页 raw HTML）
 *     → bind：读属性 → mermaid.run → SVG 写入 [data-mermaid-canvas]
 *     → 复制：通用 .webmd-code__copy 读 pre.mermaid-copy-source
 *
 * @see docs/diagrams.md
 */
import mermaid from 'mermaid';

let mermaidTheme: 'default' | 'dark' | null = null;

function siteIsDark(): boolean {
	return document.documentElement.dataset.theme === 'dark';
}

/** 按当前站点主题初始化/重配 mermaid（白→default，黑→dark） */
export function configureMermaidForSiteTheme(): void {
	const theme = siteIsDark() ? 'dark' : 'default';
	if (mermaidTheme === theme) return;
	mermaid.initialize({
		startOnLoad: false,
		theme,
		securityLevel: 'strict',
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
	});
	mermaidTheme = theme;
}

function decodeMermaidSource(host: HTMLElement): string {
	const encoded = host.getAttribute('data-mermaid-code');
	if (encoded) {
		try {
			return decodeURIComponent(encoded);
		} catch {
			return encoded;
		}
	}
	const pre = host.querySelector('.mermaid-copy-source');
	if (pre?.textContent) return pre.textContent;
	const canvas = host.querySelector<HTMLElement>('[data-mermaid-canvas], .mermaid');
	if (canvas && !canvas.querySelector('svg')) {
		return canvas.textContent || '';
	}
	return '';
}

function canvasOf(host: HTMLElement): HTMLElement | null {
	return (
		host.querySelector<HTMLElement>('[data-mermaid-canvas]') ||
		host.querySelector<HTMLElement>('.mermaid')
	);
}

function showMermaidError(canvas: HTMLElement, src: string, err: unknown): void {
	const msg = err instanceof Error ? err.message : String(err);
	canvas.classList.add('is-mermaid-error');
	canvas.innerHTML =
		`<div class="mermaid-error" role="alert">` +
		`<strong>Mermaid 渲染失败</strong>` +
		`<pre class="mermaid-error__detail">${escapeHtml(msg)}</pre>` +
		`<details class="mermaid-error__src"><summary>源码</summary><pre>${escapeHtml(src)}</pre></details>` +
		`</div>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * 渲染页面内所有 Mermaid 图示壳。
 * @param opts.reset 主题切换或软导航后强制重绘
 */
export async function renderMermaidBlocks(opts?: {
	reset?: boolean;
}): Promise<void> {
	const root = document.getElementById('content') || document;
	// 新壳：.webmd-diagram[data-diagram-engine=mermaid]
	// 兼容旧：裸 .mermaid[data-mermaid-code]
	const hosts = Array.from(
		root.querySelectorAll<HTMLElement>(
			'.webmd-diagram[data-diagram-engine="mermaid"], .mermaid[data-mermaid-code]',
		),
	);
	if (!hosts.length) return;

	if (opts?.reset) {
		hosts.forEach((h) => {
			const c = canvasOf(h) || (h.classList.contains('mermaid') ? h : null);
			c?.classList.remove('is-mermaid-error');
		});
	}

	const themeChanged =
		(siteIsDark() && mermaidTheme !== 'dark') ||
		(!siteIsDark() && mermaidTheme !== 'default');
	const force = Boolean(opts?.reset || themeChanged);
	configureMermaidForSiteTheme();

	type Job = { canvas: HTMLElement; src: string };
	const jobs: Job[] = [];

	for (const host of hosts) {
		const isLegacyBare =
			host.classList.contains('mermaid') && !host.classList.contains('webmd-diagram');
		const canvas = isLegacyBare ? host : canvasOf(host);
		if (!canvas) continue;

		if (
			!force &&
			canvas.querySelector('svg') &&
			!canvas.classList.contains('is-mermaid-error')
		) {
			continue;
		}

		const src = decodeMermaidSource(host);
		if (!src.trim()) continue;

		canvas.classList.remove('is-mermaid-error');
		canvas.removeAttribute('data-processed');
		// mermaid.run 需要节点内先是源文本
		canvas.textContent = src;
		jobs.push({ canvas, src });
	}

	if (!jobs.length) return;

	for (const { canvas, src } of jobs) {
		try {
			await mermaid.run({ nodes: [canvas] });
		} catch (err) {
			console.warn('[webmd] mermaid render failed', err);
			showMermaidError(canvas, src, err);
		}
	}
}

/** 软导航 / 首屏入口：语义对齐 excel 的 bind* */
export function bindMermaid(): void {
	void renderMermaidBlocks();
}
