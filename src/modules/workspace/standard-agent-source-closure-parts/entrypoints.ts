import fs from 'node:fs';
import path from 'node:path';

import {
  OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID,
  resolveStandardAgentExecutionProfile,
} from '../../pack/index.ts';
import type { SourceClosureEntrypoint, SourceClosureLanguage } from './types.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function readJson(repoDir: string, relativePath: string): JsonRecord {
  try {
    return record(JSON.parse(fs.readFileSync(path.join(repoDir, relativePath), 'utf8')));
  } catch {
    return {};
  }
}

function sourceLanguage(file: string | null, moduleName: string | null): SourceClosureLanguage | null {
  if (moduleName) {
    return 'python';
  }
  if (file && /\.[cm]?[jt]sx?$/.test(file)) {
    return 'typescript';
  }
  if (file?.endsWith('.py')) {
    return 'python';
  }
  return null;
}

function normalizedFile(value: string) {
  return value.replace(/^\.\//, '').split(path.sep).join('/');
}

function sourceFileForDeclaredPath(declared: string, activeFiles: Set<string>) {
  const normalized = normalizedFile(declared);
  const candidates = [normalized];
  const withoutNodePrefix = normalized.replace(/^node:/, '');
  if (withoutNodePrefix !== normalized) {
    candidates.push(withoutNodePrefix);
  }
  if (normalized.includes('/dist/')) {
    candidates.push(normalized.replace('/dist/', '/src/'));
  }
  if (normalized.startsWith('dist/')) {
    candidates.push(`src/${normalized.slice('dist/'.length)}`);
  }
  for (const candidate of [...candidates]) {
    const extension = path.extname(candidate);
    if (extension) {
      const stem = candidate.slice(0, -extension.length);
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.mjs`, `${stem}.cjs`, `${stem}.py`);
    } else {
      candidates.push(`${candidate}.ts`, `${candidate}.js`, `${candidate}.py`, `${candidate}/index.ts`);
    }
  }
  return candidates.find((candidate) => activeFiles.has(candidate)) ?? normalized;
}

type SourceClosureEntrypointInput = Omit<
  SourceClosureEntrypoint,
  'language' | 'resolution_status' | 'resolved_symbol_id'
> & {
  hosted_binding_verified?: boolean;
};

function entrypoint(input: SourceClosureEntrypointInput): SourceClosureEntrypoint {
  const { hosted_binding_verified: hostedBindingVerified = false, ...entry } = input;
  return {
    ...entry,
    language: sourceLanguage(entry.file, entry.module_name),
    resolution_status: hostedBindingVerified
      ? 'resolved'
      : entry.hosted_by_opl
        ? 'hosted_declaration_unverified'
        : 'unresolved',
    resolved_symbol_id: null,
  };
}

function commandBinding(
  command: string,
  packageScripts: JsonRecord,
  activeFiles: Set<string>,
): Pick<SourceClosureEntrypoint, 'file' | 'module_name' | 'symbol' | 'hosted_by_opl'> {
  const trimmed = command.trim();
  if (trimmed.startsWith('opl://') || /^opl(?:\s|$)/.test(trimmed)) {
    return { file: null, module_name: null, symbol: null, hosted_by_opl: true };
  }
  const npmScript = trimmed.match(/^(?:npm|pnpm|yarn)\s+(?:run\s+)?([\w:.-]+)/);
  if (npmScript) {
    const nested = packageScripts[npmScript[1]];
    if (typeof nested === 'string' && nested !== command) {
      return commandBinding(nested, packageScripts, activeFiles);
    }
  }
  const pythonCallable = trimmed.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/);
  if (pythonCallable) {
    return {
      file: null,
      module_name: pythonCallable[1],
      symbol: pythonCallable[2],
      hosted_by_opl: false,
    };
  }
  const fileCommand = trimmed.match(/^(?:node(?:\s+--[^\s]+)*|python\d*|python3|bash|sh)\s+([^\s]+)/);
  const directPath = fileCommand?.[1]
    ?? (/^(?:\.\/|src\/|apps\/|packages\/|scripts\/|python\/)[^\s]+/.test(trimmed)
      ? trimmed.split(/\s+/)[0]
      : null);
  if (directPath) {
    return {
      file: sourceFileForDeclaredPath(directPath, activeFiles),
      module_name: null,
      symbol: '<module>',
      hosted_by_opl: false,
    };
  }
  return { file: null, module_name: null, symbol: null, hosted_by_opl: false };
}

function referencedHandlerRegistryPaths(...documents: JsonRecord[]) {
  const refs = new Set<string>([
    'contracts/domain_handler_registry.json',
  ]);
  const visit = (value: unknown, key = '') => {
    if (typeof value === 'string' && key.includes('handler') && key.includes('registry')) {
      refs.add(value.split('#')[0]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey.toLowerCase()));
    }
  };
  documents.forEach((document) => visit(document));
  return [...refs];
}

function registryHandlers(registry: JsonRecord): JsonRecord[] {
  const handlers = registry.handlers;
  if (Array.isArray(handlers)) {
    return handlers.map(record);
  }
  return Object.entries(record(handlers)).map(([handlerId, value]) => ({
    handler_id: handlerId,
    ...record(value),
  } as JsonRecord));
}

function packageExportTargets(value: unknown, pointer: string[] = []): Array<{
  pointer: string[];
  target: string;
}> {
  if (typeof value === 'string') {
    return value.endsWith('.d.ts') ? [] : [{ pointer, target: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => packageExportTargets(item, [...pointer, String(index)]));
  }
  return Object.entries(record(value)).flatMap(([key, child]) => (
    key === 'types' ? [] : packageExportTargets(child, [...pointer, key])
  ));
}

export function discoverSourceClosureEntrypoints(
  repoDir: string,
  activeSourceFiles: string[],
  pyprojectScripts: Record<string, string>,
  repoFilePaths: string[] = activeSourceFiles,
) {
  const activeFiles = new Set(activeSourceFiles);
  const packageJson = readJson(repoDir, 'package.json');
  const packageScripts = record(packageJson.scripts);
  const actionCatalog = readJson(repoDir, 'contracts/action_catalog.json');
  const domainDescriptor = readJson(repoDir, 'contracts/domain_descriptor.json');
  const entries: SourceClosureEntrypoint[] = [];

  const packageManifestPaths = repoFilePaths
    .filter((file) => file === 'package.json' || file.endsWith('/package.json'))
    .sort((left, right) => left.localeCompare(right));
  for (const manifestPath of packageManifestPaths) {
    const manifest = manifestPath === 'package.json'
      ? packageJson
      : readJson(repoDir, manifestPath);
    const bins = typeof manifest.bin === 'string'
      ? { [typeof manifest.name === 'string' ? manifest.name : 'default']: manifest.bin }
      : record(manifest.bin);
    for (const [name, value] of Object.entries(bins)) {
      if (typeof value !== 'string') {
        continue;
      }
      const manifestDir = path.posix.dirname(manifestPath);
      const declaredBin = manifestDir === '.'
        ? value
        : path.posix.join(manifestDir, value);
      const binding = commandBinding(`node ${declaredBin}`, packageScripts, activeFiles);
      entries.push(entrypoint({
        entrypoint_id: manifestPath === 'package.json'
          ? `package_bin:${name}`
          : `package_bin:${manifestPath}#${name}`,
        source_kind: 'package_bin',
        declared_ref: `${manifestPath}#/bin/${name}`,
        ...binding,
        action_id: null,
      }));
    }

    for (const exported of packageExportTargets(manifest.exports)) {
      const manifestDir = path.posix.dirname(manifestPath);
      const declaredExport = manifestDir === '.'
        ? exported.target
        : path.posix.join(manifestDir, exported.target);
      const file = sourceFileForDeclaredPath(declaredExport, activeFiles);
      const exportId = exported.pointer.length > 0 ? exported.pointer.join('/') : '.';
      const exportPointer = exported.pointer.length > 0
        ? `/exports/${exported.pointer.join('/')}`
        : '/exports';
      entries.push(entrypoint({
        entrypoint_id: `package_export:${manifestPath}#${exportId}`,
        source_kind: 'package_export',
        declared_ref: `${manifestPath}#${exportPointer}`,
        file,
        module_name: null,
        symbol: '<module>',
        hosted_by_opl: false,
        action_id: null,
      }));
    }
  }

  for (const [name, callable] of Object.entries(pyprojectScripts)) {
    const binding = commandBinding(callable, packageScripts, activeFiles);
    entries.push(entrypoint({
      entrypoint_id: `pyproject_script:${name}`,
      source_kind: 'pyproject_script',
      declared_ref: `pyproject.toml#[project.scripts].${name}`,
      ...binding,
      action_id: null,
    }));
  }

  const registeredHandlers = referencedHandlerRegistryPaths(actionCatalog, domainDescriptor)
    .flatMap((registryPath) => registryHandlers(readJson(repoDir, registryPath)).map((handler) => {
      const handlerId = typeof handler.handler_id === 'string' ? handler.handler_id : '<missing-handler-id>';
      const binding = record(handler.binding);
      const kind = typeof binding.kind === 'string'
        ? binding.kind
        : typeof handler.kind === 'string'
          ? handler.kind
          : null;
      const fileValue = typeof binding.file === 'string'
        ? binding.file
        : typeof handler.file === 'string'
          ? handler.file
          : null;
      const moduleName = typeof binding.module === 'string'
        ? binding.module
        : typeof handler.module === 'string'
          ? handler.module
          : null;
      const symbol = typeof binding.export === 'string'
        ? binding.export
        : typeof binding.callable === 'string'
          ? binding.callable
          : typeof handler.export === 'string'
            ? handler.export
            : typeof handler.callable === 'string'
              ? handler.callable
              : null;
      return {
        handler_id: handlerId,
        registry_path: registryPath,
        file: fileValue ? sourceFileForDeclaredPath(fileValue, activeFiles) : null,
        module_name: kind === 'python_callable' || (!fileValue && moduleName) ? moduleName : null,
        symbol,
        hosted_by_opl: false,
      };
    }));

  const actions = Array.isArray(actionCatalog.actions) ? actionCatalog.actions.map(record) : [];
  const foundryExecutionProfile = actions.some((action) => (
    record(action.execution_binding).kind === 'foundry_binding'
  ))
    ? resolveStandardAgentExecutionProfile(repoDir)
    : null;
  for (const action of actions) {
    const actionId = typeof action.action_id === 'string' ? action.action_id : '<missing-action-id>';
    const executionBinding = record(action.execution_binding);
    const bindingKind = typeof executionBinding.kind === 'string' ? executionBinding.kind : null;
    if (bindingKind === 'handler_ref') {
      const handlerRef = typeof executionBinding.handler_ref === 'string'
        ? executionBinding.handler_ref
        : '';
      const handlerId = handlerRef.startsWith('handler:')
        ? handlerRef.slice('handler:'.length)
        : '';
      const registered = registeredHandlers.find((handler) => handler.handler_id === handlerId);
      entries.push(entrypoint({
        entrypoint_id: `action_handler:${actionId}`,
        source_kind: 'action_catalog',
        declared_ref: `contracts/action_catalog.json#/actions/${actionId}/execution_binding/handler_ref`,
        file: registered?.file ?? null,
        module_name: registered?.module_name ?? null,
        symbol: registered?.symbol ?? null,
        hosted_by_opl: false,
        action_id: actionId,
      }));
      continue;
    }
    if (bindingKind === 'stage_binding') {
      const stageManifestRef = typeof executionBinding.stage_manifest_ref === 'string'
        ? normalizedFile(executionBinding.stage_manifest_ref)
        : '';
      const hostedBindingVerified = stageManifestRef === 'agent/stages/manifest.json'
        && repoFilePaths.includes(stageManifestRef);
      entries.push(entrypoint({
        entrypoint_id: `action_catalog:${actionId}`,
        source_kind: 'action_catalog',
        declared_ref: `contracts/action_catalog.json#/actions/${actionId}/execution_binding/stage_manifest_ref`,
        file: null,
        module_name: null,
        symbol: null,
        hosted_by_opl: true,
        hosted_binding_verified: hostedBindingVerified,
        action_id: actionId,
      }));
      continue;
    }
    if (bindingKind === 'foundry_binding') {
      const providerManifestRef = typeof executionBinding.provider_manifest_ref === 'string'
        ? normalizedFile(executionBinding.provider_manifest_ref)
        : '';
      const providerValidation = foundryExecutionProfile?.provider_manifest_validation;
      const hostedBindingVerified =
        foundryExecutionProfile?.selected_profile_id === OPL_HOSTED_FOUNDRY_SEMANTIC_PROVIDER_PROFILE_ID
        && foundryExecutionProfile.action_catalog_validation.status === 'passed'
        && providerValidation?.status === 'passed'
        && typeof providerValidation.manifest_ref === 'string'
        && normalizedFile(providerValidation.manifest_ref) === providerManifestRef
        && !foundryExecutionProfile.blockers.some((blocker) => (
          blocker.startsWith('hosted_foundry_provider_')
        ));
      entries.push(entrypoint({
        entrypoint_id: `action_catalog:${actionId}`,
        source_kind: 'action_catalog',
        declared_ref: `contracts/action_catalog.json#/actions/${actionId}/execution_binding/provider_manifest_ref`,
        file: null,
        module_name: null,
        symbol: null,
        hosted_by_opl: true,
        hosted_binding_verified: hostedBindingVerified,
        action_id: actionId,
      }));
      continue;
    }
    entries.push(entrypoint({
      entrypoint_id: `action_catalog:${actionId}`,
      source_kind: 'action_catalog',
      declared_ref: `contracts/action_catalog.json#/actions/${actionId}/execution_binding`,
      file: null,
      module_name: null,
      symbol: null,
      hosted_by_opl: false,
      action_id: actionId,
    }));
  }

  for (const handler of registeredHandlers) {
      entries.push(entrypoint({
        entrypoint_id: `handler_registry:${handler.handler_id}`,
        source_kind: 'handler_registry',
        declared_ref: `${handler.registry_path}#/handlers/${handler.handler_id}`,
        file: handler.file,
        module_name: handler.module_name,
        symbol: handler.symbol,
        hosted_by_opl: false,
        action_id: null,
      }));
  }

  for (const descriptorPath of repoFilePaths.filter((file) => file.endsWith('.native-helper-probe.json'))) {
    const descriptor = readJson(repoDir, descriptorPath);
    const entrypointRef = typeof descriptor.entrypoint_ref === 'string'
      ? descriptor.entrypoint_ref
      : null;
    const normalizedEntrypointRef = entrypointRef?.replace(/\\/g, '/') ?? null;
    const entrypointRefIsExact = normalizedEntrypointRef !== null
      && !path.posix.isAbsolute(normalizedEntrypointRef)
      && !normalizedEntrypointRef.split('/').includes('..')
      && !/[*?{}[\]]/.test(normalizedEntrypointRef)
      && !normalizedEntrypointRef.endsWith('/');
    const declaredFile = entrypointRefIsExact
      ? normalizedFile(path.posix.normalize(path.posix.join(
          path.posix.dirname(descriptorPath),
          normalizedEntrypointRef!,
        )))
      : null;
    entries.push(entrypoint({
      entrypoint_id: `native_helper_descriptor:${descriptorPath}`,
      source_kind: 'native_helper_descriptor',
      declared_ref: `${descriptorPath}#/entrypoint_ref`,
      file: declaredFile ? sourceFileForDeclaredPath(declaredFile, activeFiles) : null,
      module_name: null,
      symbol: '<module>',
      hosted_by_opl: false,
      action_id: null,
    }));
  }

  for (const generatedPath of ['contracts/generated_entrypoints.json', 'contracts/generated_entry.json']) {
    const document = readJson(repoDir, generatedPath);
    const generatedEntries = Array.isArray(document.entrypoints)
      ? document.entrypoints.map(record)
      : Object.keys(document).length > 0
        ? [document]
        : [];
    generatedEntries.forEach((generated, index) => {
      const command = typeof generated.command === 'string' ? generated.command : '';
      const binding = commandBinding(command, packageScripts, activeFiles);
      entries.push(entrypoint({
        entrypoint_id: `generated_entry:${index}`,
        source_kind: 'generated_entry',
        declared_ref: `${generatedPath}#/entrypoints/${index}`,
        ...binding,
        action_id: typeof generated.action_id === 'string' ? generated.action_id : null,
      }));
    });
  }

  return [...new Map(entries.map((entry) => [entry.entrypoint_id, entry])).values()]
    .sort((left, right) => left.entrypoint_id.localeCompare(right.entrypoint_id));
}
