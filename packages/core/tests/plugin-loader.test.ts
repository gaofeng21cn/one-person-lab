import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { KernelError, PluginLoader } from '../src/index.ts';

test('PluginLoader resolves topological order and runs init -> start -> reverse dispose', async () => {
  const events: string[] = [];
  const loader = new PluginLoader();

  loader.register({
    id: 'plugin-c',
    dependencies: ['plugin-b'],
    init: (ctx) => {
      events.push(`init:c:${ctx.getService<string>('svc:b')}`);
      ctx.onDispose(() => events.push('hook:c:1'));
      ctx.onDispose(() => events.push('hook:c:2'));
    },
    start: () => {
      events.push('start:c');
    },
    dispose: () => {
      events.push('dispose:c');
    },
  });

  loader.register({
    id: 'plugin-a',
    init: (ctx) => {
      events.push('init:a');
      ctx.registerService('svc:a', 'alpha');
    },
    start: () => {
      events.push('start:a');
    },
    dispose: () => {
      events.push('dispose:a');
    },
  });

  loader.register({
    id: 'plugin-b',
    dependencies: ['plugin-a'],
    init: (ctx) => {
      const a = ctx.getService<string>('svc:a');
      events.push(`init:b:${a}`);
      ctx.registerService('svc:b', `${a}+beta`);
    },
    start: () => {
      events.push('start:b');
    },
    dispose: () => {
      events.push('dispose:b');
    },
  });

  assert.deepEqual(loader.resolveOrder(), ['plugin-a', 'plugin-b', 'plugin-c']);

  await loader.initAll();
  await loader.startAll();
  const { errors } = await loader.disposeAll();

  assert.equal(errors.length, 0);
  assert.deepEqual(events, [
    'init:a',
    'init:b:alpha',
    'init:c:alpha+beta',
    'start:a',
    'start:b',
    'start:c',
    'hook:c:2',
    'hook:c:1',
    'dispose:c',
    'dispose:b',
    'dispose:a',
  ]);
});

test('PluginLoader detects duplicate, missing dependency, and cycle errors', () => {
  const dupLoader = new PluginLoader();
  dupLoader.register({ id: 'p1' });
  assert.throws(
    () => dupLoader.register({ id: 'p1' }),
    (err: unknown) => err instanceof KernelError && err.code === 'PLUGIN_DUPLICATE',
  );

  const missingLoader = new PluginLoader();
  missingLoader.register({ id: 'p1', dependencies: ['missing-dep'] });
  assert.throws(
    () => missingLoader.resolveOrder(),
    (err: unknown) => err instanceof KernelError && err.code === 'PLUGIN_DEPENDENCY_MISSING',
  );

  const cycleLoader = new PluginLoader();
  cycleLoader.register({ id: 'a', dependencies: ['b'] });
  cycleLoader.register({ id: 'b', dependencies: ['a'] });
  assert.throws(
    () => cycleLoader.resolveOrder(),
    (err: unknown) =>
      err instanceof KernelError
      && err.code === 'PLUGIN_DEPENDENCY_CYCLE'
      && Array.isArray(err.details.cycle),
  );
});

test('PluginLoader isolateErrors quarantines failed plugin and its dependents while keeping siblings alive', async () => {
  const loader = new PluginLoader();
  loader.register({
    id: 'bad-root',
    init: () => {
      throw new Error('init-boom');
    },
  });
  loader.register({
    id: 'bad-child',
    dependencies: ['bad-root'],
    init: () => {},
  });
  loader.register({
    id: 'healthy-sibling',
    init: (ctx) => {
      ctx.registerService('healthy', true);
    },
    start: () => {},
  });

  await loader.initAll({ isolateErrors: true });
  await loader.startAll({ isolateErrors: true });

  assert.equal(loader.getStatus('bad-root'), 'failed');
  assert.equal(loader.getStatus('bad-child'), 'failed');
  assert.equal(loader.getStatus('healthy-sibling'), 'started');
  assert.equal(loader.tryGetService<boolean>('healthy'), true);
});

test('PluginLoader loadFromModule dynamically imports a module plugin', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-plugin-mod-'));
  try {
    const modPath = path.join(tmpDir, 'sample-plugin.mjs');
    fs.writeFileSync(
      modPath,
      "export const plugin = { id: 'dynamic-sample', init(ctx) { ctx.registerService('loaded', 123); } };\n",
      'utf8',
    );
    const loader = new PluginLoader();
    const def = await loader.loadFromModule(pathToFileURL(modPath).href);
    assert.equal(def.id, 'dynamic-sample');
    await loader.startAll();
    assert.equal(loader.getService<number>('loaded'), 123);
    await loader.disposeAll();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PluginLoader startAll initializes late-registered plugins before starting any plugin', async () => {
  const trace: string[] = [];
  const loader = new PluginLoader();
  loader.register({
    id: 'a',
    init: () => {
      trace.push('a:init');
    },
    start: () => {
      trace.push('a:start');
    },
  });
  await loader.initAll();

  loader.register({
    id: 'b',
    init: () => {
      trace.push('b:init');
    },
    start: () => {
      trace.push('b:start');
    },
  });
  await loader.startAll();
  assert.deepEqual(trace, ['a:init', 'b:init', 'a:start', 'b:start']);
});
