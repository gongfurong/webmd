# 本地模型 SWE 能力评测详细流程  
## Qwen3.6-35B-A3B × GLM-4.7-Flash

> **目标**：在同一套标准下，对比两个本地模型的 **软件工程（修真实仓库 bug）** 能力。  
> **方法**：mini-SWE-agent（bash Agent）+ SWE-bench（Docker 自动判分）。  
> **日期**：2026-07-13  
> **适用系统**：Linux 最佳；Windows 请用 **WSL2 + Docker Desktop**（强烈推荐，原生 Windows 坑多）。

---

# 0. 先看懂：你到底在做什么

```
┌─────────────────────────────────────────────────────────┐
│  题库 SWE-bench：真实 GitHub issue + 仓库快照 + 测试     │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  mini-SWE-agent：只给 bash，让模型多轮「读代码→改→测」   │
└───────────────────────────┬─────────────────────────────┘
                            │ 每次「思考」都调用你的本地 API
         ┌──────────────────┼──────────────────┐
         ▼                                     ▼
  Qwen3.6-35B-A3B 服务              GLM-4.7-Flash 服务
  (vLLM / llama-server)             (vLLM / SGLang)
         │                                     │
         └──────────────────┬──────────────────┘
                            ▼
              产出 predictions（每题一个 patch）
                            ▼
              Docker 跑测试 → 通过率 % Resolved
```

**两个模型用同一 Agent、同一题集、同一超时**，才有可比性。

---

# 1. 模型是什么（避免下错）

