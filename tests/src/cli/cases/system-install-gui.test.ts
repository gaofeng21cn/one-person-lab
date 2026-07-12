import { assert, createFakeOpenFixture, fs, os, path, runCli, test } from '../helpers.ts';

function disableRemoteCompanionInstall() {
  return {
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
}

function chmodTree(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.chmodSync(targetPath, 0o700);
  if (!fs.lstatSync(targetPath).isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(targetPath)) {
    chmodTree(path.join(targetPath, entry));
  }
}

test('install command downloads installs and opens the OPL GUI when it is missing', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-home-'));
  const applicationsDir = path.join(homeRoot, 'Applications');
  const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-tools-'));
  const curlPath = path.join(toolRoot, 'curl');
  const hdiutilPath = path.join(toolRoot, 'hdiutil');
  const openFixture = createFakeOpenFixture();
  const toolLogPath = path.join(toolRoot, 'tools.log');
  const detachStatePath = path.join(toolRoot, 'detach-count');

  fs.writeFileSync(
    curlPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
out=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
mkdir -p "$(dirname "$out")"
printf 'fake dmg\n' > "$out"
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    hdiutilPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'hdiutil %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
if [ "$1" = 'attach' ]; then
  mountpoint=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = '-mountpoint' ]; then
      mountpoint="$2"
      shift 2
      continue
    fi
    shift
  done
  mkdir -p "$mountpoint/One Person Lab.app/Contents"
  printf 'app\n' > "$mountpoint/One Person Lab.app/Contents/Info.plist"
  exit 0
fi
if [ "$1" = 'detach' ]; then
  count=0
  if [ -f ${JSON.stringify(detachStatePath)} ]; then
    count="$(cat ${JSON.stringify(detachStatePath)})"
  fi
  count="$((count + 1))"
  printf '%s' "$count" > ${JSON.stringify(detachStatePath)}
  if [ "$count" = '1' ]; then
    printf 'hdiutil: detach failed: Resource busy\n' >&2
    exit 16
  fi
  exit 0
fi
echo "unexpected hdiutil args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli([
      'install',
      '--with-app',
      '--skip-packages',
      '--skip-engines',
      '--skip-native-helper-repair',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_GUI_INSTALL_PLATFORM: 'darwin',
      OPL_APPLICATIONS_DIR: applicationsDir,
      OPL_CURL_BIN: curlPath,
      OPL_HDIUTIL_BIN: hdiutilPath,
      OPL_OPEN_BIN: openFixture.openPath,
      OPL_RELEASE_VERSION: '26.4.25',
      ...disableRemoteCompanionInstall(),
    }) as {
      install: {
        companion_skill_sync: { mode: string; items: unknown[] };
        gui_open_action: {
          status: string;
          strategy: string;
          release_asset: string;
          installed_app_path: string;
        } | null;
      };
    };

    assert.equal(output.install.companion_skill_sync.mode, 'managed');
    assert.equal(output.install.gui_open_action?.status, 'completed');
    assert.equal(output.install.gui_open_action?.strategy, 'install_release_asset_then_open_app');
    assert.match(output.install.gui_open_action?.release_asset ?? '', /^One-Person-Lab-26\.4\.25-mac-/);
    assert.equal(output.install.gui_open_action?.installed_app_path, path.join(applicationsDir, 'One Person Lab.app'));
    assert.equal(fs.existsSync(path.join(applicationsDir, 'One Person Lab.app', 'Contents', 'Info.plist')), true);
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), path.join(applicationsDir, 'One Person Lab.app'));
    const toolLog = fs.readFileSync(toolLogPath, 'utf8');
    assert.match(toolLog, /curl .*github\.com\/gaofeng21cn\/one-person-lab-app\/releases\/download\/v26\.4\.25/);
    assert.match(toolLog, /hdiutil attach /);
    assert.equal(toolLog.match(/hdiutil detach /g)?.length ?? 0, 2);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(toolRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('install command opens the installed App even when GUI DMG temp cleanup is delayed', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-home-'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-tmp-'));
  const applicationsDir = path.join(homeRoot, 'Applications');
  const toolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-gui-tools-'));
  const curlPath = path.join(toolRoot, 'curl');
  const hdiutilPath = path.join(toolRoot, 'hdiutil');
  const openPath = path.join(toolRoot, 'open');
  const openCapturePath = path.join(toolRoot, 'open.log');
  const toolLogPath = path.join(toolRoot, 'tools.log');

  fs.writeFileSync(
    curlPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
out=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
mkdir -p "$(dirname "$out")"
printf 'fake dmg\n' > "$out"
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    hdiutilPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'hdiutil %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
if [ "$1" = 'attach' ]; then
  mountpoint=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = '-mountpoint' ]; then
      mountpoint="$2"
      shift 2
      continue
    fi
    shift
  done
  mkdir -p "$mountpoint/One Person Lab.app/Contents"
  printf 'app\n' > "$mountpoint/One Person Lab.app/Contents/Info.plist"
  exit 0
fi
if [ "$1" = 'detach' ]; then
  mountpoint="$2"
  chmod -R 000 "$mountpoint"
  exit 0
fi
echo "unexpected hdiutil args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    openPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'open %s\n' "$*" >> ${JSON.stringify(toolLogPath)}
printf '%s\n' "$*" > ${JSON.stringify(openCapturePath)}
`,
    { mode: 0o755 },
  );

  try {
    const output = runCli([
      'install',
      '--with-app',
      '--skip-packages',
      '--skip-engines',
      '--skip-native-helper-repair',
    ], {
      HOME: homeRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_GUI_INSTALL_PLATFORM: 'darwin',
      OPL_APPLICATIONS_DIR: applicationsDir,
      OPL_CURL_BIN: curlPath,
      OPL_HDIUTIL_BIN: hdiutilPath,
      OPL_OPEN_BIN: openPath,
      OPL_RELEASE_VERSION: '26.4.25',
      TMPDIR: tempRoot,
      ...disableRemoteCompanionInstall(),
    }) as {
      install: {
        gui_open_action: {
          status: string;
          installed_app_path: string;
        } | null;
      };
    };

    assert.equal(output.install.gui_open_action?.status, 'completed');
    assert.equal(output.install.gui_open_action?.installed_app_path, path.join(applicationsDir, 'One Person Lab.app'));
    assert.equal(fs.readFileSync(openCapturePath, 'utf8').trim(), path.join(applicationsDir, 'One Person Lab.app'));
    const toolLog = fs.readFileSync(toolLogPath, 'utf8').trim().split('\n');
    const detachIndex = toolLog.findIndex((line) => line.startsWith('hdiutil detach '));
    const openIndex = toolLog.findIndex((line) => line.startsWith('open '));
    assert.equal(detachIndex >= 0, true);
    assert.equal(openIndex >= 0, true);
    assert.equal(detachIndex < openIndex, true);
  } finally {
    chmodTree(tempRoot);
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(toolRoot, { recursive: true, force: true });
  }
});
