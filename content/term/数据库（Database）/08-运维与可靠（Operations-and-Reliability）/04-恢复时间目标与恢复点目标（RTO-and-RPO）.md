---
zh: 恢复时间目标与恢复点目标
en: Recovery Time Objective and Recovery Point Objective
abbr: RTO/RPO
nature: metric
domain: 数据库
---

# 恢复时间目标与恢复点目标（Recovery Time Objective and Recovery Point Objective）

### 缩写：RTO/RPO

### 简述

RTO：故障后可接受的最长恢复时间；RPO：可接受的最长数据丢失窗口。二者驱动备份频率、复制同步级别与 HA 投资。

### 使用场景

容灾设计、云多 AZ 选型、演练验收标准。

### 实践与应用

• 业务分级定不同 RTO/RPO。
• 用演练实测对比目标。
• 同步复制降 RPO、增延迟与成本。

### 注意事项

• 目标拍脑袋而不买单等于无效。
• RTO 含检测与决策时间。

### 对比与易混

RTO/RPO vs SLA 可用性百分比；可用性≠零丢数。

### 信号与度量

演练 RTO/RPO、真实事故对比。

### 相关概念与术语

备份、HA、复制、故障转移。

### 深入与掌握

L1 两指标含义；L2 映射架构；L3 成本与风险决策。
