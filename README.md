# WebMD

个人 Wiki：**静态 HTML**（正文嵌入页面）+ **GitHub 风 Markdown** + 左树 / 右大纲 / 分页 / 搜索。

对齐 `starlight-vanilla` 的使用体验，技术栈更轻：Vite + markdown-it + Pagefind，**无 Astro/Starlight 运行时**。

## 命令

```bash
cd D:\AI\WebMD
npm install
npm run dev       # 开发（同管线按需渲染完整 HTML）
npm run build     # 静态站点 → dist/ + Pagefind
npm run preview   # 预览 dist
```

| 命令 | 说明 |
|------|------|
| `dev` | `ensure-port` + Vite；页面 HTML 与生产同模板，正文已渲染 |
| `build` | 类型检查 → 打 client → **SSG 全站 HTML** → Pagefind |
| `preview` | 本地静态预览 `dist/`（接近 Cloudflare） |

**端口**：`vite.config.ts` 默认 `18087`；本项目旧进程由 `ensure-port` 释放；其它占用则 Vite 换端口。

## 功能清单（对标 starlight-vanilla）

| 能力 | WebMD |
|------|--------|
| 左文件夹树（含后缀，`_res` 不进树） | ✅ 仅展开当前路径 |
| 中 GitHub 风 md（`github-markdown-css` + hljs） | ✅ 表/删除线/任务列表/锚点 |
| 右大纲 + 滚动高亮 | ✅ |
| 窄屏「本页大纲」+ 抽屉导航 | ✅ |
| 多格式（图/音视频/pdf/文本/代码） | ✅ 嵌入页内 |
| CSV / Excel | ✅ CSV→HTML 表；xlsx→CSV→HTML 表（scan/build/dev） |
| Word / PPT | ✅ LibreOffice→PDF + PDF.js（有 LO 时预生成） |
| PDF | ✅ PDF.js 阅读器 |
| 路径面包屑 | ✅ |
| 上一页 / 下一页 | ✅ |
| 栏宽拖拽 + 收起展开 | ✅ localStorage |
| 代码语言标题 + 复制 | ✅ |
| 站内搜索 | ✅ Pagefind（build 后） |
| 静态部署 / 404 | ✅ 全文在 HTML 中 |
| `/f/...` 预览路由 vs `/content/...` 原始文件 | ✅ |

## 配置

| 文件 | 内容 |
|------|------|
| `vite.config.ts` | 端口、dev 中间件、client 打包 |
| `site.config.ts` | 站点主入口 |
| `config/layout.ts` | 栏宽、断点 |
| `config/content.ts` | content / `_res` |
| `config/markdown.ts` | markdown-it |

## 目录

```
content/           # 内容真相
src/client.ts      # 静态页交互
src/style.css      # 布局 + GitHub md 微调
scripts/build-site.ts
scripts/scan-content.ts   # 制作站点公共入口（树 + 封面 + Excel→CSV + Office→PDF）
scripts/lib/              # scan / markdown / spreadsheet-preview / office-preview / …
dist/              # 发布产物
docs/              # 项目设计文档（非访客 wiki）
```

### 制作站点时预览资源（与 dev/build 同源）

| 步骤 | 何时跑 | 产出 |
|------|--------|------|
| 扫盘写 `tree.json` | scan / dev 启动 / content 变更 / build | `public/tree.json` |
| 视频封面 | 同上，有 **ffmpeg** | `_Res_*.mp4/poster.jpg` |
| **Excel→CSV** | 同上，**不依赖** LibreOffice | `_Res_*.xlsx/*.csv` |
| Word/PPT→PDF | 同上，有 **LibreOffice** | `_Res_*.docx/preview.pdf` 等 |
| 页面渲染 | dev 请求 / SSG | CSV/xlsx→HTML 表；PDF/Office→PDF.js |

访客与线上静态托管**不需要**安装 LibreOffice / ffmpeg。

## 部署 Cloudflare Pages

详细说明见 **[docs/cloudflare-pages.md](./docs/cloudflare-pages.md)**。

| 项 | 值 |
|----|-----|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | **`22.22.2`**（仓库 `.nvmrc` / `.node-version`） |
| 环境变量（推荐再设） | `NODE_VERSION=22.22.2` |

`public/_headers` 会进入产物，用于缓存策略。线上为纯静态，**不需要** Workers。

本机对齐构建 Node：

```bash
nvm use   # 读取 .nvmrc → 22.22.2
npm run build && npm run preview
```
