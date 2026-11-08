import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { readAppContributionRuntimeContext } from './app-contribution-runtime-context.ts';

const ADAPTER_SCHEMA = 'opl-package-app-contribution-adapter.v1';
const REQUEST_SCHEMA = 'opl-package-app-contribution-request.v1';
const RESPONSE_SCHEMA = 'opl-package-app-contribution-response.v1';
const MANIFEST_NAME = 'app-contribution-adapter.json';
const TEMPLATE = /\$\{(env|input)\.([A-Za-z0-9_.-]+)\}/g;
const MAX_COMMAND_OUTPUT = 32 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

type AdapterEntry = {
  kind: 'json_file' | 'command';
  transform?: 'json' | 'photo_status' | 'photo_pending_plan' | 'iphone_plan' | 'iphone_audit' | 'travel_status' | 'glkvm_status' | 'artifact_status' | 'mac_review_status' | 'runtime_detail' | 'capital_decision' | 'rca_artifacts' | 'grant_workspace' | 'fleet_status';
  passthrough?: boolean;
  input_schema?: JsonRecord;
  path?: string;
  root?: 'package' | 'profile';
  argv?: string[];
  cwd?: 'package' | 'profile';
  stdin?: 'input_json' | 'request_json';
};

type AdapterFile = {
  kind: 'json_file';
  input_schema?: JsonRecord;
  path: string;
  root?: 'package' | 'profile';
};

type AdapterCommand = {
  kind: 'command';
  input_schema?: JsonRecord;
  argv: string[];
  cwd?: 'package' | 'profile';
  stdin?: 'input_json' | 'request_json';
};

type AdapterRuntimeContext = {
  kind: 'runtime_context';
  view: 'progress' | 'artifacts';
  input_schema?: JsonRecord;
};

type AdapterItem = AdapterFile | AdapterCommand | AdapterRuntimeContext;

type AdapterManifest = {
  schema_version: typeof ADAPTER_SCHEMA;
  reads: Record<string, AdapterItem | AdapterItem[]>;
  actions: Record<string, AdapterItem | AdapterItem[]>;
};

function contractError(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function adapterManifest(packageRoot: string): AdapterManifest {
  const manifestPath = path.join(packageRoot, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    contractError('Package app contribution adapter manifest is missing.', {
      failure_code: 'app_contribution_adapter_manifest_missing',
      manifest: MANIFEST_NAME,
    });
  }
  const raw = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  if (
    !isRecord(raw)
    || raw.schema_version !== ADAPTER_SCHEMA
    || !isRecord(raw.reads)
    || !isRecord(raw.actions)
  ) {
    contractError('Package app contribution adapter manifest is invalid.', {
      failure_code: 'app_contribution_adapter_manifest_invalid',
    });
  }
  return raw as AdapterManifest;
}

function entriesFor(manifest: AdapterManifest, operation: 'read' | 'execute', ref: string) {
  const entry = operation === 'read' ? manifest.reads[ref] : manifest.actions[ref];
  if (!isRecord(entry) && !Array.isArray(entry)) {
    contractError('Adapter ref is not declared for the requested operation.', {
      failure_code: 'app_contribution_adapter_ref_not_declared',
      operation,
      ref,
    });
  }
  const entries = Array.isArray(entry) ? entry : [entry];
  for (const candidate of entries) {
    if (
      !isRecord(candidate)
      || !['json_file', 'command', 'runtime_context'].includes(String(candidate.kind))
      || (candidate.kind === 'runtime_context' && (
        operation !== 'read'
        || !['progress', 'artifacts'].includes(String(candidate.view))
        || 'path' in candidate || 'argv' in candidate
      ))
    ) {
      contractError('Adapter entry kind is invalid.', {
        failure_code: 'app_contribution_adapter_entry_invalid',
        operation,
        ref,
      });
    }
  }
  return entries as AdapterItem[];
}

function readInputDefaults(entries: AdapterItem[], input: JsonRecord): JsonRecord {
  const defaults: JsonRecord = {};
  for (const entry of entries) {
    const properties = entry.input_schema?.properties;
    if (!isRecord(properties)) continue;
    for (const [field, schema] of Object.entries(properties)) {
      if (isRecord(schema) && Object.hasOwn(schema, 'default')) {
        defaults[field] = schema.default;
      }
    }
  }
  return { ...defaults, ...input };
}

function inputSchemaRequired(entry: AdapterItem) {
  const schema = entry.input_schema;
  return isRecord(schema) && Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];
}

