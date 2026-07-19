import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import ts from 'typescript';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
  type DomainHandlerRegistry,
} from '../../kernel/family-action-catalog-contract.ts';
import { optionalString, parseJsonText } from '../../kernel/json-file.ts';
import { STANDARD_AGENT_PACK_ABI } from './standard-agent-pack-abi.ts';
import {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  buildFamilyActionStageRouteParity,
  normalizeFamilyStageControlPlane,
  normalizeStageQualityScopeBudget,
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  STANDARD_STAGE_COMPLETION_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  STANDARD_USER_STAGE_LOG_CONTRACT,
  type FamilyStageControlPlane,
  type StageQualityScopeBudget,
} from '../stagecraft/index.ts';
import {
  readStandardAgentQualityRolePromptFile,
  readStandardAgentStagePromptFile,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
} from './standard-agent-stage-prompt.ts';

export { STANDARD_AGENT_STAGE_MANIFEST_REF } from './standard-agent-stage-prompt.ts';

type JsonRecord = Record<string, unknown>;

export const STANDARD_AGENT_DESCRIPTOR_REF = 'contracts/domain_descriptor.json';
export const OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE = {
  profile_id: 'official_high_value_knowledge_deliverable.v1',
  profile_ref: 'contracts/opl-framework/official-knowledge-deliverable-quality-profile.json',
} as const;
const ACTION_CATALOG_REF = 'contracts/action_catalog.json';
const DOMAIN_HANDLER_REGISTRY_REF = 'contracts/domain_handler_registry.json';
const PACK_COMPILER_INPUT_REF = 'contracts/pack_compiler_input.json';
const OWNER_RECEIPT_CONTRACT_REF = 'contracts/owner_receipt_contract.json';
const AUTHORITY_FUNCTION_INVENTORY_REF = 'runtime/authority_functions/README.md';
const STANDARD_STAGE_MANIFEST_SURFACE_KIND = 'opl_standard_agent_declarative_stage_manifest';
const STANDARD_STAGE_MANIFEST_VERSION = 'opl-standard-agent-declarative-stage-manifest.v1';
const TOOL_AFFORDANCE_CATALOG_ROLE = 'available_affordance_catalog_not_workflow_script';
const EFFECT_BOUNDARY_TRUST_LANES = new Set(['ai_decision', 'human_gate', 'external_system']);
const STAGE_CONTRACT_EXTENSION_FORBIDDEN_FIELDS = new Set([
  'requires',
  'ensures',
  'boundary_assumptions',
  'properties',
  'expected_receipt_refs',
  'receipt_schema_refs',
  'authority_function_refs',
  'l4_entry_gate',
  'l5_entry_gate',
  'stage_completion_policy',
  'user_stage_log_contract',
  'progress_delta_policy',
  'typed_blocker_lineage_policy',
  'runtime_event_refs',
]);

export interface StandardAgentStageManifestCompilation {
  stage_control_plane: FamilyStageControlPlane;
  source_binding: {
    plane_id: string;
    canonical_agent_id: string;
    domain_id: string;
    descriptor_ref: string;
    action_catalog_ref: string;
    stage_manifest_ref: string;
    stage_manifest_sha256: string;
  };
}

export type StandardAgentStageQualityPolicy = {
  surface_kind: 'opl_stage_quality_cycle_policy';
  version: 'stage-quality-cycle-policy.v1';
  in_thread_refinement: {
    allowed: boolean;
    authoritative: false;
  };
  formal_review: {
    required: boolean;
    risk_tier: 'low' | 'medium' | 'high';
    review_depth: 'focused' | 'full' | 'multi_axis';
    attempt_internal_parallel_review_facets_allowed: boolean;
    context_isolation_required: true;
    max_repair_rounds: number;
    scope_budget: StageQualityScopeBudget;
  };
  budget_exhaustion: 'complete_with_quality_debt_if_consumable';
};

export type StandardAgentHandoffReviewBoundary = {
  artifact_effect:
    | 'reviewed_immutable_refs_only'
    | 'mechanical_repackaging_of_reviewed_bytes'
    | 'new_or_transformed_reviewable_bytes';
  freezes_canonical_artifact_bytes: boolean;
  issues_quality_export_publication_or_ready_claim: boolean;
  downstream_owner_retains_acceptance: boolean;
};

function handoffRequiresFormalReview(boundary: StandardAgentHandoffReviewBoundary | null) {
  return boundary !== null && (
    boundary.artifact_effect === 'new_or_transformed_reviewable_bytes'
    || boundary.freezes_canonical_artifact_bytes
    || boundary.issues_quality_export_publication_or_ready_claim
  );
}

function handoffAllowsPrimaryOnly(boundary: StandardAgentHandoffReviewBoundary | null) {
  return boundary !== null
    && boundary.artifact_effect !== 'new_or_transformed_reviewable_bytes'
    && !boundary.freezes_canonical_artifact_bytes
    && !boundary.issues_quality_export_publication_or_ready_claim
    && boundary.downstream_owner_retains_acceptance;
}

export type StandardAgentStageQualityRuntimeBinding = {
  surface_kind: 'opl_pack_bound_stage_quality_runtime_binding';
  version: 'opl-pack-bound-stage-quality-runtime-binding.v1';
  stage_id: string;
  declared_stage_ids: string[];
  enabled: boolean;
  stage_role: string | null;
  policy_ref: string;
  stage_prompt_ref: string;
  quality_policy: StandardAgentStageQualityPolicy;
  handoff_review_boundary: StandardAgentHandoffReviewBoundary | null;
  role_prompt_refs: {
    producer: string;
    reviewer: string;
    repairer: string;
    re_reviewer: string;
  };
  quality_rubric_refs: string[];
  stage_goal_refs: string[];
  source_refs: string[];
  lineage_refs: string[];
  manifest_ref: typeof STANDARD_AGENT_STAGE_MANIFEST_REF;
  manifest_sha256: string;
};

function fail(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function record(value: unknown, field: string, repoDir: string) {
  if (!isRecord(value)) {
    fail(`${field} must be a JSON object.`, { repo_dir: repoDir, field });
  }
  return value;
}

function text(value: unknown, field: string, repoDir: string) {
  const resolved = optionalString(value);
  if (!resolved) {
    fail(`${field} must be a non-empty string.`, { repo_dir: repoDir, field });
  }
  return resolved;
}

function stageDisplayNames(value: unknown, title: string, field: string, repoDir: string) {
  if (value === undefined) {
    return { 'en-US': title };
  }
  if (!isRecord(value)) {
    fail(`${field} must be a JSON object.`, { repo_dir: repoDir, field });
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    fail(`${field} must contain at least the en-US entry.`, { repo_dir: repoDir, field });
  }
  for (const [locale, displayName] of entries) {
    if (locale.length === 0 || /\s/.test(locale)) {
      fail(`${field} locale keys must be non-empty and contain no whitespace.`, {
        repo_dir: repoDir,
        field,
        locale,
      });
    }
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      fail(`${field}.${locale} must be a non-empty string.`, {
        repo_dir: repoDir,
        field: `${field}.${locale}`,
      });
    }
  }

  const displayNames = Object.fromEntries(entries) as Record<string, string>;
  if (!Object.hasOwn(displayNames, 'en-US')) {
    fail(`${field} must contain the en-US entry.`, { repo_dir: repoDir, field });
  }
  if (displayNames['en-US'] !== title) {
    fail(`${field}.en-US must exactly match stage.title.`, {
      repo_dir: repoDir,
      field: `${field}.en-US`,
      title,
      display_name: displayNames['en-US'],
    });
  }
  return displayNames;
}

