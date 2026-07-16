import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../kernel/json-file.ts';
import { buildStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import {
  buildReferenceBuildDigestTargets,
  materializeReferenceBuildFileDigest,
} from './reference-build-proof.ts';
import {
  STANDARD_AGENT_IMPLEMENTATION_PROFILE,
  validateStandardAgentImplementationProfile,
  validateStandardAgentImplementationProfileRefs,
} from '../pack/public/standard-agent-implementation-profile.ts';
import { SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS } from './source-derived-agent-design-abi.ts';

export const AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_SCHEMA_REF =
  'contracts/opl-framework/agent-scaffold-materialization-request.schema.json';

const AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION =
  'opl-agent-scaffold-materialization-request.v2';
const LEGACY_AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION =
  'opl-agent-scaffold-materialization-request.v1';

const MERGE_PATHS = [
  'contracts/domain_descriptor.json',
  'contracts/capability_map.json',
] as const;

type WriteEntry = { relativePath: string; bytes: Buffer; role: string };

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`, { field });
  return value;
}

function requireObject(value: unknown, field: string) {
  if (!isRecord(value)) fail(`${field} must be a JSON object.`, { field });
  return value;
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requireExactObject(
  value: unknown,
  field: string,
  expected: Record<string, unknown>,
) {
  const record = requireObject(value, field);
  if (!isDeepStrictEqual(record, expected)) {
    fail(`${field} does not match the OPL materialization boundary.`, { field, expected });
  }
  return record;
}

function safeRelativePath(value: unknown, field: string) {
  const relativePath = requireString(value, field);
  const segments = relativePath.split(/[\\/]+/);
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || segments.includes('..') || segments.includes('.') || relativePath.includes('\0')) {
    fail(`${field} must be a normalized target-relative path.`, { field, path: relativePath });
  }
  const normalized = path.normalize(relativePath);
  if (normalized !== relativePath || normalized === '') {
    fail(`${field} must be a normalized target-relative path.`, { field, path: relativePath });
  }
  return relativePath;
}

function prepareTargetRoot(targetDir: string) {
  const resolved = path.resolve(targetDir);
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    fail('Materialization target directory must not be a symlink.', { target_dir: resolved });
  }
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);
  if (!fs.statSync(real).isDirectory()) fail('Materialization target must be a directory.', { target_dir: resolved });
  return real;
}

function assertNoExistingSymlinks(root: string, current = root) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const candidate = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      fail('Materialization target tree must not contain symlinks.', { path: path.relative(root, candidate) });
    }
    if (entry.isDirectory()) assertNoExistingSymlinks(root, candidate);
  }
}

function prepareContainedFile(root: string, relativePath: string) {
  const segments = relativePath.split(path.sep);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) {
        fail('Materialization path must not traverse a symlink.', { path: relativePath });
      }
      if (!fs.statSync(current).isDirectory()) fail('Materialization parent must be a directory.', { path: relativePath });
    } else {
      fs.mkdirSync(current);
    }
  }
  const target = path.join(root, relativePath);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    fail('Materialization target file must not be a symlink.', { path: relativePath });
  }
  const parentReal = fs.realpathSync(path.dirname(target));
  const relative = path.relative(root, parentReal);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('Materialization path escapes the target directory.', { path: relativePath });
  }
  return target;
}

function atomicWrite(root: string, entry: WriteEntry) {
  const target = prepareContainedFile(root, entry.relativePath);
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.opl-${process.pid}-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(temp, entry.bytes, { flag: 'wx' });
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function readRequest(requestPath: string) {
  const resolved = path.resolve(requestPath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Scaffold materialization request is missing: ${resolved}.`, {
        request: resolved,
      });
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Scaffold materialization request contains invalid JSON.', {
      request: resolved,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(parsed)) fail('Scaffold materialization request root must be a JSON object.');
  return { path: resolved, sha256: sha256(raw), value: parsed };
}

