# Artifact 与 Package Delivery 边界

本文解释 artifact body、Package publication和Framework refs transport的owner分工。

## Artifact

domain owner创建和修改artifact body，并决定quality、canonical、export和delivery状态。Framework可以保存locator、hash、lineage、receipt ref、retention和restore proof。

```text
domain output
  -> owner manifest / receipt
  -> runtime artifact root
  -> Framework refs/index
  -> App/operator projection
```

文件存在、hash匹配或projection可见都不等于owner accepted。

## Stage artifact

一个Stage Attempt的artifact unit至少绑定：

- StageRun/Attempt identity；
- inputs/outputs；
- artifact manifest；
- evidence和receipt refs；
- content integrity；
- current/canonical/export owner decision。

Framework可以验证结构、投影和恢复；只有domain owner能promotion或accept。

## Package

Package owner持有descriptor、runtime bytes、version和publication。native carrier持有安装/启停/currentness。Framework只下载/验证/hand off owner bytes或调用carrier，并聚合installed/callable。

`ordered_path_length_file_length_bytes` 的字节编码由 Framework 的 `src/kernel/package-content-lock.ts` 与 `python/opl_framework/package_content_lock.py` 持有，并以 UTF-8、二进制内容和路径顺序的同一向量验证一致性。Python 独立工具通过 `node scripts/materialize-python-support.mjs --module package_content_lock --target <consumer>/_opl_package_content_lock.py` 生成便携副本；加 `--check` 核对逐字一致。路径选择、identity 和 canonicalization 校验仍由实际调用方负责。

私有 owner 仓库的发布检出优先使用单仓只读 Deploy Key。公钥登记在对应源码仓库，
私钥保存于受保护发布环境的 `OWNER_SOURCE_READ_KEY_<OWNER>_<REPO>` secret；
`<OWNER>/<REPO>` 取自 canonical Package manifest 的 `source_repo`，转为大写并把
`/`、`.`、`-` 替换为 `_`。例如 `example/private-agent` 对应
`OWNER_SOURCE_READ_KEY_EXAMPLE_PRIVATE_AGENT`，无需新增 Package 名单。
已有 `OWNER_SOURCE_READ_TOKEN` 仍可用于权限限定为所选源码仓库 `Contents: Read`
的检出；公开仓库可沿用工作流自己的 `GITHUB_TOKEN`。凭据只用于源码检出，且不
持久化到 Git；OCI 写入仍使用工作流自身的 Package 权限。

当前 OCI 通道是公开分发，包含完整已提交源码归档，不能把“源码仓库仍私有”当作
归档仍私有。工作流在检出私有源码前匿名核对仓库可见性；公开源码可直接继续，
私有源码须先取得 owner 对该版本完整归档公开的明确授权，再由受保护发布环境的
`PUBLIC_SOURCE_ARCHIVE_COMMIT_<OWNER>_<REPO>` variable 绑定精确源码 commit。
该变量采用上述相同的仓库名称归一方式；读取源码的凭据不构成公开授权。网络错误、
未知可见性、缺失或不匹配的授权均在归档及 OCI 写入前停止。源码仓库自身的可见性不变。

原生 `plugin list` 读取统一使用 10 秒超时；超时终止子进程，严格发现入口返回失败，不接受未完成命令的部分输出。安装、更新等写操作保留独立的 120 秒上限，超时后的实际结果仍需重新读取确认。

Standard Agent 安装、更新或修复时，carrier adapter 从已选择版本的 owner OCI artifact
读取 manifest、payload 和 source layer，核对身份、源码提交、layer size/SHA-256 及
carrier content lock。完整源码与最小插件一同保存于原有 marketplace 根，原子替换后再交给
原生插件管理器。归档中的 Package 描述文件优先读取根目录；根目录未提供时，读取已绑定
payload `source_root` 下的 `opl-package.json`，仍验证物理路径及 Package 身份，不扫描或猜测其他目录。
Full 中存在与当前 owner 版本及 payload source commit 完全匹配的签名源码 seed 时，
同一 carrier adapter 可从 seed 读取字节；仍核验每个 payload 摘要和 content lock，并复制到
原有 marketplace 安装根。seed 不解析 latest、不改变安装选择或 currentness；不匹配时使用
既有 OCI transport，损坏字节直接失败。

