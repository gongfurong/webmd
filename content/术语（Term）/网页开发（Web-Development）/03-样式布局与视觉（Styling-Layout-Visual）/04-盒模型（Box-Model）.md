# 盒模型（Box Model）

### 缩写：无

### 简述

元素由 content、padding、border、margin 构成盒；box-sizing 决定 width/height 是否含边框。

### 使用场景

定尺寸、间距、边框按钮、溢出。

### 组成与要点

```text
margin > border > padding > content
box-sizing: content-box | border-box
```

### 实践与应用

• 全局 border-box 简化心智
• 注意纵向 margin 折叠

### 关联术语

• 包含块：百分比参照
• 布局：盒排布
• 回流：几何重算
