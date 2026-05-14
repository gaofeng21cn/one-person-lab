export function isInteractiveShell() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function normalizeCommandOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}
