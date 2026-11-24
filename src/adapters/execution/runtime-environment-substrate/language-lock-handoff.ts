import type { JsonRecord } from './contract.ts';
import { objects } from './target-state.ts';

function stringRefs(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringRefs);
  }
  return [];
}

function refsFromRecord(record: JsonRecord, names: string[]) {
  return names.flatMap((name) => stringRefs(record[name]));
}

function nestedLockRecord(entry: JsonRecord, language: 'r' | 'python') {
  return [
    entry.dependency_locks,
    entry.language_locks,
    entry.language_lock_refs,
    entry.lock_refs,
  ].map((value) => (value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)[language]
    : null))
    .find((value) => value && typeof value === 'object' && !Array.isArray(value)) as JsonRecord | undefined;
}

export function uniqueRefs(values: string[]) {
  return Array.from(new Set(values));
}

export function profileLockHandoff(profile: JsonRecord, selectedRequirementProfileIds: string[]) {
  const selected = objects(profile.profiles).filter((entry) => (
    selectedRequirementProfileIds.includes(String(entry.profile_id ?? '').trim())
  ));
  const refsFor = (language: 'r' | 'python', prefixes: string[]) => {
    const nested = selected.map((entry) => nestedLockRecord(entry, language)).filter(Boolean) as JsonRecord[];
    return {
      lock_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_lock_ref`,
          `${prefix}_lock_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['lock_ref', 'lock_refs'])),
      ]),
      source_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_source_ref`,
          `${prefix}_source_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['source_ref', 'source_refs'])),
      ]),
      project_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_project_ref`,
          `${prefix}_project_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['project_ref', 'project_refs'])),
      ]),
    };
  };
  const r = refsFor('r', ['r', 'renv']);
  const python = refsFor('python', ['python', 'uv']);
  return {
    r: {
      tool: 'renv',
      ...r,
      renv_backed_handoff: r.lock_refs.length + r.source_refs.length + r.project_refs.length > 0,
    },
    python: {
      tool: 'uv',
      ...python,
      uv_backed_handoff: python.lock_refs.length + python.source_refs.length + python.project_refs.length > 0,
    },
  };
}