function normalizeMaterializationRequest(request: Record<string, unknown>) {
  const inputVersion = requireString(request.version, 'version');
  if (inputVersion === AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION) {
    return {
      value: request,
      inputVersion,
      compatibilityAdapter: null,
    };
  }
  if (inputVersion !== LEGACY_AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION) {
    fail('Scaffold materialization request version is unsupported.', {
      input_version: inputVersion,
      supported_versions: [
        AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION,
        LEGACY_AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION,
      ],
    });
  }
  if (request.request_owner !== 'opl-meta-agent' || Object.hasOwn(request, 'producer_agent_id')) {
    fail('Legacy scaffold materialization requests must retain the exact OMA v1 owner identity.');
  }
  requireExactObject(request.authority_boundary, 'authority_boundary', {
    oma_authors_agent_building_semantics: true,
    oma_writes_target_agent_files: false,
    opl_owns_physical_scaffold_materialization: true,
    opl_owns_materialized_file_digests: true,
    opl_owns_final_build_receipt: true,
    build_receipt_candidate_is_final_receipt: false,
    opl_can_write_target_domain_truth: false,
    opl_can_authorize_quality_or_export: false,
  });
  const candidate = requireObject(request.build_receipt_candidate, 'build_receipt_candidate');
  const { request_owner: _requestOwner, ...requestWithoutLegacyOwner } = request;
  return {
    value: {
      ...requestWithoutLegacyOwner,
      version: AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION,
      producer_agent_id: 'oma',
      build_receipt_candidate: {
        ...candidate,
        surface_kind: [
          'opl_meta_agent_build_receipt',
          'opl_meta_agent_build_receipt_candidate',
        ].includes(String(candidate.surface_kind))
          ? 'opl_foundry_agent_build_receipt_candidate'
          : candidate.surface_kind,
        producer_agent_id: 'oma',
      },
      authority_boundary: {
        producer_authors_agent_building_semantics: true,
        producer_writes_target_agent_files: false,
        opl_owns_physical_scaffold_materialization: true,
        opl_owns_materialized_file_digests: true,
        opl_owns_final_build_receipt: true,
        build_receipt_candidate_is_final_receipt: false,
        opl_can_write_target_domain_truth: false,
        opl_can_authorize_quality_or_export: false,
      },
    },
    inputVersion,
    compatibilityAdapter: 'opl_agent_scaffold_materialization_request.v1_to_v2',
  };
}

function validateHeader(request: Record<string, unknown>) {
  const expected = {
    surface_kind: 'opl_agent_scaffold_materialization_request',
    version: AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION,
    canonical_schema_ref: AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_SCHEMA_REF,
    execution_owner: 'one-person-lab/OPL Foundry Kernel',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (request[field] !== value) fail(`Scaffold materialization request ${field} is invalid.`, { field, expected: value });
  }
  const producerAgentId = requireString(request.producer_agent_id, 'producer_agent_id');
  if (!/^[a-z][a-z0-9_-]*$/.test(producerAgentId) || Object.hasOwn(request, 'request_owner')) {
    fail('Scaffold materialization request producer identity is invalid.', {
      producer_agent_id: producerAgentId,
    });
  }
  requireExactObject(request.overwrite_policy, 'overwrite_policy', {
    mode: 'replace_declared_files_only',
    allow_existing_target_dir: true,
    reject_absolute_paths: true,
    reject_parent_traversal: true,
    reject_symlink_escape: true,
    allowed_merge_object_paths: [...MERGE_PATHS],
  });
  requireExactObject(request.authority_boundary, 'authority_boundary', {
    producer_authors_agent_building_semantics: true,
    producer_writes_target_agent_files: false,
    opl_owns_physical_scaffold_materialization: true,
    opl_owns_materialized_file_digests: true,
    opl_owns_final_build_receipt: true,
    build_receipt_candidate_is_final_receipt: false,
    opl_can_write_target_domain_truth: false,
    opl_can_authorize_quality_or_export: false,
  });
  return producerAgentId;
}

