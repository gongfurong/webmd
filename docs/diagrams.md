# 图示族（Diagram）· 选型与适配器

> 遵循 [preview-framework.md](./preview-framework.md)：每种**引擎**独立 prepare / shell / bind / style。  
> **类型栏 + 复制**规则见该文档 §1.1；产品总览见 [product.md](./product.md)。  
> 样例树：`content/samples/diagrams/`。

---

## 0. 「diagram」是什么？是不是一个大类型？

**是产品上的「族 / 大类」，不是扫盘里的单个 `kind`。**

| 层级 | 含义 | 例子 |
|------|------|------|
| **族（diagram）** | 中栏要「出一张图/模型」的能力集合；UI 都走 **类型栏 + 内容区** 一体卡（`.webmd-code.webmd-diagram`） | 图示预览 |
| **引擎 / 子类型** | 真正的适配器单位；一种 DSL 或文件格式 + 一种渲染方案 | **Mermaid**、PlantUML、Graphviz、draw.io… |
| **图种（副类型）** | 同一引擎内的语法方言，**不是**新适配器 | Mermaid 的 `FLOW` / `STATE` / `SEQ` → 标题 `Mermaid · STATE` |
| **扫盘 kind** | 树与路由用 | `.mmd`/`.puml`/`.dot`→渲染；`.drawio`→file 仅下载；`.svg`→`image` |

```text
diagram 族
├─ Mermaid          ✅ 客户端 DSL
├─ PlantUML         ✅ 客户端 TeaVM
├─ Graphviz (.dot)  ✅ 客户端 WASM
├─ draw.io          📌 不上 viewer · 导出 SVG（§3.1）
├─ Excalidraw       📌 不上 viewer · 导出 SVG（§3.1）
├─ XMind / FreeMind 📌 不上引擎 · 导出 PNG（§3.1）
└─ 位图/矢量图      ✅ 图片族（承接导出图）
```

**原则**：DSL 各做适配器；**重型画布/导图文件走导出静态图（§3.1），不引入全量 viewer。**

---

## 1. 统一 UI 约定（所有 diagram 引擎必须遵守）

与代码块 / 表格同构，**已实现的 Mermaid 即标准模板**：

```text
.webmd-code.webmd-diagram[data-diagram-engine="<引擎名>"]
  ├─ .webmd-code__bar          主类型 [· 副类型]  + 复制
  ├─ .webmd-code__content      内容区（图挂在内部，不顶替整块）
  │    └─ [data-*-canvas]      引擎画布
  └─ pre.*-copy-source[hidden] 可建文件的源文本（供复制）
```

