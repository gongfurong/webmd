# 需求规格（Requirements）

> 可验收条款。实现以代码为准；变更时同步改本文件与 [features.md](./features.md)。  
> 详述行为见 features；架构/缓存见 [architecture.md](./architecture.md)、[deployment.md](./deployment.md)。

---

## 1. 功能需求

### 1.1 内容与导航

| ID | 需求 | 验收 |
|----|------|------|
| F-NAV-01 | 左侧展示 content 文件树 | 含扩展名；`_Res_*` 不出现 |
| F-NAV-02 | 树支持排序/分组/手风琴 | 状态可 localStorage 记忆 |
| F-NAV-03 | 上一页/下一页 | 顺序与**当前树 DOM**一致；底栏固定高度 |
| F-NAV-04 | 路径栏：根图标 / 目录段 / 文件名 | 根图标滚树顶（**不**进主页）；点目录/文件名定位左侧树 |
| F-NAV-05 | 路径栏可下载当前原件 | PC 原生 download；手机 Share 优先 |
| F-NAV-06 | 软导航 | 不整页刷新换正文；连点只跟最后一次（abort 中间请求） |
| F-NAV-07 | 文件信息弹层（info） | 大小·格式一行；可读/转义 URL；三复制按钮一排；路径尽量一行；点内部不关，关按钮/外空白关 |
| F-NAV-08 | 中栏全屏 | 桌面 Fullscreen API；手机 CSS 伪全屏；可退出 |
| F-NAV-09 | 回首页 | 仅顶栏站名/主页图标（或直接打开 `/`） |

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
| F-PV-04 | CSV/Excel 网格预览 | **单元格文本只读**；可列宽/行高/缩放/全选/重载；复制当前表 CSV；**不写源**；底栏可切表不可增删改名 |
| F-PV-05 | 文本/代码高亮页 | 类型栏+复制 |
| F-PV-06 | 独立 .mmd/.puml/.dot 等同文内引擎 | `/pages/...` |
| F-PV-07 | drawio/excalidraw 有 preview.svg 当图 | 无则下载卡 |
| F-PV-08 | xmind/mm 有 preview.png 当图 | 无则下载卡 |
| F-PV-09 | 未知二进制统一下载卡 | 有下载/打开 |

### 1.4 站点壳

| ID | 需求 | 验收 |
|----|------|------|
| F-UI-01 | 三栏布局 + 拖宽/收起 | 宽屏；展开/收起均见 **1px 分割线**（属左右，不属中栏） |
| F-UI-01a | 侧栏收起竖条 | 全高灰 rail + 顶图标；与中栏之间有分割线 |
| F-UI-01b | 侧栏色板 | 顶/底栏灰；**中间导航内容白底** |
| F-UI-01c | 中栏全屏 | 无左右栏、无分割线、无 rail |
| F-UI-02 | 窄屏抽屉 | 断点见 layout 配置 |
| F-UI-03 | 明暗主题 | 记忆；图示随主题 |
| F-UI-04 | 站内搜索 | MiniSearch + 索引；可选本地向量混合（e5-small，见 search.md） |
| F-UI-04a | 向量混合检索 | 开关默认开；同源 `/models` 优先；索引 version/model 校验；关·双·向与双色高亮 |
| F-UI-05 | 404 页 | 静态 404.html |
| F-UI-06 | 内容宽度铺满/固定 | 默认**铺满**（`webmd-content-width-v2`）；路径栏可切换；**表格页始终铺满中栏** |
| F-UI-07 | 软导航加载反馈 | 未命中缓存时：header 下、路径栏上仅进度条（无文字） |
| F-UI-08 | 表格加载/重载 UX | 无表内「加载引擎…」文案；重载无二次确认；工具栏无 −60 白洞 |

### 1.5 构建与内容管线

| ID | 需求 | 验收 |
|----|------|------|
| F-BLD-01 | `npm run build` 产出完整 dist | 可 preview/部署 |
| F-BLD-02 | dist 分区 content/pages/assets | 无散落 f/ |
| F-BLD-03 | 可选视频封面/Office PDF 预生成 | 不覆盖已有有效文件 |
| F-BLD-04 | 预览路径对齐 content | `/pages/` + 相对路径 |
| F-BLD-05 | HTTP 缓存头 | `public/_headers` → dist；assets immutable；HTML 短 max-age+SWR |
| F-BLD-06 | 构建版本可观测 | meta / 控制台 / `window.__WEBMD__`；**不**用版本清空全站页缓存 |

### 1.6 软导航缓存（会话）

| ID | 需求 | 验收 |
|----|------|------|
| F-CACHE-01 | 会话 HTML 缓存 | 离开后约 10min TTL；≤约 48 页；再进可无 loading |
| F-CACHE-02 | SWR | 先缓存后后台对比（ETag/正文）；仅不同才更新；仍在该页可静默刷新 |
| F-CACHE-03 | 预取 | 悬停/触摸文件树或分页链接触发 HTML 预取 |
| F-CACHE-04 | 页级变化判断 | 各页独立；**不**因产品版本号整体失效 |

---

## 2. 非功能需求

| ID | 类别 | 需求 |
|----|------|------|
| NF-01 | 安全 | MD HTML 消毒；无公网图示渲染 API |
| NF-02 | 隐私 | 内容仅仓库与静态托管 |
| NF-03 | 性能 | 首屏 HTML 含正文；大库可按需动态 import；软导航连点不排队 |
| NF-04 | 兼容 | 现代浏览器；移动下载走 Share；手机表格防误弹键盘 |
| NF-05 | 可维护 | 类型适配器独立；文档与行为同步 |
| NF-06 | 可重建 | 删除 dist 后 build 可完全恢复 |
| NF-07 | 部署 | Cloudflare Pages 静态；缓存以 `_headers` 为主，控制台一般无需另配 |

---

## 3. 验收命令

```bash
npm run typecheck
npm run build
# 检查 dist/content、dist/pages、dist/assets、dist/_headers 存在
# 抽查 /pages/notes/hello/ 与 /content/... 原件
# 控制台可见 [WebMD] 版本标签；window.__WEBMD__ 有 version/commit
```
