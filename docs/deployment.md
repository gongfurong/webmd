# 部署（Deployment）

> WebMD = **构建期 Node + 运行期纯静态**。

---

## 1. Cloudflare Pages

| 项 | 值 |
|----|-----|
| Framework preset | None / 静态 |
| Build command | `npm run build` |
| Output directory | **`dist`** |
| Node | **`22.22.2`**（`NODE_VERSION` + `.nvmrc`） |

构建机通常**无** LibreOffice / ffmpeg → Word/PPT 预览与视频封面依赖仓库已有 `_Res_*`。  
向量：构建会跑 `vector-index`（可 `WEBMD_VECTOR_SKIP=1`）；**模型文件**若未提交 `public/models`，CI 需执行 **`npm run vector-models`**，否则访客只能回退 HF/镜像（易失败）。

### 1.1 缓存：控制台要不要再设？

**一般不用。** 仓库 `public/_headers` 进 `dist` 后，Pages 会按路径加 `Cache-Control`。  
不必再叠一套互相打架的 Cache Rules，除非你有特殊覆盖需求。

| 操作 | 何时 |
|------|------|
| 确认头 | DevTools → Network → 看 HTML/JS 的 `Cache-Control` |
| **Purge Cache** | 发版后要**立刻**全球最新时（可选；否则等 max-age/SWR） |
| 环境变量 | `CF_PAGES_COMMIT_SHA` 自动注入构建 commit（版本 meta） |

---

## 2. 构建产物

```text
dist/
  index.html / 404.html / _headers
  tree.json / search-index.json / vector-index.json
  models/          # 推荐：e5-small 量化（构建前 npm run vector-models）
  assets/          # JS/CSS
  content/         # 原 content 拷贝（含 _Res_*）
  pages/           # 预览 HTML
```

线上：

- 预览页 → `/pages/...`  
- 原件 → `/content/...`  

---

## 3. 缓存策略（业界分层）

配置在 `public/_headers`（构建进 `dist/_headers`，Cloudflare Pages 生效）。

| 路径 | Cache-Control | 意图 |
|------|----------------|------|
| `/assets/*` | `max-age=31536000, immutable` | 带 hash 的 JS/CSS，可永久缓存 |
| `/pages/*`、站级 HTML | `max-age=60, stale-while-revalidate=86400` | 短新鲜度 + 过期仍可先显示再后台校验 |
| `/content/*` | `max-age=3600, SWR=86400` | 原件中等缓存 |
| `tree.json` / `search-index.json` / `vector-index.json` | `max-age=60, SWR=3600` | 索引常变，勿长缓存 |
| `/models/*` | `max-age=604800, SWR=86400` | embedding 权重大；换模请 purge 或改路径 |

**向量搜索缓存细节**（浏览器 Cache API + 索引版本校验）→ [search.md](./search.md) §4。

**浏览器软导航另有一层「页面内会话缓存」**（`src/client.ts`）：

- 离开页后 HTML 仍在内存保留 **约 10 分钟**（TTL），再进不 loading  
- **SWR**：先用缓存秒开 → 后台用 ETag/正文对比远端 → **仅不同**才更新缓存；若仍停在该页则静默刷新  
- 超时未再访问则卸载；最多约 48 页 LRU  
- 刷新整页 / 新标签会清空（与 HTTP 缓存无关）

---

## 4. 404

多路径静态 HTML，**不是** SPA History 回退到 index。  
缺页使用 `404.html`（按托管商配置）。

---

## 5. 本地验证部署态

```bash
npm run build
npm run preview
```

---

## 6. 版本号（对齐 / 调试，不绑缓存）

| 字段 | 来源 | 用途 |
|------|------|------|
| `package.json` → `version` | 如 `0.2.0` | 产品版本 |
| `commit` 短 hash | git / `CF_PAGES_COMMIT_SHA` | 精确对齐某次构建 |
| 展示 | `0.2.0+a1b2c3d` | 控制台、`window.__WEBMD__`、`<meta name="webmd-version">` |

**不**用版本号做全站缓存失效：页面仍按各自 HTML/ETag/SWR 判断是否更新。

查看：浏览器控制台 `[WebMD] …`，或 `window.__WEBMD__`，或页面源码 meta。

---

## 7. FAQ

| 问题 | 处理 |
|------|------|
| Word 预览空白 | 本机生成并提交 `_Res_*.docx/preview.pdf` |
| 视频无封面 | 本机 ffmpeg 生成 poster 或手塞 |
| 构建 OOM | 关注 plantuml 等大包；已动态加载时再查 CI 内存 |  
