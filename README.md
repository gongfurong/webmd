# WebMD

个人 **静态 Wiki**：以 `content/` 为真相，GitHub 风 Markdown + 左树 / 右大纲 / 多格式预览 / **关键字 + 本地向量混合搜索**。  
技术栈轻量（Vite + 自研 SSG），**无** Astro/Starlight 运行时；可部署 Cloudflare Pages。

---

## 文档（人 & AI）

完整体系在 **[docs/README.md](./docs/README.md)**：

| 文档 | 用途 |
|------|------|
| [docs/product.md](./docs/product.md) | 产品、目标、原则、边界 |
| [docs/requirements.md](./docs/requirements.md) | 需求与验收 |
| [docs/features.md](./docs/features.md) | 功能行为 |
| [docs/architecture.md](./docs/architecture.md) | 架构与 dist |
| [docs/content-model.md](./docs/content-model.md) | content 分类与 `_Res_*` |
| [docs/development.md](./docs/development.md) | 命令与扩展 |
| [docs/search.md](./docs/search.md) | 混合搜索、模型与缓存 |
| [docs/conventions.md](./docs/conventions.md) | 规范（含 AI 协议） |
| [docs/roadmap.md](./docs/roadmap.md) | 进度 |
| [docs/deployment.md](./docs/deployment.md) | 部署 |

---

## 快速开始

```bash
cd D:\AI\WebMD
npm install
npm run dev       # http://localhost:18087/
npm run build     # 生成 dist/（可先删 dist 再 build）
npm run preview
```

| 命令 | 说明 |
|------|------|
| `dev` | 开发；预览 `/pages/...`，原件 `/content/...` |
| `build` | typecheck + Vite + SSG（含 vector-index，可 `WEBMD_VECTOR_SKIP=1`） |
| `vector-models` | 下载 e5-small 到 `public/models/`（本地 / LFS） |
| `vector-index` | 重建向量索引 |
| `models:r2-upload` | 上传 models → Cloudflare R2（线上 `/models`，绕过 Pages 25 MiB） |
| `search-index` | 重建关键字索引 |
| `scan` | 树 + 可选预生成旁路资源 |
| `typecheck` | TypeScript |

混合搜索说明 → [docs/search.md](./docs/search.md)。

---

## content 分类（摘要）

```text
content/
  knowledge/     # 主题知识（AI、量子、comfyui…）
  notes/         # 短笔记
  media/         # image | video | audio
  samples/       # 格式验收样例
  guides/ reference/ scripts/
  index.md
```

旁路：`_Res_<完整文件名>/`（不进树）。细则 → [content-model.md](./docs/content-model.md)。

---

## dist 分区

```text
dist/
  content/              # content 拷贝
  pages/                # 预览 HTML（路径对齐 content）
  assets/               # JS/CSS
  models/               # 推荐：embedding 权重
  search-index.json
  vector-index.json
  index.html            # 站首页
```

---

## 部署

Build：`npm run build` · Output：`dist` · Node：`22.22.2`  
向量大模型：R2 桶 `webmd-models` + Function `/models/*`（见 `docs/deployment.md` §1.0）；构建会 strip >24 MiB 文件以便 Pages 通过校验。  
→ [docs/deployment.md](./docs/deployment.md)

---

## 仓库

https://github.com/gongfurong/webmd  