| 项 | 约定 |
|----|------|
| **何时要类型栏+复制** | 能复制出**方便阅读、可另存为对应格式**的文本 → 要（§ preview-framework 1.1） |
| **主类型** | 引擎名：`Mermaid` / `PlantUML` / `Graphviz`… |
| **副类型** | 可选：`Mermaid · FLOW`、`PlantUML · SEQ`… |
| **复制内容** | DSL / 源文件文本，**不是**栅格截图（导出 SVG 另议） |
| **文内入口** | MD 围栏：` ```mermaid ` / 将来 ` ```plantuml ` ` ```dot ` |
| **独立文件** | 扫盘进 TEXT 或专用 kind → 整页 raw shell（不过假 MD） |
| **button 注入** | MD 消毒会转义 `<button>` → 复制钮须在**消毒后** enhance（见 Mermaid） |

---

## 2. 成熟「转换 / 嵌入」路径（全站选型用语）

| 路径 | 做法 | 优点 | 缺点 | WebMD 态度 |
|------|------|------|------|------------|
| **A. 原生图** | 作者放 `.svg`/`.png`，`<img>` | 零引擎、最稳 | 无 DSL 可改 | ✅ 已支持（图片族） |
| **B. 客户端 DSL** | 页内 JS：DSL→SVG | 改仓库即见、主题易跟 | 包体积、复杂图性能 | ✅ **Mermaid 已走 B**；Graphviz WASM 同类 |
| **C. 文件页 + 开源 viewer** | 专用壳 + 库只读打开文件 | 保真编辑器格式 | 体积大、API 杂 | ❌ **draw.io / Excalidraw 默认不上** |
| **D. 构建期 prepare** | scan/build → `_Res_*/preview.svg` 再当 A | 运行时零依赖、可离线 | 需本机 CLI、改图要重构建 | 可选增强（旁路预览图） |
| **E. 公网渲染 API** | 请求 plantuml.com 等 | 接入快 | 隐私/离线/稳定性差 | ❌ **不做** |
| **F. 作者导出旁路** | 桌面工具导出 SVG/PNG 放仓库 | 零开发、最稳 | 双份源 | ✅ **画布/导图文件的主路径** |

**推荐组合**：

- 文本 DSL → **B**（Mermaid / PlantUML / Graphviz）  
- 专有画布 / 导图文件 → **F → A**（导出静态图，见 **§3.1**）；**不上**全量 C  
- 可选：CI/本机把导出图放进 `_Res_*`（**D**），源文件仍可下载

---

## 3. 引擎矩阵：现状 · 能否渲 · 成熟方案 · 落地形态

| 引擎 | 扩展名 / 文内 | 能否渲成图？ | 成熟方案（推荐序） | WebMD 现状 | 目标路径 | 复制物 |
|------|----------------|--------------|---------------------|------------|----------|--------|
| **Mermaid** | ` ```mermaid `；`.mmd` `.mermaid` | ✅ | **B** mermaid.js | ✅ 文内+独立 | — | DSL |
| **PlantUML** | ` ```plantuml ` / ` ```puml `；`.puml` `.plantuml` `.pu` | ✅ | **B** `@plantuml/core`（TeaVM，无公网） | ✅ 文内+独立 | — | `.puml` 文本 |
| **Graphviz** | ` ```dot ` / ` ```gv `；`.dot` `.gv` | ✅ | **B** `@hpcc-js/wasm-graphviz` | ✅ 文内+独立 | — | DOT 文本 |
| **draw.io** | `.drawio` `.dio` | 预览靠导出图 | **F→A 优先 SVG**（§3.1） | 源仅下载 | 不上全量 viewer | — |
| **Excalidraw** | `.excalidraw` | 预览靠导出图 | **F→A 优先 SVG**（§3.1） | 源未专用预览 | 同上 | — |
| **FreeMind** | `.mm` | 预览靠导出图 | **F→A 优先 PNG**（§3.1） | 仅下载 | 同上 | — |
| **XMind** | `.xmind` | 预览靠导出图 | **F→A 优先 PNG**（§3.1） | 仅下载 | 同上 | — |
| **文内思维导图** | Mermaid `mindmap` | ✅ | **B**（已含） | ✅ | — | DSL |
| **SVG/PNG** | 图片 | ✅ | **A** | ✅ 图片族 | 承接一切导出图 | — |

---

## 3.1 专有画布 / 导图文件：导出约定（产品定稿）

> **策略统一**：不引入 draw.io / Excalidraw / XMind 全量 viewer。  
> 源文件可进树、**路径栏下载**；**站内好看图**靠导出的静态图（图片族已支持）。

### 导出格式建议

| 源格式 | **优先导出** | 备选 | 说明 |
|--------|--------------|------|------|
| **draw.io**（`.drawio` / `.dio`） | **SVG** | PNG（极复杂/兼容问题时） | 矢量清晰、缩放好 |
| **Excalidraw**（`.excalidraw`） | **SVG** | PNG | 官方导出 SVG 效果稳 |
| **XMind**（`.xmind`） | **PNG** | PDF；偶发 SVG | 工具更常出位图；不强制 SVG |
| **FreeMind**（`.mm`） | **PNG** | — | 老格式，位图足够 |

### 边界（必须遵守）

1. **策略 = 导出静态图 + 现有图片预览**，不是「每个格式都必须、只能是 SVG」。  
2. **有现成可用的 SVG 不禁止**：XMind/mm 若某次导出 SVG 质量可接受，可当图片用；**默认推荐**仍按上表。  
3. **创作导图**：能写文本的用 **Mermaid `mindmap`**（已实现）；大型导图用 XMind 等再 **导出 PNG**。  
4. **DSL 引擎（Mermaid / PlantUML / Graphviz）不改走导出**——继续源码客户端渲染。  
5. **双份源可接受**：仓库可同时保留 `.drawio`/`.xmind`（真相/可再编辑）与导出的 `.svg`/`.png`（站内阅读）。  
6. **旁路绑定（已实现）**：把导出图放到  
   - `_Res_<完整源文件名>/preview.svg` 或 `preview.png`（按 § 导出优先），或  
   - 同目录 `同主名.svg` / `同主名.png`  
   则打开源文件页时 **与普通图片页相同**：只显示导出图（无类型栏）；路径栏仍可下载源文件（`diagram-export-preview.ts`）。也可用 `![]()` 直接引用导出图。  
