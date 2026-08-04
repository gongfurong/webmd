/**
 * 向量查询扩展：短查询补中英近义，改善「等待↔await」这类术语对照
 * （小 embedding 对单字口语词不够稳，靠轻量同义扩展补一刀）
 */

/** 精确整词/整句对照（小写键） */
const EXACT_PAIRS: Record<string, string[]> = {
	await: ['await', 'async await', 'async与await', '异步等待', '等待期约', '等待 promise'],
	async: ['async', '异步', 'asynchrony', 'async await', '异步编程'],
	异步: ['异步', 'async', 'asynchrony', '异步编程', 'async await'],
	编程: [
		'编程',
		// 英文靠前：避免 slice 上限把 programming 裁掉导致路径 Programming 无法绿高亮
		'programming',
		'code',
		'coding',
		'程序',
		'代码',
		'程序设计',
		'开发',
		'软件',
		'developer',
	],
	程序: ['程序', '编程', 'program', '代码', 'code'],
	开发: ['开发', '编程', 'development', 'developer', '代码'],
	代码: ['代码', '编程', 'code', '源码', 'coding'],
	等待: ['等待', 'await', 'async await', '异步等待', '阻塞等待'],
	promise: ['promise', '期约', 'Promise', 'thenable'],
	期约: ['期约', 'promise', 'Promise'],
	回调: ['回调', 'callback', '回调函数'],
	callback: ['callback', '回调', '回调函数'],
	限流: ['限流', 'rate limit', 'rate limiting', '流量限制', 'Rate-Limiting'],
	'rate limit': ['rate limit', '限流', 'rate limiting'],
	熔断: ['熔断', 'circuit breaker', '断路器', 'Circuit-Breaker'],
	'circuit breaker': ['circuit breaker', '熔断', '断路器'],
	鉴权: ['鉴权', '认证', 'authorization', 'authentication', '身份验证'],
	认证: ['认证', '鉴权', 'authentication', '身份验证'],
	登录: ['登录', 'login', 'sign in', '身份认证'],
	缓存: ['缓存', 'cache', 'caching'],
	cache: ['cache', '缓存', 'caching'],
	事务: ['事务', 'transaction', 'ACID'],
	transaction: ['transaction', '事务'],
	死锁: ['死锁', 'deadlock', '循环等待'],
	deadlock: ['deadlock', '死锁'],
	线程: ['线程', 'thread'],
	thread: ['thread', '线程'],
	进程: ['进程', 'process'],
	并发: ['并发', 'concurrency', 'concurrent'],
	并行: ['并行', 'parallelism', 'parallel'],
	幂等: ['幂等', 'idempotent', 'idempotency'],
	中间件: ['中间件', 'middleware'],
	middleware: ['middleware', '中间件'],
	路由: ['路由', 'routing', 'router'],
	索引: ['索引', 'index', 'indexing'],
	向量: ['向量', 'vector', 'embedding'],
	embedding: ['embedding', '向量', '词嵌入'],
};

/**
 * 由用户查询生成多条向量检索查询（含原文，去重保序）
 */
export function expandVectorQueries(query: string): string[] {
	const q = String(query || '').trim();
	if (!q) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	const push = (s: string) => {
		const t = s.trim();
		if (!t) return;
		const key = t.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		out.push(t);
	};

	push(q);

	const lower = q.toLowerCase();
	if (EXACT_PAIRS[lower]) {
		for (const x of EXACT_PAIRS[lower]!) push(x);
	} else if (EXACT_PAIRS[q]) {
		for (const x of EXACT_PAIRS[q]!) push(x);
	}

	// 含 await / async 的短句再补中文
	if (/\bawait\b/i.test(q) && !/等待/.test(q)) {
		push('异步等待');
		push('async与await');
	}
	if (/\basync\b/i.test(q) && !/异步/.test(q)) {
		push('异步');
		push('异步编程');
	}
	if (q === '等待' || (q.includes('等待') && q.length <= 6)) {
		push('await');
		push('async await');
	}

	// 高亮用扩展：略放宽，保证中英对照都能进（如 programming）
	return out.slice(0, 10);
}
