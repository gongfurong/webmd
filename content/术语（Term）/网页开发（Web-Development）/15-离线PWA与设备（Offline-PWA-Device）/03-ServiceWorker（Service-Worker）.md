# ServiceWorker（Service Worker）

### 缩写：SW

### 简述

可拦截网络请求、做缓存与后台能力的 worker 脚本，需安全上下文。

### 组成与要点

```text
注册 → 安装 → 激活 → fetch/push 等事件
```

### 实践与应用

• 版本化缓存
• skipWaiting 策略谨慎

### 关联术语

• Cache API：存储
• 推送：能力
• 安全上下文：前提
