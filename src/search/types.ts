/** 统一搜索文档（与 build-search-index.mjs 契约一致） */
export type SearchHeading = {
	depth: number;
	text: string;
	slug: string;
};

export type SearchBodyPart = {
	/** 该段所属最近标题 slug；无标题则为空，跳转页顶 */
	slug: string;
	text: string;
	/** 所属标题原文（用于结果展示 h*） */
	heading?: string;
	/** 所属标题层级 1–6 */
	depth?: number;
};

export type SearchDoc = {
	id: string;
	href: string;
	file: string;
	path: string;
	h1: string;
	h2: string;
	h3: string;
	/**
	 * 摘要 = 文中第一段非标题正文（可在任意 h* 下，或无标题；+ 可选 FM description）
	 * 展示时与正文同一规则：挂在 abstractSlug 对应 h* 下，不强制置顶
	 */
	abstract: string;
	/** 摘要所属最近 h* slug；无标题则为空 */
	abstractSlug?: string;
	/**
	 * 正文 = 其余非标题段落（与摘要互斥）
	 */
	body: string;
	headings?: SearchHeading[];
	bodyParts?: SearchBodyPart[];
	format: string;
	folder: string;
	displayTitle: string;
};

export type SearchScopes = {
	file: boolean;
	title: boolean;
	/** 摘要（与正文分离） */
	abstract: boolean;
	body: boolean;
};

export type SearchFacets = {
	format: string[];
	folder: string[];
};

export type SearchQuery = {
	q: string;
	scopes: SearchScopes;
	facets: SearchFacets;
	limit?: number;
	/**
	 * 模糊搜索（默认 true）
	 * - true：单词汇可前缀/变体宽松命中
	 * - false：每个词汇整段连续匹配（精确分词语义，非 strict）
	 * 空格始终表示多词汇，与是否模糊无关
	 * 大小写由 caseSensitive 单独控制
	 */
	fuzzy?: boolean;
	/**
	 * 多词汇组合（默认 AND）
	 * - AND / &：所有词都要命中
	 * - OR / |：任一命中即可
	 * 完全匹配（strict）开启时忽略
	 */
	combine?: 'AND' | 'OR';
	/**
	 * 完全匹配 / 精确（默认 false）
	 * - true：不拆词，字段须包含整段查询串；模糊与 与/或 均失效
	 * - false：走模糊/分词 + 组合逻辑
	 * 大小写不由本项决定，见 caseSensitive
	 */
	strict?: boolean;
	/**
	 * 是否区分大小写（默认 false = 忽略大小写）
	 * 与精确/模糊正交：精确只要求内容段一致，大小写由本项决定
	 */
	caseSensitive?: boolean;
	/**
	 * 串 / 词（默认 false = 串）
	 * - 串（false）：可出现在任意子串中（cat → category）
	 * - 词（true）：须为独立词边界（主要针对英文等拉丁字母；中文无词界，仍按串匹配）
	 */
	wholeWord?: boolean;
};

export type SearchHeadingHit = {
	html: string;
	href: string;
	depth: number;
	/** 标题 slug，用于与正文归组 */
	slug?: string;
};

/** 段落摘录（摘要或正文，规则相同：挂在所属 h* 下） */
export type SearchProseHit = {
	html: string;
	href: string;
	/** 摘要 vs 正文，供右侧结果筛选 */
	kind: 'abstract' | 'body';
};

/**
 * 按原文结构的一节：有 h* 则先标题再段落；无 h* 则只有段落
 * 摘要 = 文中第一段正文，不单独置顶
 */
export type SearchSection = {
	slug?: string;
	depth?: number;
	/** 有所属标题时展示（标题命中则高亮，否则纯文本） */
	headingHtml?: string;
	headingHref?: string;
	/** 该节标题本身是否检索命中 */
	titleMatched?: boolean;
	/** 该节下命中的摘要/正文摘录（文档顺序） */
	prose: SearchProseHit[];
};

/** @deprecated 使用 SearchProseHit / SearchSection */
export type SearchBodyHit = SearchProseHit & {
	headingHtml?: string;
	depth?: number;
	slug?: string;
};

export type SearchHit = {
	id: string;
	href: string;
	displayTitle: string;
	format: string;
	folder: string;
	match: {
		file: boolean;
		title: boolean;
		abstract: boolean;
		body: boolean;
	};
	pathHtml?: string;
	/** 按 h* 文档顺序的结构块（摘要与正文统一归入） */
	sections: SearchSection[];
	/** 兼容旧字段 */
	headingHits: SearchHeadingHit[];
	abstractHtml?: string;
	abstractHref?: string;
	bodyHits: SearchBodyHit[];
	bodyHtml?: string;
	bodyHref?: string;
	score: number;
};

