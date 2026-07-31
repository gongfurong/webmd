# Cloudflare Pages 部署

WebMD 是 **构建期 Node + 运行期纯静态** 站点：构建在 Cloudflare 上跑 Node，线上只托管 `dist/`，不依赖 Cloudflare 上的 Node 运行时。

## 控制台设置

| 项 | 值 |
|----|-----|
| **Framework preset** | None / 静态站点 |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | 仓库根（本项目即 WebMD 根目录；若 monorepo 则填子路径） |
| **Node version** | 见下文 |

可选：

- **Install command**：默认 `npm ci` 或 `npm install` 即可  
- 环境变量里再设一遍 `NODE_VERSION`（与 `.nvmrc` 一致更稳）

## Node 版本

仓库已提供：

| 文件 | 作用 |
|------|------|
| [`.nvmrc`](../.nvmrc) | `nvm` / 部分 CI 读取 |
| [`.node-version`](../.node-version) | asdf / 部分 CI 读取 |
| `package.json` → `engines.node` | 声明 `>=22.22.2` |

**推荐构建 Node：`22.22.2`**

- 满足 `isomorphic-dompurify` 等依赖的 engines  
- Cloudflare Pages 可用环境变量指定：

```text
NODE_VERSION=22.22.2
```

Pages 会优先使用 `NODE_VERSION`，其次 `.nvmrc` / `.node-version`。

> 本机可用 Node 24.x 开发；若本地也要贴近 CI，可用 `nvm use`（读 `.nvmrc`）。

### 为何不强制 24.14？

部分依赖（如较新的 isomorphic-dompurify）声明要求 `^22.22.2 || ^24.15.0 || >=26`。  
用 **22.22.2** 或 **24.15+** 均可；仓库默认钉在 **22.22.2**，Pages 兼容面更广。

## 构建做了什么

`npm run build` 大致为：

1. TypeScript 检查  
2. Vite 打包客户端（`dist/assets/*`；`buildStart` 会跑 `scan-content`：树、视频封面、**Excel→CSV**、Word/PPT→PDF）  
3. SSG（`build-site`）：再跑同一套预生成 → 把 `content/`（含 `_Res_*`）与完整 HTML 写入 `dist/`  
4. 写出 `search-index.json`、`tree.json`、`404.html` 等  

线上访问的是静态 HTML + JS/CSS，**不需要** Workers / SSR。  
**Cloudflare 构建机**通常没有 LibreOffice：Word/PPT 预览需本机预生成后提交 `_Res_*/preview.pdf`，或在 CI 安装 LO；**Excel→CSV 只需 Node**，Pages 上可自动导出。

## 产物目录

```
dist/
  index.html          # 站首页
  404.html
  assets/             # client JS/CSS
  content/            # 原始文件（下载/直链）
  **/index.html       # 各文档页
  search-index.json
  tree.json
  _headers            # 自 public/ 复制（若构建链会拷贝 public）
```

确认 Vite 配置会把 `public/` 拷进 `dist/`（当前 Vite 默认行为）；`public/_headers` 用于 Pages 缓存头。

## SPA / 404

本站是 **多路径静态 HTML**（非单页 History 假路由）。  
若某路径无文件，配置 Pages：

- **Not Found handling**：使用 `404.html`（若控制台有该选项）  
- 或保持默认，确保 `dist/404.html` 已生成（`npm run build` 会写）

## 本地对照

```bash
npm install
nvm use          # 或手动安装 Node 22.22.2
npm run build
npm run preview  # 预览 dist，接近线上
```

## 常见问题

| 现象 | 处理 |
|------|------|
| 构建报 Node engines / EBADENGINE | 设置 `NODE_VERSION=22.22.2` 或升级到 24.15+ |
| 页面空白 / 无样式 | 检查 Output 是否为 `dist`，以及 `/assets/*` 是否 200 |
| 搜索无结果 | 确认 `dist/search-index.json` 存在且路径可访问 |
| 大视频/音频构建慢 | 属 `content/` 拷贝体积问题，可考虑 R2 外链媒体 |

## 与本地开发差异

| | 本地 `npm run dev` | Pages 生产 |
|--|-------------------|------------|
| HTML | 中间件按需渲染 | 预生成在 `dist/` |
| Node | 本机进程 | **仅构建** |
| 端口 | 默认 18087 | 443 / 自定义域名 |
