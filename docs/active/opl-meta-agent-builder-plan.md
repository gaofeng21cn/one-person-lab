# OPL 元智能体开发计划

Owner: `One Person Lab`
Purpose: `meta_agent_builder_active_plan`
State: `active_plan`
Machine boundary: 本文是人读 active plan。机器真相归 `contracts/`、`src/agent-lab-complete.ts`、`opl agent-lab complete --json`、`opl agents meta-builder plan --json`、runtime ledger、provider receipt、domain-owned eval/proof refs 和后续 App/workbench projection。

## 定位

`OPL Foundry Agent Builder` 是面向“用 OPL 开发智能体”的元智能体。它的交付物不是论文、基金或 PPT，而是一个达到 baseline 要求的 OPL-compatible Foundry Agent：包含 descriptor、stage pack、prompt / skill refs、action catalog、memory descriptor、artifact locator、quality gate refs、sidecar/projection contracts、Agent Lab eval suite、operator runbook 和 baseline delivery receipt。

它本身也是高价值知识交付智能体，因此遵守 OPL family 边界：

- OPL 持有框架、运行、测试、评估、恢复、观测、optimizer candidate 和 promotion gate。
- 目标 domain agent 持有未来的 domain truth、quality verdict、artifact authority、memory body 和 owner receipt。
- Meta-agent 可以生成 candidate agent package / branch / prompt / skill / stage policy，但不能绕过 gate 直接 promotion 默认 agent，也不能替 domain owner 写 truth。

## 已落地机器入口

- `opl agent-lab complete --json`：完整 Agent Lab control plane，包含 OPL-native runner、Inspect AI optional adapter、METR task-standard reference、OpenInference/OpenTelemetry refs、Langfuse/Phoenix optional connector refs、optimizer loop 和 RL transition boundary。
- `opl agents meta-builder plan --json`：元智能体九阶段计划与 baseline / online-learning gate。
- `contracts/opl-framework/agent-lab-contract.json`：冻结 complete control-plane 和 meta-agent builder surface。
- `src/agent-lab-complete.ts`：当前 TypeScript read model。

## 阶段链路

```text
intent intake
  -> web experience research
  -> stage decomposition
  -> agent skeleton build
  -> eval suite build
  -> baseline run
  -> optimizer iteration
  -> baseline delivery
  -> online learning
```

## 阶段职责

| Stage | OPL 产出 | Gate |
| --- | --- | --- |
| `intent-intake` | 用户目标、交付标准、非目标、authority boundary | intent brief reviewed |
| `web-experience-research` | 公开经验、任务拆解模式、工具/数据/质量 gate refs | source refs recorded |
| `stage-decomposition` | stage control plane、action catalog、memory refs、artifact locator | descriptor valid |
| `agent-skeleton-build` | OPL-compatible repo/package skeleton、prompt/skill refs、sidecar contracts | scaffold validation passed |
| `eval-suite-build` | Agent Lab task manifests、recovery probes、scorecard refs、promotion gates | no forbidden authority |
| `baseline-run` | trajectories、receipts、failure taxonomy、domain-owned scorecard refs | suite pass or typed blocker |
| `optimizer-iteration` | prompt/skill/stage/tool-policy candidate refs and branch refs | regression and recovery gates |
| `baseline-delivery` | versioned baseline agent package and operator runbook | delivery receipt accepted |
| `online-learning` | reviewed trajectory datasets and future candidate refs | gated continuous learning only |

## 外部项目吸收判断

| 项目/模式 | OPL 用法 | 不做的事 |
| --- | --- | --- |
| Inspect AI | optional eval runner adapter：task / solver / scorer / eval log 映射到 OPL manifest / executor / scorecard / trajectory refs | 不作为 OPL core 依赖，不接管 domain scorer |
| METR task standard | portable task environment pattern：任务包、环境、评分和轨迹组织方式 | 不把 benchmark 分数写成 domain ready |
| Langfuse / Phoenix | optional observability connector：trace、dataset、run、experiment、evaluator refs | 不上传 memory body 或 domain truth；不作为 authority |
| DSPy / TextGrad | optimizer pattern：prompt / few-shot / textual feedback candidate 生成 | 不自动改默认 agent |
| Agent Lightning | RL disaggregation pattern：trajectory / reward / training consumer 分离 | OPL core 不训练或部署模型权重 |

