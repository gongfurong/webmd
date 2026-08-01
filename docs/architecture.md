# 架构（Architecture）

> 与 [product.md](./product.md)、[development.md](./development.md)、[preview-framework.md](./preview-framework.md) 配套。

---

## 1. 总览

```text
 content/ (真相)
     │
     ├─ scan（树，跳过 _Res_*）
     ├─ prepare（可选：poster / preview.pdf → _Res_*）
     │
     ▼
 ┌─────────────────────────────────────┐
 │  dev: Vite 中间件 renderFilePage    │
 │  build: Vite assets + SSG pages/*   │
 │         + cp → dist/content         │
 └─────────────────────────────────────┘
     │
     ▼
 dist/  ──静态托管──►  浏览器 client（交互/PDF/表/图示/搜索）
```

| 原则 | 含义 |
|------|------|
| 内容与壳分离 | content vs src/scripts |
| 类型方案独立 | prepare/shell/bind/style |
| 构建期嵌正文 | SSG HTML 含主体 |
| 运行期纯静态 | 无 Node 业务进程 |
| dev ≈ prod 语义 | 共用 render-page |

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 严格模式 |
| Dev/打包 | Vite 6 |
| SSG | `scripts/build-site.ts` |
| MD | marked + DOMPurify + hljs + github-markdown-css |
| 公式 | KaTeX |
| 图示 | mermaid · @plantuml/core · @hpcc-js/wasm-graphviz |
| PDF | pdfjs-dist |
| 表格 | xlsx + x-data-spreadsheet |
| 搜索 | minisearch |
| 可选本机 | ffmpeg · LibreOffice |

---

## 3. 仓库与 dist 目录

### 3.1 源码

| 路径 | 职责 |
|------|------|
| `content/` | 用户内容真相 |
| `src/client.ts` | 壳交互总入口 |
| `src/previews/*` | 图示 bind |
| `src/excel-viewer.ts` | 表格 bind |
| `src/search/*` | 搜索 |
| `scripts/lib/*` | 扫盘、渲染、shell、prepare |
| `config/*` · `site.config.ts` | 配置 |
| `docs/` | 项目元文档 |

### 3.2 dist（可整删重建）

```text
dist/
  content/     # = content 拷贝（含 _Res_*）
  pages/       # 预览 HTML，路径对齐 content
  assets/      # JS/CSS
  index.html   # /
  404.html
  tree.json
  search-index.json
  _headers
```

| URL | 磁盘 |
|-----|------|
| `/pages/notes/hello/` | `dist/pages/notes/hello/index.html` |
| `/content/notes/hello.md` | `dist/content/notes/hello.md` |

**不是**单壳 SPA：每个可导航文件一份 HTML（SSG）。  
**单壳对比**见 §6。

---

## 4. 端到端管线

1. `scanContent` → 树 + 扁平文件列表  
2. `prepareAllVideoPosters` / `prepareAllOfficePreviews`（可选工具）  
3. **dev**：请求 → `matchFileByUrl` → `renderFilePage`  
4. **build**：Vite 打 client → 对每个文件 `pageOutDir` 写 `index.html` → `cp content → dist/content`  
5. 写 tree / search-index / 404  

客户端：软导航替换中栏 → 再 bind PDF/表/图示/复制等。

---

## 5. 分类型数据流（摘要）

| 类型 | prepare | shell | bind | 数据源 |
|------|---------|-------|------|--------|
| MD | — | marked | KaTeX/图示 | 源 md |
| 图片/音视频 | poster? | media-stage | 少 | `/content` 原件 |
| PDF | — | pdf 壳 | PDF.js | 原 pdf 或 base64 |
| Office | preview.pdf | pdf 壳 | PDF.js | 预览 pdf；下载原件 |
| 表 | — | sheet-app | excel-viewer | fetch 原 csv/xlsx |
| Mermaid 等 | — | webmd-diagram | previews/* | DSL 属性 |
| 画布源 | 作者导出 | 同图片 | — | `_Res_*/preview.*` |
| 其它 | — | 下载卡 | — | 原件下载 |

详情：[preview-framework.md](./preview-framework.md)、[formats.md](./formats.md)。

---

## 6. 架构取舍：多页 SSG vs 单壳 SPA

| 维度 | **当前：多页 SSG** | **单壳 SPA** |
|------|-------------------|--------------|
| dist | pages 下多 html + content | 少 html + content |
| 实现 | 已落地 | 需重做路由/首屏 |
| 直链/刷新 | 天然 | 要 fallback |
| SEO/分享 | 较好 | 较弱 |
| 与 content 对照 | pages 路径对齐，优 | 目录更扁 |
| 维护 | 类型适配器清晰 | 客户端状态更重 |
| 性能 | 首屏有正文 HTML | 依赖 JS 路由 |

**现行选择 SSG**；组织用 `pages/` 解决根目录散乱，**不强制**改单壳。

---

## 7. 安全边界

- HTML 消毒（DOMPurify）  
- 图示 `securityLevel` 严格（Mermaid）  
- 无用户上传后端  
- 下载仅同源处理  

---

## 8. 相关

- 开发命令 → [development.md](./development.md)  
- 内容模型 → [content-model.md](./content-model.md)  
- 部署 → [deployment.md](./deployment.md)  
