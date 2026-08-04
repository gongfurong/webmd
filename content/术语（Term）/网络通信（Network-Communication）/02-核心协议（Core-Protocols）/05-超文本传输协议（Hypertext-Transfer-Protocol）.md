# 超文本传输协议（Hypertext Transfer Protocol）

### 缩写：HTTP

### 简述

应用层请求/响应协议，广泛用于 Web 与 API。默认无状态；HTTPS = HTTP over TLS，业务语义仍是 HTTP。

### 使用场景

页面、REST/JSON、健康检查、经代理/CDN 的南北向流量。

### 组成与要点

```text
请求行 / 状态行
头部
空行
可选正文
```
### 实践与应用

• 用对方法幂等与状态码；H1/H2/H3 连接模型不同。
• 观测状态码分布、TTFB、缓存是否命中。

### 注意事项

• 会话需 Cookie/Token 等显式机制。
• 仅 HTTPS 不够，仍要鉴权与输入校验。

### 关联术语

• TCP / TLS：常见承载
• URL：资源定位
• WebSocket：可基于 HTTP 升级的长连接
• API：HTTP 上的接口形态
