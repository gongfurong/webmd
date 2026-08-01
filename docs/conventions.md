# 规范（Conventions）— 人与 AI 共用

执行任何改动前，以本文件 + [docs/README.md](./README.md) §3 为准。

---

## 1. 路径与命名

| 对象 | 规范 |
|------|------|
| content 相对路径 | 使用 `/`；扩展名小写优先 |
| 预览 URL | `/pages/` + 相对路径；**md 去扩展名**；其它**保留扩展名**；尾 `/` |
| 原件 URL | `/content/` + 相对路径（可编码） |
| 旁路夹 | `_Res_` + **完整文件名含扩展名** |
| dist 分区 | 仅 `content/` · `pages/` · `assets/` + 站级文件；**禁止**再引入 `f/` 根目录 |
| 代码标识 | TypeScript camelCase；CSS BEM/组件前缀 `webmd-` / `wiki-` |

---

## 2. 内容规范

1. 知识长文 → `content/knowledge/`  
2. 短记 → `content/notes/`  
3. 格式验收 → `content/samples/`（勿与知识混放）  
4. 媒体复用 → `content/media/{image,video,audio}/`  
5. 禁止提交 Office 锁文件 `~$*`  
6. 不在 content 内提交 `node_modules` / 解压排查目录  

---

## 3. 代码规范

1. **类型预览独立**：新类型不得塞进无关大文件的巨型分支（框架见 preview-framework）。  
2. **不写源文件**；会话态编辑必须可重载丢弃。  
3. **prepare 不覆盖**已有有效旁路文件。  
4. MD 消毒后才能注入 `<button>`（复制钮 enhance 模式）。  
5. 大依赖（PlantUML）优先**动态 import**。  
6. `npm run typecheck` 必须通过。  

---

## 4. 类型栏 + 复制

| 情况 | 是否类型栏+复制 |
|------|-----------------|
| 可复制出「能另存为对应源」的文本 | **要**（代码、DSL、CSV） |
| 位图/PDF/音视频主交付 | **不要**；路径栏下载 |
| 副类型 | 允许 `Mermaid · CLASS` 等形式 |

---

## 5. 文档规范

| 变更类型 | 必更文档 |
|----------|----------|
| 用户可见行为 | features.md、requirements.md（若新需求） |
| 架构/路径/模块 | architecture.md、development.md |
| 新/改格式 | formats.md、preview-framework.md |
| 图示 | diagrams.md |
| content 分类 | content-model.md、相关 README |
| 进度 | roadmap.md |
| 部署 | deployment.md |

文档语言：**中文**为主；标识符/路径保持代码原样。  
写给 AI：**用表格、ID、验收步骤**，避免含糊形容词。

---

## 6. AI 执行协议

```text
1. 读 docs/README.md 地图与硬约束
2. 读相关专题文档（architecture / content-model / preview-framework…）
3. 读代码（scan / render-page / 对应 preview）
4. 改代码 + 必要 content 样例
5. 更新文档
6. typecheck（+ 按需 build）
7. 汇报：改了什么、如何验收、未做边界
```

禁止：静默引入公网渲染 API；静默改 content 真相为生成物覆盖源文件。  
