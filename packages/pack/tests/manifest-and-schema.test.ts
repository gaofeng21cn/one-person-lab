import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PackError,
  generatePackageManifestV2JsonSchema,
  parsePackageManifestV2,
  syncPackageManifestV2SchemaFile,
} from '../src/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaFilePath = path.join(repoRoot, 'contracts', 'opl-package.v2.schema.json');

const SAMPLE_A_MAS = {
  schema_version: 'opl.package.v2',
  identity: {
    id: 'mas',
    version: '0.4.0',
    intent: 'agent',
    name: { 'zh-CN': 'Med Auto Science', 'en-US': 'Med Auto Science' },
    summary: {
      'zh-CN': '医学研究选题、文献分析、数据分析、论文写作、审稿、返修与投稿。',
      'en-US':
        'Medical research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
    },
    publisher: 'one-person-lab',
    license: 'Apache-2.0',
    icon: 'assets/branding/medautoscience-logo.png',
    repository: 'https://github.com/gaofeng21cn/med-autoscience',
    maturity: 'stable',
    routing_summary: {
      'zh-CN': '科研、论文、数据分析、审稿、返修和投稿',
      'en-US': 'research, papers, data analysis, peer review, revision, and submission',
    },
    default_prompts: [
      'Select the MAS Stage action for this research question.',
      'Review the available evidence and return the next owner route.',
      'Prepare a publication handoff with explicit quality debt and blockers.',
    ],
    home_shortcuts: [
      {
        id: 'research',
        label: { 'zh-CN': '开展科研工作', 'en-US': 'Research' },
        default_visible: true,
        target: { kind: 'agent', ref: 'mas' },
      },
    ],
  },
  dependencies: {
    opl_base: '^2.0.0',
    packages: [{ id: 'mas-scholar-skills', version: '^0.3.0' }],
    runtimes: [{ name: 'python', version: '>=3.11' }],
  },
  permissions: {
    workspace: {
      access: 'read_write',
      reason: {
        'zh-CN': '读取研究数据并写入分析脚本、图表与论文手稿',
        'en-US': 'Read study data and write scripts, figures, and manuscripts',
      },
    },
    knowledge: [
      {
        scope: 'long_term_topic',
        access: 'read',
        required: false,
        reason: {
          'zh-CN': '按需引用个人文献笔记与科研规范',
          'en-US': 'Reference personal literature notes and lab standards on demand',
        },
      },
    ],
    network: 'outbound_api',
    execution_mode: 'local_subprocess',
  },
  provides: {
    agent: {
      stages_ref: 'agent/stages/manifest.json',
      authority_entrypoint: {
        kind: 'cli',
        argv: ['./bin/mas-authority', '--json'],
        transport: 'stdin_json_stdout_json',
      },
    },
    skills: [{ id: 'med-autoscience', path: './skills/med-autoscience', exposure: 'default' }],
    contribution_handler: {
      kind: 'cli',
      argv: ['./bin/mas-contribution', '--stdin'],
      transport: 'stdin_json_stdout_json',
    },
  },
  ui: {
    declarative: {
      views: [
        {
          id: 'mas.runtime-detail',
          view_type: 'activity_log',
          slot: 'runtime.detail',
          title: { 'zh-CN': '论文任务详情', 'en-US': 'Paper mission detail' },
          data_ref: 'mas.runtime-detail#current',
          empty_state: {
            'zh-CN': '当前论文任务没有可投影的 MAS 状态',
            'en-US': 'No MAS state available for this mission',
          },
        },
      ],
    },
  },
  distribution: {
    oci: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas',
    visibility: 'public',
  },
  host_hints: {
    codex: {
      plugin_name: 'med-autoscience',
      category: 'Research',
      brand_color: '#1F7A8C',
    },
  },
};

