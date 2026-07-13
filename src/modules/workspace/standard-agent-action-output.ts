import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export const STANDARD_AGENT_ACTION_RUNS_RELATIVE_ROOT = 'control/opl/action_runs' as const;

export type StandardAgentActionRunStoredBytes = {
  ref: string;
  file_path: string;
  sha256: string;
  byte_size: number;
};

export type StandardAgentActionRunOutput = {
  surface_kind: 'opl_standard_agent_action_run_output';
  version: 'opl-standard-agent-action-run-output.v1';
  status: 'materialized' | 'already_materialized';
  run_id: string;
  domain_id: string;
  action_id: string;
  workspace_root: string;
  action_run_dir: string;
  action_run_ref: string;
  request: StandardAgentActionRunStoredBytes;
  output: StandardAgentActionRunStoredBytes;
};

export type StandardAgentActionRunRequest = {
  surface_kind: 'opl_standard_agent_action_run_request';
  version: 'opl-standard-agent-action-run-request.v1';
  status: 'prepared' | 'already_prepared';
  run_id: string;
  domain_id: string;
  action_id: string;
  workspace_root: string;
  action_run_dir: string;
  action_run_ref: string;
  request: StandardAgentActionRunStoredBytes;
};

type CommitStandardAgentActionOutputInput = {
  workspaceRoot: string;
  runId: string;
  domainId: string;
  actionId: string;
  requestBytes: Uint8Array;
  outputBytes: Uint8Array;
};

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(bytes: Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertContained(root: string, candidate: string, field: string) {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }
  fail(`${field} escapes the Standard Agent workspace root.`, {
    workspace_root: root,
    candidate,
    field,
  });
}

function identityText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized) || normalized.length > 256) {
    fail(`Standard Agent action ${field} must be a bounded non-empty identity.`, { field });
  }
  return normalized;
}

function workspaceRoot(input: string) {
  if (!path.isAbsolute(input)) {
    fail('Standard Agent action workspace_root must be absolute.', { workspace_root: input });
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(input);
  } catch (error) {
    fail('Standard Agent action workspace_root must resolve to an existing directory.', {
      workspace_root: input,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(resolved).isDirectory()) {
    fail('Standard Agent action workspace_root must be a directory.', { workspace_root: resolved });
  }
  return resolved;
}

function ensureContainedDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    if (!fs.existsSync(candidate)) {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail('Standard Agent action output directory contains a non-directory or symbolic-link component.', {
        workspace_root: root,
        path: candidate,
      });
    }
    const realCandidate = fs.realpathSync.native(candidate);
    assertContained(root, realCandidate, 'action_run_directory');
    current = realCandidate;
  }
  return current;
}

function writeExactFile(filePath: string, bytes: Buffer) {
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncDirectory(directory: string) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function storedBytes(filePath: string, expected: Buffer, label: string): StandardAgentActionRunStoredBytes {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`Standard Agent action ${label} path is not a regular file.`, {
      file_path: filePath,
      symbolic_link: stat.isSymbolicLink(),
    });
  }
  const actual = fs.readFileSync(filePath);
  const expectedSha256 = sha256(expected);
  const actualSha256 = sha256(actual);
  if (!actual.equals(expected) || actualSha256 !== expectedSha256) {
    fail(`Standard Agent action ${label} bytes conflict with the existing run identity.`, {
      file_path: filePath,
      expected_sha256: expectedSha256,
      actual_sha256: actualSha256,
      expected_byte_size: expected.byteLength,
      actual_byte_size: actual.byteLength,
    });
  }
  return {
    ref: pathToFileURL(filePath).href,
    file_path: filePath,
    sha256: actualSha256,
    byte_size: actual.byteLength,
  };
}

