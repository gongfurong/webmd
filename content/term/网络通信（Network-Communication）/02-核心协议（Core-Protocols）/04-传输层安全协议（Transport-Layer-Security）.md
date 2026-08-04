---
zh: 传输层安全协议
en: Transport Layer Security
abbr: TLS
nature: tech
domain: 网络
---

# 传输层安全协议（Transport Layer Security）

### 缩写：TLS

### 简述

为字节流提供加密、完整性与通常的身份认证（证书）。解决信道安全，不自动等于登录鉴权或授权模型；SSL 已淘汰。

### 使用场景

HTTPS、加密 RPC/库连接、mTLS 服务身份。

### 实践与应用

• 校验主机名与证书链；管轮换与吊销。
• 明确 TLS 终结点（边缘还是源站）及对可见性的影响。

### 注意事项

• 关闭校验≈几乎无服务端认证。
• 加密不防端点失陷后的滥用。

### 相关概念与术语

证书/PKI、HTTPS、mTLS、VPN（另一类隧道信任模型）。

### 深入与掌握

L1 信道三要素；L2 证书与套件治理；L3 mTLS/零信任落地。
