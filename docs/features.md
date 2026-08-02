# 功能说明（Features）

> **访客可见行为 + 验收清单**。  
> 产品定义 → [product.md](./product.md) · 需求 ID → [requirements.md](./requirements.md) · 实现 → [architecture.md](./architecture.md) · 内容 → [content-model.md](./content-model.md)。  
> 版本 0.2.x。

---

## 1. 产品定位（摘要）

个人 Wiki / **静态**知识站：`content/` 为真相；SSG 出 HTML；GitHub 风阅读 + 多格式预览。详见 product.md。

---

## 2. 整体界面结构

```
┌─────────────────────────────────────────────────────────────┐
│ 顶栏：菜单 · 站名 · 搜索 · GitHub · 主题 · 铺满屏 · 大纲   │
├──────────┬──────────────────────────────────┬───────────────┤
│ 左：文件 │ 中：路径栏 + 正文/预览 + 分页    │ 右：本页大纲  │
│ 树       │                                  │ （可收起）    │
└──────────┴──────────────────────────────────┴───────────────┘
```

| 区域 | 功能要点 |
|------|----------|
| **顶栏** | 窄屏打开文件/大纲抽屉；**站名/主页图标回首页**；搜索；GitHub；明暗；「铺满屏幕宽度」收侧栏 |
| **左栏** | 顶栏「文件」+ 工具；**中间文件树白底**；底栏灰底收起；可拖宽 |
| **中栏** | 路径栏（见 §3.6）+ 正文/预览；底栏上一页/下一页（固定高度、灰底） |
| **右栏** | 顶栏「大纲」；**中间大纲列表白底**；底栏灰底收起；滚动联动高亮 |

### 2.1 窄屏 / 宽屏（视口，不是「手机/PC 设备类型」）

| 视口 | 行为 |
|------|------|
| **宽 ≤640** | 左右均为**上层抽屉** |
| **宽 ≤900 或矮横屏等抽屉断点** | 左右不占 grid 列，抽屉浮层，避免左侧空条 |
| **宽 >900 且非抽屉** | 桌面三栏：文件 | 正文 | 大纲（可拖宽、可收起） |

命名约定：文档与代码优先用**窄屏/宽屏**，不用「手机模式/PC 模式」作为布局主语义。

### 2.1.1 宽屏三栏：分割线与收起竖条

| 状态 | 结构（从左到右） |
|------|------------------|
| **两侧展开** | 文件栏 \| **1px 分割线** \| 中栏 \| **1px 分割线** \| 大纲栏 |
| **侧栏收起** | **全高灰竖条**（顶图标 + 中/底 `>>`/`<<`）\| **1px 线** \| 中栏 \| **1px 线** \| **全高灰竖条** |
| **中栏全屏** | **仅中栏**（原生 Fullscreen 或 `is-center-pseudo-fs`）：无左右栏、无竖条、**无分割线** |

- 分割线（gutter）**归属左右侧**，不占中栏内容区；列宽约 **1px**，拖拽热区由伪元素扩大  
- 收起时仍保留 `has-toc-col`（右栏「能力存在」），避免把线/竖条列清成 0  
- 色板：**顶栏 / 底栏收起钮 / 中栏分页** 用灰底（`--bg-muted`）；**左右中间导航内容** 白底（`--bg`）  

### 2.2 内容宽度：铺满 / 固定居中

| 模式 | 行为 |
|------|------|
| **铺满 (fill)** | 正文/预览**自适应吃满中栏**（默认） |
| **固定居中 (fixed)** | `max-width ≈ 视口 − 左右栏可拖最大宽 − 缝`；中栏更宽时**水平居中** |

- 路径栏「版心」按钮可切换；记忆 `localStorage` key **`webmd-content-width-v2`**  
- **默认 fill**（无用户记忆时）；旧 `webmd-content-width` 不再读取  
- 底部分页栏高度固定，不随版心策略变  
- **表格页（sheet-app）始终吃满中栏**，不受「固定版心」夹窄（收起侧栏后不留右侧空白）  

