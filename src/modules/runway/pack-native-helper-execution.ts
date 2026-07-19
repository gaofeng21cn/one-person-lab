import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { runDomainPythonHelper } from './domain-helper-runtime.ts';

export const PACK_NATIVE_HELPER_EXECUTION_CONTRACT_REF =
  'contracts/opl-framework/pack-native-helper-execution-contract.json';

const MODULE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function outside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function readJsonObject(filePath: string, label: string) {
  const resolved = path.resolve(filePath);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `${label} is missing: ${resolved}.`, { file: resolved });
    }
    throw error;
  }
  let value: unknown;
  try {
    value = parseJsonText(bytes.toString('utf8'));
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `${label} contains invalid JSON: ${resolved}.`, {
      file: resolved,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(value)) fail(`${label} root must be a JSON object.`, { file: resolved });
  return {
    path: resolved,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    value,
  };
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value;
}

function resolveSourceRoot(catalogPath: string, sourceRootRef: string) {
  if (path.isAbsolute(sourceRootRef) || sourceRootRef.split(/[\\/]+/).includes('..')) {
    fail('package.source_root must be a contained relative path.', { source_root: sourceRootRef });
  }
  let current = path.dirname(catalogPath);
  while (true) {
    const candidate = path.resolve(current, sourceRootRef);
    if (fs.existsSync(candidate)) {
      const repoRoot = fs.realpathSync(current);
      const sourceRoot = fs.realpathSync(candidate);
      if (outside(repoRoot, sourceRoot)) {
        fail('package.source_root resolves outside the domain repository.', { source_root: sourceRootRef });
      }
      if (!fs.statSync(sourceRoot).isDirectory()) {
        fail('package.source_root must resolve to a directory.', { source_root: sourceRootRef });
      }
      return { repoRoot, sourceRoot };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fail('package.source_root could not be resolved from the catalog ancestors.', { source_root: sourceRootRef });
}

function parseCatalog(catalogPath: string, helperId: string) {
  const catalog = readJsonObject(catalogPath, 'Native helper catalog');
  if (!isRecord(catalog.value.package)) fail('Native helper catalog requires package.', { catalog: catalog.path });
  const sourceRootRef = requireString(catalog.value.package.source_root, 'package.source_root');
  if (!Array.isArray(catalog.value.helpers)) fail('Native helper catalog requires helpers[].', { catalog: catalog.path });
  const helper = catalog.value.helpers.find((entry) => isRecord(entry) && entry.helper_id === helperId);
  if (!isRecord(helper)) {
    throw new FrameworkContractError('surface_not_found', `Native helper is not declared: ${helperId}.`, {
      catalog: catalog.path,
      helper_id: helperId,
    });
  }
  const module = requireString(helper.package_module, 'helpers[].package_module');
  if (!MODULE_PATTERN.test(module)) fail('helpers[].package_module must be a Python dotted module.', { package_module: module });
  return { ...catalog, ...resolveSourceRoot(catalog.path, sourceRootRef), helperId, module };
}

function parseRequest(requestPath: string) {
  const request = readJsonObject(requestPath, 'Native helper execution request');
  if (Object.hasOwn(request.value, 'args') && Object.hasOwn(request.value, 'argv')) {
    fail('Native helper execution request must not declare both args and argv.', { request: request.path });
  }
  const argsValue = request.value.args ?? request.value.argv ?? [];
  if (!Array.isArray(argsValue) || argsValue.some((entry) => typeof entry !== 'string')) {
    fail('Native helper execution request args must be a string array.', { request: request.path });
  }
  const timeoutSeconds = request.value.timeout_seconds ?? 300;
  if (typeof timeoutSeconds !== 'number' || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    fail('Native helper execution request timeout_seconds must be a positive number.', { request: request.path });
  }
  return { ...request, args: argsValue as string[], timeoutSeconds };
}

export function runPackNativeHelper(input: { catalog: string; helper: string; request: string }) {
  const catalog = parseCatalog(input.catalog, input.helper);
  const request = parseRequest(input.request);
  const frameworkPythonRoot = path.resolve(import.meta.dirname, '../../../python');
  const execution = runDomainPythonHelper({
    module: catalog.module,
    args: request.args,
    cwd: catalog.repoRoot,
    timeout_ms: Math.ceil(request.timeoutSeconds * 1000),
    env: {
      PYTHONPATH: [
        catalog.sourceRoot,
        frameworkPythonRoot,
        process.env.PYTHONPATH,
      ].filter(Boolean).join(path.delimiter),
    },
  });
  if (execution.error?.includes('ETIMEDOUT') || execution.signal === 'SIGTERM') {
    throw new FrameworkContractError('launcher_failed', `Native helper timed out: ${catalog.helperId}.`, {
      helper_id: catalog.helperId,
      timeout_seconds: request.timeoutSeconds,
    });
  }
  if (execution.exit_code !== 0) {
    throw new FrameworkContractError('launcher_failed', `Native helper failed: ${catalog.helperId}.`, {
      helper_id: catalog.helperId,
      exit_code: execution.exit_code,
      signal: execution.signal,
      stderr: execution.stderr,
      error: execution.error,
    });
  }
  let payload: unknown;
  try {
    payload = parseJsonText(execution.stdout);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Native helper stdout must contain exactly one JSON value.', {
      helper_id: catalog.helperId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    version: 'g2',
    pack_native_helper_execution_receipt: {
      surface_kind: 'opl_pack_native_helper_execution_receipt',
      version: 'opl-pack-native-helper-execution-receipt.v1',
      status: 'executed',
      contract_ref: PACK_NATIVE_HELPER_EXECUTION_CONTRACT_REF,
      helper_id: catalog.helperId,
      package_module: catalog.module,
      catalog_ref: catalog.path,
      catalog_sha256: catalog.sha256,
      request_ref: request.path,
      request_sha256: request.sha256,
      source_root: catalog.sourceRoot,
      python_command: execution.command,
      exit_code: execution.exit_code,
      payload,
      authority_boundary: {
        framework_owns_helper_process_lifecycle: true,
        framework_owns_domain_helper_body: false,
        can_write_domain_truth: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_readiness: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}

export function runPackNativeHelperExecutionCommand(args: string[]) {
  const filtered = args.filter((arg) => arg !== '--json');
  const values: Record<string, string> = {};
  for (let index = 0; index < filtered.length; index += 2) {
    const flag = filtered[index];
    const value = filtered[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', 'pack native-helper run requires --catalog, --helper, and --request.', {
        usage: 'opl pack native-helper run --catalog <catalog.json> --helper <id> --request <request.json>',
      });
    }
    const key = flag.slice(2);
    if (Object.hasOwn(values, key)) {
      throw new FrameworkContractError('cli_usage_error', `pack native-helper run received duplicate --${key}.`, {
        option: `--${key}`,
      });
    }
    values[key] = value;
  }
  if (Object.keys(values).some((key) => !['catalog', 'helper', 'request'].includes(key))
    || !values.catalog || !values.helper || !values.request) {
    throw new FrameworkContractError('cli_usage_error', 'pack native-helper run requires --catalog, --helper, and --request.', {
      usage: 'opl pack native-helper run --catalog <catalog.json> --helper <id> --request <request.json>',
    });
  }
  return runPackNativeHelper({ catalog: values.catalog, helper: values.helper, request: values.request });
}
