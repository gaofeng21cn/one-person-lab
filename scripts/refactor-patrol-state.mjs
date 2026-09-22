#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { readJsonFile } from './script-json-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseCliOptions(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const contractPath = path.resolve(args.contract ?? path.join(
  repoRoot,
  'contracts',
  'opl-framework',
  'reasonable-refactor-patrol.json',
));
const schemaPath = path.resolve(args.schema ?? path.join(
  repoRoot,
  'contracts',
  'opl-framework',
  'reasonable-refactor-patrol-state.schema.json',
));

const contract = readJsonFile(contractPath);
const contractErrors = validateContract(contract);
if (args.command === 'contract') {
  finish({
    surface_kind: 'opl_reasonable_refactor_patrol_contract_check',
    status: contractErrors.length === 0 ? 'ok' : 'invalid',
    contract: path.relative(repoRoot, contractPath),
    errors: contractErrors,
  }, contractErrors.length === 0 ? 0 : 1);
}

if (!args.input) {
  fail('refactor patrol state: validate requires --input <state.json>');
}
const state = readJsonFile(path.resolve(args.input));
const schema = readJsonFile(schemaPath);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
const errors = [...contractErrors];
if (!validate(state)) {
  errors.push(...(validate.errors ?? []).map((error) => (
    `${error.instancePath || '/'} ${error.message}`
  )));
}
if (errors.length === 0) {
  errors.push(...validateCrossReferences(state));
}

finish({
  surface_kind: 'opl_reasonable_refactor_patrol_state_check',
  status: errors.length === 0 ? 'ok' : 'invalid',
  contract: path.relative(repoRoot, contractPath),
  schema: path.relative(repoRoot, schemaPath),
  input: path.resolve(args.input),
  counts: {
    candidates: Array.isArray(state.issue_library) ? state.issue_library.length : 0,
    work_packages: Array.isArray(state.work_packages) ? state.work_packages.length : 0,
    selected_packages: Array.isArray(state.selected_package_ids) ? state.selected_package_ids.length : 0,
    burn_down: Array.isArray(state.burn_down) ? state.burn_down.length : 0,
    remaining: Array.isArray(state.remaining) ? state.remaining.length : 0,
  },
  run_status: state.run_status ?? null,
  file_totals: errors.length === 0 ? summarizeFileMetrics(state.work_packages) : [],
  errors,
}, errors.length === 0 ? 0 : 1);

