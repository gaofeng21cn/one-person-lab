# Unified Harness Engineering Substrate 设计

## 背景

截至 2026-04-07，`OPL`、`Med Auto Science`、`RedCube AI`、`Med Auto Grant` 已经形成明显的系列关系，但跨仓口径仍然混杂了三类不同语义：

1. 顶层 `OPL Gateway / Federation`
2. domain-local `Domain Harness OS`
3. 当前本地运行形态与开发控制面

如果继续沿用旧表述，后续会反复出现这些冲突：

- 把 `OPL` 误写成统一 runtime
- 把三个 domain project 写成彼此无关的系统
- 把当前 `Codex` 本地宿主形态误写成体系本体
- 把开发控制面（`Codex App + OMX`）误写成产品运行时

## 本轮设计结论

### 1. 引入统一总名

跨项目共享底座统一命名为：

- `Unified Harness Engineering Substrate`

这个总名用于描述：

- 多个 domain system 共享的一套 Harness Engineering 语言
- 共享执行哲学、边界规则与部署兼容故事

这个总名不用于声称：

- 已经存在独立公共代码框架
- 三个 domain 已经共享相同对象模型或相同执行图

### 2. 固定四层关系

统一分层为：

```text
Human / Agent
  -> OPL Gateway / Federation
      -> Unified Harness Engineering Substrate
          -> Domain Gateway
              -> Domain Harness OS
                  -> Deployment Shape
```

### 3. 固定 OPL 的位置

`OPL`：

- 是顶层 `Gateway / Federation`
- 不是第四个 `Domain Harness OS`
- 不复制三个 domain 的执行内核
- 负责公开解释整个体系如何拼接、路由与分工

### 4. 固定三个 domain 的位置

- `Med Auto Science`：医学 `Research Ops` 的 `Domain Harness OS`
- `RedCube AI`：视觉交付的 `Domain Harness OS`
- `Med Auto Grant`：未来医学 `Grant Ops` 的 `Domain Harness OS` 方向

### 5. 固定部署形态语义

当前默认本地形态：

- `Codex`-default host-agent runtime

未来允许的商业化形态：

- managed web runtime on the same substrate

两者只是部署差异，不是架构本体差异。

### 6. 固定开发控制面语义

研发阶段统一采用：

- `Codex App`：规划、冻结、阶段裁决、集成判断
- `OMX`：长时间执行、验证、report 写回、恢复

该层只属于开发控制面，不应与产品运行时混写。

## README 口径约束

公开 README 必须：

- 首先服务非 AI 的人类专家
- 先讲项目价值、对象、边界与当前能力
- 再在合适位置补充与 `Unified Harness Engineering Substrate` 的关系

公开 README 不应：

- 退化成框架白皮书
- 把共享 substrate 写成已独立成型的公共代码仓
- 把 `Claude Code / OpenClaw` 写成并列主线

## 内部文档口径约束

内部开发文档允许使用更完整的统一架构语言，但应坚持：

- 共享约束上收至 `Unified Harness Engineering Substrate`
- domain-specific contract 继续留在各自仓库
- 当前部署形态与未来托管形态分开写
- 开发控制面与产品运行时分开写

## 本轮落地范围

- `OPL`：README、roadmap、project truth、substrate 总纲
- `Med Auto Science`：README、docs index、project truth、domain 映射文档
- `RedCube AI`：README、docs index、project truth、核心运行文档、domain 映射文档
- `Med Auto Grant`：README、docs index、project truth、domain 映射文档

## 明确不做

- 不宣布已经存在独立公共 kernel 仓库
- 不把三个 domain 的对象模型或 route vocabulary 强行统一
- 不修改当前 phase order 或 product maturity claim
- 不把 `OPL` 写成统一 execution owner
