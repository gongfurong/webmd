---
zh: 网际协议
en: Internet Protocol
abbr: IP
nature: tech
domain: 网络
---

# 网际协议（Internet Protocol）

### 缩写：IP

### 简述

网络层寻址与分组转发的核心（IPv4/IPv6）。尽力投递，不保证可靠与顺序；IP 可达 ≠ 应用可用。

### 使用场景

寻址规划、路由排障、双栈、分片/PMTU 问题。

### 实践与应用

• 先确认解析到的地址族与路由是否达。
• 大包/隧道场景查分片与 PMTUD 是否被 ICMP 策略拦。

### 注意事项

• 私网+NAT 下「源 IP」身份不可靠。
• 只 ping 通不能证明业务端口与协议正常。

### 相关概念与术语

路由、ICMP、NAT、MTU、TCP/UDP。

### 深入与掌握

L1 理解转发；L2 会双栈与分片排障；L3 地址与多出口规划。