const SAMPLE_B_RELAY = {
  schema_version: 'opl.package.v2',
  identity: {
    id: 'opl-relay',
    version: '0.8.0',
    intent: 'app',
    name: { 'zh-CN': 'OPL Relay', 'en-US': 'OPL Relay' },
    summary: {
      'zh-CN': '本地优先邮件中继、智能分拣与草稿审阅工作台。',
      'en-US': 'Local-first mail relay, triage, and draft review workbench.',
    },
    publisher: 'one-person-lab',
    icon: 'assets/icon.png',
    repository: 'https://github.com/gaofeng21cn/opl-relay',
  },
  permissions: {
    knowledge: [
      {
        scope: 'personal_profile',
        access: 'propose_writeback',
        required: false,
        reason: {
          'zh-CN': '整理联系人与邮件摘要建议',
          'en-US': 'Propose contact and mail memory summaries',
        },
      },
    ],
    network: 'outbound_api',
    execution_mode: 'local_subprocess',
  },
  provides: {
    skills: [{ id: 'opl-relay', path: './skills/opl-relay', exposure: 'opt_in' }],
    mcp_servers: [
      { id: 'relay-mcp', transport: 'stdio', command: './bin/opl-relay', args: ['mcp'] },
    ],
    connection_providers: [
      {
        provider_type: 'opl-relay.mailbox',
        entrypoint: {
          kind: 'cli',
          argv: ['./bin/opl-relay', '--json', 'connect-provider'],
          transport: 'stdin_json_stdout_json',
        },
        capabilities: [
          {
            id: 'mailbox.search',
            title: { 'zh-CN': '检索本地邮件', 'en-US': 'Search local mail' },
            risk: 'read',
          },
          {
            id: 'mailbox.read',
            title: { 'zh-CN': '读取邮件正文', 'en-US': 'Read mail content' },
            risk: 'read',
          },
          {
            id: 'draft.create',
            title: { 'zh-CN': '创建待审邮件草稿（不发送）', 'en-US': 'Create review draft (no send)' },
            risk: 'local_write',
          },
        ],
      },
    ],
    contribution_handler: {
      kind: 'cli',
      argv: ['./bin/opl-relay', '--json', 'app-contribution'],
      transport: 'stdin_json_stdout_json',
    },
  },
  ui: {
    mcp_apps: [
      {
        id: 'relay.workbench',
        title: { 'zh-CN': '邮件协作工作台', 'en-US': 'Mail Workbench' },
        mcp_server_id: 'relay-mcp',
        resource_uri: 'ui://opl-relay/workbench',
        host_capabilities: ['theme_sync', 'connect_package_grant'],
      },
    ],
  },
  distribution: {
    oci: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-relay',
    visibility: 'public',
  },
};

const SAMPLE_C_WEIXIN = {
  schema_version: 'opl.package.v2',
  identity: {
    id: 'opl-channel-weixin',
    version: '0.3.0',
    intent: 'channel',
    name: { 'zh-CN': '微信远程通道', 'en-US': 'Weixin Channel' },
    summary: {
      'zh-CN': '通过微信接收与转发任务消息（仅传递内容，不另建会话真相）。',
      'en-US': 'Receive and forward task messages via Weixin.',
    },
    publisher: 'one-person-lab',
  },
  permissions: { network: 'outbound_api', execution_mode: 'in_process' },
  provides: {
    channels: [
      {
        channel_id: 'weixin',
        entrypoint: {
          kind: 'esm_module',
          module: './dist/index.js',
          export: 'createWeixinChannelProvider',
        },
      },
    ],
    contribution_handler: {
      kind: 'esm_module',
      module: './dist/index.js',
      export: 'handleWeixinContribution',
    },
  },
  ui: {
    declarative: {
      views: [
        {
          id: 'weixin.access',
          view_type: 'channel_access',
          slot: 'settings.section',
          settings_destination: 'resources',
          title: { 'zh-CN': '微信连接', 'en-US': 'Weixin' },
          data_ref: 'weixin.channel-access#state',
          actions: [
            {
              id: 'connect',
              label: { 'zh-CN': '连接本人微信', 'en-US': 'Connect own Weixin' },
              action_ref: 'weixin#connect',
              effect_timing: 'immediate',
            },
            {
              id: 'disconnect',
              label: { 'zh-CN': '退出微信', 'en-US': 'Disconnect' },
              action_ref: 'weixin#disconnect',
              confirm: true,
              effect_timing: 'immediate',
            },
          ],
        },
      ],
    },
  },
  distribution: {
    oci: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-channel-weixin',
    visibility: 'public',
  },
  host_hints: { codex: { sync_enabled: false } },
};

