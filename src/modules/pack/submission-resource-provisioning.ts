import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import requirementsSchema from
  '../../../contracts/opl-framework/submission-resource-requirements.schema.json' with { type: 'json' };
import requestSchema from
  '../../../contracts/opl-framework/submission-resource-provision-request.schema.json' with { type: 'json' };
import receiptSchema from
  '../../../contracts/opl-framework/submission-resource-provision-receipt.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

export const OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID =
  'opl_pack_provision_submission_resource' as const;

const REQUIREMENTS_SCHEMA_REF =
  'contracts/opl-framework/submission-resource-requirements.schema.json';
const REQUEST_SCHEMA_REF =
  'contracts/opl-framework/submission-resource-provision-request.schema.json';
const RECEIPT_SCHEMA_REF =
  'contracts/opl-framework/submission-resource-provision-receipt.schema.json';

const AUTHORITY_BOUNDARY = {
  can_download_network_resource: false,
  can_write_domain_truth: false,
  can_mutate_artifact_body: false,
  can_mutate_domain_artifact: false,
  can_sign_owner_receipt: false,
  can_create_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_verdict: false,
  can_authorize_submission_readiness: false,
} as const;

type ProvisioningMode =
  | 'package_bundled_or_host_exact_path'
  | 'host_exact_path_required';

type ResourceRequirement = {
  provisioning: ProvisioningMode;
  package_path?: string;
  path_env?: string;
};

export type SubmissionResourceProvisionRequest = {
  requirements_path?: string;
  requirements_payload?: Record<string, unknown>;
  resource_id: string;
  package_root?: string;
  source_path?: string;
  expected_sha256?: string;
  destination_root?: string;
  dry_run?: boolean;
};

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function contractError(message: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    action_id: OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
    ...details,
  });
}

function fileError(message: string, filePath: string, cause?: unknown) {
  return new FrameworkContractError('contract_file_missing', message, {
    action_id: OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
    path: filePath,
    ...(cause ? { cause: cause instanceof Error ? cause.message : String(cause) } : {}),
  });
}

function assertLocalPath(value: string, field: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw contractError(`${field} must be a local filesystem path; URL and scheme fallbacks are forbidden.`, {
      field,
      value,
    });
  }
}

