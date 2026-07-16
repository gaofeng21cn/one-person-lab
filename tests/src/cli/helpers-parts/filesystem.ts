import fs from 'node:fs';
import path from 'node:path';

function makeFixtureTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    fs.chmodSync(root, 0o600);
    return;
  }
  fs.chmodSync(root, 0o700);
  for (const entry of fs.readdirSync(root)) {
    makeFixtureTreeWritable(path.join(root, entry));
  }
}

export function removeFixtureTree(root: string) {
  makeFixtureTreeWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}
