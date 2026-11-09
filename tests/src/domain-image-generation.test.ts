import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { runDomainImageGeneration } from '../../src/adapters/execution/domain-task-runtime.ts';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const token = 'synthetic-sensitive-provider-token';

function fixture(t: test.TestContext, credential = `experimental_bearer_token = "${token}"`) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-image-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configPath = path.join(root, 'config.toml');
  const configure = (baseUrl = 'https://selected.invalid/v1', provider = 'selected.provider') => {
    fs.writeFileSync(configPath, `model = "gpt-test"\nmodel_provider = "${provider}"\n[model_providers."${provider}"]\nbase_url = "${baseUrl}"\n${credential}\n`);
  };
  configure();
  return { root, configPath, configure, input: { prompt: 'Draw a small circle.', output_path: path.join(root, 'image.png') } };
}

function errorIs(code: string, outcome: string) {
  return (error: any) => {
    assert.equal(error.code, 'codex_command_failed');
    assert.deepEqual(error.details, { failure_code: code, outcome, retry_allowed: false });
    assert.equal(JSON.stringify(error).includes(token), false);
    assert.equal(String(error).includes(token), false);
    return true;
  };
}

test('public image execution uses the selected provider and never returns its credential or URL', async (t) => {
  const f = fixture(t);
  const requests: { url: string; authorization: string | undefined; body: string }[] = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    requests.push({ url: req.url!, authorization: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Request-ID', token);
    res.end(JSON.stringify({ data: [{ b64_json: image.toString('base64'), revised_prompt: token }], secret: token }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}/selected/v1`;
  f.configure(baseUrl);
  const receipt = await runDomainImageGeneration(f.input, { env: { CODEX_HOME: f.root } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/selected/v1/images/generations');
  assert.equal(requests[0].authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(requests[0].body), {
    prompt: f.input.prompt, model: 'gpt-image-2', size: 'auto', quality: 'auto', background: 'auto', output_format: 'png', n: 1,
  });
  assert.deepEqual(fs.readFileSync(f.input.output_path), image);
  assert.equal(receipt.image_sha256, createHash('sha256').update(image).digest('hex'));
  assert.equal(receipt.operation, 'generate');
  assert.equal(JSON.stringify(receipt).includes(token), false);
  assert.equal(JSON.stringify(receipt).includes(baseUrl), false);
  assert.equal(fs.readFileSync(f.configPath, 'utf8').includes(token), true);
});

test('edits send reference images through the same provider and preserve caller options', async (t) => {
  const f = fixture(t, 'env_key = "SELECTED_IMAGE_TOKEN"');
  const reference = path.join(f.root, 'private-reference.png');
  fs.writeFileSync(reference, image);
  let calls = 0;
  const receipt = await runDomainImageGeneration({ ...f.input, reference_image_paths: [reference], size: '2048x1152', quality: 'high' }, {
    env: { CODEX_HOME: f.root, SELECTED_IMAGE_TOKEN: token },
    fetch: async (url, options) => {
      calls += 1;
      assert.equal(String(url), 'https://selected.invalid/v1/images/edits');
      assert.equal((options?.headers as any).Authorization, `Bearer ${token}`);
      assert.equal(options?.redirect, 'error');
      const form = options?.body as FormData;
      assert.equal(form.get('size'), '2048x1152');
      assert.equal(form.get('quality'), 'high');
      const uploaded = form.get('image[]') as File;
      assert.equal(uploaded.name, 'reference-1.png');
      assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), image);
      return Response.json({ data: [{ b64_json: image.toString('base64') }] });
    },
  });
  assert.equal(calls, 1);
  assert.equal(receipt.operation, 'edit');
});

test('each invocation resolves the currently selected provider; all supported credential forms stay internal', async (t) => {
  for (const credential of [`api_key = '${token}'`, `experimental_bearer_token = """${token}"""`, 'env_key = "ACTIVE_KEY"']) {
    const f = fixture(t, credential);
    let expected = 'first';
    const run = () => runDomainImageGeneration({ ...f.input, output_path: path.join(f.root, `${expected}.png`) }, {
      env: { CODEX_HOME: f.root, ACTIVE_KEY: token },
      fetch: async (url, options) => {
        assert.equal(String(url), `https://${expected}.invalid/v1/images/generations`);
        assert.equal((options?.headers as any).Authorization, `Bearer ${token}`);
        return Response.json({ data: [{ b64_json: image.toString('base64') }] });
      },
    });
    f.configure('https://first.invalid/v1', 'first');
    await run();
    expected = 'second';
    f.configure('https://second.invalid/v1', 'second');
    await run();
  }
});