function strings(value: unknown, field: string, repoDir: string) {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array of non-empty strings.`, { repo_dir: repoDir, field });
  }
  return value.map((entry, index) => text(entry, `${field}[${index}]`, repoDir));
}

function optionalStrings(value: unknown, field: string, repoDir: string) {
  return value === undefined ? [] : strings(value, field, repoDir);
}

function repoFile(repoDir: string, value: unknown, field: string) {
  const ref = text(value, field, repoDir);
  if (
    path.posix.isAbsolute(ref)
    || ref.includes('\\')
    || path.posix.normalize(ref) !== ref
    || ref === '..'
    || ref.startsWith('../')
  ) {
    fail(`${field} must be a canonical repo-relative path.`, { repo_dir: repoDir, field, ref });
  }
  const resolved = path.resolve(repoDir, ref);
  const repoRealPath = fs.realpathSync(repoDir);
  if (
    !resolved.startsWith(`${path.resolve(repoDir)}${path.sep}`)
    || !fs.existsSync(resolved)
    || !fs.statSync(resolved).isFile()
    || !fs.realpathSync(resolved).startsWith(`${repoRealPath}${path.sep}`)
  ) {
    fail(`${field} does not resolve inside the standard Agent root.`, { repo_dir: repoDir, field, ref });
  }
  return { ref, resolved };
}

function repoRef(repoDir: string, value: unknown, field: string) {
  const ref = text(value, field, repoDir);
  const fileRef = ref.split('#', 1)[0]!;
  repoFile(repoDir, fileRef, field);
  return ref;
}

function declarationModifiers(node: ts.Node) {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return declarationModifiers(node).some((modifier) => modifier.kind === kind);
}

function typescriptCallableExports(filePath: string) {
  const source = fs.readFileSync(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    throw new Error(`TypeScript handler file has parse errors: ${filePath}`);
  }

  const localCallables = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement)
      && statement.name
      && statement.body
      && !hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
    ) {
      localCallables.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
          && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          localCallables.add(declaration.name.text);
        }
      }
    }
  }

  const exported = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.body || hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
        continue;
      }
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        exported.add('default');
      } else if (statement.name && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exported.add(statement.name.text);
      }
      continue;
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && localCallables.has(declaration.name.text)) {
          exported.add(declaration.name.text);
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      if (statement.moduleSpecifier) {
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        if (localCallables.has(localName)) {
          exported.add(element.name.text);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (
        ts.isArrowFunction(statement.expression)
        || ts.isFunctionExpression(statement.expression)
        || (ts.isIdentifier(statement.expression) && localCallables.has(statement.expression.text))
      ) {
        exported.add('default');
      }
    }
  }
  return exported;
}

const PYTHON_CALLABLE_PROBE = String.raw`
import ast
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    tree = ast.parse(handle.read(), filename=sys.argv[1])

parts = sys.argv[2].split(".")
body = tree.body
resolved = None
for index, part in enumerate(parts):
    resolved = None
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == part:
            resolved = node
            break
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            value = node.value
            if any(isinstance(target, ast.Name) and target.id == part for target in targets) and isinstance(value, ast.Lambda):
                resolved = value
                break
    if resolved is None:
        break
    if index < len(parts) - 1:
        if not isinstance(resolved, ast.ClassDef):
            resolved = None
            break
        body = resolved.body

is_callable = isinstance(resolved, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda))
print(json.dumps({"callable": is_callable}))
`;

function pythonModuleFile(repoDir: string, moduleName: string, field: string) {
  const modulePath = moduleName.split('.').join('/');
  const candidates = [
    `${modulePath}.py`,
    `${modulePath}/__init__.py`,
    `src/${modulePath}.py`,
    `src/${modulePath}/__init__.py`,
  ].filter((candidate) => fs.existsSync(path.resolve(repoDir, candidate)));
  if (candidates.length === 0) {
    fail(`${field}.module does not resolve to a repo-contained Python module.`, {
      repo_dir: repoDir,
      field,
      module: moduleName,
    });
  }
  if (candidates.length > 1) {
    fail(`${field}.module resolves ambiguously inside the standard Agent root.`, {
      repo_dir: repoDir,
      field,
      module: moduleName,
      candidates,
    });
  }
  return repoFile(repoDir, candidates[0], `${field}.module`);
}

function assertPythonCallable(filePath: string, callableName: string, field: string, repoDir: string) {
  const executables = [process.env.PYTHON, 'python3', 'python']
    .filter((entry, index, values): entry is string => Boolean(entry) && values.indexOf(entry) === index);
  for (const executable of executables) {
    const result = spawnSync(executable, ['-I', '-c', PYTHON_CALLABLE_PROBE, filePath, callableName], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
      continue;
    }
    if (result.status !== 0) {
      fail(`${field} could not be parsed as a Python callable.`, {
        repo_dir: repoDir,
        field,
        stderr: result.stderr.trim(),
      });
    }
    let probe: unknown;
    try {
      probe = JSON.parse(result.stdout);
    } catch {
      fail(`${field} Python callable probe returned invalid output.`, { repo_dir: repoDir, field });
    }
    if (!isRecord(probe) || probe.callable !== true) {
      fail(`${field} does not resolve to a callable Python symbol.`, {
        repo_dir: repoDir,
        field,
        callable: callableName,
      });
    }
    return;
  }
  fail(`${field} requires an available Python 3 interpreter for static callable validation.`, {
    repo_dir: repoDir,
    field,
  });
}

function assertDomainHandlerImplementationsResolve(repoDir: string, registry: DomainHandlerRegistry) {
  registry.handlers.forEach((handler, index) => {
    const field = `domain_handler_registry.handlers[${index}].binding`;
    if (handler.binding.kind === 'typescript_export') {
      const file = repoFile(repoDir, handler.binding.file, `${field}.file`);
      const extension = path.extname(file.ref);
      if (
        file.ref.endsWith('.d.ts')
        || file.ref.endsWith('.d.mts')
        || file.ref.endsWith('.d.cts')
        || !['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'].includes(extension)
      ) {
        fail(`${field}.file must be a TypeScript or JavaScript module.`, {
          repo_dir: repoDir,
          field,
          ref: file.ref,
        });
      }
      const exported = typescriptCallableExports(file.resolved);
      if (!exported.has(handler.binding.export)) {
        fail(`${field}.export does not resolve to a callable export in the declared file.`, {
          repo_dir: repoDir,
          field,
          ref: file.ref,
          export: handler.binding.export,
        });
      }
      return;
    }
    const file = pythonModuleFile(repoDir, handler.binding.module, field);
    assertPythonCallable(file.resolved, handler.binding.callable, `${field}.callable`, repoDir);
  });
}

function readJson(repoDir: string, ref: string, field: string) {
  const file = repoFile(repoDir, ref, field);
  const source = fs.readFileSync(file.resolved, 'utf8');
  try {
    return { payload: parseJsonText(source), source };
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Invalid JSON in ${ref}.`, {
      repo_dir: repoDir,
      relative_path: ref,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readJsonPointer(repoDir: string, ref: string, field: string) {
  const [fileRef, fragment = ''] = ref.split('#', 2);
  let value = readJson(repoDir, fileRef!, field).payload;
  if (fragment) {
    if (!fragment.startsWith('/')) {
      fail(`${field} must use a JSON Pointer fragment.`, { repo_dir: repoDir, ref });
    }
    for (const rawToken of fragment.slice(1).split('/')) {
      const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!isRecord(value) || !Object.hasOwn(value, token)) {
        fail(`${field} JSON Pointer does not resolve.`, { repo_dir: repoDir, ref, token });
      }
      value = value[token];
    }
  }
  return value;
}

const QUALITY_ATTEMPT_FORBIDDEN_FIELDS = new Set([
  'next_stage_refs', 'requires', 'ensures', 'stage_route', 'sub_stage_graph',
  'independent_owner', 'stage_current_pointer', 'stage_transition_authority',
]);