export type FacetCounts = {
	format: Record<string, number>;
	folder: Record<string, number>;
};

export type SearchIndexFile = {
	version: number;
	engine: string;
	generatedAt: string;
	docs: SearchDoc[];
	facets: FacetCounts;
};

export const DEFAULT_SCOPES: SearchScopes = {
	file: true,
	title: true,
	abstract: true,
	body: true,
};

/** 范围顺序：文件 → 标题 → 摘要 → 正文 */
export const SCOPE_ORDER: (keyof SearchScopes)[] = [
	'file',
	'title',
	'abstract',
	'body',
];

export const SCOPE_LABELS: Record<keyof SearchScopes, string> = {
	file: '文件',
	title: '标题',
	abstract: '摘要',
	body: '正文',
};

export const SCOPE_FIELD_MAP = {
	file: ['file', 'path'] as const,
	title: ['h1', 'h2', 'h3'] as const,
	abstract: ['abstract'] as const,
	body: ['body'] as const,
};

export function withHash(href: string, slug?: string): string {
	const base = String(href || '/').split('#')[0] || '/';
	if (!slug) return base;
	return `${base}#${slug}`;
}

/** 目录自身 + 上级路径（与索引分面一致） */
export function folderAncestors(folder: string): string[] {
	if (!folder || folder === '根目录') return ['根目录'];
	const parts = String(folder).split('/').filter(Boolean);
	const keys: string[] = [];
	for (let i = 1; i <= parts.length; i++) {
		keys.push(parts.slice(0, i).join('/'));
	}
	return keys;
}

/**
 * 勾选的**文件 path**是否包含该文档（content 相对路径）。
 * selected 为空 = 全选；含特殊哨兵由 UI 侧读勾选时处理。
 * 注意：不再按「目录键」匹配——取消父夹时会递归取消子文件勾选，筛选只看文件 path。
 */
export function folderMatchesSelection(
	docFolder: string,
	selected: Iterable<string>,
): boolean {
	// 兼容旧调用：仅当 selected 是目录键集合时用文档 folder
	const set = selected instanceof Set ? selected : new Set(selected);
	if (!set.size) return true;
	const folder = docFolder || '根目录';
	return set.has(folder);
}

/**
 * 文件 path 是否在勾选集合中（搜索主过滤）。
 * selected 为空 = 全选；否则须含 docPath。
 */
