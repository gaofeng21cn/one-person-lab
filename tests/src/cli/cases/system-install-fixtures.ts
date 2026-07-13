import { spawnSync } from 'node:child_process';

import { assert, cliPath, fs, parseJsonText, path, repoRoot } from '../helpers.ts';

export function runCliWithStdin(args: string[], stdin: string, envOverrides: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      input: stdin,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return parseJsonText(result.stdout);
}

function createFakeOfficeCliSource(root: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'SKILL.md'),
    '---\nname: officecli\ndescription: Test OfficeCLI core skill.\n---\n\n# officecli\n',
    'utf8',
  );
  for (const skillName of [
    'officecli-docx',
    'officecli-pptx',
    'officecli-xlsx',
    'officecli-academic-paper',
    'officecli-data-dashboard',
    'officecli-financial-model',
    'officecli-pitch-deck',
  ]) {
    const skillRoot = path.join(root, 'skills', skillName);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: Test ${skillName} skill.\n---\n\n# ${skillName}\n`,
      'utf8',
    );
  }
}

function createFakeUiUxProMaxSource(root: string) {
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'ui-ux-pro-max'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'ui-ux-pro-max', 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'ui-ux-pro-max', 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md'),
    '---\nname: ui-ux-pro-max\ndescription: Test UI UX Pro Max skill.\n---\n\n# ui-ux-pro-max\n',
    'utf8',
  );
  fs.writeFileSync(path.join(root, 'src', 'ui-ux-pro-max', 'data', 'palettes.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'ui-ux-pro-max', 'scripts', 'search.js'), 'export {};\n', 'utf8');
}

function createFakeMineruDocumentExtractorSource(root: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'SKILL.md'),
    '---\nname: mineru-document-extractor\ndescription: Test MinerU document extraction skill.\n---\n\n# mineru-document-extractor\n',
    'utf8',
  );
  fs.writeFileSync(path.join(root, '_meta.json'), '{"slug":"mineru-document-extractor","version":"test"}\n', 'utf8');
}

function createFakeOfficeCliInstaller(root: string) {
  const installerPath = path.join(root, 'install-officecli.sh');
  fs.writeFileSync(
    installerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'mkdir -p "$HOME/.local/bin"',
      'cat > "$HOME/.local/bin/officecli" <<\'EOS\'',
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "--version" ]; then',
      '  echo "1.0.70-test"',
      '  exit 0',
      'fi',
      'echo "officecli test fixture"',
      'EOS',
      'chmod +x "$HOME/.local/bin/officecli"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return installerPath;
}

function createFakeMineruOpenApiInstaller(root: string) {
  const installerPath = path.join(root, 'install-mineru-open-api.sh');
  fs.writeFileSync(
    installerPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'mkdir -p "$HOME/.local/bin"',
      'cat > "$HOME/.local/bin/mineru-open-api" <<\'EOS\'',
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "version" ]; then',
      '  echo "mineru-open-api version v0.1.3-test"',
      '  exit 0',
      'fi',
      'echo "mineru-open-api test fixture"',
      'EOS',
      'chmod +x "$HOME/.local/bin/mineru-open-api"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return installerPath;
}

export function createFakeCompanionInstallEnv(homeRoot: string) {
  const sourceRoot = path.join(homeRoot, 'companion-sources');
  const officeCliRoot = path.join(sourceRoot, 'OfficeCLI');
  const uiUxRoot = path.join(sourceRoot, 'ui-ux-pro-max-skill');
  const mineruRoot = path.join(sourceRoot, 'mineru-document-extractor');
  createFakeOfficeCliSource(officeCliRoot);
  createFakeUiUxProMaxSource(uiUxRoot);
  createFakeMineruDocumentExtractorSource(mineruRoot);
  return {
    OPL_COMPANION_SOURCES_ROOT: sourceRoot,
    OPL_OFFICECLI_SOURCE_ROOT: officeCliRoot,
    OPL_UI_UX_PRO_MAX_SOURCE_ROOT: uiUxRoot,
    OPL_MINERU_DOCUMENT_EXTRACTOR_SOURCE_ROOT: mineruRoot,
    OPL_OFFICECLI_INSTALL_COMMAND: createFakeOfficeCliInstaller(sourceRoot),
    OPL_MINERU_OPEN_API_INSTALL_COMMAND: createFakeMineruOpenApiInstaller(sourceRoot),
  };
}

export function writeFakeCompanionToolBinaries(homeRoot: string) {
  const toolBin = path.join(homeRoot, '.local', 'bin');
  fs.mkdirSync(toolBin, { recursive: true });
  fs.writeFileSync(
    path.join(toolBin, 'officecli'),
    '#!/usr/bin/env bash\nif [ "${1:-}" = "--version" ]; then echo "1.0.70-test"; else echo officecli; fi\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(toolBin, 'mineru-open-api'),
    '#!/usr/bin/env bash\nif [ "${1:-}" = "version" ]; then echo "mineru-open-api version v0.1.3-test"; else echo mineru-open-api; fi\n',
    { mode: 0o755 },
  );
  return toolBin;
}
