---
zh: 空值
en: Null
abbr: NULL
nature: domain
domain: 数据库
---

# 空值（Null）

### 缩写：NULL

### 简述

表示「未知/不适用/缺失」的特殊标记，不是零、不是空串。三值逻辑（真/假/未知）使比较与聚合语义容易踩坑。

### 使用场景

可选属性、未填写字段、外连接未匹配侧、稀疏事件属性。

### 实践与应用

• 明确业务：未知 vs 零 vs 空串。
• 过滤用 IS NULL / IS NOT NULL。
• 唯一索引对多 NULL 的行为因产品而异，需查证。

### 注意事项

• NULL 与任何值比较结果都不是 TRUE。
• 聚合常忽略 NULL；COUNT(*) 与 COUNT(col) 不同。

### 对比与易混

NULL ≠ 默认值 0；应用层 Optional/undefined 需映射策略。

### 相关概念与术语

三值逻辑、外连接、约束 NOT NULL、默认值。

### 深入与掌握

L1 知 NULL 含义；L2 正确写谓词与聚合；L3 建模时减少模糊 NULL。
