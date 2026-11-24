import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTestTlsServerFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-tls-'));
  const keyPath = path.join(fixtureRoot, 'key.pem');
  const certPath = path.join(fixtureRoot, 'cert.pem');
  try {
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ], { stdio: 'ignore' });
    return {
      options: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      close: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}