const SAMPLE_D_FOUNDRY = {
  schema_version: 'opl.package.v2',
  identity: {
    id: 'opl-foundry',
    version: '2.0.0',
    intent: 'extension',
    name: { 'zh-CN': 'OPL Foundry（智能体工坊）', 'en-US': 'OPL Foundry' },
    summary: {
      'zh-CN': '面向智能体开发者的脚手架生成、合规检查、基准评测、灰度与回滚套件。',
      'en-US': 'Agent scaffolding, conformance checks, benchmarking, canary, and rollback toolkit.',
    },
    publisher: 'one-person-lab',
  },
  dependencies: { opl_base: '^2.0.0' },
  permissions: {
    workspace: {
      access: 'read_write',
      reason: {
        'zh-CN': '生成与检查智能体代码仓与评测快照',
        'en-US': 'Scaffold and evaluate agent repositories',
      },
    },
    network: 'none',
    execution_mode: 'in_process',
  },
  provides: {
    cli_extensions: [
      {
        namespace: 'foundry',
        entrypoint: { kind: 'esm_module', module: './dist/cli.js', export: 'registerFoundryCli' },
      },
    ],
    skills: [
      { id: 'opl-foundry-builder', path: './skills/opl-foundry-builder', exposure: 'opt_in' },
    ],
  },
  distribution: {
    oci: 'ghcr.io/gaofeng21cn/one-person-lab-packages/opl-foundry',
    visibility: 'public',
  },
};

