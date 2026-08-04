---
zh: 网络地址转换
en: Network Address Translation
abbr: NAT
nature: tech
domain: 网络
---

# 网络地址转换（Network Address Translation）

### 缩写：NAT

### 简述

在边界改写 IP/端口，实现私网共享出口或隐藏拓扑。主动出站易、入站难；破坏纯端到端，长连接受映射超时影响。

### 使用场景

家庭/企业出口、云 NAT、容器网络、P2P 穿透。

### 实践与应用

• 入站用映射/中继；长连接配保活。
• 日志关联保存完整四元组映射。

### 注意事项

• CGNAT 下按公网 IP 封禁误伤大。
• 穿透依赖映射类型，需失败兜底。

### 相关概念与术语

私网地址、STUN/TURN、防火墙、IPv6。

### 深入与掌握

L1 地址端口改写；L2 入站与超时；L3 大规模可观测。
