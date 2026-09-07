# OPL Framework 源码模块边界

本文是维护 `contracts/opl-framework/source-module-map.json` 的操作参考。contract 是 source unit、root 和 dependency policy 的唯一 machine owner。

源码层次见 [架构](../architecture.md#source-topology)；每个文件所属 source unit 及允许的
依赖由 machine map 定义。本页只说明怎样维护该边界。

## Import 规则

1. unit 外调用优先使用目标 unit 的 public entrypoint。
2. 允许直接依赖明确登记的 Host plugin leaf，不允许无合同 deep import。
3. entrypoint 只装配，不持有业务状态。
4. adapter 实现外部协议，不拥有对应事实。
5. read model 只能投影，不写 authority。
6. kernel 只接收真正跨多个 unit 的稳定 primitive，不接收为了消除一条 import 而下沉的业务逻辑。

## 何时拆 unit

只有同时出现独立职责、多个真实 caller 和稳定依赖边界时才拆 source unit。文件过长、品牌名称、未来复用或目录对称本身不构成拆分理由。

若能力需要独立安装、跨仓 ownership 或独立发布，按 [Package 拓扑](../project.md#package-拓扑) 决定 workspace Package、独立 repo 与 publication；不要通过新增 source root 模拟 Package。

## 变更步骤

1. 用 CodeGraph 或 TypeScript import graph确认 definitions 和 caller。
2. 确定唯一新 owner 与公开 entrypoint。
3. 切换真实 caller。
4. 同批删除旧 barrel、facade、schema、fixture 和仅保护旧接口的测试。
5. 更新 `source-module-map.json`。
6. 运行：

```bash
npm run source:modules -- --strict-imports --strict-cycles
npm run typecheck
npm run test:structure
```

通过只证明源码边界，不证明 runtime、installed、release 或 domain readiness。
