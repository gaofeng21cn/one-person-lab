# OPL Framework 源码模块边界

源码按[架构中的包职责](../architecture.md#source-topology)维护。依赖关系由 workspace 包的公开入口、TypeScript 项目引用与[导入检查](../../scripts/check-v2-import-guard.mjs)共同约束。

## Import 规则

1. unit 外调用优先使用目标 unit 的 public entrypoint。
2. 相邻包按已声明的依赖方向调用公开入口。
3. entrypoint 只装配，不持有业务状态。
4. adapter 实现外部协议，不拥有对应事实。
5. read model 只能投影，不写 authority。
6. kernel 只接收真正跨多个 unit 的稳定 primitive，不接收为了消除一条 import 而下沉的业务逻辑。

## 何时拆 unit

只有同时出现独立职责、多个真实 caller 和稳定依赖边界时才拆 source unit。文件过长、品牌名称、未来复用或目录对称本身不构成拆分理由。

若能力需要独立安装、跨仓 ownership 或独立发布，按 [Package 拓扑](../project.md#package-拓扑) 决定显式包边界、独立 repo 与 publication；不要通过新增 source root 模拟 Package。DSH Host/Client 插件与 Framework Package 的分层见 [Host scope boundary](../architecture.md#host-scope-boundary)。载体是 Package 的安装实现，不会自动把 Package 变成 DSH plugin。

## 变更步骤

1. 用 CodeGraph 或 TypeScript import graph确认 definitions 和 caller。
2. 确定唯一新 owner 与公开 entrypoint。
3. 切换真实 caller。
4. 同批删除旧 barrel、facade、schema、fixture 和仅保护旧接口的测试。
5. 若包边界确实改变，同步对应的 manifest、TypeScript 项目引用和导入检查。
6. 运行：

```bash
npm run v2:guard
npm run typecheck
npm run test:structure
```

通过只证明源码边界，不证明 runtime、installed、release 或 domain readiness。
