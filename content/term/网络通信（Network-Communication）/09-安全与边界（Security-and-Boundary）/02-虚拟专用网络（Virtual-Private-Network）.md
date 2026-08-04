---
zh: 虚拟专用网络
en: Virtual Private Network
abbr: VPN
nature: tool
domain: 网络
---

# 虚拟专用网络（Virtual Private Network）

### 缩写：VPN

### 简述

在公网上建加密隧道，近似专网连通或特定隐私路径。上线 ≠ 终端可信；注意分流与隧道 MTU。

### 使用场景

远程办公接入、站点互联。

### 实践与应用

• 分清接入 VPN vs 站点到站点；选全隧道/拆分隧道。
• 预留封装开销，联调 MTU。

### 注意事项

• 出口 IP 变为 VPN 出口，影响封禁与审计。
• 密钥/证书疏于轮换。

### 相关概念与术语

隧道、IPsec/TLS VPN、零信任接入、MTU、防火墙。

### 深入与掌握

L1 加密隧道；L2 接入排障；L3 与零信任并存。
