# 一键运维脚本（Mac / Windows）

不经过 AI，双击或命令行即可。逻辑统一走 `scripts/ops.ts`（Node 跨平台）。

## 命令一览

| 你要做的事 | npm | 双击 Windows | 双击 macOS |
|------------|-----|--------------|------------|
| 本地开发服务 | `npm run ops -- dev` | `01-local-dev.cmd` | `01-local-dev.command` |
| 仅增量上传 R2 | `npm run ops -- r2` | `02-r2-upload.cmd` | `02-r2-upload.command` |
| 仅 git 提交推送 | `npm run ops -- git -m "说明"` | `03-git-push.cmd` | `03-git-push.command` |
| R2 + git | `npm run ops -- ship -m "说明"` | `04-r2-and-git.cmd` | `04-r2-and-git.command` |
| build + R2 + git | `npm run ops -- all -m "说明"` | `05-all-build-r2-git.cmd` | `05-all-build-r2-git.command` |
| **强制**全量 R2 | `npm run ops -- r2:force` | `02b-r2-force.cmd` | `02b-r2-force.command` |

macOS 首次：`chmod +x ops/*.command`，若无法打开：系统设置 → 隐私与安全性 → 仍要打开。

## R2 何时上传、何时跳过？

| 方式 | 说明 |
|------|------|
| **默认增量** | 算本地文件 **SHA-256**，与 **`public/models/.r2-upload-manifest.json`** 对比；相同则 **skip**，**不调用** `wrangler put` |
| **Cloudflare 会不会自己忽略相同？** | **不会**。每次 put 都是一次 **Class A** 操作 |
| **会不会按 git diff 推 R2？** | **不会自动**。R2 与 git **解耦**；`ship`/`all` 只是脚本里先 r2 再 git |
| **强制上传** | `--force` 或 `r2:force` |

manifest **请提交 Git**（与模型同目录），换机/他人 clone 后也能 skip。不是 Cloudflare 权威状态；若有人手动改了 R2，需 `--force` 或更新 manifest。

远端 Head 对比默认不做（少 Class B）。

## 和 Cloudflare 自动部署的关系

```text
git push  ──► Pages 自动 build/deploy（站点）
models:r2-upload ──► 只更新 R2 模型（与 Pages 构建分离）
```

- **站点上线**：靠 git push（或 `ops git` / `ship` / `all`）。  
- **模型更新**：靠 `ops r2`（内容变了才 put）。  
- **不必**「先 R2 再 git 部署才能成功」；无 R2 站也能上，只是向量同源会缺模型。

## 什么操作可能产生费用？

以 [R2 定价](https://developers.cloudflare.com/r2/pricing/) 为准（有免费额度）：

| 操作 | 计费维度 | 小站常见 |
|------|----------|----------|
| `r2` 跳过 | **无 Put** | $0 |
| `r2` 真上传 | Class A（写） | 远低于 100 万/月免费 |
| 用户打开向量下载模型 | Class B（读）+ 存储 | 存储 ≪ 10GB；读次免费档 1000 万 |
| Egress | 官方 **Free** | — |
| 反复 `--force` 全量传 113MB | 多次 Class A | 仍难超免费档，但**没必要**，费时间 |
| `git push` / Pages build | Pages/Workers 免费额度 | 一般 $0 |
| 存储总量 > 10 GB-month | 存储费 | 单模型 ~0.12GB，不易 |

**建议：** 日常只用 **`ops r2`（增量）**，不要无事 `r2:force`。

## git 提交说明

```bash
npm run ops -- git -m "fix: 搜索筛选"
# 或
set OPS_GIT_MSG=fix: 搜索筛选   # Windows cmd
export OPS_GIT_MSG='fix: 搜索筛选'  # mac/linux
npm run ops -- ship
```

双击 `03-git-push` / `04` / `05` 未传 `-m` 时使用默认：`chore: ship <时间>`。  
无文件变更则跳过 commit，仍尝试 `git push`。
