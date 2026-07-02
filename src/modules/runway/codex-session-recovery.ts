import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CodexSessionRecoveryResult {
  threadId: string;
  sessionPath: string;
  output: string;
}

export function recoverCodexExecOutputFromSession(threadId: string | null): CodexSessionRecoveryResult | null {
  const normalizedThreadId = normalizeInlineText(threadId);
  if (!normalizedThreadId) {
    return null;
  }

  const codexHome = normalizeInlineText(process.env.CODEX_HOME) ?? path.join(os.homedir(), '.codex');
  const sessionsRoot = path.join(codexHome, 'sessions');
  const sessionPath = findCodexSessionJsonl(sessionsRoot, normalizedThreadId);
  if (!sessionPath) {
    return null;
  }

  const stat = fs.statSync(sessionPath);
  const maxSessionBytes = 25 * 1024 * 1024;
  if (!stat.isFile() || stat.size > maxSessionBytes) {
    return null;
  }

  return {
    threadId: normalizedThreadId,
    sessionPath,
    output: fs.readFileSync(sessionPath, 'utf8'),
  };
}

function findCodexSessionJsonl(sessionsRoot: string, threadId: string) {
  if (!fs.existsSync(sessionsRoot)) {
    return null;
  }

  const maxDepth = 6;
  const maxFiles = 10_000;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: sessionsRoot, depth: 0 }];
  let scannedFiles = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) {
          stack.push({ dir: entryPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      scannedFiles += 1;
      if (scannedFiles > maxFiles) {
        return null;
      }
      if (entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        return entryPath;
      }
    }
  }

  return null;
}

function normalizeInlineText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
