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
| `src/client.ts` | 壳交互总入口（布局、软导航/缓存、路径栏、全屏…） |
| `src/previews/*` | 图示 bind |
| `src/excel-viewer.ts` | 表格 bind（只读文本 + 显示向操作） |
| `src/search/*` | 搜索 |
| `scripts/lib/*` | 扫盘、渲染、shell、prepare、`version.ts` |
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

### 4.1 软导航与缓存（运行期）

```text
点击站内链
  → 会话 HTML 缓存命中？ ──是──► 秒开（无 loading 条）
  │                              └─ 后台 SWR（ETag/正文）不同则静默更新
  └─否─► loading 条（路径栏上）→ fetch HTML（HTTP cache default）
         → 写入会话缓存 → 应用 DOM → bind
```

| 层 | 机制 | 失效 |
|----|------|------|
| HTTP / CDN | `public/_headers` Cache-Control | max-age / SWR / Purge |
| 会话 HTML | 内存 Map，TTL≈10min，≤48 页 | 超时、LRU、整页刷新 |
| 表格文件 | 内存 ArrayBuffer/文本，≤12 | LRU、整页刷新 |
| JS/CSS | Vite content-hash + immutable | 改代码换文件名 |

**版本号**（`scripts/lib/version.ts` + vite `define`）只写入 meta / `window.__WEBMD__`，**不**触发全站缓存清空。

### 4.2 中栏全屏

| 环境 | 实现 |
|------|------|
| 支持 Fullscreen API | `wiki-main.requestFullscreen()` |
| iOS 等 | `body.is-center-pseudo-fs` 固定铺满，藏侧栏/顶栏/**分割线**/收起竖条 |

全屏验收：**只显示中栏**，无左右栏、无 1px gutter、无 edge rail。

### 4.3 宽屏壳布局（grid）

| 项 | 说明 |
|----|------|
| 外层 | `nav \| gutter(1px) \| center`；`center` 内 `main \| gutter(1px) \| toc` |
| 收起左 | 列：`rail-w \| 1px \| 1fr`；edge 竖条绝对贴左 |
| 收起右 | `has-toc-col` 仍为真；`main \| 1px \| rail-w`；edge 竖条贴右 |
| `has-toc-col` | 右栏**能力**（宽屏大纲断点内），**非**「大纲是否展开」 |
| 色 | 侧栏内容 `--bg`；顶/底栏 `--bg-muted`；gutter `--border` |
| 入口 | `src/client.ts` `applyLayout`；样式 `src/style.css` |

### 4.4 表格客户端（摘要）

| 项 | 说明 |
|----|------|
| 加载 | 无表内 loading 文案；错误 `data-xs-err` |
| 重载 | 无 `confirmDiscardIfDirty`；直接 `readWorkbook` + `mountGrid` |
| 尺寸 | `layoutHost` 铺满中栏；侧栏 RO → `sheet.reload` + `fitSheetChrome` |
| 滚动条 | view 扣 `XS_SCROLLBAR_GUTTER`；sheet padding 作右/下槽 |
| 工具栏 | 压 `moreResize` 的 −60 宽；空「更多」隐藏 |

---

## 5. 分类型数据流（摘要）

| 类型 | prepare | shell | bind | 数据源 |
|------|---------|-------|------|--------|
| MD | — | marked | KaTeX/图示 | 源 md |
| 图片/音视频 | poster? | media-stage | 少 | `/content` 原件 |
| PDF | — | pdf 壳 | PDF.js | 原 pdf 或 base64 |
| Office | preview.pdf | pdf 壳 | PDF.js | 预览 pdf；下载原件 |
| 表 | — | sheet-app（类型+复制，状态条 hidden） | excel-viewer `mode:read` + 铺满/滚动条槽 | fetch 原 csv/xlsx |
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