function forbiddenQualityAttemptFields(value: unknown, prefix = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenQualityAttemptFields(entry, `${prefix}[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(QUALITY_ATTEMPT_FORBIDDEN_FIELDS.has(key) ? [`${prefix}.${key}`] : []),
    ...forbiddenQualityAttemptFields(entry, `${prefix}.${key}`),
  ]);
}

function exactObjectKeys(value: JsonRecord, expected: string[], field: string, repoDir: string) {
  const received = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (!isDeepStrictEqual(received, sortedExpected)) {
    fail(`${field} fields do not match the Stage quality-cycle schema.`, {
      repo_dir: repoDir,
      expected_fields: sortedExpected,
      received_fields: received,
    });
  }
}

function validateStageQualityCyclePolicy(input: {
  repoDir: string;
  ref: string;
  stageId: string;
  stagePromptRef: string;
  stageRole: string | null;
  handoffReviewBoundary: StandardAgentHandoffReviewBoundary | null;
}) {
  const policy = record(
    readJsonPointer(input.repoDir, input.ref, `stage_quality_cycle_policy:${input.stageId}`),
    `stage_quality_cycle_policy:${input.stageId}`,
    input.repoDir,
  );
  exactObjectKeys(policy, [
    'surface_kind', 'version', 'enabled', 'stage_prompt_ref', 'role_prompt_refs',
    'quality_rubric_refs', 'in_thread_refinement', 'formal_review', 'budget_exhaustion',
    'attempt_boundary',
  ], `stage_quality_cycle_policy:${input.stageId}`, input.repoDir);
  if (
    text(policy.surface_kind, 'stage_quality_cycle_policy.surface_kind', input.repoDir)
      !== 'opl_stage_quality_cycle_policy'
    || text(policy.version, 'stage_quality_cycle_policy.version', input.repoDir)
      !== 'stage-quality-cycle-policy.v1'
  ) {
    fail('Stage quality-cycle policy kind or version is invalid.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (typeof policy.enabled !== 'boolean') {
    fail('Stage quality-cycle policy enabled must be boolean.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const enabled = policy.enabled;
  const policyStagePromptRef = text(policy.stage_prompt_ref, 'stage_quality_cycle_policy.stage_prompt_ref', input.repoDir);
  if (policyStagePromptRef !== input.stagePromptRef) {
    fail('Stage quality-cycle policy must inherit the Stage prompt.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      stage_prompt_ref: input.stagePromptRef,
      policy_stage_prompt_ref: policyStagePromptRef,
    });
  }
  repoRef(input.repoDir, policyStagePromptRef, 'stage_quality_cycle_policy.stage_prompt_ref');
  const rolePrompts = record(policy.role_prompt_refs, 'stage_quality_cycle_policy.role_prompt_refs', input.repoDir);
  exactObjectKeys(rolePrompts, ['producer', 'reviewer', 'repairer', 're_reviewer'],
    'stage_quality_cycle_policy.role_prompt_refs', input.repoDir);
  const normalizedRolePrompts = {
    producer: repoRef(input.repoDir, rolePrompts.producer, 'stage_quality_cycle_policy.role_prompt_refs.producer'),
    reviewer: repoRef(input.repoDir, rolePrompts.reviewer, 'stage_quality_cycle_policy.role_prompt_refs.reviewer'),
    repairer: repoRef(input.repoDir, rolePrompts.repairer, 'stage_quality_cycle_policy.role_prompt_refs.repairer'),
    re_reviewer: repoRef(input.repoDir, rolePrompts.re_reviewer, 'stage_quality_cycle_policy.role_prompt_refs.re_reviewer'),
  };
  for (const promptRef of Object.values(normalizedRolePrompts)) {
    readStandardAgentQualityRolePromptFile(input.repoDir, promptRef);
  }
  const rubricRefs = strings(policy.quality_rubric_refs, 'stage_quality_cycle_policy.quality_rubric_refs', input.repoDir);
  if (rubricRefs.length === 0) {
    fail('Stage quality-cycle policy requires at least one quality rubric ref.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  for (const rubricRef of rubricRefs) {
    repoRef(input.repoDir, rubricRef, 'stage_quality_cycle_policy.quality_rubric_refs');
  }
  const refinement = record(policy.in_thread_refinement, 'stage_quality_cycle_policy.in_thread_refinement', input.repoDir);
  exactObjectKeys(refinement, ['allowed', 'authoritative'],
    'stage_quality_cycle_policy.in_thread_refinement', input.repoDir);
  if (typeof refinement.allowed !== 'boolean' || refinement.authoritative !== false) {
    fail('in_thread_refinement must be non-authoritative.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const formalReview = record(policy.formal_review, 'stage_quality_cycle_policy.formal_review', input.repoDir);
  exactObjectKeys(formalReview, [
    'required', 'risk_tier', 'review_depth', 'context_isolation_required', 'max_repair_rounds',
    ...(Object.hasOwn(formalReview, 'scope_budget') ? ['scope_budget'] : []),
  ], 'stage_quality_cycle_policy.formal_review', input.repoDir);
  const maxRepairRounds = formalReview.max_repair_rounds;
  if (
    typeof formalReview.required !== 'boolean'
    || !['low', 'medium', 'high'].includes(String(formalReview.risk_tier))
    || !['focused', 'full', 'multi_axis'].includes(String(formalReview.review_depth))
    || formalReview.context_isolation_required !== true
    || !Number.isInteger(maxRepairRounds)
    || Number(maxRepairRounds) < 0
    || Number(maxRepairRounds) > 3
  ) {
    fail('formal_review does not match the bounded Stage quality-cycle contract.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (input.stageRole === 'cross_stage_meta_review' && formalReview.required !== false) {
    fail('Cross-stage Meta Review Stage must not recursively require another formal Stage Review.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (formalReview.required === true && !enabled) {
    fail('Required formal Stage Review cannot be disabled at runtime.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'required_formal_review_runtime_disabled',
    });
  }
  if (handoffRequiresFormalReview(input.handoffReviewBoundary) && formalReview.required !== true) {
    fail('Handoff that creates reviewable delivery bytes or issues a ready claim requires formal Stage Review.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'handoff_final_bytes_or_ready_claim_requires_formal_review',
    });
  }
  if (
    input.handoffReviewBoundary !== null
    && formalReview.required === false
    && !handoffAllowsPrimaryOnly(input.handoffReviewBoundary)
  ) {
    fail('Primary-only Handoff is limited to reviewed refs or mechanical repackaging with downstream owner acceptance.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'handoff_primary_only_boundary_invalid',
    });
  }
  if (policy.budget_exhaustion !== 'complete_with_quality_debt_if_consumable') {
    fail('Stage quality-cycle budget exhaustion policy is invalid.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const attemptBoundary = record(policy.attempt_boundary, 'stage_quality_cycle_policy.attempt_boundary', input.repoDir);
  exactObjectKeys(attemptBoundary, [
    'inherits_stage_goal_scope_authority', 'role_overlay_may_only_narrow',
    'controller_creates_next_attempt', 'attempt_is_not_sub_stage',
  ], 'stage_quality_cycle_policy.attempt_boundary', input.repoDir);
  if (Object.values(attemptBoundary).some((value) => value !== true)) {
    fail('Stage quality-cycle attempt boundary flags must all be true.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  const forbiddenFields = forbiddenQualityAttemptFields(policy);
  if (forbiddenFields.length > 0) {
    fail('Stage quality-cycle policy cannot define nested Stage semantics.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      forbidden_fields: forbiddenFields,
    });
  }
  const riskTier = formalReview.risk_tier as StandardAgentStageQualityPolicy['formal_review']['risk_tier'];
  const scopeBudget = normalizeStageQualityScopeBudget(formalReview.scope_budget, {
    legacyMaxRepairRounds: Number(maxRepairRounds),
  });
  return {
    enabled,
    stage_prompt_ref: policyStagePromptRef,
    role_prompt_refs: normalizedRolePrompts,
    quality_rubric_refs: rubricRefs,
    handoff_review_boundary: input.handoffReviewBoundary,
    quality_policy: {
      surface_kind: 'opl_stage_quality_cycle_policy',
      version: 'stage-quality-cycle-policy.v1',
      in_thread_refinement: {
        allowed: refinement.allowed as boolean,
        authoritative: false,
      },
      formal_review: {
        required: formalReview.required as boolean,
        risk_tier: riskTier,
        review_depth: formalReview.review_depth as StandardAgentStageQualityPolicy['formal_review']['review_depth'],
        attempt_internal_parallel_review_facets_allowed: riskTier === 'high',
        context_isolation_required: true,
        max_repair_rounds: Number(maxRepairRounds),
        scope_budget: scopeBudget,
      },
      budget_exhaustion: 'complete_with_quality_debt_if_consumable',
    },
  } satisfies Omit<
    StandardAgentStageQualityRuntimeBinding,
    | 'surface_kind'
    | 'version'
    | 'stage_id'
    | 'declared_stage_ids'
    | 'stage_role'
    | 'policy_ref'
    | 'stage_goal_refs'
    | 'source_refs'
    | 'lineage_refs'
    | 'manifest_ref'
    | 'manifest_sha256'
  >;
}

function validateHandoffReviewBoundary(input: {
  repoDir: string;
  stageId: string;
  stageKind: string;
  value: unknown;
}): StandardAgentHandoffReviewBoundary | null {
  if (input.stageKind !== 'packaging') {
    if (input.value !== undefined) {
      fail('handoff_review_boundary is only valid for packaging Handoff stages.', {
        repo_dir: input.repoDir,
        stage_id: input.stageId,
      });
    }
    return null;
  }
  const boundary = record(input.value, 'stage.handoff_review_boundary', input.repoDir);
  const fields = [
    'artifact_effect',
    'freezes_canonical_artifact_bytes',
    'issues_quality_export_publication_or_ready_claim',
    'downstream_owner_retains_acceptance',
  ];
  exactObjectKeys(boundary, fields, 'stage.handoff_review_boundary', input.repoDir);
  if (![
    'reviewed_immutable_refs_only',
    'mechanical_repackaging_of_reviewed_bytes',
    'new_or_transformed_reviewable_bytes',
  ].includes(String(boundary.artifact_effect))) {
    fail('stage.handoff_review_boundary.artifact_effect is invalid.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (
    typeof boundary.freezes_canonical_artifact_bytes !== 'boolean'
    || typeof boundary.issues_quality_export_publication_or_ready_claim !== 'boolean'
    || typeof boundary.downstream_owner_retains_acceptance !== 'boolean'
  ) {
    fail('stage.handoff_review_boundary flags must be boolean.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  const normalized = boundary as StandardAgentHandoffReviewBoundary;
  return normalized;
}

function assertNoOplAuthority(boundary: JsonRecord, field: string, repoDir: string) {
  const forbidden = Object.entries(boundary).filter(([key, value]) => (
    (
      key.startsWith('opl_can_')
      || key === 'provider_completion_is_domain_completion'
      || key === 'provider_completion_counts_as_domain_completion'
    )
      ? value !== false
      : (
          key === 'quality_verdict_owner'
          || key === 'artifact_authority_owner'
        ) && optionalString(value) === 'one-person-lab'
  ));
  if (forbidden.length > 0) {
    fail(`${field} grants forbidden OPL or provider authority.`, {
      repo_dir: repoDir,
      forbidden_authority_fields: forbidden.map(([key]) => key),
      forbidden_true_fields: forbidden
        .filter(([, value]) => value === true)
        .map(([key]) => key),
    });
  }
}

function surfaceRef(repoDir: string, value: string, field: string, role: string) {
  return { ref_kind: 'repo_path', ref: repoFile(repoDir, value, field).ref, role };
}

function stablePlaneId(domainId: string) {
  return `${domainId.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_stage_control_plane`;
}

function repoSurfaceRef(ref: string, role: string, refKind = 'repo_path') {
  return { ref_kind: refKind, ref, role };
}

function toolAffordanceBoundary(repoDir: string, refs: string[]) {
  if (refs.length === 0) {
    return null;
  }
  const surfaceRefs = (role: string) => refs.map((entry, index) =>
    surfaceRef(repoDir, entry, `pack_compiler_input.tool_refs[${index}]`, role)
  );
  return {
    catalog_role: TOOL_AFFORDANCE_CATALOG_ROLE,
    capability_refs: surfaceRefs('tool_capability_boundary'),
    permission_scope_refs: surfaceRefs('tool_permission_scope_boundary'),
    credential_boundary_refs: surfaceRefs('tool_credential_boundary'),
    write_scope_refs: surfaceRefs('tool_write_scope_boundary'),
    side_effect_risk_refs: surfaceRefs('tool_side_effect_risk_boundary'),
    forbidden_authority_refs: surfaceRefs('tool_forbidden_authority_boundary'),
    executor_autonomy: {
      executor_can_choose_tools: true,
      executor_can_skip_tools: true,
      executor_can_substitute_tools_within_boundary: true,
      executor_can_choose_order_and_parallelism: true,
      executor_can_request_missing_context_or_human_gate: true,
      tool_catalog_can_prescribe_tool_sequence: false,
      tool_catalog_can_define_cognitive_strategy: false,
      tool_catalog_can_override_stage_goal: false,
      tool_catalog_can_authorize_forbidden_write: false,
    },
  };
}

export function compileStandardAgentStageManifest(repoDirInput: string): StandardAgentStageManifestCompilation {
  const repoDir = path.resolve(repoDirInput);
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
    throw new FrameworkContractError('cli_usage_error', `Standard Agent repo dir does not exist: ${repoDir}`, {
      repo_dir: repoDir,
    });
  }

  const descriptor = record(
    readJson(repoDir, STANDARD_AGENT_DESCRIPTOR_REF, 'descriptor_ref').payload,
    'domain_descriptor',
    repoDir,
  );
  if (text(descriptor.surface_kind, 'domain_descriptor.surface_kind', repoDir) !== 'domain_agent_descriptor') {
    fail('domain_descriptor.surface_kind must be domain_agent_descriptor.', { repo_dir: repoDir });
  }
  const domainId = text(descriptor.domain_id, 'domain_descriptor.domain_id', repoDir);
  const descriptorAuthority = record(
    descriptor.authority_boundary,
    'domain_descriptor.authority_boundary',
    repoDir,
  );
  assertNoOplAuthority(descriptorAuthority, 'domain_descriptor.authority_boundary', repoDir);

  const actionCatalogRead = readJson(repoDir, ACTION_CATALOG_REF, 'action_catalog_ref');
  let actionCatalog;
  try {
    actionCatalog = normalizeFamilyActionCatalog(actionCatalogRead.payload);
  } catch (error) {
    fail('contracts/action_catalog.json is not a valid family-action-catalog.v2 contract.', {
      repo_dir: repoDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!actionCatalog || actionCatalog.target_domain_id !== domainId) {
    fail('Action catalog target_domain_id must match domain_descriptor.domain_id.', { repo_dir: repoDir });
  }
  const foundryProviderPack = actionCatalog.actions.every(
    (action) => action.execution_binding.kind === 'foundry_binding',
  );
  assertNoOplAuthority(
    record(actionCatalog.authority_boundary, 'action_catalog.authority_boundary', repoDir),
    'action_catalog.authority_boundary',
    repoDir,
  );
  try {
    const registryPath = path.join(repoDir, DOMAIN_HANDLER_REGISTRY_REF);
    const registry = fs.existsSync(registryPath)
      ? normalizeDomainHandlerRegistry(
          readJson(repoDir, DOMAIN_HANDLER_REGISTRY_REF, 'domain_handler_registry_ref').payload,
        )
      : null;
    if (fs.existsSync(registryPath) && !registry) {
      throw new Error('contracts/domain_handler_registry.json must contain a domain-handler-registry.v1 object.');
    }
    assertFamilyActionHandlerRefsResolve(actionCatalog, registry);
    if (registry) {
      assertDomainHandlerImplementationsResolve(repoDir, registry);
    }
  } catch (error) {
    fail('Action execution bindings do not resolve against domain-handler-registry.v1.', {
      repo_dir: repoDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const packCompilerInput = record(
    readJson(repoDir, PACK_COMPILER_INPUT_REF, 'pack_compiler_input_ref').payload,
    'pack_compiler_input',
    repoDir,
  );
  if (text(packCompilerInput.domain_id, 'pack_compiler_input.domain_id', repoDir) !== domainId) {
    fail('pack_compiler_input.domain_id must match domain_descriptor.domain_id.', { repo_dir: repoDir });
  }
  if (
    (packCompilerInput.generated_surface_owner !== undefined
      && packCompilerInput.generated_surface_owner !== 'one-person-lab')
    || packCompilerInput.domain_repo_can_own_generated_surface === true
  ) {
    fail('pack_compiler_input must keep generated surfaces owned by one-person-lab.', { repo_dir: repoDir });
  }
  if (packCompilerInput.authority_boundary !== undefined) {
    const packCompilerAuthority = record(
      packCompilerInput.authority_boundary,
      'pack_compiler_input.authority_boundary',
      repoDir,
    );
    assertNoOplAuthority(packCompilerAuthority, 'pack_compiler_input.authority_boundary', repoDir);
    if (packCompilerAuthority.domain_can_claim_generated_surface_owner === true) {
      fail('pack_compiler_input cannot grant generated-surface ownership to the domain repo.', {
        repo_dir: repoDir,
      });
    }
  }
  const canonicalAgentId = text(
    packCompilerInput.canonical_agent_id,
    'pack_compiler_input.canonical_agent_id',
    repoDir,
  );
  const requiredPackPaths = strings(
    packCompilerInput.required_domain_pack_paths,
    'pack_compiler_input.required_domain_pack_paths',
    repoDir,
  );
  if (!requiredPackPaths.includes(STANDARD_AGENT_STAGE_MANIFEST_REF)) {
    fail('pack_compiler_input.required_domain_pack_paths must include agent/stages/manifest.json.', {
      repo_dir: repoDir,
    });
  }
  const resolvedRequiredPackPaths = requiredPackPaths.map((entry, index) =>
    repoFile(repoDir, entry, `pack_compiler_input.required_domain_pack_paths[${index}]`).ref
  );
  const defaultSkillRefs = resolvedRequiredPackPaths.filter((entry) => entry.startsWith('agent/skills/'));
  const defaultToolRefs = resolvedRequiredPackPaths.filter((entry) => entry.startsWith('agent/tools/'));
  const ownerReceiptContractRef = foundryProviderPack
    ? null
    : repoFile(repoDir, OWNER_RECEIPT_CONTRACT_REF, 'owner_receipt_contract_ref').ref;
  if (ownerReceiptContractRef) {
    const ownerReceiptContract = record(
      readJson(repoDir, ownerReceiptContractRef, 'owner_receipt_contract_ref').payload,
      'owner_receipt_contract',
      repoDir,
    );
    if (text(
      ownerReceiptContract.surface_kind,
      'owner_receipt_contract.surface_kind',
      repoDir,
    ) !== 'owner_receipt_contract') {
      fail('owner_receipt_contract.surface_kind must be owner_receipt_contract.', {
        repo_dir: repoDir,
      });
    }
  }
  const authorityFunctionInventoryRef = foundryProviderPack
    ? null
    : repoFile(
      repoDir,
      AUTHORITY_FUNCTION_INVENTORY_REF,
      'authority_function_inventory_ref',
    ).ref;
  const stagePackDeclaration = isRecord(packCompilerInput.standard_stage_pack_conformance)
    ? packCompilerInput.standard_stage_pack_conformance
    : null;
  const declaredStagePackVersion = optionalString(stagePackDeclaration?.version);
  if (
    stagePackDeclaration?.required === true
    && declaredStagePackVersion !== STANDARD_STAGE_PACK_CONFORMANCE_VERSION
  ) {
    fail(
      `pack_compiler_input.standard_stage_pack_conformance.version must be ${STANDARD_STAGE_PACK_CONFORMANCE_VERSION} when required=true.`,
      {
        repo_dir: repoDir,
        declared_version: declaredStagePackVersion,
      },
    );
  }
  const stagePackV2Required = stagePackDeclaration?.required === true
    || declaredStagePackVersion === STANDARD_STAGE_PACK_CONFORMANCE_VERSION;
  const manifestRead = readJson(repoDir, STANDARD_AGENT_STAGE_MANIFEST_REF, 'stage_manifest_ref');
  const manifest = record(manifestRead.payload, 'stage_manifest', repoDir);
  if (text(manifest.surface_kind, 'stage_manifest.surface_kind', repoDir) !== STANDARD_STAGE_MANIFEST_SURFACE_KIND) {
    fail(`stage_manifest.surface_kind must be ${STANDARD_STAGE_MANIFEST_SURFACE_KIND}.`, { repo_dir: repoDir });
  }
  if (text(manifest.version, 'stage_manifest.version', repoDir) !== STANDARD_STAGE_MANIFEST_VERSION) {
    fail(`stage_manifest.version must be ${STANDARD_STAGE_MANIFEST_VERSION}.`, { repo_dir: repoDir });
  }
  if (text(manifest.target_domain_id, 'stage_manifest.target_domain_id', repoDir) !== domainId) {
    fail('Stage manifest target_domain_id must match domain_descriptor.domain_id.', { repo_dir: repoDir });
  }
  if (text(manifest.owner, 'stage_manifest.owner', repoDir) !== domainId) {
    fail('Stage manifest owner must match domain_descriptor.domain_id.', { repo_dir: repoDir });
  }
  const manifestAuthority = record(
    manifest.authority_boundary,
    'stage_manifest.authority_boundary',
    repoDir,
  );
  const declaredQualityProfileRef = manifest.quality_governance_profile_ref === undefined
    ? null
    : text(manifest.quality_governance_profile_ref, 'stage_manifest.quality_governance_profile_ref', repoDir);
  const declaredMetaReviewPolicyRef = manifest.meta_review_policy_ref === undefined
    ? null
    : repoRef(repoDir, manifest.meta_review_policy_ref, 'stage_manifest.meta_review_policy_ref');
  if (
    declaredQualityProfileRef
    && declaredQualityProfileRef !== OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE.profile_ref
  ) {
    fail('Domain quality governance profile must reference the canonical OPL profile.', {
      repo_dir: repoDir,
      canonical_agent_id: canonicalAgentId,
      canonical_profile_ref: OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE.profile_ref,
      declared_profile_ref: declaredQualityProfileRef,
    });
  }
  if (declaredQualityProfileRef && !declaredMetaReviewPolicyRef) {
    fail('Official knowledge-deliverable profile requires a Meta Review policy ref.', {
      repo_dir: repoDir,
      canonical_agent_id: canonicalAgentId,
    });
  }
  if (text(
    manifestAuthority.domain_truth_owner,
    'stage_manifest.authority_boundary.domain_truth_owner',
    repoDir,
  ) !== domainId) {
    fail('stage_manifest.authority_boundary.domain_truth_owner must match domain_descriptor.domain_id.', {
      repo_dir: repoDir,
    });
  }
  assertNoOplAuthority(manifestAuthority, 'stage_manifest.authority_boundary', repoDir);
  if (!Array.isArray(manifest.stages) || manifest.stages.length === 0) {
    fail('Stage manifest must declare at least one stage.', { repo_dir: repoDir });
  }

  const stageRecords = manifest.stages.map((entry, index) =>
    record(entry, `stage_manifest.stages[${index}]`, repoDir)
  );
  const stageIds = stageRecords.map((stage, index) =>
    text(stage.stage_id, `stage_manifest.stages[${index}].stage_id`, repoDir)
  );
  if (new Set(stageIds).size !== stageIds.length) {
    fail('Stage manifest stage_id values must be unique.', { repo_dir: repoDir, stage_ids: stageIds });
  }
  const stageIdSet = new Set(stageIds);
  const actionIds = new Set(actionCatalog.actions.map((action) => action.action_id));
  const manifestSha256 = crypto.createHash('sha256').update(manifestRead.source).digest('hex');
  const planeId = stablePlaneId(domainId);

  const stages = stageRecords.map((stage, index) => {
    const stageId = stageIds[index]!;
    const stageKind = text(stage.stage_kind, 'stage.stage_kind', repoDir);
    const title = text(stage.title, 'stage.title', repoDir);
    const displayNames = stageDisplayNames(
      stage.display_names,
      title,
      `stage_manifest.stages[${index}].display_names`,
      repoDir,
    );
    const handoffReviewBoundary = validateHandoffReviewBoundary({
      repoDir,
      stageId,
      stageKind,
      value: stage.handoff_review_boundary,
    });
    const policyRef = repoFile(repoDir, stage.policy_ref, 'stage.policy_ref').ref;
    const promptSource = readStandardAgentStagePromptFile(
      repoDir,
      text(stage.prompt_ref, 'stage.prompt_ref', repoDir),
    );
    const knowledgeRefs = strings(stage.knowledge_refs, 'stage.knowledge_refs', repoDir);
    const stageSkillRefs = optionalStrings(stage.skill_refs, 'stage.skill_refs', repoDir);
    const skillRefs = [...new Set([...defaultSkillRefs, ...stageSkillRefs])];
    const qualityGateRefs = strings(stage.quality_gate_refs, 'stage.quality_gate_refs', repoDir);
    const allowedActionRefs = strings(stage.allowed_action_refs, 'stage.allowed_action_refs', repoDir);
    const nextStageRefs = strings(stage.next_stage_refs, 'stage.next_stage_refs', repoDir);
    const laneKind = optionalString(stage.lane_kind);
    const stageRole = optionalString(stage.stage_role);
    const stageQualityCyclePolicyRef = stage.stage_quality_cycle_policy_ref === undefined
      ? null
      : repoRef(repoDir, stage.stage_quality_cycle_policy_ref, `stage_manifest.stages[${index}].stage_quality_cycle_policy_ref`);
    const trustLane = text(stage.trust_lane, 'stage.trust_lane', repoDir);
    const effectBoundary = EFFECT_BOUNDARY_TRUST_LANES.has(trustLane);
    if (handoffReviewBoundary && !handoffAllowsPrimaryOnly(handoffReviewBoundary) && !stageQualityCyclePolicyRef) {
      fail('Handoff outside the primary-only boundary requires a Stage quality-cycle policy.', {
        repo_dir: repoDir,
        stage_id: stageId,
        blocker: 'handoff_review_boundary_requires_quality_policy',
      });
    }
    if (declaredQualityProfileRef && trustLane !== 'human_gate' && !stageQualityCyclePolicyRef) {
      fail('Official knowledge-deliverable AI stages require a Stage quality-cycle policy ref.', {
        repo_dir: repoDir,
        stage_id: stageId,
      });
    }
    if (stageQualityCyclePolicyRef) {
      const qualityBinding = validateStageQualityCyclePolicy({
        repoDir,
        ref: stageQualityCyclePolicyRef,
        stageId,
        stagePromptRef: promptSource.ref,
        stageRole,
        handoffReviewBoundary,
      });
      if (declaredQualityProfileRef && trustLane !== 'human_gate' && !qualityBinding.enabled) {
        fail('Official knowledge-deliverable AI stages must enable their Stage quality cycle.', {
          repo_dir: repoDir,
          stage_id: stageId,
          stage_quality_cycle_policy_ref: stageQualityCyclePolicyRef,
        });
      }
    }
    if (stageRole === 'cross_stage_meta_review' && stageKind !== 'review') {
      fail('cross_stage_meta_review role requires stage_kind=review.', { repo_dir: repoDir, stage_id: stageId });
    }
    const runtimeEventRefs = effectBoundary
      ? [`runtime_event:${stageId}.owner_receipt_recorded`]
      : [];
    const declaredStageContract = stage.stage_contract === undefined
      ? {}
      : record(stage.stage_contract, 'stage.stage_contract', repoDir);
    const stageContractExtension = stage.stage_contract_extension === undefined
      ? {}
      : record(stage.stage_contract_extension, 'stage.stage_contract_extension', repoDir);
    assertNoOplAuthority(declaredStageContract, 'stage.stage_contract', repoDir);
    assertNoOplAuthority(stageContractExtension, 'stage.stage_contract_extension', repoDir);
    const forbiddenExtensionFields = Object.keys(stageContractExtension)
      .filter((field) => STAGE_CONTRACT_EXTENSION_FORBIDDEN_FIELDS.has(field));
    if (forbiddenExtensionFields.length > 0) {
      fail('Stage manifest stage_contract_extension cannot override compiler-owned or Framework floor fields.', {
        repo_dir: repoDir,
        stage_id: stageId,
        blocker: 'standard_agent_stage_contract_extension_forbidden_field',
        forbidden_fields: forbiddenExtensionFields,
      });
    }
    const frameworkStageContract = {
      expected_receipt_refs: [repoSurfaceRef(
        'domain_progress_receipt_or_owner_receipt_or_typed_hard_blocker_ref',
        'domain_stage_closeout',
        'domain_ref',
      )],
      receipt_schema_refs: ownerReceiptContractRef
        ? [repoSurfaceRef(ownerReceiptContractRef, 'owner_receipt_schema')]
        : [],
      authority_function_refs: authorityFunctionInventoryRef
        ? [repoSurfaceRef(authorityFunctionInventoryRef, 'minimal_authority_function_inventory')]
        : [],
      l4_entry_gate: STANDARD_AGENT_PACK_ABI.l4_entry_gate,
      l5_entry_gate: STANDARD_AGENT_PACK_ABI.l5_entry_gate,
      stage_completion_policy: STANDARD_STAGE_COMPLETION_POLICY,
      user_stage_log_contract: STANDARD_USER_STAGE_LOG_CONTRACT,
      progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
      typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
    };
    for (const [field, expected] of Object.entries(frameworkStageContract)) {
      const declared = declaredStageContract[field];
      if (declared !== undefined && !isDeepStrictEqual(declared, expected)) {
        fail('Stage manifest stage_contract Framework floor mismatch.', {
          repo_dir: repoDir,
          stage_id: stageId,
          field,
          blocker: 'standard_agent_stage_contract_framework_floor_mismatch',
        });
      }
    }
    if (qualityGateRefs.length === 0) {
      fail('Every standard Agent stage must declare at least one quality_gate_ref.', {
        repo_dir: repoDir,
        relative_path: STANDARD_AGENT_STAGE_MANIFEST_REF,
        stage_id: stageId,
      });
    }
    if (allowedActionRefs.length === 0) {
      fail('Every standard Agent stage must declare at least one allowed_action_ref.', {
        repo_dir: repoDir,
        relative_path: STANDARD_AGENT_STAGE_MANIFEST_REF,
        stage_id: stageId,
      });
    }
    const missingActions = allowedActionRefs.filter((entry) => !actionIds.has(entry));
    const missingStages = nextStageRefs.filter((entry) => !stageIdSet.has(entry));
    if (missingActions.length > 0) {
      fail('Stage manifest references missing family actions.', { repo_dir: repoDir, stage_id: stageId, missingActions });
    }
    if (missingStages.length > 0) {
      fail('Stage manifest references unresolved next stages.', { repo_dir: repoDir, stage_id: stageId, missingStages });
    }
    const stageOrigin = optionalString(stage.stage_origin);
    const patternId = optionalString(stage.pattern_id);
    const stepId = optionalString(stage.step_id);
    const provenanceKind = optionalString(stage.provenance_kind);
    const sourcePatternRef = optionalString(stage.source_pattern_ref);
    const targetOnlyRequirementRef = optionalString(stage.target_only_requirement_ref);
    const sourceAnchorRefs = optionalStrings(stage.source_anchor_refs, 'stage.source_anchor_refs', repoDir);
    const declaredStagePatternSourceRefs = optionalStrings(
      stage.stage_pattern_source_refs,
      'stage.stage_pattern_source_refs',
      repoDir,
    );
    if (stageOrigin === 'source_pattern_ref') {
      if (!patternId || !stepId || !provenanceKind || !sourcePatternRef || sourceAnchorRefs.length === 0) {
        fail('Source-derived manifest stages must bind pattern, step, provenance, source pattern, and source anchors.', {
          repo_dir: repoDir,
          stage_id: stageId,
        });
      }
      if (
        declaredStagePatternSourceRefs.length > 0
        && declaredStagePatternSourceRefs[0] !== sourcePatternRef
      ) {
        fail('Source-derived manifest stage primary source_pattern_ref must match stage_pattern_source_refs[0].', {
          repo_dir: repoDir,
          stage_id: stageId,
          source_pattern_ref: sourcePatternRef,
          declared_primary_source_pattern_ref: declaredStagePatternSourceRefs[0],
        });
      }
      if (targetOnlyRequirementRef) {
        fail('Source-derived manifest stages cannot also bind target_only_requirement_ref.', {
          repo_dir: repoDir,
          stage_id: stageId,
        });
      }
    } else if (stageOrigin === 'target_only_requirement') {
      if (!targetOnlyRequirementRef) {
        fail('Target-only manifest stages must bind target_only_requirement_ref.', {
          repo_dir: repoDir,
          stage_id: stageId,
        });
      }
      if (
        patternId
        || stepId
        || provenanceKind
        || sourcePatternRef
        || sourceAnchorRefs.length > 0
        || declaredStagePatternSourceRefs.length > 0
      ) {
        fail('Target-only manifest stages cannot bind source-pattern provenance fields.', {
          repo_dir: repoDir,
          stage_id: stageId,
        });
      }
    } else if (
      stageOrigin
      || patternId
      || stepId
      || provenanceKind
      || sourcePatternRef
      || targetOnlyRequirementRef
      || sourceAnchorRefs.length > 0
      || declaredStagePatternSourceRefs.length > 0
    ) {
      fail('Manifest stage provenance requires stage_origin=source_pattern_ref or target_only_requirement.', {
        repo_dir: repoDir,
        stage_id: stageId,
        stage_origin: stageOrigin,
      });
    }
    const stagePatternSourceRefs = sourcePatternRef
      ? [...new Set([sourcePatternRef, ...declaredStagePatternSourceRefs])]
      : declaredStagePatternSourceRefs;
    return {
      stage_id: stageId,
      stage_kind: stageKind,
      title,
      display_names: displayNames,
      summary: optionalString(stage.summary),
      goal: text(stage.goal, 'stage.goal', repoDir),
      owner: domainId,
      ...(stageRole ? { stage_role: stageRole } : {}),
      ...(stageQualityCyclePolicyRef ? { stage_quality_cycle_policy_ref: stageQualityCyclePolicyRef } : {}),
      ...(stageOrigin ? { stage_origin: stageOrigin } : {}),
      ...(patternId ? { pattern_id: patternId } : {}),
      ...(stepId ? { step_id: stepId } : {}),
      ...(provenanceKind ? { provenance_kind: provenanceKind } : {}),
      ...(sourcePatternRef ? { source_pattern_ref: sourcePatternRef } : {}),
      ...(targetOnlyRequirementRef ? { target_only_requirement_ref: targetOnlyRequirementRef } : {}),
      ...(sourceAnchorRefs.length > 0 ? { source_anchor_refs: sourceAnchorRefs } : {}),
      ...(stagePatternSourceRefs.length > 0 ? { stage_pattern_source_refs: stagePatternSourceRefs } : {}),
      stage_pack_conformance_version: stagePackV2Required
        ? STANDARD_STAGE_PACK_CONFORMANCE_VERSION
        : undefined,
      selected_executor: {
        executor_kind: 'codex_cli',
        default_executor: index === 0,
        executor_binding_ref: DEFAULT_STAGE_EXECUTOR_BINDING_REF,
        binding_policy: 'default_first_class_executor_for_ai_first_stage_execution',
        ...(laneKind ? { lane_kind: laneKind } : {}),
        required_capabilities: [
          'repo_context_reading',
          'domain_skill_invocation',
          'receipt_or_typed_blocker_return',
          'no_forbidden_write_guard',
        ],
        runtime_owner: 'one-person-lab',
      },
      domain_stage_refs: [`${STANDARD_AGENT_STAGE_MANIFEST_REF}#/stages/${index}`],
      inputs: [],
      knowledge_refs: knowledgeRefs.map((entry, refIndex) =>
        surfaceRef(repoDir, entry, `stage.knowledge_refs[${refIndex}]`, 'stage_knowledge')
      ),
      skills: skillRefs.map((entry, refIndex) =>
        surfaceRef(repoDir, entry, `stage.skill_refs[${refIndex}]`, 'domain_skill_declaration')
      ),
      prompt_refs: [{
        ...surfaceRef(repoDir, promptSource.ref, 'stage.prompt_ref', 'stage_prompt'),
        layer: promptSource.layer,
        sha256: promptSource.sha256,
        size_bytes: promptSource.size_bytes,
        content: promptSource.content,
      }],
      tool_refs: defaultToolRefs.map((entry, refIndex) =>
        surfaceRef(repoDir, entry, `pack_compiler_input.tool_refs[${refIndex}]`, 'stage_tool_affordance_catalog')
      ),
      tool_affordance_boundary: toolAffordanceBoundary(repoDir, defaultToolRefs),
      allowed_action_refs: allowedActionRefs,
      outputs: [],
      evaluation: qualityGateRefs.map((entry, refIndex) =>
        surfaceRef(repoDir, entry, `stage.quality_gate_refs[${refIndex}]`, 'stage_quality_gate')
      ),
      independent_gate_policy: {
        gate_ref: qualityGateRefs[0],
        gate_owner: domainId,
        execution_review_separation_required: true,
      },
      handoff: {
        next_owner: nextStageRefs.length > 0 ? 'one-person-lab' : domainId,
        next_stage_refs: nextStageRefs,
        closeout_ref_policy: 'domain_owner_receipt_typed_blocker_human_gate_or_route_back',
        ...(handoffReviewBoundary ? { review_boundary: handoffReviewBoundary } : {}),
      },
      source_refs: [surfaceRef(repoDir, policyRef, 'stage.policy_ref', 'declarative_stage_policy')],
      freshness: {
        source_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
        refresh_policy: 'reload_standard_agent_stage_manifest',
        stage_manifest_sha256: manifestSha256,
      },
      action_parity: { status: 'resolved_from_family_action_catalog', action_catalog_ref: ACTION_CATALOG_REF },
      stage_contract: {
        ...declaredStageContract,
        requires: strings(stage.requires, 'stage.requires', repoDir),
        ensures: strings(stage.ensures, 'stage.ensures', repoDir),
        boundary_assumptions: [
          'opl_runtime_transport_only',
          'domain_owner_retains_truth_quality_and_closeout_authority',
        ],
        properties: [],
        ...(runtimeEventRefs.length > 0 ? { runtime_event_refs: runtimeEventRefs } : {}),
        runtime_assumptions: [],
        monitor_refs: [],
        source_scope_refs: [surfaceRef(repoDir, policyRef, 'stage.policy_ref', 'stage_policy_source')],
        artifact_scope_refs: [],
        workspace_scope_refs: [],
        ...stageContractExtension,
        ...frameworkStageContract,
      },
      trust_boundary: {
        lane: trustLane,
        static_check_eligible: !effectBoundary,
        effect_boundary: effectBoundary,
        records_runtime_events: effectBoundary,
        ...(runtimeEventRefs.length > 0 ? { runtime_event_refs: runtimeEventRefs } : {}),
        owner_receipt_required: !foundryProviderPack,
        human_gate_required: trustLane === 'human_gate',
      },
      authority_boundary: {
        domain_truth_owner: domainId,
        opl_role: 'projection_consumer_only',
        opl_can_write_domain_truth: false,
        opl_can_authorize_quality_or_export: false,
        opl_can_sign_owner_receipt: false,
        provider_completion_is_domain_completion: false,
      },
    };
  });

  const stageControlPlane = normalizeFamilyStageControlPlane({
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: planeId,
    target_domain_id: domainId,
    owner: domainId,
    ...(declaredQualityProfileRef ? { quality_governance_profile_ref: declaredQualityProfileRef } : {}),
    ...(declaredMetaReviewPolicyRef ? { meta_review_policy_ref: declaredMetaReviewPolicyRef } : {}),
    stage_pack_conformance_version: stagePackV2Required
      ? STANDARD_STAGE_PACK_CONFORMANCE_VERSION
      : undefined,
    authority_boundary: {
      ...manifestAuthority,
      domain_truth_owner: domainId,
      opl_role: 'projection_consumer_only',
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_sign_owner_receipt: false,
      provider_completion_is_domain_completion: false,
    },
    replay_evidence_refs: [
      { ref_kind: 'repo_path', ref: STANDARD_AGENT_DESCRIPTOR_REF, role: 'standard_agent_descriptor' },
      { ref_kind: 'repo_path', ref: ACTION_CATALOG_REF, role: 'family_action_catalog' },
      { ref_kind: 'repo_path', ref: STANDARD_AGENT_STAGE_MANIFEST_REF, role: 'declarative_stage_manifest' },
    ],
    stages,
    notes: [],
  });
  if (declaredQualityProfileRef) {
    const metaReviewStages = stages.filter((stage) => stage.stage_role === 'cross_stage_meta_review');
    if (metaReviewStages.length !== 1) {
      fail('Official knowledge-deliverable manifest requires exactly one cross-stage Meta Review Stage.', {
        repo_dir: repoDir,
        canonical_agent_id: canonicalAgentId,
        meta_review_stage_ids: metaReviewStages.map((stage) => stage.stage_id),
      });
    }
  }
  if (!stageControlPlane) {
    fail('Stage manifest did not compile to a family stage control plane.', { repo_dir: repoDir });
  }
  const actionStageRouteParity = buildFamilyActionStageRouteParity(actionCatalog, stageControlPlane, {
    require_declared_routes: true,
  });
  if (actionStageRouteParity.status !== 'aligned') {
    fail('Action-to-stage route contract is not aligned with the compiled stage manifest.', {
      repo_dir: repoDir,
      blocker: 'standard_agent_action_stage_route_contract_drift',
      issues: actionStageRouteParity.issues,
    });
  }
  return {
    stage_control_plane: stageControlPlane,
    source_binding: {
      plane_id: planeId,
      canonical_agent_id: canonicalAgentId,
      domain_id: domainId,
      descriptor_ref: STANDARD_AGENT_DESCRIPTOR_REF,
      action_catalog_ref: ACTION_CATALOG_REF,
      stage_manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
      stage_manifest_sha256: manifestSha256,
    },
  };
}