test('validates all spec-01 Samples A-D against Zod SSOT and generated JSON Schema parity', () => {
  const parity = syncPackageManifestV2SchemaFile(schemaFilePath, { check: true });
  assert.equal(parity.upToDate, true, 'contracts/opl-package.v2.schema.json must match Zod SSOT');

  const jsonSchema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8')) as Record<string, unknown>;
  assert.equal(jsonSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(jsonSchema.additionalProperties, false);
  const defs = jsonSchema.$defs as Record<string, unknown>;
  assert.ok(defs.I18nText);
  assert.ok(defs.CommandEntrypoint);
  assert.ok(defs.ModuleEntrypoint);
  assert.ok(defs.SettingsDestination);
  assert.equal(Object.keys(defs).some((k) => k.startsWith('__schema')), false);

  const generated = generatePackageManifestV2JsonSchema();
  assert.deepEqual(jsonSchema, generated);

  for (const sample of [SAMPLE_A_MAS, SAMPLE_B_RELAY, SAMPLE_C_WEIXIN, SAMPLE_D_FOUNDRY]) {
    const parsed = parsePackageManifestV2(sample);
    assert.equal(parsed.schema_version, 'opl.package.v2');
  }
});

test('supports both spec-01 and PROJECT.md permissions.connections shapes and dependency presence/optional', () => {
  const valid = parsePackageManifestV2({
    schema_version: 'opl.package.v2',
    identity: {
      id: 'dual-shape-pkg',
      version: '1.0.0',
      intent: 'agent',
      name: { 'zh-CN': '双态包', 'en-US': 'Dual Shape' },
      summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
      publisher: 'one-person-lab',
    },
    dependencies: {
      packages: [
        { id: 'dep-required', presence: 'required' },
        { id: 'dep-optional', presence: 'optional', optional: true },
      ],
    },
    permissions: {
      connections: [
        {
          provider_type: 'opl-relay.mailbox',
          capabilities: ['mailbox.search'],
          optional: true,
          reason: { 'zh-CN': '搜索邮箱', 'en-US': 'Search mail' },
        },
        {
          provider_id: 'github-default',
          capability_id: 'repo.read',
          capability_title: { 'zh-CN': '读取仓库', 'en-US': 'Read repo' },
          capability_risk: 'read',
        },
      ],
    },
  });
  assert.equal(valid.dependencies?.packages?.length, 2);
  assert.equal(valid.permissions?.connections?.length, 2);

  assert.throws(
    () =>
      parsePackageManifestV2({
        ...valid,
        dependencies: {
          packages: [{ id: 'conflict-dep', optional: true, presence: 'required' }],
        },
      }),
    PackError,
  );
});

test('enforces Tier 1, Tier 2, Tier 3 UI boundaries and rejects legacy unknown fields', () => {
  const base = {
    schema_version: 'opl.package.v2',
    identity: {
      id: 'ui-test',
      version: '1.0.0',
      intent: 'app',
      name: { 'zh-CN': '界面测试', 'en-US': 'UI Test' },
      summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
      publisher: 'one-person-lab',
    },
  };

  // Legacy unknown keys rejected
  assert.throws(
    () => parsePackageManifestV2({ ...base, codex_surface: { plugin_id: 'ui-test' } }),
    PackError,
  );

  // Tier 1: views without contribution_handler rejected
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'list_detail',
                slot: 'workbench.panel',
                title: { 'zh-CN': '视图', 'en-US': 'View' },
                data_ref: 'ui-test#v1',
              },
            ],
          },
        },
      }),
    PackError,
  );

  // Tier 1: settings.section missing settings_destination rejected
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        provides: { contribution_handler: { kind: 'cli', argv: ['./bin/ui'] } },
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'settings.section',
                title: { 'zh-CN': '设置', 'en-US': 'Settings' },
                data_ref: 'ui-test#v1',
              },
            ],
          },
        },
      }),
    PackError,
  );

  // Tier 1: non-settings.section with settings_destination rejected
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        provides: { contribution_handler: { kind: 'cli', argv: ['./bin/ui'] } },
        ui: {
          declarative: {
            views: [
              {
                id: 'v1',
                view_type: 'service_status',
                slot: 'workbench.panel',
                settings_destination: 'services',
                title: { 'zh-CN': '状态', 'en-US': 'Status' },
                data_ref: 'ui-test#v1',
              },
            ],
          },
        },
      }),
    PackError,
  );

  // Tier 1: navigation targeting settings.section or reserved App settings ID rejected
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        provides: { contribution_handler: { kind: 'cli', argv: ['./bin/ui'] } },
        ui: {
          declarative: {
            navigation: [
              { id: 'models', label: { 'zh-CN': '模型', 'en-US': 'Models' }, view_id: 'v1' },
            ],
            views: [
              {
                id: 'v1',
                view_type: 'list_detail',
                slot: 'workbench.panel',
                title: { 'zh-CN': '工作台', 'en-US': 'Workbench' },
                data_ref: 'ui-test#v1',
              },
            ],
          },
        },
      }),
    PackError,
  );

  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        provides: { contribution_handler: { kind: 'cli', argv: ['./bin/ui'] } },
        ui: {
          declarative: {
            navigation: [
              { id: 'local.tab', label: { 'zh-CN': '子页签', 'en-US': 'Subtab' }, view_id: 'sec1' },
            ],
            views: [
              {
                id: 'sec1',
                view_type: 'channel_access',
                slot: 'settings.section',
                settings_destination: 'resources',
                title: { 'zh-CN': '通道', 'en-US': 'Channel' },
                data_ref: 'ui-test#sec1',
              },
            ],
          },
        },
      }),
    PackError,
  );

  // remote_companion_access accepted for @opl/connect compatibility
  const companionParsed = parsePackageManifestV2({
    ...base,
    provides: {
      contribution_handler: { kind: 'esm_module', module: './dist/index.js', export: 'handle' },
    },
    ui: {
      declarative: {
        views: [
          {
            id: 'companion.access',
            view_type: 'remote_companion_access',
            slot: 'settings.section',
            settings_destination: 'resources',
            title: { 'zh-CN': '伴随连接', 'en-US': 'Companion' },
            data_ref: 'companion#state',
          },
        ],
      },
    },
  });
  assert.equal(companionParsed.ui?.declarative?.views?.[0]?.view_type, 'remote_companion_access');

  // Tier 2: dsh_client rejects vendor/ path and duplicate slots
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        ui: {
          dsh_client: {
            client_entry: 'vendor/entry.js',
            slots: ['main'],
          },
        },
      }),
    PackError,
  );
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        ui: {
          dsh_client: {
            client_entry: 'dist/client.js',
            slots: ['main', 'main'],
          },
        },
      }),
    PackError,
  );

  // Tier 3: mcp_apps requires declared mcp_server_id and ui:// URI
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        ui: {
          mcp_apps: [
            {
              id: 'mini',
              title: { 'zh-CN': '微应用', 'en-US': 'Mini' },
              mcp_server_id: 'missing-server',
              resource_uri: 'ui://ui-test/app',
            },
          ],
        },
      }),
    PackError,
  );
  assert.throws(
    () =>
      parsePackageManifestV2({
        ...base,
        provides: {
          mcp_servers: [{ id: 'srv', transport: 'stdio', command: './bin/srv' }],
        },
        ui: {
          mcp_apps: [
            {
              id: 'mini',
              title: { 'zh-CN': '微应用', 'en-US': 'Mini' },
              mcp_server_id: 'srv',
              resource_uri: 'https://example.com/not-ui-scheme',
            },
          ],
        },
      }),
    PackError,
  );
});

