# 图示样例（PlantUML · 文内）

与 Mermaid 相同：**类型栏 + 内容区 + 复制源码**。  
引擎：浏览器内 `@plantuml/core`（TeaVM），**不请求公网 PlantUML 服务**。

````text
```plantuml
@startuml
Alice -> Bob : hello
@enduml
```
````

也可用别名：` ```puml `。

独立文件：`content/samples/diagrams/plantuml/*.puml`  
（如 [/pages/samples/diagrams/plantuml/sample.puml/](/pages/samples/diagrams/plantuml/sample.puml/)）

---

## 1. 用例图

```plantuml
@startuml
left to right direction
actor User
rectangle WebMD {
  User --> (Read Markdown)
  User --> (Preview PlantUML)
  User --> (Open Excel)
}
@enduml
```

## 2. 时序图

```plantuml
@startuml
actor User
participant WebMD
participant Core as "plantuml.js"

User -> WebMD: 打开 .puml / 文内 fence
WebMD -> Core: renderToString
Core --> WebMD: SVG
WebMD --> User: 内容区展示
@enduml
```

## 3. 类图（简）

```plantuml
@startuml
class TypeAdapter {
  +prepare()
  +shell()
  +bind()
}
class PlantumlAdapter {
  +bind()
}
class MermaidAdapter {
  +bind()
}
TypeAdapter <|-- PlantumlAdapter
TypeAdapter <|-- MermaidAdapter
@enduml
```

## 4. 活动图

```plantuml
@startuml
start
:扫盘 / 打开 MD;
if (```plantuml 或 .puml?) then (yes)
  :shell 类型栏+画布;
  :bind @plantuml/core;
  :SVG 写入内容区;
else (no)
  :其它适配器;
endif
stop
@enduml
```