| 你说的名字 | 建议对应的开源权重 | 类型 | 说明 |
|------------|-------------------|------|------|
| **Qwen3.6 35B** | [`Qwen/Qwen3.6-35B-A3B`](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) | MoE，总参约 35B，激活约 3B | 偏 agentic coding；GGUF 可用 Unsloth 等 |
| **GLM-4.7 Flash** | [`zai-org/GLM-4.7-Flash`](https://huggingface.co/zai-org/GLM-4.7-Flash) | MoE，约 30B-A3B | 官方宣称 SWE-bench Verified 等上分数较高；本地优先 **vLLM/SGLang** |

> 若 HF 上显示名为 `Qwen3.5-35B-A3B`，以你本机实际下载的 **3.6** 卡片为准。  
> 量化版体积更小，但 SWE 分数可能略降——**对比时两模型尽量同一精度策略**（都 BF16 或都 4bit）。

### 硬件粗估（仅推理服务）

| 配置 | Qwen3.6-35B-A3B | GLM-4.7-Flash |
|------|-----------------|---------------|
| BF16/FP16 满血 | 多卡或 ≥48–80GB 级显存更稳（MoE 实现差异大） | 官方示例常 `--tp 4`；单卡需量化 |
| **消费级实用** | **Q4 GGUF / AWQ**，24GB 可试；12–16GB 要更激进量化或 CPU offload | 同样建议 **量化 + vLLM** 或大统一内存 |
| SWE 跑题 | 还要 Docker 容器，磁盘 **≥50–100GB** 空闲 | 同左 |

**磁盘**：SWE-bench Docker 镜像很大；建议预留 **80GB+**。

---

# 2. 推荐总流程（时间线）

| 阶段 | 内容 | 预计 |
|------|------|------|
| A | 环境：Docker、Python、HF 登录 | 0.5–1h |
| B | 分别启动两个模型的 API，curl 冒烟 | 1–3h（下载权重最长） |
| C | 装 mini-SWE-agent + SWE-bench | 0.5h |
| D | **各跑 1 题** 打通 | 0.5–2h |
| E | **各跑 10 题** 粗比 | 数小时～1 天 |
| F | （可选）Lite / Verified 全量 | 数天 + 电费 |
| G | 汇总表格 | 0.5h |

**建议：先完成 D→E，再决定是否全量。**

---

# 3. 环境准备（一次性）

## 3.1 系统检查

```bash
# 在 WSL2 Ubuntu 或 Linux 终端
docker --version          # Docker 必须运行中
docker run --rm hello-world
nvidia-smi                # 有 NVIDIA 时
python3 --version         # 建议 3.10+
df -h                     # 看磁盘
```

Windows：安装 **Docker Desktop**，启用 **WSL2 后端**，以下命令都在 **WSL 里**执行。

## 3.2 目录规划

```bash
mkdir -p ~/swe-eval/{models,configs,runs,preds}
cd ~/swe-eval
```

| 目录 | 用途 |
|------|------|
| `models/` | 可选：权重软链 |
| `configs/` | mini 配置、registry |
| `runs/` | Agent 轨迹日志 |
| `preds/` | predictions.jsonl |

## 3.3 Hugging Face（下载权重）

```bash
pip install -U "huggingface_hub[cli]"
huggingface-cli login     # 部分模型可能需同意协议
```

---

# 4. 启动本地推理服务（二选一引擎）

> **SWE Agent 强烈建议 vLLM（或 SGLang）**：需要 **稳定的 OpenAI 兼容 Chat + tool/function call（bash 工具）**。  
> 纯 Ollama 对部分新架构/工具调用支持不完整时，优先 vLLM。

---

## 4.1 方案 A：vLLM 起两个端口（推荐对比）

### 4.1.1 安装 vLLM

```bash
# 按你 CUDA 版本安装；GLM 文档要求较新的 nightly 时：
pip install -U vllm --pre --index-url https://pypi.org/simple \
  --extra-index-url https://wheels.vllm.ai/nightly

# GLM 官方还建议较新的 transformers
pip install -U git+https://github.com/huggingface/transformers.git
```

> 若安装失败：到 [vLLM 文档](https://docs.vllm.ai/) 查与你驱动匹配的稳定版。

### 4.1.2 终端 1：启动 Qwen3.6-35B-A3B

```bash
# 显存够用可去掉量化相关参数；不够再加 AWQ/GPTQ 社区量化权重
export CUDA_VISIBLE_DEVICES=0

vllm serve Qwen/Qwen3.6-35B-A3B \
  --host 0.0.0.0 \
  --port 8001 \
  --served-model-name qwen3.6-35b-a3b \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

说明：

- `--tool-call-parser` 名称以 **vLLM 对 Qwen 的实际支持**为准（可能是 `hermes` / `qwen` 等，报错时查当前 vLLM 文档）。  
- 单卡装不下时：换量化仓库，或加 `--tensor-parallel-size 2` 多卡。  
- MoE 可用社区 GGUF + **llama-server**（见 4.2）。

### 4.1.3 终端 2：启动 GLM-4.7-Flash

官方卡片示例（多卡；单卡需改 `tp` 与量化）：

```bash
export CUDA_VISIBLE_DEVICES=0   # 或多卡 0,1,2,3

vllm serve zai-org/GLM-4.7-Flash \
  --host 0.0.0.0 \
  --port 8002 \
  --served-model-name glm-4.7-flash \
  --tensor-parallel-size 1 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --tool-call-parser glm47 \
  --reasoning-parser glm45 \
  --enable-auto-tool-choice
```

- 官方满血示例常用 `--tensor-parallel-size 4`；**按你的卡数改**。  
- 需要 speculative 可加官方 `--speculative-config...`（可选，先求稳定）。  
- 来源：https://huggingface.co/zai-org/GLM-4.7-Flash  

**同一时间只开一个服务也行**（显存不够时）：先测完 Qwen 关掉，再起 GLM。

### 4.1.4 冒烟测试（两个都要过）

```bash
# Qwen
curl -s http://127.0.0.1:8001/v1/models | head

curl -s http://127.0.0.1:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.6-35b-a3b",
    "messages": [{"role":"user","content":"用一句话介绍你自己"}],
    "max_tokens": 64
  }'

# GLM
curl -s http://127.0.0.1:8002/v1/models | head

curl -s http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{"role":"user","content":"用一句话介绍你自己"}],
    "max_tokens": 64
  }'
```

能返回 JSON 内容再进入下一步。

---

## 4.2 方案 B：llama.cpp / Ollama（显存紧时）

### Qwen GGUF 示例

```bash
# 下载 Unsloth 等 GGUF（选 Q4_K_M / Q5 等）
# https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF

