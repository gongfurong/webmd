---
zh: 传输控制协议
en: Transmission Control Protocol
abbr: TCP
nature: tech
domain: 网络
---

# 传输控制协议（Transmission Control Protocol）

### 缩写：TCP

### 简述

面向连接的可靠字节流：确认、重传、排序、流控与拥塞控制。可靠≠无限等；应用仍要超时与业务幂等。

### 使用场景

多数「不能乱丢」的业务通道：Web、库连接、RPC over TCP。

### 实践与应用

• 观测重传率、RTT、零窗口、握手失败。
• 短连接看握手成本；长连接看中间盒空闲策略。

### 注意事项

• 队头阻塞：单流丢包拖累后续。
• TIME_WAIT 堆积常来自无脑短连接。

### 相关概念与术语

UDP、三次握手/四次挥手、拥塞控制、流控、TLS。

### 深入与掌握

L1 说明可靠字节流；L2 据重传/状态排障；L3 连接模型与中间盒取舍。
