import fs from 'node:fs';
const built = new URL('../dist/adapters/execution/managed-temporal-cli.mjs', import.meta.url);
const source = new URL('../src/adapters/execution/managed-temporal-cli.mjs', import.meta.url);
const { installTemporalCli } = await import(fs.existsSync(built) ? built.href : source.href);
console.log(JSON.stringify(installTemporalCli()));