test('selected runtime with missing config never falls back to the personal home or another provider', async (t) => {
  const f = fixture(t);
  const personalHome = path.join(f.root, 'personal');
  fs.mkdirSync(path.join(personalHome, '.codex'), { recursive: true });
  fs.copyFileSync(f.configPath, path.join(personalHome, '.codex', 'config.toml'));
  let called = false;
  await assert.rejects(runDomainImageGeneration(f.input, {
    env: { CODEX_HOME: path.join(f.root, 'missing'), HOME: personalHome },
    fetch: async () => { called = true; throw new Error(token); },
  }), errorIs('image_provider_unavailable', 'not_started'));
  assert.equal(called, false);
});

test('malformed config and unsupported credential routes fail before dispatch without parser source values', async (t) => {
  const f = fixture(t);
  for (const content of [`model_provider = "${token}`, `model_provider = "absent"\n[model_providers.other]\nbase_url = "https://other.invalid"\napi_key = "${token}"`]) {
    fs.writeFileSync(f.configPath, content);
    await assert.rejects(runDomainImageGeneration(f.input, {
      config_path: f.configPath,
      fetch: async () => { assert.fail('must not dispatch'); },
    }), errorIs('image_provider_unavailable', 'not_started'));
  }
});

test('transport uncertainty, provider rejection and invalid success output are redacted and never retried', async (t) => {
  const f = fixture(t);
  const cases = [
    { fetch: async () => { throw new Error(token); }, code: 'image_generation_unknown', outcome: 'unknown' },
    { fetch: async () => new Response(token, { status: 401 }), code: 'image_provider_rejected', outcome: 'rejected' },
    { fetch: async () => new Response(token, { status: 503 }), code: 'image_provider_rejected', outcome: 'unknown' },
    { fetch: async () => Response.json({ data: [{ url: `https://invalid/${token}` }] }), code: 'image_response_invalid', outcome: 'unknown' },
  ];
  for (const item of cases) {
    let calls = 0;
    await assert.rejects(runDomainImageGeneration(f.input, {
      config_path: f.configPath,
      fetch: async () => { calls += 1; return item.fetch(); },
    }), errorIs(item.code, item.outcome));
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(f.input.output_path), false);
  }
});

test('existing output and malformed requests are rejected before any paid dispatch', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.input.output_path, 'prior artifact');
  for (const input of [f.input, { ...f.input, timeout_ms: 0 }, { ...f.input, prompt: '' }]) {
    await assert.rejects(runDomainImageGeneration(input, {
      config_path: f.configPath,
      fetch: async () => { assert.fail('must not dispatch'); },
    }), errorIs('invalid_image_request', 'not_started'));
  }
  assert.equal(fs.readFileSync(f.input.output_path, 'utf8'), 'prior artifact');
});

test('a file created while a request is running is preserved and completion is not retried', async (t) => {
  const f = fixture(t);
  let calls = 0;
  await assert.rejects(runDomainImageGeneration(f.input, {
    config_path: f.configPath,
    fetch: async () => {
      calls += 1;
      fs.writeFileSync(f.input.output_path, 'concurrent artifact');
      return Response.json({ data: [{ b64_json: image.toString('base64') }] });
    },
  }), errorIs('image_output_unavailable', 'unknown'));
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(f.input.output_path, 'utf8'), 'concurrent artifact');
});

test('truncated or corrupt PNG responses never become successful image artifacts', async (t) => {
  const f = fixture(t);
  const corrupt = Buffer.from(image);
  corrupt[45] ^= 1;
  for (const bytes of [image.subarray(0, 9), image.subarray(0, image.length - 12), corrupt]) {
    await assert.rejects(runDomainImageGeneration(f.input, {
      config_path: f.configPath,
      fetch: async () => Response.json({ data: [{ b64_json: bytes.toString('base64') }] }),
    }), errorIs('image_response_invalid', 'unknown'));
    assert.equal(fs.existsSync(f.input.output_path), false);
  }
});

test('oversized streamed provider output is bounded and cancelled before JSON decoding', async (t) => {
  const f = fixture(t);
  let chunks = 0;
  let cancelled = false;
  let calls = 0;
  const chunk = new Uint8Array(1024 * 1024).fill(32);
  await assert.rejects(runDomainImageGeneration(f.input, {
    config_path: f.configPath,
    fetch: async () => {
      calls += 1;
      return new Response(new ReadableStream({
        pull(controller) { chunks += 1; controller.enqueue(chunk); },
        cancel() { cancelled = true; },
      }));
    },
  }), errorIs('image_response_invalid', 'unknown'));
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
  assert.ok(chunks <= 89);
  assert.equal(fs.existsSync(f.input.output_path), false);
});