function parseCliOptions(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') {
    return { command: null, help: true, contract: null, schema: null, input: null };
  }
  if (!['contract', 'validate'].includes(command)) {
    fail(`refactor patrol state: unknown command ${command}`);
  }
  const { values } = parseNodeArgs({
    args: argv.slice(1),
    options: {
      contract: { type: 'string' },
      schema: { type: 'string' },
      input: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    command,
    help: values.help,
    contract: values.contract ?? null,
    schema: values.schema ?? null,
    input: values.input ?? null,
  };
}

function validateContract(contract) {
  const errors = [];
  if (contract.contract_kind !== 'opl_reasonable_refactor_patrol.v1') {
    errors.push('contract_kind must be opl_reasonable_refactor_patrol.v1');
  }
  if (contract.owner !== 'one-person-lab' || contract.state !== 'active_contract') {
    errors.push('contract owner/state must be one-person-lab/active_contract');
  }
  if (contract.execution_policy?.mode !== 'wide_probe_narrow_mutate') {
    errors.push('execution policy must remain wide_probe_narrow_mutate');
  }
  for (const field of [
    'fixed_candidate_quota',
    'fixed_selected_package_quota',
    'fixed_line_budget_percentage',
  ]) {
    if (contract.execution_policy?.[field] !== false) {
      errors.push(`execution_policy.${field} must be false`);
    }
  }
  const excluded = new Set(contract.scope?.excluded_repositories ?? []);
  for (const repo of ['opl-aion-shell']) {
    if (!excluded.has(repo)) {
      errors.push(`scope must exclude ${repo}`);
    }
  }
  const appExclusions = new Set(contract.scope?.excluded_path_prefixes?.['one-person-lab-app'] ?? []);
  for (const prefix of ['shells/aionui/', '_external/hermes-agent/']) {
    if (!appExclusions.has(prefix)) {
      errors.push(`one-person-lab-app scope must exclude ${prefix}`);
    }
  }
  if (contract.state_contract?.selected_batch_invariant !== 'every_selected_package_has_exactly_one_burn_down_entry') {
    errors.push('selected batch invariant is missing');
  }
  const provenanceFields = [
    'source_provenance_class',
    'source_provenance_evidence',
    'reserve_capability_assessment',
    'replacement_or_retirement_evidence',
  ];
  for (const field of provenanceFields) {
    if (!contract.candidate?.required_authority_fields?.includes(field)) {
      errors.push(`candidate provenance field is missing: ${field}`);
    }
  }
  if (contract.provenance_policy?.no_caller_is !== 'investigation_signal_only') {
    errors.push('no caller must remain an investigation signal only');
  }
  for (const pattern of [
    'delete_from_no_caller_without_provenance',
    'delete_user_requested_or_externally_learned_reserve',
    'treat_unknown_provenance_as_model_invented',
  ]) {
    if (!contract.forbidden_patterns?.includes(pattern)) {
      errors.push(`provenance forbidden pattern is missing: ${pattern}`);
    }
  }
  return errors;
}

function validateCrossReferences(state) {
  const errors = [];
  const candidateIds = uniqueIds(state.issue_library, 'id', 'candidate', errors);
  const packageIds = uniqueIds(state.work_packages, 'package_id', 'work package', errors);
  const burnDownIds = uniqueIds(state.burn_down, 'package_id', 'burn-down', errors);
  const selectedIds = new Set(state.selected_package_ids);

  validateCandidateReferences(state.work_packages, candidateIds, errors);
  validateCandidateProvenance(state.issue_library, errors);
  for (const workPackage of state.work_packages) {
    uniqueIds(workPackage.file_metrics ?? [], 'path', `${workPackage.package_id} file`, errors);
  }
  validateSelectedPackages(selectedIds, packageIds, burnDownIds, errors);
  validateRunTerminalState(state, selectedIds, errors);
  return errors;
}

function validateCandidateProvenance(candidates, errors) {
  const protectedProvenance = new Set(['user_requested', 'externally_learned', 'unknown']);
  for (const candidate of candidates) {
    if (
      candidate.status === 'selected'
      && ['delete', 'shrink'].includes(candidate.tag)
      && protectedProvenance.has(candidate.source_provenance_class)
      && !(candidate.tag === 'shrink' && candidate.change_kind === 'behavior_preserving_organization')
    ) {
      errors.push(
        `${candidate.id}: ${candidate.source_provenance_class} provenance cannot be selected for ${candidate.tag}`,
      );
    }
  }
}

function summarizeFileMetrics(workPackages) {
  return (workPackages ?? []).filter((entry) => entry.file_metrics?.length).map((entry) => ({
    package_id: entry.package_id,
    scope: 'multi_file_total',
    file_count: entry.file_metrics.length,
    before_lines: entry.file_metrics.reduce((sum, file) => sum + file.before_lines, 0),
    after_lines: entry.file_metrics.reduce((sum, file) => sum + file.after_lines, 0),
    largest_after_file_lines: Math.max(...entry.file_metrics.map((file) => file.after_lines)),
  }));
}

function validateCandidateReferences(workPackages, candidateIds, errors) {
  for (const workPackage of workPackages) {
    for (const candidateId of workPackage.child_candidate_ids) {
      if (!candidateIds.has(candidateId)) {
        errors.push(`${workPackage.package_id}: unknown child candidate ${candidateId}`);
      }
    }
  }
}

function validateSelectedPackages(selectedIds, packageIds, burnDownIds, errors) {
  for (const packageId of selectedIds) {
    if (!packageIds.has(packageId)) {
      errors.push(`selected package does not exist: ${packageId}`);
    }
    if (!burnDownIds.has(packageId)) {
      errors.push(`selected package has no burn-down entry: ${packageId}`);
    }
  }
  for (const packageId of burnDownIds) {
    if (!selectedIds.has(packageId)) {
      errors.push(`burn-down entry is not selected: ${packageId}`);
    }
  }
}

function validateRunTerminalState(state, selectedIds, errors) {
  if (state.run_status === 'no_safe_batch') {
    if (selectedIds.size !== 0) {
      errors.push('no_safe_batch cannot retain selected packages');
    }
    if (!state.no_safe_batch_reason) {
      errors.push('no_safe_batch requires no_safe_batch_reason');
    }
    validateEmptyRemaining(state, errors);
  }
  if (state.run_status === 'completed') {
    validateCompletedBurnDown(state.burn_down, errors);
    validateEmptyRemaining(state, errors);
  }
}

function validateCompletedBurnDown(burnDown, errors) {
  const terminal = new Set([
    'done',
    'deleted',
    'shrunk',
    'done_gate_no_delete',
    'no_safe_change',
    'blocked_owner_gated',
    'not_safe',
  ]);
  for (const entry of burnDown) {
    if (!terminal.has(entry.status)) {
      errors.push(`completed run has non-terminal package ${entry.package_id}: ${entry.status}`);
    }
    if (entry.evidence.length === 0) {
      errors.push(`completed run package lacks evidence: ${entry.package_id}`);
    }
  }
}

function validateEmptyRemaining(state, errors) {
  if (state.remaining.length !== 0) {
    errors.push(`${state.run_status} run must have remaining=[]`);
  }
}

function uniqueIds(items, field, label, errors) {
  const result = new Set();
  for (const item of items) {
    const id = item[field];
    if (result.has(id)) {
      errors.push(`duplicate ${label} id: ${id}`);
    }
    result.add(id);
  }
  return result;
}

function printHelp() {
  process.stdout.write([
    'Usage:',
    '  node scripts/refactor-patrol-state.mjs contract [--contract <path>]',
    '  node scripts/refactor-patrol-state.mjs validate --input <state.json> [options]',
    '',
    'Options:',
    '  --contract <path>  Patrol policy contract.',
    '  --schema <path>    Run-state JSON Schema.',
    '  --input <path>     Run-state JSON to validate.',
    '  --help             Print this help.',
    '',
  ].join('\n'));
}

function finish(payload, exitCode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
