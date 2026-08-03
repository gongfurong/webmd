# 内容模型（Content Model）

> **content = 编辑真相**；`_Res_*` = 旁路；URL 与 dist 对照见下。

---

## 1. content 目录分类（现行）

```text
content/
├── index.md                 # content 内说明（非站首页）
├── knowledge/               # 主题知识长文
│   ├── AI/
│   ├── 量子/
│   ├── comfyui/
│   └── README.md
├── term/                    # 术语库（一词一文件，主题分目录）
│   └── 网络通信（Network-Communication）/
│       ├── README.md        # 主题说明 + 子目录索引
│       └── 分层与基础概念（…）/
│           ├── README.md
│           └── 端口（Port）.md
├── notes/                   # 短笔记 / 日记
│   ├── hello.md
│   └── daily/
├── guides/                  # 指南
├── reference/               # 参考
├── media/                   # 媒体库
│   ├── image/
│   ├── video/               # 可有 _Res_<视频全名>/poster.jpg
│   ├── audio/
│   └── README.md
├── samples/                 # 格式验收样例（非知识正文）
│   ├── diagrams/            # 图示引擎与画布源
│   ├── office/              # 表格/Office/PDF
│   ├── archives/
│   ├── text/
│   └── README.md
└── scripts/                 # 可预览脚本样例
```

### 分类原则

| 目录 | 放什么 | 不放什么 |
|------|--------|----------|
| knowledge | 主题手册、调研 | 一次性日记 |
| **term** | 术语词条（建议一词一 md；主题用子目录 + 可选 README） | 长文手册（放 knowledge） |
| notes | 短记、log | 大型手册 |
| media | 跨文复用的图音视频 | 仅某文私有且应进 _Res_ 的碎图可仍放文旁 _Res_ |
| samples | 开发/验收格式 | 正式知识 |
| guides/reference | 说明与参考 | 原始数据 dump |

### 1.1 文件夹与 README（无强制 index）

| 约定 | 说明 |
|------|------|
| **不强制** `index.md` | 目录落地说明用 `README.md` 即可；也可没有 |
| README 里链子目录 | 写 `./子目录/` → 站内改写为树 **focus**（见 features §3.2.2），**不**生成目录页、不 404 |
| 要打开 README 正文 | 显式写 `./子目录/README.md` |
| 树即索引 | 左侧文件树是权威结构；README 索引可选 |

---

## 2. `_Res_*` 旁路资源

### 2.1 规则

| 规则 | 说明 |
|------|------|
| 命名 | `_Res_` + **完整文件名（含扩展名）**，与源**同级** |
| 扫盘 | **不进树、不进上下页** |
| 访问 | 仍可 `/content/.../_Res_.../文件` |
| 写入 | prepare **不覆盖**已有有效文件 |
| 拷贝 | build → `dist/content/` 一并带上 |

### 2.2 常见产物

| 源 | 旁路文件 | 谁生成 |
|----|----------|--------|
| `*.mp4` | `poster.jpg` | ffmpeg（可选） |
| `*.docx/pptx` | `preview.pdf` | LibreOffice（可选） |
| `*.drawio` / `*.excalidraw` | `preview.svg`（优先） | 作者导出 |
| `*.xmind` / `*.mm` | `preview.png`（优先） | 作者导出 |

示例：

```text
content/media/video/foo.mp4
content/media/video/_Res_foo.mp4/poster.jpg

content/samples/office/sample.docx
content/samples/office/_Res_sample.docx/preview.pdf
```

---

## 3. URL 与 dist 对照

| 对象 | URL | dist 位置 |
|------|-----|-----------|
| 站首页 | `/` | `dist/index.html` |
| MD 预览 | `/pages/notes/hello/` | `dist/pages/notes/hello/index.html` |
| 文件预览 | `/pages/media/image/1.jpg/` | `dist/pages/media/image/1.jpg/index.html` |
| 原件 | `/content/media/image/1.jpg` | `dist/content/media/image/1.jpg` |
| 旁路 | `/content/.../_Res_.../preview.svg` | 同结构在 dist/content |

**md**：路径去掉 `.md`。  
**其它文件**：路径**保留扩展名**。

---

## 4. 扫盘 kind（摘要）

| kind | 扩展名示例 | 预览策略 |
|------|------------|----------|
| markdown | md, mdx | marked → HTML |
| text | txt, py, mmd, puml, dot… | 源码栏或图示引擎 |
| image / video / audio | 常见媒体 | media-stage |
| pdf | pdf | PDF.js |
| file | zip, drawio, xmind… | 下载卡或旁路图 |

完整表见 [formats.md](./formats.md)。

---

## 5. 变更 content 结构时

1. 移动文件后全局搜旧路径（content 内链、docs 样例路径）。  
2. 更新各目录 `README.md`。  
3. `npm run build` 验证树与 pages。  
4. 同步本文件与 [roadmap.md](./roadmap.md) 若影响样例。  
