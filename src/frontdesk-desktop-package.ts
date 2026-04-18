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
  main_script: string;
  preload_script: string;
  renderer_html: string;
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
    type: 'module',
    main: 'main.js',
    scripts: {
      start: 'electron .',
      dev: 'electron .',
    },
    devDependencies: {
      electron: '^41.0.0',
    },
  }, null, 2)}\n`;
}

function buildDesktopConfig(options: FrontDeskDesktopPackageOptions) {
  const healthUrl = `${options.apiBaseUrl}/health`;

  return `${JSON.stringify({
    version: 'g2',
    shell_kind: 'electron_desktop_shell',
    app_title: options.appTitle,
    model_display_label: options.modelDisplayLabel,
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

function buildMainScript() {
  return `import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, 'config', 'desktop-config.json');
const fallbackHtml = path.join(__dirname, 'renderer', 'index.html');

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

let mainWindow = null;

async function showFrontdesk(window) {
  const config = readConfig();

  try {
    const health = await fetch(config.health_url);
    if (health.ok) {
      await window.loadURL(config.frontdesk_url);
      return { loaded: 'frontdesk' };
    }
  } catch {
    // Fall through to local fallback page.
  }

  await window.loadFile(fallbackHtml);
  return { loaded: 'fallback' };
}

async function createWindow() {
  const config = readConfig();
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: config.app_title,
    backgroundColor: '#f6f2ea',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow = window;
  await showFrontdesk(window);
}

app.whenReady().then(async () => {
  ipcMain.handle('opl-atlas:get-config', () => readConfig());
  ipcMain.handle('opl-atlas:retry-frontdesk', async () => {
    if (!mainWindow) {
      return { ok: false };
    }

    return await showFrontdesk(mainWindow);
  });

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
`;
}

function buildPreloadScript() {
  return `import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('oplAtlasDesktop', {
  getConfig: () => ipcRenderer.invoke('opl-atlas:get-config'),
  retryFrontdesk: () => ipcRenderer.invoke('opl-atlas:retry-frontdesk'),
});
`;
}

function buildRendererHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Atlas Desktop</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f2ea;
        --panel: rgba(255, 252, 247, 0.92);
        --line: rgba(103, 89, 72, 0.18);
        --text: #2e261d;
        --muted: #6e6256;
        --accent: #b45a2a;
        --accent-soft: rgba(180, 90, 42, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "SF Pro Text", "PingFang SC", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(217, 148, 112, 0.16), transparent 34%),
          linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
      }

      .shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 40px;
      }

      .panel {
        width: min(760px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 20px 50px rgba(60, 38, 18, 0.08);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      h1 {
        margin: 18px 0 12px;
        font-size: 34px;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .grid {
        display: grid;
        gap: 14px;
        margin-top: 24px;
      }

      .card {
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .label {
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .value {
        margin-top: 6px;
        font-size: 15px;
        word-break: break-word;
      }

      .actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }

      button {
        border: 0;
        border-radius: 14px;
        padding: 12px 16px;
        font: inherit;
        cursor: pointer;
      }

      .primary {
        background: var(--accent);
        color: white;
      }

      .ghost {
        background: rgba(255, 255, 255, 0.68);
        color: var(--text);
        border: 1px solid var(--line);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <div class="eyebrow">OPL Atlas Desktop</div>
        <h1>本机 Front Desk 正在准备中</h1>
        <p>
          OPL Atlas 会优先连接本机 frontdesk service。只要本地 service 就绪，窗口会切回真正的
          workspace-first 前台。
        </p>
        <div class="grid" id="meta"></div>
        <div class="actions">
          <button class="primary" id="retry">重新连接 Front Desk</button>
          <button class="ghost" id="copy">复制启动信息</button>
        </div>
      </section>
    </main>
    <script type="module">
      const meta = document.getElementById('meta');
      const retry = document.getElementById('retry');
      const copy = document.getElementById('copy');

      async function render() {
        const config = await window.oplAtlasDesktop.getConfig();
        const entries = [
          ['Workspace', config.workspace_path],
          ['Front Desk URL', config.frontdesk_url],
          ['API Base', config.api_base_url],
          ['Project', config.active_project_label || 'Unbound workspace'],
          ['Interaction Mode', config.interaction_mode],
          ['Execution Mode', config.execution_mode],
          ['Agent', \`\${config.model_display_label} / \${config.codex.model}\`],
        ];

        meta.innerHTML = entries.map(([label, value]) => \`
          <div class="card">
            <div class="label">\${label}</div>
            <div class="value">\${value}</div>
          </div>
        \`).join('');

        retry.onclick = async () => {
          await window.oplAtlasDesktop.retryFrontdesk();
        };

        copy.onclick = async () => {
          const text = [
            \`Workspace: \${config.workspace_path}\`,
            \`Project: \${config.active_project_label || 'Unbound workspace'}\`,
            \`Interaction Mode: \${config.interaction_mode}\`,
            \`Execution Mode: \${config.execution_mode}\`,
            \`Front Desk URL: \${config.frontdesk_url}\`,
            \`API Base: \${config.api_base_url}\`,
          ].join('\\n');
          await navigator.clipboard.writeText(text);
        };
      }

      render();
    </script>
  </body>
</html>
`;
}

function buildReadme(options: FrontDeskDesktopPackageOptions, launchCommand: string) {
  return `# OPL Atlas Desktop

This package is the local desktop-first front door for OPL.

- Desktop shell: Electron
- Routed gateway: OPL Front Desk at ${options.frontdeskUrl}
- Active workspace: ${options.workspacePath}
- Active project: ${options.activeProjectLabel ?? 'Unbound workspace'}
- Interaction mode: ${options.runtimeModes.interaction_mode}
- Execution mode: ${options.runtimeModes.execution_mode}

LibreChat has moved to an optional lane:

- default local path: \`opl frontdesk-bootstrap\`
- optional Docker lane: \`opl frontdesk-librechat-install\`

## Launch

1. Ensure the local frontdesk service is installed and running.
2. From this directory, run:

\`\`\`bash
${launchCommand}
\`\`\`

## Notes

- This shell reuses the existing OPL web front desk as its truth surface.
- The Docker-based LibreChat shell remains available only for optional hosted or compatibility flows.
`;
}

export function buildFrontDeskDesktopLaunchCommand(packageRoot: string) {
  return `cd ${shellSingleQuote(packageRoot)} && npm install && npx electron .`;
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
  const mainScriptPath = path.join(outputDir, 'main.js');
  const preloadScriptPath = path.join(outputDir, 'preload.js');
  const rendererHtmlPath = path.join(outputDir, 'renderer', 'index.html');
  const readmePath = path.join(outputDir, 'README.md');
  const configPath = path.resolve(options.configFile);
  const launchCommand = buildFrontDeskDesktopLaunchCommand(outputDir);

  writeFile(packageJsonPath, buildPackageJson());
  writeFile(mainScriptPath, buildMainScript());
  writeFile(preloadScriptPath, buildPreloadScript());
  writeFile(rendererHtmlPath, buildRendererHtml());
  writeFile(configPath, buildDesktopConfig(options));
  writeFile(readmePath, buildReadme(options, launchCommand));

  return {
    launch_command: launchCommand,
    assets: {
      package_root: outputDir,
      package_json: packageJsonPath,
      main_script: mainScriptPath,
      preload_script: preloadScriptPath,
      renderer_html: rendererHtmlPath,
      readme: readmePath,
      config_file: configPath,
    } satisfies FrontDeskDesktopPackageAssets,
  };
}
