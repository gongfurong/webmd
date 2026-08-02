# 进度与路线图（Roadmap）

| 字段 | 值 |
|------|-----|
| 当前版本 | **0.2.x** |
| 更新日期 | 2026-08 |

---

## 1. 已完成（Done）

### 平台与壳

- [x] 三栏布局、拖宽、收起、窄屏抽屉  
- [x] 主题明暗、版心固定/铺满（**默认铺满** `webmd-content-width-v2`）  
- [x] 文件树排序/分组/手风琴  
- [x] 路径栏：根图标定位树顶、目录/文件定位树、info 文件信息、版心、全屏、下载  
- [x] 中栏全屏：桌面 Fullscreen API + **手机伪全屏**  
- [x] 下载 PC/手机分流、URL 复制（可读/转义/相对）  
- [x] MiniSearch 站内搜索  
- [x] SSG + Vite；dist 分区 **content / pages / assets**  
- [x] 预览 URL `/pages/` 对齐 content；去掉 `f/`  
- [x] 软导航：连点只跟最后一次、会话 HTML 缓存 + SWR、路径上 loading 条  
- [x] HTTP 缓存 `_headers`；构建版本号（meta / `window.__WEBMD__`，不绑缓存）  

### 内容与资源

- [x] `_Res_*` 不进树；扫盘过滤  
- [x] 视频 poster / Office preview.pdf 可选 prepare  
- [x] content 分类：knowledge / notes / media / samples / …  

### 预览类型

- [x] Markdown + 代码栏 + KaTeX  
- [x] 图片 / 音视频 / PDF.js  
- [x] CSV / Excel：只读文本 + 列宽/缩放等显示操作；类型栏仅类型+复制  
- [x] Word/PPT 经 preview.pdf  
- [x] Mermaid 文内 + `.mmd`  
- [x] PlantUML 文内 + `.puml`（@plantuml/core）  
- [x] Graphviz 文内 + `.dot/.gv`  
- [x] drawio/excalidraw/xmind/mm：旁路 preview 当图  

---

## 2. 明确不做 / 低优先

| 项 | 状态 | 说明 |
|----|------|------|
| draw.io / Excalidraw 全量 viewer | ❌ | 过重；导出 SVG |
| XMind 完整解析预览 | ❌ | 导出 PNG；文内 mindmap |
| 公网 PlantUML 服务 | ❌ | |
| 站内解压 zip | 未做 | |
| 在线写回 content | 未做 | 用 Git |
| 表格写回源文件 / 会话内改单元格 | ❌ | 当前只读文本 |
| 真 MDX 组件 | 未做 | |
| 单壳 SPA 架构切换 | 未做 | 可选未来；见 architecture |
| 用版本号清空全站页缓存 | ❌ | 页级 SWR/ETag；版本仅调试 |

---

## 3. 可选下一步（Backlog）

| 优先级 | 项 | 说明 |
|--------|-----|------|
| P2 | 动态 import Mermaid/Graphviz | 减首包（PlantUML 已动态） |
| P2 | PDF/Excel 模块继续物理拆分 | 从 client 再拆 |
| P3 | 表格解析结果内存缓存 | 再开同一表跳过 stox |
| P3 | `_Res_/preview` 构建辅助脚本 | 文档化 CLI 导出流程即可 |
| P3 | 单壳 SPA 评估 | 仅当强需求根目录极简 HTML 时 |
| P3 | Service Worker | 可选离线；非必须 |

---

## 4. 变更记录（摘要）

| 时期 | 摘要 |
|------|------|
| 2026-08 | 表格定稿 SheetJS；图示三引擎；导图导出约定；pages 分区；content 知识/媒体分类；文档体系重建 |
| 2026-08 续 | 路径栏 info/树定位/伪全屏；软导航缓存+SWR；表格只读文本；默认铺满；构建版本号；`_headers` 分层缓存 |
