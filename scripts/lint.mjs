import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'tests', 'scripts'];
const filePaths = roots.flatMap((root) => collectFiles(root));
const failures = [];

for (const filePath of filePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  if (!content.endsWith('\n')) {
    failures.push(`${filePath}: missing trailing newline`);
  }

  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      failures.push(`${filePath}:${index + 1}: trailing whitespace`);
    }

    if (line.includes('\t')) {
      failures.push(`${filePath}:${index + 1}: tab indentation`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

function collectFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }

    return /\.(?:ts|mts|cts|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}
