# 文件预览框架：类型方案独立

> **设计原则（必须遵守）**  
> **每一种文件类型的预览/下载方案，逻辑必须独立成套，不得与其它类型混写在同一大坨流程里。**  
> 壳层只做「识别 kind → 选策略 → 装配」，不做具体业务细节。

本文约定 **预览框架** 的分层、每类型包应包含什么、现状映射，以及新增类型时的清单。  
功能表现见 [features.md](./features.md)；格式总表见 [formats.md](./formats.md)；总架构见 [architecture.md](./architecture.md)；文档地图见 [README.md](./README.md)。

---

## 1. 为什么要独立

| 混在一起的问题 | 独立后的收益 |
|----------------|--------------|
| Excel / PDF / 视频改一处容易误伤其它类型 | 改 Excel 只动 Excel 包 |
| `client.ts` / `style.css` 无限膨胀、滚动条与宽高互相抢 | 每类型 CSS / 绑定隔离 |
| 方案切换（如 Excel 从 CSV 表改为 SheetJS+网格）牵一发而动全身 | 只换该类型 `prepare` / `shell` / `bind` |
| 新人无法判断「PDF 逻辑在哪」 | 目录与命名即地图 |

**一句话**：框架像插座；**每种类型是一块可插拔适配器**，不是一根搅在一起的电线。

---

## 1.1 类型栏 + 复制（产品标准）

> 与「能不能预览」正交：能预览的图/PDF 也可以**没有**块内类型栏；有文本源的嵌入块一般**要有**。

### 何时出现「类型栏 + 复制」

**出现条件（主规则）**：  
预览背后能 **复制出一段方便阅读的文本**，且这段文本足以 **另存为对应格式的文件**（或等价源：`.py` / `.csv` / `.mmd` / Mermaid DSL 等）→ **一般就需要类型栏 + 复制**。

| 维度 | 约定 |
|------|------|
| **类型主文案** | 格式 / 引擎族：`Python`、`XLSX`、`Mermaid`、`CSV`… |
| **副类型 / 子类型** | **允许**，用 ` · ` 连接：如 `Mermaid · STATE`、`Mermaid · FLOW`（图种、方言，**不是**另一种站点 kind） |
| **复制内容** | 默认 = 上述「可建文件的文本」：代码→源码；表→CSV；Mermaid→DSL；**不是** SVG/截图像素 |
| **不要块内类型栏+复制** | 主要交付是二进制/版式/媒体（图、PDF、音视频），或无法预览的下载卡；完整原件走 **路径栏下载** |
| **路径栏** | 全站另有：下载原文件、复制 URL/路径 —— 与块内复制互补，不互相替代 |

### 对照（现状）

| 预览 | 类型栏+复制 | 复制物（可建文件） |
|------|-------------|-------------------|
| 代码块 / 源码页 | ✅ | 源文件文本 |
| CSV / Excel | ✅ 类型名 + 复制（无旁注） | 当前表 CSV |
| Mermaid（文内 / `.mmd`） | ✅ 主类型 + 可选图种子类型 | Mermaid DSL |
| 图片 / 音视频 | ❌ | —（下载原件） |
| PDF / Office→PDF | ❌ 块内；有 PDF 工具条 | —（下载原件） |
| 仅下载卡 | ❌ | —（下载原件） |

新增「文本 DSL / 可导出文本」类适配器时：默认套 `.webmd-code` 系类型栏，复制键绑定**可建文件的那份文本**。

---

## 2. 框架总览

```
content/ 文件
    │
    ▼
┌───────────────────┐
│  识别 kind / 扩展名 │  scan.ts（统一、只做分类）
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  策略注册表         │  「这个 kind 用哪一套 TypeAdapter」
│  (目标：显式 map)   │
└─────────┬─────────┘
          │
     ┌────┴────┬────────────┬────────────┐
     ▼         ▼            ▼            ▼
  Markdown   PDF         Excel        Video …
  Adapter    Adapter     Adapter      Adapter
     │         │            │            │
     │    各自完整的四段（见下）            │
     └─────────┬────────────┴────────────┘
               ▼
┌───────────────────┐
│  页面装配 render   │  只调 adapter.shell / bodyClass
│  + 全局壳 template │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  客户端 client     │  只调 adapter.bind（按 DOM 钩子）
└───────────────────┘
```

### 2.1 每个类型适配器（Type Adapter）的四段

| 段 | 时机 | 职责 | 禁止 |
|----|------|------|------|
| **A. prepare** | scan / 制作站点 | 可选：生成 `_Res_*` 旁路（封面、preview.pdf、CSV…） | 不写其它类型的资源；不碰全局 UI |
| **B. shell** | SSG / dev 渲染 HTML | 输出该类型专用 DOM 壳（含 `data-*` 钩子） | 不在 shell 里写死其它类型的控件 |
| **C. bind** | 浏览器 | 只绑定本类型钩子；加载本类型库 | 不在 bind 里解析 PDF+Excel+视频混用状态机 |
| **D. style** | CSS | 本类型布局/滚动/工具条 | 不用「全局表格样式」同时服务 CSV 与 xlsx 若语义不同 |

