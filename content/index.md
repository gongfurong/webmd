# index.md

这是 **content 里的普通 Markdown 文件**（路由 `/index/`），不是站点主页。

站级主页是左侧栏「主页」→ `/`（构建产物为 `index.html`）。

---

**WebMD**：静态 HTML Wiki，正文嵌在页面内，Markdown 使用 **GitHub 风格**渲染。

## 布局

| 区域 | 作用 |
|------|------|
| 左 | 文件夹树（含扩展名；`_Res_*` / `_res` 不进树，忽略大小写） |
| 中 | 正文 + 面包屑 + 上一页/下一页 |
| 右 | 本页大纲（窄屏折叠为「本页大纲」） |
| 顶 | 站名、文件/大纲切换、**搜索**（`npm run build` 后） |

## 多格式（不另写包装 md）

文件直接放进 `content/`：

| 类型 | 例子 | 路由 |
|------|------|------|
| Markdown | `notes/hello.md` | `/notes/hello/` |
| 图片 | `image/1.jpg` | `/f/image/1.jpg/` |
| 视频/音频 | `video/*.mp4`、`audio/*.mp3` | `/f/.../` |
| PDF | `notes/sample.pdf` | `/f/notes/sample.pdf/`（Blob 内嵌预览） |
| 文本/代码 | `notes/sample.txt`、`script/*.py` | `/f/.../` 高亮 + 复制 |

原始文件始终可通过 `/content/...` 访问（构建后在 `dist/content/`）。

## 命令

```bash
npm install
npm run dev       # 开发：与生产同模板，按需渲染完整 HTML
npm run build     # 静态站 → dist/ + Pagefind
npm run preview   # 预览 dist
```

默认端口见 `vite.config.ts`（`18087`）。

## 与 starlight-vanilla 对齐

左树 / 右大纲 / 分页 / 面包屑 / 拖宽收起 / 多格式预览 / 代码复制 / Pagefind 搜索 / 静态部署。
