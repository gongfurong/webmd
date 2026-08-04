---
zh: 应用程序接口
en: Application Programming Interface
abbr: API
nature: design
domain: 网络
---

# 应用程序接口（Application Programming Interface）

### 缩写：API

### 简述

系统边界上的调用契约（字段、错误、版本）。网络语境下常落在 HTTP 等协议上；API 本身不是传输层协议。

### 使用场景

前后端/伙伴集成、平台开放、服务间契约。

### 实践与应用

• 评审：破坏性变更如何发现、错误是否可机器处理、是否幂等。
• 契约测试防文档漂移。

### 注意事项

• 网络 200 仍可能业务失败——错误模型要分层。
• 内部堆栈直接暴露给调用方。

### 相关概念与术语

REST、RPC、OpenAPI、限流、网关。

### 深入与掌握

L1 契约含义；L2 版本与错误；L3 生态治理。
