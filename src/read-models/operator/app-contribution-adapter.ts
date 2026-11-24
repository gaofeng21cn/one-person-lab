import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { readAppContributionRuntimeContext } from './app-contribution-runtime-context.ts';

const ADAPTER_SCHEMA = 'opl-package-app-contribution-adapter.v1';
const REQUEST_SCHEMA = 'opl-package-app-contribution-request.v1';
const RESPONSE_SCHEMA = 'opl-package-app-contribution-response.v1';
const MANIFEST_NAME = 'app-contribution-adapter.json';
const TEMPLATE = /\$\{(env|input)\.([A-Za-z0-9_.-]+)\}/g;
const MAX_COMMAND_OUTPUT = 32 * 1024 * 1024;
const DEFAULT_MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_PREVIEW_CHARS = 24_000;
const FEEDBACK_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const FRAMEWORK_PYTHON_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../python',
);

type JsonRecord = Record<string, unknown>;

type AdapterEntry = {
  kind: 'json_file' | 'command' | 'markdown_review' | 'json_artifact_review';
  transform?: string;
  passthrough?: boolean;
  input_schema?: JsonRecord;
  path?: string;
  root?: 'package' | 'profile';
  feedback_path?: string;
  max_bytes?: number;
  max_preview_chars?: number;
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

type AdapterReviewFile = {
  kind: 'markdown_review' | 'json_artifact_review';
  input_schema?: JsonRecord;
  path?: string;
  root?: 'package' | 'profile';
  feedback_path?: string;
  max_bytes?: number;
  max_preview_chars?: number;
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

type AdapterItem = AdapterFile | AdapterReviewFile | AdapterCommand | AdapterRuntimeContext;

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

const SUPPORTED_ENTRY_KINDS = new Set([
  'json_file',
  'command',
  'runtime_context',
  'markdown_review',
  'json_artifact_review',
]);

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
      || !SUPPORTED_ENTRY_KINDS.has(String(candidate.kind))
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
  let ancestor = root;
  const rel = path.relative(root, resolved);
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    ancestor = path.join(ancestor, segment);
    if (!fs.existsSync(ancestor)) continue;
    if (fs.lstatSync(ancestor).isSymbolicLink()) {
      const realRoot = fs.realpathSync(root);
      const realAncestor = fs.realpathSync(ancestor);
      if (realAncestor !== realRoot && !realAncestor.startsWith(`${realRoot}${path.sep}`)) {
        contractError('Adapter path escapes its declared root through a symbolic link.', {
          failure_code: 'app_contribution_adapter_path_escape',
        });
      }
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

function sha256Prefixed(bytes: Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function extractMarkdownHeadings(markdownText: string) {
  const headings: Array<{ level: number; title: string; line: number }> = [];
  let fenced = false;
  const lines = markdownText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      headings.push({ level: match[1]!.length, title: match[2]!, line: index + 1 });
    }
  }
  return headings;
}

function readReviewFeedbackNotes(
  root: string,
  feedbackPathTemplate: string | undefined,
  input: JsonRecord,
  revision: string,
) {
  if (!feedbackPathTemplate) return [];
  const feedbackDir = containedPath(root, expand(feedbackPathTemplate, input, process.env));
  if (!fs.existsSync(feedbackDir) || !fs.statSync(feedbackDir).isDirectory()) {
    return [];
  }
  const notes: JsonRecord[] = [];
  for (const name of fs.readdirSync(feedbackDir).sort()) {
    if (!name.endsWith('.json')) continue;
    const noteFile = containedPath(feedbackDir, name);
    const stat = fs.lstatSync(noteFile);
    if (stat.isSymbolicLink() || !stat.isFile()) continue;
    const parsed = parseJsonText(fs.readFileSync(noteFile, 'utf8'));
    if (!isRecord(parsed)) continue;
    notes.push({
      ...parsed,
      artifact_ref: noteFile,
      matches_current_revision: parsed.revision === revision,
    });
  }
  return notes;
}

function writeReviewFeedbackAction(entry: AdapterReviewFile, packageRoot: string, input: JsonRecord) {
  if (!entry.feedback_path) {
    contractError('Declarative review execute action requires feedback_path.', {
      failure_code: 'app_contribution_adapter_entry_invalid',
    });
  }
  const root = rootFor(entry.root, packageRoot);
  const feedbackDir = containedPath(root, expand(entry.feedback_path, input, process.env));
  const note = input.note;
  if (typeof note !== 'string' || !note.trim() || note.length > 20_000) {
    contractError('Review note must be a string between 1 and 20000 characters.', {
      failure_code: 'app_contribution_adapter_request_invalid',
    });
  }
  const rawRequestId = typeof input.request_id === 'string' && input.request_id.trim()
    ? input.request_id.trim()
    : crypto.randomUUID();
  if (!FEEDBACK_ID_PATTERN.test(rawRequestId)) {
    contractError('Review feedback request_id contains unsupported characters.', {
      failure_code: 'app_contribution_adapter_request_invalid',
    });
  }
  fs.mkdirSync(feedbackDir, { recursive: true });
  const targetFile = containedPath(feedbackDir, `${rawRequestId}.json`);
  const revision = typeof input.revision === 'string' ? input.revision : '';
  const payload: JsonRecord = {
    schema: 'opl_review_feedback.v1',
    request_id: rawRequestId,
    revision,
    note,
    recorded_at: new Date().toISOString(),
  };
  if (fs.existsSync(targetFile)) {
    const existing = parseJsonText(fs.readFileSync(targetFile, 'utf8'));
    if (!isRecord(existing) || existing.note !== note || existing.revision !== revision) {
      contractError('Review feedback request_id is already bound to a different note.', {
        failure_code: 'app_contribution_adapter_feedback_conflict',
      });
    }
    return {
      state: 'ready',
      result: { status: 'recorded', artifact_ref: targetFile, note: existing },
    };
  }
  const tmpFile = path.join(feedbackDir, `.tmp-${rawRequestId}-${os.hostname()}-${process.pid}-${crypto.randomUUID()}.json`);
  try {
    fs.writeFileSync(tmpFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.linkSync(tmpFile, targetFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      const existing = parseJsonText(fs.readFileSync(targetFile, 'utf8'));
      if (!isRecord(existing) || existing.note !== note || existing.revision !== revision) {
        contractError('Review feedback request_id is already bound to a different note.', {
          failure_code: 'app_contribution_adapter_feedback_conflict',
        });
      }
      return {
        state: 'ready',
        result: { status: 'recorded', artifact_ref: targetFile, note: existing },
      };
    }
    throw error;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
  return {
    state: 'ready',
    result: { status: 'recorded', artifact_ref: targetFile, note: payload },
  };
}

function runDeclarativeReviewEntry(
  entry: AdapterReviewFile,
  operation: 'read' | 'execute',
  packageRoot: string,
  input: JsonRecord,
) {
  if (operation === 'execute') {
    return writeReviewFeedbackAction(entry, packageRoot, input);
  }
  if (!entry.path) {
    contractError('Declarative review read entry is missing its path.', {
      failure_code: 'app_contribution_adapter_entry_invalid',
    });
  }
  const root = rootFor(entry.root, packageRoot);
  const expanded = expand(entry.path, input, process.env);
  const file = containedPath(root, expanded);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { state: 'unavailable', reason: 'adapter_source_missing', source_ref: file };
  }
  const maxBytes = typeof entry.max_bytes === 'number' && entry.max_bytes > 0
    ? entry.max_bytes
    : DEFAULT_MAX_MARKDOWN_BYTES;
  const rawBytes = fs.readFileSync(file);
  if (rawBytes.length > maxBytes) {
    contractError('Declarative review artifact exceeds maximum allowed byte size.', {
      failure_code: 'app_contribution_adapter_artifact_too_large',
      bytes: rawBytes.length,
      max_bytes: maxBytes,
    });
  }
  const revision = sha256Prefixed(rawBytes);
  const artifactRef = path.relative(root, file).replaceAll(path.sep, '/');
  const feedback = readReviewFeedbackNotes(root, entry.feedback_path, input, revision);

  if (entry.kind === 'markdown_review') {
    const maxPreview = typeof entry.max_preview_chars === 'number' && entry.max_preview_chars > 0
      ? entry.max_preview_chars
      : DEFAULT_MAX_PREVIEW_CHARS;
    const text = rawBytes.toString('utf8');
    const headings = extractMarkdownHeadings(text);
    const preview = text.slice(0, maxPreview);
    const truncated = text.length > maxPreview;
    return {
      state: 'ready',
      data: {
        items: [{
          id: artifactRef,
          title: path.basename(artifactRef),
          summary: `${headings.length} headings`,
          status: 'review_required',
          artifact_ref: artifactRef,
          path: file,
          sha256: revision,
          bytes: rawBytes.length,
          headings,
          preview,
          preview_truncated: truncated,
          feedback,
        }],
        revision,
        feedback,
      },
    };
  }

  const payload = parseJsonText(rawBytes.toString('utf8'));
  const recordPayload = isRecord(payload) ? payload : {};
  return {
    state: 'ready',
    data: {
      items: [{
        ...recordPayload,
        id: String(recordPayload.id ?? artifactRef),
        title: String(recordPayload.title ?? recordPayload.name ?? path.basename(artifactRef)),
        summary: String(recordPayload.summary ?? ''),
        status: String(recordPayload.status ?? 'review_required'),
        artifact_ref: artifactRef,
        path: file,
        artifact_revision: revision,
        feedback,
      }],
      payload,
      revision,
      feedback,
    },
  };
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

function buildChildCommandEnv(): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (fs.existsSync(FRAMEWORK_PYTHON_DIR) && fs.statSync(FRAMEWORK_PYTHON_DIR).isDirectory()) {
    const existing = childEnv.PYTHONPATH?.trim();
    childEnv.PYTHONPATH = existing
      ? `${FRAMEWORK_PYTHON_DIR}${path.delimiter}${existing}`
      : FRAMEWORK_PYTHON_DIR;
  }
  return childEnv;
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
    env: buildChildCommandEnv(),
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
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    contractError('Adapter command did not return JSON.', {
      failure_code: 'app_contribution_adapter_response_invalid',
    });
  }
}

function transformResult(entry: AdapterEntry, parsed: unknown) {
  if (entry.passthrough === true) return parsed;
  if (typeof entry.transform === 'string' && entry.transform !== 'json') {
    contractError(
      'Legacy domain transforms are retired; return standard contribution JSON or use declarative markdown_review/json_artifact_review.',
      {
        failure_code: 'app_contribution_adapter_transform_unsupported',
        transform: entry.transform,
      },
    );
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
  const results = required ? [required] : entries.map((entry) => {
    if (entry.kind === 'json_file') {
      return readJsonFile(entry as AdapterEntry, packageRoot, ownerInput);
    }
    if (entry.kind === 'runtime_context') {
      return readAppContributionRuntimeContext({ packageRoot, view: entry.view, input: ownerInput });
    }
    if (entry.kind === 'markdown_review' || entry.kind === 'json_artifact_review') {
      return runDeclarativeReviewEntry(entry, operation, packageRoot, ownerInput);
    }
    return runCommand(entry as AdapterEntry, packageRoot, ownerInput, { ...request, input: ownerInput });
  });
  const result = results.length === 1
    ? results[0]
    : {
        state: 'ready',
        data: {
          items: results.map((entry, index) => ({ id: `${ref}:${index}`, source_ref: ref, value: entry })),
        },
      };
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
