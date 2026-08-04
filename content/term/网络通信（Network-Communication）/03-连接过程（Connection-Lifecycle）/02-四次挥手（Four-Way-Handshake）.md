---
zh: 四次挥手
en: Four-Way Handshake
abbr: 无
nature: process
domain: 网络
---

# 四次挥手（Four-Way Handshake）

### 缩写：无

### 简述

TCP 优雅关闭：两端各自 FIN/ACK 结束发送。主动关闭方常进 TIME_WAIT；杀进程常见 RST 而非优雅挥手。

### 使用场景

连接泄漏、TIME_WAIT 过多、半关闭语义。

### 实践与应用

• 短连接密集→池化或调协议。
• 分清优雅 FIN 与 RST 重置对业务错误码的影响。

### 注意事项

• 半关闭（只关写）语义需业务明确。

### 相关概念与术语

三次握手、TIME_WAIT、RST、连接池。

### 深入与掌握

L1 双向结束；L2 TIME_WAIT 治理；L3 优雅下线协议。
