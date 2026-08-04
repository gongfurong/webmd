# FetchAPI（Fetch API）

### 缩写：无

### 简述

基于期约的网络请求 API，取代经典 XHR 的现代写法。

### 组成与要点

```text
fetch(url, init) -> Promise<Response>
body 流式可读
```

### 实践与应用

• 处理非 2xx 仍 resolve 的语义
• 用 AbortController 取消

### 关联术语

• HTTP：协议
• CORS：跨源
• AbortController：取消
