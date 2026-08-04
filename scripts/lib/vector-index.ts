/**
 * 本地向量索引构建（Node）— multilingual-e5-small
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SearchDoc, SearchIndexFile } from '../../src/search/types';
import {
	VECTOR_DIMS,
	VECTOR_INDEX_VERSION,
	VECTOR_MODEL_ID,
	e5PassageText,
	float32ToBase64,
	type VectorIndexFile,
	type VectorIndexItem,
} from '../../src/search/vector-shared';

export type { VectorIndexFile, VectorIndexItem };
export { VECTOR_MODEL_ID, VECTOR_INDEX_VERSION, VECTOR_DIMS };

const MAX_EMBED_CHARS = 1800;
const BUILD_BATCH = 8;

/** 仅对有实质正文的文本文档建向量（跳过图片/音视频等噪声） */
function isVectorWorthyDoc(doc: SearchDoc): boolean {
	const fmt = String(doc.format || '');
	if (fmt === '图片' || fmt === '视频' || fmt === '音频' || fmt === 'PDF') {
		return false;
	}
	// 「其他」里压缩包/二进制等：无摘要正文则跳过
	const body = String(doc.body || '').trim();
	const abs = String(doc.abstract || '').trim();
	const h1 = String(doc.h1 || '').trim();
	if (fmt === '其他' && !body && !abs && !h1) return false;
	return true;
}

/**
 * 向量文本：内容字段 only。
 * 不写完整 path/folder，否则搜「编程/数据库」会因目录名语义召回整夹文件，
 * 与左侧「文件夹」范围开关语义冲突（关文件夹仍海量路径相关结果）。
 */
export function docToEmbedText(doc: SearchDoc): string {
	const parts = [
		doc.file,
		doc.h1,
		doc.h2,
		doc.h3,
		doc.abstract,
		doc.body,
	]
		.map((s) => String(s || '').trim())
		.filter(Boolean);
	const text = parts.join('\n').replace(/\s+/g, ' ').trim();
	if (text.length <= MAX_EMBED_CHARS) return text;
	return text.slice(0, MAX_EMBED_CHARS);
}

export async function buildVectorIndexFromSearchDocs(
	docs: SearchDoc[],
	opts?: { cacheDir?: string },
): Promise<VectorIndexFile> {
	const { pipeline, env } = await import('@xenova/transformers');
	if (opts?.cacheDir) env.cacheDir = opts.cacheDir;
	env.allowLocalModels = true;

	console.log(`[vector] loading model ${VECTOR_MODEL_ID} (quantized) …`);
	const extractor = await pipeline('feature-extraction', VECTOR_MODEL_ID, {
		quantized: true,
	});

	const eligible = docs.filter(isVectorWorthyDoc);
	const skipped = docs.length - eligible.length;
	if (skipped > 0) {
		console.log(
			`[vector] skip ${skipped} non-text/empty docs (media etc.)`,
		);
	}

	const items: VectorIndexItem[] = [];
	let dims = 0;
	const total = eligible.length;
	for (let i = 0; i < total; i += BUILD_BATCH) {
		const batch = eligible.slice(i, i + BUILD_BATCH);
		for (const doc of batch) {
			const rawText = docToEmbedText(doc) || doc.path || doc.id;
			// E5：文档必须 passage: 前缀
			const text = e5PassageText(rawText);
			const out = await extractor(text, {
				pooling: 'mean',
				normalize: true,
			});
			const raw = out.data as Float32Array | number[];
			const f32 =
				raw instanceof Float32Array
					? raw
					: Float32Array.from(raw as number[]);
			if (!dims) dims = f32.length;
			const snippet = (doc.abstract || doc.body || doc.h1 || '')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, 160);
			items.push({
				id: doc.id,
				href: doc.href,
				path: doc.path,
				file: doc.file,
				format: doc.format,
				folder: doc.folder,
				displayTitle: doc.displayTitle || doc.path,
				snippet,
				vec: float32ToBase64(f32),
			});
		}
		const done = Math.min(i + BUILD_BATCH, total);
		if (done % 40 === 0 || done === total) {
			console.log(`[vector] embedded ${done}/${total}`);
		}
	}

	if (dims && dims !== VECTOR_DIMS) {
		console.warn(
			`[vector] unexpected dims=${dims}, expected ${VECTOR_DIMS}`,
		);
	}

	return {
		version: VECTOR_INDEX_VERSION,
		model: VECTOR_MODEL_ID,
		dims: dims || VECTOR_DIMS,
		generatedAt: new Date().toISOString(),
		count: items.length,
		items,
	};
}

export function writeVectorIndex(
	index: VectorIndexFile,
	...outPaths: string[]
): void {
	const json = JSON.stringify(index);
	for (const p of outPaths) {
		fs.mkdirSync(path.dirname(p), { recursive: true });
		fs.writeFileSync(p, json, 'utf8');
		console.log(
			`[vector] wrote ${path.relative(process.cwd(), p)} (${index.count} vecs, dims=${index.dims}, model=${index.model})`,
		);
	}
}

export async function buildAndWriteVectorIndex(
	searchIndex: SearchIndexFile,
	publicDir: string,
	distDir?: string,
): Promise<void> {
	if (process.env.WEBMD_VECTOR_SKIP === '1') {
		console.log('[vector] WEBMD_VECTOR_SKIP=1 → skip');
		return;
	}
	const cacheDir = path.join(process.cwd(), '.cache', 'transformers');
	fs.mkdirSync(cacheDir, { recursive: true });
	const index = await buildVectorIndexFromSearchDocs(searchIndex.docs || [], {
		cacheDir,
	});
	const outs = [path.join(publicDir, 'vector-index.json')];
	if (distDir) outs.push(path.join(distDir, 'vector-index.json'));
	writeVectorIndex(index, ...outs);
}
