# 跨源资源共享（Cross-Origin Resource Sharing）

### 缩写：CORS

### 简述

服务器通过响应头声明哪些跨源请求可被前端读取的机制。

### 实践与应用

• 区分简单请求与预检
• 凭据模式要 Access-Control-Allow-Credentials

### 注意事项

• 用 * 无法搭配凭据

### 关联术语

• 同源策略：背景
• 预检请求：OPTIONS
• Fetch：credentials