function sameFileIdentity(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableSnapshot(left: fs.BigIntStats, right: fs.BigIntStats) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableRegularFile(filePath: string, label: string) {
  const exactPath = path.resolve(filePath);
  let pathBefore: fs.BigIntStats;
  try {
    pathBefore = fs.lstatSync(exactPath, { bigint: true });
  } catch (error) {
    throw fileError(`${label} does not exist at the exact local path.`, exactPath, error);
  }
  if (pathBefore.isSymbolicLink()) {
    throw contractError(`${label} must not be a symbolic link.`, { path: exactPath });
  }
  if (!pathBefore.isFile()) {
    throw contractError(`${label} must be a regular file.`, { path: exactPath });
  }

  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  let descriptor: number;
  try {
    descriptor = fs.openSync(exactPath, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    throw fileError(`${label} could not be opened at the exact local path.`, exactPath, error);
  }

  try {
    const openedBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!openedBefore.isFile() || !sameFileIdentity(pathBefore, openedBefore)) {
      throw contractError(`${label} changed identity before it could be read.`, { path: exactPath });
    }
    const bytes = fs.readFileSync(descriptor);
    const openedAfter = fs.fstatSync(descriptor, { bigint: true });
    let pathAfter: fs.BigIntStats;
    try {
      pathAfter = fs.lstatSync(exactPath, { bigint: true });
    } catch (error) {
      throw contractError(`${label} disappeared while it was being read.`, {
        path: exactPath,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    if (
      pathAfter.isSymbolicLink()
      || !sameStableSnapshot(openedBefore, openedAfter)
      || !sameStableSnapshot(openedAfter, pathAfter)
      || BigInt(bytes.length) !== openedAfter.size
    ) {
      throw contractError(`${label} changed while it was being read.`, { path: exactPath });
    }
    return { exactPath, bytes };
  } finally {
    fs.closeSync(descriptor);
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (!isRecord(entry)) return entry;
    return Object.fromEntries(
      Object.keys(entry).sort().map((key) => [key, normalize(entry[key])]),
    );
  };
  return JSON.stringify(normalize(value));
}

function assertSchema(
  schemaId: string,
  schema: Record<string, unknown>,
  sourceRef: string,
  payload: unknown,
) {
  assertJsonSchemaPayload({ schemaId, schema, sourceRef }, payload);
}

function readRequirements(request: SubmissionResourceProvisionRequest) {
  if (request.requirements_path) {
    assertLocalPath(request.requirements_path, 'requirements_path');
    const snapshot = readStableRegularFile(request.requirements_path, 'Submission resource requirements');
    let payload: unknown;
    try {
      payload = parseJsonText(snapshot.bytes.toString('utf8'));
    } catch (error) {
      throw new FrameworkContractError(
        'contract_json_invalid',
        'Submission resource requirements must contain valid JSON.',
        {
          path: snapshot.exactPath,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
    assertSchema(
      'opl-submission-resource-requirements.v1',
      requirementsSchema,
      REQUIREMENTS_SCHEMA_REF,
      payload,
    );
    return {
      payload: payload as Record<string, unknown>,
      requirementsRef: snapshot.exactPath,
      requirementsSha256: sha256(snapshot.bytes),
    };
  }

  const payload = request.requirements_payload;
  assertSchema(
    'opl-submission-resource-requirements.v1',
    requirementsSchema,
    REQUIREMENTS_SCHEMA_REF,
    payload,
  );
  const digest = sha256(canonicalJson(payload));
  return {
    payload: payload as Record<string, unknown>,
    requirementsRef: `inline:sha256:${digest}`,
    requirementsSha256: digest,
  };
}

function resourceRequirement(
  requirements: Record<string, unknown>,
  resourceId: string,
): ResourceRequirement {
  const resources = requirements.resources;
  if (!isRecord(resources) || !isRecord(resources[resourceId])) {
    throw contractError('resource_id is not declared by the submission resource requirements.', {
      resource_id: resourceId,
    });
  }
  return resources[resourceId] as ResourceRequirement;
}

function assertPackagePath(packageRoot: string, packagePath: string) {
  assertLocalPath(packageRoot, 'package_root');
  assertLocalPath(packagePath, 'package_path');
  if (path.isAbsolute(packagePath)) {
    throw contractError('package_path must be relative to package_root.', { package_path: packagePath });
  }

  const root = path.resolve(packageRoot);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(root);
  } catch (error) {
    throw fileError('package_root does not exist.', root, error);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw contractError('package_root must be a real directory, not a symbolic link.', {
      package_root: root,
    });
  }

  const exactPath = path.resolve(root, packagePath);
  if (exactPath !== root && !exactPath.startsWith(`${root}${path.sep}`)) {
    throw contractError('package_path must stay inside package_root.', {
      package_root: root,
      package_path: packagePath,
    });
  }

  let cursor = root;
  for (const segment of path.relative(root, exactPath).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      throw fileError('Package-bundled submission resource is missing.', cursor, error);
    }
    if (stat.isSymbolicLink()) {
      throw contractError('Package-bundled submission resource paths must not contain symbolic links.', {
        package_root: root,
        path: cursor,
      });
    }
  }
  return exactPath;
}

function resolveSource(request: SubmissionResourceProvisionRequest, requirement: ResourceRequirement) {
  const hasPackageRoot = typeof request.package_root === 'string';
  const hasSourcePath = typeof request.source_path === 'string';

  if (requirement.provisioning === 'host_exact_path_required') {
    if (!hasSourcePath || hasPackageRoot) {
      throw contractError(
        'host_exact_path_required needs exactly one explicit source_path and does not accept package_root.',
        { resource_id: request.resource_id, path_env_guidance: requirement.path_env ?? null },
      );
    }
    assertLocalPath(request.source_path as string, 'source_path');
    if (!path.isAbsolute(request.source_path as string)) {
      throw contractError('source_path must be an absolute exact host path.', {
        source_path: request.source_path,
      });
    }
    return {
      ...readStableRegularFile(request.source_path as string, 'Host submission resource'),
      kind: 'host_exact_file' as const,
    };
  }

  if (hasPackageRoot === hasSourcePath) {
    throw contractError(
      'package_bundled_or_host_exact_path needs exactly one of package_root or source_path.',
      { resource_id: request.resource_id },
    );
  }
  if (hasSourcePath) {
    assertLocalPath(request.source_path as string, 'source_path');
    if (!path.isAbsolute(request.source_path as string)) {
      throw contractError('source_path must be an absolute exact host path.', {
        source_path: request.source_path,
      });
    }
    return {
      ...readStableRegularFile(request.source_path as string, 'Host submission resource'),
      kind: 'host_exact_file' as const,
    };
  }

  const exactPath = assertPackagePath(
    request.package_root as string,
    requirement.package_path as string,
  );
  return {
    ...readStableRegularFile(exactPath, 'Package-bundled submission resource'),
    kind: 'package_bundled_file' as const,
  };
}

function assertDirectoryNotSymlink(directory: string, label: string) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw contractError(`${label} must be a real directory, not a symbolic link.`, {
      path: directory,
    });
  }
}

function prepareDestinationDirectory(destinationRoot: string, directory: string) {
  if (fs.existsSync(destinationRoot)) {
    assertDirectoryNotSymlink(destinationRoot, 'destination_root');
  } else {
    fs.mkdirSync(destinationRoot, { recursive: true });
    assertDirectoryNotSymlink(destinationRoot, 'destination_root');
  }
  let cursor = destinationRoot;
  for (const segment of path.relative(destinationRoot, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) fs.mkdirSync(cursor);
    assertDirectoryNotSymlink(cursor, 'Submission resource cache directory');
  }
}

function assertExistingContent(targetPath: string, expectedBytes: Buffer) {
  const existing = readStableRegularFile(targetPath, 'Existing content-addressed cache entry');
  const expectedDigest = sha256(expectedBytes);
  if (existing.bytes.length !== expectedBytes.length || sha256(existing.bytes) !== expectedDigest) {
    throw contractError('Existing content-addressed cache entry does not match its digest path.', {
      target_path: targetPath,
      expected_sha256: expectedDigest,
      actual_sha256: sha256(existing.bytes),
    });
  }
}

function atomicInstallBytes(destinationRoot: string, targetPath: string, bytes: Buffer) {
  const directory = path.dirname(targetPath);
  prepareDestinationDirectory(destinationRoot, directory);
  if (fs.existsSync(targetPath)) {
    assertExistingContent(targetPath, bytes);
    return false;
  }

  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  try {
    try {
      fs.linkSync(temporaryPath, targetPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      assertExistingContent(targetPath, bytes);
      return false;
    }
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function provisionSubmissionResource(input: unknown) {
  assertSchema(
    'opl-submission-resource-provision-request.v1',
    requestSchema,
    REQUEST_SCHEMA_REF,
    input,
  );
  const request = input as SubmissionResourceProvisionRequest;
  const requirements = readRequirements(request);
  const requirement = resourceRequirement(requirements.payload, request.resource_id);
  const source = resolveSource(request, requirement);
  const sourceSha256 = sha256(source.bytes);

  if (
    request.expected_sha256
    && request.expected_sha256.toLowerCase() !== sourceSha256
  ) {
    throw contractError('Submission resource content does not match expected_sha256.', {
      resource_id: request.resource_id,
      expected_sha256: request.expected_sha256.toLowerCase(),
      actual_sha256: sourceSha256,
    });
  }

  if (request.destination_root) assertLocalPath(request.destination_root, 'destination_root');
  const destinationRoot = path.resolve(request.destination_root
    ?? path.join(resolveOplStatePaths().state_dir, 'pack', 'submission-resources'));
  const cachedPath = path.join(destinationRoot, 'sha256', sourceSha256);
  const resourceRequirementSha256 = sha256(canonicalJson(requirement));
  const receipt = {
    surface_kind: 'opl_pack_submission_resource_provision_receipt.v1',
    schema_version: 1,
    action_id: OPL_PACK_PROVISION_SUBMISSION_RESOURCE_ACTION_ID,
    status: 'resolved_for_provisioning',
    resource_id: request.resource_id,
    requirement: {
      requirements_ref: requirements.requirementsRef,
      requirements_sha256: requirements.requirementsSha256,
      resource_requirement_sha256: resourceRequirementSha256,
      provisioning: requirement.provisioning,
      ...(requirement.package_path ? { package_path: requirement.package_path } : {}),
      ...(requirement.path_env ? { path_env_guidance: requirement.path_env } : {}),
    },
    source: {
      kind: source.kind,
      exact_path: source.exactPath,
      sha256: sourceSha256,
      bytes: source.bytes.length,
    },
    target: {
      kind: 'opl_content_addressed_cache',
      exact_path: cachedPath,
      sha256: sourceSha256,
      bytes: source.bytes.length,
    },
    provisioned_resources: {
      [request.resource_id]: {
        cached_path: cachedPath,
        sha256: sourceSha256,
        bytes: source.bytes.length,
      },
    },
    authority_boundary: AUTHORITY_BOUNDARY,
  };
  assertSchema(
    'opl-submission-resource-provision-receipt.v1',
    receiptSchema,
    RECEIPT_SCHEMA_REF,
    receipt,
  );

  const receiptBytes = Buffer.from(formatJsonPayload(receipt));
  const receiptSha256 = sha256(receiptBytes);
  const receiptPath = path.join(destinationRoot, 'receipts', 'sha256', `${receiptSha256}.json`);
  if (request.dry_run === true) {
    return {
      version: 'g2',
      pack_submission_resource_provisioning: {
        status: 'dry_run',
        dry_run: true,
        writes_performed: false,
        resource_write: 'not_written',
        receipt_write: 'not_written',
        receipt_path: receiptPath,
        receipt_sha256: receiptSha256,
        receipt,
      },
    };
  }

  const resourceWritten = atomicInstallBytes(destinationRoot, cachedPath, source.bytes);
  const receiptWritten = atomicInstallBytes(destinationRoot, receiptPath, receiptBytes);
  return {
    version: 'g2',
    pack_submission_resource_provisioning: {
      status: resourceWritten || receiptWritten ? 'provisioned' : 'already_provisioned',
      dry_run: false,
      writes_performed: resourceWritten || receiptWritten,
      resource_write: resourceWritten ? 'written' : 'already_present',
      receipt_write: receiptWritten ? 'written' : 'already_present',
      receipt_path: receiptPath,
      receipt_sha256: receiptSha256,
      receipt,
    },
  };
}
