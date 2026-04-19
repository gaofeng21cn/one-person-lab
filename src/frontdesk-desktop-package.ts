import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import type { FrontDeskRuntimeModes } from './frontdesk-runtime-modes.ts';
import type { LocalCodexDefaults } from './local-codex-defaults.ts';

export type FrontDeskDesktopPackageOptions = {
  outputDir: string;
  configFile: string;
  frontdeskUrl: string;
  apiBaseUrl: string;
  workspacePath: string;
  sessionsLimit: number;
  appTitle: string;
  modelDisplayLabel: string;
  activeProjectId?: string | null;
  activeProjectLabel?: string | null;
  codexDefaults: LocalCodexDefaults;
  runtimeModes: FrontDeskRuntimeModes;
};

export type FrontDeskDesktopPackageAssets = {
  package_root: string;
  package_json: string;
  src_index_html: string;
  cargo_toml: string;
  tauri_config: string;
  tauri_main: string;
  readme: string;
  config_file: string;
};

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function writeFile(targetPath: string, contents: string) {
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, contents, 'utf8');
}

function buildPackageJson() {
  return `${JSON.stringify({
    name: 'opl-atlas-desktop',
    version: '0.1.0',
    private: true,
    description: 'OPL desktop shell powered by an Onyx-style Tauri wrapper.',
    scripts: {
      dev: 'tauri dev',
      build: 'tauri build',
      'build:dmg': 'tauri build --target universal-apple-darwin',
    },
    dependencies: {
      '@tauri-apps/api': '^2.10.1',
    },
    devDependencies: {
      '@tauri-apps/cli': '^2.10.1',
    },
  }, null, 2)}\n`;
}

function buildDesktopConfig(options: FrontDeskDesktopPackageOptions) {
  const healthUrl = `${options.apiBaseUrl}/health`;

  return `${JSON.stringify({
    version: 'g2',
    shell_kind: 'tauri_onyx_desktop_shell',
    shell_upstream: 'onyx_foss_desktop',
    desktop_runtime: 'tauri',
    app_title: options.appTitle,
    window_title: options.appTitle,
    model_display_label: options.modelDisplayLabel,
    server_url: options.frontdeskUrl,
    frontdesk_url: options.frontdeskUrl,
    api_base_url: options.apiBaseUrl,
    health_url: healthUrl,
    workspace_path: options.workspacePath,
    sessions_limit: options.sessionsLimit,
    active_project_id: options.activeProjectId ?? null,
    active_project_label: options.activeProjectLabel ?? null,
    interaction_mode: options.runtimeModes.interaction_mode,
    execution_mode: options.runtimeModes.execution_mode,
    codex: {
      config_file: options.codexDefaults.config_path,
      model: options.codexDefaults.model,
      reasoning_effort: options.codexDefaults.reasoning_effort ?? null,
      provider_base_url: options.codexDefaults.provider_base_url ?? null,
    },
  }, null, 2)}\n`;
}

function buildIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Atlas Desktop</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f8;
        --panel: rgba(255, 255, 255, 0.9);
        --line: rgba(15, 23, 42, 0.08);
        --text: #111827;
        --muted: #667085;
        --accent: #111827;
        --soft: rgba(17, 24, 39, 0.06);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "SF Pro Display", "SF Pro Text", "PingFang SC", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 26%),
          radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.1), transparent 24%),
          var(--bg);
      }

      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }

      .panel {
        width: min(860px, 100%);
        padding: 30px;
        border-radius: 30px;
        border: 1px solid var(--line);
        background: var(--panel);
        backdrop-filter: blur(22px);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        background: var(--soft);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0 10px;
        font-size: 34px;
        line-height: 1.08;
      }

      h2 {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.02em;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.68;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 24px;
      }

      .card {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.92);
      }

      .label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .value {
        margin-top: 6px;
        font-size: 15px;
        word-break: break-word;
      }

      @media (max-width: 720px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <div class="eyebrow">OPL Workbench</div>
        <h1>Workspace-first control room</h1>
        <p>桌面壳会优先连接本机 OPL workbench 服务，服务就绪后直接载入完整工作台。</p>
        <div class="grid">
          <div class="card">
            <div class="label">Status</div>
            <div class="value">Waiting for the local OPL workbench service.</div>
          </div>
          <div class="card">
            <div class="label">Scope</div>
            <div class="value">Settings, modules, and progress stay aligned here.</div>
          </div>
          <div class="card">
            <div class="label">Experience</div>
            <div class="value">OPL Workbench keeps conversation, files, and progress in one shell.</div>
          </div>
          <div class="card">
            <div class="label">Mode</div>
            <div class="value">Desktop shell waiting for the local web companion to become reachable.</div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

function buildCargoToml() {
  return `[package]
name = "opl-atlas-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2.0", features = ["macos-private-api"] }
tauri-plugin-shell = "2.0"
`;
}

function buildTauriConfig() {
  return `${JSON.stringify({
    $schema: 'https://schema.tauri.app/config/2.0.0',
    productName: 'OPL Atlas',
    version: '0.1.0',
    identifier: 'app.opl.desktop',
    build: {
      beforeBuildCommand: '',
      beforeDevCommand: '',
      frontendDist: '../src',
    },
    app: {
      withGlobalTauri: true,
      windows: [
        {
          title: 'OPL Atlas',
          label: 'main',
          url: 'index.html',
          width: 1400,
          height: 920,
          minWidth: 1100,
          minHeight: 720,
          resizable: true,
          decorations: true,
          transparent: true,
          backgroundColor: '#f7f7f4',
          titleBarStyle: 'Overlay',
          hiddenTitle: true,
          acceptFirstMouse: true,
          tabbingIdentifier: 'opl-atlas',
        },
      ],
      security: {
        csp: null,
      },
      macOSPrivateApi: true,
    },
    bundle: {
      active: false,
      targets: 'all',
      category: 'Productivity',
      shortDescription: 'OPL desktop shell',
      longDescription: 'An Onyx-style Tauri desktop shell for OPL.',
      macOS: {
        minimumSystemVersion: '10.15',
      },
    },
    plugins: {
      shell: {
        open: true,
      },
    },
  }, null, 2)}\n`;
}

function buildTauriMain() {
  return `use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopConfig {
    server_url: String,
    health_url: String,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("config dir")
        .join("desktop-config.json")
}

fn read_config(app: &tauri::AppHandle) -> DesktopConfig {
    let path = config_path(app);
    let raw = fs::read_to_string(path).expect("read config");
    serde_json::from_str(&raw).expect("parse config")
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let config = read_config(&app.handle());
            let main_window = app.get_webview_window("main").expect("main window");

            if main_window.navigate(WebviewUrl::External(config.server_url.parse().expect("server url"))).is_err() {
                let _ = main_window.navigate(WebviewUrl::App("index.html".into()));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("run tauri");
}
`;
}

function buildReadme(options: FrontDeskDesktopPackageOptions, launchCommand: string) {
  return `# OPL Atlas Desktop

This package is the local Onyx Desktop Shell for OPL.

- Desktop shell: Onyx Desktop Shell
- Runtime: Tauri
- Routed gateway: OPL Front Desk at ${options.frontdeskUrl}
- Active workspace: ${options.workspacePath}
- Active project: ${options.activeProjectLabel ?? 'Unbound workspace'}
- Interaction mode: ${options.runtimeModes.interaction_mode}
- Execution mode: ${options.runtimeModes.execution_mode}

## Launch

1. Ensure the local frontdesk service is installed and running.
2. Ensure Rust and the Tauri toolchain are available on this Mac.
3. From this directory, run:

\`\`\`bash
${launchCommand}
\`\`\`

## Notes

- This shell follows the Onyx desktop wrapper shape and keeps OPL as the headless truth surface.
- The window will load the local OPL front desk URL first, then fall back to the bundled splash page when the service is unavailable.
`;
}

export function buildFrontDeskDesktopLaunchCommand(packageRoot: string) {
  return `cd ${shellSingleQuote(packageRoot)} && npm install && npx tauri dev`;
}

export function buildFrontDeskDesktopPackage(options: FrontDeskDesktopPackageOptions) {
  const outputDir = path.resolve(options.outputDir);
  if (!outputDir) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk desktop package requires an output directory.',
    );
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDirectory(outputDir);

  const packageJsonPath = path.join(outputDir, 'package.json');
  const srcIndexHtmlPath = path.join(outputDir, 'src', 'index.html');
  const cargoTomlPath = path.join(outputDir, 'src-tauri', 'Cargo.toml');
  const tauriConfigPath = path.join(outputDir, 'src-tauri', 'tauri.conf.json');
  const tauriMainPath = path.join(outputDir, 'src-tauri', 'src', 'main.rs');
  const readmePath = path.join(outputDir, 'README.md');
  const configPath = path.resolve(options.configFile);
  const launchCommand = buildFrontDeskDesktopLaunchCommand(outputDir);

  writeFile(packageJsonPath, buildPackageJson());
  writeFile(srcIndexHtmlPath, buildIndexHtml());
  writeFile(cargoTomlPath, buildCargoToml());
  writeFile(tauriConfigPath, buildTauriConfig());
  writeFile(tauriMainPath, buildTauriMain());
  writeFile(configPath, buildDesktopConfig(options));
  writeFile(readmePath, buildReadme(options, launchCommand));

  return {
    launch_command: launchCommand,
    assets: {
      package_root: outputDir,
      package_json: packageJsonPath,
      src_index_html: srcIndexHtmlPath,
      cargo_toml: cargoTomlPath,
      tauri_config: tauriConfigPath,
      tauri_main: tauriMainPath,
      readme: readmePath,
      config_file: configPath,
    } satisfies FrontDeskDesktopPackageAssets,
  };
}