7. **明确不做**：默认接入 diagrams.net / Excalidraw / XMind **全量 web viewer**（体积与复杂度不符合站内原则）。  
8. **不自动导出**：站内不调用桌面 draw.io/XMind；导出由作者或 CI 完成。

### 作者工作流（建议）

```text
draw.io / Excalidraw  ──导出──►  *.svg   ──► content/  图片预览
XMind / FreeMind      ──导出──►  *.png   ──► content/  图片预览
（可选）源 .drawio / .xmind / .mm 一并提交 ──► 仅下载 / 备份可编辑源
```

---

## 4. 落地阶段

| 阶段 | 引擎 | 形态 | 状态 |
|------|------|------|------|
| **P1** | Mermaid | 文内 fence + 独立 `.mmd`/`.mermaid` | ✅ |
| **P2** | PlantUML | 文内 + `.puml`；`@plantuml/core` | ✅ |
| **P2b** | Graphviz | 文内 + `.dot`/`.gv`；WASM | ✅ |
| **P3** | 画布/导图**文件** | **§3.1 导出约定**（非 viewer） | ✅ **产品定稿**（无重引擎） |
| **P4** | 旁路 `preview.*` 绑定 | 源文件页挂导出图（svg-first / png-first） | ✅ `diagram-export-preview.ts` |

新增 **DSL 引擎**时：复制 Mermaid 适配器职责。  
**画布/导图文件**：**不要**再开重视图器 PR，除非产品明确推翻 §3.1。

---

## 5. P1 · Mermaid（定稿 · 全引擎模板）

### 5.1 适配器四段

| 段 | 位置 | 说明 |
|----|------|------|
| **prepare** | — | 无 |
| **shell** | `scripts/lib/mermaid-preview.ts` | `renderMermaidShell`；`enhanceMermaidCopyButtons`（消毒后挂复制钮） |
| **bind** | `src/previews/mermaid.ts` | `data-mermaid-code` → `mermaid.run` → SVG |
| **style** | `style.css` · `.webmd-diagram` | 栏+内容区一体卡；独立页 `is-mermaid-page` |
| **扫盘** | `scan.ts` TEXT_EXT | `.mmd` `.mermaid` |
| **装配** | `markdown.ts` fence；`render-page.ts` 独立文件 raw shell | |

### 5.2 数据流

```text
文内：```mermaid … ```  → marked → renderMermaidShell → DOMPurify
                          → enhanceMermaidCopyButtons → 页内
独立：*.mmd / *.mermaid   → render-page 读盘 → renderMermaidShell（raw）
                          → enhanceMermaidCopyButtons
二者：client bindMermaid / renderMermaidBlocks → SVG 写入内容区画布
```

### 5.3 图种（副类型，非新引擎）

| 副标 | 源码首行关键字 |
|------|----------------|
| FLOW | `flowchart` / `graph` |
| SEQ | `sequenceDiagram` |
| CLASS | `classDiagram` |
| STATE | `stateDiagram` / `stateDiagram-v2` |
| ER / GANTT / PIE / MINDMAP / … | 见 mermaid 文档 |

样例：`content/samples/diagrams/mermaid-in-md.md`、`…/mermaid/*.mmd`、`standalone.mermaid`。

---

## 6. 后续引擎如何「按 mmd 这套」实现（检查清单）

每种新引擎 PR 必须满足：

1. [ ] **shell 模块** `scripts/lib/<engine>-preview.ts`  
   - `renderXxxShell`：`.webmd-code.webmd-diagram` + `data-diagram-engine="<engine>"`  
   - 主类型标题 + 可选副类型；隐藏 `pre` 存可复制源  
   - **不含**消毒前的 `<button>`；提供 `enhanceXxxCopyButtons`  
2. [ ] **bind 模块** `src/previews/<engine>.ts`  
   - 只操作本引擎画布；主题/失败隔离  
3. [ ] **MD fence**（若支持文内）：`markdown.ts` `renderer.code` 分支  
4. [ ] **独立扩展名**：`TEXT_EXT` 或专用 kind；`render-page` raw 注入 shell  
5. [ ] **bodyClass**：`is-<engine>-page`（独立文件）；样式不污染 sheet/pdf  
6. [ ] **类型栏+复制**：复制 = 可建文件的源文本  
7. [ ] **样例**：`content/samples/diagrams/<engine>/`  
8. [ ] 更新本文件矩阵 + [formats.md](./formats.md) + [features.md](./features.md)  
9. [ ] **禁止**默认依赖公网渲染 API  

