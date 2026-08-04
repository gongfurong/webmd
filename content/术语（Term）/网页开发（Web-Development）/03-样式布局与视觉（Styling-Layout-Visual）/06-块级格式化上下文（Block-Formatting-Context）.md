# 块级格式化上下文（Block Formatting Context）

### 缩写：BFC

### 简述

独立的块级布局区域，内部垂直排布并与外部浮动等部分隔离；可用于清浮动、防 margin 折叠。

### 使用场景

清浮动、两栏布局、隔离边距。

### 实践与应用

• 现代布局优先 Flex/Grid
• 需要时用 flow-root 等创建 BFC

### 关联术语

• 浮动：常被隔离对象
• Flex/Grid：现代替代
