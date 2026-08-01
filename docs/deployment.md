# 部署（Deployment）

> WebMD = **构建期 Node + 运行期纯静态**。

---

## 1. Cloudflare Pages

| 项 | 值 |
|----|-----|
| Framework preset | None / 静态 |
| Build command | `npm run build` |
| Output directory | **`dist`** |
| Node | **`22.22.2`**（`NODE_VERSION` + `.nvmrc`） |

构建机通常**无** LibreOffice / ffmpeg → Word/PPT 预览与视频封面依赖仓库已有 `_Res_*`。

---

## 2. 构建产物

```text
dist/
  index.html / 404.html / _headers
  tree.json / search-index.json
  assets/          # JS/CSS
  content/         # 原 content 拷贝（含 _Res_*）
  pages/           # 预览 HTML
```

线上：

- 预览页 → `/pages/...`  
- 原件 → `/content/...`  

---

## 3. 404

多路径静态 HTML，**不是** SPA History 回退到 index。  
缺页使用 `404.html`（按托管商配置）。

---

## 4. 本地验证部署态

```bash
npm run build
npm run preview
```

---

## 5. FAQ

| 问题 | 处理 |
|------|------|
| Word 预览空白 | 本机生成并提交 `_Res_*.docx/preview.pdf` |
| 视频无封面 | 本机 ffmpeg 生成 poster 或手塞 |
| 构建 OOM | 关注 plantuml 等大包；已动态加载时再查 CI 内存 |  
