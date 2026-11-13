# OPL MCP Apps

The family development policy is [OPL Agent Apps](../policies/agent-native-app-policy.md).
OPL MiniApp names an on-demand collaboration surface within that model; it is not
a new installable unit or protocol. This specification owns the existing shared
MCP App behavior and contribution mapping. The [development guide](./development.md)
explains how to reuse it; implementation gaps remain in the active gap document.

## Value Proposition

Give installed OPL Packages one Agent-callable, conversational review surface for
current state, structured diffs, and explicitly confirmed actions. The human remains
able to inspect the same state, but the Agent owns discovery, navigation, and
summarization. High-frequency authoring, map exploration, device operation, and
always-on telemetry keep their standalone surfaces.

## Why MCP Apps

The Agent can select the relevant task, compare a proposed change with its source
evidence, and continue the conversation without asking the user to navigate another
application. The UI contributes visual hierarchy and an explicit confirmation gate;
it does not own domain truth or execute arbitrary Package HTML.

## Unified application model

This specification owns the shared MiniApp interaction and contribution model.
The App product contract owns navigation and visual design; Studio owns the MCP
App host and transport; installed Packages own business data, actions and quality
decisions. Any remaining implementation gaps and their delivery sequence live only in
[the active gap document](../active/current-state-vs-ideal-gap.md).

An Agent tool and a human-facing view are entrypoints to the same owner operation.
They share project, work-item and artifact identity, and read the same result.
Discovery remains descriptor-driven. A contribution does not introduce another
application registry, session owner, task queue or credential store.

The shared OPL Apps catalog exposes a Package-level `products` projection alongside
its view list. A product entry is navigation metadata, not a MiniApp surface: one
Package may expose several internal views inside `ui://opl/apps.html`, while a
declared dedicated App has its own `server + resourceUri` identity. The projection
uses `presentation.miniapp` when present and safely falls back to
`shared_view/product_entry` with the first declared view as the navigation entry.
`presentation_mode` is `shared_view`, `dedicated_app`, or `professional_app`;
`entry_kind` is `product_entry` or `runtime_view`; `direct_entry` only controls the
navigation affordance and never starts a surface.

Three presentation forms can coexist within one Package:

- Shared declarative views for progress, artifacts, lists and review.
- A dedicated MCP App for rich domain interaction, such as mail composition or
  media review, using the same host protocol and owner operations.
- An existing professional application for sustained editing, device control or
  monitoring, reached through an owner-declared presentation or artifact link.

Shared components are selected by view capability and owner schema, never by
Package or Agent name. The initial reusable vocabulary is progress, artifact and
review, supported by list/detail, loading, empty/error states and action feedback.
Domain editors and quality verdicts remain with their owners. A new standalone
runtime, database or independently published SDK requires an actual consumer need.

## Progress-first interaction

Opening a view carries the current registered workspace and exact work item.
Known context supplies owner inputs; users select missing business facts rather
than routinely locating status or manifest files. A path entry remains available
when the requested artifact cannot be resolved unambiguously by its owner.

The default workbench makes current work, available output, pending decisions and
the next available action visible. Usable intermediate artifacts remain available
while work continues. Quality debt is displayed separately from execution progress;
it does not create a new generic startup or review gate.

Short operations return an owner result. Long-running work uses the existing
Task/StageRun and provider execution path, returning its durable identity for
observation and later reopening. Closing or refreshing a view does not create,
restart or cancel a task. Only currently available canonical actions are offered;
domain-specific confirmation and revision requirements remain owner-defined.
Unknown dispatch outcomes are reconciled through owner readback before retry.

Studio supplies host theme, locale and viewport context. Shared and dedicated
views consume that context while keeping their domain layout. Selection updates
model context; appending a composer draft and actually starting work are distinct
operations.

Connection identity, consumer authorization and connection repair belong to OPL
Connect's public Framework/App surfaces. Its machine contract is
`contracts/opl-framework/connection-authorization-contract.json`, with the
connection owner explanation in `docs/specs/connection-authorization.md`.
The trusted host activates a fresh installed descriptor through
`createOplConnectionContextHost(...).activate(installedDescriptor)` from
`opl-framework/connection-authorization-host`. Its private `context.connect`
port exposes `listConnections()`, `requestAccess(connectionId, capabilityIds)`
and `invoke(connectionId, capabilityId, input)`. Requesting access is
distinct from approving it. These capabilities are exposed through the existing
host/MCP tool boundary, not by accepting a Package identity from page input.
Every invocation rechecks the installed descriptor, grant, connection revision
and provider capability; grant approval and revocation use the owner App action.
Mini Apps consume connection references
and authorized owner operations, never copy provider credentials or authorize a
caller from a UI-supplied identity. Provider/carrier owners retain credential
storage and renewal. The Connect implementation is coordinated independently of
the presentation layer.