function stageLineageRefs(stage: FamilyStageControlPlane['stages'][number]) {
  return [...new Set([
    ...stage.domain_stage_refs,
    ...(stage.source_pattern_ref ? [stage.source_pattern_ref] : []),
    ...(stage.target_only_requirement_ref ? [stage.target_only_requirement_ref] : []),
    ...(stage.source_anchor_refs ?? []),
    ...(stage.stage_pattern_source_refs ?? []),
  ])];
}

export function resolveStandardAgentStageQualityRuntimeBinding(
  repoDirInput: string,
  stageIdInput: string,
): StandardAgentStageQualityRuntimeBinding | null {
  const repoDir = path.resolve(repoDirInput);
  const stageId = text(stageIdInput, 'stage_id', repoDir);
  const compilation = compileStandardAgentStageManifest(repoDir);
  const stageIndex = compilation.stage_control_plane.stages.findIndex((stage) => stage.stage_id === stageId);
  if (stageIndex === -1) {
    fail('Stage quality runtime binding requires a declared Stage.', {
      repo_dir: repoDir,
      stage_id: stageId,
      stage_manifest_ref: compilation.source_binding.stage_manifest_ref,
    });
  }
  const stage = compilation.stage_control_plane.stages[stageIndex]!;
  const policyRef = optionalString(stage.stage_quality_cycle_policy_ref);
  if (!policyRef) return null;
  const stagePromptRef = optionalString(stage.prompt_refs[0]?.ref);
  if (!stagePromptRef) {
    fail('Stage quality runtime binding requires the compiled Stage prompt ref.', {
      repo_dir: repoDir,
      stage_id: stageId,
    });
  }
  const policy = validateStageQualityCyclePolicy({
    repoDir,
    ref: policyRef,
    stageId,
    stagePromptRef,
    stageRole: optionalString(stage.stage_role),
    handoffReviewBoundary: isRecord(stage.handoff?.review_boundary)
      ? stage.handoff.review_boundary as StandardAgentHandoffReviewBoundary
      : null,
  });
  const officialAiStage = Boolean(compilation.stage_control_plane.quality_governance_profile_ref)
    && stage.trust_boundary?.lane !== 'human_gate';
  if (officialAiStage && !policy.enabled) {
    fail('Official knowledge-deliverable AI stages must enable their Stage quality cycle.', {
      repo_dir: repoDir,
      stage_id: stageId,
      stage_quality_cycle_policy_ref: policyRef,
    });
  }
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: stage.stage_id,
    declared_stage_ids: compilation.stage_control_plane.stages.map((entry) => entry.stage_id),
    enabled: policy.enabled,
    stage_role: optionalString(stage.stage_role),
    policy_ref: policyRef,
    stage_prompt_ref: policy.stage_prompt_ref,
    quality_policy: policy.quality_policy,
    handoff_review_boundary: policy.handoff_review_boundary,
    role_prompt_refs: policy.role_prompt_refs,
    quality_rubric_refs: policy.quality_rubric_refs,
    stage_goal_refs: [`${compilation.source_binding.stage_manifest_ref}#/stages/${stageIndex}/goal`],
    source_refs: stage.source_refs.flatMap((source) =>
      Array.isArray(source.ref) ? source.ref : [source.ref]
    ),
    lineage_refs: stageLineageRefs(stage),
    manifest_ref: STANDARD_AGENT_STAGE_MANIFEST_REF,
    manifest_sha256: compilation.source_binding.stage_manifest_sha256,
  };
}