### 2.3 主题

- 明 / 暗切换，记忆本地  
- Markdown / KaTeX / Mermaid 等随主题适配  

### 2.4 构建版本（调试）

- 标签形如 `0.2.0+&lt;short-sha&gt;`  
- 控制台 `[WebMD] …`、`window.__WEBMD__`、HTML `<meta name="webmd-version">`  
- **不**用于整站缓存失效（见 [deployment.md](./deployment.md) §6）  

---

## 3. 导航与文件树

### 3.1 路径规则

| 内容 | URL |
|------|-----|
| 站级首页 | `/`（`dist/index.html`，非 `content/index.md` 独占） |
| Markdown 预览 | `/pages/` + 去 `.md` 的相对路径，如 `/pages/notes/hello/` |
| 其它文件预览 | `/pages/` + content 相对路径（含扩展名），如 `/pages/samples/office/sample.pdf/` |
| 原始文件直链 | `/content/...`（下载、音视频、src；对应 `dist/content/`） |

### 3.2 文件树工具

| 控件 | 作用 |
|------|------|
| **名序** | 文件名升序 / 降序（中文 locale + numeric） |
| **单开 / 多开** | **默认单开**：同层只展开一个文件夹（手风琴）；多开可同时展开多个。**父子可同时开**（否则进不了深层文件） |
| **混排 / 文上 / 夹上** | 同层是否按类型分组，再名序 |
| 滚到顶/底 | 树滚动 |
| 收起文件栏 | 宽屏收列 / 窄屏关抽屉 |

状态记忆：`localStorage`（`webmd-tree-sort` / `webmd-tree-group` / `webmd-tree-accordion` 等）。

### 3.3 资源目录不进树

以 `_Res_` 为前缀的目录（忽略大小写）**不出现在树与上下页**中，但仍可通过 `/content/` 访问。详见内容规则文档。

### 3.4 上一页 / 下一页

- 顺序与**当前左侧文件树 DOM 顺序**一致（改名序/分组后客户端会重算）  
- 展示：上一页（文件名）/ 下一页（文件名），文件名过长**中间省略**  
- 底栏固定高度；正文宽度可铺满中栏  

### 3.5 软导航

站内文档链接默认**软导航**（替换中栏 / 路径栏 / 大纲 / 分页，左侧树尽量保持状态）：

| 行为 | 说明 |
|------|------|
| **连点** | 只跟最后一次；`AbortController` 中断中间 fetch，无排队闪页 |
| **加载条** | 未命中缓存时：header 下、路径栏上，**仅 2px 进度条、无文字** |
| **会话 HTML 缓存** | 离开后约 **10 min** TTL；最多约 48 页 LRU；再进可秒开、不 loading |
| **SWR** | 先展示缓存 → 后台 ETag/正文对比 → **仅不同**才更新；若仍在该页则静默刷新 |
| **预取** | 悬停/触摸文件树或分页链接时预拉 HTML；表格链接触发引擎预热 |
| **HTTP** | 软导航 `fetch` 用 `cache: 'default'`；线上 `_headers` 见 deployment |

整页刷新 / 新标签会清空会话缓存（与 CDN 无关）。

### 3.6 路径栏（中栏顶）

| 控件 | 行为 |
|------|------|
| **根目录图标**（磁盘） | **不进主页**；展开文件栏并滚到树顶 |
| **目录段** | 点击 → 左侧树展开并滚到对应文件夹（不高亮导航页） |
| **文件名** | 点击 → 树定位到当前文件 |
| **info** | 打开**文件信息**弹层（大小·格式一行；可读/转义 URL；三复制按钮一排） |
| **版心** | 铺满 / 固定居中切换 |
| **中栏全屏** | 桌面：Fullscreen API；**手机**：CSS 伪全屏（iOS 不支持任意元素全屏） |
| **下载** | 全类型可用；PC/手机分流见 §6 |
| **滚顶/底** | 中栏滚动 |

