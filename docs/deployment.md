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

### 1.0 向量模型：Pages + R2（官方大文件路径）

Pages **单文件 ≤ 25 MiB**（[Limits](https://developers.cloudflare.com/pages/platform/limits/)），e5-small 量化 ≈113 MiB **不能**进 `dist`。

| 层级 | 作用 |
|------|------|
| **Pages `dist`** | 站点 + `vector-index.json` + 小资源；构建末 **strip >24 MiB** |
| **R2 桶 `webmd-models`** | 完整 `public/models/**`（含 onnx） |
| **Pages Function** `functions/models/[[path]].ts` | 同源 **`/models/*` → R2**（binding 名 **`MODELS`**） |
| **本地 dev** | 仍读 `public/models`（不经过 Function） |

**一次性配置（Cloudflare 控制台 + 本机）：**

1. 开通 R2（[定价/免费额度](https://developers.cloudflare.com/r2/pricing/)：存储 10 GB-month 等免费档；超额才计费；Egress 官方写 Free）。  
2. 创建桶：`npm run models:r2-create-bucket` 或控制台建 **`webmd-models`**。  
3. 登录：`npx wrangler login`  
4. 上传模型：`npm run vector-models`（若本地没有）→ **`npm run models:r2-upload`**  
5. Pages 项目 **Settings → Bindings → R2**：  
   - Variable name: **`MODELS`**  
   - R2 bucket: **`webmd-models`**  
   （仓库 `wrangler.toml` 已声明同名绑定，Git 集成时请与控制台一致。）  
6. 重新部署 Pages（push 或 Retry deployment）。  
7. 验收：`https://你的域名/models/Xenova/multilingual-e5-small/config.json` → **200**；搜索 Console：`same-origin /models/`。

**换模保证最新：** 优先换路径/版本（如新型号目录）+ 短缓存 `config.json`（Function 内 60s）；同名覆盖后可 **Purge** `/models/*`。大 onnx 默认长缓存（7 天 SWR）。

### 1.0.1 一键脚本（不经 AI）

见仓库 **`ops/README.md`** 与 `npm run ops -- help`。

| 场景 | 命令 / 双击 |
|------|-------------|
| 本地 dev | `npm run ops:dev` · `ops/01-local-dev.*` |
| **增量**上传 R2（推荐） | `npm run ops:r2` · `ops/02-r2-upload.*` |
| 强制全量 R2 | `npm run ops:r2:force`（少用） |
| git 提交推送 | `npm run ops:git -- -m "说明"` |
| R2+git | `npm run ops:ship -- -m "说明"` |
| build+R2+git | `npm run ops:all -- -m "说明"` |

**R2 去重：** `public/models/.r2-upload-manifest.json`（**进 Git**）：记录各文件 size/sha256；未变则 **不 put**。Cloudflare **不会**自动忽略相同文件。Git 与 R2 **分开**；`ship` 只是脚本顺序执行。

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