function inputRequired(entries: AdapterItem[], input: JsonRecord) {
  const entry = entries.find((candidate) => inputSchemaRequired(candidate).length > 0);
  if (!entry) return null;
  const missing = inputSchemaRequired(entry).filter((field) => (
    !Object.hasOwn(input, field)
    || input[field] === null
    || input[field] === ''
  ));
  if (missing.length === 0) return null;
  return {
    state: 'input_required',
    reason: 'adapter_input_required',
    input_schema: entry.input_schema,
    missing_fields: missing,
  };
}

function inputValue(input: JsonRecord, dotted: string): string {
  let current: unknown = input;
  for (const segment of dotted.split('.')) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return '';
    current = current[segment];
  }
  if (typeof current === 'string') return current;
  if (typeof current === 'number' || typeof current === 'boolean') return String(current);
  contractError('Adapter input template value must be a string, number, or boolean.', {
    failure_code: 'app_contribution_adapter_input_template_invalid',
    field: dotted,
  });
}

function expand(template: string, input: JsonRecord, env: NodeJS.ProcessEnv) {
  const expanded = template.replace(TEMPLATE, (_, source: string, name: string) => (
    source === 'env' ? env[name] ?? '' : inputValue(input, name)
  ));
  if (expanded.includes('${')) {
    contractError('Adapter template contains an unresolved placeholder.', {
      failure_code: 'app_contribution_adapter_template_unresolved',
    });
  }
  return expanded;
}

function rootFor(kind: AdapterEntry['root'] | AdapterEntry['cwd'], packageRoot: string) {
  if (kind === 'profile') {
    const profile = process.env.OPL_PROFILE_WORKSPACE?.trim();
    if (!profile || !path.isAbsolute(profile)) {
      contractError('Adapter profile root is unavailable.', {
        failure_code: 'app_contribution_adapter_profile_unavailable',
      });
    }
    return path.resolve(profile);
  }
  return path.resolve(packageRoot);
}

function containedPath(root: string, relativeOrAbsolute: string) {
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(root, relativeOrAbsolute);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    contractError('Adapter path escapes its declared root.', {
      failure_code: 'app_contribution_adapter_path_escape',
    });
  }
  if (fs.existsSync(resolved)) {
    const realRoot = fs.realpathSync(root);
    const realPath = fs.realpathSync(resolved);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) {
      contractError('Adapter path escapes its declared root through a symbolic link.', {
        failure_code: 'app_contribution_adapter_path_escape',
      });
    }
  }
  return resolved;
}

function commandPath(root: string, command: string) {
  if (command.startsWith('./')) {
    const resolved = containedPath(root, command);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      contractError('Adapter command does not exist inside its declared root.', {
        failure_code: 'app_contribution_adapter_command_unavailable',
      });
    }
    return resolved;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(command)) {
    contractError('Adapter command must be a package-relative path or bare program name.', {
      failure_code: 'app_contribution_adapter_command_invalid',
    });
  }
  return command;
}

function readJsonFile(entry: AdapterEntry, packageRoot: string, input: JsonRecord) {
  if (!entry.path) {
    contractError('Adapter JSON file entry is missing its path.', {
      failure_code: 'app_contribution_adapter_entry_invalid',
    });
  }
  const root = rootFor(entry.root, packageRoot);
  const expanded = expand(entry.path, input, process.env);
  const file = containedPath(root, expanded);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { state: 'unavailable', reason: 'adapter_source_missing', source_ref: file };
  }
  return transformResult(entry, parseJsonText(fs.readFileSync(file, 'utf8')));
}

function runCommand(
  entry: AdapterEntry,
  packageRoot: string,
  input: JsonRecord,
  request: JsonRecord,
) {
  if (!Array.isArray(entry.argv) || entry.argv.length === 0) {
    contractError('Adapter command entry is missing argv.', {
      failure_code: 'app_contribution_adapter_entry_invalid',
    });
  }
  const root = rootFor(entry.cwd, packageRoot);
  const [command, ...args] = entry.argv.map((arg) => expand(arg, input, process.env));
  const result = spawnSync(commandPath(root, command!), args, {
    cwd: root,
    encoding: 'utf8',
    input: entry.stdin === 'input_json'
      ? JSON.stringify(input)
      : entry.stdin === 'request_json'
        ? JSON.stringify(request)
        : undefined,
    env: process.env,
    timeout: 120_000,
    maxBuffer: MAX_COMMAND_OUTPUT,
  });
  if (result.error || result.status !== 0) {
    contractError('Adapter command failed.', {
      failure_code: 'app_contribution_adapter_command_failed',
      exit_status: result.status,
      error: result.error?.message ?? null,
      stderr_present: Boolean(result.stderr?.trim()),
    });
  }
  try {
    return transformResult(entry, parseJsonText(result.stdout || ''));
  } catch {
    contractError('Adapter command did not return JSON.', {
      failure_code: 'app_contribution_adapter_response_invalid',
    });
  }
}

