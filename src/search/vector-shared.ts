/**
 * 向量索引共享：构建期 + 浏览器共用（无 Node API）
 * 模型：multilingual-e5-small（中英多语检索；须 query:/passage: 前缀）
 */
export const VECTOR_MODEL_ID = 'Xenova/multilingual-e5-small';
/** 换模型后递增，浏览器拒绝加载旧 bge-small-zh 索引 */
export const VECTOR_INDEX_VERSION = 2;
/** e5-small 输出维度 */
export const VECTOR_DIMS = 384;

export type VectorIndexItem = {
	id: string;
	href: string;
	path: string;
	file: string;
	format: string;
	folder: string;
	displayTitle: string;
	snippet: string;
	/** float32 小端 base64 */
	vec: string;
};

export type VectorIndexFile = {
	version: number;
	model: string;
	dims: number;
	generatedAt: string;
	count: number;
	items: VectorIndexItem[];
};

/** E5 检索：文档侧前缀（构建索引时用） */
export function e5PassageText(text: string): string {
	const t = String(text || '').trim();
	if (!t) return 'passage: ';
	if (/^passage:\s*/i.test(t)) return t;
	return `passage: ${t}`;
}

/** E5 检索：查询侧前缀（浏览器 / 查询时用） */
export function e5QueryText(text: string): string {
	const t = String(text || '').trim();
	if (!t) return 'query: ';
	if (/^query:\s*/i.test(t)) return t;
	return `query: ${t}`;
}

function bytesToBase64(bytes: Uint8Array): string {
	const g = globalThis as typeof globalThis & {
		Buffer?: {
			from: (u: Uint8Array) => { toString: (enc: string) => string };
		};
	};
	if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const g = globalThis as typeof globalThis & {
		Buffer?: {
			from: (
				s: string,
				enc: string,
			) => { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
		};
	};
	if (g.Buffer) {
		const buf = g.Buffer.from(b64, 'base64');
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function float32ToBase64(data: Float32Array | number[]): string {
	const f32 =
		data instanceof Float32Array ? data : Float32Array.from(data);
	const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
	return bytesToBase64(bytes);
}

export function base64ToFloat32(b64: string): Float32Array {
	const bytes = base64ToBytes(b64);
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
	const n = Math.min(a.length, b.length);
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < n; i++) {
		const x = a[i]!;
		const y = b[i]!;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (na <= 0 || nb <= 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 索引是否与当前方案兼容（拒绝旧 bge-small-zh） */
export function isCompatibleVectorIndex(
	data: Partial<VectorIndexFile> | null | undefined,
): data is VectorIndexFile {
	if (!data?.items?.length) return false;
	if (data.version !== VECTOR_INDEX_VERSION) return false;
	if (data.model !== VECTOR_MODEL_ID) return false;
	if (data.dims && data.dims !== VECTOR_DIMS) return false;
	return true;
}
