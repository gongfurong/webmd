# 模板元素（Template Element）

### 缩写：无

### 简述

HTML template 元素保存可被脚本克隆的惰性文档片段，本身不渲染。用于客户端渲染组件片段、列表项模具等，避免用隐藏 DOM 充当模板。

### 使用场景

前端列表项模具、Web Components 内部结构。

### 实践与应用

```html
<template id="row">…</template>
<!-- 脚本 clone 后插入；模板本体不渲染 -->
```
### 注意事项

• 误以为 template 内脚本会执行
• 大量字符串拼接 HTML 的 XSS 风险仍在其它路径

### 关联术语

• DOM：克隆插入的目标树
• Web 组件：常配合的封装模型
