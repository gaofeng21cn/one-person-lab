import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

const REQUIRED_FALSE_FLAGS = [
  'can_write_domain_truth',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_authorize_quality_verdict',
  'can_claim_domain_ready',
  'can_claim_production_ready',
] as const;

const NOT_CLAIMS = [
  'domain_ready',
  'quality_verdict',
  'artifact_authority',
  'production_ready',
  'owner_receipt',
  'typed_blocker',
];

function usage(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('cli_usage_error', message, details);
}

function shape(message: string, details: JsonRecord = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256Bytes(content: string | Buffer) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256File(filePath: string) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function jsonText(payload: unknown) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function readJsonFile(filePath: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Pack bundle file is missing: ${filePath}.`, {
        path: filePath,
      });
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw shape('Pack bundle JSON root must be an object.', { path: filePath });
    }
    return parsed;
  } catch (error) {
    if (error instanceof FrameworkContractError) {
      throw error;
    }
    throw new FrameworkContractError('contract_json_invalid', `Pack bundle file contains invalid JSON: ${filePath}.`, {
      path: filePath,
      cause: error instanceof Error ? error.message : 'JSON parse failed',
    });
  }
}

function requireString(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`${context}.${field} must be a non-empty string.`, { field: `${context}.${field}` });
  }
  return value.trim();
}

function requireArray(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw shape(`${context}.${field} must be an array.`, { field: `${context}.${field}` });
  }
  return value;
}

function requireRecord(record: JsonRecord, field: string, context: string) {
  const value = record[field];
  if (!isRecord(value)) {
    throw shape(`${context}.${field} must be an object.`, { field: `${context}.${field}` });
  }
  return value;
}

function normalizeRelativeRef(ref: string, field: string) {
  if (path.isAbsolute(ref)) {
    throw shape('Pack bundle refs must be relative to the assembly file.', { field, ref });
  }
  const normalized = path.normalize(ref);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw shape('Pack bundle refs must not escape the assembly directory.', { field, ref });
  }
  return normalized.replaceAll(path.sep, '/');
}

function resolveRef(assemblyDir: string, ref: string, field: string) {
  const normalized = normalizeRelativeRef(ref, field);
  const absolutePath = path.resolve(assemblyDir, normalized);
  if (!absolutePath.startsWith(`${assemblyDir}${path.sep}`) && absolutePath !== assemblyDir) {
    throw shape('Pack bundle refs must resolve inside the assembly directory.', { field, ref });
  }
  return {
    ref: normalized,
    path: absolutePath,
  };
}

function validateAuthorityBoundary(boundary: JsonRecord, context: string) {
  for (const flag of REQUIRED_FALSE_FLAGS) {
    if (boundary[flag] !== false) {
      throw shape(`${context}.${flag} must be false.`, { field: `${context}.${flag}` });
    }
  }
  return Object.fromEntries(REQUIRED_FALSE_FLAGS.map((flag) => [flag, false]));
}

function loadAssembly(assemblyPath: string) {
  const resolvedAssemblyPath = path.resolve(assemblyPath);
  const assemblyDir = path.dirname(resolvedAssemblyPath);
  const assembly = readJsonFile(resolvedAssemblyPath);
  if (assembly.surface_kind !== 'opl_pack_bundle_assembly') {
    throw shape('Pack bundle assembly surface_kind must be opl_pack_bundle_assembly.', {
      path: resolvedAssemblyPath,
      surface_kind: assembly.surface_kind,
    });
  }
  if (assembly.schema_version !== 1) {
    throw shape('Pack bundle assembly schema_version must be 1.', {
      path: resolvedAssemblyPath,
      schema_version: assembly.schema_version,
    });
  }

  const generatedArrayFields = requireArray(
    assembly,
    'generated_array_fields',
    'pack_bundle_assembly',
  ).map((entry, index) => {
    if (!isRecord(entry)) {
      throw shape('pack_bundle_assembly.generated_array_fields[] must contain objects.', { index });
    }
    const order = requireArray(entry, 'order', `pack_bundle_assembly.generated_array_fields[${index}]`)
      .map((itemRef, orderIndex) => {
        if (typeof itemRef !== 'string' || itemRef.trim().length === 0) {
          throw shape('pack_bundle_assembly.generated_array_fields[].order[] must contain strings.', {
            index,
            order_index: orderIndex,
          });
        }
        return normalizeRelativeRef(itemRef.trim(), `generated_array_fields[${index}].order[${orderIndex}]`);
      });
    return {
      field: requireString(entry, 'field', `pack_bundle_assembly.generated_array_fields[${index}]`),
      source_dir: resolveRef(
        assemblyDir,
        requireString(entry, 'source_dir_ref', `pack_bundle_assembly.generated_array_fields[${index}]`),
        `generated_array_fields[${index}].source_dir_ref`,
      ),
      order,
    };
  });

  return {
    path: resolvedAssemblyPath,
    dir: assemblyDir,
    bundle_id: requireString(assembly, 'bundle_id', 'pack_bundle_assembly'),
    owner: requireString(assembly, 'owner', 'pack_bundle_assembly'),
    state: requireString(assembly, 'state', 'pack_bundle_assembly'),
    source_root: resolveRef(
      assemblyDir,
      requireString(assembly, 'source_root_ref', 'pack_bundle_assembly'),
      'source_root_ref',
    ),
    aggregate: resolveRef(
      assemblyDir,
      requireString(assembly, 'aggregate_ref', 'pack_bundle_assembly'),
      'aggregate_ref',
    ),
    manifest: resolveRef(
      assemblyDir,
      requireString(assembly, 'manifest_ref', 'pack_bundle_assembly'),
      'manifest_ref',
    ),
    generated_array_fields: generatedArrayFields,
    commands: isRecord(assembly.commands) ? assembly.commands : {},
    authority_boundary: validateAuthorityBoundary(
      requireRecord(assembly, 'authority_boundary', 'pack_bundle_assembly'),
      'pack_bundle_assembly.authority_boundary',
    ),
  };
}

function sourceEntry(role: string, entryPath: string, ref: string, extras: JsonRecord = {}) {
  return {
    role,
    ref,
    sha256: sha256File(entryPath),
    ...extras,
  };
}

function buildSourceEntries(assembly: ReturnType<typeof loadAssembly>) {
  return [
    sourceEntry('source_root', assembly.source_root.path, assembly.source_root.ref),
    ...assembly.generated_array_fields.flatMap((field) =>
      field.order.map((itemRef, index) => {
        const itemPath = path.resolve(field.source_dir.path, itemRef);
        if (!itemPath.startsWith(`${field.source_dir.path}${path.sep}`)) {
          throw shape('Generated array item refs must stay inside source_dir_ref.', {
            field: field.field,
            item_ref: itemRef,
          });
        }
        return sourceEntry('generated_array_item', itemPath, `${field.source_dir.ref}/${itemRef}`, {
          field: field.field,
          order_index: index,
        });
      }),
    ),
  ];
}

function sourceDigest(sourceEntries: ReturnType<typeof buildSourceEntries>) {
  return sha256Bytes(jsonText(sourceEntries.map((entry) => ({
    role: entry.role,
    ref: entry.ref,
    sha256: entry.sha256,
    field: 'field' in entry ? entry.field : undefined,
    order_index: 'order_index' in entry ? entry.order_index : undefined,
  }))));
}

function buildAggregate(assembly: ReturnType<typeof loadAssembly>, digest: string) {
  const root = readJsonFile(assembly.source_root.path);
  const aggregate: JsonRecord = {
    ...root,
  };
  for (const field of assembly.generated_array_fields) {
    aggregate[field.field] = field.order.map((itemRef) => {
      const itemPath = path.resolve(field.source_dir.path, itemRef);
      return readJsonFile(itemPath);
    });
  }
  aggregate.generated_by = {
    surface_kind: 'opl_pack_bundle_generated_metadata',
    generator: 'opl_pack_bundle.v1',
    assembly_ref: path.relative(path.dirname(assembly.aggregate.path), assembly.path).replaceAll(path.sep, '/'),
    source_digest: digest,
    source_entry_count: buildSourceEntries(assembly).length,
    do_not_edit: true,
  };
  return aggregate;
}

function buildManifestRecord(assemblyPath: string) {
  const assembly = loadAssembly(assemblyPath);
  const entries = buildSourceEntries(assembly);
  const digest = sourceDigest(entries);
  const aggregate = buildAggregate(assembly, digest);
  const aggregateText = jsonText(aggregate);
  const expectedAggregateSha256 = sha256Bytes(aggregateText);
  return {
    assembly,
    aggregate,
    aggregateText,
    expectedAggregateSha256,
    manifest: {
      surface_kind: 'opl_pack_bundle_manifest',
      schema_version: 1,
      bundle_id: assembly.bundle_id,
      owner: assembly.owner,
      state: assembly.state,
      assembly_ref: path.relative(path.dirname(assembly.manifest.path), assembly.path).replaceAll(path.sep, '/'),
      source_root_ref: assembly.source_root.ref,
      source_digest: digest,
      source_entries: entries,
      generated_artifact: {
        aggregate_ref: assembly.aggregate.ref,
        expected_sha256: expectedAggregateSha256,
        manifest_ref: assembly.manifest.ref,
        aggregate_is_generated_consumer_surface: true,
        do_not_edit: true,
      },
      generated_array_fields: assembly.generated_array_fields.map((field) => ({
        field: field.field,
        source_dir_ref: field.source_dir.ref,
        order: field.order,
      })),
      commands: assembly.commands,
      authority_boundary: assembly.authority_boundary,
      not_claims: NOT_CLAIMS,
    },
  };
}

function writeJsonFile(outputPath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonText(payload));
  return {
    path: outputPath,
    sha256: sha256File(outputPath),
    status: 'written',
  };
}

function checkMatches(checkId: string, actual: string | null, expected: string) {
  return {
    check_id: checkId,
    status: actual === expected ? 'pass' : 'fail',
    expected_sha256: expected,
    actual_sha256: actual,
  };
}

function optionalFileSha256(filePath: string) {
  return fs.existsSync(filePath) ? sha256File(filePath) : null;
}

export function buildPackBundleManifest(assemblyPath: string) {
  const { manifest } = buildManifestRecord(assemblyPath);
  return {
    version: 'g2',
    pack_bundle_manifest: manifest,
  };
}

export function writePackBundleAggregate(assemblyPath: string) {
  const { assembly, aggregate, manifest } = buildManifestRecord(assemblyPath);
  const aggregateOutput = writeJsonFile(assembly.aggregate.path, aggregate);
  const manifestOutput = writeJsonFile(assembly.manifest.path, manifest);
  return {
    version: 'g2',
    pack_bundle_write: {
      surface_kind: 'opl_pack_bundle_write',
      contract_ref: 'contracts/opl-framework/pack-bundle-contract.json',
      status: 'written',
      bundle_id: assembly.bundle_id,
      aggregate_output: aggregateOutput,
      manifest_output: manifestOutput,
      manifest,
      authority_boundary: assembly.authority_boundary,
      not_claims: NOT_CLAIMS,
    },
  };
}

export function buildPackBundleValidation(assemblyPath: string) {
  const { assembly, aggregateText, expectedAggregateSha256, manifest } = buildManifestRecord(assemblyPath);
  const actualAggregateSha256 = optionalFileSha256(assembly.aggregate.path);
  const actualManifestSha256 = optionalFileSha256(assembly.manifest.path);
  const expectedManifestSha256 = sha256Bytes(jsonText(manifest));
  const checks = [
    {
      check_id: 'assembly_loaded',
      status: 'pass',
      assembly_ref: assembly.path,
    },
    {
      check_id: 'source_entries_hashed',
      status: 'pass',
      source_digest: manifest.source_digest,
      source_entry_count: manifest.source_entries.length,
    },
    checkMatches('aggregate_matches_source', actualAggregateSha256, expectedAggregateSha256),
    checkMatches('manifest_matches_source', actualManifestSha256, expectedManifestSha256),
  ];
  const status = checks.every((entry) => entry.status === 'pass')
    ? 'valid'
    : actualAggregateSha256 === null
      ? 'missing_generated_aggregate'
      : 'drift_detected';
  return {
    version: 'g2',
    pack_bundle_validation: {
      surface_kind: 'opl_pack_bundle_validation',
      contract_ref: 'contracts/opl-framework/pack-bundle-contract.json',
      status,
      bundle_id: assembly.bundle_id,
      aggregate_ref: assembly.aggregate.ref,
      aggregate_path: assembly.aggregate.path,
      expected_aggregate_sha256: expectedAggregateSha256,
      expected_aggregate_bytes: Buffer.byteLength(aggregateText),
      checks,
      manifest,
      authority_boundary: assembly.authority_boundary,
      not_claims: NOT_CLAIMS,
    },
  };
}

function requireAssemblyArg(args: string[], usageText: string) {
  let assembly: string | null = null;
  const remaining = [...args];
  while (remaining.length > 0) {
    const token = remaining.shift()!;
    if (token === '--assembly') {
      assembly = remaining.shift() ?? null;
      if (!assembly) {
        throw usage(`${usageText} requires a value after --assembly.`, { required: ['--assembly <path>'] });
      }
      continue;
    }
    throw usage(`Unknown pack bundle option: ${token}.`, { token, usage: usageText });
  }
  if (!assembly) {
    throw usage(`${usageText} requires --assembly <path>.`, { required: ['--assembly <path>'] });
  }
  return assembly;
}

export function runPackBundleManifestCommand(args: string[]) {
  return buildPackBundleManifest(requireAssemblyArg(args, 'opl pack bundle manifest --assembly <path>'));
}

export function runPackBundleWriteCommand(args: string[]) {
  return writePackBundleAggregate(requireAssemblyArg(args, 'opl pack bundle write --assembly <path>'));
}

export function runPackBundleCheckCommand(args: string[]) {
  return buildPackBundleValidation(requireAssemblyArg(args, 'opl pack bundle check --assembly <path>'));
}