The shared `opl-apps` server discovers views across Packages and receives its
Package focus from tool input. That focus is navigation, not a consumer identity;
this server does not expose Connect consumer calls. A dedicated trusted owner
may capture the activated context during initialization before accepting tool
input. Disposing the context or changing the installed descriptor invalidates
the port.

## Views

- Framework work-item list and detail, projected from the canonical OPL work-item
  projection.
- Package-declared list/detail, approval diff, task board, artifact, activity,
  service-status, and channel-access views.
- Generic read-input forms for owner views that require a work-item identity or an
  exact artifact reference.

The catalog and selected content scroll independently inside the host viewport,
so selecting a Package near the end of a long catalog keeps its content visible.
Narrow views stack a bounded catalog above the content pane.

## Tools

- `open_opl_apps`: discover framework and installed Package views and return the
  selected owner's data in the same structured result for the Agent and UI. Read-only.
- `opl_app_contribution_read`: invoke one declared Package data ref or a framework
  runtime projection. Read-only.
- `opl_app_contribution_execute`: invoke one declared Package action with its
  owner-required confirmation, or one current Framework runtime action through
  `opl.runtime.v1#action`.

## Adapters

An installed Package may point to `app-contribution-adapter.json` at its carrier
source root. The declarative adapter maps a declared `data_ref` or `action_ref`
to one contained JSON read or fixed command. Command entries use stdin JSON,
bounded output, a 120-second timeout, package/profile-root containment, and an
optional output transform. `request_json` preserves the Package-owned request
envelope, while `passthrough` preserves a Package-owned response envelope.
JSON file reads use the same declared output transform as commands, while a
missing file remains unavailable. Root containment also resolves symbolic links.
Read adapters can supply scalar defaults in `input_schema.properties`; explicit
input takes precedence. Defaults do not supply confirmation or execute inputs.
The `runtime_context` read kind projects `progress` or `artifacts` from the
registered workspace and the Package's current work item. It reuses the existing
work-item projection and attempt artifact records; it does not scan for files or
create a Package-specific state store. Ambiguous work items use the same
`input_required` schema and selection form as other owner reads.
Projections preserve owner records whose shape does not match a specialized card;
stage pointers and manifests must not become unavailable or empty just because
they lack a card collection. Decision cards retain the full packet, including
alternatives, evidence, quality debt, and any execution plan.

`workspace_path` selects one registered workspace binding and sets
`OPL_PROFILE_WORKSPACE` for profile-relative reads. The Framework removes that
transport-only field before invoking the owner and rejects unregistered paths or
conflicts with an explicit work-item identity.
Owner artifact inputs use distinct names, such as `workspace_file`; they must not
reuse the transport-only `workspace_path` or `work_item_root` fields.

## Host Flow

`ui://opl/apps.html` is one MCP App surface. Its installed Package and runtime
views are internal navigation, not separately launched MiniApps. The App host
owns the MiniApp directory and its ephemeral UI session; this renderer owns only
the selected business view and delegates reads and actions to the original owner.
Closing the host surface does not cancel an owner task or remove a Package.

The catalog presents product entries before the internal view list. Selecting a
product card or an internal view changes navigation within the existing shared
surface. Relay mail and Med Auto Cast media review are dedicated surfaces and are
started only through their own read-only launcher and resource initialization.

The shared UI uses a compact searchable view list on wide screens and a labeled,
grouped view selector in narrow panels. The content retains the available height;
navigation must not reserve a fixed fraction of the viewport. Long titles and
owner values wrap, keyboard focus remains visible, and touch controls keep a
44px target. Theme changes preserve the current view and input.

1. The Agent opens `open_opl_apps` with an optional Package/view focus.
2. The view renders the selected owner result from the tool response, including
   the Agent's exact view and input focus. Later navigation reads owner state.
3. Selection identity and registered workspace carry across Package views.
4. An in-view dialog shows the exact command target and input before a confirmed
   command calls `opl_app_contribution_execute`; the owner remains
   the only writer and must return its own result or receipt.
