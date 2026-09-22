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

Standard Agent 安装、更新或修复时，carrier adapter 从已选择版本的 owner OCI artifact
读取 manifest、payload 和 source layer，核对身份、源码提交、layer size/SHA-256 及
carrier content lock。完整源码与最小插件一同保存于原有 marketplace 根，原子替换后再交给
原生插件管理器。归档中的 Package 描述文件优先读取根目录；根目录未提供时，读取已绑定
payload `source_root` 下的 `opl-package.json`，仍验证物理路径及 Package 身份，不扫描或猜测其他目录。
下载临时目录不作为运行根。既有 marketplace marker 记录 artifact/source
digest，接口发现与 Hosted action 使用同一个父级源码根，不创建独立 Package registry、
版本指针或源码缓存。缺失声明的 descriptor/action catalog 时，Package status 显示
`hosted_agent_source_unavailable`，保留 carrier callable 的独立事实，提示重新安装 Package。
这些检查证明源码与入口文件可用；Temporal、实际 StageRun 和领域业务验收分别回读。
已安装在 OPL state 受管 marketplace 目录中的本地插件包，更新和修复复用安装时的
payload 物化路径，不退回 descriptor 中的 Git 仓库地址另建 marketplace。已有 Git
carrier 和显式开发目录继续使用原有生命周期，不因存在 payload 声明而切换安装来源。

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
