# 量子计算 · 量子计算（仅计算向）· 量子 × AI  
## 全景整理、核实说明与可追溯资料库

> **文档用途**：一眼扫表格建立全貌，点链接可深入原始文献。  
> **整理原则**：关键主张尽量对应一级原文（arXiv / Nature / Science / NIST / DARPA / 官方路线图）；营销数字与科学结论分轨；争议项双链标注。  
> **最后整合日期**：2026-07-13（基于多轮检索与页面核对；路线图类信息以官网最新为准）。  
> **证据等级速查**：

| 等级 | 含义 | 使用建议 |
|------|------|----------|
| **V1** | 已对应同行评审 / arXiv / 政府标准 / 官方项目页，主张与原文一致 | 可作核心判断依据 |
| **V2** | 厂商路线图、机构新闻稿（意图或阶段性声明） | 规划参考，≠已交付事实 |
| **V3** | 存在公开科学/产业争议 | 必须同时看正反链接 |
| **X** | 二手媒体/未核 PDF 的咨询大数字 | 本库尽量不单列为主证据 |

---

# 目录

1. [如何读本文档](#1-如何读本文档)
2. [一句话总览](#2-一句话总览)
3. [发展阶段与概念词典](#3-发展阶段与概念词典)
4. [硬件与量子纠错](#4-硬件与量子纠错)
5. [算法与「只关心计算」的路径](#5-算法与只关心计算的路径)
6. [真实应用与案例（含是否持续）](#6-真实应用与案例含是否持续)
7. [公司 · 机构 · 产品地图](#7-公司--机构--产品地图)
8. [量子 × AI](#8-量子--ai)
9. [安全：后量子密码与 Q-Day](#9-安全后量子密码与-q-day)
10. [路线图与时间窗口](#10-路线图与时间窗口)
11. [争议与批判（必读对照）](#11-争议与批判必读对照)
12. [AI 自身突破方向（并行参考）](#12-ai-自身突破方向并行参考)
13. [关键信息种子表 K1–K14](#13-关键信息种子表-k1k14)
14. [启发式扩展地图](#14-启发式扩展地图)
15. [完整可追溯链接库](#15-完整可追溯链接库)
16. [决策清单与本地追踪板](#16-决策清单与本地追踪板)
17. [文档诚实边界](#17-文档诚实边界)

---

# 1. 如何读本文档

## 1.1 简介（30 秒）

- **先看表格** → 建立阶段、案例、时间线印象。  
- **再看「详细说明」** → 理解机制、边界、为何可信/不可信。  
- **最后点「原始链接」** → 自己核对摘要与数字。

## 1.2 详细说明

本文不是新闻合集，而是把多轮调研压缩成**可审计知识库**：

| 阅读目标 | 建议章节 |
|----------|----------|
| 现在能不能用？ | §2、§3、§6 |
| 技术卡在哪？ | §4、§5 |
| 谁在做什么产品？ | §7 |
| 和 AI 什么关系？ | §8、§12 |
| 企业现在该干什么？ | §9、§16 |
| 哪年可能有大事？ | §10 |
| 防止被 PR 带节奏 | §11、§17 |

每块结构尽量统一：

1. **简介**（扫一眼）  
2. **表格**（结构化事实）  
3. **详细说明**（机制、边界、含义）  
4. **原始链接**（可追溯）

---

# 2. 一句话总览

## 2.1 简介

量子计算**已离开纯理论**，进入「纠错实验 + 混合科学计算 + 窄场景试验」阶段；**尚未**成为可大规模替代经典算力的通用计算机。

## 2.2 总判断表

| 问题 | 简短结论 | 置信 | 主要依据类型 |
|------|----------|------|----------------|
| 还在理论阶段吗？ | 否。纠错与混合化学已有顶刊/arXiv 实证 | 高 | V1 |
| 可以投入应用吗？ | **部分**：云访问、混合 R&D、优化/退火叙事、PQC 迁移；非通用替换 | 高 | V1+V2 |
| 有真实案例吗？ | 有：科学工具链硬；金融试验有论文但争议大；PQC 已标准化 | 高 | V1+V3 |
| 测完就不用了吗？ | 头部机构多**多年合作**；大量 PoC 会停；生产全量仍少 | 中高 | V2+观察 |
| 只关心计算怎么走？ | **经典 HPC/GPU + 量子加速核**（quantum-centric / hybrid） | 高 | V1 |
| 量子全面训练大模型？ | **无**与纠错同级的共识证明；变分 QML 有系统性瓶颈 | 高 | V1 |
| 未来？ | 逻辑比特扩展、码率、可验证算法、早期科学 utility；2030s 效用验证 | 中 | V1+V2 |

## 2.3 详细说明

业界真实主线不是「一台全能量子 PC」，而是：

1. **把错误压到可扩展**（表面码 / qLDPC / 实时解码）  
2. **把量子只用于最难子问题**（采样、电子结构、特定动力学）  
3. **其余全部经典做**（对角化、优化、ML、业务系统）  
4. **安全上先防量子威胁**（PQC），不必等量子机商用  

权威阶段框架见 Eisert & Preskill「四道鸿沟」与 Preskill「megaquop」讨论（§3、§15）。

---

# 3. 发展阶段与概念词典

## 3.1 简介

用统一术语读论文和 PR，避免「advantage / utility / supremacy」混用。

## 3.2 发展阶段表

| 阶段 | 英文 | 简介 | 详细说明 | 当前大致位置 |
|------|------|------|----------|----------------|
| 噪声中等规模量子 | **NISQ** | 几十～上千物理比特，噪声大 | 可跑浅电路、混合算法；多数「应用」靠误差缓解与经典后处理 | 我们仍大量处在此 |
| 百万操作级纠错机 | **Megaquop** | 约 10⁶ 量级可靠量子操作 | Preskill 用来讨论「纠错后第一批有用机器」可能长什么样 | 社区讨论中的近中期目标 |
| 容错应用级 | **FASQ** | Fault-Tolerant Application-Scale Quantum | 可跑广泛有用应用的容错机；与 NISQ 之间有多道鸿沟 | 尚未到达 |
| 工业效用规模 | **Utility-scale** | 计算价值 > 成本 | DARPA QBI 用来严格验证的目标定义，锚定 ~2033 | 评估中 |

## 3.3 「优势」词汇辨析

| 术语 | 简介 | 详细说明 | 业务相关性 |
|------|------|----------|------------|
| Quantum supremacy | 某任务上经典难模拟 | 常为随机电路采样等；难直接变现 | 低 |
| Quantum advantage | 相对经典更快/更好 | 定义易被营销放大；需任务+基线 | 看定义 |
| Verifiable advantage | 结果可交叉验证 | 如可观测量/OTOC 类；科学可信度更高 | 中（科学） |
| Quantum utility | 有用且值得做 | 偏工程/经济 | 高（但难证明） |
| Utility-scale | 价值超过成本 | DARPA 用语 | 高（政策/战略） |

## 3.4 核心技术名词（速查）

| 中文 | 英文 | 简介 | 详细说明 |
|------|------|------|----------|
| 物理比特 | Physical qubit | 硬件上的一个量子比特 | 噪声大，不能直接当「完美比特」用 |
| 逻辑比特 | Logical qubit | 纠错编码后的有效比特 | 往往由大量物理比特组成 |
| 量子纠错 | QEC | 检测并纠正错误 | 通向容错的主线 |
| 表面码 | Surface code | 最成熟 2D 拓扑码之一 | Willow 实验主力 |
| 量子 LDPC | qLDPC | 高码率纠错码族 | 目标大幅降低物理开销 |
| 误差缓解 | Error mitigation | 从多次噪声结果估计真值 | NISQ 常用；≠真正纠错 |
| 混合算法 | Hybrid QC | 量子+经典分工 | 当代默认形态 |
| 量子中心超算 | Quantum-centric SC | 以量子为核、经典海量后处理 | IBM 化学路线关键词 |
| 变分算法 | VQE / QAOA | 参数化电路+经典优化 | NISQ 桥梁；可扩展性受质疑 |
| 采样对角化 | SQD | 量子采样组态+经典对角化 | 近端化学硬路径 |
| 量子退火 | Annealing | 专用优化物理过程 | 与通用门模型不同 |
| 贫瘠高原 | Barren plateau | 梯度指数消失 | 变分 QML 核心障碍 |
| 后量子密码 | PQC | 抗量子攻击的经典密码 | 已标准化，应迁移 |

## 3.5 阶段框架原始链接

| 资料 | 简介 | 链接 |
|------|------|------|
| Eisert & Preskill, *Mind the gaps* | 四道鸿沟 + FASQ | https://arxiv.org/abs/2510.19928 |
| 同上 PDF | 全文 | https://arxiv.org/pdf/2510.19928 |
| Preskill, *Beyond NISQ: The Megaquop Machine* | megaquop 概念 | https://arxiv.org/abs/2502.17368 |
| ACM 正式版 | 期刊 DOI | https://doi.org/10.1145/3723153 |

---

# 4. 硬件与量子纠错

## 4.1 简介

2024–2026 最大硬科学进展是：**纠错开始「按理论那样随规模变好」**，以及 **qLDPC 降低比特开销的理论突破**。

## 4.2 硬件模态对比

| 模态 | 代表方 | 简介 | 优势 | 瓶颈 | 备注 |
|------|--------|------|------|------|------|
| 超导 Transmon | IBM, Google | 电路量子比特，极低温 | 门快、生态大、扩展路径清晰 | 相干时间、布线、连通 | 纠错实验最多公开 |
| 囚禁离子 | IonQ, Quantinuum | 激光操控离子 | 高保真、连接性好 | 门速、规模化控制 | 企业云与高 QV 叙事 |
| 中性原子 | QuEra, Pasqal 等 | 光镊阵列 | 规模大、可重构 | 门保真/读取 | 逻辑处理器实验活跃 |
| 光子 | PsiQuantum, Xanadu 等 | 光量子信息 | 网络化、部分室温潜力 | 损耗、确定性门 | DARPA 效用路径之一 |
| 拓扑 | Microsoft 等 | 拓扑保护比特叙事 | 宣称抗噪 | 物理验证难度 | 高风险高回报 |
| 硅自旋 | Intel 等 | 半导体兼容 | 制造潜力 | 规模与保真爬坡 | 长期制造叙事 |
| 退火（专用） | D-Wave | Ising/QUBO 优化 | 近端优化部署故事多 | 非通用；优势常有争议 | 与门模型分轨 |

## 4.3 里程碑 A：Willow 表面码 below threshold（V1）

### 简介

Google Quantum AI 在 *Nature* 发表：表面码逻辑存储**低于阈值**，增大码距可抑制逻辑错误，并展示实时解码。

### 关键数据表

| 指标 | 数值（论文摘要） | 含义（简介） |
|------|------------------|--------------|
| 抑制因子 Λ | 2.14 ± 0.02 | 码距 +2 时逻辑错误被压低的倍数 |
| 大存储 | 距离-7，约 101 物理比特 | 实验规模 |
| 逻辑错误率 | 0.143% ± 0.003% / 周期 | 每纠错周期 |
| Beyond breakeven | 逻辑寿命 ≈ 最佳物理比特的 2.4 ± 0.3 倍 | 逻辑比特「活得更久」 |
| 实时解码 | 距离-5 平均 63 μs；周期 1.1 μs | 解码跟得上硬件 |
| 相关错误 | 约每小时或 3×10⁹ 周期一次 | 仍限制极限表现 |

### 详细说明

- **证明了什么**：纠错理论承诺的「越大（码距）越稳」可以在真实超导硬件上出现。  
- **没证明什么**：已能跑通用工业算法；已达 FASQ。  
- **对你的含义**：阶段判断从「纠错是否可行」变为「如何工程缩放逻辑层」。

### 原始链接

| 类型 | URL |
|------|-----|
| arXiv 摘要页 | https://arxiv.org/abs/2408.13687 |
| PDF | https://arxiv.org/pdf/2408.13687 |
| Nature DOI | https://doi.org/10.1038/s41586-024-08449-y |
| Nature 页面 | https://www.nature.com/articles/s41586-024-08449-y |

---

## 4.4 里程碑 B：IBM qLDPC / BB 码低开销记忆（V1）

### 简介

IBM 团队提出高码率 LDPC 容错记忆：阈值可与表面码比肩，**物理比特开销显著更低**（数值模拟+端到端协议）。

### 关键数据表

| 指标 | 论文表述 | 简介 |
|------|----------|------|
| 阈值 | 约 0.8%（标准电路噪声模型） | 与表面码同量级竞争力 |
| 示例 | 12 逻辑比特，共 288 物理比特 | 物理错误率 0.1% 时约百万 syndrome 周期 |
| 对比 | 同水平表面码或需约 3000 物理比特 | 「约 10× 开销」叙事来源 |
| 连通 | 度-6 图，两个平面子图 | 硬件要比纯近邻表面码「更连」 |

### 详细说明

- 这是 **Starling / Kookaburra / Loon** 等路线图的理论底座之一。  
- **V1 的是协议与仿真结果发表**；「货架上已卖 288 比特 qLDPC 记忆」需另看硬件交付。  
- 工程含义：纠错竞赛进入 **码率 × 连通 × 实时解码** 三维。

### 原始链接

| 类型 | URL |
|------|-----|
| arXiv | https://arxiv.org/abs/2308.07915 |
| PDF | https://arxiv.org/pdf/2308.07915 |
| Nature DOI | https://doi.org/10.1038/s41586-024-07107-7 |
| Nature 页面 | https://www.nature.com/articles/s41586-024-07107-7 |

---

## 4.5 纠错扩展方向（启发式，均有刊源可跟）

| 方向 | 简介 | 详细说明 | 入口链接 |
|------|------|----------|----------|
| 实时 / 低延迟解码 | 解码必须快于错误积累 | 否则逻辑时钟拖死 | 例：https://www.nature.com/articles/s41467-026-73331-6 等 Nature Commun 族 |
| RL 控制 QEC | 用强化学习边算边校准 | AI→量子硬件的硬例子 | https://www.nature.com/articles/s41586-026-10759-2 |
| Colour / dynamic surface code | 码与电路变体 | 硬件设计更灵活 | 检索 Nature / arXiv “dynamic surface codes” |
| 中性原子逻辑处理器 | 多逻辑比特操作 | 跨模态逻辑竞赛 | Nature 中性原子容错架构系列 |
| 误差缓解 ZNE/PEC | NISQ 提结果质量 | 采样开销大；≠ QEC | IBM 文档等（工程向） |

### 纠错 vs 缓解（对照）

| | 量子纠错 QEC | 误差缓解 Mitigation |
|--|--------------|---------------------|
| 目标 | 运行中检测纠正 | 事后从噪声数据估计 |
| 代表 | 表面码、qLDPC | ZNE、PEC |
| 开销 | 物理比特 + 解码器 | 采样次数暴涨 |
| 门槛 | 需 below threshold | 无严格阈值 |
| 阶段角色 | 通向 FT/FASQ | 撑住 NISQ 实验 |

---

# 5. 算法与「只关心计算」的路径

## 5.1 简介

不必整机量子化。默认架构：**CPU/GPU/HPC 做主流程，QPU 做难核**。

## 5.2 架构示意（文字版）

```
业务/科学问题
    ↓
经典编排（调度、数据、AI、后处理）
    ├─ GPU：训练、模拟、纠错解码、优化
    ├─ HPC：大规模对角化、线性代数
    └─ QPU：采样、纠缠动力学、电子结构难核
    ↓
结果进入业务系统 / 科学结论
```

## 5.3 近端算法分轨表

| 算法/范式 | 简介 | 适用问题 | 成熟度 | 详细说明 | 关键链接 |
|-----------|------|----------|--------|----------|----------|
| **SQD / 采样对角化** | 量子采电子组态 → 经典子空间对角化 | 量子化学、材料 | 科学硬（V1） | 当代最扎实「计算」路径之一 | https://arxiv.org/abs/2405.05068 |
| **SKQD** | Krylov + 采样 | 格点/部分多体 | 实验进展 | 可与 DMRG 等经典法对照 | https://arxiv.org/abs/2501.09702 |
| **VQE** | 变分求基态 | 分子能量 | NISQ 常用但优势未稳 | 受噪声与训练性限制 | 教科书级算法；结合 barren plateau 综述 |
| **QAOA** | 变分组合优化 | 图割、调度编码等 | 试验多、优势少 | 常不赢强经典启发式 | 同上 |
| **量子退火 / QUBO** | 专用优化 | 排程、路径、分配 | 商用故事较多 | 非通用；优势边界常争 | 厂商+独立基准需分开看 |
| **OTOC / Echoes 类** | 动力学可观测量 | 物理模拟、学习哈密顿量 | 科学优势叙事 | ≠ 交易/ERP KPI | https://www.nature.com/articles/s41586-025-09526-6 |
| **Shor / Grover** | 分解 / 搜索 | 密码、无结构搜索 | 理论标杆 | 实用需大规模容错 | 经典教材 |

## 5.4 化学混合计算（重点展开 · V1）

### 简介

Robledo-Moreno 等：在 **quantum-centric supercomputer** 上做超出精确对角化规模的电子结构。

### 事实表

| 项目 | 内容 |
|------|------|
| 硬件 | IBM Heron 超导 + 超级计算机 Fugaku 等 |
| 体系 | N₂ 解离；[2Fe–2S]、[4Fe–4S] 簇等 |
| 规模 | 至约 77 qubits、约 10,570 门 |
| 输出 | 基态能量上界、稀疏波函数近似 |
| 结论取向 | 当前错误率下，混合架构可处理挑战性化学 |

### 详细说明

- 量子负责「内在量子难」的部分，经典负责几乎所有其余。  
- 这与「量子电脑单独取代超算」的想象相反，却是**当前最可行计算路径**。  
- 后续扩展：DMET-SQD 嵌入大分子、电池表面反应等（见链接库）。

### 原始链接

| 类型 | URL |
|------|-----|
| arXiv | https://arxiv.org/abs/2405.05068 |
| PDF | https://arxiv.org/pdf/2405.05068 |
| Science Advances DOI | https://doi.org/10.1126/sciadv.adu9991 |
| 期刊页 | https://www.science.org/doi/10.1126/sciadv.adu9991 |

### 相关扩展论文

| 主题 | 链接 |
|------|------|
| DMET + SQD | https://arxiv.org/abs/2411.09861 |
| SKQD | https://arxiv.org/abs/2501.09702 |

---

## 5.5 退火 vs 门模型（计算选型）

| 维度 | 退火 | 门模型 |
|------|------|--------|
| 问题 | 优化、Ising/QUBO | 通用（含化学、未来 Shor） |
| 近端可用性 | 生产优化叙事相对多 | 云试验 + 科学混合 |
| 理论地位 | 非通用 | BQP 通用计算模型 |
| 选型建议 | 组合优化优先评估 | 模拟/算法研究/长期通用 |

---

# 6. 真实应用与案例（含是否持续）

## 6.1 简介

把「应用」拆成三级，避免把 PR 当成生产。

## 6.2 应用成熟度分级

| 级别 | 名称 | 简介 | 例子类型 |
|------|------|------|----------|
| L-A | 标准/合规落地 | 可采购、可审计 | PQC 迁移 |
| L-B | 科学/工程工具链 | 论文+持续合作 | SQD 化学、医院量子中心 |
| L-C | 业务试验（有指标） | 有 uplift 数字，未必全量生产 | HSBC 债市试验 |
| L-D | 概念验证 PoC | 演示后可能停 | 大量行业试点 |
| L-E | 未证实营销 | 仅 headline | 过滤 |

## 6.3 案例总表

| 案例 | 领域 | 级别 | 简介 | 是否持续信号 | 正方链接 | 反方/边界 |
|------|------|------|------|--------------|----------|-----------|
| Willow QEC | 硬件科学 | L-B | below threshold 纠错 | 持续论文族 | §4.3 链接 | 非工业通用机 |
| SQD 化学 | 科学计算 | L-B | 混合超算化学 | 多后续 arXiv | §5.4 | 非新药上市流水线 |
| Cleveland Clinic × IBM | 医疗 R&D | L-B/V2 | 现场量子+多年合作；蛋白尺度新闻 | 10 年级合作叙事 | 见下表 | 新闻稿数字需跟论文 |
| HSBC × IBM 债市 | 金融 | L-C / **V3** | 量子特征+ML，~34% | 合作研发 | arXiv+新闻 | Aaronson 批评 |
| 退火排产/物流 | 制造物流 | L-C/D | 优化部署故事 | 视客户续约 | 多厂商 IR | 独立复现少则降级 |
| PQC | 安全 | **L-A** | NIST 标准 | 强制迁移趋势 | NIST | — |

## 6.4 案例详卡

### A. HSBC × IBM 算法债交易（V3）

| 字段 | 内容 |
|------|------|
| **简介** | 欧企债 RFQ：预测报价成交（fill）概率；量子变换特征 + 经典 ML |
| **宣传数字** | 相对增益最高约 34% |
| **论文自述关键点** | 硬件变换优于原数据与**无噪声模拟**；**暗示噪声贡献，需再研究** |
| **不是什么** | 不是量子机直接全自动撮合全市场 |
| **详细说明** | 有 arXiv 可查 → 试验真实存在；是否「量子计算优势」在学术界激烈争议 |
| **正方** | https://arxiv.org/abs/2509.17715 |
| **PDF** | https://arxiv.org/pdf/2509.17715 |
| **新闻** | https://www.hsbc.com/news-and-views/news/media-releases/2025/hsbc-demonstrates-worlds-first-known-quantum-enabled-algorithmic-trading-with-ibm |
| **IBM 博文** | https://www.ibm.com/quantum/blog/hsbc-algorithmic-bond-trading |
| **批评** | https://scottaaronson.blog/?p=9170 |

### B. Cleveland Clinic × IBM × RIKEN（科学工具）

| 字段 | 内容 |
|------|------|
| **简介** | 医疗/生命科学量子合作；量子中心超算分子/蛋白相关模拟 |
| **新闻点** | 约 12,635 原子尺度蛋白相关模拟声明（机构新闻） |
| **详细说明** | 方法上承接 quantum-centric / SQD 路线；属科研加速，不等于临床药物已量子设计完毕 |
| **链接** | https://newsroom.ibm.com/2026-05-05-cleveland-clinic,-riken,-and-ibm-model-a-12,635-atom-protein-the-largest-known-to-be-simulated-with-quantum-computers |
| **早期装机背景** | https://newsroom.clevelandclinic.org/2023/03/20/cleveland-clinic-and-ibm-unveil-first-quantum-computer-dedicated-to-healthcare-research |

### C. OTOC / 可验证动力学（科学优势）

| 字段 | 内容 |
|------|------|
| **简介** | 高阶 OTOC 实验；讨论可验证、偏物理的 advantage 路径 |
| **详细说明** | 对「优势」定义从不可复现采样转向可观测量；不直接等于商业 KPI |
| **链接** | https://www.nature.com/articles/s41586-025-09526-6 |

## 6.5 「持续应用 vs 测完就扔」

| 现象 | 简介 | 详细说明 |
|------|------|----------|
| 大量 PoC 停止 | 真 | ROI 不清、经典也在进步、集成成本高 |
| 头部多年合作 | 真 | 银行/药企/医院设量子组，续签云与联合实验室 |
| 生产全量替换 | 基本未到 | 除窄优化与安全迁移外，少见 24×7 核心路径全量子化 |
| 科学工具迭代 | 真 | SQD 论文与超算合作在扩体系 |

---

# 7. 公司 · 机构 · 产品地图

## 7.1 简介

按角色分类，便于「找谁、用什么」。

## 7.2 总表

| 主体 | 角色 | 简介 | 产品/关键词 | 跟进入口 |
|------|------|------|-------------|----------|
| IBM | 全栈+路线图 | 超导、Qiskit、行业网 | Heron, System Two, Nighthawk, Kookaburra, Starling | https://www.ibm.com/quantum · https://www.ibm.com/roadmaps/quantum/ |
| Google Quantum AI | 科学里程碑 | 纠错、可验证实验 | Willow, OTOC | https://quantumai.google/ · Nature 论文 |
| Microsoft | 拓扑+云 | Azure Quantum | Majorana 叙事, DARPA | Azure Quantum 文档 |
| IonQ | 上市离子阱 | 云与企业系统 | Forte/Tempo, #AQ | https://www.ionq.com/ |
| Quantinuum | 高保真离子 | H/Helios 等 | 高 QV、NVIDIA 混合 | 官网与文档 |
| PsiQuantum | 光子规模 | 效用规模野心 | 硅光路线 | 官网；DARPA 相关新闻 |
| D-Wave | 退火商用 | 优化 QCaaS | Advantage 系列, Leap | 官网 |
| NVIDIA | 混合基础设施 | 不自建全能 QPU 为主 | CUDA-Q, NVQLink | https://developer.nvidia.com/cuda-q |
| AWS / Azure | 云分发 | 多后端 | Braket, Azure Quantum | 云文档 |
| NIST | 标准 | PQC | FIPS 203–205 | https://csrc.nist.gov/projects/post-quantum-cryptography |
| DARPA | 验证 | utility-scale | QBI | https://www.darpa.mil/research/programs/quantum-benchmarking-initiative |

## 7.3 访问方式（计算向）

| 方式 | 简介 | 详细说明 |
|------|------|----------|
| 公有云 QPU | 按任务租真机/模拟器 | 研发默认入口 |
| 超算中心混部 | QPU 旁挂 HPC | 科学计算主路径 |
| 本地/托管机 | 银行/医院/国家项目 | 少而重的部署 |
| 仅经典量子启发 | 不跑 QPU | 优化场景可先试 |

---

# 8. 量子 × AI

## 8.1 简介

双向关系：**AI 帮量子** 比 **量子帮大模型训练** 更接近现实。

## 8.2 交叉表

| 方向 | 简介 | 详细说明 | 证据强度 | 链接/入口 |
|------|------|----------|----------|-----------|
| AI → QEC 控制 | RL 校准纠错 | 错误检测信号当学习信号 | V1 实验方向 | https://www.nature.com/articles/s41586-026-10759-2 |
| AI → 电路/解码 | 辅助编译与解码 | 工程热点 | 中高 | CUDA-Q / 产业+论文 |
| 量子 → 特征 → 经典 ML | 量子变换特征 | HSBC 类；噪声角色争议 | V3 | §6.4A |
| 变分 QML / QNN | 量子神经网络 | **Barren plateau** 限制可扩展训练 | V1 综述 | https://arxiv.org/abs/2405.00781 |
| 量子微调 LLM | 混合层叙事 | 产品向；需强基线 | 厂商叙事多 | 谨慎对待 |
| 量子全面替代 GPU 训练 | — | **无**共识级证明 | — | — |

## 8.3 Barren plateau（必读）

| 字段 | 内容 |
|------|------|
| **简介** | 变分电路规模变大时，优化景观指数变平，梯度消失 |
| **详细说明** | 导致许多「量子神经网络」难以训练到有用规模；是 QML 降温的核心科学理由之一 |
| **arXiv** | https://arxiv.org/abs/2405.00781 |
| **PDF** | https://arxiv.org/pdf/2405.00781 |
| **期刊 DOI** | https://doi.org/10.1038/s42254-025-00813-9 |
| **奠基工作** | McClean et al. 2018: https://doi.org/10.1038/s41467-018-07090-4 |

## 8.4 对规划的含义

| 若你的目标 | 建议 |
|------------|------|
| 做 AI 产品 | 主线仍是 agent、推理、多模态、效率；量子当远期期权 |
| 做科学计算 | 优先 hybrid 化学/材料 + GPU |
| 做量子硬件软件 | 投 AI for control / decoding |
| 做投资叙事审查 | 凡「量子加速 LLM」默认要求 V1 证明 |

---

# 9. 安全：后量子密码与 Q-Day

## 9.1 简介

这是**现在就能、也应该做**的「量子相关」事项：用**经典**算法防未来量子破译。

## 9.2 标准表

| 标准 | 算法名 | 原名 | 用途 | 链接 |
|------|--------|------|------|------|
| FIPS 203 | ML-KEM | CRYSTALS-Kyber | 密钥封装/交换 | https://csrc.nist.gov/pubs/fips/203/final |
| FIPS 204 | ML-DSA | CRYSTALS-Dilithium | 数字签名 | https://csrc.nist.gov/pubs/fips/204/final |
| FIPS 205 | SLH-DSA | SPHINCS+ | 哈希签名备份 | https://csrc.nist.gov/pubs/fips/205/final |

| 资料 | 链接 |
|------|------|
| NIST 发布新闻 | https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards |
| FIPS 203 DOI | https://doi.org/10.6028/NIST.FIPS.203 |
| PQC 项目总页 | https://csrc.nist.gov/projects/post-quantum-cryptography |
| 迁移相关 IR（草案/更新以站点为准） | https://csrc.nist.gov/pubs/ir/8547/ipd |

## 9.3 详细说明

| 概念 | 简介 | 详细说明 |
|------|------|----------|
| Harvest now, decrypt later | 先偷密文，量子够强再解 | 长保密数据现在就要 PQC |
| QKD | 量子密钥分发 | 物理链路；**不替代**互联网级 PQC 软件迁移 |
| Q-Day | 公钥被量子实用破解之日 | 时间不确定；迁移要提前 |

## 9.4 行动优先级（务实）

| 优先级 | 行动 |
|--------|------|
| P0 | 密码资产盘点（TLS、证书、代码签名、VPN） |
| P0 | 规划 ML-KEM / ML-DSA 混合部署 |
| P1 | 供应商 crypto-agility 要求 |
| P2 | 再考虑 QPU 业务试点 |

---

# 10. 路线图与时间窗口

## 10.1 简介

分清：**厂商意图（V2）**、**政府验证框架（V1 定义）**、**科学阶段论（V1）**。

## 10.2 IBM 官方路线图摘要（V2）

> 官网声明：*current intent, subject to change*。

| 时间点 | 目标摘要 | 链接 |
|--------|----------|------|
| 2026 | 社区示范首批 quantum advantage；Nighthawk ~7500 门、至 3×120 比特模块；Kookaburra：LPU+量子记忆模块；实时解码原型 | https://www.ibm.com/roadmaps/quantum/ |
| 2028 | 优势多样化；模块纠缠；magic state 等 | 同上 |
| 2029 | **Starling**：约 200 qubits、1e8 门（容错叙事） | 同上 |
| 2033+ | **Blue Jay**：约 2000 qubits、1e9 门 | 同上 |

补充博文：https://www.ibm.com/quantum/blog/large-scale-ftqc

## 10.3 DARPA QBI（V1 定义）

| 字段 | 内容 |
|------|------|
| **简介** | 验证能否在 2033 前达到 utility-scale（价值>成本） |
| **详细说明** | 分阶段概念→计划→政府 V&V；比单一厂商 PPT 更适合做战略锚 |
| **链接** | https://www.darpa.mil/research/programs/quantum-benchmarking-initiative |
| **新闻例** | https://www.darpa.mil/news/2025/quantum-computing-approaches |

## 10.4 综合情景时间线（非承诺）

| 窗口 | 较可能发生 | 依据类型 | 置信 |
|------|------------|----------|------|
| 2025–2027 | 更多混合试验；纠错工程论文；PQC 迁移提速 | V1+V2 | 中高 |
| 2026 | 厂商「advantage」验证战（定义会吵） | V2 | 中 |
| 2027–2029 | 逻辑比特与深度上升；化学科学价值更清晰 | V1 趋势+V2 | 中 |
| 2029 前后 | 容错系统节点（如 Starling 类）是否按期 | V2 | 中 |
| 2030–2033 | utility-scale 是否可被严格验证 | V1 框架 | 中 |
| 2030s 中后 | 更广经济影响是否兑现 | 模型依赖 | 低–中 |

## 10.5 用「四鸿沟」检查任何时间表宣传

| 鸿沟 | 简介 | 过关大致意味 |
|------|------|----------------|
| (i) 缓解 → 主动纠错 | 从估误差到真纠正 | 逻辑比特开始干活 |
| (ii) 初级纠错 → 可扩展容错 | 逻辑门与规模 | 通用算法可期 |
| (iii) 启发式 → 可验证算法 | 少拍脑袋 | 结果可审计 |
| (iv) 探索模拟 → 可信模拟优势 | 赢强经典模拟 | 科学 utility |

来源：https://arxiv.org/abs/2510.19928

---

# 11. 争议与批判（必读对照）

## 11.1 简介

没有批判链的「突破」不完整。

## 11.2 争议表

| 议题 | 正方摘要 | 反方/边界摘要 | 你应记住的一句话 | 链接 |
|------|----------|---------------|------------------|------|
| HSBC 34% | 真机特征提升 ML 分数 | 无噪声模拟无优势 → 可能非量子加速；营销超前 | **试验有，优势解释未结案** | 正: https://arxiv.org/abs/2509.17715 反: https://scottaaronson.blog/?p=9170 |
| NISQ 应用大爆发 | 云用户与试点多 | 多数 flagship advantage 可被经典追上或定义可疑 | **试点≠ FASQ** | https://arxiv.org/abs/2510.19928 |
| 量子优化全面碾压 | 退火/QAOA 故事 | 强经典启发式极强 | **先比最好的经典** | 方法论文+基准 |
| QML 即将颠覆 AI | 参数少、表达强等 | Barren plateau、数据加载 | **训练性是硬墙** | https://arxiv.org/abs/2405.00781 |

## 11.3 Aaronson 对 HSBC 论文的核心逻辑（简介）

| 点 | 说明 |
|----|------|
| 红旗 | 优势依赖硬件噪声、无噪声模拟消失 |
| 方法批评 | 未先证明量子计算优势基准，直接接业务 headline |
| 建议读法 | 论文可作「有趣经验现象」；不可作「量子金融已商用碾压」 |

全文：https://scottaaronson.blog/?p=9170

---

# 12. AI 自身突破方向（并行参考）

## 12.1 简介

AI 主线**不依赖**量子；列出以便战略上分清预算。

## 12.2 方向表

| 方向 | 简介 | 与量子关系 |
|------|------|------------|
| Agent / 多智能体 | 可执行工作流 | 弱；编排可调用 QPU 服务 |
| 推理 / test-time compute | 长链推理 | 弱 |
| 多模态 | 视听语+动作 | 弱 |
| World models | 环境预测与规划 | 弱 |
| 效率与新架构 | SSM 等 | 弱 |
| 科学 AI | 材料/蛋白 | **可与量子化学混合互补** |
| 对齐与安全 | 可控可审计 | 弱 |

---

# 13. 关键信息种子表 K1–K14

## 13.1 简介

历史调研压缩成可检索种子，便于你或下次代理继续发散。

| ID | 关键信息 | 类型 | 默认证据级 |
|----|----------|------|------------|
| K1 | NISQ→纠错实证→容错过渡；非日常通用替换 | 阶段 | V1 |
| K2 | Willow 表面码 below threshold | 硬件 | V1 |
| K3 | qLDPC 降开销；驱动 IBM 架构 | 架构 | V1+V2 |
| K4 | 混合/量子中心超算是主路径 | 计算形态 | V1 |
| K5 | SQD 等把化学推到精确对角化外 | 算法 | V1 |
| K6 | VQE/QAOA 近端可用、优势未稳 | 算法 | V1 取向 |
| K7 | 退火偏优化生产叙事；门模型偏通用 | 模态 | 分轨 |
| K8 | HSBC+IBM 债市试验；机制争议 | 商业 | V3 |
| K9 | Cleveland Clinic 长期合作 | 科学应用 | V2 |
| K10 | PQC 已标准化 | 安全 | V1 |
| K11 | QML 受 barren plateau 等限制 | AI×量子 | V1 |
| K12 | 2026/2029/2033 时间锚 | 时间线 | V2+V1 定义 |
| K13 | 可验证优势 ≠ 业务 ROI | 优势定义 | V1 |
| K14 | 鸿沟框架；防营销与真工程混淆 | 批判 | V1 |

---

# 14. 启发式扩展地图

## 14.1 简介

从已核实种子「长」出的下一跳研究，全部带入口。

| 从…出发 | 应扩展查… | 入口 |
|---------|------------|------|
| Willow | 实时解码、相关错误、colour/dynamic code、RL-QEC | §4.3 + Nature 系列 |
| qLDPC | 连通硬件、LPU、中性原子高码率 | §4.4 + arXiv |
| SQD 化学 | DMET、SKQD、材料/电池、方法缺陷文 | §5.4 扩展链接 |
| HSBC | 基线定义、噪声消融、独立复现 | arXiv PDF + Aaronson |
| Barren plateau | 「无 BP 是否意味可经典模拟」 | https://arxiv.org/abs/2312.09121 等 |
| PQC | 资产盘点、混合 TLS、IR 8547 | NIST 站 |
| 四鸿沟 | 把每个案例映射到 (i)–(iv) | https://arxiv.org/abs/2510.19928 |

---

# 15. 完整可追溯链接库

## 15.1 硬件与纠错

| 文献/页面 | URL |
|-----------|-----|
| Willow arXiv | https://arxiv.org/abs/2408.13687 |
| Willow PDF | https://arxiv.org/pdf/2408.13687 |
| Willow Nature DOI | https://doi.org/10.1038/s41586-024-08449-y |
| Willow Nature 页 | https://www.nature.com/articles/s41586-024-08449-y |
| qLDPC arXiv | https://arxiv.org/abs/2308.07915 |
| qLDPC PDF | https://arxiv.org/pdf/2308.07915 |
| qLDPC Nature DOI | https://doi.org/10.1038/s41586-024-07107-7 |
| RL+QEC Nature | https://www.nature.com/articles/s41586-026-10759-2 |
| OTOC Nature | https://www.nature.com/articles/s41586-025-09526-6 |

## 15.2 阶段与理论

| 文献 | URL |
|------|-----|
| Mind the gaps arXiv | https://arxiv.org/abs/2510.19928 |
| Mind the gaps PDF | https://arxiv.org/pdf/2510.19928 |
| Mind the gaps HTML v3 | https://arxiv.org/html/2510.19928v3 |
| Megaquop arXiv | https://arxiv.org/abs/2502.17368 |
| Megaquop PDF | https://arxiv.org/pdf/2502.17368 |
| Megaquop ACM DOI | https://doi.org/10.1145/3723153 |
| Barren plateaus arXiv | https://arxiv.org/abs/2405.00781 |
| Barren plateaus PDF | https://arxiv.org/pdf/2405.00781 |
| Barren plateaus DOI | https://doi.org/10.1038/s42254-025-00813-9 |
| McClean 2018 BP | https://doi.org/10.1038/s41467-018-07090-4 |

## 15.3 化学与混合计算

| 文献 | URL |
|------|-----|
| Quantum-centric chemistry arXiv | https://arxiv.org/abs/2405.05068 |
| 同上 PDF | https://arxiv.org/pdf/2405.05068 |
| Science Advances DOI | https://doi.org/10.1126/sciadv.adu9991 |
| Science 页 | https://www.science.org/doi/10.1126/sciadv.adu9991 |
| SKQD | https://arxiv.org/abs/2501.09702 |
| DMET-SQD | https://arxiv.org/abs/2411.09861 |

## 15.4 金融案例与批评

| 资料 | URL |
|------|-----|
| HSBC–IBM arXiv | https://arxiv.org/abs/2509.17715 |
| PDF | https://arxiv.org/pdf/2509.17715 |
| HSBC 新闻 | https://www.hsbc.com/news-and-views/news/media-releases/2025/hsbc-demonstrates-worlds-first-known-quantum-enabled-algorithmic-trading-with-ibm |
| HSBC PDF 稿 | https://www.hsbc.com/-/files/hsbc/media/media-release/2025/250923-hsbc-demonstrates-worlds-first-known-quantum-enabled-algorithmic-trading-with-ibm.pdf |
| IBM 博文 | https://www.ibm.com/quantum/blog/hsbc-algorithmic-bond-trading |
| Aaronson 批评 | https://scottaaronson.blog/?p=9170 |

## 15.5 路线图、标准、项目、机构新闻

| 资料 | URL |
|------|-----|
| IBM Quantum Roadmap | https://www.ibm.com/roadmaps/quantum/ |
| IBM FTQC 博文 | https://www.ibm.com/quantum/blog/large-scale-ftqc |
| IBM Quantum 首页 | https://www.ibm.com/quantum |
| NIST PQC 新闻 | https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards |
| FIPS 203 | https://csrc.nist.gov/pubs/fips/203/final |
| FIPS 204 | https://csrc.nist.gov/pubs/fips/204/final |
| FIPS 205 | https://csrc.nist.gov/pubs/fips/205/final |
| FIPS 203 DOI | https://doi.org/10.6028/NIST.FIPS.203 |
| PQC 项目 | https://csrc.nist.gov/projects/post-quantum-cryptography |
| DARPA QBI | https://www.darpa.mil/research/programs/quantum-benchmarking-initiative |
| DARPA 新闻例 | https://www.darpa.mil/news/2025/quantum-computing-approaches |
| IBM 蛋白模拟新闻 | https://newsroom.ibm.com/2026-05-05-cleveland-clinic,-riken,-and-ibm-model-a-12,635-atom-protein-the-largest-known-to-be-simulated-with-quantum-computers |
| Cleveland Clinic 装机 | https://newsroom.clevelandclinic.org/2023/03/20/cleveland-clinic-and-ibm-unveil-first-quantum-computer-dedicated-to-healthcare-research |
| NVIDIA CUDA-Q | https://developer.nvidia.com/cuda-q |
| Google Quantum AI | https://quantumai.google/ |

---

# 16. 决策清单与本地追踪板

## 16.1 不同角色 30 秒决策

| 角色 | 现在做什么 | 不要做什么 |
|------|------------|------------|
| 企业安全/IT | PQC 盘点与迁移 | 等 Q-Day 再动 |
| 科学计算 | 学 hybrid/SQD；云试化学工作流 | 幻想纯量子换超算 |
| 量化/金融创研 | 可读 HSBC 论文+批评；控预期 | 把 34% 写进确定 alpha |
| 战略/投资 | 分清 V1 工程 vs V2 路线图 vs V3 争议 | 只看 headline |
| AI 产品 | 主线 agent/推理；量子当期权 | 押注量子训练 LLM |

## 16.2 可复制追踪板模板

| 日期 | 主题 | 一句话主张 | V级 | 主链接 | 反方链接 | 备注 |
|------|------|------------|-----|--------|----------|------|
| 2026-07 | QEC | Willow below threshold | V1 | https://arxiv.org/abs/2408.13687 | — | 存储实验 |
| 2026-07 | 化学 | 超精确对角化规模混合模拟 | V1 | https://arxiv.org/abs/2405.05068 | — | SciAdv |
| 2026-07 | 金融 | +34% fill | V3 | https://arxiv.org/abs/2509.17715 | https://scottaaronson.blog/?p=9170 | 噪声自述 |
| 2026-07 | 安全 | FIPS 203–205 | V1 | https://csrc.nist.gov/pubs/fips/203/final | — | 迁移 |
| | | | | | | |

## 16.3 建议精读顺序（深入）

| 顺序 | 读什么 | 链接 | 读完你能回答 |
|------|--------|------|----------------|
| 1 | Mind the gaps | https://arxiv.org/pdf/2510.19928 | 我们卡在哪一关 |
| 2 | Willow | https://arxiv.org/pdf/2408.13687 | 纠错实验到底证明了啥 |
| 3 | SQD 化学 | https://arxiv.org/pdf/2405.05068 | 混合计算怎么干活 |
| 4 | qLDPC | https://arxiv.org/pdf/2308.07915 | 为何要高连通芯片 |
| 5 | HSBC + Aaronson | 两篇连读 | 如何审应用 PR |
| 6 | Barren plateaus | https://arxiv.org/pdf/2405.00781 | 为何 QML 要冷静 |
| 7 | IBM roadmap | https://www.ibm.com/roadmaps/quantum/ | 厂商自己怎么排期 |
| 8 | NIST PQC | FIPS 203 页 | 安全落地清单 |

---

# 17. 文档诚实边界

## 17.1 简介

写明**本文保证什么、不保证什么**，避免误用。

## 17.2 边界表

| 项目 | 说明 |
|------|------|
| 已尽量核对 | Willow、qLDPC、Eisert–Preskill、Preskill megaquop、SQD 化学、HSBC arXiv、NIST、IBM roadmap、HSBC 新闻、Aaronson 博文等一级页 |
| 明确为意图 | IBM 2026/2029/2033 节点（官网 subject to change） |
| 明确为争议 | HSBC ~34% 的「量子优势」解读 |
| 未升格 V1 | 部分退火生产故事、未打开全文的咨询「万亿市场」数字 |
| 蛋白 12635 原子 | 以机构新闻为主；方法承接 hybrid 化学，完整同行评审以最终论文为准 |
| 时效 | 硬件与路线图变化快；引用以你打开链接当日内容为准 |
| 非投资建议 | 本文不构成买卖任何证券的建议 |

---

# 附录 A：四鸿沟 × 案例映射（速查）

| 案例 | 更靠近哪一关 | 一句话 |
|------|----------------|--------|
| Willow | (i)→(ii) 门槛实验 | 纠错开始像理论那样工作 |
| qLDPC 论文 | (ii) 资源工程 | 降低逻辑比特成本 |
| SQD 化学 | (iv) 早期科学 | 混合模拟扩大可算规模 |
| HSBC | 未稳过 (iii) | 启发式业务指标，可验证量子优势不足 |
| PQC | 平行赛道 | 不依赖 FASQ 已建成 |

---

# 附录 B：术语中英对照（打印友好）

| 中文 | English |
|------|---------|
| 噪声中等规模量子 | NISQ |
| 容错量子计算 | FTQC / fault-tolerant QC |
| 容错应用级量子 | FASQ |
| 逻辑比特 | logical qubit |
| 量子纠错 | quantum error correction (QEC) |
| 表面码 | surface code |
| 量子低密度奇偶校验码 | qLDPC |
| 量子优势 | quantum advantage |
| 量子中心超算 | quantum-centric supercomputing |
| 变分量子本征求解器 | VQE |
| 量子近似优化算法 | QAOA |
| 基于采样的量子对角化 | SQD |
| 贫瘠高原 | barren plateau |
| 后量子密码 | post-quantum cryptography (PQC) |
| 效用规模 | utility-scale |

---

**文档结束**

*路径：`D:\AI\量子\量子计算与AI研究全景整理.md`*  
*使用建议：用支持目录跳转的 Markdown 阅读器打开；需要打印时可只导出 §2–§6 与 §15。*