# llama-server 提供 OpenAI 兼容
./llama-server \
  -m /path/to/Qwen3.6-35B-A3B-Q4_K_M.gguf \
  --host 0.0.0.0 --port 8001 \
  -ngl 99 -c 16384 \
  --jinja
```

Ollama（若你的 Ollama 版本已支持该架构）：

```bash
# 名称以 ollama.com / 你导入的 Modelfile 为准
ollama run qwen3.6:35b-a3b
# API: http://127.0.0.1:11434/v1
```

### GLM

优先 vLLM；若有社区 GGUF，同样用 `llama-server --port 8002`。

**注意**：GGUF 路径上 **tool calling 成功率** 往往低于 vLLM 满血，SWE 分数可能系统性偏低——对比时在报告里写明「GGUF Q4」还是「BF16 vLLM」。

---

# 5. 安装评测栈

## 5.1 mini-SWE-agent

```bash
cd ~/swe-eval
git clone https://github.com/SWE-agent/mini-swe-agent.git
cd mini-swe-agent
pip install -e .

# 快速确认 CLI
mini-extra --help
# 或: python -m minisweagent --help
```

文档：

- 本地模型：https://mini-swe-agent.com/latest/models/local_models/  
- SWE-bench 批跑：https://mini-swe-agent.com/latest/usage/swebench/  
- Verified 说明：https://www.swebench.com/verified.html  

## 5.2 SWE-bench harness（判分）

```bash
cd ~/swe-eval
git clone https://github.com/swe-bench/SWE-bench.git
cd SWE-bench
pip install -e .
```

确认：

```bash
python -m swebench.harness.run_evaluation --help
```

---

# 6. 写配置：让 Agent 打到你的本地模型

## 6.1 成本注册表（本地必做）

本地模型没有官方定价，不配会报 cost 错。

```bash
mkdir -p ~/swe-eval/configs
cat > ~/swe-eval/configs/registry.json << 'EOF'
{
  "qwen3.6-35b-a3b": {
    "max_tokens": 32768,
    "max_input_tokens": 32768,
    "max_output_tokens": 16384,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "openai",
    "mode": "chat"
  },
  "openai/qwen3.6-35b-a3b": {
    "max_tokens": 32768,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "openai",
    "mode": "chat"
  },
  "glm-4.7-flash": {
    "max_tokens": 32768,
    "max_input_tokens": 32768,
    "max_output_tokens": 16384,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "openai",
    "mode": "chat"
  },
  "openai/glm-4.7-flash": {
    "max_tokens": 32768,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "openai",
    "mode": "chat"
  },
  "hosted_vllm/qwen3.6-35b-a3b": {
    "max_tokens": 32768,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "hosted_vllm",
    "mode": "chat"
  },
  "hosted_vllm/glm-4.7-flash": {
    "max_tokens": 32768,
    "input_cost_per_token": 0.0,
    "output_cost_per_token": 0.0,
    "litellm_provider": "hosted_vllm",
    "mode": "chat"
  }
}
EOF
```

```bash
export LITELLM_MODEL_REGISTRY_PATH=~/swe-eval/configs/registry.json
export MSWEA_COST_TRACKING=ignore_errors
# 也可永久：mini-extra config set MSWEA_COST_TRACKING ignore_errors
```

## 6.2 Qwen 用配置片段

复制官方 swebench 配置再改（路径以你 clone 的仓库为准）：

```bash
# 找到类似路径
ls mini-swe-agent/src/minisweagent/config/benchmarks/swebench.yaml
# 或
ls mini-swe-agent/src/minisweagent/config/extra/swebench.yaml

cp mini-swe-agent/src/minisweagent/config/benchmarks/swebench.yaml \
   ~/swe-eval/configs/swebench_qwen.yaml
```

编辑 `~/swe-eval/configs/swebench_qwen.yaml`，**确保 model 段类似**（与官方 local_models 文档一致）：

```yaml
model:
  model_name: "openai/qwen3.6-35b-a3b"
  # 或: "hosted_vllm/qwen3.6-35b-a3b"
  cost_tracking: "ignore_errors"
  litellm_model_registry: "/home/你的用户名/swe-eval/configs/registry.json"
  model_kwargs:
    custom_llm_provider: "openai"
    api_base: "http://127.0.0.1:8001/v1"
    api_key: "EMPTY"
    temperature: 0.7
    # max_tokens: 8192   # 若需限制输出
