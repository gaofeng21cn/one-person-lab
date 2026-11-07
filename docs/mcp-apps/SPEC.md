# OPL MCP Apps

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

## Views

- Framework work-item list and detail, projected from the canonical OPL work-item
  projection.
- Package-declared list/detail, approval diff, task board, artifact, activity,
  service-status, and channel-access views.
- Generic read-input forms for owner views that require a work-item identity or an
  exact artifact reference.

## Tools

- `open_opl_apps`: discover framework and installed Package views and return the
  selected owner's data in the same structured result for the Agent and UI. Read-only.
- `opl_app_contribution_read`: invoke one declared Package data ref or a framework
  runtime projection. Read-only.
- `opl_app_contribution_execute`: invoke one declared Package action only after the
  descriptor requires confirmation and the view submits `confirmed=true`.

## Adapters

An installed Package may point to `app-contribution-adapter.json` at its carrier
source root. The declarative adapter maps a declared `data_ref` or `action_ref`
to one contained JSON read or fixed command. Command entries use stdin JSON,
bounded output, a 120-second timeout, package/profile-root containment, and an
optional output transform. `request_json` preserves the Package-owned request
envelope, while `passthrough` preserves a Package-owned response envelope.

`workspace_path` selects one registered workspace binding and sets
`OPL_PROFILE_WORKSPACE` for profile-relative reads. The Framework removes that
transport-only field before invoking the owner and rejects unregistered paths or
conflicts with an explicit work-item identity.

## Host Flow

1. The Agent opens `open_opl_apps` with an optional Package/view focus.
2. The view renders the selected owner result from the tool response, including
   the Agent's exact view and input focus. Later navigation reads owner state.
3. Selection identity and registered workspace carry across Package views.
4. An in-view dialog shows the exact command target and input before a confirmed
   command calls `opl_app_contribution_execute`; the owner remains
   the only writer and must return its own result or receipt.
5. After execution, the view reloads owner state instead of synthesizing success.

The UI works when sandbox storage is unavailable and does not depend on browser
modal permissions. Read responses are bound to the current selection so a slower
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
