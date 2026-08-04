---
zh: 用户数据报协议
en: User Datagram Protocol
abbr: UDP
nature: tech
domain: 网络
---

# 用户数据报协议（User Datagram Protocol）

### 缩写：UDP

### 简述

无连接数据报：开销小，不保证送达/顺序/去重。适合实时或上层自建可靠；「不可靠」不是「不能用」。

### 使用场景

DNS、实时音视频、游戏、部分隧道与 QUIC 承载。

### 实践与应用

• 明确谁恢复丢包：接受有损 / FEC / 应用重传。
• NAT 后 UDP 映射更脆，规划保活与中继兜底。

### 注意事项

• 无拥塞控制的狂发会伤害共享网络。
• 大 UDP 包易触 MTU/分片问题。

### 相关概念与术语

TCP、QUIC、DNS、NAT 穿透、丢包/抖动。

### 深入与掌握

L1 无连接语义；L2 自建可靠或有损策略；L3 NAT 与拥塞友好。