```

Ollama 时改为：

```yaml
  model_kwargs:
    custom_llm_provider: "openai"
    api_base: "http://127.0.0.1:11434/v1"
    api_key: "ollama"
```

且 `model_name` 写成 Ollama 实际名（如 `openai/qwen3.6:35b-a3b`），**registry 键必须完全一致（大小写敏感）**。

## 6.3 GLM 用配置

```bash
cp ~/swe-eval/configs/swebench_qwen.yaml ~/swe-eval/configs/swebench_glm.yaml
```

改成：

```yaml
model:
  model_name: "openai/glm-4.7-flash"
  cost_tracking: "ignore_errors"
  litellm_model_registry: "/home/你的用户名/swe-eval/configs/registry.json"
  model_kwargs:
    custom_llm_provider: "openai"
    api_base: "http://127.0.0.1:8002/v1"
    api_key: "EMPTY"
    temperature: 0.7   # 官方 SWE 评测参数取向：temp 0.7, top_p 1.0
```

官方 SWE/Terminal 参数提示（HF 卡片）：temperature **0.7**，top-p **1.0**，max new tokens **16384**。  
来源：https://huggingface.co/zai-org/GLM-4.7-Flash  

Qwen 侧建议也固定同一 temperature，便于公平。

---

# 7. 跑题：从 1 题 → 10 题 → 可选全量

> 以下 `mini-extra swebench` 参数以当前文档为准；若 CLI 有变，以  
> https://mini-swe-agent.com/latest/usage/swebench/  
> 为准，**逻辑不变：指定 config + subset + filter**。

## 7.1 阶段 D：只跑 1 题（必须先成功）

文档示例 instance：`django__django-11099`（Verified 中的一题）。

**Qwen：**

```bash
export LITELLM_MODEL_REGISTRY_PATH=~/swe-eval/configs/registry.json
export MSWEA_COST_TRACKING=ignore_errors
export OPENAI_API_KEY=EMPTY   # 有的路径仍会读这个

cd ~/swe-eval/mini-swe-agent

# 若支持 --config 指向你的 yaml：
LITELLM_MODEL_REGISTRY_PATH=~/swe-eval/configs/registry.json \
mini-extra swebench \
  --config ~/swe-eval/configs/swebench_qwen.yaml \
  --output ~/swe-eval/runs/qwen_smoke/ \
  --subset verified \
  --split test \
  --filter '^(django__django-11099)$'
```

若官方用编辑 `swebench.yaml` 而不是 `--config`，则：

1. 直接改仓库内 `swebench.yaml` 为 Qwen 的 api_base；  
2. 再执行文档中的 `mini-extra swebench --output ... --filter ...`。

**成功标志：**

- `~/swe-eval/runs/qwen_smoke/` 下有 trajectory / 日志  
- 有生成的 patch 或 predictions  

**GLM：** 换 `swebench_glm.yaml`、输出目录 `glm_smoke`，**确保 8002 服务已开**。

## 7.2 阶段 E：各跑 10 题（正式粗比）

自己列 10 个 instance_id（从数据集抽样），例如用 Python：

```bash
pip install datasets
python << 'PY'
from datasets import load_dataset
ds = load_dataset("princeton-nlp/SWE-bench_Verified", split="test")
# 或 SWE-bench_Lite
ids = ds["instance_id"][:10]
print("|".join(f"^{i}$" for i in ids))
for i in ids:
    print(i)
PY
```

把打印的 regex 填进 `--filter`，例如：

```bash
FILTER='^(id1|id2|id3|...)$'

# Qwen
mini-extra swebench \
  --config ~/swe-eval/configs/swebench_qwen.yaml \
  --output ~/swe-eval/runs/qwen_10/ \
  --subset verified \
  --split test \
  --filter "$FILTER"

