# 图示样例（diagram 族）

**diagram** 是 WebMD 的**产品大类**（要在中栏出图），不是扫盘单一 `kind`。  
下面每个子目录对应一种**引擎/格式**；实现约定见仓库 `docs/diagrams.md`。

| 目录 | 引擎 | 站内预览 | 说明 |
|------|------|----------|------|
| [mermaid/](./mermaid/) | Mermaid | ✅ | `.mmd` / `.mermaid`；类型栏 + 内容区 + 复制 DSL |
| [mermaid-in-md.md](./mermaid-in-md.md) | Mermaid 文内 | ✅ | MD 里 ` ```mermaid ` 合集 |
| [plantuml/](./plantuml/) | PlantUML | ✅ | `.puml`；`@plantuml/core` 客户端 |
| [plantuml-in-md.md](./plantuml-in-md.md) | PlantUML 文内 | ✅ | MD 里 ` ```plantuml ` |
| [graphviz/](./graphviz/) | Graphviz | ✅ | `.dot` / `.gv`；WASM 客户端 |
| [graphviz-in-md.md](./graphviz-in-md.md) | Graphviz 文内 | ✅ | MD 里 ` ```dot ` |
| [drawio/](./drawio/) | draw.io 源 | ✅ 有 `_Res_*/preview.svg` | 打开源文件页可预览导出图 |
| [excalidraw/](./excalidraw/) | Excalidraw 源 | ✅ `preview.svg` | 同上 |
| [mindmap/](./mindmap/) | FreeMind / XMind | ✅ `preview.png` | 文内创作仍可用 Mermaid `mindmap` |

**画布/导图约定**（`docs/diagrams.md` §3.1）：不上重视图器。  
- draw.io / Excalidraw → 导出 **SVG** → `_Res_<源文件>/preview.svg`  
- XMind / FreeMind → 导出 **PNG** → `_Res_<源文件>/preview.png`
