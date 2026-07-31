declare module 'katex/contrib/auto-render' {
	import type { KatexOptions } from 'katex';

	export interface RenderMathInElementOptions extends KatexOptions {
		delimiters?: Array<{ left: string; right: string; display: boolean }>;
		ignoredTags?: string[];
		ignoredClasses?: string[];
		errorCallback?: (msg: string, err: Error) => void;
	}

	export default function renderMathInElement(
		elem: HTMLElement,
		options?: RenderMathInElementOptions,
	): void;
}
