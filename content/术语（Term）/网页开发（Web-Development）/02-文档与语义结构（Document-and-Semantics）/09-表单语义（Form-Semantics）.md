# 表单语义（Form Semantics）

### 缩写：无

### 简述

用 form、label、input 等控件及其关系表达数据收集结构，使提交、校验与辅助技术能理解字段含义。正确关联 label 与控件、使用合适类型，是可用与无障碍表单的基础。

### 使用场景

登录、搜索、结账、设置、上传。

### 实践与应用

```html
<form>
  <label for="email">邮箱</label>
  <input id="email" name="email" type="email" autocomplete="email">
  <button type="submit">提交</button>
</form>
```
### 注意事项

• 用 div 假表单导致无法原生提交/自动填充
• 占位符代替 label

### 关联术语

• label / input：关联控件
• 约束校验：浏览器侧检查
• HTTP 方法：提交动词