function transformResult(entry: AdapterEntry, parsed: unknown) {
  if (entry.passthrough === true) return parsed;
  if (entry.transform === 'photo_status') {
    const status = isRecord(parsed) ? parsed : {};
    const jobs = isRecord(status.jobs) ? status.jobs : {};
    return {
      state: 'ready',
      result: {
        scope: status.scope ?? null,
        status_dir: status.status_dir ?? null,
        jobs,
        summary: Object.fromEntries(Object.entries(jobs).map(([name, job]) => [
          name,
          isRecord(job) ? {
            status: job.status ?? null,
            last_attempt_at: job.last_attempt_at ?? job.finished_at ?? null,
            last_success_at: job.last_success_at ?? null,
            consecutive_failures: job.consecutive_failures ?? 0,
            pending_plan_dir: job.pending_plan_dir ?? null,
            summary: job.summary ?? null,
          } : job,
        ])),
      },
    };
  }
  if (entry.transform === 'photo_pending_plan' && parsed === null) {
    return { state: 'empty', reason: 'no_plan_awaiting_review' };
  }
  if (entry.transform === 'photo_pending_plan') {
    const pending = isRecord(parsed) ? parsed : {};
    if (pending.state !== 'ready') return pending;
    const plan = isRecord(pending.plan) ? pending.plan : {};
    const planSummary = isRecord(plan.summary) ? plan.summary : {};
    const items = Array.isArray(plan.items) ? plan.items : [];
    return {
      state: 'ready',
      data: {
        items: [{
          id: String(plan.plan_id ?? pending.plan_dir ?? 'photo-plan'),
          title: '照片镜像计划',
          summary: `镜像 ${Number(planSummary.mirror_count ?? 0)}，隔离 ${Number(planSummary.delete_count ?? 0)}，未解决 ${Number(planSummary.unresolved_count ?? 0)}`,
          status: Number(planSummary.unresolved_count ?? 0) > 0 ? 'blocked' : 'pending',
          plan_dir: pending.plan_dir,
          preview: {
            target: pending.plan_dir,
            before: null,
            after: items.map((item) => isRecord(item) ? `${item.action_label}: ${item.relative_path}` : String(item)).join('\n'),
          },
          evidence_refs: [pending.plan_dir],
          actions: [{
            action_ref: 'photo.steward.v1#plan.apply',
            input: { plan_dir: pending.plan_dir },
            label_i18n: { 'zh-CN': '执行已审核计划', 'en-US': 'Apply reviewed plan' },
          }],
          plan,
        }],
      },
    };
  }
  if (entry.transform === 'iphone_plan') {
    const value = isRecord(parsed) ? parsed : {};
    const plan = isRecord(value.plan) ? value.plan : {};
    const removals = Array.isArray(plan.removals) ? plan.removals : [];
    const layout = isRecord(plan.layout) ? plan.layout : null;
    return {
      state: 'ready',
      data: {
        items: [{
          id: String(plan.planID ?? plan.plan_id ?? value.path ?? 'iphone-plan'),
          title: plan.operation === 'layout' ? '主屏布局计划' : 'App 卸载计划',
          summary: plan.operation === 'layout'
            ? `候选布局 ${layout?.candidate_sha256 ?? layout?.candidateSHA256 ?? ''}`
            : removals.map((item) => isRecord(item) ? `${item.name} (${item.bundleID})` : String(item)).join('、'),
          status: 'pending',
          plan_path: value.path,
          preview: {
            target: value.path,
            before: null,
            after: plan.operation === 'layout'
              ? JSON.stringify(layout, null, 2)
              : removals.map((item) => isRecord(item) ? `${item.name} (${item.bundleID})` : String(item)).join('\n'),
          },
          evidence_refs: [value.path],
          actions: [{
            action_ref: 'iphone.steward.v1#plan.apply',
            input: { plan_dir: value.path, plan_id: plan.planID ?? plan.plan_id },
            label_i18n: { 'zh-CN': '执行已审核计划', 'en-US': 'Apply reviewed plan' },
          }],
          plan,
        }],
      },
    };
  }
  if (entry.transform === 'iphone_audit') {
    const value = isRecord(parsed) ? parsed : {};
    const audit = isRecord(value.audit) ? value.audit : value;
    const apps = Array.isArray(audit.apps) ? audit.apps : [];
    return {
      state: 'ready',
      data: {
        items: apps.map((item, index) => {
          const app = isRecord(item) ? item : {};
          return {
            id: String(app.bundleID ?? app.bundle_id ?? index),
            title: String(app.name ?? app.bundleID ?? index),
            summary: `${Number(app.minutes ?? 0).toFixed(1)} 分钟 · ${Number(app.sessions ?? 0)} 次 · ${app.location ?? ''}`,
            status: app.evidence === 'no_usage_observed' ? 'none' : 'active',
            evidence_refs: [value.outputDirectory ?? null].filter(Boolean),
            minutes: app.minutes,
            sessions: app.sessions,
            active_days: app.activeDays ?? app.active_days,
            location: app.location,
            evidence: app.evidence,
          };
        }),
        usage_evidence: audit.usageEvidence ?? null,
        window: audit.window ?? null,
      },
    };
  }
  if (entry.transform === 'travel_status') {
    const value = isRecord(parsed) ? parsed : {};
    const build = isRecord(value.build) ? value.build : {};
    const quality = isRecord(value.quality) ? value.quality : {};
    return {
      state: 'ready',
      data: {
        items: [{
          id: 'travel-passport-status',
          title: '旅行护照状态',
          summary: `构建：${String(build.state ?? 'unknown')}；质量：${String(quality.state ?? 'unknown')}`,
          status: quality.state === 'ready' ? 'ready' : 'attention',
          source_refs: ['travel-passport://status'],
        }],
        status: value,
      },
    };
  }
  if (entry.transform === 'glkvm_status') {
    const value = isRecord(parsed) ? parsed : {};
    return {
      state: 'ready',
      data: {
        items: [{
          id: 'glkvm-device',
          title: String(value.device ?? 'GLKVM device'),
          summary: `连接：${value.connected === true ? '已连接' : '未连接'} · 控制：${String(value.control_mode ?? 'unknown')}`,
          status: value.connected === true ? 'ready' : 'unavailable',
          source_refs: ['glkvm://status'],
        }],
        status: value,
      },
    };
  }
  if (entry.transform === 'artifact_status') {
    const value = isRecord(parsed) ? parsed : {};
    if (!Array.isArray(value.artifacts) && !Array.isArray(value.items)) return parsed;
    const artifacts = Array.isArray(value.artifacts)
      ? value.artifacts
      : Array.isArray(value.items)
        ? value.items
        : [];
    return {
      state: 'ready',
      data: {
        items: artifacts.filter(isRecord).map((artifact, index) => ({
          id: String(artifact.id ?? artifact.artifact_id ?? artifact.path ?? index),
          title: String(artifact.title ?? artifact.name ?? artifact.path ?? `Artifact ${index + 1}`),
          summary: String(artifact.summary ?? artifact.status ?? ''),
          status: String(artifact.status ?? 'unknown'),
          artifact_ref: artifact.ref ?? artifact.path ?? artifact.artifact_ref ?? null,
          evidence_refs: Array.isArray(artifact.evidence_refs) ? artifact.evidence_refs : [],
        })),
        status: value,
      },
    };
  }
  if (entry.transform === 'mac_review_status') {
    const value = isRecord(parsed) ? parsed : {};
    const layout = isRecord(value.workspace_layout) ? value.workspace_layout : {};
    const errors = Array.isArray(value.errors) ? value.errors : [];
    return {
      state: 'ready',
      data: {
        items: [{
          id: 'med-autocast-workbench',
          title: 'Med Auto Cast 工作台',
          summary: `校验：${String(value.status ?? 'unknown')}；工作区：${String(layout.state ?? 'unknown')}`,
          status: value.status === 'passed' ? 'ready' : 'attention',
          source_refs: [value.workbench].filter(Boolean),
          errors,
        }],
        status: value,
      },
    };
  }
  if (entry.transform === 'runtime_detail') {
    const value = isRecord(parsed) ? parsed : {};
    const readback = isRecord(value.app_detail_view) ? value.app_detail_view : value;
    if (typeof readback.availability !== 'string') return parsed;
    const payload = isRecord(readback.payload) ? readback.payload : {};
    const stages = Array.isArray(payload.stages) ? payload.stages : [];
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    return {
      state: readback.availability === 'available' ? 'ready' : 'unavailable',
      reason: readback.reason ?? null,
      data: {
        items: [{
          id: String(readback.item_id ?? 'runtime-detail'),
          title: String(readback.view_id ?? 'Runtime detail'),
          summary: readback.reason ?? '',
          status: readback.availability ?? 'unknown',
          source_refs: [readback.digest].filter(Boolean),
          stages,
          sections,
        }],
        detail: readback,
      },
    };
  }
  if (entry.transform === 'grant_workspace') {
    const value = isRecord(parsed) ? parsed : {};
    const selection = isRecord(value.current_selection) ? value.current_selection : {};
    const gates = isRecord(value.gates) ? value.gates : {};
    const drafts = Array.isArray(value.application_drafts) ? value.application_drafts : [];
    const activeDraftId = typeof selection.active_draft_id === 'string'
      ? selection.active_draft_id
      : null;
    const activeDraft = drafts
      .filter(isRecord)
      .find((draft) => draft.draft_id === activeDraftId) ?? null;
    const stage = typeof value.lifecycle_stage === 'string'
      ? value.lifecycle_stage
      : 'unknown';
    return {
      state: 'ready',
      data: {
        items: [{
          id: String(value.workspace_id ?? 'grant-workspace'),
          title: String(activeDraft?.project_title ?? value.workspace_id ?? 'Grant workspace'),
          summary: [
            `阶段：${stage}`,
            `草稿：${String(activeDraft?.version_label ?? activeDraftId ?? '未选择')}`,
            `预提交冻结：${gates.presubmission_frozen === true ? '是' : '否'}`,
          ].join(' · '),
          status: gates.presubmission_frozen === true ? 'completed' : 'active',
          lifecycle_stage: stage,
          grant_run_id: value.grant_run_id ?? null,
          workspace_id: value.workspace_id ?? null,
          active_draft_id: activeDraftId,
          active_draft: activeDraft,
          gates,
          source_refs: ['owner_workspace_json'],
        }],
      },
    };
  }
  if (entry.transform === 'capital_decision') {
    const value = isRecord(parsed) ? parsed : {};
    const packet = isRecord(value.decision_packet) ? value.decision_packet : value;
    const decision = isRecord(packet.decision) ? packet.decision : packet;
    const alternatives = Array.isArray(packet.alternatives) ? packet.alternatives : [];
    const unknowns = Array.isArray(packet.unknowns)
      ? packet.unknowns
      : Array.isArray(packet.unresolved_quality_debt) ? packet.unresolved_quality_debt : [];
    return {
      state: 'ready',
      data: {
        items: [{
          ...packet,
          id: String(packet.decision_id ?? packet.id ?? 'capital-decision'),
          title: String(packet.title ?? packet.decision_question ?? '配置决策'),
          summary: String(decision.summary ?? decision.recommendation
            ?? (typeof packet.decision === 'string' ? packet.decision : '')),
          status: String(packet.plan_status ?? packet.status ?? decision.status ?? 'review_required'),
          source_refs: Array.isArray(packet.evidence_refs) ? packet.evidence_refs : [],
          alternatives,
          unknowns,
          execution_status: packet.execution_status ?? packet.execution_claim ?? null,
        }],
        decision: packet,
      },
    };
  }
  if (entry.transform === 'rca_artifacts') {
    const value = isRecord(parsed) ? parsed : {};
    if (!Array.isArray(value.artifacts)) return parsed;
    const artifacts = Array.isArray(value.artifacts) ? value.artifacts : [];
    return {
      state: 'ready',
      data: {
        items: artifacts.filter(isRecord).map((artifact, index) => ({
          id: String(artifact.artifact_id ?? artifact.id ?? artifact.artifact_ref ?? index),
          title: String(artifact.title ?? artifact.artifact_kind ?? artifact.artifact_ref ?? `Artifact ${index + 1}`),
          summary: String(artifact.summary ?? artifact.review_status ?? ''),
          status: String(artifact.review_status ?? artifact.status ?? 'review_pending'),
          artifact_ref: artifact.artifact_ref ?? null,
          artifact_kind: artifact.artifact_kind ?? null,
          evidence_refs: Array.isArray(artifact.evidence_refs) ? artifact.evidence_refs : [],
        })),
        review_export: value.review_export ?? null,
        memory: value.memory ?? null,
      },
    };
  }
  if (entry.transform === 'fleet_status') {
    const value = isRecord(parsed)
      && isRecord(parsed.result)
      && parsed.ok === true
      ? parsed.result
      : isRecord(parsed)
        ? parsed
        : {};
    const freshness = isRecord(value.freshness) ? value.freshness : {};
    const nativeCarrier = isRecord(value.native_carrier) ? value.native_carrier : {};
    const payload = isRecord(value.payload) ? value.payload : {};
    return {
      state: 'ready',
      data: {
        items: [{
          id: String(value.read_ref ?? 'fleet-status'),
          title: String(value.read_ref ?? 'Fleet Agent status'),
          summary: [
            `采集：${String(freshness.state ?? 'unknown')}`,
            `载体：${String(nativeCarrier.availability ?? 'unknown')}`,
            value.node && isRecord(value.node)
              ? `节点：${String(value.node.display_name ?? value.node.stable_node_id ?? 'unknown')}`
              : '节点：未提供',
          ].join(' · '),
          status: freshness.state === 'unavailable'
            ? 'unavailable'
            : freshness.state === 'stale'
              ? 'attention'
              : 'ready',
          observed_at: value.observed_at ?? null,
          freshness,
          native_carrier: nativeCarrier,
          node: value.node ?? null,
          payload,
        }],
      },
    };
  }
  return parsed;
}

