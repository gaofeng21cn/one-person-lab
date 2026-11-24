import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError } from '../contract-validation.ts';
import { isRecord } from '../contract-validation.ts';
import { parseJsonText } from '../json-file.ts';
import { resolveStandardAgent } from '../standard-agent-registry.ts';
import type { StandardAgentDescriptorInterface, StandardAgentDispatchEvidenceProjection, StandardAgentInterface } from '../standard-agent-interface-types.ts';
import { STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH } from './constants.ts';
import { invalid, stringValue, stringArray, assertKnownKeys } from './validation-values.ts';
import { taskProvider } from './task-views.ts';
import { parseStandardAgentInterface } from './declaration.ts';

function descriptorInterfacePayload(
  repoDir: string,
  descriptorPath: string,
  descriptor: Record<string, unknown>,
) {
  const declared = descriptor.standard_agent_interface;
  if (declared === undefined) return null;
  if (
    isRecord(declared)
    && declared.ref_kind === 'repo_json_pointer'
    && typeof declared.ref === 'string'
  ) {
    const [relativePath, pointer = ''] = declared.ref.split('#', 2);
    const interfacePath = path.resolve(repoDir, relativePath);
    const resolvedRepoDir = path.resolve(repoDir);
    if (interfacePath !== resolvedRepoDir && !interfacePath.startsWith(`${resolvedRepoDir}${path.sep}`)) {
      invalid('Standard Agent interface ref must stay inside the domain repo.', descriptorPath, {
        ref: declared.ref,
      });
    }
    if (!fs.existsSync(interfacePath)) {
      invalid('Standard Agent interface ref does not resolve to a file.', descriptorPath, {
        ref: declared.ref,
      });
    }
    let payload: unknown = parseJsonText(fs.readFileSync(interfacePath, 'utf8'));
    for (const segment of pointer.replace(/^\//, '').split('/').filter(Boolean)) {
      const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!isRecord(payload) || !(key in payload)) {
        invalid('Standard Agent interface JSON pointer does not resolve.', descriptorPath, {
          ref: declared.ref,
          segment: key,
        });
      }
      payload = payload[key];
    }
    return { payload, source_ref: `${interfacePath}#${pointer}` };
  }
  return { payload: declared, source_ref: `${descriptorPath}#/standard_agent_interface` };
}

export function readStandardAgentDescriptorInterface(repoDir: string): StandardAgentDescriptorInterface | null {
  const descriptorPath = path.join(repoDir, STANDARD_AGENT_DESCRIPTOR_RELATIVE_PATH);
  if (!fs.existsSync(descriptorPath)) return null;
  const descriptor = parseJsonText(fs.readFileSync(descriptorPath, 'utf8'));
  if (!isRecord(descriptor)) return null;
  const resolved = descriptorInterfacePayload(repoDir, descriptorPath, descriptor);
  if (!resolved) return null;
  const parsedInterface = parseStandardAgentInterface(resolved.payload, resolved.source_ref);
  const parsedTaskProvider = taskProvider(descriptor.task_provider, descriptorPath);
  const kind = descriptor.kind === undefined || descriptor.kind === null
    ? null
    : descriptor.kind === 'agent'
      ? 'agent'
      : invalid('Standard Agent descriptor kind must be agent.', descriptorPath, { kind: descriptor.kind });
  const agentId = descriptor.agent_id === undefined || descriptor.agent_id === null
    ? null
    : stringValue(descriptor.agent_id, 'agent_id', descriptorPath);
  const packageId = descriptor.package_id === undefined || descriptor.package_id === null
    ? agentId
    : stringValue(descriptor.package_id, 'package_id', descriptorPath);
  return {
    repo_dir: path.resolve(repoDir),
    kind,
    agent_id: agentId,
    package_id: packageId,
    domain_id: stringValue(descriptor.domain_id, 'domain_id', descriptorPath),
    display_name: descriptor.domain_label === undefined || descriptor.domain_label === null
      ? null
      : stringValue(descriptor.domain_label, 'domain_label', descriptorPath),
    task_provider: parsedTaskProvider,
    dispatch_evidence_projection: dispatchEvidenceProjection(descriptor.dispatch_evidence_projection, descriptorPath),
    interface: parsedTaskProvider?.views.length
      ? { ...parsedInterface, domain_detail_views: parsedTaskProvider.views }
      : parsedInterface,
  };
}

function dispatchEvidenceProjection(value: unknown, sourceRef: string): StandardAgentDispatchEvidenceProjection | null {
  if (value === undefined) return null;
  if (!isRecord(value)) invalid('Dispatch evidence projection must be an object.', sourceRef);
  assertKnownKeys(value, ['work_item_id_field', 'result_collections'], 'dispatch_evidence_projection', sourceRef);
  const fieldName = (value: unknown) => {
    const field = stringValue(value, 'dispatch_evidence_projection.field', sourceRef);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) || ['constructor', 'prototype'].includes(field)) {
      invalid('Dispatch evidence projection must use plain JSON field names.', sourceRef, { field });
    }
    return field;
  };
  const collections = value.result_collections ?? [];
  if (!Array.isArray(collections)) invalid('Dispatch evidence result_collections must be an array.', sourceRef);
  return {
    work_item_id_field: fieldName(value.work_item_id_field),
    result_collections: collections.map((entry) => {
      if (!isRecord(entry) || !isRecord(entry.ref_fields)) invalid('Dispatch evidence collection requires ref_fields.', sourceRef);
      assertKnownKeys(entry, ['field', 'ref_fields'], 'dispatch_evidence_projection.result_collections', sourceRef);
      assertKnownKeys(entry.ref_fields, ['domain_receipt_refs', 'typed_blocker_refs', 'owner_chain_refs'], 'dispatch_evidence_projection.ref_fields', sourceRef);
      return {
        field: fieldName(entry.field),
        ref_fields: Object.fromEntries(Object.entries(entry.ref_fields).map(([key, fields]) => [
          key, stringArray(fields, `dispatch_evidence_projection.ref_fields.${key}`, sourceRef).map(fieldName),
        ])),
      };
    }),
  };
}

export function readStandardAgentInterface(repoDir: string): StandardAgentInterface | null {
  return readStandardAgentDescriptorInterface(repoDir)?.interface ?? null;
}

function normalizedIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function assertStandardAgentDescriptorIdentity(
  descriptor: StandardAgentDescriptorInterface,
  expected: { project: string; domain_id?: string | null },
) {
  const registryEntry = resolveStandardAgent(expected.domain_id ?? '')
    ?? resolveStandardAgent(expected.project);
  const accepted = [
    expected.project,
    expected.domain_id ?? '',
    ...(registryEntry
      ? [
          registryEntry.agent_id,
          registryEntry.domain_id,
          registryEntry.target_domain_id,
          registryEntry.project,
          registryEntry.plugin_name,
          registryEntry.canonical_plugin_name,
          ...registryEntry.aliases,
        ]
      : []),
  ].map(normalizedIdentity).filter(Boolean);
  if (![descriptor.domain_id, descriptor.agent_id ?? '', descriptor.package_id ?? '']
    .map(normalizedIdentity)
    .some((identity) => accepted.includes(identity))) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Standard Agent descriptor identity does not match the selected project.',
      {
        descriptor_domain_id: descriptor.domain_id,
        expected_project: expected.project,
        expected_domain_id: expected.domain_id ?? null,
        repo_dir: descriptor.repo_dir,
      },
    );
  }
  return descriptor;
}
