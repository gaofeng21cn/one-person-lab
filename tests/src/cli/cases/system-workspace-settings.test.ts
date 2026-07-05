import { assert, fs, os, parseJsonText, path, runCli, test } from '../helpers.ts';
import { resolveOplDeveloperModeTargetAuthority } from '../../../../src/modules/connect/developer-mode.ts';

const defaultDeveloperModePermissionsFixture = JSON.stringify({
  user: { login: 'gaofeng21cn' },
  permissions: {
    'gaofeng21cn/one-person-lab': 'admin',
    'gaofeng21cn/med-autoscience': 'write',
    'gaofeng21cn/med-autogrant': 'maintain',
    'gaofeng21cn/opl-bookforge': 'write',
    'gaofeng21cn/opl-meta-agent': 'write',
    'gaofeng21cn/redcube-ai': 'admin',
  },
});

type DeveloperModeCapabilityAssertion = {
  status: string;
  level: string;
  source: string;
  impact: string;
};

function assertCapability(
  capabilities: Record<string, DeveloperModeCapabilityAssertion>,
  capabilityId: string,
  expected: DeveloperModeCapabilityAssertion,
) {
  assert.deepEqual(capabilities[capabilityId], expected);
}

function findTargetAuthority(targets: Array<Record<string, any>>, targetAgentId: string) {
  return targets.find((entry) => entry.target_agent_id === targetAgentId) ?? null;
}

