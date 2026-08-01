# 图示样例（Mermaid · 文内）

站内 **Markdown** 里用代码块即可画图：

````text
```mermaid
flowchart LR
  A --> B
```
````

也可用别名：` ```mmd `。

实现：`markdown.ts`（shell）+ `src/previews/mermaid.ts`（bind）。

**独立 `.mmd` 文件**（整页渲染，便于单图测试）在同目录下的 [mermaid/](./mermaid/)：

| 文件 | 图种 |
|------|------|
| [flowchart.mmd](/pages/samples/diagrams/mermaid/flowchart.mmd/) | 流程图 |
| [sequence.mmd](/pages/samples/diagrams/mermaid/sequence.mmd/) | 时序图 |
| [class.mmd](/pages/samples/diagrams/mermaid/class.mmd/) | 类图 |
| [state.mmd](/pages/samples/diagrams/mermaid/state.mmd/) | 状态图 |
| [er.mmd](/pages/samples/diagrams/mermaid/er.mmd/) | ER |
| [mindmap.mmd](/pages/samples/diagrams/mermaid/mindmap.mmd/) | 思维导图 |
| [gantt.mmd](/pages/samples/diagrams/mermaid/gantt.mmd/) | 甘特 |
| [pie.mmd](/pages/samples/diagrams/mermaid/pie.mmd/) | 饼图 |
| [standalone.mermaid](/pages/samples/diagrams/mermaid/standalone.mermaid/) | 扩展名 `.mermaid`（与 `.mmd` 同引擎） |

---

## 1. 流程图 flowchart

```mermaid
flowchart LR
  A[打开页面] --> B{文件类型}
  B -->|md / csv / pdf…| C[内置预览]
  B -->|.puml .xmind .drawio| D[统一下载卡]
  C --> E[中栏阅读]
```

## 2. 时序图 sequenceDiagram

```mermaid
sequenceDiagram
  participant U as 用户
  participant W as WebMD
  participant S as SheetJS
  U->>W: 打开 sample.xlsx
  W->>S: fetch + XLSX.read
  S-->>W: workbook
  W-->>U: x-spreadsheet 网格
```

## 3. 类图 classDiagram（简易 UML）

```mermaid
classDiagram
  class TypeAdapter {
    +prepare()
    +shell()
    +bind()
    +style()
  }
  class MermaidAdapter {
    +bind()
  }
  class ExcelAdapter {
    +shell()
    +bind()
  }
  TypeAdapter <|-- MermaidAdapter
  TypeAdapter <|-- ExcelAdapter
  WebMD --> TypeAdapter : 注册表
```

## 4. 状态图 stateDiagram

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading: 打开文件
  Loading --> Ready: 解析成功
  Loading --> Error: 失败
  Ready --> Idle: 软导航离开
  Error --> Loading: 重试
```

## 5. ER 图 erDiagram

```mermaid
erDiagram
  PAGE ||--o{ HEADING : contains
  PAGE ||--o{ ASSET : may_have
  PAGE {
    string path
    string kind
  }
  HEADING {
    string id
    string text
  }
```

## 6. 思维导图 mindmap

```mermaid
mindmap
  root((WebMD 预览))
    文内
      Mermaid
      KaTeX
    文件页
      PDF.js
      SheetJS
      媒体
    旁路资源
      preview.pdf
      poster.jpg
```

## 7. 甘特 gantt

```mermaid
gantt
  title 图示能力路线（示意）
  dateFormat  YYYY-MM-DD
  section 已落地
  Mermaid 文内           :done, m1, 2026-01-01, 2026-04-01
  Mermaid 独立 .mmd      :done, m2, 2026-04-01, 30d
  section 规划中
  PlantUML 文内/文件     :active, p1, after m2, 60d
  思维导图文件预览       :p2, after p1, 45d
```

## 8. 饼图 pie

```mermaid
pie showData
  title 内容类型示意
  "Markdown" : 40
  "表格" : 15
  "PDF/Office" : 20
  "媒体" : 15
  "其它" : 10
```

---

## 尚未渲染（独立文件 · 下载卡）

| 样例 | 格式 | 现状 | 说明 |
|------|------|------|------|
| [sample.puml](/pages/samples/diagrams/plantuml/sample.puml/) | PlantUML | **仅下载** | 源是文本，可以后文内/`prepare→SVG`；**现在站内不画** |
| [sample.drawio](/pages/samples/diagrams/drawio/sample.drawio/) | diagrams.net | **仅下载** | 可导出 SVG 放仓库用图片页；**未接 viewer** |
| [sample.mm](/pages/samples/diagrams/mindmap/sample.mm/) | FreeMind | **仅下载** | XML，无通用浏览器原生；可导出图 |
| [sample.xmind](/pages/samples/diagrams/mindmap/sample.xmind/) | XMind | **仅下载** | zip 包，完整预览重 |

**「仅下载」= 当前没有 shell/bind，页面只有统一下载卡**，不能在中栏当图看。  
**「未做」**（如 Graphviz / Excalidraw 文内）= 还没接适配器；技术上可以嵌 HTML，但 **尚未实现**。

设计原则：一种类型一套 prepare / shell / bind / style，见 `docs/diagrams.md`。