# GLM（可换机器时段跑）
mini-extra swebench \
  --config ~/swe-eval/configs/swebench_glm.yaml \
  --output ~/swe-eval/runs/glm_10/ \
  --subset verified \
  --split test \
  --filter "$FILTER"
```

**两模型必须用同一 `$FILTER` 题单。**

## 7.3 若工具直接产出 predictions.jsonl

把轨迹里的 patch 汇总成：

```bash
# 示意路径，以实际输出为准
ls ~/swe-eval/runs/qwen_10/
# 可能已有 preds.jsonl；否则需脚本从 trajectory 提取 model_patch
```

每行格式：

```json
{"instance_id":"django__django-11099","model_name_or_path":"qwen3.6-35b-a3b","model_patch":"diff --git ..."}
```

## 7.4 阶段：SWE-bench 自动判分

```bash
cd ~/swe-eval/SWE-bench

# Qwen
python -m swebench.harness.run_evaluation \
  --dataset_name princeton-nlp/SWE-bench_Verified \
  --predictions_path ~/swe-eval/preds/qwen_10.jsonl \
  --max_workers 2 \
  --run_id qwen36_10

# GLM
python -m swebench.harness.run_evaluation \
  --dataset_name princeton-nlp/SWE-bench_Verified \
  --predictions_path ~/swe-eval/preds/glm_10.jsonl \
  --max_workers 2 \
  --run_id glm47flash_10
```

首次会拉 Docker 镜像，**很久**；之后会快一些。

结果一般在报告目录里，统计 **resolved 数量 / 总数**。

Lite 练习可改：

```text
--dataset_name princeton-nlp/SWE-bench_Lite
```

---

# 8. 可选：全量 Lite / Verified

| 集合 | 题量级 | 建议 |
|------|--------|------|
| Lite | ~300 | 认真对比的最低完整档 |
| Verified | 500 | 对齐公开叙事；耗时长 |

```bash
# 示例：Verified 全量（去掉 --filter）
mini-extra swebench \
  --config ~/swe-eval/configs/swebench_qwen.yaml \
  --output ~/swe-eval/runs/qwen_verified/ \
  --subset verified \
  --split test
```

并发：本地模型建议 **workers=1**，避免显存与上下文打架。

---

# 9. 记录结果（直接复制填表）

## 9.1 实验元数据（两模型各填一份）

| 字段 | Qwen3.6-35B-A3B | GLM-4.7-Flash |
|------|-----------------|---------------|
| 权重来源 | | |
| 精度/量化 | BF16 / Q4 / … | |
| 推理引擎 | vLLM x.x / llama.cpp | |
| GPU | | |
| max-model-len | | |
| temperature | 0.7 | 0.7 |
| Agent | mini-SWE-agent 版本 | 同左 |
| 数据集 | Verified-10 / Lite / … | 同左 |
| 单题步数上限 | | |
| 日期 | | |

## 9.2 成绩表

| 模型 | 题数 N | Resolved | % Resolved | 平均耗时/题 | 备注 |
|------|--------|----------|------------|-------------|------|
| Qwen3.6-35B-A3B | 10 | | | | |
| GLM-4.7-Flash | 10 | | | | |

## 9.3 失败归因（建议抽 5 题看轨迹）

| 类型 | 次数 Qwen | 次数 GLM |
|------|-----------|----------|
| 找不到文件 | | |
| 改错位置 | | |
| 补丁格式坏 | | |
| 超时/步数用尽 | | |
| 工具调用格式错 | | |
| 测过了但逻辑糊弄 | | |

---

# 10. 公平对比检查清单

| # | 检查项 |
|---|--------|
| 1 | 同一 SWE-bench 子集与同一批 instance_id |
| 2 | 同一 mini-SWE-agent 版本与配置模板 |
| 3 | 同一 temperature / 相近 max_tokens |
| 4 | 相近上下文长度限制 |
| 5 | 精度策略写清楚（勿 BF16 对 Q2） |
| 6 | 不混用不同 Agent（如一个 Claude Code 一个 bash-only） |
| 7 | 报告写清「本地自测，非官网 harness 数字」 |

---

# 11. 故障排除

| 现象 | 处理 |
|------|------|
| litellm cost 报错 | `MSWEA_COST_TRACKING=ignore_errors` + registry.json |
| Connection refused | 先 curl 8001/8002；防火墙/只绑 127.0.0.1 |
| CUDA OOM | 降 max-model-len；量化；tp；一次只起一个模型 |
| Docker 权限 | 用户加入 docker 组或 rootless |
| 工具调用解析失败 | 检查 vLLM `--tool-call-parser`；看轨迹里有无 bash tool_calls |
| 镜像拉取失败 | 代理/镜像加速；磁盘空间 |
| Windows 路径 | 全程 WSL2 路径 `~/...` |
| 模型名不一致 | registry 键、served-model-name、config model_name **三处一致** |
| 极慢 | 正常；减题量；提高 tok/s（量化、fa） |

---

# 12. 更轻量的「预实验」（可选，1 小时）

在上完整 SWE 前，可用同一 API 做：

```bash
# 简单代码题自测脚本思路
# 1. 从 HumanEval 抽 20 题
# 2. 调 http://127.0.0.1:8001/v1/chat/completions 生成代码
# 3. 本地 exec 单测
# 4. 两模型比 pass@1
```

这测的是 **写函数**，不是仓库级 SWE，但可快速发现「模型服务/模板是否正常」。

---

# 13. 命令速查卡

```bash
# --- 起服务 ---
# 终端A: Qwen → :8001
# 终端B: GLM  → :8002