function parseJsonObjectText(raw: string, field: string) {
  try {
    return requireObject(parseJsonText(raw), field);
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail(`${field} must contain valid JSON.`, {
      field,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function inspectTargetBeforeWrite(targetDir: string) {
  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) return resolved;
  if (fs.lstatSync(resolved).isSymbolicLink()) {
    fail('Materialization target directory must not be a symlink.', { target_dir: resolved });
  }
  if (!fs.statSync(resolved).isDirectory()) {
    fail('Materialization target must be a directory.', { target_dir: resolved });
  }
  const real = fs.realpathSync(resolved);
  assertNoExistingSymlinks(real);
  return real;
}

function preflightMaterializationRequest(request: Record<string, unknown>, targetDir: string) {
  const producerAgentId = validateHeader(request);
  const target = requireObject(request.target_identity, 'target_identity');
  const domainId = requireString(target.domain_id, 'target_identity.domain_id');
  const domainLabel = requireString(target.domain_label, 'target_identity.domain_label');
  if (target.target_agent_ref !== `domain-agent:${domainId}`) {
    fail('target_identity.target_agent_ref must match domain_id.');
  }

  const targetRoot = inspectTargetBeforeWrite(targetDir);
  const declaredPaths = new Set<string>();
  const declaredBodies = new Map<string, string>();
  const addDeclaredPath = (relativePath: string, field: string) => {
    if (declaredPaths.has(relativePath)) {
      fail('Scaffold materialization request declares a path more than once.', { path: relativePath, field });
    }
    declaredPaths.add(relativePath);
  };

  if (!Array.isArray(request.files) || request.files.length === 0) fail('files must be a non-empty array.');
  request.files.forEach((value, index) => {
    const file = requireObject(value, `files[${index}]`);
    const relativePath = safeRelativePath(file.path, `files[${index}].path`);
    const body = requireString(file.body, `files[${index}].body`);
    requireString(file.role, `files[${index}].role`);
    addDeclaredPath(relativePath, `files[${index}].path`);
    declaredBodies.set(relativePath, body);
  });

  if (!Array.isArray(request.json_projections) || request.json_projections.length !== 2) {
    fail('json_projections must contain the two allowed merge-object projections.');
  }
  const projectionMergePaths = new Set<string>();
  request.json_projections.forEach((value, index) => {
    const projection = requireObject(value, `json_projections[${index}]`);
    const relativePath = safeRelativePath(projection.path, `json_projections[${index}].path`);
    if (!MERGE_PATHS.includes(relativePath as typeof MERGE_PATHS[number]) || projection.merge_policy !== 'merge_object') {
      fail('json_projections may only shallow-merge the two declared OPL paths.', { path: relativePath });
    }
    if (projectionMergePaths.has(relativePath)) {
      fail('json_projections must declare each allowed merge path exactly once.', { path: relativePath });
    }
    projectionMergePaths.add(relativePath);
    requireObject(projection.value, `json_projections[${index}].value`);
    const pendingBody = declaredBodies.get(relativePath);
    if (pendingBody !== undefined) {
      parseJsonObjectText(pendingBody, `${relativePath} declared body`);
    } else {
      const existingPath = path.join(targetRoot, relativePath);
      if (fs.existsSync(existingPath)) {
        parseJsonObjectText(fs.readFileSync(existingPath, 'utf8'), `${relativePath} existing file`);
      }
    }
  });
  if (projectionMergePaths.size !== MERGE_PATHS.length
    || MERGE_PATHS.some((relativePath) => !projectionMergePaths.has(relativePath))) {
    fail('json_projections must declare both allowed merge paths exactly once.');
  }

  const replacements: Array<[unknown, string]> = [[request.stage_manifest, 'stage_manifest']];
  if (!Array.isArray(request.contracts) || request.contracts.length === 0) fail('contracts must be a non-empty array.');
  request.contracts.forEach((value, index) => replacements.push([value, `contracts[${index}]`]));
  for (const [value, field] of replacements) {
    const replacement = requireObject(value, field);
    if (replacement.write_policy !== 'replace_declared_files_only') fail(`${field}.write_policy is invalid.`);
    const relativePath = safeRelativePath(replacement.path, `${field}.path`);
    if (relativePath === 'contracts/stage_control_plane.json') {
      fail('Scaffold materialization cannot write the OPL-owned hosted stage control plane.', { path: relativePath });
    }
    requireObject(replacement.value, `${field}.value`);
    addDeclaredPath(relativePath, `${field}.path`);
  }

  const compilerInput = requireObject(request.pack_compiler_input, 'pack_compiler_input');
  if (compilerInput.implementation_profile !== undefined) {
    const profileValidation = validateStandardAgentImplementationProfile(
      compilerInput.implementation_profile,
      { required: true },
    );
    if (profileValidation.status !== 'passed') {
      fail('pack_compiler_input.implementation_profile is invalid.', {
        blockers: profileValidation.blockers,
      });
    }
  }
  const additions = compilerInput.required_domain_pack_path_additions;
  if (!Array.isArray(additions) || additions.some((entry) => typeof entry !== 'string')) {
    fail('pack_compiler_input.required_domain_pack_path_additions must be a string array.');
  }
  additions.forEach((entry, index) => safeRelativePath(entry, `required_domain_pack_path_additions[${index}]`));
  if (new Set(additions).size !== additions.length) {
    fail('pack_compiler_input.required_domain_pack_path_additions must be unique.');
  }
  const packPath = 'contracts/pack_compiler_input.json';
  const declaredPackBody = declaredBodies.get(packPath);
  if (declaredPackBody !== undefined) {
    const pack = parseJsonObjectText(declaredPackBody, packPath);
    if (!Array.isArray(pack.required_domain_pack_paths)
      || pack.required_domain_pack_paths.some((entry) => typeof entry !== 'string')) {
      fail('contracts/pack_compiler_input.json requires required_domain_pack_paths.');
    }
  } else {
    const existingPackPath = path.join(targetRoot, packPath);
    if (fs.existsSync(existingPackPath)) {
      const pack = parseJsonObjectText(fs.readFileSync(existingPackPath, 'utf8'), `${packPath} existing file`);
      if (!Array.isArray(pack.required_domain_pack_paths)
        || pack.required_domain_pack_paths.some((entry) => typeof entry !== 'string')) {
        fail('contracts/pack_compiler_input.json requires required_domain_pack_paths.');
      }
    }
  }

  const installation = requireObject(request.build_receipt_installation, 'build_receipt_installation');
  const receiptPath = safeRelativePath(installation.receipt_path, 'build_receipt_installation.receipt_path');
  if (receiptPath !== 'contracts/agent_build_receipt.json' || declaredPaths.has(receiptPath)) {
    fail('build_receipt_installation.receipt_path must be the OPL-owned undeclared final receipt path.');
  }
  const expectedReceiptRef = requireString(
    installation.expected_build_receipt_ref,
    'build_receipt_installation.expected_build_receipt_ref',
  );
  const projectionPaths = installation.projection_paths;
  const expectedProjectionPaths = [
    'contracts/domain_descriptor.json',
    'contracts/capability_map.json',
  ];
  if (!Array.isArray(projectionPaths)
    || projectionPaths.some((entry) => typeof entry !== 'string')
    || !isDeepStrictEqual(projectionPaths, expectedProjectionPaths)) {
    fail('build_receipt_installation.projection_paths is invalid.');
  }
  for (const relativePath of projectionPaths as string[]) {
    if (!declaredPaths.has(relativePath) && !fs.existsSync(path.join(targetRoot, relativePath))) {
      if (!MERGE_PATHS.includes(relativePath as typeof MERGE_PATHS[number])) {
        fail('build receipt projection target must exist or be declared by the request.', { path: relativePath });
      }
      continue;
    }
    const declaredBody = declaredBodies.get(relativePath);
    if (declaredBody !== undefined) parseJsonObjectText(declaredBody, `${relativePath} declared body`);
  }

  const candidate = requireObject(request.build_receipt_candidate, 'build_receipt_candidate');
  if (candidate.receipt_ref !== expectedReceiptRef) {
    fail('build_receipt_candidate.receipt_ref does not match the expected build receipt ref.');
  }
  if (candidate.surface_kind !== 'opl_foundry_agent_build_receipt_candidate'
    || candidate.producer_agent_id !== producerAgentId
    || Object.hasOwn(candidate, 'materialized_file_digests')
    || Object.hasOwn(candidate, 'materialization_receipt')
    || Object.hasOwn(candidate, 'materialization')
    || Object.hasOwn(candidate, 'receipt_timing')) {
    fail('Foundry producer build receipt input must remain a candidate and cannot self-sign final materialization evidence.');
  }

  const validationRequests = request.validation_requests;
  const expectedValidationRequests = [
    'standard_domain_agent_scaffold',
    'domain_pack_compiler',
    'agent_profile_conformance',
  ];
  if (!isDeepStrictEqual(validationRequests, expectedValidationRequests)) {
    fail('validation_requests does not match the OPL materialization validation boundary.');
  }

  return {
    target,
    domainId,
    domainLabel,
    candidate,
    installation,
    receiptPath,
    expectedReceiptRef,
    projectionPaths: projectionPaths as string[],
    validationRequests: validationRequests as string[],
    producerAgentId,
  };
}

function parseWrites(request: Record<string, unknown>, root: string) {
  const writes = new Map<string, WriteEntry>();
  const add = (entry: WriteEntry) => {
    if (writes.has(entry.relativePath)) fail('Scaffold materialization request declares a path more than once.', { path: entry.relativePath });
    writes.set(entry.relativePath, entry);
  };
  if (!Array.isArray(request.files) || request.files.length === 0) fail('files must be a non-empty array.');
  request.files.forEach((value, index) => {
    const file = requireObject(value, `files[${index}]`);
    add({
      relativePath: safeRelativePath(file.path, `files[${index}].path`),
      bytes: Buffer.from(requireString(file.body, `files[${index}].body`)),
      role: requireString(file.role, `files[${index}].role`),
    });
  });
  if (!Array.isArray(request.json_projections) || request.json_projections.length !== 2) {
    fail('json_projections must contain the two allowed merge-object projections.');
  }
  request.json_projections.forEach((value, index) => {
    const projection = requireObject(value, `json_projections[${index}]`);
    const relativePath = safeRelativePath(projection.path, `json_projections[${index}].path`);
    if (!MERGE_PATHS.includes(relativePath as typeof MERGE_PATHS[number]) || projection.merge_policy !== 'merge_object') {
      fail('json_projections may only shallow-merge the two declared OPL paths.', { path: relativePath });
    }
    const incoming = requireObject(projection.value, `json_projections[${index}].value`);
    let existing: Record<string, unknown> = {};
    const existingPath = path.join(root, relativePath);
    const pending = writes.get(relativePath);
    if (pending) {
      try {
        const parsed = parseJsonText(pending.bytes.toString('utf8'));
        existing = requireObject(parsed, `${relativePath} existing body`);
      } catch (error) {
        if (error instanceof FrameworkContractError) throw error;
        fail(`${relativePath} existing body must contain valid JSON.`);
      }
      writes.delete(relativePath);
    } else if (fs.existsSync(existingPath)) {
      prepareContainedFile(root, relativePath);
      try {
        existing = requireObject(parseJsonText(fs.readFileSync(existingPath, 'utf8')), `${relativePath} existing file`);
      } catch (error) {
        if (error instanceof FrameworkContractError) throw error;
        fail(`${relativePath} existing file must contain valid JSON.`);
      }
    }
    add({ relativePath, bytes: Buffer.from(formatJsonPayload({ ...existing, ...incoming })), role: 'producer_json_projection' });
  });
  const replacements: Array<[unknown, string]> = [[request.stage_manifest, 'stage_manifest']];
  if (!Array.isArray(request.contracts) || request.contracts.length === 0) fail('contracts must be a non-empty array.');
  request.contracts.forEach((value, index) => replacements.push([value, `contracts[${index}]`]));
  for (const [value, field] of replacements) {
    const replacement = requireObject(value, field);
    if (replacement.write_policy !== 'replace_declared_files_only') fail(`${field}.write_policy is invalid.`);
    add({
      relativePath: safeRelativePath(replacement.path, `${field}.path`),
      bytes: Buffer.from(formatJsonPayload(requireObject(replacement.value, `${field}.value`))),
      role: 'oma_json_replacement',
    });
  }
  const compilerInput = requireObject(request.pack_compiler_input, 'pack_compiler_input');
  const implementationProfile = compilerInput.implementation_profile;
  if (implementationProfile !== undefined) {
    const profileValidation = validateStandardAgentImplementationProfileRefs(implementationProfile, root, { required: true });
    if (profileValidation.status !== 'passed') {
      fail('pack_compiler_input.implementation_profile references are invalid.', {
        blockers: profileValidation.blockers,
      });
    }
  }
  const additions = compilerInput.required_domain_pack_path_additions;
  if (!Array.isArray(additions) || additions.some((entry) => typeof entry !== 'string')) {
    fail('pack_compiler_input.required_domain_pack_path_additions must be a string array.');
  }
  const packPath = 'contracts/pack_compiler_input.json';
  const pendingPack = writes.get(packPath);
  if (additions.length > 0 || implementationProfile !== undefined || pendingPack) {
    let pack: Record<string, unknown>;
    if (pendingPack) {
      pack = requireObject(parseJsonText(pendingPack.bytes.toString('utf8')), packPath);
      writes.delete(packPath);
    } else {
      const filePath = prepareContainedFile(root, packPath);
      if (!fs.existsSync(filePath)) fail('pack compiler path additions require contracts/pack_compiler_input.json.');
      pack = requireObject(parseJsonText(fs.readFileSync(filePath, 'utf8')), packPath);
    }
    const current = pack.required_domain_pack_paths;
    if (!Array.isArray(current) || current.some((entry) => typeof entry !== 'string')) {
      fail('contracts/pack_compiler_input.json requires required_domain_pack_paths.');
    }
    const normalized = additions.map((entry, index) => safeRelativePath(entry, `required_domain_pack_path_additions[${index}]`));
    add({
      relativePath: packPath,
      bytes: Buffer.from(formatJsonPayload({
        ...pack,
        implementation_profile: implementationProfile ?? pack.implementation_profile ?? STANDARD_AGENT_IMPLEMENTATION_PROFILE,
        required_domain_pack_paths: [...new Set([...current, ...normalized])],
      })),
      role: 'opl_pack_compiler_input_projection',
    });
  }
  return writes;
}

export function materializeAgentScaffold(input: { requestPath: string; targetDir: string }) {
  const request = readRequest(input.requestPath);
  const normalizedRequest = normalizeMaterializationRequest(request.value);
  const preflight = preflightMaterializationRequest(normalizedRequest.value, input.targetDir);
  const root = prepareTargetRoot(input.targetDir);
  assertNoExistingSymlinks(root);
  buildStandardDomainAgentScaffold({
    targetDir: root,
    domainId: preflight.domainId,
    domainLabel: preflight.domainLabel,
    force: false,
  });
  const writes = parseWrites(normalizedRequest.value, root);
  const {
    candidate,
    expectedReceiptRef,
    projectionPaths,
    receiptPath,
    target,
    validationRequests,
    producerAgentId,
  } = preflight;
  for (const entry of writes.values()) atomicWrite(root, entry);
  const capabilityMapPath = path.join(root, 'contracts/capability_map.json');
  const capabilityMap = requireObject(parseJsonText(fs.readFileSync(capabilityMapPath, 'utf8')), 'contracts/capability_map.json');
  const agentPackPlan = isRecord(capabilityMap.agent_pack_plan) ? capabilityMap.agent_pack_plan : null;
  const plannedStages = recordArray(agentPackPlan?.planned_stage_refs);
  const materializedStageIds = plannedStages
    .map((stage) => stage.stage_id)
    .filter((stageId): stageId is string => typeof stageId === 'string' && stageId.length > 0);
  const referenceDigests = agentPackPlan
    ? buildReferenceBuildDigestTargets(root, agentPackPlan)
      .map((digestTarget) => materializeReferenceBuildFileDigest(root, digestTarget))
    : [...writes.values()].map((entry) => ({
      ref: entry.relativePath,
      local_file_ref: entry.relativePath,
      source_kinds: [entry.role],
      digest_scope: 'file_content',
      digest_normalization: 'raw_file_bytes',
      sha256: sha256(fs.readFileSync(path.join(root, entry.relativePath))),
    }));
  const finalBuildReceipt = {
    ...candidate,
    surface_kind: SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.build_receipt.surface_kind,
    receipt_kind: 'AgentBuildReceipt',
    version: SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS.build_receipt.version,
    receipt_ref: expectedReceiptRef,
    candidate_surface_kind: candidate.surface_kind ?? null,
    candidate_sha256: sha256(formatJsonPayload(candidate)),
    receipt_timing: 'post_materialization',
    materialization: {
      status: 'passed',
      all_planned_stages_materialized_exactly_once: true,
      all_planned_stage_files_present: true,
      materialized_stage_ids: materializedStageIds,
      materialized_file_digests: referenceDigests,
    },
    finalized_by: 'one-person-lab/OPL Foundry Kernel',
    authority_boundary: {
      ...(isRecord(candidate.authority_boundary) ? candidate.authority_boundary : {}),
      candidate_only: false,
      opl_owns_physical_scaffold_materialization: true,
      opl_owns_materialized_file_digests: true,
      opl_owns_final_build_receipt: true,
      opl_can_write_target_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
  };
  for (const relativePath of projectionPaths) {
    const filePath = prepareContainedFile(root, relativePath);
    const surface = requireObject(parseJsonText(fs.readFileSync(filePath, 'utf8')), relativePath);
    const projected = {
      ...surface,
      build_receipt_ref: expectedReceiptRef,
      build_receipt_refs: [expectedReceiptRef],
      build_receipt: finalBuildReceipt,
    };
    atomicWrite(root, {
      relativePath,
      bytes: Buffer.from(formatJsonPayload(projected)),
      role: 'opl_final_build_receipt_projection',
    });
    writes.set(relativePath, {
      relativePath,
      bytes: Buffer.from(formatJsonPayload(projected)),
      role: 'opl_final_build_receipt_projection',
    });
  }
  atomicWrite(root, { relativePath: receiptPath, bytes: Buffer.from(formatJsonPayload(finalBuildReceipt)), role: 'opl_final_build_receipt' });
  const allDigests = [
    ...[...writes.values()].map((entry) => ({
      path: entry.relativePath,
      role: entry.role,
      sha256: sha256(fs.readFileSync(path.join(root, entry.relativePath))),
    })),
    { path: receiptPath, role: 'opl_final_build_receipt', sha256: sha256(fs.readFileSync(path.join(root, receiptPath))) },
  ].sort((left, right) => left.path.localeCompare(right.path));
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      mode: 'materialize_request',
      state: 'materialized',
      target_dir: root,
      materialization_receipt: {
        surface_kind: 'opl_agent_scaffold_materialization_receipt',
        version: 'opl-agent-scaffold-materialization-receipt.v1',
        status: 'materialized',
        request_ref: request.path,
        request_sha256: request.sha256,
        input_request_version: normalizedRequest.inputVersion,
        normalized_request_version: AGENT_SCAFFOLD_MATERIALIZATION_REQUEST_VERSION,
        compatibility_adapter: normalizedRequest.compatibilityAdapter,
        producer_agent_id: producerAgentId,
        target_agent_ref: target.target_agent_ref,
        target_dir: root,
        overwrite_mode: 'replace_declared_files_only',
        materialized_file_digests: allDigests,
        build_receipt_ref: expectedReceiptRef,
        build_receipt_path: receiptPath,
        build_receipt: finalBuildReceipt,
        validation_refs: validationRequests,
        validation_status: 'requested_not_executed',
        authority_boundary: {
          opl_owns_physical_scaffold_materialization: true,
          opl_owns_materialized_file_digests: true,
          opl_owns_final_build_receipt: true,
          materialization_receipt_can_claim_domain_ready: false,
          materialization_receipt_can_claim_quality_or_export: false,
        },
      },
    },
  };
}