下载临时目录不作为运行根。既有 marketplace marker 记录 artifact/source
digest，接口发现与 Hosted action 使用同一个父级源码根，不创建独立 Package registry、
版本指针或源码缓存。缺失声明的 descriptor/action catalog 时，Package status 显示
`hosted_agent_source_unavailable`，保留 carrier callable 的独立事实，提示重新安装 Package。
这些检查证明源码与入口文件可用；Temporal、实际 StageRun 和领域业务验收分别回读。
发布前可运行 `node scripts/verify-package-source-artifacts.ts --package-id <id>`（可重复参数），
在独立临时目录复用同一下载、归档身份和内容摘要校验，再立即清理。该入口只验证明确选择的
根包 payload，不注册原生插件、不修改用户安装状态，也不替代依赖安装、登录及 clean-VM 验收。
已安装在 OPL state 受管 marketplace 目录中的本地插件包，更新和修复复用安装时的
payload 物化路径，不退回 descriptor 中的 Git 仓库地址另建 marketplace。已有 Git
carrier 和显式开发目录继续使用原有生命周期，不因存在 payload 声明而切换安装来源。
更新目标的版本与能力取自当前 owner projection；是否使用托管 payload 路径取自已安装
carrier 的实际目录。选中新版 projection 时仍保留这项安装事实，更新与修复均遵循此规则。

Capability Package 仅在声明 `publication_ref` 时进入 OCI source acquisition；未声明的
Package 保留固定提交的 GitHub payload transport 和原有文件摘要、content lock 校验。
已声明但格式或身份不合法的 OCI reference 仍拒绝安装，不回退到其他来源。

Package 不存在共享 Release Set、聚合 `latest-stable` 或整套冻结前置。每个
Package 只发布自己的 immutable version 与 owner channel；Framework、App 和
Homebrew 分别消费自己声明的 artifact。消费者可以在安装或运行时自由组合
不同版本的 Package，不需要等待其他 Package 同步，也不生成组合 currentness。

系统 Codex App 只承载用户直接使用的交互式插件。descriptor 声明
`codex_surface.interaction_mode = headless_internal` 的内部能力 Package，
使用 OPL state 下的 `internal-package-carrier` 作为独立 `CODEX_HOME`，仍由
Codex 原生插件管理器安装、更新和卸载；Framework 聚合两个作用域的真实安装状态，
不维护第二套 registry、lock 或 currentness。内部作用域不复制用户认证、会话或 Profile。

Weixin 通道、Link Desktop Connector 和 Fleet Agent 是内部模块；Scholar Skills 是
MAS/MAG 按任务消费的能力包。它们保留 OPL 安装与调用能力，不注册为系统 Codex App
的插件。Relay、Persona、Flow 和领域 Agent 等交互式入口继续使用用户 Codex 配置。
已有全局安装迁移时，先验证内部作用域的安装与调用，再通过原生卸载入口移除全局条目。
App 启动维护自动按当前 owner descriptor 识别并迁移旧的内部 Package，复用已安装文件，
不依赖历史下载地址。复制、安装或 descriptor 回读失败时保留原安装并报告需要修复；
没有旧条目时不写入。后台仅暂存更新的维护模式不执行迁移。

源码中的 Package manifest 与 payload 仅保留当前入口和真实合同、测试直接引用的版本。
历史版本通过 Git 与不可变发布产物追溯。删除前须核对实际消费路径；发布所选 payload、
carrier 内容锁与已安装版本的生命周期校验继续由现有 owner 执行。

