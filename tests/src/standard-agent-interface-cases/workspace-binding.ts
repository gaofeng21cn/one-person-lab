import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { validateJsonSchemaPayload } from '../../../src/kernel/schema-registry.ts';
import { parseStandardAgentInterface } from '../../../src/kernel/standard-agent-interface.ts';
import { fixture } from './descriptor-and-source-material.ts';

const schema = JSON.parse(fs.readFileSync(new URL(
  '../../../contracts/opl-framework/standard-agent-interface.schema.json', import.meta.url,
), 'utf8'));
const validate = (value: unknown) => validateJsonSchemaPayload({ schemaId: schema.$id, schema }, value);

function extendedWorkspaceInterface() {
  return {
    ...fixture(),
    workspace_binding: {
      ...fixture().workspace_binding,
      display_names: { zh: '领域工作区' },
      domain_metadata: { revision: 2, capabilities: ['visual_memory'] },
      shared_resources: [{
        path: 'shared/visual_memory', role: 'visual_memory',
        description: 'Reusable visual references', owner_metadata: { source: 'domain' },
      }],
    },
  };
}

test('workspace metadata is compatible with both the parser and published schema', () => {
  const value = extendedWorkspaceInterface();
  assert.equal(validate(value).ok, true);
  const parsed = parseStandardAgentInterface(value, 'fixture');
  assert.deepEqual(parsed.workspace_binding, value.workspace_binding);
  const profile = fixture();
  assert.equal(validate(profile).ok, true);
  assert.equal(parseStandardAgentInterface(profile, 'legacy').workspace_binding.shared_resources, null);
  value.workspace_binding.shared_resources[0].path = ' shared/visual_memory ';
  value.workspace_binding.shared_resources[0].role = ' visual_memory ';
  const normalized = parseStandardAgentInterface(value, 'normalized').workspace_binding.shared_resources![0];
  assert.equal(normalized.path, 'shared/visual_memory');
  assert.equal(normalized.role, 'visual_memory');
  assert.deepEqual(normalized.owner_metadata, { source: 'domain' });
});

test('workspace metadata does not weaken known path, locator, or resource validation', () => {
  for (const invalidPath of ['../outside', '/outside', 'shared/../outside', 'shared//memory', 'shared\\memory']) {
    const value = extendedWorkspaceInterface();
    value.workspace_binding.shared_resources[0].path = invalidPath;
    assert.equal(validate(value).ok, false, invalidPath);
    assert.throws(() => parseStandardAgentInterface(value, 'fixture'), /canonical workspace-relative path/);
  }
  const wrongLocator = extendedWorkspaceInterface();
  wrongLocator.workspace_binding.required_locator_fields = ['not_a_locator'];
  assert.equal(validate(wrongLocator).ok, false);
  assert.throws(() => parseStandardAgentInterface(wrongLocator, 'fixture'), /unsupported locator field/);
  const emptyRole = extendedWorkspaceInterface();
  emptyRole.workspace_binding.shared_resources[0].role = ' ';
  assert.throws(() => parseStandardAgentInterface(emptyRole, 'fixture'), /non-empty string/);
  const duplicatePath = extendedWorkspaceInterface();
  duplicatePath.workspace_binding.shared_resources.push({
    ...duplicatePath.workspace_binding.shared_resources[0], role: 'another_role',
  });
  assert.throws(() => parseStandardAgentInterface(duplicatePath, 'fixture'), /paths must be unique/);
  const wrongType = extendedWorkspaceInterface();
  Object.assign(wrongType.workspace_binding, { shared_resources: { metadata: true } });
  assert.equal(validate(wrongType).ok, false);
  assert.throws(() => parseStandardAgentInterface(wrongType, 'fixture'), /must be an array/);
});

test('workspace extensions cannot add undeclared execution or routing controls', () => {
  for (const field of ['root', 'runtime', 'routing']) {
    const value = extendedWorkspaceInterface();
    Object.assign(field === 'root' ? value : field === 'runtime' ? value.runtime : value.routing, { private_runtime: true });
    assert.equal(validate(value).ok, false);
    assert.throws(() => parseStandardAgentInterface(value, 'fixture'), /unknown properties/);
  }
  for (const field of ['entry_command_template', 'manifest_command_template']) {
    const value = extendedWorkspaceInterface();
    Object.assign(value.workspace_binding, { [field]: ['retired', 'command'] });
    assert.equal(validate(value).ok, false);
    assert.throws(() => parseStandardAgentInterface(value, 'fixture'), /retired private command templates/);
  }
});
