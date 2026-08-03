# 超文本传输协议（Hypertext Transfer Protocol）

| 完整英文名 | 缩写 | 中文名 | 中文简写 | 简述 |
|------------|------|--------|----------|------|
| Hypertext Transfer Protocol | HTTP | 超文本传输协议 | HTTP | 应用层请求/响应协议，广泛用于 Web 与 API。默认无状态；HTTPS = HTTP over TLS，业务语义仍是 HTTP。 |

## 详细说明

**（性质：tech｜领域：网络）**

> 本类共性见同目录 `README.md`，此处只写本词差异点。

**使用场景**
页面、REST/JSON、健康检查、经代理/CDN 的南北向流量。

**实践与应用**
• 用对方法幂等与状态码；H1/H2/H3 连接模型不同。
• 观测状态码分布、TTFB、缓存是否命中。

**注意事项**
• 会话需 Cookie/Token 等显式机制。
• 仅 HTTPS 不够，仍要鉴权与输入校验。

**相关概念与术语**
TLS、REST、CDN、反向代理、WebSocket（可升级）。

**深入与掌握**
L1 请求响应与状态码；L2 缓存与连接调优；L3 协议版本与边缘架构。
