/**
 * Cloudflare Pages Function：同源 /models/* → R2（绕过 Pages 单文件 25 MiB 限制）
 * 绑定名：MODELS（见 wrangler.toml）
 *
 * 本地 dev 不走本函数，仍由 Vite 提供 public/models。
 */
type R2ObjectBody = {
	body: ReadableStream;
	httpEtag: string;
	httpMetadata?: { contentType?: string };
	writeHttpMetadata: (headers: Headers) => void;
};

type R2Bucket = {
	get: (key: string) => Promise<R2ObjectBody | null>;
};

export type Env = {
	MODELS?: R2Bucket;
};

function contentTypeForKey(key: string): string {
	const lower = key.toLowerCase();
	if (lower.endsWith('.onnx')) return 'application/octet-stream';
	if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
	if (lower.endsWith('.model')) return 'application/octet-stream';
	return 'application/octet-stream';
}

function cacheControlForKey(key: string): string {
	const lower = key.toLowerCase();
	// 小配置短缓存，便于换模探测；大权重长缓存（换模请改路径或 Purge）
	if (
		lower.endsWith('config.json') ||
		lower.endsWith('tokenizer_config.json') ||
		lower.endsWith('special_tokens_map.json') ||
		lower.endsWith('quant_config.json')
	) {
		return 'public, max-age=60, stale-while-revalidate=3600';
	}
	if (lower.endsWith('.onnx')) {
		return 'public, max-age=604800, stale-while-revalidate=86400';
	}
	// tokenizer.json 等中等
	return 'public, max-age=86400, stale-while-revalidate=86400';
}

export const onRequestGet = async (context: {
	env: Env;
	params: { path?: string | string[] };
	request: Request;
}): Promise<Response> => {
	const bucket = context.env.MODELS;
	if (!bucket) {
		return new Response(
			'R2 binding MODELS is not configured. Create bucket webmd-models and bind it in Pages → Settings → Functions → R2 bindings.',
			{ status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
		);
	}

	const raw = context.params.path;
	const parts = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
	const key = parts.join('/');
	if (!key || key.includes('..') || key.startsWith('/')) {
		return new Response('Bad path', { status: 400 });
	}

	const obj = await bucket.get(key);
	if (!obj) {
		return new Response(`Model object not found in R2: ${key}`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('etag', obj.httpEtag);
	if (!headers.has('content-type')) {
		headers.set('Content-Type', contentTypeForKey(key));
	}
	headers.set('Cache-Control', cacheControlForKey(key));
	// 同源为主；若跨子域调试可放开
	headers.set('Access-Control-Allow-Origin', '*');

	return new Response(obj.body, { headers });
};

export const onRequestHead = onRequestGet;