test('workspace root set persists the selected root and workspace root reads it back', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const setOutput = runCli(
      ['workspace', 'root', 'set', '--path', workspaceRoot],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(setOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(setOutput.workspace_root.health_status, 'ready');

    const readOutput = runCli(
      ['workspace', 'root'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(readOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(readOutput.workspace_root.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system update-channel reports and persists the selected release channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-channel-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'update-channel'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(initial.system_action.action, 'update_channel');
    assert.equal(initial.system_action.update_channel, 'stable');
    assert.equal(initial.system_action.status, 'ready');

    const updated = runCli(
      ['system', 'update-channel', '--channel', 'preview'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(updated.system_action.action, 'update_channel');
    assert.equal(updated.system_action.update_channel, 'preview');
    assert.equal(updated.system_action.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system developer-supervisor reports and persists the family developer mode config', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-supervisor-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'developer-supervisor'],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
      },
    ) as {
      system_action: {
        action: string;
        status: string;
        developer_supervisor: {
          enabled: string;
          mode: string;
          auto_enable_github_login: string;
          source: string;
        };
        developer_mode: {
          status: string;
          enabled: string;
          effective_state: string;
          mode: string;
          config_source: string;
          auto_enable_github_login: string;
          allowed_route: string;
          developer_profile: {
            profile_id: string;
            status: string;
            level: string;
            source: string;
            impact: string;
          };
          capabilities: Record<string, DeveloperModeCapabilityAssertion>;
          agent_authority: Record<string, any>;
          target_authority: {
            surface_kind: string;
            accepted_inputs: string[];
            standard_targets: Array<Record<string, any>>;
          };
          github_identity: {
            status: string;
            login: string | null;
            source: string;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              target_id: string;
              repo: string;
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };
    assert.equal(initial.system_action.action, 'developer_supervisor');
    assert.equal(initial.system_action.status, 'ready');
    assert.equal(initial.system_action.developer_supervisor.enabled, 'auto');
    assert.equal(initial.system_action.developer_supervisor.mode, 'developer_apply_safe');
    assert.equal(initial.system_action.developer_supervisor.auto_enable_github_login, 'gaofeng21cn');
    assert.equal(initial.system_action.developer_supervisor.source, 'default');
    assert.equal(initial.system_action.developer_mode.enabled, 'auto');
    assert.equal(initial.system_action.developer_mode.mode, 'developer_apply_safe');
    assert.equal(initial.system_action.developer_mode.config_source, 'default');
    assert.equal(initial.system_action.developer_mode.auto_enable_github_login, 'gaofeng21cn');
    assert.equal(initial.system_action.developer_mode.status, 'ready');
    assert.equal(initial.system_action.developer_mode.effective_state, 'active_direct');
    assert.deepEqual(initial.system_action.developer_mode.developer_profile, {
      profile_id: 'maintainer',
      status: 'ready',
      level: 'maintainer',
      source: 'repo_authority_direct_write',
      impact: 'May use direct repository repair routes for required OPL repos.',
    });
    assertCapability(initial.system_action.developer_mode.capabilities, 'runtime_mutation_scope', {
      status: 'blocked',
      level: 'blocked_developer_checkout_shared_state',
      source: 'explicit_user_config_required',
      impact: 'Shared runtime mutation requires enabled=on, developer_apply_safe mode, and user_config source.',
    });

    const updated = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--mode',
        'developer_apply_safe',
        '--github-login',
        'gaofeng21cn',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: defaultDeveloperModePermissionsFixture,
      },
    ) as {
      system_action: {
        action: string;
        status: string;
        developer_supervisor: {
          enabled: string;
          mode: string;
          auto_enable_github_login: string;
          source: string;
        };
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          developer_profile: {
            profile_id: string;
            status: string;
            level: string;
            source: string;
            impact: string;
          };
          capabilities: Record<string, DeveloperModeCapabilityAssertion>;
          agent_authority: Record<string, any>;
          target_authority: {
            surface_kind: string;
            accepted_inputs: string[];
            standard_targets: Array<Record<string, any>>;
          };
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              target_id: string;
              repo: string;
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };
    assert.equal(updated.system_action.status, 'completed');
    assert.equal(updated.system_action.developer_supervisor.enabled, 'on');
    assert.equal(updated.system_action.developer_supervisor.mode, 'developer_apply_safe');
    assert.equal(updated.system_action.developer_supervisor.source, 'user_config');
    assert.equal(updated.system_action.developer_mode.status, 'ready');
    assert.equal(updated.system_action.developer_mode.effective_state, 'active_direct');
    assert.equal(updated.system_action.developer_mode.allowed_route, 'direct_repo_fix');
    assert.deepEqual(updated.system_action.developer_mode.developer_profile, {
      profile_id: 'runtime_maintainer',
      status: 'ready',
      level: 'runtime_maintainer',
      source: 'repo_authority_all_direct_write',
      impact: 'may use direct repository repair routes and supervised shared runtime maintenance.',
    });
    assertCapability(updated.system_action.developer_mode.capabilities, 'source_channel', {
      status: 'ready',
      level: 'local_checkout',
      source: 'developer_mode_git_checkout_source',
      impact: 'Module source may use local developer checkouts for App and CLI read-models.',
    });
    assertCapability(updated.system_action.developer_mode.capabilities, 'workspace_trust', {
      status: 'ready',
      level: 'trusted_developer_workspace',
      source: 'user_config_developer_supervisor',
      impact: 'Developer workspace can be used for supervised Agent Lab and module checkout discovery.',
    });
    assertCapability(updated.system_action.developer_mode.capabilities, 'github_authority', {
      status: 'ready',
      level: 'direct_write',
      source: 'github_repo_permissions',
      impact: 'All required OPL repos allow direct repair branches from this identity.',
    });
    assertCapability(updated.system_action.developer_mode.capabilities, 'agent_automation', {
      status: 'ready',
      level: 'repo_repair_automation',
      source: 'developer_supervisor_mode',
      impact: 'Agent Lab can expose supervised repository repair routes.',
    });
    assertCapability(updated.system_action.developer_mode.capabilities, 'runtime_mutation_scope', {
      status: 'ready',
      level: 'shared_runtime_maintenance',
      source: 'explicit_developer_supervisor_user_config',
      impact: 'Shared runtime provider maintenance actions may be offered from developer checkout surfaces.',
    });
    assert.equal(updated.system_action.developer_mode.github_identity.status, 'ready');
    assert.equal(updated.system_action.developer_mode.github_identity.login, 'gaofeng21cn');
    assert.equal(updated.system_action.developer_mode.repo_authority.status, 'ready');
    assert.equal(
      updated.system_action.developer_mode.agent_authority.self_evolution_repo_mutation_requires_developer_mode,
      true,
    );
    assert.equal(
      updated.system_action.developer_mode.agent_authority.manual_enable_without_repo_write_cannot_grant_direct_write,
      true,
    );
    assert.equal(
      updated.system_action.developer_mode.agent_authority.route_matrix.find(
        (entry: { case_id: string }) => entry.case_id === 'authorized_agent_repo',
      )?.route,
      'direct_repo_fix',
    );
    const masTargetAuthority = findTargetAuthority(
      updated.system_action.developer_mode.target_authority.standard_targets,
      'mas',
    );
    assert.equal(updated.system_action.developer_mode.target_authority.surface_kind, 'opl_developer_mode_target_authority_resolver');
    assert.deepEqual(updated.system_action.developer_mode.target_authority.accepted_inputs, [
      'target_agent_id',
      'target_repo_id',
      'target_repo_url',
    ]);
    assert.equal(masTargetAuthority?.target_repo_id, 'gaofeng21cn/med-autoscience');
    assert.equal(masTargetAuthority?.developer_identity_class, 'opl_maintainer');
    assert.equal(masTargetAuthority?.allowed_route, 'direct_repo_fix');
    assert.equal(masTargetAuthority?.direct_write_allowed, true);
    assert.deepEqual(
      updated.system_action.developer_mode.repo_authority.repos.map((entry) => entry.repo).sort(),
      [
        'gaofeng21cn/med-autogrant',
        'gaofeng21cn/med-autoscience',
        'gaofeng21cn/one-person-lab',
        'gaofeng21cn/opl-bookforge',
        'gaofeng21cn/opl-meta-agent',
        'gaofeng21cn/redcube-ai',
      ],
    );
    assert.equal(
      updated.system_action.developer_mode.repo_authority.repos.every((entry) => entry.direct_write_allowed),
      true,
    );
    assert.equal(
      updated.system_action.developer_mode.repo_authority.repos.every((entry) => entry.allowed_route === 'direct_repo_fix'),
      true,
    );

    const persisted = parseJsonText(
      fs.readFileSync(path.join(stateDir, 'developer-supervisor.json'), 'utf8'),
    ) as { enabled: string; mode: string; auto_enable_github_login: string };
    assert.equal(persisted.enabled, 'on');
    assert.equal(persisted.mode, 'developer_apply_safe');
    assert.equal(persisted.auto_enable_github_login, 'gaofeng21cn');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system developer-supervisor reports PR route when Developer Mode lacks direct repo authority', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-pr-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const fixture = JSON.stringify({
    user: { login: 'outside-contributor' },
    permissions: {
      'gaofeng21cn/one-person-lab': 'read',
      'gaofeng21cn/med-autoscience': 'read',
      'gaofeng21cn/med-autogrant': 'none',
      'gaofeng21cn/opl-bookforge': 'read',
      'gaofeng21cn/opl-meta-agent': 'read',
      'gaofeng21cn/redcube-ai': 'read',
    },
  });

  try {
    const output = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--github-login',
        'outside-contributor',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: fixture,
      },
    ) as {
      system_action: {
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          developer_profile: {
            profile_id: string;
            status: string;
            level: string;
            source: string;
            impact: string;
          };
          capabilities: Record<string, DeveloperModeCapabilityAssertion>;
          agent_authority: Record<string, any>;
          target_authority: {
            standard_targets: Array<Record<string, any>>;
          };
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
            repos: Array<{
              permission: string | null;
              direct_write_allowed: boolean;
              allowed_route: string;
            }>;
          };
        };
      };
    };

    assert.equal(output.system_action.developer_mode.status, 'limited');
    assert.equal(output.system_action.developer_mode.effective_state, 'active_pr_only');
    assert.equal(output.system_action.developer_mode.allowed_route, 'fork_pull_request');
    assert.deepEqual(output.system_action.developer_mode.developer_profile, {
      profile_id: 'contributor',
      status: 'limited',
      level: 'contributor',
      source: 'repo_authority_pull_request_route',
      impact: 'May prepare fork or pull request route evidence without direct repo mutation.',
    });
    assertCapability(output.system_action.developer_mode.capabilities, 'github_authority', {
      status: 'limited',
      level: 'pull_request',
      source: 'github_repo_permissions',
      impact: 'Direct writes are unavailable; repairs must route through fork or pull request evidence.',
    });
    assert.equal(output.system_action.developer_mode.github_identity.status, 'ready');
    assert.equal(output.system_action.developer_mode.github_identity.login, 'outside-contributor');
    assert.equal(output.system_action.developer_mode.repo_authority.status, 'limited');
    assert.equal(
      output.system_action.developer_mode.agent_authority.feedback_capture_requires_developer_mode,
      false,
    );
    assert.equal(
      output.system_action.developer_mode.agent_authority.manual_enable_without_repo_write_cannot_grant_direct_write,
      true,
    );
    assert.equal(
      output.system_action.developer_mode.agent_authority.activation_sources.manual_user_config.no_direct_permission_route,
      'fork_pull_request',
    );
    assert.equal(
      output.system_action.developer_mode.repo_authority.repos.every((entry) => !entry.direct_write_allowed),
      true,
    );
    assert.equal(
      output.system_action.developer_mode.repo_authority.repos.every((entry) => entry.allowed_route === 'fork_pull_request'),
      true,
    );
    const rcaTargetAuthority = findTargetAuthority(
      output.system_action.developer_mode.target_authority.standard_targets,
      'rca',
    );
    assert.equal(rcaTargetAuthority?.developer_identity_class, 'contributor');
    assert.equal(rcaTargetAuthority?.allowed_route, 'fork_pull_request');
    assert.equal(rcaTargetAuthority?.direct_write_allowed, false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('target-scoped resolver returns target agent authority for standard agents', () => {
  const fixture = JSON.stringify({
    user: { login: 'agent-owner' },
    permissions: {
      'gaofeng21cn/one-person-lab': 'read',
      'gaofeng21cn/med-autoscience': 'write',
      'gaofeng21cn/med-autogrant': 'read',
      'gaofeng21cn/opl-bookforge': 'read',
      'gaofeng21cn/opl-meta-agent': 'read',
      'gaofeng21cn/redcube-ai': 'read',
    },
  });
  const previousFixture = process.env.OPL_DEVELOPER_MODE_GH_FIXTURE;

  try {
    process.env.OPL_DEVELOPER_MODE_GH_FIXTURE = fixture;
    const output = resolveOplDeveloperModeTargetAuthority(
      { target_agent_id: 'mas' },
      {
        enabled: 'on',
        mode: 'developer_apply_safe',
        source: 'user_config',
        auto_enable_github_login: 'agent-owner',
        version: 'g1',
        updated_at: '2026-07-05T00:00:00.000Z',
      },
    );

    assert.equal(output.target_kind, 'standard_agent');
    assert.equal(output.target_agent_id, 'mas');
    assert.equal(output.target_repo_id, 'gaofeng21cn/med-autoscience');
    assert.equal(output.developer_identity_class, 'target_agent_developer');
    assert.equal(output.allowed_route, 'direct_repo_fix');
    assert.equal(output.direct_write_allowed, true);
  } finally {
    if (previousFixture === undefined) {
      delete process.env.OPL_DEVELOPER_MODE_GH_FIXTURE;
    } else {
      process.env.OPL_DEVELOPER_MODE_GH_FIXTURE = previousFixture;
    }
  }
});

test('target-scoped resolver routes explicit third-party repo through PR when direct write is missing', () => {
  const fixture = JSON.stringify({
    user: { login: 'outside-contributor' },
    permissions: {
      'gaofeng21cn/one-person-lab': 'read',
      'other-org/custom-agent': 'read',
    },
  });
  const previousFixture = process.env.OPL_DEVELOPER_MODE_GH_FIXTURE;

  try {
    process.env.OPL_DEVELOPER_MODE_GH_FIXTURE = fixture;
    const output = resolveOplDeveloperModeTargetAuthority(
      { target_repo_id: 'other-org/custom-agent' },
      {
        enabled: 'on',
        mode: 'developer_apply_safe',
        source: 'user_config',
        auto_enable_github_login: 'outside-contributor',
        version: 'g1',
        updated_at: '2026-07-05T00:00:00.000Z',
      },
    );

    assert.equal(output.target_kind, 'explicit_repo');
    assert.equal(output.target_repo_id, 'other-org/custom-agent');
    assert.equal(output.developer_identity_class, 'contributor');
    assert.equal(output.allowed_route, 'fork_pull_request');
    assert.equal(output.direct_write_allowed, false);
    assert.equal(output.manual_enable_cannot_grant_direct_write, true);
  } finally {
    if (previousFixture === undefined) {
      delete process.env.OPL_DEVELOPER_MODE_GH_FIXTURE;
    } else {
      process.env.OPL_DEVELOPER_MODE_GH_FIXTURE = previousFixture;
    }
  }
});

test('system developer-supervisor fail-closes Developer Mode when gh identity is unavailable', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-no-gh-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-empty-path-'));

  try {
    const output = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_FIXTURE: '',
        OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: '',
        OPL_DEVELOPER_MODE_REPO_PERMISSIONS_FIXTURE: '',
        PATH: emptyPath,
      },
    ) as {
      system_action: {
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          developer_profile: {
            profile_id: string;
            status: string;
            level: string;
            source: string;
            impact: string;
          };
          capabilities: Record<string, DeveloperModeCapabilityAssertion>;
          github_identity: {
            status: string;
            login: string | null;
          };
          repo_authority: {
            status: string;
          };
        };
      };
    };

    assert.equal(output.system_action.developer_mode.status, 'blocked');
    assert.equal(output.system_action.developer_mode.effective_state, 'blocked');
    assert.equal(output.system_action.developer_mode.allowed_route, 'blocked');
    assert.deepEqual(output.system_action.developer_mode.developer_profile, {
      profile_id: 'contributor',
      status: 'blocked',
      level: 'contributor',
      source: 'github_identity_unavailable',
      impact: 'Developer Mode repair and runtime mutation routes are blocked until GitHub identity is available.',
    });
    assertCapability(output.system_action.developer_mode.capabilities, 'github_authority', {
      status: 'blocked',
      level: 'blocked',
      source: 'github_identity_unavailable',
      impact: 'Cannot determine direct write or pull request authority.',
    });
    assert.equal(output.system_action.developer_mode.github_identity.status, 'unavailable');
    assert.equal(output.system_action.developer_mode.github_identity.login, null);
    assert.equal(output.system_action.developer_mode.repo_authority.status, 'blocked');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
});

test('system developer-supervisor tolerates normal gh API latency without misclassifying repo authority', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-mode-gh-latency-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gh-latency-bin-'));
  const ghPath = path.join(fakeBin, 'gh');

  fs.writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" != "api" ]]; then
  echo "unexpected gh command" >&2
  exit 2
fi
case "$2" in
  user)
    printf '{"login":"gaofeng21cn"}\\n'
    ;;
  repos/*/collaborators/*/permission)
    if [[ "$2" == "repos/gaofeng21cn/one-person-lab/collaborators/gaofeng21cn/permission" ]]; then
      sleep 1.6
    fi
    printf '{"permission":"admin"}\\n'
    ;;
  *)
    echo "unexpected gh api path: $2" >&2
    exit 2
    ;;
esac
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      [
        'system',
        'developer-supervisor',
        '--enabled',
        'on',
        '--mode',
        'developer_apply_safe',
        '--github-login',
        'gaofeng21cn',
      ],
      {
        HOME: homeRoot,
        OPL_STATE_DIR: stateDir,
        OPL_DEVELOPER_MODE_GH_BINARY: ghPath,
        OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE: 'gaofeng21cn',
        OPL_DEVELOPER_MODE_GH_TIMEOUT_MS: '',
      },
    ) as {
      system_action: {
        developer_mode: {
          status: string;
          effective_state: string;
          allowed_route: string;
          repo_authority: {
            status: string;
            direct_write_repo_count: number;
            blocked_repo_count: number;
          };
        };
      };
    };

    assert.equal(output.system_action.developer_mode.status, 'ready');
    assert.equal(output.system_action.developer_mode.effective_state, 'active_direct');
    assert.equal(output.system_action.developer_mode.allowed_route, 'direct_repo_fix');
    assert.equal(output.system_action.developer_mode.repo_authority.status, 'ready');
    assert.equal(output.system_action.developer_mode.repo_authority.direct_write_repo_count, 6);
    assert.equal(output.system_action.developer_mode.repo_authority.blocked_repo_count, 0);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});
