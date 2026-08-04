---
zh: 最大传输单元
en: Maximum Transmission Unit
abbr: MTU
nature: tech
domain: 网络
---

# 最大传输单元（Maximum Transmission Unit）

### 缩写：MTU

### 简述

链路一次可承载的最大载荷。路径不一致会导致分片或 PMTU 黑洞；「小包行大包不行」的常见根因之一。

### 使用场景

隧道/VPN、大包传输、存储复制。

### 实践与应用

• 隧道预留封装开销，下调接口 MTU 或钳制 MSS。
• 确认 PMTUD 所需 ICMP 未被误杀。

### 注意事项

• 盲目 1500 在多层隧道上常踩坑。

### 相关概念与术语

分片、PMTUD、MSS、封装。

### 深入与掌握

L1 单帧上限；L2 黑洞排查；L3 全网 MTU 规划。