export function filePathMatchesSelection(
	docPath: string,
	selected: Iterable<string>,
): boolean {
	const set = selected instanceof Set ? selected : new Set(selected);
	if (!set.size) return true;
	const path = String(docPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
	return set.has(path);
}

/** 目录分面排序：根目录优先，再按路径 */
export function sortFolderEntries(
	entries: [string, number][],
): [string, number][] {
	return [...entries].sort((a, b) => {
		if (a[0] === '根目录') return -1;
		if (b[0] === '根目录') return 1;
		return a[0].localeCompare(b[0], 'zh-CN');
	});
}

/** 展示名：末级目录名；缩进层级 */
export function folderDisplay(folder: string): { depth: number; label: string } {
	if (!folder || folder === '根目录') return { depth: 0, label: '根目录' };
	const parts = folder.split('/').filter(Boolean);
	return {
		depth: Math.max(0, parts.length - 1),
		label: parts[parts.length - 1] || folder,
	};
}

export type FolderTreeNode = {
	path: string;
	label: string;
	/** 本目录直属文件数（当前数量） */
	count: number;
	/** 递归总数（本目录 + 子树；有子文件夹时展示 当前/总数） */
	total: number;
	children: FolderTreeNode[];
};

/** 搜索侧栏：文件+文件夹树节点 */
export type SearchTreeNode = {
	kind: 'dir' | 'file';
	/** 目录：content 相对目录；文件：content 相对 path（含扩展名） */
	path: string;
	label: string;
	/** 目录：本层直属文件数；文件：1 */
	count: number;
	/** 目录：递归可搜索文件数；文件：1 */
	total: number;
	children: SearchTreeNode[];
};

/** 将扁平目录分面建成树（path 为完整目录键；count 为直属文件数） */
export function buildFolderTree(
	entries: [string, number][],
): FolderTreeNode[] {
	const map = new Map<string, FolderTreeNode>();
	const sorted = sortFolderEntries(entries);
	for (const [path, count] of sorted) {
		const { label } = folderDisplay(path);
		map.set(path, { path, label, count, total: count, children: [] });
	}
	const roots: FolderTreeNode[] = [];
	for (const [path, node] of map) {
		if (path === '根目录') {
			roots.push(node);
			continue;
		}
		const parts = path.split('/').filter(Boolean);
		if (parts.length <= 1) {
			roots.push(node);
			continue;
		}
		const parentPath = parts.slice(0, -1).join('/');
		const parent = map.get(parentPath);
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	roots.sort((a, b) => {
		if (a.path === '根目录') return -1;
		if (b.path === '根目录') return 1;
		return a.path.localeCompare(b.path, 'zh-CN');
	});
	// 自底向上：total = 直属 + 子树 total
	const fillTotal = (node: FolderTreeNode): number => {
		let sum = node.count;
		for (const c of node.children) sum += fillTotal(c);
		node.total = sum;
		return sum;
	};
	for (const r of roots) fillTotal(r);
	return roots;
}

function sortSearchTreeKids(kids: SearchTreeNode[]): void {
	// 与主导航默认一致：文件在上，再名序
	kids.sort((a, b) => {
		const ra = a.kind === 'file' ? 0 : 1;
		const rb = b.kind === 'file' ? 0 : 1;
		if (ra !== rb) return ra - rb;
		return a.label.localeCompare(b.label, 'zh-CN', {
			numeric: true,
			sensitivity: 'base',
		});
	});
	for (const k of kids) {
		if (k.kind === 'dir') sortSearchTreeKids(k.children);
	}
}

/**
 * 从可搜索文档列表建「文件+文件夹」树。
 * - 仅含索引内文件；空目录（递归文件数 0）不出现
 * - 根下文件挂在「根目录」节点下（若有）
 */
export function buildSearchFileTree(
	docs: { path: string; file?: string }[],
): SearchTreeNode[] {
	const dirMap = new Map<string, SearchTreeNode>();
	const ensureDir = (dirPath: string): SearchTreeNode => {
		const key = dirPath || '根目录';
		let n = dirMap.get(key);
		if (n) return n;
		const label =
			key === '根目录'
				? '根目录'
				: key.split('/').filter(Boolean).pop() || key;
		n = {
			kind: 'dir',
			path: key,
			label,
			count: 0,
			total: 0,
			children: [],
		};
		dirMap.set(key, n);
		return n;
	};

	// 先保证根
	ensureDir('根目录');

	for (const d of docs) {
		const path = String(d.path || '')
			.replace(/\\/g, '/')
			.replace(/^\/+/, '');
		if (!path) continue;
		const parts = path.split('/').filter(Boolean);
		if (!parts.length) continue;
		const fileName = parts[parts.length - 1]!;
		// 建祖先目录
		let parentKey = '根目录';
		for (let i = 0; i < parts.length - 1; i++) {
			const dirKey = parts.slice(0, i + 1).join('/');
			const parent = ensureDir(parentKey);
			const child = ensureDir(dirKey);
			if (!parent.children.some((c) => c.kind === 'dir' && c.path === dirKey)) {
				parent.children.push(child);
			}
			parentKey = dirKey;
		}
		const parent = ensureDir(parentKey);
		// 避免重复 path
		if (parent.children.some((c) => c.kind === 'file' && c.path === path)) {
			continue;
		}
		parent.children.push({
			kind: 'file',
			path,
			label: d.file || fileName,
			count: 1,
			total: 1,
			children: [],
		});
		parent.count += 1;
	}

	// 自底向上 total；剪掉 total===0 的空目录
	const fillAndPrune = (node: SearchTreeNode): number => {
		if (node.kind === 'file') {
			node.total = 1;
			return 1;
		}
		const kept: SearchTreeNode[] = [];
		let sum = 0;
		let direct = 0;
		for (const c of node.children) {
			const t = fillAndPrune(c);
			if (c.kind === 'file') {
				kept.push(c);
				direct += 1;
				sum += t;
			} else if (t > 0) {
				kept.push(c);
				sum += t;
			}
		}
		node.children = kept;
		node.count = direct;
		node.total = sum;
		return sum;
	};

	const root = dirMap.get('根目录')!;
	fillAndPrune(root);
	sortSearchTreeKids(root.children);

	// 不展示「根目录」节点：直接列出根下文件与一级文件夹
	if (root.total === 0) return [];
	return root.children;
}
