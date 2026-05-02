#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultShellRoot = path.resolve(repoRoot, '..', 'opl-aion-shell');
const defaultFullPackageDir = path.resolve(repoRoot, 'dist', 'opl-full-release');

function defaultReleaseVersion() {
  const now = process.env.OPL_RELEASE_DATE
    ? new Date(`${process.env.OPL_RELEASE_DATE}T00:00:00Z`)
    : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid OPL_RELEASE_DATE: ${process.env.OPL_RELEASE_DATE}`);
  }
  return `${String(now.getFullYear()).slice(-2)}.${now.getMonth() + 1}.${now.getDate()}`;
}

function parseArgs(argv) {
  const parsed = {
    shellRoot: process.env.OPL_AION_SHELL_ROOT || defaultShellRoot,
    releaseRepo: process.env.OPL_RELEASE_REPO || 'gaofeng21cn/one-person-lab',
    version: process.env.OPL_RELEASE_VERSION || '',
    versionExplicit: Boolean(process.env.OPL_RELEASE_VERSION),
    macArch: process.env.OPL_RELEASE_MAC_ARCH || 'arm64',
    fullPackageDir: process.env.OPL_FULL_PACKAGE_DIR || '',
    build: true,
    includeFullPackage: false,
    fullPackageOnly: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--no-build') {
      parsed.build = false;
      continue;
    }
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--include-full-package') {
      parsed.includeFullPackage = true;
      if (!parsed.fullPackageDir) {
        parsed.fullPackageDir = defaultFullPackageDir;
      }
      continue;
    }
    if (token === '--full-package-only') {
      parsed.fullPackageOnly = true;
      parsed.includeFullPackage = true;
      parsed.build = false;
      if (!parsed.fullPackageDir) {
        parsed.fullPackageDir = defaultFullPackageDir;
      }
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    if (token === '--shell-root') {
      parsed.shellRoot = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === '--repo') {
      parsed.releaseRepo = value;
      index += 1;
      continue;
    }
    if (token === '--version') {
      parsed.version = value;
      parsed.versionExplicit = true;
      index += 1;
      continue;
    }
    if (token === '--mac-arch') {
      parsed.macArch = value;
      index += 1;
      continue;
    }
    if (token === '--full-package-dir') {
      parsed.fullPackageDir = path.resolve(value);
      parsed.includeFullPackage = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!['arm64', 'x64', 'universal'].includes(parsed.macArch)) {
    throw new Error(`Unsupported macOS release architecture: ${parsed.macArch}`);
  }
  if (parsed.fullPackageOnly && !parsed.includeFullPackage) {
    throw new Error('--full-package-only requires --include-full-package or --full-package-dir.');
  }
  if (!parsed.version) {
    parsed.version = defaultReleaseVersion();
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\nstdout=${result.stdout || ''}\nstderr=${result.stderr || ''}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${detail}`);
  }
  return result;
}

