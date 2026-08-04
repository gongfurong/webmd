# C#（C Sharp）

### 缩写：C#

### 简述

静态类型多范式语言，运行于 .NET，支持 OOP、函数式特性与异步语法，常用于 Windows 生态、游戏脚本后端、企业与跨平台服务。

### 使用场景

企业后端、桌面、游戏逻辑、跨平台 .NET 服务。

### 实践与应用

```text
async Task<T> M() {
  var x = await IO();
  return x;
}
// 除事件外慎用 async void
```
### 注意事项

• async void 除事件外慎用
• IDisposable 资源

### 关联术语

• .NET：运行时与生态
• 异步：async/await 全链路
• 静态类型：语言基础
• 垃圾回收：内存管理
