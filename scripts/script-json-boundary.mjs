import fs from 'node:fs';

export function parseJsonText(text) {
  return JSON.parse(text); // reuse-first: allow one shared maintainer script JSON boundary.
}

export function readJsonFile(filePath) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8'));
}

export function cloneJsonPayload(value) {
  return parseJsonText(JSON.stringify(value));
}

export function parseJsonLines(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map(parseJsonText);
}

export function isJsonObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function jsonObject(value) {
  return isJsonObject(value) ? value : {};
}

export function stringList(value) {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => entry.trim()),
  )];
}
