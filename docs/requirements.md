# 需求规格（Requirements）

> 可验收条款。实现以代码为准；变更时同步改本文件与 [features.md](./features.md)。

---

## 1. 功能需求

### 1.1 内容与导航

| ID | 需求 | 验收 |
|----|------|------|
| F-NAV-01 | 左侧展示 content 文件树 | 含扩展名；`_Res_*` 不出现 |
| F-NAV-02 | 树支持排序/分组/手风琴 | 状态可 localStorage 记忆 |
| F-NAV-03 | 上一页/下一页 | 按扫盘扁平序 |
| F-NAV-04 | 路径栏显示相对路径 | 可复制 URL/相对路径 |
| F-NAV-05 | 路径栏可下载当前原件 | PC 原生 download；手机 Share 优先 |
| F-NAV-06 | 软导航 | 不整页刷新切换正文（客户端） |

### 1.2 Markdown 与增强

| ID | 需求 | 验收 |
|----|------|------|
| F-MD-01 | GFM 风格渲染 | 表、任务列表、删除线等 |
| F-MD-02 | 标题锚点 + 右侧大纲 | 滚动联动 |
| F-MD-03 | 代码块类型栏 + 复制 | 复制源码 |
| F-MD-04 | KaTeX 公式 | 文内渲染 |
| F-MD-05 | 文内 Mermaid/PlantUML/Graphviz | 类型栏+内容区+复制 DSL |

### 1.3 多格式预览

| ID | 需求 | 验收 |
|----|------|------|
| F-PV-01 | 图片/音视频全页预览 | 原件 `/content` |
| F-PV-02 | PDF 用 PDF.js | 非系统 PDF 壳 |
| F-PV-03 | Word/PPT 有 preview.pdf 时 PDF 预览 | 下载仍为 Office 原件 |
| F-PV-04 | CSV/Excel 可编辑网格 | 不写源；可复制 CSV |
| F-PV-05 | 文本/代码高亮页 | 类型栏+复制 |
| F-PV-06 | 独立 .mmd/.puml/.dot 等同文内引擎 | `/pages/...` |
| F-PV-07 | drawio/excalidraw 有 preview.svg 当图 | 无则下载卡 |
| F-PV-08 | xmind/mm 有 preview.png 当图 | 无则下载卡 |
| F-PV-09 | 未知二进制统一下载卡 | 有下载/打开 |

### 1.4 站点壳

| ID | 需求 | 验收 |
|----|------|------|
| F-UI-01 | 三栏布局 + 拖宽/收起 | 宽屏 |
| F-UI-02 | 窄屏抽屉 | 断点见 layout 配置 |
| F-UI-03 | 明暗主题 | 记忆；图示随主题 |
| F-UI-04 | 站内搜索 | MiniSearch + 索引 |
| F-UI-05 | 404 页 | 静态 404.html |

### 1.5 构建与内容管线

| ID | 需求 | 验收 |
|----|------|------|
| F-BLD-01 | `npm run build` 产出完整 dist | 可 preview/部署 |
| F-BLD-02 | dist 分区 content/pages/assets | 无散落 f/ |
| F-BLD-03 | 可选视频封面/Office PDF 预生成 | 不覆盖已有有效文件 |
| F-BLD-04 | 预览路径对齐 content | `/pages/` + 相对路径 |

---

## 2. 非功能需求

| ID | 类别 | 需求 |
|----|------|------|
| NF-01 | 安全 | MD HTML 消毒；无公网图示渲染 API |
| NF-02 | 隐私 | 内容仅仓库与静态托管 |
| NF-03 | 性能 | 首屏 HTML 含正文；大库可按需动态 import（PlantUML） |
| NF-04 | 兼容 | 现代浏览器；移动下载走 Share |
| NF-05 | 可维护 | 类型适配器独立；文档与行为同步 |
| NF-06 | 可重建 | 删除 dist 后 build 可完全恢复 |

---

## 3. 验收命令

```bash
npm run typecheck
npm run build
# 检查 dist/content、dist/pages、dist/assets 存在
# 抽查 /pages/notes/hello/ 与 /content/... 原件
```