另外可选：

| 段 | 说明 |
|----|------|
| **E. download** | 原文件强制下载 / 分享（可与全局下载工具共用**工具函数**，策略仍归本类型） |
| **F. bodyClass** | 如 `is-pdf-page` / `is-xlsx-page`，供布局高度链使用 |

### 2.2 全局层只允许做什么

| 允许 | 不允许 |
|------|--------|
| kind 识别、URL、树、面包屑、大纲（MD） | 在 `render-page` 内联一整段 Excel 网格算法 |
| 调用 `prepareAll*` 列表 | 一个 `prepareEverything` 里 if/else 写死转换细节 |
| 模板顶栏、主题、搜索壳 | 把 PDF.js worker 初始化塞进 Excel 模块 |
| 共用：escapeHtml、res-dir 命名、Blob 下载 helper | 共用「一个大 Viewer 类」内部 switch(kind) 上千行 |

---

## 3. 逻辑边界图（数据流）

```
                  ┌─ prepare（可选本机工具）
                  │     ffmpeg / LibreOffice / SheetJS 写盘
                  │
  scan ───────────┼─ tree.json（导航）
                  │
                  └─ 不修改 content 真相文件本身

  render-page ──► TypeAdapter.shell(file) ──► HTML 片段
                      │
                      ├─ Markdown：HTML 正文
                      ├─ PDF：pdf-shell + base64/script
                      ├─ Excel：xlsx-app + data-xlsx-src
                      └─ 未知：unsupported 下载卡

  client ────────► query [data-pdf-*] / [data-xlsx-viewer] / …
                      各 bind 独立，互不 import 对方业务
```

---

## 4. 现状映射（已部分独立 / 仍待拆）

> 原则已定；**物理目录可逐步对齐**。新增或重做某类型时，必须按适配器四段落地，禁止再往 `client.ts` 塞巨型类型逻辑。

### 4.1 类型 → 方案 → 模块（当前）

| 类型族 | 方案摘要 | prepare | shell | bind | 备注 |
|--------|----------|---------|-------|------|------|
| **Markdown** | marked + 消毒 + 文内增强 | — | `markdown.ts` | KaTeX/媒体行（client）；**Mermaid → `src/previews/mermaid.ts`** | 站内主格式 |
| **图示族 · Mermaid** | 文内 DSL + `.mmd` → 栏+内容区 → SVG | — | `mermaid-preview.ts` | **`src/previews/mermaid.ts`** | [diagrams.md](./diagrams.md) P1 |
| **图示族 · PlantUML** | 文内 + `.puml` → 同壳 → `@plantuml/core` | — | `plantuml-preview.ts` | **`src/previews/plantuml.ts`** | 客户端 TeaVM，无公网 |
| **图示族 · Graphviz** | 文内 + `.dot` → 同壳 → WASM | — | `graphviz-preview.ts` | **`src/previews/graphviz.ts`** | `@hpcc-js/wasm-graphviz` |
| **PDF** | PDF.js 自研阅读器壳 | —（原文件） | `markdown.renderPdfViewerShell` | `client.bindPdfEmbeds` | 宜拆 `src/previews/pdf/` |
| **Word/PPT** | LO → `preview.pdf` → **复用 PDF 适配器** | `office-preview.ts` | 同 PDF shell | 同 PDF bind | Office 只负责 prepare；预览走 PDF |
| **Excel (.xlsx 等)** | **SheetJS + x-data-spreadsheet**（整表内存；Canvas 内滚/多 sheet） | **无**（不预生成） | `renderExcelSheetApp` | **`src/excel-viewer.ts`** | 与 CSV 同一引擎；会话可编辑不写源 |
| **CSV** | 同上（`XLSX.read` type string） | — | `renderCsvDocumentHtml` → `renderSheetApp` | 同上 | fetch 原 `.csv` |
| **图片** | `<img>` / 灯箱类行为 | — | markdown / 文件页 | client 媒体相关 | |
| **视频** | `<video>` + poster | `video-poster.ts` | 文件页媒体壳 | client | prepare 独立 |
| **音频** | `<audio>` | — | 文件页媒体壳 | client | |
| **源码/文本** | 高亮 + 代码栏 | — | markdown 代码路径 | — | |
| **画布/导图源** | drawio/excalidraw/xmind/mm | 作者导出图 | `diagram-export-preview.ts` | 当图片页 | 无 preview 则下载卡 |
| **二进制/未知** | 仅下载卡 | — | `renderUnsupportedFileCard` | — | 无假预览 |

### 4.2 目标目录（重构时对齐，非强制一次搬完）

```
scripts/lib/previews/          # 构建期 + shell（Node）
  markdown/
  pdf/
  office/          # 仅 LO→PDF prepare
  spreadsheet/     # csv shell + excel shell + 可选 csv prepare
  media/           # image/video/audio shell 辅助
  binary/

src/previews/                  # 浏览器 bind + 类型私有样式入口
  pdf/
  excel/           # 现 excel-viewer.ts 迁入
  media/
  markdown/        # mermaid/katex 也可归此

src/style/previews/            # 或 style.css 内按段落严格分区
  pdf.css
  excel.css
  …
```

