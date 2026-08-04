# 字符编码（Character Encoding）

### 缩写：无

### 简述

Web 文档与传输中字符到字节的映射约定；HTML 应在早期通过 meta charset 或 HTTP 头声明（推荐 UTF-8）。声明过晚或与真实字节不一致会导致乱码与安全过滤绕过风险。

### 使用场景

页面头、HTTP Content-Type、表单提交、多语言站。

### 实践与应用

```html
<meta charset="utf-8">
<!-- 与 HTTP Content-Type 一致；尽早出现 -->
```
### 注意事项

• 错误解码用户输入
• 复制来的错误编码源文件

### 关联术语

• Unicode：字符码点标准
• UTF-8：推荐字节映射
• Content-Type：HTTP 侧声明