test('enforces plugin_name & path regexes in JSON Schema and rejects duplicate capability IDs', () => {
  const base = {
    schema_version: 'opl.package.v2',
    identity: {
      id: 'dup-check',
      version: '1.0.0',
      intent: 'extension',
      name: { 'zh-CN': '测试', 'en-US': 'Test' },
      summary: { 'zh-CN': '摘要', 'en-US': 'Summary' },
      publisher: 'one-person-lab',
    },
  };

  // plugin_name traversal & unsafe characters rejected
  for (const badName of ['../../victim', 'foo/bar', 'foo\\bar', '.', '..', '-leading', 'a..b']) {
    assert.throws(
      () =>
        parsePackageManifestV2({
          ...base,
          host_hints: { codex: { plugin_name: badName } },
        }),
      PackError,
    );
  }
  const goodPluginName = parsePackageManifestV2({
    ...base,
    host_hints: { codex: { plugin_name: 'safe.plugin_1-0' } },
  });
  assert.equal(goodPluginName.host_hints?.codex?.plugin_name, 'safe.plugin_1-0');

  // JSON Schema carries regex patterns for plugin_name, RelativePosixPath, DshEntryPath
  const jsonSchema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8')) as {
    properties: {
      identity: { properties: { icon: { pattern?: string } } };
      ui: {
        properties: {
          dsh_client: {
            properties: {
              client_entry: { pattern?: string };
              host_entry: { pattern?: string };
            };
          };
        };
      };
      host_hints: {
        properties: {
          codex: { properties: { plugin_name: { pattern?: string } } };
        };
      };
    };
  };
  const iconRe = new RegExp(jsonSchema.properties.identity.properties.icon.pattern!, 'u');
  assert.equal(iconRe.test('assets/icon.png'), true);
  assert.equal(iconRe.test('./assets/icon.png'), true);
  assert.equal(iconRe.test('../../etc/passwd'), false);
  assert.equal(iconRe.test('C:\\Windows\\system32'), false);

  const dshRe = new RegExp(jsonSchema.properties.ui.properties.dsh_client.properties.client_entry.pattern!, 'u');
  assert.equal(dshRe.test('./dist/client.js'), true);
  assert.equal(dshRe.test('vendor/bad.js'), false);
  assert.equal(dshRe.test('./dist/vendor/bad.js'), false);

  const pluginRe = new RegExp(jsonSchema.properties.host_hints.properties.codex.properties.plugin_name.pattern!, 'u');
  assert.equal(pluginRe.test('valid-plugin_1.0'), true);
  assert.equal(pluginRe.test('../../victim'), false);
  assert.equal(pluginRe.test('a..b'), false);

  // Duplicate IDs across provides arrays
  const duplicatePayloads: Array<Record<string, unknown>> = [
    {
      skills: [
        { id: 's1', path: './skills/a' },
        { id: 's1', path: './skills/b' },
      ],
    },
    {
      cli_bin: [
        { name: 'tool', path: 'bin/a' },
        { name: 'tool', path: 'bin/b' },
      ],
    },
    {
      channels: [
        { channel_id: 'ch1', entrypoint: { kind: 'esm_module', module: './a.js', export: 'a' } },
        { channel_id: 'ch1', entrypoint: { kind: 'esm_module', module: './b.js', export: 'b' } },
      ],
    },
    {
      remote_companion_connectors: [
        { channel_id: 'rc1', entrypoint: { kind: 'esm_module', module: './a.js', export: 'a' } },
        { channel_id: 'rc1', entrypoint: { kind: 'esm_module', module: './b.js', export: 'b' } },
      ],
    },
    {
      executors: [
        { executor_id: 'ex1', entrypoint: { kind: 'esm_module', module: './a.js', export: 'a' } },
        { executor_id: 'ex1', entrypoint: { kind: 'esm_module', module: './b.js', export: 'b' } },
      ],
    },
    {
      cli_extensions: [
        { namespace: 'ns1', entrypoint: { kind: 'cli', argv: ['./bin/a'] } },
        { namespace: 'ns1', entrypoint: { kind: 'cli', argv: ['./bin/b'] } },
      ],
    },
    {
      connection_providers: [
        {
          provider_type: 'prov.a',
          entrypoint: { kind: 'cli', argv: ['./bin/a'] },
          capabilities: [{ id: 'c1', title: { 'zh-CN': 'A', 'en-US': 'A' }, risk: 'read' }],
        },
        {
          provider_type: 'prov.a',
          entrypoint: { kind: 'cli', argv: ['./bin/b'] },
          capabilities: [{ id: 'c2', title: { 'zh-CN': 'B', 'en-US': 'B' }, risk: 'read' }],
        },
      ],
    },
  ];
  for (const provides of duplicatePayloads) {
    assert.throws(() => parsePackageManifestV2({ ...base, provides }), PackError);
  }
});
