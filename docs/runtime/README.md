# OPL Runtime

Runtime 文档只解释当前运行对象和运维边界。

- [Runtime 命名与边界](./opl-runtime-naming-and-boundary-contract.md)
- [Stage graph 与 AI route](./stage-graph-route-transition-runtime.md)
- [Temporal service supervision](./temporal-service-supervision.md)
- Temporal namespace 与 Search Attribute 的 owner、schema、配额和迁移合同见 [temporal-resource-governance.json](../../contracts/opl-framework/temporal-resource-governance.json)；App/Domain 只消费 probe projection。
- [Foundry Kernel control plane](./opl-foundry-kernel-control-plane.md)
- [Family Runtime Python client](./family-runtime-python-client.md)

动态 provider、worker、Attempt 和 health 状态从 fresh CLI readback读取。外部框架调研、迁移计划和已完成 adoption 过程不属于本目录。

依赖发布解析由 `scripts/resolve-dependency-releases.mjs` 消费
`contracts/opl-framework/dependency-release-sources.json`。需要同时构建源码的依赖声明
`source_commit_required`：GitHub release 解析准确 tag 的 commit，npm 解析所选发布的
`gitHead` 并在指定仓库回读。App 消费该不可变结果，不以当前 main 替代发布来源。

构建可用 `OPL_DEPENDENCY_ARCHIVE_CACHE_DIR` 复用工具原始归档。解析仍读取新鲜的官方
metadata；每次命中按该 metadata 的 SHA-256 或 npm SRI 重新校验字节，不能凭缓存
决定 latest，也不能在官方查询失败时采用旧版本。`scripts/fetch-dependency-archive.mjs`
接收冻结的 `--url`、`--sha256`、`--output`，供后续安装消费同一份已下载文件。
缓存文件按规范化 HTTPS URL 的 SHA-256 命名为 `<digest>.archive`，文件名只定位字节，
内容仍须通过当前摘要。损坏或缺失时重新下载；安装输出使用验证后的临时文件原子替换。

Hosted Package source 的归档检查与解包使用同一结构化 tar reader。成员身份按
PAX/GNU 元数据解析后的实际路径判断，不解析依赖 locale 的命令行列表；合法中文
文件名可用，越出声明根目录、反斜杠和非普通文件/目录成员仍拒绝。OCI layer 的
摘要、大小及 owner/carrier/commit 绑定检查保持在 acquisition owner 中。