function readPublishedRun(
  workspaceRootPath: string,
  runId: string,
  domainId: string,
  actionId: string,
  runDirectory: string,
  identityBytes: Buffer,
  requestBytes: Buffer,
  outputBytes: Buffer,
  status: StandardAgentActionRunOutput['status'],
): StandardAgentActionRunOutput {
  const stat = fs.lstatSync(runDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('Standard Agent action run identity resolves to a non-directory or symbolic link.', {
      run_id: runId,
      action_run_dir: runDirectory,
    });
  }
  const realRunDirectory = fs.realpathSync.native(runDirectory);
  assertContained(workspaceRootPath, realRunDirectory, 'action_run_dir');
  const identityPath = path.join(realRunDirectory, 'identity.json');
  const requestPath = path.join(realRunDirectory, 'request.json');
  const outputPath = path.join(realRunDirectory, 'output.json');
  if (!fs.existsSync(identityPath) || !fs.existsSync(requestPath) || !fs.existsSync(outputPath)) {
    fail('Standard Agent action run identity is partially materialized.', {
      run_id: runId,
      identity_exists: fs.existsSync(identityPath),
      request_exists: fs.existsSync(requestPath),
      output_exists: fs.existsSync(outputPath),
    });
  }
  storedBytes(identityPath, identityBytes, 'identity');
  return {
    surface_kind: 'opl_standard_agent_action_run_output',
    version: 'opl-standard-agent-action-run-output.v1',
    status,
    run_id: runId,
    domain_id: domainId,
    action_id: actionId,
    workspace_root: workspaceRootPath,
    action_run_dir: realRunDirectory,
    action_run_ref: pathToFileURL(realRunDirectory).href,
    request: storedBytes(requestPath, requestBytes, 'request'),
    output: storedBytes(outputPath, outputBytes, 'output'),
  };
}

function readPreparedRun(
  workspaceRootPath: string,
  runId: string,
  domainId: string,
  actionId: string,
  runDirectory: string,
  identityBytes: Buffer,
  requestBytes: Buffer,
  status: StandardAgentActionRunRequest['status'],
): StandardAgentActionRunRequest {
  const stat = fs.lstatSync(runDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('Standard Agent action run identity resolves to a non-directory or symbolic link.', {
      run_id: runId,
      action_run_dir: runDirectory,
    });
  }
  const realRunDirectory = fs.realpathSync.native(runDirectory);
  assertContained(workspaceRootPath, realRunDirectory, 'action_run_dir');
  const identityPath = path.join(realRunDirectory, 'identity.json');
  const requestPath = path.join(realRunDirectory, 'request.json');
  if (!fs.existsSync(identityPath) || !fs.existsSync(requestPath)) {
    fail('Standard Agent action run request is partially materialized.', {
      run_id: runId,
      identity_exists: fs.existsSync(identityPath),
      request_exists: fs.existsSync(requestPath),
    });
  }
  storedBytes(identityPath, identityBytes, 'identity');
  return {
    surface_kind: 'opl_standard_agent_action_run_request',
    version: 'opl-standard-agent-action-run-request.v1',
    status,
    run_id: runId,
    domain_id: domainId,
    action_id: actionId,
    workspace_root: workspaceRootPath,
    action_run_dir: realRunDirectory,
    action_run_ref: pathToFileURL(realRunDirectory).href,
    request: storedBytes(requestPath, requestBytes, 'request'),
  };
}

function normalizedRunInput(input: Omit<CommitStandardAgentActionOutputInput, 'outputBytes'>) {
  const root = workspaceRoot(input.workspaceRoot);
  if (!RUN_ID_PATTERN.test(input.runId)) {
    fail('Standard Agent action run_id must be a single safe path segment.', { run_id: input.runId });
  }
  const domainId = identityText(input.domainId, 'domain_id');
  const actionId = identityText(input.actionId, 'action_id');
  if (!(input.requestBytes instanceof Uint8Array) || input.requestBytes.byteLength === 0) {
    fail('Standard Agent action canonical request bytes must be non-empty.', {
      run_id: input.runId,
    });
  }
  const identityBytes = Buffer.from(`${JSON.stringify({
    surface_kind: 'opl_standard_agent_action_run_identity',
    version: 'opl-standard-agent-action-run-identity.v1',
    run_id: input.runId,
    domain_id: domainId,
    action_id: actionId,
  })}\n`, 'utf8');
  return {
    root,
    domainId,
    actionId,
    identityBytes,
    requestBytes: Buffer.from(input.requestBytes),
  };
}

