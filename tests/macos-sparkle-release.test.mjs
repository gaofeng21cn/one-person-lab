import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = path.join(root, 'scripts', 'macos-sparkle-release');
const workflowPath = path.join(root, '.github', 'workflows', 'reusable-macos-sparkle-release.yml');

const requiredScripts = [
  'embed-and-sign-sparkle.sh',
  'notarize-app-and-dmg.sh',
  'generate-appcast.sh',
  'verify-macos-release.sh',
];

test('shared macOS Sparkle release workflow and scripts keep required contracts', () => {
  assert.ok(fs.existsSync(workflowPath), 'reusable-macos-sparkle-release.yml must exist');
  const workflowText = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflowText, /workflow_call:/);
  assert.match(workflowText, /SPARKLE_ED25519_PRIVATE_KEY/);
  assert.match(workflowText, /notarize-app-and-dmg\.sh/);
  assert.match(workflowText, /generate-appcast\.sh/);
  assert.match(workflowText, /verify-macos-release\.sh/);
  assert.match(workflowText, /dist\/appcast\.xml/);
  assert.match(workflowText, /security delete-keychain/);

  for (const name of requiredScripts) {
    const scriptPath = path.join(scriptsDir, name);
    assert.ok(fs.existsSync(scriptPath), `${name} must exist`);
    const stat = fs.statSync(scriptPath);
    assert.ok((stat.mode & 0o111) !== 0, `${name} must be executable`);
  }
});

test('notarize-app-and-dmg.sh enforces app-first notarization, dual stapling, and checksum order', (t) => {
  if (process.platform !== 'darwin') {
    t.skip('macOS zsh/notarization harness runs on macOS only');
    return;
  }

  for (const name of requiredScripts) {
    const check = spawnSync('zsh', ['-n', path.join(scriptsDir, name)], { encoding: 'utf8' });
    assert.equal(check.status, 0, `${name} failed zsh -n: ${check.stderr}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shared-notary-test.'));
  try {
    const fakeBin = path.join(tempRoot, 'bin');
    const distDir = path.join(tempRoot, 'dist');
    const fakeApp = path.join(distDir, 'Sample.app');
    const fakeDmg = path.join(distDir, 'Sample.dmg');
    const callLog = path.join(tempRoot, 'calls.log');

    fs.mkdirSync(fakeBin, { recursive: true });
    fs.mkdirSync(fakeApp, { recursive: true });

    const writeStub = (name, body) => {
      const target = path.join(fakeBin, name);
      fs.writeFileSync(target, body, { mode: 0o755 });
    };

    writeStub('xcrun', `#!/bin/zsh
set -euo pipefail
print -r -- "xcrun $*" >>"$TEST_CALL_LOG"
if [[ "$1 $2" == "notarytool submit" ]]; then
  cat <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>id</key><string>00000000-0000-0000-0000-000000000001</string></dict></plist>
PLIST
elif [[ "$1 $2" == "notarytool wait" || "$1 $2" == "notarytool info" ]]; then
  cat <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>status</key><string>Accepted</string></dict></plist>
PLIST
fi
`);
    writeStub('ditto', `#!/bin/zsh
set -euo pipefail
print -r -- "ditto $*" >>"$TEST_CALL_LOG"
target="\${@[-1]}"
if [[ "$target" == *.zip ]]; then
  touch "$target"
else
  mkdir -p "$target"
fi
`);
    writeStub('hdiutil', `#!/bin/zsh
set -euo pipefail
print -r -- "hdiutil $*" >>"$TEST_CALL_LOG"
if [[ "$1" == "create" ]]; then
  printf 'fake-dmg-bytes' >"\${@[-1]}"
fi
`);
    writeStub('codesign', `#!/bin/zsh
set -euo pipefail
print -r -- "codesign $*" >>"$TEST_CALL_LOG"
`);

    const run = spawnSync(
      path.join(scriptsDir, 'notarize-app-and-dmg.sh'),
      [
        '--app', fakeApp,
        '--dmg', fakeDmg,
        '--volume-name', 'Sample',
        '--signing-identity', 'Developer ID Application: Example (TEAMID)',
        '--notary-profile', 'test-profile',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          TEST_CALL_LOG: callLog,
          TMPDIR: tempRoot,
        },
      },
    );
    assert.equal(run.status, 0, `notarize-app-and-dmg.sh failed: ${run.stderr}`);

    const lines = fs.readFileSync(callLog, 'utf8').trim().split('\n');
    const idx = (pattern) => {
      const found = lines.findIndex((line) => line.includes(pattern));
      assert.notEqual(found, -1, `Missing call matching: ${pattern}\n${lines.join('\n')}`);
      return found;
    };

    const appSubmit = idx('notarytool submit');
    const appStaple = idx(`stapler staple ${fakeApp}`);
    const appValidate = idx(`stapler validate ${fakeApp}`);
    const dmgCreate = idx(`hdiutil create`);
    const dmgSign = idx(`codesign --force --sign Developer ID Application: Example (TEAMID) --timestamp ${fakeDmg}`);
    const dmgSubmit = idx(`notarytool submit ${fakeDmg}`);
    const dmgStaple = idx(`stapler staple ${fakeDmg}`);
    const dmgValidate = idx(`stapler validate ${fakeDmg}`);

    assert.ok(
      appSubmit < appStaple && appStaple < appValidate && appValidate < dmgCreate
      && dmgCreate < dmgSign && dmgSign < dmgSubmit && dmgSubmit < dmgStaple && dmgStaple < dmgValidate,
      `Out-of-order notarization sequence:\n${lines.join('\n')}`,
    );
    assert.ok(fs.existsSync(`${fakeDmg}.sha256`), 'checksum file must be created');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
