# 文档对象模型（Document Object Model）

### 缩写：DOM

### 简述

HTML 解析后的树形对象模型，供脚本读写结构与样式、响应事件。

### 组成与要点

```text
Document
 └─ Element
     ├─ Element
     └─ Text
```

### 实践与应用

• 批量改 DOM 减少回流
• 用事件委托

### 关联术语

• HTML：源标记
• CSSOM：样式树
• 事件：交互入口