# --- 环境变量 ---
export LITELLM_MODEL_REGISTRY_PATH=~/swe-eval/configs/registry.json
export MSWEA_COST_TRACKING=ignore_errors

# --- 1 题打通 ---
mini-extra swebench --config ~/swe-eval/configs/swebench_qwen.yaml \
  --output ~/swe-eval/runs/qwen_smoke/ --subset verified --split test \
  --filter '^(django__django-11099)$'

# --- 判分 ---
python -m swebench.harness.run_evaluation \
  --dataset_name princeton-nlp/SWE-bench_Verified \
  --predictions_path ~/swe-eval/preds/qwen_10.jsonl \
  --max_workers 2 --run_id qwen36_10
```

---

# 14. 参考链接

| 资源 | URL |
|------|-----|
| Qwen3.6-35B-A3B | https://huggingface.co/Qwen/Qwen3.6-35B-A3B |
| Qwen GGUF 例 | https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF |
| GLM-4.7-Flash | https://huggingface.co/zai-org/GLM-4.7-Flash |
| GLM 文档 | https://docs.z.ai/guides/llm/glm-4.7 |
| mini-SWE-agent | https://github.com/SWE-agent/mini-swe-agent |
| 本地模型配置 | https://mini-swe-agent.com/latest/models/local_models/ |
| SWE-bench 批跑 | https://mini-swe-agent.com/latest/usage/swebench/ |
| SWE-bench 代码 | https://github.com/swe-bench/SWE-bench |
| 评测指南 | https://www.swebench.com/SWE-bench/guides/evaluation/ |
| 榜单 | https://www.swebench.com/ |

---

# 15. 诚实边界

| 点 | 说明 |
|----|------|
| CLI 参数 | mini-SWE-agent / vLLM 版本迭代快，**以你安装版本的 `--help` 与官网为准** |
| 官方 SWE 分 | 厂商卡片上的 Verified % **不等于** 你本地 mini-agent 分 |
| 工具调用 | 本地若 tool call 不稳，分数会严重低估真实「聊天写代码」能力 |
| 污染 | 公开题可能被训过；私有仓库更可信 |

---

## 你今天最少完成的 5 步

1. Docker + `hello-world`  
2. vLLM 起通 **一个** 模型，curl 有回复  
3. 装 mini-swe-agent，`cost_tracking=ignore_errors`  
4. **1 个 instance** 跑完有轨迹  
5. harness 对该题判分成功  

然后再复制配置测第二个模型，用 **同一 10 题** 填 §9 表格。

---

**文档路径**：`D:\AI\量子\本地模型SWE评测流程_Qwen3.6-35B与GLM-4.7-Flash.md`
