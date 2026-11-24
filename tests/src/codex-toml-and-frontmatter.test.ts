import assert from 'node:assert/strict';
import test from 'node:test';
import { parse as parseToml } from 'smol-toml';

import {
  parseTomlDocumentBlocks,
  parseTomlTablePath,
  readMcpServerConfigFromToml,
  removeRootTomlKeys,
  removeTomlTables,
  sameTomlTablePath,
  upsertTomlTable,
  upsertTomlTableKeys,
} from '../../src/kernel/codex-toml-document.ts';
import {
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from '../../src/kernel/frontmatter.ts';

test('codex TOML helpers preserve user comments, array tables, and unrelated tables losslessly', () => {
  const original = [
    '# Top user comment',
    'model = "gpt-5" # user model comment',
    'model_provider = "user-custom"',
    'custom_flag = true # keep this root setting',
    '',
    '# Keep user project comment',
    '[projects."/Users/me/my.repo"]',
    'trust_level = "trusted" # inline comment',
    '',
    '[marketplaces.stale-local]',
    'source_type = "local"',
    'source = "/tmp/stale"',
    '',
    '# Keep comment attached to next table',
    '[mcp_servers.user-tool]',
    'command = "my-tool"',
    'args = ["--port", "8080"]',
    '',
    '[[custom_hooks]]',
    'name = "keep-array-table"',
    '',
  ].join('\n');

  assert.deepEqual(parseTomlTablePath('[plugins."med-autoscience@opl-local"] # note'), [
    'plugins',
    'med-autoscience@opl-local',
  ]);
  assert.equal(parseTomlTablePath('[[custom_hooks]]'), null);

  const withoutStale = removeTomlTables(original, (table) =>
    sameTomlTablePath(table.path, ['marketplaces', 'stale-local']),
  );
  assert.equal(withoutStale.removed, 1);
  assert.equal(withoutStale.text.includes('# Top user comment'), true);
  assert.equal(withoutStale.text.includes('# Keep user project comment'), true);
  assert.equal(withoutStale.text.includes('# Keep comment attached to next table'), true);
  assert.equal(withoutStale.text.includes('[[custom_hooks]]'), true);
  assert.equal(withoutStale.text.includes('stale-local'), false);

  const withoutRoot = removeRootTomlKeys(withoutStale.text, new Set(['model', 'model_provider']));
  assert.equal(withoutRoot.includes('custom_flag = true # keep this root setting'), true);
  assert.equal(withoutRoot.includes('# Top user comment'), true);

  const withProvider = upsertTomlTableKeys(withoutRoot, ['model_providers', 'oplgateway'], [
    ['name', 'OPL Gateway'],
    ['base_url', 'https://gateway.medopl.com/v1'],
  ]);
  const withMcp = upsertTomlTable(withProvider, ['mcp_servers', 'opl-connect'], {
    command: 'opl',
    args: ['connect', 'mcp-stdio'],
    enabled: true,
  });

  const reparsed = parseToml(withMcp) as Record<string, any>;
  assert.equal(reparsed.custom_flag, true);
  assert.equal(reparsed.projects['/Users/me/my.repo'].trust_level, 'trusted');
  assert.equal(reparsed.model_providers.oplgateway.name, 'OPL Gateway');
  assert.equal(reparsed.custom_hooks.length, 1);
  assert.equal(reparsed.custom_hooks[0].name, 'keep-array-table');
  assert.deepEqual(readMcpServerConfigFromToml(withMcp, 'opl-connect'), {
    present: true,
    command: 'opl',
    args: ['connect', 'mcp-stdio'],
    enabled: true,
  });
  assert.equal(withMcp.includes('# Keep comment attached to next table'), true);
  assert.equal(withMcp.includes('trust_level = "trusted" # inline comment'), true);

  const blocks = parseTomlDocumentBlocks(withMcp);
  const projectBlock = blocks.tables.find((table) => table.header === 'projects./Users/me/my.repo');
  assert.equal(projectBlock?.values.trust_level, 'trusted');
});

test('markdown frontmatter helper handles YAML block scalars, lists, duplicate keys, and roundtrip rendering', () => {
  const markdown = [
    '---',
    'name: demo-skill',
    'description: >',
    '  Multi-line folded',
    '  description text.',
    'tags:',
    '  - alpha',
    '  - beta',
    'required_environment_variables:',
    '  - name: DEMO_API_KEY',
    '---',
    '# Heading',
    '',
    'Body paragraph.',
    '',
  ].join('\n');

  const parsed = parseMarkdownFrontmatter(markdown);
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.parseable, true);
  assert.equal(parsed.duplicateKeys, false);
  assert.equal(parsed.data?.name, 'demo-skill');
  assert.equal(String(parsed.data?.description).trim(), 'Multi-line folded description text.');
  assert.deepEqual(parsed.data?.tags, ['alpha', 'beta']);
  assert.deepEqual(parsed.data?.required_environment_variables, [{ name: 'DEMO_API_KEY' }]);
  assert.equal(parsed.body.trim(), '# Heading\n\nBody paragraph.');

  const duplicated = parseMarkdownFrontmatter('---\nname: one\nname: two\ndescription: ok\n---\n');
  assert.equal(duplicated.parseable, true);
  assert.equal(duplicated.duplicateKeys, true);
  assert.equal(duplicated.data?.name, 'one');

  const rendered = stringifyMarkdownFrontmatter({
    id: 'concept-1',
    tags: ['opl', 'okf'],
    authority_boundary: { opl_can_write_memory_body: false },
  });
  assert.equal(rendered.includes('memory_body:'), false);
  const reparsed = parseMarkdownFrontmatter(`${rendered}\n\n# Body\n`);
  assert.equal(reparsed.parseable, true);
  assert.deepEqual(reparsed.data?.tags, ['opl', 'okf']);
  assert.deepEqual(reparsed.data?.authority_boundary, { opl_can_write_memory_body: false });
});
