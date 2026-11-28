import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyPublication } from '../../scripts/verify-whitepaper-publication.ts';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('publication readback binds live HTML and PDF to the approved artifact hashes', async (t) => {
  const html = '<html><body>whitepaper</body></html>';
  const pdf = '%PDF-1.7 whitepaper';
  const server = http.createServer((request, response) => {
    if (request.url === '/whitepaper.html') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(html);
      return;
    }
    response.setHeader('content-type', 'application/pdf');
    response.end(pdf);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-whitepaper-readback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const verificationPath = path.join(root, 'verification.json');
  const outputPath = path.join(root, 'receipt.json');
  fs.writeFileSync(verificationPath, JSON.stringify({
    schema_version: 'opl_whitepaper_artifact_verification.v2',
    status: 'whitepaper_artifact_verified',
    generated_html_sha256: sha256(html),
    generated_pdf_sha256: sha256(pdf),
    public_urls: {
      html: `http://127.0.0.1:${address.port}/whitepaper.html`,
      pdf: `http://127.0.0.1:${address.port}/whitepaper.pdf`,
    },
  }));

  const receipt = await verifyPublication(verificationPath, outputPath, { attempts: 1, intervalMs: 1 });
  assert.equal(receipt.status, 'publication_readback_verified');
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), receipt);
});

test('publication readback fails closed on byte drift', async (t) => {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end('stale');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-whitepaper-readback-fail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const verificationPath = path.join(root, 'verification.json');
  const outputPath = path.join(root, 'receipt.json');
  fs.writeFileSync(verificationPath, JSON.stringify({
    schema_version: 'opl_whitepaper_artifact_verification.v2',
    status: 'whitepaper_artifact_verified',
    generated_html_sha256: sha256('expected html'),
    generated_pdf_sha256: sha256('expected pdf'),
    public_urls: {
      html: `http://127.0.0.1:${address.port}/whitepaper.html`,
      pdf: `http://127.0.0.1:${address.port}/whitepaper.pdf`,
    },
  }));

  await assert.rejects(
    verifyPublication(verificationPath, outputPath, { attempts: 1, intervalMs: 1 }),
    /Publication readback failed/,
  );
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).status, 'publication_readback_failed');
});
