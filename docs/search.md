# 站内搜索（关键字 + 本地向量混合）

> 实现真相：`src/search/*`、`scripts/lib/vector-index.ts`、`scripts/download-vector-models.ts`、`public/models/`、`public/vector-index.json`。  
> 关联：[features.md](./features.md) §7 · [architecture.md](./architecture.md) · [development.md](./development.md) · [deployment.md](./deployment.md)。

---

## 1. 能力概览

| 能力 | 说明 |
|------|------|
| **关键字搜索** | MiniSearch + 中英分词/模糊/精确/与或/大小写/词界；构建期 `search-index.json` |
| **向量搜索** | 浏览器内 **embedding 小模型**（非对话 LLM）；构建期预计算文档向量 `vector-index.json`，查询时对 query 编码后余弦相似度 |
| **混合** | 默认两者合并；结果可标 **关** / **双** / **向**；可按「搜索方式」筛选与排序 |
| **关 / 双 / 向** | **关**=仅关键字；**双**=关键字已中 + 向量候选 + **结果可见区**能染出青绿扩展词（扩展词不能被查询词单独盖住）；**向**=仅向量，且路径/摘要等有可高亮查询或扩展词。纯「分数近」无高亮字面 → 不进列表 |
| **向量高亮** | 琥珀=用户查询词；青绿=`vector-expand` 扩展词（仅双/向写回时）。**已关闭**正文抽词二次 embed 语义高亮（过慢） |
| **方式计数** | 顺序：**双方式 → 关键字 → 向量**。文案 **`(可显示/该类总数)`**：分母=该类文件数；分子=右侧**范围·格式·文件**勾选后仍可显示数（≤分母，随勾选即时刷新） |
| **方式排序** | 结果栏「搜索方式排序」默认勾：列表 **双 → 关 → 向**，组内名序；取消则仅名序 |
| **范围·文件 vs 文件夹** | **文件夹默认关**，其余默认开。**文件**=仅文件名；**文件夹**=目录路径。关文件夹：关键字不搜 `folder`；**目录段不高亮、不参与双/向证据**；body/向量 embed **不含完整 path**。纯向量须有可高亮字面且遵守范围 |
| **开关** | 搜索框前 **向量搜索** 勾选（默认开）；关则仅关键字；纯关键字阶段不染扩展青绿 |
| **部署形态** | 纯静态（Cloudflare Pages 等）；**无**服务端推理 API |

---

## 2. 当前模型与索引

| 项 | 值 |
|----|-----|
| 模型 ID | `Xenova/multilingual-e5-small`（ONNX 量化） |
| 维度 | **384** |
| 索引版本 | `vector-index.json` 字段 `version: 2`（与 `VECTOR_INDEX_VERSION` 一致） |
| 文档前缀 | E5 要求：`passage: …`（构建） |
| 查询前缀 | E5 要求：`query: …`（浏览器） |
| 构建命令 | `npm run vector-index`（或完整 `npm run build`） |
| 模型落盘 | `npm run vector-models` → `public/models/Xenova/multilingual-e5-small/`（约 **113MB** 量化 onnx + tokenizer） |
| 跳过构建 | `WEBMD_VECTOR_SKIP=1` |

**不兼容旧方案：** 旧 `Xenova/bge-small-zh-v1.5`（512 维、`version: 1`）索引会被客户端拒绝，需重建。

---

## 3. 模型从哪里来？（站内 vs 远程）

### 3.1 站内同源（本地 public + 线上 R2）

| 环境 | 模型从哪来 |
|------|------------|
| **本地 dev** | `public/models/`（Git LFS / `npm run vector-models`） |
| **Cloudflare** | **R2 桶** + Pages Function **`/models/*`**（绕过 Pages **25 MiB** 限制） |
| **浏览器** | 仍请求 **同源** `/models/...`；探测 config 成功 → `same-origin /models/` |

构建：`ensure-vector-assets` → 站点写入 dist → **strip >24 MiB**（onnx 不进 Pages）。  
上传 R2：`npm run models:r2-upload`。步骤见 [deployment.md](./deployment.md) §1.0。

