# 元数据（Metadata）

### 缩写：无

### 简述

描述文档自身而非主正文内容的信息，通常位于 head：字符集、标题、视口、描述、社交卡片、规范链接、脚本样式引用等。元数据影响展示、分享、索引与加载行为。

### 使用场景

SEO、分享预览、移动适配、资源加载。

### 实践与应用

```html
<title>…</title>
<meta name="description" content="…">
<meta name="viewport" content="width=device-width, initial-scale=1">
```
### 注意事项

• 错误的 viewport 导致缩放问题
• 密钥或会话放进可抓取元数据

### 关联术语

• head：元数据常见位置
• title / meta：典型标签
• SEO / 分享卡片：消费方
