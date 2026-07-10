import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  readJsonFile,
  sha256File,
  shape,
  type JsonRecord,
} from './pack-os-parts/descriptor.ts';

export const PACK_NATIVE_HELPER_PROBE_CONTRACT_REF =
  'contracts/opl-framework/pack-native-helper-probe-contract.json';

const DESCRIPTOR_KIND = 'opl_pack_native_helper_probe_descriptor';
const RECEIPT_KIND = 'opl_pack_native_helper_probe_receipt';
const AUTHORITY_FALSE_FIELDS = [
  'can_write_domain_truth',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_authorize_quality_verdict',
  'can_authorize_export_readiness',
  'can_claim_domain_ready',
  'can_claim_production_ready',
] as const;

function requireString(record: JsonRecord, field: string) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw shape(`native_helper_descriptor.${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function requireStringArray(record: JsonRecord, field: string) {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw shape(`native_helper_descriptor.${field} must be an array.`, { field });
  }
  const result = value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw shape(`native_helper_descriptor.${field}[] must contain non-empty strings.`, {
        field: `${field}[${index}]`,
      });
    }
    return entry.trim();
  });
  if (new Set(result).size !== result.length) {
    throw shape(`native_helper_descriptor.${field} must not contain duplicates.`, { field });
  }
  return result;
}

function authorityBoundary(record: JsonRecord) {
  const value = record.authority_boundary;
  if (!isRecord(value)) {
    throw shape('native_helper_descriptor.authority_boundary must be an object.', {
      field: 'authority_boundary',
    });
  }
  const unknownFields = Object.keys(value).filter(
    (field) => !AUTHORITY_FALSE_FIELDS.includes(field as (typeof AUTHORITY_FALSE_FIELDS)[number]),
  );
  if (unknownFields.length > 0) {
    throw shape('native_helper_descriptor.authority_boundary contains unknown fields.', {
      fields: unknownFields,
    });
  }
  for (const field of AUTHORITY_FALSE_FIELDS) {
    if (value[field] !== false) {
      throw shape(`native_helper_descriptor.authority_boundary.${field} must be false.`, {
        field: `authority_boundary.${field}`,
      });
    }
  }
  return Object.fromEntries(AUTHORITY_FALSE_FIELDS.map((field) => [field, false]));
}

function resolveEntrypoint(descriptorDir: string, entrypointRef: string) {
  if (path.isAbsolute(entrypointRef)) {
    throw shape('native_helper_descriptor.entrypoint_ref must stay inside the descriptor directory.', {
      entrypoint_ref: entrypointRef,
    });
  }
  const entrypointPath = path.resolve(descriptorDir, entrypointRef);
  const relative = path.relative(descriptorDir, entrypointPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw shape('native_helper_descriptor.entrypoint_ref must stay inside the descriptor directory.', {
      entrypoint_ref: entrypointRef,
    });
  }
  if (!fs.existsSync(entrypointPath)) {
    return { status: 'missing' as const, path: entrypointPath, sha256: null };
  }
  const realDescriptorDir = fs.realpathSync(descriptorDir);
  const realEntrypointPath = fs.realpathSync(entrypointPath);
  const realRelative = path.relative(realDescriptorDir, realEntrypointPath);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw shape('native_helper_descriptor.entrypoint_ref must stay inside the descriptor directory.', {
      entrypoint_ref: entrypointRef,
    });
  }
  if (!fs.statSync(entrypointPath).isFile()) {
    throw shape('native_helper_descriptor.entrypoint_ref must resolve to a file.', {
      entrypoint_ref: entrypointRef,
    });
  }
  return { status: 'resolved' as const, path: entrypointPath, sha256: sha256File(entrypointPath) };
}

function executable(candidate: string) {
  try {
    if (!fs.statSync(candidate).isFile()) {
      return false;
    }
    fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandCandidates(command: string, descriptorDir: string) {
  if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    return [path.isAbsolute(command) ? command : path.resolve(descriptorDir, command)];
  }
  const extensions = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')]
    : [''];
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => extensions.map((extension) => path.join(directory, `${command}${extension}`)));
}

function probeCommand(command: string, descriptorDir: string) {
  const resolvedPath = commandCandidates(command, descriptorDir).find(executable) ?? null;
  return {
    command,
    status: resolvedPath ? 'resolved' as const : 'missing' as const,
    resolved_path: resolvedPath ? fs.realpathSync(resolvedPath) : null,
  };
}

function parseDescriptor(descriptorPath: string) {
  const resolvedPath = path.resolve(descriptorPath);
  const descriptor = readJsonFile(resolvedPath);
  if (descriptor.surface_kind !== DESCRIPTOR_KIND) {
    throw shape(`native_helper_descriptor.surface_kind must be ${DESCRIPTOR_KIND}.`, {
      surface_kind: descriptor.surface_kind,
    });
  }
  if (descriptor.schema_version !== 1) {
    throw shape('native_helper_descriptor.schema_version must be 1.', {
      schema_version: descriptor.schema_version,
    });
  }
  const entrypointRef = requireString(descriptor, 'entrypoint_ref');
  return {
    descriptor_path: resolvedPath,
    descriptor_sha256: sha256File(resolvedPath),
    helper_id: requireString(descriptor, 'helper_id'),
    owner: requireString(descriptor, 'owner'),
    entrypoint_ref: entrypointRef,
    entrypoint: resolveEntrypoint(path.dirname(resolvedPath), entrypointRef),
    runtime_command: requireString(descriptor, 'runtime_command'),
    required_commands: requireStringArray(descriptor, 'required_commands'),
    authority_boundary: authorityBoundary(descriptor),
  };
}

export function buildPackNativeHelperProbeReceipt(descriptorPath: string) {
  const descriptor = parseDescriptor(descriptorPath);
  const descriptorDir = path.dirname(descriptor.descriptor_path);
  const runtimeCommandProbe = probeCommand(descriptor.runtime_command, descriptorDir);
  const requiredCommandProbes = descriptor.required_commands.map((command) => probeCommand(command, descriptorDir));
  const missingRequirements = [
    ...(descriptor.entrypoint.status === 'missing' ? [`entrypoint_ref:${descriptor.entrypoint_ref}`] : []),
    ...(runtimeCommandProbe.status === 'missing' ? [`runtime_command:${descriptor.runtime_command}`] : []),
    ...requiredCommandProbes
      .filter((probe) => probe.status === 'missing')
      .map((probe) => `required_command:${probe.command}`),
  ];
  return {
    surface_kind: RECEIPT_KIND,
    schema_version: 1,
    contract_ref: PACK_NATIVE_HELPER_PROBE_CONTRACT_REF,
    status: missingRequirements.length === 0 ? 'resolved' as const : 'missing' as const,
    helper_id: descriptor.helper_id,
    owner: descriptor.owner,
    descriptor_ref: descriptor.descriptor_path,
    descriptor_sha256: descriptor.descriptor_sha256,
    entrypoint_ref: descriptor.entrypoint_ref,
    content_sha256: descriptor.entrypoint.sha256,
    entrypoint_probe: descriptor.entrypoint,
    runtime_command_probe: runtimeCommandProbe,
    required_command_probes: requiredCommandProbes,
    missing_requirements: missingRequirements,
    authority_boundary: descriptor.authority_boundary,
  };
}

function parseProbeArgs(args: string[]) {
  if (args.length !== 2 || args[0] !== '--descriptor' || !args[1]) {
    throw new FrameworkContractError('cli_usage_error', 'pack native-helper probe requires exactly --descriptor <path>.', {
      usage: 'opl pack native-helper probe --descriptor <path>',
    });
  }
  return args[1];
}

export function runPackNativeHelperProbeCommand(args: string[]) {
  return {
    pack_native_helper_probe_receipt: buildPackNativeHelperProbeReceipt(parseProbeArgs(args)),
  };
}
