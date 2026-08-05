/**
 * 浏览器端本地向量检索 — multilingual-e5-small（量化 ~118MB）
 * 非对话大模型；Cloudflare 静态站可直接用（首次下载模型后缓存）
 */
import {
	VECTOR_MODEL_ID,
	base64ToFloat32,
	cosineSim,
	e5QueryText,
	isCompatibleVectorIndex,
	type VectorIndexFile,
	type VectorIndexItem,
} from './vector-shared';
import { expandVectorQueries } from './vector-expand';

export type VectorHit = {
	item: VectorIndexItem;
	score: number;
};

type Embedder = (
	text: string,
	opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let indexCache: VectorIndexFile | null = null;
let indexPromise: Promise<VectorIndexFile | null> | null = null;
let embedder: Embedder | null = null;
let embedderPromise: Promise<Embedder | null> | null = null;
let decoded: { id: string; item: VectorIndexItem; vec: Float32Array }[] | null =
	null;

/** 最近一次向量检索诊断（供 UI / 控制台） */
let lastVectorDiag: {
	ok: boolean;
	reason?: string;
	query?: string;
	expanded?: string[];
	hitCount?: number;
	topScore?: number;
} = { ok: false };

export function isVectorIndexReady(): boolean {
	return Boolean(indexCache && decoded?.length);
}

export function getLastVectorDiag() {
	return lastVectorDiag;
}

export async function loadVectorIndex(
	url = '/vector-index.json',
): Promise<VectorIndexFile | null> {
	if (indexCache) return indexCache;
	if (indexPromise) return indexPromise;
	indexPromise = (async () => {
		try {
			const res = await fetch(url, { cache: 'no-cache' });
			if (!res.ok) {
				console.warn('[vector] index missing', res.status);
				lastVectorDiag = {
					ok: false,
					reason: `index HTTP ${res.status}`,
				};
				return null;
			}
			const data = (await res.json()) as VectorIndexFile;
			if (!isCompatibleVectorIndex(data)) {
				const bad = data as Partial<VectorIndexFile>;
				console.warn(
					'[vector] incompatible index (need e5-small v2). Run: npm run vector-index',
					{
						version: bad.version,
						model: bad.model,
						dims: bad.dims,
					},
				);
				lastVectorDiag = {
					ok: false,
					reason: 'index 与 e5-small 不兼容，请重建 vector-index',
				};
				return null;
			}
			indexCache = data;
			decoded = data.items.map((item) => ({
				id: item.id,
				item,
				vec: base64ToFloat32(item.vec),
			}));
			console.log(
				`[vector] index loaded: ${data.count} docs, model=${data.model}, dims=${data.dims}`,
			);
			return data;
		} catch (e) {
			console.warn('[vector] load failed', e);
			lastVectorDiag = { ok: false, reason: 'index load failed' };
			return null;
		} finally {
			indexPromise = null;
		}
	})();
	return indexPromise;
}

type TransformersEnv = {
	allowLocalModels: boolean;
	allowRemoteModels: boolean;
	useBrowserCache: boolean;
	remoteHost?: string;
	remotePathTemplate?: string;
	localModelPath?: string;
	backends?: {
		onnx?: { wasm?: { numThreads?: number; proxy?: boolean } };
	};
};

type TransformersMod = {
	pipeline: (...args: unknown[]) => Promise<unknown>;
	env: TransformersEnv;
};

/**
 * 加载 transformers：Vite 预打包会弄坏 onnxruntime-web（registerBackend undefined）。
 * 优先走 CDN ESM；失败再回退 node_modules。
 */
async function loadTransformers(): Promise<TransformersMod> {
	try {
		const url =
			'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm';
		const mod = await import(/* @vite-ignore */ url);
		return mod as TransformersMod;
	} catch (e) {
		console.warn('[vector] CDN transformers failed, try local', e);
	}
	const mod = await import('@xenova/transformers');
	return mod as unknown as TransformersMod;
}

/** 同源是否已托管 /models/...（本地 public/models；线上 R2 + Function） */
async function sameOriginModelsReady(modelId: string): Promise<boolean> {
	try {
		const url = `${window.location.origin}/models/${modelId}/config.json`;
		const res = await fetch(url, { method: 'GET', cache: 'force-cache' });
		return res.ok;
	} catch {
		return false;
	}
}

function configureModelSource(env: TransformersEnv, useSameOrigin: boolean) {
	env.useBrowserCache = true;
	// 单线程更稳（免 COOP/COEP）
	if (env.backends?.onnx?.wasm) {
		env.backends.onnx.wasm.numThreads = 1;
		env.backends.onnx.wasm.proxy = false;
	}
	if (useSameOrigin) {
		// 从站点 /models/Xenova/... 加载（Cloudflare 静态友好）
		env.allowLocalModels = false;
		env.allowRemoteModels = true;
		env.remoteHost = window.location.origin;
		env.remotePathTemplate = 'models/{model}/';
		console.log('[vector] model source: same-origin /models/');
	} else {
		// 镜像优先（国内 HF 常 405/超时），再官方
		env.allowLocalModels = false;
		env.allowRemoteModels = true;
		env.remoteHost = 'https://hf-mirror.com';
		env.remotePathTemplate = '{model}/resolve/main/';
		console.log('[vector] model source: hf-mirror.com');
	}
}

async function getEmbedder(): Promise<Embedder | null> {
	if (embedder) return embedder;
	if (embedderPromise) return embedderPromise;
	embedderPromise = (async () => {
		const model = indexCache?.model || VECTOR_MODEL_ID;
		const trySources: Array<'same' | 'mirror' | 'hf'> = [];
		if (await sameOriginModelsReady(model)) trySources.push('same');
		trySources.push('mirror', 'hf');

		let lastErr: unknown;
		for (const src of trySources) {
			try {
				// 每次换源需重新 pipeline（env 改了）
				embedder = null;
				const { pipeline, env } = await loadTransformers();
				if (src === 'same') {
					configureModelSource(env, true);
				} else if (src === 'mirror') {
					configureModelSource(env, false);
					env.remoteHost = 'https://hf-mirror.com';
				} else {
					configureModelSource(env, false);
					env.remoteHost = 'https://huggingface.co';
					console.log('[vector] model source: huggingface.co');
				}
				console.log(
					'[vector] loading embedder',
					model,
					`via ${src} (quantized ~118MB first time)`,
				);
				const pipe = await pipeline('feature-extraction', model, {
					quantized: true,
				});
				embedder = pipe as unknown as Embedder;
				console.log('[vector] embedder ready via', src);
				return embedder;
			} catch (e) {
				lastErr = e;
				console.warn(`[vector] embedder via ${src} failed`, e);
			}
		}
		lastVectorDiag = {
			ok: false,
			reason: `embedder failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
		};
		return null;
	})().finally(() => {
		embedderPromise = null;
	});
	return embedderPromise;
}

/** 查询文本 → 向量（同页复用，避免扩展/高亮重复推理） */
const queryEmbedCache = new Map<string, Float32Array | null>();

export async function embedQuery(text: string): Promise<Float32Array | null> {
	const key = String(text || '').trim();
	if (!key) return null;
	if (queryEmbedCache.has(key)) return queryEmbedCache.get(key) ?? null;

	const ex = await getEmbedder();
	if (!ex) {
		queryEmbedCache.set(key, null);
		return null;
	}
	// E5：查询必须 query: 前缀
	const input = e5QueryText(key);
	const out = await ex(input, { pooling: 'mean', normalize: true });
	const raw = out.data;
	const vec =
		raw instanceof Float32Array
			? raw
			: Float32Array.from(raw as number[]);
	queryEmbedCache.set(key, vec);
	return vec;
}

export type VectorSearchResult = {
	hits: VectorHit[];
	/** 主查询向量（用于结果内语义近义词高亮） */
	queryVec: Float32Array | null;
};

/**
 * @deprecated 对正文候选词逐个 embed 会极慢且易误高亮，已停用。
 * 保留函数签名以免外部引用断裂。
 */
export async function highlightSemanticNearTerms(
	text: string,
	_queryVec: Float32Array,
	_opts?: {
		markClass?: string;
		maxTerms?: number;
		minScore?: number;
	},
): Promise<string> {
	const { escapeHtml } = await import('./highlight');
	return escapeHtml(String(text || ''));
}

/**
 * 向量结果高亮：仅字面 + 扩展词表（一次同步高亮，不再对每个词做 ONNX）。
 * queryVec 参数保留兼容，当前不用于二次推理。
 */
export async function highlightVectorText(
	text: string,
	literalQuery: string,
	_queryVec: Float32Array | null,
	markClass = 'ms-mark--vector',
): Promise<string> {
	const { highlightText } = await import('./highlight');
	return highlightText(
		text,
		literalQuery,
		'fuzzy',
		'OR',
		false,
		false,
		false,
		markClass,
	);
}

export async function vectorSearch(
	query: string,
	opts?: {
		limit?: number;
		minScore?: number;
		formatSet?: Set<string>;
		filePathSet?: Set<string>;
		filePathMatches?: (path: string, set: Set<string>) => boolean;
	},
): Promise<VectorSearchResult> {
	const q = String(query || '').trim();
	if (!q) return { hits: [], queryVec: null };
	const idx = await loadVectorIndex();
	if (!idx || !decoded?.length) {
		lastVectorDiag = {
			ok: false,
			reason: lastVectorDiag.reason || 'no index',
			query: q,
		};
		return { hits: [], queryVec: null };
	}

	// 扩展词只用于高亮（见 service），排名只用用户原文向量。
	// 以前对最多 5 个扩展词各 embed 一次再 max，又慢又易被「编程→code」等泛化词带偏。
	const variants = expandVectorQueries(q);
	const queryVec = await embedQuery(q);
	if (!queryVec) {
		lastVectorDiag = {
			ok: false,
			reason: 'embed failed',
			query: q,
			expanded: variants,
		};
		return { hits: [], queryVec: null };
	}

	// 与早期可用形态对齐：够宽以便和关键字合并成「双」，再由 service 收紧「纯向量」
	const limit = opts?.limit ?? 48;
	const floor = opts?.minScore ?? 0.8;
	const formatSet = opts?.formatSet;
	const filePathSet = opts?.filePathSet;
	const pathOk = opts?.filePathMatches;

	const allScored: VectorHit[] = [];
	for (const row of decoded) {
		const it = row.item;
		if (formatSet?.size && !formatSet.has(it.format)) continue;
		if (filePathSet?.size && pathOk && !pathOk(it.path, filePathSet)) {
			continue;
		}
		const score = cosineSim(queryVec, row.vec);
		allScored.push({ item: it, score });
	}
	allScored.sort((a, b) => b.score - a.score);
	const peak = allScored[0]?.score ?? 0;
	// 约 5 分点内 + 绝对底线（勿再用 peak-0.025 导致 await 合并不上「双」）
	const relCut = peak > 0 ? peak - 0.05 : floor;
	const minScore = Math.max(floor, relCut);
	const top = allScored
		.filter((h) => h.score >= minScore)
		.slice(0, limit);
	lastVectorDiag = {
		ok: true,
		query: q,
		expanded: variants,
		hitCount: top.length,
		topScore: top[0]?.score,
	};
	console.log(
		`[vector] q=${JSON.stringify(q)} expandHl=${JSON.stringify(variants)} hits=${top.length} top=${top[0]?.score?.toFixed(3) ?? '-'} min=${minScore.toFixed(3)} embeds=1 model=e5-small`,
	);
	return { hits: top, queryVec };
}

export async function warmupVector(loadModel: boolean): Promise<void> {
	await loadVectorIndex();
	if (loadModel) await getEmbedder();
}
