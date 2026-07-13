#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ArtifactVerification = {
  schema_version: string;
  status: string;
  generated_html_sha256: string;
  generated_pdf_sha256: string;
  public_urls: { html: string; pdf: string };
  additional_public_artifacts?: Array<{ kind: 'html' | 'pdf'; sha256: string; url: string }>;
  source_git?: { commit?: string };
  renderer?: { repo_commit?: string };
};

type ReadbackOptions = {
  attempts: number;
  intervalMs: number;
};

function fingerprint(bytes: Uint8Array) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fileFingerprint(filePath: string) {
  return fingerprint(fs.readFileSync(filePath));
}

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--verification', '--output', '--attempts', '--interval-ms'].includes(flag) || !value || values.has(flag)) {
      throw new Error('Usage: verify-whitepaper-publication.ts --verification <json> --output <json> [--attempts <n>] [--interval-ms <n>]');
    }
    values.set(flag, value);
  }
  const verification = values.get('--verification');
  const output = values.get('--output');
  if (!verification || !output) throw new Error('--verification and --output are required.');
  return {
    verification: path.resolve(verification),
    output: path.resolve(output),
    attempts: positiveInteger(values.get('--attempts'), 6, '--attempts'),
    intervalMs: positiveInteger(values.get('--interval-ms'), 10_000, '--interval-ms'),
  };
}

async function fetchArtifact(url: string, expectedSha256: string, expectedMime: string, options: ReadbackOptions) {
  let last: Record<string, unknown> = { url, status: 'not_attempted' };
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const actualSha256 = fingerprint(bytes);
      const contentType = response.headers.get('content-type') ?? '';
      const verified = response.ok && contentType.includes(expectedMime) && actualSha256 === expectedSha256;
      last = {
        url,
        attempt,
        http_status: response.status,
        content_type: contentType,
        content_length: bytes.byteLength,
        expected_sha256: expectedSha256,
        actual_sha256: actualSha256,
        status: verified ? 'verified' : 'mismatch',
      };
      if (verified) return last;
    } catch (error) {
      last = { url, attempt, status: 'fetch_failed', error: error instanceof Error ? error.message : String(error) };
    }
    if (attempt < options.attempts) await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
  return last;
}

export async function verifyPublication(
  verificationPath: string,
  outputPath: string,
  options: ReadbackOptions,
) {
  const verification = JSON.parse(fs.readFileSync(verificationPath, 'utf8')) as ArtifactVerification;
  if (verification.schema_version !== 'opl_whitepaper_artifact_verification.v2') {
    throw new Error('Publication readback requires opl_whitepaper_artifact_verification.v2.');
  }
  const [html, pdf] = await Promise.all([
    fetchArtifact(verification.public_urls.html, verification.generated_html_sha256, 'text/html', options),
    fetchArtifact(verification.public_urls.pdf, verification.generated_pdf_sha256, 'application/pdf', options),
  ]);
  const additional = await Promise.all((verification.additional_public_artifacts ?? []).map((artifact) =>
    fetchArtifact(artifact.url, artifact.sha256, artifact.kind === 'pdf' ? 'application/pdf' : 'text/html', options)));
  const verified = html.status === 'verified' && pdf.status === 'verified' && additional.every(({ status }) => status === 'verified');
  const receipt = {
    schema_version: 'opl_whitepaper_publication_receipt.v1',
    status: verified ? 'publication_readback_verified' : 'publication_readback_failed',
    readback_at: new Date().toISOString(),
    source_verification: path.basename(verificationPath),
    source_verification_sha256: fileFingerprint(verificationPath),
    source_commit: verification.source_git?.commit ?? null,
    renderer_commit: verification.renderer?.repo_commit ?? null,
    deployment: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      run_id: process.env.GITHUB_RUN_ID ?? null,
      deployment_id: process.env.GITHUB_DEPLOYMENT_ID ?? null,
    },
    artifacts: { html, pdf, additional },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (!verified) throw new Error(`Publication readback failed; receipt written to ${outputPath}`);
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = await verifyPublication(args.verification, args.output, {
    attempts: args.attempts,
    intervalMs: args.intervalMs,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
