# Content 与资源目录（`_res`）约定

> 状态：已确认（产品规则）  
> 实现：重构 WebMD 时落地；当前扫盘逻辑尚未按此过滤。

---

## 1. Content = 文件夹真相

- 用户可浏览、可上下页导航的实体，一律来自仓库内 **`content/`** 目录树。
- 构建/部署时再生成 `dist/` 等产物；**不以 `public/content` 为编辑真相**（见下文「双 content」说明）。

---

## 2. 资源目录：`_Res_` 前缀 / 旧名 `_res`（大小写不敏感）

### 2.1 命名

| 规则 | 说明 |
|------|------|
| 完整前缀 | 忽略大小写后以 **`_res_`** 开头（推荐） |
| 兼容旧名 | 目录名恰好为 `_res` / `_Res` / `_RES` |
| 合法示例 | `_Res_demo`、`_res_MyVideo`、`_RES_foo.mp4`、`_res` |
| 不匹配 | `res`、`resources`、`_resource`、`my_res`（无此前缀） |

> 实现：`lower === '_res' || lower.startsWith('_res_')`

### 2.1.1 旁路资源夹（全站统一命名）

**规范名（新生成一律）**：`_Res_` + **完整文件名（含扩展名）**

```
content/video/
  foo.mp4
  _Res_foo.mp4/poster.jpg              ← ffmpeg 抽帧（制作站点时）

content/notes/
  sample.csv                           ← 源 CSV：页面直接 HTML 表（无需转换）
  sample.xlsx
  _Res_sample.xlsx/
    Demo.csv                           ← 每 sheet 一个 CSV（SheetJS，制作站点时）
    说明.csv
    _sheets.json                       ← 原 sheet 顺序（默认打开第一个）
  sample.docx
  _Res_sample.docx/preview.pdf         ← LibreOffice（Word/PPT；制作站点时）
```

| 源类型 | 制作站点时 | 页面预览 | 本机依赖 |
|--------|------------|----------|----------|
| **CSV** | 无 | 直接嵌入 **HTML 表** | 无 |
| **Excel** | → `_Res_*.xlsx/*.csv` | CSV → **HTML 表**（页签） | Node/SheetJS（随仓库） |
| **Word / PPT** | → `preview.pdf` | **PDF.js** | 可选 LibreOffice |
| **视频** | → `poster.jpg` | `<video poster>` | 可选 ffmpeg |
| **PDF** | 无 | PDF.js | 无 |

- 入口脚本：`npm run scan`、**`npm run dev`**（vite `buildStart` + content 变更重扫）、**`npm run build`**（`build-site` + 同 scan 逻辑）
- 查找优先完整文件名夹；兼容旧名 `_Res_<无扩展名>`（只读）
- **不覆盖**已有有效资源；重生成请先删对应文件再 scan/build
- 无 ffmpeg / 无 LibreOffice：对应步骤跳过；手塞资源仍绑定

### 2.2 扫描语义（自上而下）

```
从 content/ 根向下 DFS/BFS 扫盘
  → 遇到「目录名是 _res（忽略大小写）」
  → 该目录节点：不进入文件夹树
  → 其下**全部递归内容**：
       - 不进入文件夹树
       - 不参与上一页/下一页序列
       - 不被「可浏览文件」列表收录
  → 但构建时仍复制到站点可访问路径
  → 支持通过 URL / 相对路径 / <img> / <video> / 链接 访问与渲染
```

### 2.3 产品动机（你已说明）

一篇文档可能引用大量附图、附件、样例数据：

- 希望 **只展示文档本身** 出现在导航与上下页里；
- 资源放在文档旁的 `_res/`（或任意层级的 `_res/`）里引用；
- **不必**在左侧树里一条条点开每个 png/mp3。

类似 Unity 等引擎里「内置/特殊目录不进默认浏览，但仍可被加载」的思路（类比 Resources 等，仅作概念对照，不必同名）。

### 2.4 路径与引用示例

```text
content/
  guides/
    图生视频入门.md          ← 在树上、在上下页里
    _res/                    ← 整棵子树不进树、不进上下页
      hero.png
      clips/
        demo.mp4
      data.json
```

在 `图生视频入门.md` 中可写：

```markdown
![封面](./_res/hero.png)

<video controls src="./_res/clips/demo.mp4"></video>

[数据](./_res/data.json)
```

部署后对应 URL 仍可访问（具体前缀由构建约定，例如 `/content/guides/_res/hero.png` 或哈希路径），**只是没有导航入口**。

### 2.5 嵌套与多个 `_res`

- 任意深度：`a/b/_res/c/d.png` → `c/d.png` 均不可导航。  
- 多个：`notes/_res/` 与 `notes/daily/_res/` 各自生效。  
- `_res` 内再出现 `_res`：已在祖先 `_res` 下，整段本就不可导航，无需特殊处理。

### 2.6 明确不做的事

| 不做 | 原因 |
|------|------|
| 禁止 HTTP 访问 `_res` | 文档引用需要能加载 |
| 在树上显示为灰显节点 | 当前产品：直接不出现 |
| 把 `_res` 里的 md 当独立文章进上下页 | 与「纯资源」目标冲突 |

若将来需要「资源目录只读列表（管理员）」，另开后台能力，与访客导航分离。

---

## 3. 目录角色（已优化：dev 不再拷贝 content）

| 路径 | 角色 |
|------|------|
| **`content/`** | **唯一内容真相**（手改） |
| **`public/tree.json`** | scan 生成的导航索引（gitignore，可重建） |
| **`public/`** | 仅固定静态 / 生成索引；**不**再镜像整棵 content |
| **`dist/`** | `npm run build` 产物；其中 `dist/content` 为构建时拷贝，可删可重建 |

- **dev**（`npm run dev` → `vite`）：中间件将 `/content/*` **直读** `content/`；启动时插件内 scan 写 `public/tree.json`  
- **build**（`npm run build` → `vite build`）：打包后 `content/` → `dist/content/`  
- 端口只在 `vite.config.ts`（`server.port` + `strictPort: false`，Vite 官方行为）

---

## 4. 与文件夹树 / 上下页的算法接口（实现备忘）

```text
function isResDirName(name: string): boolean

function walk(dir):
  for each entry:
    if entry is directory and isResDirName(entry.name):
      // 可选：登记为「可静态拷贝」但不 yield 导航节点
      copyTreeForDeploy(entry)  // 构建阶段
      continue  // 不 walk 进导航
    if entry is directory:
      yield dir node + walk(children) 过滤后
    if entry is file:
      yield file node  // 进树 + 进 prev/next 序列
```

导航序列 `navSequence[]` **仅**含上述 yield 的 file 节点。

---

## 5. 状态

| 项 | 状态 |
|----|------|
| 产品规则 | ✅ 已确认 |
| scan-content 过滤 | ⏳ 重构时实现 |
| 构建拷贝 `_res` | ⏳ 重构时实现 |
| 文档进站内浏览 | 见 `docs/README.md` 对 docs / content 放置策略 |

---

*确认人：产品讨论 2026-07-30 · 目录名：`_res`（大小写不敏感）*