### 3.2 回退：远程（仅同源不可用时）

按顺序尝试：

1. **同源** `/models/...`  
2. **hf-mirror.com**（CORS 可能失败）  
3. **huggingface.co**（国内常见 405/超时）

运行时库 `@xenova/transformers` 的 **JS 本体**优先从 **jsDelivr CDN ESM** 加载（规避 Vite 打坏 `onnxruntime-web`）；失败再回退 `node_modules`。

### 3.3 构建期（Node）

`npm run vector-index` 在 **本机 Node** 用同一模型生成 `vector-index.json`。  
构建期模型：**只读 `public/models/`**（与浏览器/R2 同一套文件），`allowRemoteModels=false`，**不再**往 `.cache/transformers` 下载第二份。缺文件时请先 `npm run vector-models`。

---

## 4. 缓存：有没有、多久、如何更新

### 4.1 分层一览

| 资源 | 位置 | 策略 | 更新方式 |
|------|------|------|----------|
| **文档向量索引** `vector-index.json` | HTTP | `_headers`：`max-age=60, SWR=3600`；客户端 `fetch(..., cache: 'no-cache')` | 重新 `vector-index` / `build` 部署；客户端校验 `version`+`model`+`dims`，不兼容则拒绝 |
| **模型权重** `/models/**` | HTTP | `_headers`：`max-age=604800`（7 天）+ `SWR=86400` | 换文件后 **purge** 或改路径/型号；浏览器再拉 |
| **transformers 模型缓存** | 浏览器（`env.useBrowserCache = true`） | Cache API / 浏览器存储，**无固定「N 天过期」**；关站数据/硬清缓存会丢 | 用户清站点数据；或部署新路径迫使 miss |
| **transformers 内存** | 页内 | 单页会话内复用 pipeline | 刷新页面重建 |
| **vector-index 内存** | 页内 | 加载一次解码 base64→Float32 | 刷新页面重拉 JSON |
| **构建期模型** | 只读 `public/models` | 不另存第二份 | 缺则 `vector-models` |

### 4.2 「有更新能否及时替换？」

| 更新对象 | 是否及时 | 说明 |
|----------|----------|------|
| content 后的 **向量索引** | 较及时 | 短 `max-age` + `no-cache` 拉 JSON；`version`/`model` 变了旧文件不可用 |
| **模型权重文件**（同路径覆盖） | 可能最多约 7 天+SWR | 依赖 HTTP 缓存；要立刻全球更新可 **Cloudflare Purge** `/models/*` |
| 用户浏览器 **useBrowserCache** | 不保证立刻换 | 同 URL 可能继续用旧缓存；重大换模建议改 `VECTOR_MODEL_ID` 路径或清缓存指引 |

**实践建议：**

- 换 embedding 模型：改 `vector-shared` → 升 `VECTOR_INDEX_VERSION` → `vector-models` + **`models:r2-upload`** + `vector-index` → git 提交 **`.r2-upload-manifest.json`** → push；必要时 purge `/models/*`。  
- 仅改 content：重建 `vector-index.json` 即可，不必重传 R2 模型。

---

## 5. 为何早期「向量没效果」？旧模型能不能用？

当时主要不是「中文小模型完全不能搜」，而是 **链路故障**：

1. Vite + `onnxruntime-web` → `registerBackend` 崩溃，**浏览器根本没跑 embedding**。  
2. 远程 HF 405 / 镜像 CORS，模型拉不下来。  
3. Vite 中间件把 `.onnx` 当页面 → **404**（已放行 `/models/`、`.onnx`）。

在修复 1–3 后，**旧 `bge-small-zh-v1.5` 技术上也能跑**，但：

- 偏中文，**中英互检索**弱于 e5-small；  
- 维度 512，与当前索引不兼容。  

**当前策略：保留 `multilingual-e5-small`。** 若以后对比旧模型，需独立索引版本与 `public/models` 路径，不可混用同一 `vector-index.json`。

---

## 6. 模块与数据流

