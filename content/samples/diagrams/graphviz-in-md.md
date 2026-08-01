# 图示样例（Graphviz · 文内）

与 Mermaid / PlantUML 相同：**类型栏 + 内容区 + 复制 DOT 源码**。  
引擎：`@hpcc-js/wasm-graphviz`（浏览器 WASM，无本机 Graphviz、无公网）。

````text
```dot
digraph { a -> b }
```
````

别名：` ```graphviz ` / ` ```gv `。  
独立文件：`.dot` / `.gv` → 如 [/pages/samples/diagrams/graphviz/sample.dot/](/pages/samples/diagrams/graphviz/sample.dot/)

---

## 1. digraph（有向）

```dot
digraph Flow {
  rankdir=LR;
  node [shape=box];
  scan -> shell -> bind -> svg;
  bind [label="Graphviz WASM"];
}
```

## 2. graph（无向）

```dot
graph U {
  rankdir=TB;
  a -- b -- c;
  b -- d [label="edge"];
}
```

## 3. 稍复杂

```dot
digraph Architecture {
  rankdir=TB;
  subgraph cluster_browser {
    label="Browser";
    style=rounded;
    MD [label="MD fence / .dot"];
    Shell [label="webmd-diagram"];
    Engine [label="@hpcc-js/wasm-graphviz"];
    MD -> Shell -> Engine;
  }
  Engine -> Out [label="SVG"];
}
```
