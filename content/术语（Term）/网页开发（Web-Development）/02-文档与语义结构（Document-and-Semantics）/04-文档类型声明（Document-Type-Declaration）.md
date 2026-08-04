# 文档类型声明（Document Type Declaration）

### 缩写：doctype

### 简述

位于文档最前、声明 HTML 类型以触发浏览器标准模式的声明（现代 HTML 中为简短的 <!DOCTYPE html>）。缺少或错误可能导致怪异模式，使布局与脚本行为偏离预期。

### 使用场景

每个 HTML 文档开头。

### 实践与应用

```html
<!DOCTYPE html>
<!-- 置于文档最前，触发标准模式 -->
```
### 注意事项

• 历史复杂 doctype 已无必要
• XML 序列化场景规则不同

### 关联术语

• HTML：所属文档语言
• 标准模式：doctype 触发的渲染模式