```text
构建:
  content → search-index.json（MiniSearch 文档）
         → vector-index.json（e5 passage 向量，跳过图片等噪声）
  public/models/...（本地/构建必填；线上完整权重在 R2）

浏览器:
  打开搜索 → 拉 search-index +（若开向量）vector-index
  勾选向量 → 加载 transformers + e5 量化 → **单次** query 编码
  关键字命中（仅琥珀高亮）∪ 向量候选
  → 双：可见区有扩展青绿才标双；向：可高亮字面 + 分数门槛
  → 方式序 / 名序；路径按范围分段高亮
```

| 路径 | 职责 |
|------|------|
| `src/search/service.ts` | 混合检索、双/向入选规则、路径分段高亮 |
| `src/search/vector.ts` | 索引加载、模型源、**单次** query 向量、相似度与阈值 |
| `src/search/vector-shared.ts` | 模型 ID、版本、E5 前缀、编解码 |
| `src/search/vector-expand.ts` | 中英术语扩展（高亮 / 双·向可解释字面，**不**参与多路 embed 排名） |
| `src/search/ui.ts` | 弹层、筛选、方式计数、方式序、徽标 |
| `src/search/highlight.ts` | 关键字琥珀 + 扩展青绿（`highlightTextWithVectorExpand`） |
| `scripts/lib/search-index.ts` | 关键字索引；body **不**塞完整 path |
| `scripts/lib/vector-index.ts` | Node 建索引；embed 文本不含 path |
| `scripts/download-vector-models.ts` | 下载权重到 public |
| `scripts/upload-models-r2.ts` | 增量上传 R2；写 `.r2-upload-manifest.json` |
| `scripts/strip-pages-oversized.ts` | dist 去掉 >24 MiB（Pages 限制） |
| `functions/models/[[path]].ts` | 线上 `/models/*` → R2 |
| `scripts/ops.ts` / `ops/*` | 一键 dev / r2 / git / ship |

---

## 7. 命令速查

```bash
npm run vector-models   # 下载 e5-small 到 public/models（本地/LFS）
npm run models:r2-upload # 增量上传 R2（哈希未变则 skip；manifest 进 Git）
npm run vector-index    # 重建 vector-index.json
npm run build           # ensure 模型 → SSG → strip >24MiB → vector-index
npm run ops -- help     # 一键 dev / r2 / git / ship / all
```

本地：`public/models` 由 Vite 提供。线上：R2 + Function。Console：`same-origin /models/` + `embedder ready via same`。

---

## 8. Cloudflare 注意

| 项 | 建议 |
|----|------|
| 产物 | `dist` 含 `vector-index.json`；**不含**超 25 MiB 的 onnx（构建 strip）；完整权重在 **R2**，由 Function 同源 `/models/*` 提供 |
| 体积 | onnx ≈113 MB → **R2**；Pages 只托管小文件 |
| 无对话服务端 | embedding 在访客浏览器；首次下模型约 110MB |
| Purge / 换模 | 升路径或 purge `/models/*`；上传后更新并 **git commit** `public/models/.r2-upload-manifest.json` |
| 一键运维 | `ops/`、`npm run ops -- help` → [deployment.md](./deployment.md) §1.0.1、[ops/README.md](../ops/README.md) |

---

## 9. FAQ

**Q: 必须联网吗？**  
A: 若已部署同源 `/models` 且浏览器已缓存，**可离线检索**（需本站静态资源仍可访问）。首次无缓存时要从同源（或回退远程）下载。

**Q: 和 ChatGPT 一样吗？**  
A: 否。只做 **embedding + 相似度**，无生成式对话。

**Q: 拼音？**  
A: 不依赖 embedding；可选后续做拼音索引字段。

**Q: 为啥有的「双」路径上目录不绿？**  
A: 未勾「文件夹」时目录段**禁止**匹配与高亮；双的证据也不能只靠目录名。

**Q: 方式后面的 (a/b) 是什么？**  
A: `b`=该搜索方式下的文件总数；`a`=再经范围/格式/文件筛选后**还能出现在列表里**的数量。

**Q: 向量很慢？**  
A: 首次加载 ~113MB 模型正常；之后每次查询应 **embeds=1**。若对扩展词多次 embed 或正文抽词 embed，属旧逻辑，已去掉。
