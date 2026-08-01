# 格式支持总表（Formats）

> 全格式状态与方案（执行用权威表）。

---

## 1. 总览

| 分类 | 已实现 | 旁路/条件 | 仅下载或导出图 |
|------|--------|-----------|----------------|
| 文档 | md/mdx | — | — |
| 文本代码 | txt/json/py/ts… | — | 未进 TEXT_EXT 的源码扩展名 |
| 表格 | csv/xlsx/xls/ods | — | — |
| 版式 | pdf | docx/pptx→preview.pdf | 无 preview 的 Office |
| 媒体 | 常见图/音/视 | 视频 poster | 冷门容器 |
| 图示 DSL | mermaid/plantuml/graphviz | — | — |
| 画布导图源 | 有 preview 则图 | 作者导出 | 无 preview |
| 压缩包 | — | — | zip/7z/rar… |

---

## 2. 分项状态

### 2.1 Markdown / 文本

| 格式 | 状态 | 方案 |
|------|------|------|
| `.md` `.mdx` | ✅ | marked + 消毒 + 增强 |
| 代码 fence | ✅ | hljs + 类型栏复制 |
| KaTeX | ✅ | 客户端 |
| 普通文本扩展名（TEXT_EXT） | ✅ | 源码页 |

### 2.2 表格

| 格式 | 状态 | 方案 |
|------|------|------|
| `.csv` `.xlsx` `.xls` `.ods` | ✅ | SheetJS + x-spreadsheet；读原件；不写源 |

### 2.3 版式

| 格式 | 状态 | 方案 |
|------|------|------|
| `.pdf` | ✅ | PDF.js |
| `.docx` 等 | ⚠️ | `_Res_*/preview.pdf` + PDF.js；下载原件 |
| `.pptx` 等 | ⚠️ | 同上 |

### 2.4 媒体

| 格式 | 状态 | 方案 |
|------|------|------|
| 常见图片/SVG | ✅ | media-stage |
| 常见视频/音频 | ✅ | 标签 + 可选 poster |

### 2.5 图示

| 格式 | 状态 | 方案 |
|------|------|------|
| ````mermaid` / `.mmd` | ✅ | mermaid.js |
| ````plantuml` / `.puml` | ✅ | @plantuml/core |
| ````dot` / `.dot` `.gv` | ✅ | wasm-graphviz |
| `.drawio` / `.excalidraw` | ⚠️ | `_Res_*/preview.svg` 优先 |
| `.xmind` / `.mm` | ⚠️ | `_Res_*/preview.png` 优先 |

### 2.6 其它

| 格式 | 状态 |
|------|------|
| zip/7z/rar… | 仅下载卡 |

---

## 3. 类型栏规则（摘要）

见 [conventions.md](./conventions.md) §4 与 [preview-framework.md](./preview-framework.md) §1.1。

---

## 4. 样例位置

`content/samples/`（diagrams / office / archives / text）。  
