import path from 'node:path';

export const FULL_INTERNAL_OUTPUT_DIR = '/Users/gaofeng/Downloads/One-Person-Lab-Full-Internal';
export const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
export const PACKAGED_MODULE_MARKER_FILE = 'opl-runtime-module.json';

type ComponentSnapshot = Partial<{
  source_path: string;
  version: string | null;
  git_commit: string | null;
  size_bytes: number;
}>;

type FullPackageManifestInput = Partial<{
  version: string;
  generatedAt: string;
  components: Record<string, ComponentSnapshot>;
}>;

function normalizeVersion(version?: string) {
  return version?.trim() || process.env.OPL_RELEASE_VERSION?.trim() || '26.5.1';
}

function normalizeComponent(input: ComponentSnapshot | undefined) {
  return {
    source_path: input?.source_path ?? null,
    version: input?.version ?? null,
    git_commit: input?.git_commit ?? null,
    size_bytes: input?.size_bytes ?? null,
  };
}

export function buildInternalArtifactNames(versionInput: string) {
  const version = normalizeVersion(versionInput);
  return {
    dmg: `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    runtimeTar: `opl-runtime-full-${version}-macos-arm64.tar.zst`,
    checksums: 'SHA256SUMS.txt',
    readme: 'README-内测安装说明.txt',
    manifest: 'full-package-manifest.json',
  };
}

export function buildFullPackageManifest(input: FullPackageManifestInput = {}) {
  const version = normalizeVersion(input.version);
  const components = input.components ?? {};

  return {
    manifest_version: 1,
    package_kind: 'opl_full_internal_macos_arm64',
    version,
    arch: 'macos-arm64',
    generated_at: input.generatedAt ?? new Date().toISOString(),
    runtime: {
      layout_version: 1,
      payload_resource_dir: FULL_RUNTIME_RESOURCE_DIR,
      install_root_template: '~/Library/Application Support/OPL/runtime/<version>',
      installed_runtime_path: `~/Library/Application Support/OPL/runtime/${version}`,
      app_uses_installed_runtime_after_first_launch: true,
      state_policy: 'user_state_stays_outside_runtime_payload',
    },
    distribution: {
      channel: 'internal_manual',
      manual_upload_target: 'Quark Drive manual internal testing share',
      github_release_upload: false,
      channel_manifest: false,
      runtime_auto_update: false,
      app_auto_update: 'unchanged_github_release_channel',
    },
    components: {
      opl: {
        ...normalizeComponent(components.opl),
        role: 'product_cli_and_shared_contracts',
        required: true,
      },
      codex: {
        ...normalizeComponent(components.codex),
        role: 'default_agent_cli',
        required: true,
      },
      hermes: {
        ...normalizeComponent(components.hermes),
        role: 'system_daemon_runtime',
        required: true,
        profile: 'lean',
        retained_capabilities: ['gateway', 'cron', 'session', 'launchd_service', 'profile', 'status'],
        excluded_capabilities: ['web_ui', 'voice', 'dev_tests', 'dev_extras', 'runtime_state', 'optional_messaging_providers'],
      },
      mas: {
        ...normalizeComponent(components.mas),
        role: 'primary_domain_module',
        required: true,
        visible_in_first_run_ui: true,
      },
      mds: {
        ...normalizeComponent(components.mds),
        role: 'mas_backend_dependency',
        required: true,
        visible_in_first_run_ui: false,
        excluded_subtrees: ['src/ui'],
      },
      node: {
        ...normalizeComponent(components.node),
        role: 'runtime_binary',
        required: true,
      },
      python: {
        ...normalizeComponent(components.python),
        role: 'uv_managed_python_runtime',
        required: true,
      },
      uv: {
        ...normalizeComponent(components.uv),
        role: 'python_environment_manager',
        required: true,
      },
      skills: {
        ...normalizeComponent(components.skills),
        role: 'recommended_codex_skills',
        required: true,
      },
    },
  };
}

function normalizeRuntimeRelativePath(relativePath: string) {
  return relativePath.split(path.sep).join('/').replace(/^\/+/, '');
}

function hasPathSegment(relativePath: string, segment: string) {
  return relativePath.split('/').includes(segment);
}

export function shouldExcludeRuntimePath(relativePathInput: string) {
  const relativePath = normalizeRuntimeRelativePath(relativePathInput);
  const lower = relativePath.toLowerCase();
  const baseName = path.posix.basename(relativePath);

  if (!relativePath || relativePath === '.') {
    return false;
  }

  if (
    hasPathSegment(relativePath, '.git')
    || hasPathSegment(relativePath, '.codex')
    || hasPathSegment(relativePath, '.omx')
    || hasPathSegment(relativePath, '.worktrees')
    || hasPathSegment(relativePath, '.mypy_cache')
    || hasPathSegment(relativePath, '.pytest_cache')
    || hasPathSegment(relativePath, '.ruff_cache')
    || hasPathSegment(relativePath, '.tox')
    || hasPathSegment(relativePath, '__pycache__')
    || hasPathSegment(relativePath, 'coverage')
    || hasPathSegment(relativePath, 'dist')
    || hasPathSegment(relativePath, 'target')
    || hasPathSegment(relativePath, '.DS_Store')
  ) {
    return true;
  }

  if (
    baseName === '.DS_Store'
    || baseName.endsWith('.pyc')
    || baseName.endsWith('.pyo')
    || baseName.endsWith('.tsbuildinfo')
    || baseName === 'state.db'
  ) {
    return true;
  }

  if (/^hermes\/(?:web|ui|frontend)(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^hermes\/\.venv\/bin(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^hermes\/tests?(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^hermes\/.*(?:voice|tts|telegram|discord|slack|matrix|dingtalk|feishu)/.test(lower)) {
    return true;
  }

  if (/^modules\/mds\/src\/ui(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^modules\/[^/]+\/\.venv\/bin(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^modules\/[^/]+\/tests?(?:\/|$)/.test(lower)) {
    return true;
  }
  if (/^modules\/[^/]+\/(?:htmlcov|docs\/_build|notebooks|runtime|runs|sessions|\.ds)(?:\/|$)/.test(lower)) {
    return true;
  }

  if (/^opl\/node_modules(?:\/|$)/.test(lower) || /^opl\/.*\/\.venv(?:\/|$)/.test(lower)) {
    return true;
  }

  return false;
}

export function buildPackagedModuleMarker(input: {
  moduleId: string;
  repoName: string;
  sourcePath: string;
  headSha: string | null;
  packagedAt?: string;
}) {
  return {
    marker_version: 1,
    module_id: input.moduleId,
    repo_name: input.repoName,
    source_path: input.sourcePath,
    packaged_runtime: true,
    packaged_at: input.packagedAt ?? new Date().toISOString(),
    source_git: {
      head_sha: input.headSha,
    },
  };
}

export function buildInternalPackageReadme(input: {
  version: string;
  dmgName: string;
  runtimeTarName: string | null;
  notarized: boolean;
}) {
  const installPath = `~/Library/Application Support/OPL/runtime/${normalizeVersion(input.version)}`;
  return [
    `One Person Lab Full 内测包 ${normalizeVersion(input.version)}`,
    '',
    '分发方式：本包用于夸克网盘人工内测分发，不上传 GitHub Release，不接 OPL channel manifest，也不启用 runtime 自动更新。',
    'App 内已有的自动更新机制保持原样，仍只读取 GitHub Release 通道。',
    '',
    '安装步骤：',
    `1. 打开 ${input.dmgName}，把 One Person Lab 拖到 Applications。`,
    '2. 首次启动 App 后，随包 runtime 会安装到：',
    `   ${installPath}`,
    '3. 在 App 里配置 Codex API key 后，进入 OPL 初始化页确认 Codex、Hermes-Agent、MAS、MDS backend 状态。',
    '4. 推荐先跑一次 MAS 最小 smoke：进入 Research Foundry，创建或读取一个 workspace 状态。',
    '',
    input.runtimeTarName
      ? `补充 runtime 包：如 DMG 内 runtime 安装失败，可保留 ${input.runtimeTarName} 作为人工诊断包。`
      : '补充 runtime 包：当前版本使用单 DMG 分发，未拆出独立 runtime tar.zst。',
    '',
    input.notarized
      ? '签名/公证：此包已按本机配置签名并通过公证检查。'
      : '签名/公证：此包是内测构建，可能未公证；Gatekeeper 如提示无法打开，请在系统设置里手动允许或用右键打开。',
    '',
    '校验：下载后可用 shasum -a 256 对照 SHA256SUMS.txt。',
    '',
  ].join('\n');
}