5. After execution, the view reloads owner state instead of synthesizing success.

The UI works when sandbox storage is unavailable and does not depend on browser
modal permissions. Confirmation buttons close the dialog explicitly, so cancellation
and confirmation also work in hosts that do not grant iframe form submission. Read responses are bound to the current selection so a slower
previous request cannot overwrite a newly selected view. Framework builds honor
the selected output directory for both compiled code and the bundled MCP view.

Protocol tests prove tool/resource shape and broker behavior. They do not prove
host rendering, installed Package currentness, publication, or domain acceptance.

## Delivery Boundary

Installed Packages declare their views and adapter in the carrier source root.
The MCP catalog includes only callable Packages with a declared contribution ABI;
desktop-only contributions remain with their native consumer. Owner error responses
retain their diagnostic instead of being reported as an identity mismatch.
Framework payload allowlists must include the adapter file, and Package content
locks must cover it when present. Framework itself publishes no replacement
standalone UI; Relay retains its dedicated MCP App, while device control, map
exploration, high-frequency authoring, and live monitoring remain standalone.

## Authority

The installed Package remains the data and action owner. OPL owns descriptor
discovery, generic projection, rendering, and the confirmation gate. The MCP App
cannot synthesize an owner receipt, approve a domain decision, or turn a projection
into domain truth.

## Task workbench

The canonical runtime item opens a shared workbench with execution progress,
declared domain paths, evidence/artifacts and pending human decisions. It uses
`opl.runtime.v1#item` and `opl.runtime.v1#domain-detail`, carrying exact item and
view identity and conditional revision. The renderer registry is selected by
`view_kind` and the owner-declared schema, never by Agent ID. Unsupported or
failed domain reads remain local to that view; successful prior revisions remain
visible with a refresh warning. Selection and evidence references update model
context without executing a command.

The research-path renderer preserves owner-authored node details, source refs,
supporting/opposing/inconclusive edges, failed routes and review refs. Execution
progress is separate from scientific judgment. The same renderer handles a
Package contribution carrying its full trajectory; it never reconstructs missing
evidence or authorizes a decision. DSH is only a host adapter in Studio, not a
dependency of this resource.

The task detail offers only canonical runtime routes bound to its current item
and attempt. Execution checks the route revision again and delegates to the
existing runtime action owner. A dispatched operation with an unknown outcome
returns a readback reference; the view does not automatically repeat it. The
original durable execution identity remains the reopening and observation key.

Opening a local artifact uses `opl-workspace://artifact?ref=<absolute-path>`;
media segments may add `start` and `end` seconds. The Framework carries the
owner's absolute artifact path without assuming that its registered workspace
is the conversation thread's current directory. Studio resolves it only when
that exact path is inside the active thread workspace, then uses the existing
workspace byte/access APIs and their realpath containment checks. An artifact
outside that workspace remains a reference and is not opened through this bridge.

### Shared app navigation

The shared UI selects one installed product and shows its functions. Search can span all products; focused task handoffs still select the exact declared view. A dedicated-app descriptor is described as a shared overview here, with guidance to open its dedicated MiniApp from the host switcher. It never implies that selecting a product launches another UI session.


### 连续导航

Package 的 `presentation.miniapp.dedicated_resource_uri` 可声明共享概览的专用界面入口，Framework 只投影这项 owner 声明。同版本的本地安装也优先读取实际载体的 MiniApp 入口，避免旧目录投影覆盖新 UI；名称、策略和发布身份仍由既有 owner 投影持有。标准 `ui/open-link` 使用该 `ui://` URI，fragment 为 URL 编码的 JSON 导航参数。宿主仅匹配当前目录中的唯一只读 launcher，按其 input schema 过滤参数；缺失或歧义保持原界面。共享页只传递当前对象的引用，不传业务正文。

自有 UI 通过标准 `ui/update-model-context` 的 `structuredContent.navigation` 提供再次打开用的参数。App 可在本机保存隔离到 thread/server/resource 的有限显示偏好，owner 每次打开重新校验并读取对象。显式入口优先；恢复不携带调用 ID、编辑缓冲区或写操作。应用退出、关闭或切换均不改变后台任务状态。

本地源码更新必须执行 npm 的 prepare 生命周期，重新生成 `dist` 与 MCP App HTML；版本号和依赖清单相同也不能跳过。源码回执、实际载体和 `resources/read` 返回的网页必须来自同一套实现。