**注册表（目标）**伪代码：

```ts
// scripts/lib/previews/registry.ts
export const previewAdapters = {
  pdf: pdfAdapter,
  xlsx: excelAdapter,
  docx: officeViaPdfAdapter, // prepare 自己的，shell/bind 委托 pdf
  …
};
```

### 4.3 已落实的「独立」样例：CSV / Excel（定稿）

| 段 | 位置 |
|----|------|
| shell | `scripts/lib/spreadsheet-preview.ts` → `renderSheetApp` |
| bind | **`src/excel-viewer.ts`**（SheetJS + x-data-spreadsheet UMD） |
| style | `style.css`：`body.is-sheet-app-page` / `.xs-host` / `.xs-*` |
| bodyClass | `is-sheet-app-page is-xs-page`（软导航须列入 PAGE_STATE，防粘住 `overflow:hidden`） |
| 与 PDF | **无**共享网格；下载走路径栏通用下载 |

**主路径（dev / build 一致）**：

```
content/*.csv|xlsx  ──SSG──►  HTML 壳 data-sheet-app + data-file-url
                              │
浏览器 bindExcelViewers  ◄────┘
  fetch(fileUrl) → XLSX.read → stox(密度) → x_spreadsheet.loadData
  滚动/多 sheet/冻结：引擎内部；中栏不滚
```

**我们相对上游库的定制（WebMD）**：

| 能力 | 说明 |
|------|------|
| 密度 / 缩放 | 紧凑·标准·宽松 + 50–200% 滑块（几何缩放，非 CSS zoom） |
| 自动列宽/行高 | 工具栏最左；库无 API |
| 暗色 | 站点 token + canvas 浅色 remap |
| 重载 | 只重 fetch+重挂载网格；页内确认，不打断全屏 |
| 全选 | 左上角 / Ctrl+A 切换 |
| 全屏 | **路径栏中栏全屏**（通用），非表格按钮 |

**已废弃、勿再接**：自定义 HTML `xl-grid` / `sheet-preview` 页签 / **构建期 Excel→CSV 预览链路**（`prepareAllExcelCsvs` 已从 scan/build 移除）。

这是后续其它类型拆分时的**参照模板**。

---

## 5. 方案选型原则（每类型自己定）

每种类型在**自己的适配器文档注释或本表**中写死选型，避免「全站统一用某重型套件」。

| 维度 | 问题 |
|------|------|
| 运行环境 | 是否必须纯静态（CF Pages）？能否依赖本机预生成？ |
| 成熟度 | 是否用行业通行库（如 PDF.js、SheetJS+x-spreadsheet）而非长期自研网格？ |
| 只读 vs 编辑 | Wiki 默认只读；不要为预览引入写回原文件 |
| 体积 | 动态 `import()`，按页加载 |
| 失败降级 | 预览失败 → 本类型错误条 + **原文件下载**，不拖垮整页 |

**禁止**：为了「一个 Viewer 打天下」把 PDF、Office、表格全塞进同一组件树。

---

## 6. 新增一种类型的检查清单

1. **定 kind / 扩展名**（`scan.ts` 仅注册分类，不写预览）。  
2. **写适配器四段**（prepare 可空）。  
3. **bodyClass** 一条，布局高度链写在**本类型 CSS**。  
4. **client** 只 `import { bindXxx } from './previews/xxx'` 并调用。  
5. **更新** [formats.md](./formats.md) 实现状态。  
6. **更新** 本文 §4 映射表。  
7. **不要**把逻辑堆进 `bindExcelViewers` 邻域或 PDF 长函数里「顺便写一下」。

---

## 7. 与现有文档的关系

| 文档 | 关系 |
|------|------|
| [architecture.md](./architecture.md) | 总管线、目录；类型细节以本文 + catalog 为准 |
| [formats.md](./formats.md) | 扩展名 → 状态；实现路径应指向适配器模块 |
| [content-model.md](./content-model.md) | `_Res_*` 命名；prepare 输出规范 |
| [diagrams.md](./diagrams.md) | 图示族专项 |
| [features.md](./features.md) | 用户可见能力 |

---

## 8. 演进约定

1. **新功能、新类型**：必须按 Type Adapter 独立落地。  
2. **改旧类型**：优先把该类型从 `client.ts` / 混杂 shell 中**拆出**再改行为。  
3. **文档同步**：方案变更时更新本文 §4 与 [formats.md](./formats.md)。  
4. **大整理**：目录迁到 `previews/` 时可单独 PR；**原则不因目录未迁而失效**。

---

## 9. 摘要（给评审 / AI / 新人）

- **一种类型 = 一套方案 = prepare + shell + bind + style（可空段）**  
- **框架只接线，不写类型业务**  
- **Excel 已示范 bind 独立（`excel-viewer.ts`）；PDF 等仍待对称拆分**  
- **混写是缺陷，不是风格**
