import http from 'node:http';
import { createHash } from 'node:crypto';

import {
  assert,
  fs,
  once,
  os,
  path,
  runCliAsync,
  runCliFailure,
  runCliReadOnly,
  test,
} from '../helpers.ts';

const PNG_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

test('image and image generate CLI specs are registry-backed and validate inputs', async () => {
  const topHelp = (await runCliReadOnly(['help', 'image'])).help;
  assert.equal(topHelp.command, 'image');

  const genHelp = (await runCliReadOnly(['help', 'image', 'generate'])).help;
  assert.equal(genHelp.command, 'image generate');
  assert.equal(genHelp.registry.command_id, 'image generate');
  assert.equal(genHelp.registry.authority_boundary.can_write_domain_truth, false);

  const missingArgs = runCliFailure(['image', 'generate']);
  assert.equal(missingArgs.payload.error.code, 'cli_usage_error');

  const badQuality = runCliFailure([
    'image',
    'generate',
    '--prompt',
    'Draw a circle',
    '--output',
    '/tmp/out.png',
    '--quality',
    'ultra',
  ]);
  assert.equal(badQuality.payload.error.code, 'cli_usage_error');
});

test('opl image generate invokes configured provider endpoint and returns verified receipt', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-image-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const token = 'synthetic-cli-image-token';
  let capturedBody: unknown = null;
  let capturedAuth: string | undefined;

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    capturedBody = JSON.parse(body) as Record<string, unknown>;
    capturedAuth = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: PNG_IMAGE.toString('base64') }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  fs.writeFileSync(
    path.join(root, 'config.toml'),
    `model = "gpt-test"\nmodel_provider = "test_img"\n[model_providers."test_img"]\nbase_url = "${baseUrl}"\napi_key = "${token}"\n`,
  );

  const outPath = path.join(root, 'emblem.png');
  const output = await runCliAsync(
    [
      'image',
      'generate',
      '--prompt',
      'Draw a simple square',
      '--output',
      outPath,
      '--size',
      '1024x1024',
      '--quality',
      'high',
      '--background',
      'transparent',
    ],
    { CODEX_HOME: root },
  ) as {
    domain_image_generation: {
      surface_kind: string;
      status: string;
      image_sha256: string;
    };
  };

  assert.equal(capturedAuth, `Bearer ${token}`);
  const parsedBody = capturedBody as Record<string, unknown> | null;
  assert.equal(parsedBody?.prompt, 'Draw a simple square');
  assert.equal(parsedBody?.size, '1024x1024');
  assert.equal(parsedBody?.quality, 'high');
  assert.equal(parsedBody?.background, 'transparent');
  assert.deepEqual(fs.readFileSync(outPath), PNG_IMAGE);
  assert.equal(output.domain_image_generation.surface_kind, 'opl_domain_image_generation');
  assert.equal(output.domain_image_generation.status, 'completed');
  assert.equal(
    output.domain_image_generation.image_sha256,
    createHash('sha256').update(PNG_IMAGE).digest('hex'),
  );
  assert.equal(JSON.stringify(output).includes(token), false);
});