### 6.1 PlantUML（P2 · 已落地）

| 项 | 实现 |
|----|------|
| 路径 | **B** `@plantuml/core` + `viz-global.js`（动态加载，不进首包） |
| 壳 | `scripts/lib/plantuml-preview.ts`；`data-diagram-engine="plantuml"` |
| bind | `src/previews/plantuml.ts`：串行 `render`，主题 `{ dark }` |
| 复制 | `.puml` / fence 全文（消毒后 enhance 挂钮） |
| 禁止 | 默认请求公网 PlantUML 服务 |
| 样例 | `content/samples/diagrams/plantuml/`、`plantuml-in-md.md` |

### 6.2 Graphviz（P2b · 已落地）

| 项 | 实现 |
|----|------|
| 路径 | **B** `@hpcc-js/wasm-graphviz` |
| 壳 | `scripts/lib/graphviz-preview.ts`；`data-diagram-engine="graphviz"` |
| bind | `src/previews/graphviz.ts`：`Graphviz.load()` → `dot()` |
| 入口 | ` ```dot ` / ` ```graphviz ` / ` ```gv `；`.dot` `.gv` |
| 复制 | DOT 全文 |
| 样例 | `content/samples/diagrams/graphviz/`、`graphviz-in-md.md` |

### 6.3 draw.io / Excalidraw（§3.1 + 旁路绑定）

| 项 | 约定 |
|----|------|
| 路径 | **F→A**，**优先导出 SVG** |
| 绑定 | `_Res_*/preview.svg`（或同目录 `.svg`）→ 源文件页出图 |
| 实现 | `diagram-export-preview.ts` |
| 禁止 | 全量 diagrams.net / Excalidraw viewer |

### 6.4 XMind / FreeMind（§3.1 + 旁路绑定）

| 项 | 约定 |
|----|------|
| 创作 | 文内优先 **Mermaid mindmap** |
| 路径 | **优先导出 PNG** |
| 绑定 | `_Res_*/preview.png`（或同目录 `.png`）→ 源文件页出图 |
| 禁止 | 完整 XMind/mm 在线编辑器 |

---

## 7. 与「图片族」的边界

| | diagram 族（DSL 引擎） | 图片族 |
|--|------------------------|--------|
| 源 | Mermaid / PlantUML / Graphviz 文本 | `.png` `.jpg` `.svg`…（含导出图） |
| 预览 | 客户端引擎 → 类型栏+内容区 | 原生 `<img>` media-stage |
| 类型栏+复制 | 有（DSL 可复制） | 无块内复制；路径栏下载 |
| draw.io / xmind 等 | 源仅下载 | **导出图落在这里**（§3.1） |

---

## 8. 相关代码与样例

| 路径 | 角色 |
|------|------|
| `scripts/lib/mermaid-preview.ts` | Mermaid shell + 消毒后复制钮 |
| `src/previews/mermaid.ts` | Mermaid bind |
| `scripts/lib/plantuml-preview.ts` | PlantUML shell + 消毒后复制钮 |
| `src/previews/plantuml.ts` | PlantUML bind（@plantuml/core） |
| `scripts/lib/graphviz-preview.ts` | Graphviz shell + 消毒后复制钮 |
| `src/previews/graphviz.ts` | Graphviz bind（wasm） |
| `scripts/lib/markdown.ts` | fence → shell；危险标签策略 |
| `scripts/lib/render-page.ts` | 独立 `.mmd` / `.puml` / `.dot` raw 装配 |
| `src/style.css` · `.webmd-diagram` | 栏+内容区一体 |
| `content/samples/diagrams/mermaid/` | ✅ Mermaid |
| `content/samples/diagrams/plantuml/` | ✅ PlantUML |
| `content/samples/diagrams/graphviz/` | ✅ Graphviz |
| `scripts/lib/diagram-export-preview.ts` | 旁路 preview.svg/png 解析 + 壳 |
| `content/samples/diagrams/drawio|excalidraw|mindmap/` | 源 + `_Res_*/preview.svg|png` 样例 |
| `docs/preview-framework.md` §1.1 | 类型栏+复制产品标准 |

---

## 9. 修订记录（摘要）

| 日期 | 说明 |
|------|------|
| 2026-08 | Mermaid / PlantUML / Graphviz 客户端落地；§3.1 画布/导图导出；旁路 preview 绑定；`dist` 分区 `content`/`pages`/`assets` |
