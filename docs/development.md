# 开发与运维（Development）

---

## 1. 环境

| 项 | 要求 |
|----|------|
| Node | `>=22.22.2`（推荐 22.22.2，见 `.nvmrc`） |
| 包管理 | npm |
| 可选 | ffmpeg（视频封面）、LibreOffice（Word/PPT→PDF） |

```bash
cd D:\AI\WebMD
npm install
```

---

## 2. 命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服（默认端口 **18087**）；buildStart 会 scan |
| `npm run build` | typecheck → vite client → SSG 全站 |
| `npm run preview` | 静态预览 dist |
| `npm run scan` | 只扫盘 + 预生成旁路（不写全站 HTML） |
| `npm run typecheck` | `tsc` 双项目 |
| `npm run search-index` | 仅重建搜索索引到 public |

### 干净重建

```bash
# 停掉占用端口的 dev 后
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npm run build
npm run preview   # 或 npm run dev
```

---

## 3. 管线（dev / build 同源）

```text
content/
  → scanContent（树，跳过 _Res_*）
  → prepareAllVideoPosters（可选 ffmpeg）
  → prepareAllOfficePreviews（可选 LO）
  → [dev] 按 URL renderFilePage
  → [build] Vite assets + 每文件 pages/**/index.html + cp content→dist/content
  → tree.json / search-index.json
```

| 阶段 | 写 content 源？ | 写 `_Res_*`？ |
|------|-----------------|---------------|
| scan | 否 | 否 |
| 视频/Office prepare | 否 | 是（不覆盖有效文件） |
| SSG / dev render | 否 | 否 |
| 客户端表格编辑 | 否 | 否 |

---

## 4. 关键代码地图

| 路径 | 职责 |
|------|------|
| `scripts/lib/scan.ts` | kind、PAGES_ROOT、pageHref/pageOutDir |
| `scripts/lib/render-page.ts` | 单页装配、URL 匹配（含旧 /f/ 兼容） |
| `scripts/lib/markdown.ts` | MD、代码栏、PDF 壳、下载卡、URL 改写 |
| `scripts/lib/*-preview.ts` | 各类型 shell（Node） |
| `scripts/lib/diagram-export-preview.ts` | 画布/导图旁路图 |
| `scripts/build-site.ts` | SSG |
| `scripts/scan-content.ts` | 制作入口 |
| `src/client.ts` | 布局、下载分流、绑定预览 |
| `src/previews/*` | 图示 bind |
| `src/excel-viewer.ts` | 表格 bind |
| `src/search/*` | 搜索 |
| `site.config.ts` + `config/*` | 配置 |

---

## 5. 扩展：新增预览类型

见 [preview-framework.md](./preview-framework.md) 检查清单。最少步骤：

1. 决定 kind / 扩展名 → `scan.ts`  
2. shell（构建期 HTML）→ `scripts/lib/...`  
3. bind（浏览器）→ `src/previews/` 或 client 调用  
4. style 分区  
5. 样例放入 `content/samples/`  
6. 更新 `formats.md` + `features.md` + `roadmap.md`  
7. `typecheck` + `build`  

---

## 6. 调试建议

| 问题 | 检查 |
|------|------|
| 404 预览 | URL 是否 `/pages/...`；matchFileByUrl |
| 图示不显示 | 控制台；动态 import；消毒是否吃掉 DOM |
| 导出图画不出来 | `_Res_*/preview.*` 是否存在；是否 is-image-page 藏壳 |
| 树缺文件 | 是否误放 `_Res_*` 下 |
| 下载异常 | PC 应原生；手机 Share（client `isMobileClient`） |

---

## 7. 部署

见 [deployment.md](./deployment.md)。  
