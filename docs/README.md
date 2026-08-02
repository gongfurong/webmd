# WebMD 文档中心

> **给谁看**：产品决策、开发维护、AI 辅助编程。  
> **不给谁看**：站点访客（访客内容在 `content/`）。  
> **版本**：与代码 `0.2.x` 对齐（2026-08）；构建标签见控制台 / `window.__WEBMD__`。

---

## 0. 30 秒认知

| 项 | 一句话 |
|----|--------|
| **产品** | 个人 Wiki：以 `content/` 为真相的**纯静态**知识站 |
| **体验** | 左树 / 中预览 / 右大纲 · GitHub 风 MD · 多格式预览 |
| **构建** | Node 扫盘 + 可选预生成 + Vite 客户端 + SSG → `dist/` |
| **部署** | Cloudflare Pages 等静态托管，无服务端运行时 |
| **预览 URL** | `/pages/<对齐 content 的路径>/` |
| **原件 URL** | `/content/...` |

---

## 1. 文档地图（必读顺序）

| 顺序 | 文档 | 回答的问题 |
|:----:|------|------------|
| 1 | **[product.md](./product.md)** | 产品是什么、目标用户、价值、原则、边界 |
| 2 | **[requirements.md](./requirements.md)** | 功能/非功能需求、验收标准 |
| 3 | **[features.md](./features.md)** | 界面与行为清单（可测） |
| 4 | **[architecture.md](./architecture.md)** | 技术栈、管线、模块、dist、数据流 |
| 5 | **[content-model.md](./content-model.md)** | content 分类、`_Res_*`、URL 对照 |
| 6 | **[preview-framework.md](./preview-framework.md)** | 类型适配器 prepare/shell/bind/style |
| 7 | **[formats.md](./formats.md)** | 全格式状态与方案（原 catalog + 摘要 matrix） |
| 8 | **[diagrams.md](./diagrams.md)** | 图示族细节与导出约定 |
| 9 | **[development.md](./development.md)** | 命令、dev/build、调试、扩展检查清单 |
| 10 | **[conventions.md](./conventions.md)** | 命名、路径、文档与 AI 协作规范 |
| 11 | **[roadmap.md](./roadmap.md)** | 进度、已做/未做、优先级 |
| 12 | **[deployment.md](./deployment.md)** | Cloudflare Pages 部署 |

### 按角色跳转

| 角色 | 建议阅读 |
|------|----------|
| **产品/验收** | product → requirements → features → roadmap |
| **新开发/AI 首次接入** | 本文件 → product → architecture → content-model → development → conventions |
| **加一种预览类型** | preview-framework → formats → diagrams（若图示）→ development 扩展清单 |
| **改 content 结构** | content-model → conventions |
| **上线** | deployment → development 构建节 |

## 2. 仓库结构（代码 + 内容）

```text
WebMD/
├── content/                 # 【真相】用户内容（见 content-model.md）
│   ├── knowledge/           # 主题知识
│   ├── notes/               # 短笔记
│   ├── media/               # image | video | audio
│   ├── samples/             # 格式验收样例
│   ├── guides/ reference/ scripts/
│   └── index.md
├── src/                     # 浏览器：client、样式、previews/*、search/*
├── scripts/                 # Node：scan、build-site、lib/* 预览 shell
├── config/ + site.config.ts # 配置
├── public/                  # 进 dist 的静态附加（_headers 等）
├── docs/                    # 【本目录】项目元文档
├── dist/                    # 构建产物（可整删重建）
│   ├── content/             # content 拷贝
│   ├── pages/               # 预览 HTML
│   └── assets/
└── package.json
```

---

## 3. 给 AI 的硬约束（执行前必读）

1. **`content/` 是编辑真相**；预览不写回源文件。  
2. **转换产物**只进 **`_Res_<完整文件名>/`**（与源同级），有有效文件**不覆盖**。  
3. **预览类型必须独立适配器**（prepare / shell / bind / style），禁止巨型 switch 揉业务。  
4. **URL**：预览 `/pages/...`，原件 `/content/...`；`dist` 分区 `content` | `pages` | `assets`。  
5. **类型栏+复制**：仅当可复制「能建对应源文件的文本」时使用。  
6. **画布/导图源**不上全量 viewer：draw.io/Excalidraw→SVG，XMind/mm→PNG 旁路。  
7. **改行为必改文档**（至少 features + architecture 或对应专题）。  
8. 提交前：`npm run typecheck`；完整构建：`npm run build`。

---

## 4. 维护检查清单

- [ ] 行为变更 → `features.md` / `requirements.md`  
- [ ] 架构/路径/模块 → `architecture.md` / `development.md`  
- [ ] 新文件类型 → `preview-framework.md` + `formats.md`（+ `diagrams.md`）  
- [ ] content 分类 → `content-model.md` + `content/**/README.md`  
- [ ] 进度 → `roadmap.md`  
- [ ] 部署 / 缓存 / 版本 → `deployment.md`  
- [ ] 软导航 / 路径栏 / 表格只读 → `features.md` + `architecture.md`  

### 近期易漏同步点（2026-08 续）

路径栏 info/树定位/伪全屏；软导航缓存+SWR；表格 `mode:read`；默认铺满；构建版本号；`_headers` 分层缓存。  

**续（布局 + 表格）**：三栏 1px 分割线（收起仍见线 + 灰竖条）；全屏无左右/线；侧栏内容白/顶底灰；表格无加载文案、重载无确认、铺满中栏、滚动条分区、压 moreResize 右上白洞。  