文件信息弹层：点**内部**不关；**关闭按钮**或**弹层外**关闭；路径尽量按屏宽**一行**显示。

**回首页**：仅顶栏站名/主页图标（或直接打开 `/`）。

---

## 4. Markdown 与文内增强

### 4.1 基础渲染

- GFM 风格：标题、列表、任务列表、表格、删除线、链接、图片等  
- 标题锚点 id（大纲可跳转）  
- 原始 HTML 经消毒后可用（含允许的 `video` / `audio` / `source` 等）  

### 4.2 代码块

- 语法高亮（highlight.js，GitHub 系样式）  
- **类型栏**（语言标签）+ **复制**按钮（与表格 CSV 复制同系 UI）  
- **出现规则**（全站统一，见 [preview-framework.md §1.1](./preview-framework.md)）：能复制出「方便阅读、可另存为对应格式文件」的文本 → 一般要类型栏+复制；主类型可带副类型（如 `Mermaid · STATE`）；图/PDF 等不以块内复制源文件文本为主 → 不套此栏，走路径栏下载  

### 4.3 数学公式

- KaTeX 自动渲染（文内公式）  

### 4.4 图表（文内）

| 能力 | 支持 |
|------|------|
| **diagram 族 · Mermaid** | ✅ 文内 ` ```mermaid ` / `.mmd`；类型栏+内容区；样例 `samples/diagrams/mermaid*` |
| **diagram 族 · PlantUML** | ✅ 文内 ` ```plantuml ` / `.puml`；`@plantuml/core`；样例 `samples/diagrams/plantuml*` |
| **diagram 族 · Graphviz** | ✅ 文内 ` ```dot ` / `.dot` `.gv`；`@hpcc-js/wasm-graphviz`；样例 `samples/diagrams/graphviz*` |
| **diagram 族 · 画布/导图文件** | 源可下载；有旁路导出图则预览：draw.io·Excalidraw→**SVG**，XMind·mm→**PNG**（`diagram-export-preview.ts`）；**不上**全量 viewer |
| 独立 `.drawio` / `.excalidraw` / `.xmind` / `.mm` | `_Res_*/preview.svg|png` 或同主名旁路；样例 `samples/diagrams/{drawio,excalidraw,mindmap}/` |

### 4.5 文内媒体

- 图片、`<video>`、`<audio>` 可写在 Markdown 中  
- **固定模式**下「单独成行」的图/视频可水平居中（`is-media-line`）  
- 显式 class 优先，例如：  
  - `media-sm`：小号 + 左对齐  
  - `media-size-sm`：仅缩小，固定模式下仍可居中  
- 文内 `/content/...` 视频：有 `_Res_*` 封面文件则自动 `poster`  

---

## 5. 按文件类型：预览与下载

### 5.1 总表

| 类型 | 扩展名（主要） | 站内预览 | 下载 |
|------|----------------|----------|------|
| Markdown | `.md` `.mdx` | 全文渲染 | 原文件 |
| 纯文本/代码 | `.txt` `.json` `.py` `.ts` … | 源码 + 类型栏/复制 | 原文件 |
| **CSV** | `.csv` | SheetJS + x-spreadsheet | 原文件 |
| **Excel** | `.xlsx` `.xls` `.ods` | SheetJS + x-spreadsheet（多 sheet 底栏） | 原 xlsx |
| **PDF** | `.pdf` | **PDF.js** 阅读器 | 原 PDF |
| **Word** | `.docx` `.doc` 等 | 有 LibreOffice 预生成 `preview.pdf` 时用 PDF.js | **原 Office** |
| **PPT** | `.pptx` `.ppt` 等 | 同上 | **原 Office** |
| 图片 | `.png` `.jpg` `.svg` … | 全页舞台居中 | 原文件 |
| 视频 | `.mp4` `.webm` … | 全页播放器 + 可选 poster | 原文件 |
| 音频 | `.mp3` `.wav` … | 全页播放器 | 原文件 |
| Mermaid / PlantUML / Graphviz | 文内 fence 或 `.mmd` `.puml` `.dot`… | 客户端引擎 · 类型栏+内容区 | 源文件 / 复制 DSL |
| draw.io / Excalidraw / xmind / mm | 见上 | 有 `_Res_*/preview.*` 则当图；否则下载卡 | 源文件 |
| 其它（zip/7z/rar…） | 多种 | **统一下载卡** | 原文件 |

路径栏下载图标对**所有**文件页可用；另见 §6（**PC 原生下载 / 手机 Share**）。

**URL**：预览 `/pages/` + content 相对路径（md 去扩展名）；原件 `/content/...`。  
**dist**：`content/` · `pages/` · `assets/` · 站级 html/json/`_headers`（可整删重建）。

### 5.2 表格（CSV / Excel：SheetJS + x-spreadsheet）

原生 **CSV** 与 **Excel** 统一：

| 项 | 说明 |
|----|------|
| **类型栏** | 与代码块一致：类型名（`CSV` / `XLSX`…）+ **复制 CSV**（无旁注、无密度 UI） |
| **数据** | 浏览器 **fetch 原文件**；`cache: default` + **内存文件缓存**（再开加速） |
| **多 sheet** | 底栏 sheet 名 +「…」**贴左**；可**切换**已有表；**禁止**添加 / 删除 / 重命名表 |
| **文本** | **`mode: read`**：不可改单元格文字（防手机误弹键盘）；隐藏选区 hide-input 焦点 |
| **加载反馈** | **不**在表内显示「加载引擎/解析/渲染」文案；依赖顶栏 soft-nav 进度条；错误仍走 `data-xs-err` |
| **重载** | 工具栏「重载」**直接执行**，无二次确认；丢弃会话内列宽/缩放等显示调整 |
| **显示操作** | 可拖列宽/行高；工具栏最左：重载 · 全选 · 自动列宽 · 行高 · 缩放（数字，≥16px 防 iOS 整页放大） |
| **库工具栏** | 与自定义条同一行；**强制 100% 宽**（压过库 `widthFn()-60` 右上白洞）；装不下进「更多 …」；无溢出则隐藏「…」 |
| **滚动条** | 格子与横/纵条**分区不重叠**：右/下预留 gutter；侧栏开合走 `sheet.reload` 完整重算尺寸 |
| **宽度** | 表格宿主始终按中栏实际宽度铺满（含「固定版心」偏好下） |
| **全屏** | 路径栏中栏全屏（含手机伪全屏）；全屏时无左右栏/分割线 |
| **不写源** | 永不写回 content |

- shell：`scripts/lib/spreadsheet-preview.ts`（状态条默认 `hidden`）  
- bind：`src/excel-viewer.ts`  
- 详见 [preview-framework.md](./preview-framework.md) / [architecture.md](./architecture.md)

### 5.3 PDF

- **PDF.js** 自研壳：分页缩略图、上一页/下一页、页码、缩放、适应宽度、下载  
- 宽屏默认开缩略图侧栏；窄屏默认关，工具栏按钮打开  
- 构建/渲染可嵌入 base64 或 fetch `/content/`（Range 友好）  
- 手机下载：见 §6（不单靠 `a[download]`）  

### 5.4 Word / PowerPoint

- **有 LibreOffice** 时：制作站点生成 `_Res_<完整文件名>/preview.pdf`  
- 页面用 PDF.js 看预览；**下载始终为 docx/pptx 原件**  
- **无 LibreOffice** 或尚无 preview：统一下载卡  
- 已有有效 preview **不覆盖**（重转需先删）  

### 5.5 图片 / 音视频

- 全页 `media-stage`：纵横居中；文件页中栏零内边距贴齐  
- 视频：开发服 `/content/` 支持 **HTTP Range（206）** 才能正常播与出元数据  
- 封面：`_Res_<完整视频文件名>/poster.jpg`（ffmpeg 制作站点时可选生成）  

### 5.7 无法预览的统一卡

角标扩展名、类型名、文件名、大小、说明、**下载文件**、**打开原文件**；样式居中。  
压缩包、独立 UML/导图文件、缺预览资源的 Office 等共用此卡。

---

## 6. 下载（桌面与手机分开）

| 入口 | 说明 |
|------|------|
| 路径栏 ↓ | 当前页对应 `file.url`（`/content/...`） |
| PDF 工具栏「下载」 | PDF 页下载 PDF；Office 预览页下载**原 Office** |
| 下载卡按钮 | 同上原件 |

客户端用 `isMobileClient()` 区分平台（`navigator.userAgentData.mobile`，否则 UA / iPad 触控启发式）：

| 平台 | 行为 |
|------|------|
| **PC / 桌面** | **不拦截**同源 `a[download]`，浏览器原生直接下载；仅 `blob:` 链才用 Blob 锚点强制保存 |
| **手机**（iOS/Android 等） | 拦截点击 → `fetch` → Blob → 优先 **Web Share 带文件**（存储到文件/分享）→ 否则 Blob `a[download]` → 失败再 `?dl=1` 打开 |

桌面不再走 Web Share，避免 Windows 等也弹出分享面板、影响正常下载。

---

## 7. 搜索

- 客户端 **MiniSearch** + 构建/开发提供的 `search-index.json`  
- 支持目录树筛选、结果高亮等（实现见 `src/search/*`）  
- `site.features.search` 可关  

---

## 8. 路径栏与其它 UX

| 能力 | 说明 |
|------|------|
| 路径中间省略 | 过长路径/分页名中间 `…` |
| URL 弹层 | 可读 URL / 转义 URL / 相对路径复制 |
| 文件信息芯片 | 类型、大小等 |
| 固定/铺满切换 | 尽量保持阅读位置（锚点策略） |
| 焦点阅读等 | 见客户端绑定（若启用） |

---

## 9. 制作站点时的自动资源（与功能相关）

| 任务 | 工具 | 产出 |
|------|------|------|
| 扫盘树 | Node | `public/tree.json`（gitignore） |
| 视频封面 | 可选 **ffmpeg** | `_Res_<视频全名>/poster.jpg` |
| Word/PPT→PDF | 可选 **LibreOffice** | `_Res_<文件全名>/preview.pdf` |

访客与 Cloudflare **不需要**安装 ffmpeg / LibreOffice；CI 无 LO 时 Word/PPT 仅在有已提交 preview 时能预览。

---

## 10. 明确不支持 / 边界

| 项 | 说明 |
|----|------|
| 浏览器原生打开 docx/xlsx/pptx | 不依赖；无标准 API |
| 一个 CSV 内多个 sheet | 标准 CSV 无 sheet；请用多文件或 xlsx |
| Excel→PDF 作主预览 | 已放弃；表格感差，改 SheetJS + 网格 UI |
| 独立 PlantUML/XMind 等渲染 | 未做；下载或 Mermaid 文内图 |
| 写回源 xlsx/csv | 未做；仅会话内编辑 |
| 在线协同 Office | 未做（需 OnlyOffice 等） |
| 服务端运行时转码 | 无；仅构建机预生成 |

---

## 11. 配置开关（功能级）

`site.config.ts` → `features`：

| 开关 | 作用 |
|------|------|
| `toc` | 本页大纲 |
| `codeCopy` | 代码块类型栏复制 |
| `search` | 站内搜索 |

布局数值见 `config/layout.ts`（栏宽、断点等）。

---

## 12. 相关文档

| 文档 | 内容 |
|------|------|
| [README.md](./README.md) | 文档地图 |
| [architecture.md](./architecture.md) | 架构、技术栈、管线 |
| [content-model.md](./content-model.md) | content / `_Res_*` |
| [formats.md](./formats.md) | 格式状态总表 |
| [deployment.md](./deployment.md) | 部署 |
| 根目录 [README.md](../README.md) | 快速开始 |