调研依据：

- Inspect AI：官方文档把 task 定义为 datasets、solvers、scorers 的集成单元，并提供 scorer / eval log / package entrypoint 机制。
- METR Task Standard：目标是统一 agent task 格式，让不同团队可以复用任务环境、指令、资源限制和评分方式。
- Langfuse / Phoenix：二者都把 trace、dataset、evaluation、prompt experiment 作为 LLM 应用迭代基础；Phoenix 明确基于 OpenTelemetry / OpenInference，Langfuse 也支持 OpenTelemetry。
- DSPy / TextGrad：可作为 prompt、few-shot、instruction 或文本反馈 optimizer 的模式来源。
- Agent Lightning：可作为 agent execution 与 RL training 解耦的模式来源；OPL 只吸收 trajectory / transition / reward boundary，不把训练器放进 core。

调研来源：

- Inspect AI docs: `https://inspect.aisi.org.uk/`
- METR Task Standard: `https://github.com/METR/task-standard`
- Langfuse docs: `https://langfuse.com/docs`
- Phoenix docs: `https://arize.com/docs/phoenix/`
- OpenInference: `https://arize-ai.github.io/openinference/`
- DSPy optimizer docs: `https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md`
- TextGrad docs: `https://textgrad.readthedocs.io/en/latest/textgrad.html`
- Agent Lightning paper: `https://arxiv.org/abs/2508.03680`

评估结论：

- 近期最合适的路线是 `OPL Agent Lab complete control plane -> OPL Foundry Agent Builder -> optional external connectors`。先用 OPL 自有 descriptor、stage、queue、ledger、receipt、scorecard refs、promotion gate 与 scaffold/validate 形成可交付闭环，再把 Inspect AI、Langfuse/Phoenix、DSPy/TextGrad、Agent Lightning 接成可选增强层。
- Inspect AI 和 METR 的高价值在“任务/环境/solver/scorer/log 的标准化”，适合作为 eval adapter 和 portable task package 参考。
- Langfuse、Phoenix 与 OpenInference 的高价值在“trace / span / dataset / experiment / feedback 的观测面”，适合作为 export connector，不适合作为 OPL authority store。
- DSPy、TextGrad 的高价值在“从小样本、轨迹和评分中生成 prompt / few-shot / instruction candidate”，适合作为 optimizer pattern 或后续 connector，不适合作为默认自动改写 agent 的唯一依据。
- Agent Lightning 的高价值在“agent execution 与 RL training 解耦”，适合作为未来训练消费方边界；OPL core 只稳定输出 trajectory / transition / reward refs，训练、权重发布和默认 agent promotion 仍需显式 gate。

## Baseline 验收

一个新 Agent baseline 至少需要：

- descriptor valid；
- direct path 和 OPL-hosted path 已声明；
- Agent Lab suite passed 或返回 typed blocker；
- recovery probes passed；
- no-forbidden-write proof passed；
- domain authority boundary explicit；
- operator runbook present。

## 在线学习

在线学习采用 refs-only、gate-first：

```text
capture trajectory refs
  -> score or label with owner refs
  -> add failure/success case to dataset refs
  -> generate candidate change
  -> run offline Agent Lab suite
  -> promote only after explicit gate
```

禁止：

- 写 domain truth；
- 写 memory body；
- 接受或拒绝 domain writeback；
- 修改 artifact body；
- 无 gate promotion 默认 agent；
- 在 OPL core 内训练或部署模型权重。

## 下一步

1. App/workbench 消费 `opl agent-lab complete --json` 与 `opl agents meta-builder plan --json`。
2. 为 Inspect AI 增加可选 runner connector，只接收/输出 OPL refs。
3. 为 Langfuse/Phoenix 增加可选 export connector，默认关闭，不能成为 core 依赖。
4. 将 meta-agent builder 的 stage plan 接入 `opl agents scaffold`，生成真实 candidate agent repo。
5. 将 optimizer candidate refs 映射到 branch / config patch / prompt patch，并强制走 Agent Lab gates。
