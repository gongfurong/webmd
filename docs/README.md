# WebMD 项目文档（`docs/`）

本目录存放 **站点/产品/架构设计**，供开发与决策使用（仓库元文档，不是访客 wiki 正文）。

| 文档 | 内容 |
|------|------|
| [content-and-res-rules.md](./content-and-res-rules.md) | Content 真相、`_Res_*`、CSV/Excel/Office 预览约定 |
| [cloudflare-pages.md](./cloudflare-pages.md) | Cloudflare Pages：Node 版本、构建命令、输出目录、FAQ |
| 根目录 [`site.config.ts`](../site.config.ts) | 站点主配置入口（身份、功能开关，汇总 config/*） |
| [`config/layout.ts`](../config/layout.ts) | 左/中/右栏默认宽度等 |
| [`config/content.ts`](../config/content.ts) | content 根、`_res` 约定 |
| [`config/markdown.ts`](../config/markdown.ts) | Markdown 管线说明（marked + 插件对齐） |
| [`vite.config.ts`](../vite.config.ts) | 构建、本地端口、`dev`/`build`/`preview` |
| [`.nvmrc`](../.nvmrc) / [`.node-version`](../.node-version) | 推荐 Node **22.22.2**（Pages 构建） |

## 命名

- 目录名：**`docs/`**（行业常见：项目文档）
- **`content/`**：用户 wiki 正文（可被站点浏览）
- 若希望站内也能读使用说明，可另在 `content/` 下建如 `0-关于本站/`，不必把全部架构文档公开到导航里

## 重构节奏

全站大重构稍后进行；已确认的规则以本目录文档为准。