const guiArtifactPrefixes = ['One Person Lab-', 'One.Person.Lab-', 'One-Person-Lab-'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function artifactMatchesMacArch(name, macArch) {
  return name.includes(`-mac-${macArch}`);
}

function metadataMatchesMacArch(metadata, macArch) {
  return metadata.includes(`-mac-${macArch}.`);
}

function assertUpdaterMetadataDoesNotReferenceFullPackage(releaseDir, files) {
  for (const name of files) {
    if (!/^latest.*\.yml$/.test(name)) {
      continue;
    }
    const metadata = fs.readFileSync(path.join(releaseDir, name), 'utf8');
    if (/One[ .-]Person[ .-]Lab[ .-]Full-|One-Person-Lab-Full-/.test(metadata)) {
      throw new Error(`${name} must not reference One Person Lab Full assets; Full packages are first-install downloads only.`);
    }
  }
}

function isGuiArtifact(name, version, extension, macArch) {
  const baseNames = guiArtifactPrefixes.map((prefix) => `${prefix}${version}-mac-${macArch}`);
  if (extension === '.blockmap') {
    return baseNames.some((baseName) => (
      name === `${baseName}.dmg.blockmap`
      || name === `${baseName}.zip.blockmap`
    ));
  }
  return baseNames.some((baseName) => name === `${baseName}${extension}`);
}

function isLatestMetadataForVersion(releaseDir, name, version, macArch) {
  if (!/^latest.*\.yml$/.test(name)) {
    return false;
  }
  const source = path.join(releaseDir, name);
  const metadata = fs.readFileSync(source, 'utf8');
  return new RegExp(`^version:\\s*['"]?${escapeRegExp(version)}['"]?\\s*$`, 'm').test(metadata)
    && metadataMatchesMacArch(metadata, macArch);
}

function findArtifacts(shellRoot, version, macArch) {
  const releaseDir = ['release', 'out']
    .map((entry) => path.join(shellRoot, entry))
    .find((candidate) => fs.existsSync(candidate));
  if (!releaseDir) {
    throw new Error(`Missing GUI artifact directory: expected ${path.join(shellRoot, 'release')} or ${path.join(shellRoot, 'out')}`);
  }
  const files = fs.readdirSync(releaseDir).filter((name) => {
    if (isGuiArtifact(name, version, '.dmg', macArch)) {
      return true;
    }
    if (isGuiArtifact(name, version, '.zip', macArch)) {
      return true;
    }
    if (isGuiArtifact(name, version, '.blockmap', macArch)) {
      return true;
    }
    return isLatestMetadataForVersion(releaseDir, name, version, macArch);
  });
  if (!files.some((name) => name.endsWith('.dmg'))) {
    throw new Error(`No One Person Lab ${version} ${macArch} DMG found under ${releaseDir}`);
  }
  assertUpdaterMetadataDoesNotReferenceFullPackage(releaseDir, files);
  if (macArch === 'arm64' && files.some((name) => name.includes('-mac-arm64.')) && files.includes('latest-mac.yml')) {
    const arm64MetadataName = 'latest-arm64-mac.yml';
    fs.copyFileSync(path.join(releaseDir, 'latest-mac.yml'), path.join(releaseDir, arm64MetadataName));
    files.push(arm64MetadataName);
  }
  const artifacts = files.map((name) => {
    const source = path.join(releaseDir, name);
    if (/^latest.*\.yml$/.test(name)) {
      const patched = fs.readFileSync(source, 'utf8')
        .replaceAll('One Person Lab-', 'One.Person.Lab-');
      const uploadPath = path.join(releaseDir, name);
      fs.writeFileSync(uploadPath, patched);
      return uploadPath;
    }
    if (!name.includes(' ')) {
      return source;
    }
    const uploadName = name.replaceAll(' ', '.');
    const uploadPath = path.join(releaseDir, uploadName);
    fs.copyFileSync(source, uploadPath);
    return uploadPath;
  });
  return [...new Set(artifacts)];
}

function findFullPackageArtifacts(fullPackageDir, version, macArch) {
  if (macArch !== 'arm64') {
    throw new Error(`Full first-install package is only supported for macOS arm64, not ${macArch}`);
  }
  if (!fullPackageDir || !fs.existsSync(fullPackageDir)) {
    throw new Error(`Missing Full package directory: ${fullPackageDir || '(empty)'}`);
  }

  const required = [
    `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    'full-package-manifest.json',
    'SHA256SUMS.txt',
    'README-Full-First-Install.txt',
  ];

  const files = fs.readdirSync(fullPackageDir);
  for (const name of required) {
    if (!files.includes(name)) {
      throw new Error(`Missing Full package release asset: ${path.join(fullPackageDir, name)}`);
    }
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(fullPackageDir, 'full-package-manifest.json'), 'utf8'));
  if (manifest?.distribution?.updater_metadata_allowed !== false) {
    throw new Error('Full package manifest must declare distribution.updater_metadata_allowed=false.');
  }

  return required.map((name) => path.join(fullPackageDir, name));
}

function releaseExists(repo, tag) {
  const result = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}

function suggestDefaultReleaseVersion(repo, dateVersion) {
  if (!releaseExists(repo, `v${dateVersion}`)) {
    return dateVersion;
  }
  for (let code = 97; code <= 122; code += 1) {
    const suffix = String.fromCharCode(code);
    const candidate = `${dateVersion}-${suffix}`;
    if (!releaseExists(repo, `v${candidate}`)) {
      return candidate;
    }
  }
  throw new Error(`No available same-day suffix for GUI release date version ${dateVersion}.`);
}

function commandOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

function humanizeCommitSubject(subject) {
  const match = subject.match(/^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?!?:\s*(?<body>.+)$/i);
  if (!match?.groups) {
    return subject.replace(/^[a-z]/, (value) => value.toUpperCase());
  }
  const scope = match.groups.scope
    ? match.groups.scope
        .split(/[-_/]+/)
        .filter(Boolean)
        .map((part) => part.replace(/^[a-z]/, (value) => value.toUpperCase()))
        .join(' ')
    : match.groups.type.replace(/^[a-z]/, (value) => value.toUpperCase());
  const body = match.groups.body.replace(/^[a-z]/, (value) => value.toUpperCase());
  return `${scope}: ${body}`;
}

function buildChangeList(shellRoot, maxItems = 12) {
  if (!fs.existsSync(path.join(shellRoot, '.git'))) {
    return ['GUI package refresh from the current OPL shell main branch.'];
  }

  const lastTag = commandOutput('git', ['describe', '--tags', '--abbrev=0', 'HEAD'], { cwd: shellRoot });
  const rangeArgs = lastTag ? [`${lastTag}..HEAD`] : ['HEAD'];
  const rawSubjects = commandOutput(
    'git',
    ['log', '--no-merges', '--pretty=%s', ...rangeArgs, `--max-count=${maxItems}`],
    { cwd: shellRoot },
  );
  const subjects = rawSubjects
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(humanizeCommitSubject);
  return subjects.length > 0 ? subjects : ['GUI package refresh from the current OPL shell main branch.'];
}

function buildUpdateGuidanceNotes(version) {
  return [
    'Update guidance:',
    `- Existing users should update from inside the app, or install the standard One-Person-Lab-${version}-mac-arm64.dmg package if they need a manual reinstall.`,
    '- The standard DMG/ZIP assets and latest*.yml metadata remain the only auto-updater source.',
  ];
}

function buildFullPackageReleaseNotesSection(version) {
  return [
    'Full first-install package:',
    `- New macOS arm64 users can download One-Person-Lab-Full-${version}-mac-arm64.dmg to reduce the time from first launch to the first MAS, MAG, or RCA task.`,
    '- The Full package bundles the MAS/MDS/MAG/RCA domain modules plus Hermes runtime payload used during first setup; users still configure their API key normally.',
    '- Full assets are first-install downloads only. They are not referenced by latest*.yml and are not used by the auto-updater.',
  ];
}

function buildReleaseNotes(version, includeFullPackage, changeList) {
  const notes = [
    `One Person Lab desktop GUI release ${version}`,
    '',
    'Changes in this release:',
    ...changeList.map((change) => `- ${change}`),
    '',
    ...buildUpdateGuidanceNotes(version),
  ];
  if (includeFullPackage) {
    notes.push(
      '',
      ...buildFullPackageReleaseNotesSection(version),
    );
  }
  return notes.join('\n');
}

function ensureFullPackageReleaseNotes(repo, tag, version) {
  const current = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'body', '--jq', '.body'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (current.status !== 0) {
    throw new Error(`Command failed: gh release view ${tag} --repo ${repo}\nstderr=${current.stderr || ''}`);
  }

  const currentNotes = current.stdout.trimEnd();
  const assetName = `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const missingUpdateGuidance = !current.stdout.includes('Update guidance:');
  const missingFullSection = !current.stdout.includes(assetName) && !current.stdout.includes('Full first-install package:');
  if (!missingUpdateGuidance && !missingFullSection) {
    return;
  }

  const appendedSections = [];
  if (missingUpdateGuidance) {
    appendedSections.push(...buildUpdateGuidanceNotes(version));
  }
  if (missingUpdateGuidance && missingFullSection) {
    appendedSections.push('');
  }
  if (missingFullSection) {
    appendedSections.push(...buildFullPackageReleaseNotesSection(version));
  }
  const nextNotes = [
    ...(currentNotes ? [currentNotes, ''] : []),
    ...appendedSections,
  ].join('\n');
  run('gh', ['release', 'edit', tag, '--repo', repo, '--notes', nextNotes]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.versionExplicit) {
    options.version = suggestDefaultReleaseVersion(options.releaseRepo, options.version);
  }
  const tag = `v${options.version}`;

  if (!options.fullPackageOnly && !fs.existsSync(options.shellRoot)) {
    throw new Error(`Missing opl-aion-shell checkout: ${options.shellRoot}`);
  }

  if (options.build && !options.fullPackageOnly) {
    run('bun', ['run', `build-mac:${options.macArch}`], { cwd: options.shellRoot });
  }

  const artifacts = options.fullPackageOnly ? [] : findArtifacts(options.shellRoot, options.version, options.macArch);
  const fullPackageArtifacts = options.includeFullPackage
    ? findFullPackageArtifacts(options.fullPackageDir, options.version, options.macArch)
    : [];
  const allArtifacts = [...artifacts, ...fullPackageArtifacts];
  const uploadArgs = ['release', 'upload', tag, ...allArtifacts, '--repo', options.releaseRepo, '--clobber'];
  const existingRelease = releaseExists(options.releaseRepo, tag);
  const releaseNotes = buildReleaseNotes(
    options.version,
    options.includeFullPackage,
    options.fullPackageOnly ? ['Full first-install package assets for the existing standard release.'] : buildChangeList(options.shellRoot),
  );

  if (options.dryRun) {
    console.log(JSON.stringify({
      release_repo: options.releaseRepo,
      tag,
      shell_root: options.shellRoot,
      mac_arch: options.macArch,
      build: options.build,
      full_package_only: options.fullPackageOnly,
      artifacts: allArtifacts,
      standard_artifacts: artifacts,
      full_package_artifacts: fullPackageArtifacts,
      release_exists: existingRelease,
      create_release: !options.fullPackageOnly && !existingRelease,
      release_notes: releaseNotes,
      upload_command: ['gh', ...uploadArgs],
    }, null, 2));
    return;
  }

  if (options.fullPackageOnly && !existingRelease) {
    throw new Error(`Release ${tag} does not exist in ${options.releaseRepo}; publish the standard release before uploading Full first-install assets.`);
  }

  if (!existingRelease) {
    run('gh', [
      'release',
      'create',
      tag,
      '--repo',
      options.releaseRepo,
      '--title',
      `One Person Lab ${options.version}`,
      '--notes',
      releaseNotes,
    ]);
  } else if (options.includeFullPackage) {
    ensureFullPackageReleaseNotes(options.releaseRepo, tag, options.version);
  }
  run('gh', uploadArgs);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