## Publication

独立publication只在真实外部consumer、不同release cadence或独立rollback需求存在时建立。source repo、workspace Package和published artifact是不同层。

publication完成至少需要owner workflow、immutable ref/digest、可见性和consumer readback。本地build、task branch或Framework catalog不能替代。

发布入口按 owner 分离：Framework 维护 Framework channel，App 维护 App
release channel，每个 Package 维护自己的 package channel。不生成跨 owner 的组合发布清单、冻结集合或备案指针。App 安装包自身的
构建来源、签名、公证和制品校验只描述该安装包，不规定外部 Framework
与 Package 的安装组合，也不能成为其发布前置。

Framework 的入口为 `.github/workflows/publish-framework.yml`；它仅发布
`one-person-lab-framework:<SemVer>` 并推进该 artifact 自己的 `latest-stable`。
自更新直接读取 OCI manifest 的 version、revision 和唯一 Framework source layer，
按 digest 校验下载内容。Homebrew Formula 消费同一 Framework artifact，
App Cask 消费 App 的发布结果，两者独立推进。

## 软件包的发布入口

Package 只有一套软件包发布机制：`publish-package.yml` 发布不可变版本并推进该
Package 自己的 `latest-stable`。用户通过 `opl packages install <package-id> --json`
安装，或在 OPL 的软件包界面选择安装；原生插件管理器负责实际载体生命周期。

一个 Package 是否已进入该流程，从它当前 projection 的
`codex_surface.configured_codex_plugin_carrier.publication_ref` 读取：指向
`one-person-lab-packages/<package-id>` 的 reference 与 `latest-stable` channel tag
共同表示它已有 OCI 渠道。已有 OCI 渠道的 Package 不再新增第二种机制：不创建
GitHub Release 页面及附件，也不建立 ZIP、wheel 等平行安装包发布脚本。源码的
annotated tag 仍用于绑定正式发布内容；版本说明直接使用仓库文档与源码变更记录，
不构成第二个发布渠道。README 提供统一安装命令和 OCI 地址。

该规则覆盖全部 package id，而不只是标准智能体。未进入 OCI 流程的内部模块由
各自 owner descriptor 声明其 carrier 与安装入口。将来为某个 Package 增加新的
分发形式前，先按上面的字段确认它是否已有 OCI 渠道：有则扩展 OCI 渠道，不再新增
第二种机制。

领域质量、资格、运行可用性与软件包发布分别据实记录。App 等有独立安装制品的产品
不属于此规则的范围。

## App

App展示artifact和Package state，发起受控action，并持有App release truth。App不读取domain artifact body来推断quality，也不建立第二Package carrier。

## Safety

- path、symlink、scope、hash和authorization不满足时fail closed；
- destructive cleanup需要owner receipt和restore/retention policy；
- repair只修改当前owner的index或transport；
- publication、submission和external mutation单独授权。

## 验证

分别验证artifact integrity、owner receipt、Package publication、native carrier installed、effective entrypoint和App user path。任一层通过都不能外推其他层。


## 媒体能力包

包含媒体的独立 capability package 与标准 Agent 共用 OCI 源包获取、精确版本与载荷校验。源包允许最多 2 GiB，下载落盘并按流计算 SHA-256；JSON 与单个载荷文件继续使用 128 MiB 边界。发布校验只解包一次，再逐文件校验，安装时逐文件写入并从磁盘计算内容锁，避免为媒体库累计保存全部文件缓冲。

所有包保留源身份、OCI layer 大小与 digest、归档成员路径和物理文件检查。只有标准 Agent 要求 domain descriptor；资产 capability 的入口与内容由它自己的 owner descriptor、导出项和内容锁定义。安装和更新都使用已有 required closure，更新先为选中的新版本补齐依赖，再更新消费方；媒体在工作台的选用与创作质量由 MAC 决定。