export function prepareStandardAgentActionRunRequest(
  input: Omit<CommitStandardAgentActionOutputInput, 'outputBytes'>,
): StandardAgentActionRunRequest {
  const normalized = normalizedRunInput(input);
  const parent = ensureContainedDirectory(normalized.root, STANDARD_AGENT_ACTION_RUNS_RELATIVE_ROOT.split('/'));
  const runDirectory = path.join(parent, input.runId);
  assertContained(normalized.root, runDirectory, 'action_run_dir');
  if (fs.existsSync(runDirectory)) {
    return readPreparedRun(
      normalized.root,
      input.runId,
      normalized.domainId,
      normalized.actionId,
      runDirectory,
      normalized.identityBytes,
      normalized.requestBytes,
      'already_prepared',
    );
  }

  const staging = path.join(parent, `.${input.runId}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    writeExactFile(path.join(staging, 'identity.json'), normalized.identityBytes);
    writeExactFile(path.join(staging, 'request.json'), normalized.requestBytes);
    fsyncDirectory(staging);
    try {
      fs.renameSync(staging, runDirectory);
      fsyncDirectory(parent);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'ENOTEMPTY'].includes(code ?? '') || !fs.existsSync(runDirectory)) throw error;
      return readPreparedRun(
        normalized.root,
        input.runId,
        normalized.domainId,
        normalized.actionId,
        runDirectory,
        normalized.identityBytes,
        normalized.requestBytes,
        'already_prepared',
      );
    }
    return readPreparedRun(
      normalized.root,
      input.runId,
      normalized.domainId,
      normalized.actionId,
      runDirectory,
      normalized.identityBytes,
      normalized.requestBytes,
      'prepared',
    );
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function commitStandardAgentActionOutput(
  input: CommitStandardAgentActionOutputInput,
): StandardAgentActionRunOutput {
  const normalized = normalizedRunInput(input);
  if (!(input.outputBytes instanceof Uint8Array) || input.outputBytes.byteLength === 0) {
    fail('Standard Agent action handler stdout bytes must be non-empty.', {
      run_id: input.runId,
    });
  }
  const outputBytes = Buffer.from(input.outputBytes);
  const prepared = prepareStandardAgentActionRunRequest(input);
  const runDirectory = prepared.action_run_dir;
  const outputPath = path.join(runDirectory, 'output.json');
  if (fs.existsSync(outputPath)) {
    return readPublishedRun(
      normalized.root,
      input.runId,
      normalized.domainId,
      normalized.actionId,
      runDirectory,
      normalized.identityBytes,
      normalized.requestBytes,
      outputBytes,
      'already_materialized',
    );
  }

  const staging = path.join(runDirectory, `.output.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    writeExactFile(staging, outputBytes);
    try {
      fs.linkSync(staging, outputPath);
      fsyncDirectory(runDirectory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' || !fs.existsSync(outputPath)) {
        throw error;
      }
      return readPublishedRun(
        normalized.root,
        input.runId,
        normalized.domainId,
        normalized.actionId,
        runDirectory,
        normalized.identityBytes,
        normalized.requestBytes,
        outputBytes,
        'already_materialized',
      );
    }
    return readPublishedRun(
      normalized.root,
      input.runId,
      normalized.domainId,
      normalized.actionId,
      runDirectory,
      normalized.identityBytes,
      normalized.requestBytes,
      outputBytes,
      'materialized',
    );
  } finally {
    fs.rmSync(staging, { force: true });
  }
}
