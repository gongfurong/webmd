# 定位（CSS Positioning）

### 缩写：无

### 简述

position 与 inset 控制元素相对包含块的偏移：relative/absolute/fixed/sticky 等。

### 使用场景

弹层、角标、粘性头。

### 注意事项

• z-index 仅在层叠上下文内比较

### 对比与易混

| 值 | 要点 |
|----|------|
| relative | 占位保留 |
| absolute | 脱流，相对定位包含块 |
| fixed | 相对视口或变换祖先 |
| sticky | 滚动容器内粘滞 |

### 关联术语

• 包含块：参照
• 层叠上下文：z 作用域
• 视口：fixed 相关
