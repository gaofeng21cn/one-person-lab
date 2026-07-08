import { fs, path, shellSingleQuote } from '../helpers.ts';

type NativeHelperFixtureOptions = {
  artifactTotalFilesCount?: number;
  doctorChecks?: boolean;
  includeVersionFields?: boolean;
};

export function writeNativeHelperFixtureScripts(
  helperBinDir: string,
  options: NativeHelperFixtureOptions = {},
) {
  fs.mkdirSync(helperBinDir, { recursive: true });
  const common = options.includeVersionFields
    ? {
        helper_version: '0.1.0',
        crate_name: 'opl-native-helper',
        crate_version: '0.1.0',
      }
    : {};
  const payloads = {
    'opl-doctor-native': {
      ...common,
      helper_id: 'opl-doctor-native',
      request_id: 'runtime-manager-doctor',
      result: options.doctorChecks
        ? { surface_kind: 'native_doctor_snapshot', checks: [{ check_id: 'json_stdio_protocol', status: 'ok' }] }
        : { surface_kind: 'native_doctor_snapshot' },
    },
    'opl-runtime-watch': {
      ...common,
      helper_id: 'opl-runtime-watch',
      request_id: 'runtime-manager-runtime-watch',
      result: { surface_kind: 'runtime_health_snapshot_index', roots: [] },
    },
    'opl-artifact-indexer': {
      ...common,
      helper_id: 'opl-artifact-indexer',
      request_id: 'runtime-manager-artifact-index',
      result: {
        surface_kind: 'native_artifact_manifest',
        summary: { total_files_count: options.artifactTotalFilesCount ?? 1 },
        files: [],
      },
    },
    'opl-state-indexer': {
      ...common,
      helper_id: 'opl-state-indexer',
      request_id: 'runtime-manager-state-index',
      result: {
        surface_kind: 'native_state_index',
        roots: [],
        json_validation: { checked_files_count: 0, invalid_files_count: 0, files: [] },
      },
    },
  };

  for (const [binary, payload] of Object.entries(payloads)) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/bin/sh
cat >/dev/null
printf '%s\\n' ${shellSingleQuote(JSON.stringify({
        protocol_version: 'opl_native_helper.v1',
        ok: true,
        errors: [],
        ...payload,
      }))}
`,
      { mode: 0o755 },
    );
  }
}
