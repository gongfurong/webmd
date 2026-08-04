---
zh: 联机分析处理
en: Online Analytical Processing
abbr: OLAP
nature: idea
domain: 数据库
---

# 联机分析处理（Online Analytical Processing）

### 缩写：OLAP

### 简述

面向聚合、多维分析、大范围扫描的工作负载。强调吞吐与列裁剪，延迟容忍通常高于 OLTP。

### 为何出现

交易库难以高效支持复杂历史分析与多维切片。

### 使用场景

数仓报表、经营分析、漏斗与留存、宽表扫描聚合。

### 实践与应用

• 列存/星型或宽表模型常见。
• ETL/ELT 与调度；避免直接压 OLTP。
• 预聚合与物化平衡灵活与速度。

### 注意事项

• 实时性要求要把延迟写进 SLA。
• 维度不一致导致「同指标不同数」。

### 对比与易混

OLAP vs OLTP；ROLAP/MOLAP/HOLAP 实现路径差异。

### 相关概念与术语

列式存储、数仓、ETL、物化视图。

### 深入与掌握

L1 知分析负载特征；L2 选模型与引擎；L3 指标口径与湖仓架构。
