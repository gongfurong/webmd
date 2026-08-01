# content 入口说明

这是 **content 内的普通 Markdown**（预览：`/pages/index/`），**不是**站级首页。  
站级首页请点左侧「主页」→ `/`。

---

## content 目录怎么组织

| 目录 | 用途 |
|------|------|
| **`knowledge/`** | 主题知识（AI、量子、ComfyUI…） |
| **`notes/`** | 短笔记、日记 |
| **`guides/`** | 使用说明、图文指南 |
| **`reference/`** | 参考页 |
| **`media/`** | 媒体库：`image/` · `video/` · `audio/` |
| **`samples/`** | **格式预览样例**（开发验收用，非正文） |
| **`scripts/`** | 可预览的脚本样例 |
| **`index.md`** | 本说明 |

### 约定

- **原件**永远在 `content/`；预览页 URL：`/pages/` + 相对路径（`.md` 去掉扩展名）。  
- **旁路资源**（不进树）：与源文件同级 `_Res_<完整文件名>/`（如 `preview.pdf`、`poster.jpg`、`preview.svg`）。  
- 原件直链：`/content/...`  

### 常用命令

```bash
npm run dev       # http://localhost:18087/
npm run build     # 生成 dist/（可整删重建）
npm run preview
```

样例入口：[`samples/README.md`](./samples/README.md)。  
项目元文档（产品/架构）：仓库 `docs/`。
