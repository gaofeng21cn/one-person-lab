import fs from 'node:fs';

export function parseJsonText(text) {
  return JSON.parse(text); // reuse-first: allow one shared maintainer script JSON boundary.
}

export function readJsonFile(filePath) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8'));
}