function ownerResponse(
  ref: string,
  operation: 'read' | 'execute',
  result: unknown,
) {
  if (
    isRecord(result)
    && result.schema_version === RESPONSE_SCHEMA
    && typeof result.ok === 'boolean'
    && result.ref === ref
    && result.operation === operation
  ) {
    return result;
  }
  return {
    schema_version: RESPONSE_SCHEMA,
    ok: true,
    ref,
    operation,
    result,
  };
}

export function executeDeclarativeAppContribution(input: {
  packageRoot?: string;
  request: unknown;
}) {
  const packageRoot = path.resolve(input.packageRoot ?? process.cwd());
  if (!isRecord(input.request)) {
    contractError('App contribution adapter request must be an object.', {
      failure_code: 'app_contribution_adapter_request_invalid',
    });
  }
  const request = input.request;
  if (
    request.schema_version !== REQUEST_SCHEMA
    || (request.operation !== 'read' && request.operation !== 'execute')
    || typeof request.ref !== 'string'
    || !request.ref
    || !isRecord(request.input)
  ) {
    contractError('App contribution adapter request is invalid.', {
      failure_code: 'app_contribution_adapter_request_invalid',
    });
  }
  const manifest = adapterManifest(packageRoot);
  const operation = request.operation;
  const ref = request.ref;
  const entries = entriesFor(manifest, operation, ref);
  const ownerInput = operation === 'read' ? readInputDefaults(entries, request.input) : request.input;
  const required = inputRequired(entries, ownerInput);
  const results = required ? [required] : entries.map((entry) => (
    entry.kind === 'json_file'
      ? readJsonFile(entry, packageRoot, ownerInput)
      : entry.kind === 'runtime_context'
        ? readAppContributionRuntimeContext({ packageRoot, view: entry.view, input: ownerInput })
        : runCommand(entry, packageRoot, ownerInput, { ...request, input: ownerInput })
  ));
  const result = results.length === 1
    ? results[0]
    : { state: 'ready', data: { items: results.map((entry, index) => (
        isRecord(entry) ? { id: `${ref}:${index}`, source_ref: ref, value: entry } : { id: `${ref}:${index}`, source_ref: ref, value: entry }
      )) } };
  const response = ownerResponse(ref, operation, result);
  const inputSchema = entries.find((entry) => isRecord(entry.input_schema))?.input_schema;
  return inputSchema ? { ...response, input_schema: inputSchema } : response;
}

export function runDeclarativeAppContribution(input: {
  packageRoot?: string;
  request: unknown;
}) {
  try {
    return executeDeclarativeAppContribution(input);
  } catch (error) {
    if (!(error instanceof FrameworkContractError) || !isRecord(input.request)) throw error;
    const request = input.request;
    if (
      typeof request.ref !== 'string'
      || (request.operation !== 'read' && request.operation !== 'execute')
    ) {
      throw error;
    }
    return {
      schema_version: RESPONSE_SCHEMA,
      ok: false,
      ref: request.ref,
      operation: request.operation,
      error: error.toJSON().error,
    };
  }
}
