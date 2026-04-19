type JsonRecord = Record<string, unknown>;

export type FrontDeskWorkbenchPayload = {
  bootstrap: JsonRecord;
  state: JsonRecord;
};

function serializeJsonForHtml(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function buildFrontDeskWorkbenchHtml(payload: FrontDeskWorkbenchPayload) {
  const bootstrapJson = serializeJsonForHtml(payload.bootstrap);
  const stateJson = serializeJsonForHtml(payload.state);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Workbench</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f8;
        --bg-soft: #fbfcfd;
        --panel: rgba(255, 255, 255, 0.86);
        --panel-solid: #ffffff;
        --panel-muted: #f7f8fa;
        --line: rgba(15, 23, 42, 0.08);
        --line-strong: rgba(15, 23, 42, 0.14);
        --text: #111827;
        --muted: #667085;
        --muted-soft: #98a2b3;
        --accent: #111827;
        --accent-soft: rgba(17, 24, 39, 0.06);
        --accent-blue: #3b82f6;
        --accent-green: #0f766e;
        --accent-warm: #d97706;
        --shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
        --radius-xl: 28px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
        --font-ui: "SF Pro Display", "SF Pro Text", "PingFang SC", "Avenir Next", sans-serif;
        --font-mono: "SFMono-Regular", "Menlo", "Consolas", monospace;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
        font-family: var(--font-ui);
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 24%),
          radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.08), transparent 20%),
          linear-gradient(180deg, #fbfcfd 0%, var(--bg) 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(15, 23, 42, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15, 23, 42, 0.02) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0));
      }

      a {
        color: inherit;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      .shell {
        width: min(1520px, calc(100vw - 28px));
        margin: 14px auto;
        display: grid;
        grid-template-columns: 272px minmax(0, 1fr) 372px;
        gap: 18px;
        align-items: start;
      }

      .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow);
        backdrop-filter: blur(22px);
      }

      .sidebar,
      .main,
      .rail {
        min-width: 0;
        display: grid;
        gap: 18px;
      }

      .sidebar {
        position: sticky;
        top: 14px;
      }

      .sidebar-panel {
        padding: 18px;
      }

      .sidebar-brand {
        display: grid;
        gap: 14px;
      }

      .brand-badge,
      .section-kicker,
      .card-kicker,
      .feed-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 28px;
        padding: 0 11px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .brand-title,
      .hero-title,
      .conversation-title,
      .drawer-title {
        margin: 0;
        letter-spacing: -0.03em;
      }

      .brand-title {
        font-size: 1.45rem;
      }

      .brand-copy,
      .hero-copy,
      .muted,
      .card-copy,
      .detail-copy,
      .summary-copy {
        margin: 0;
        color: var(--muted);
        line-height: 1.66;
      }

      .sidebar-section + .sidebar-section {
        margin-top: 18px;
      }

      .sidebar-section {
        display: grid;
        gap: 12px;
      }

      .nav-list,
      .task-lane-list,
      .session-list,
      .feed-list,
      .file-list,
      .module-list,
      .operator-list,
      .path-list,
      .option-list,
      .chips,
      .story-grid,
      .metric-grid,
      .engine-grid {
        display: grid;
        gap: 12px;
      }

      .nav-item,
      .task-lane,
      .session-item,
      .feed-item,
      .file-item,
      .module-item,
      .operator-item,
      .metric-item,
      .engine-item,
      .story-card {
        padding: 14px 15px;
        border-radius: var(--radius-md);
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .nav-item.active {
        border-color: rgba(59, 130, 246, 0.24);
        background: rgba(59, 130, 246, 0.08);
      }

      .nav-row,
      .module-row,
      .file-row,
      .task-row,
      .session-row,
      .metric-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .nav-title,
      .module-title,
      .file-title,
      .story-title,
      .metric-title {
        font-weight: 700;
        color: var(--text);
      }

      .code,
      .mono,
      code,
      pre {
        font-family: var(--font-mono);
      }

      .path,
      .mono {
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--muted);
      }

      .shell-main {
        min-width: 0;
      }

      .hero {
        padding: 24px;
        display: grid;
        gap: 18px;
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent 26%),
          radial-gradient(circle at bottom left, rgba(15, 118, 110, 0.09), transparent 24%),
          rgba(255, 255, 255, 0.88);
      }

      .hero-top,
      .panel-top,
      .drawer-top {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .hero-title {
        font-size: clamp(2.2rem, 5vw, 3.6rem);
        line-height: 0.94;
      }

      .hero-actions,
      .form-actions,
      .module-actions,
      .settings-actions,
      .drawer-switcher {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .button,
      .drawer-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid transparent;
        background: var(--panel-solid);
        color: var(--text);
        text-decoration: none;
        font-weight: 700;
        transition:
          transform 140ms ease,
          background-color 140ms ease,
          border-color 140ms ease;
      }

      .button:hover,
      .drawer-toggle:hover {
        transform: translateY(-1px);
      }

      .button.primary {
        background: linear-gradient(135deg, #111827, #1f2937);
        color: #f8fafc;
      }

      .button.secondary {
        border-color: var(--line-strong);
        background: rgba(255, 255, 255, 0.72);
      }

      .drawer-toggle {
        flex: 1 1 0;
        min-width: 0;
        border-color: var(--line);
      }

      .drawer-toggle.is-active {
        background: #111827;
        color: #f9fafb;
      }

      .main-panel,
      .drawer-panel {
        padding: 22px;
      }

      .conversation-feed {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }

      .message {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .message.agent {
        background: rgba(17, 24, 39, 0.04);
      }

      .message.user {
        background: rgba(59, 130, 246, 0.08);
      }

      .story-grid,
      .metric-grid,
      .engine-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 18px;
      }

      .composer-form {
        margin-top: 18px;
        display: grid;
        gap: 14px;
      }

      .composer-form textarea {
        width: 100%;
        min-height: 128px;
        resize: vertical;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.9);
        color: var(--text);
        line-height: 1.7;
      }

      .composer-grid,
      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .field select {
        min-height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.9);
      }

      .status-line,
      .empty-state {
        color: var(--muted);
        line-height: 1.6;
      }

      .json-view {
        margin-top: 12px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: #0f172a;
        color: #e2e8f0;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.84rem;
        line-height: 1.65;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 11px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--text);
        font-size: 0.88rem;
        font-weight: 700;
      }

      .chip.success {
        background: rgba(16, 185, 129, 0.12);
        color: #047857;
      }

      .chip.warning {
        background: rgba(217, 119, 6, 0.14);
        color: #b45309;
      }

      .chip.danger {
        background: rgba(220, 38, 38, 0.12);
        color: #b91c1c;
      }

      .chip.info {
        background: rgba(59, 130, 246, 0.12);
        color: #1d4ed8;
      }

      .drawer-panel.is-hidden {
        display: none;
      }

      .details-panel {
        margin-top: 16px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
        overflow: hidden;
      }

      .details-panel summary {
        padding: 16px 18px;
        cursor: pointer;
        font-weight: 700;
      }

      .details-panel[open] summary {
        border-bottom: 1px solid var(--line);
      }

      .details-body {
        padding: 0 18px 18px;
      }

      @media (max-width: 1360px) {
        .shell {
          grid-template-columns: 240px minmax(0, 1fr) 340px;
        }
      }

      @media (max-width: 1180px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
        }
      }

      @media (max-width: 760px) {
        .shell {
          width: min(100vw - 16px, 100%);
          margin: 8px auto 18px;
          gap: 14px;
        }

        .story-grid,
        .metric-grid,
        .engine-grid,
        .composer-grid,
        .settings-grid {
          grid-template-columns: 1fr;
        }

        .hero,
        .main-panel,
        .drawer-panel,
        .sidebar-panel {
          padding: 18px;
        }

        .hero-title {
          font-size: 2rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <aside class="sidebar">
        <section class="panel sidebar-panel">
          <div class="sidebar-brand">
            <span class="brand-badge">OPL Workbench</span>
            <div>
              <h1 class="brand-title">Workspace-first control room</h1>
              <p class="brand-copy">OPL 把 workspace、任务、进度和交付文件收在同一张工作台里。</p>
            </div>
            <div class="chip-row">
              <span class="chip">Codex</span>
              <span class="chip">Hermes-Agent</span>
            </div>
          </div>
        </section>

        <section class="panel sidebar-panel sidebar-section">
          <span class="section-kicker">Workspace Navigator</span>
          <div id="workspace-sidebar" class="nav-list"></div>
        </section>

        <section class="panel sidebar-panel sidebar-section">
          <span class="section-kicker">Task Navigator</span>
          <div id="task-sidebar" class="task-lane-list"></div>
        </section>

        <section class="panel sidebar-panel sidebar-section">
          <span class="section-kicker">Recent Sessions</span>
          <div id="session-sidebar" class="session-list"></div>
        </section>
      </aside>

      <section class="main shell-main">
        <section class="panel hero">
          <div class="hero-top">
            <div>
              <span class="brand-badge">OPL Workbench</span>
              <h2 id="hero-title" class="hero-title">OPL Workbench</h2>
              <p id="hero-copy" class="hero-copy">Workspace-first control room for long-running research, delivery, and module orchestration.</p>
            </div>
            <div class="hero-actions">
              <a class="button primary" href="/login">Open OPL Agent</a>
              <button class="button secondary" id="refresh-button" type="button">Refresh</button>
            </div>
          </div>
          <div id="metric-grid" class="metric-grid"></div>
        </section>

        <section class="panel main-panel">
          <div class="panel-top">
            <div>
              <span class="section-kicker">Conversation Surface</span>
              <h2 id="conversation-title" class="conversation-title">Current mission</h2>
            </div>
            <div id="conversation-status" class="chip-row"></div>
          </div>
          <div id="conversation-feed" class="conversation-feed"></div>
          <div id="story-grid" class="story-grid"></div>
        </section>

        <section class="panel main-panel">
          <div class="panel-top">
            <div>
              <span class="section-kicker">Route The Next Task</span>
              <h2 class="conversation-title">Send the next instruction</h2>
            </div>
            <p class="summary-copy">用人话描述下一步，让 OPL 帮你路由到合适的模块与执行器。</p>
          </div>
          <form id="ask-form" class="composer-form">
            <textarea id="goal" name="goal" placeholder="Describe the next task in plain language..."></textarea>
            <div class="composer-grid">
              <div class="field">
                <label for="preferred-family">Preferred family</label>
                <select id="preferred-family" name="preferred-family">
                  <option value="">Auto route</option>
                  <option value="research_delivery">Research delivery</option>
                  <option value="grant_delivery">Grant delivery</option>
                  <option value="ppt_deck">Presentation ops</option>
                </select>
              </div>
              <div class="field">
                <label for="request-kind">Request kind</label>
                <select id="request-kind" name="request-kind">
                  <option value="">Infer from the goal</option>
                  <option value="analysis">Analysis</option>
                  <option value="writing">Writing</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button class="button secondary" type="button" id="preview-button">Preview route</button>
              <button class="button primary" type="submit" id="ask-button">Send to OPL</button>
            </div>
            <div id="ask-status" class="status-line"></div>
            <details class="details-panel">
              <summary>Task envelope</summary>
              <div class="details-body">
                <pre id="ask-json" class="json-view">{}</pre>
              </div>
            </details>
          </form>
        </section>

        <section class="panel main-panel">
          <div class="panel-top">
            <div>
              <span class="section-kicker">Operator Surfaces</span>
              <h2 class="conversation-title">Truth surfaces and debug hooks</h2>
            </div>
            <p class="summary-copy">保留给运维、自动化和机器消费，默认折叠，不污染主工作台。</p>
          </div>
          <details class="details-panel">
            <summary>API surfaces</summary>
            <div class="details-body">
              <div id="operator-links" class="operator-list"></div>
            </div>
          </details>
          <details class="details-panel">
            <summary>Bootstrap JSON</summary>
            <div class="details-body">
              <pre class="json-view" id="bootstrap-json"></pre>
            </div>
          </details>
        </section>
      </section>

      <aside class="rail">
        <section class="panel drawer-panel">
          <div class="drawer-switcher">
            <button class="drawer-toggle is-active" type="button" data-drawer="progress">Human Progress Feed</button>
            <button class="drawer-toggle" type="button" data-drawer="files">Deliverables Rail</button>
            <button class="drawer-toggle" type="button" data-drawer="settings">Settings & Modules</button>
          </div>
        </section>

        <section class="panel drawer-panel" data-drawer-panel="progress">
          <div class="drawer-top">
            <div>
              <span class="section-kicker">Human Progress Feed</span>
              <h2 class="drawer-title">后台长任务的人话状态</h2>
            </div>
            <p class="summary-copy">现在做到哪里、刚刚发生了什么、接下来系统会做什么。</p>
          </div>
          <div id="progress-drawer" class="feed-list"></div>
        </section>

        <section class="panel drawer-panel is-hidden" data-drawer-panel="files">
          <div class="drawer-top">
            <div>
              <span class="section-kicker">Deliverables Rail</span>
              <h2 class="drawer-title">最值得打开的文件</h2>
            </div>
            <p class="summary-copy">交付文件和 supporting files 会固定留在这里。</p>
          </div>
          <div id="files-drawer" class="file-list"></div>
        </section>

        <section class="panel drawer-panel is-hidden" data-drawer-panel="settings">
          <div class="drawer-top">
            <div>
              <span class="section-kicker">Settings & Modules</span>
              <h2 class="drawer-title">Executor modes, environment, and installs</h2>
            </div>
            <p class="summary-copy">Settings, modules, and progress stay aligned here.</p>
          </div>
          <form id="settings-form" class="composer-form">
            <div class="settings-grid">
              <div class="field">
                <label for="interaction-mode">Interaction mode</label>
                <select id="interaction-mode" name="interaction-mode">
                  <option value="codex">Codex</option>
                  <option value="hermes">Hermes-Agent</option>
                </select>
              </div>
              <div class="field">
                <label for="execution-mode">Execution mode</label>
                <select id="execution-mode" name="execution-mode">
                  <option value="codex">Codex</option>
                  <option value="hermes">Hermes-Agent</option>
                </select>
              </div>
            </div>
            <div class="settings-actions">
              <button class="button primary" type="submit" id="save-settings-button">Save modes</button>
            </div>
            <div id="settings-status" class="status-line"></div>
          </form>
          <div id="environment-grid" class="engine-grid"></div>
          <div id="modules-grid" class="module-list"></div>
        </section>
      </aside>
    </main>

    <script id="opl-bootstrap" type="application/json">${bootstrapJson}</script>
    <script id="opl-workbench-bootstrap" type="application/json">${bootstrapJson}</script>
    <script id="opl-workbench-state" type="application/json">${stateJson}</script>
    <script>
      (() => {
        const bootstrap = JSON.parse(document.getElementById('opl-workbench-bootstrap').textContent || '{}');
        const state = JSON.parse(document.getElementById('opl-workbench-state').textContent || '{}');
        const ui = {
          activeDrawer: 'progress',
          askResult: null,
        };

        const workspaceSidebar = document.getElementById('workspace-sidebar');
        const taskSidebar = document.getElementById('task-sidebar');
        const sessionSidebar = document.getElementById('session-sidebar');
        const heroTitle = document.getElementById('hero-title');
        const heroCopy = document.getElementById('hero-copy');
        const metricGrid = document.getElementById('metric-grid');
        const conversationTitle = document.getElementById('conversation-title');
        const conversationStatus = document.getElementById('conversation-status');
        const conversationFeed = document.getElementById('conversation-feed');
        const storyGrid = document.getElementById('story-grid');
        const progressDrawer = document.getElementById('progress-drawer');
        const filesDrawer = document.getElementById('files-drawer');
        const environmentGrid = document.getElementById('environment-grid');
        const modulesGrid = document.getElementById('modules-grid');
        const operatorLinks = document.getElementById('operator-links');
        const bootstrapJson = document.getElementById('bootstrap-json');
        const askStatus = document.getElementById('ask-status');
        const askJson = document.getElementById('ask-json');
        const settingsStatus = document.getElementById('settings-status');
        const interactionMode = document.getElementById('interaction-mode');
        const executionMode = document.getElementById('execution-mode');
        const drawerButtons = Array.from(document.querySelectorAll('[data-drawer]'));
        const drawerPanels = Array.from(document.querySelectorAll('[data-drawer-panel]'));

        function isRecord(value) {
          return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
        }

        function asRecord(value) {
          return isRecord(value) ? value : {};
        }

        function asList(value) {
          return Array.isArray(value) ? value : [];
        }

        function text(value, fallback = '') {
          return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
        }

        function count(value, fallback = 0) {
          return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
        }

        function escapeHtml(value) {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function chip(label, tone = '') {
          const className = tone ? 'chip ' + tone : 'chip';
          return '<span class="' + className + '">' + escapeHtml(label) + '</span>';
        }

        function pathBlock(value, fallback) {
          return '<div class="path">' + escapeHtml(text(value, fallback)) + '</div>';
        }

        function apiEndpoints() {
          return asRecord(asRecord(bootstrap).web_frontdesk).api;
        }

        function currentProject() {
          return asRecord(state.progress).current_project ? asRecord(asRecord(state.progress).current_project) : {};
        }

        function currentStudy() {
          return asRecord(asRecord(state.progress).current_study);
        }

        function progressFeedback() {
          return asRecord(asRecord(state.progress).progress_feedback);
        }

        function workspaceInbox() {
          return asRecord(asRecord(state.progress).workspace_inbox);
        }

        function workspaceFiles() {
          return asRecord(asRecord(state.progress).workspace_files);
        }

        function workspaceCatalogProjects() {
          return asList(asRecord(asRecord(state.dashboard).workspace_catalog).projects)
            .map((entry) => asRecord(entry))
            .filter((entry) => Object.keys(entry).length > 0);
        }

        function sessionList() {
          return asList(state.sessions).map((entry) => asRecord(entry));
        }

        function moduleList() {
          return asList(asRecord(state.modules).modules).map((entry) => asRecord(entry));
        }

        function environmentPayload() {
          return asRecord(state.environment);
        }

        function settingsPayload() {
          return asRecord(state.settings);
        }

        function laneEntries(lane) {
          const sections = asRecord(workspaceInbox().sections);
          return asList(sections[lane]).map((entry) => asRecord(entry));
        }

        function laneCount(summary, key) {
          return count(asRecord(summary)[key], 0);
        }

        function renderWorkspaceSidebar() {
          const current = currentProject();
          const projects = workspaceCatalogProjects();
          const rows = [];
          rows.push(
            '<div class="nav-item active">'
            + '<div class="nav-row"><span class="nav-title">' + escapeHtml(text(current.label, 'Current workspace')) + '</span>'
            + chip(text(current.project_id || current.label, 'active'), 'info') + '</div>'
            + pathBlock(current.workspace_path, 'Workspace path unavailable')
            + '</div>',
          );

          projects
            .filter((entry) => text(entry.project_id) !== 'opl')
            .forEach((entry) => {
              const activeBinding = asRecord(entry.active_binding);
              const active = text(activeBinding.status) === 'active';
              rows.push(
                '<div class="nav-item' + (active ? ' active' : '') + '">'
                + '<div class="nav-row"><span class="nav-title">' + escapeHtml(text(entry.project, text(entry.project_id, 'Workspace'))) + '</span>'
                + chip(active ? 'Active' : 'Known', active ? 'success' : '') + '</div>'
                + pathBlock(activeBinding.workspace_path, 'No active binding yet')
                + '</div>',
              );
            });

          workspaceSidebar.innerHTML = rows.join('');
        }

        function renderTaskSidebar() {
          const summary = asRecord(workspaceInbox().summary);
          const lanes = [
            { key: 'running', label: 'Running', tone: 'info', cards: laneEntries('running') },
            { key: 'waiting', label: 'Waiting', tone: 'warning', cards: laneEntries('waiting') },
            { key: 'ready', label: 'Ready', tone: 'success', cards: laneEntries('ready') },
            { key: 'delivered', label: 'Delivered', tone: 'success', cards: laneEntries('delivered') },
          ];
          const rows = lanes.map((lane) => {
            const topCard = lane.cards[0] || {};
            return '<div class="task-lane">'
              + '<div class="task-row"><span class="module-title">' + escapeHtml(lane.label) + '</span>'
              + chip(String(laneCount(summary, lane.key + '_count') || lane.cards.length), lane.tone) + '</div>'
              + '<p class="card-copy">' + escapeHtml(text(topCard.summary, text(topCard.latest_update, 'No current task in this lane.'))) + '</p>'
              + pathBlock(topCard.inspect_path, 'No inspect path')
              + '</div>';
          });
          taskSidebar.innerHTML = rows.join('');
        }

        function renderSessionSidebar() {
          const rows = sessionList().slice(0, 4).map((entry) => {
            return '<div class="session-item">'
              + '<div class="session-row"><span class="module-title">' + escapeHtml(text(entry.preview, 'Session')) + '</span>'
              + chip(text(entry.source, 'session')) + '</div>'
              + '<div class="path">' + escapeHtml(text(entry.session_id, 'Unknown session')) + '</div>'
              + '<p class="card-copy">' + escapeHtml(text(entry.last_active, 'Last active time unavailable')) + '</p>'
              + '</div>';
          });
          sessionSidebar.innerHTML = rows.length > 0
            ? rows.join('')
            : '<div class="empty-state">No recent sessions yet.</div>';
        }

        function renderHero() {
          const current = currentProject();
          const feedback = progressFeedback();
          const summary = text(state.progress.progress_summary, '当前还没有新的项目级摘要。');
          heroTitle.textContent = text(current.label, 'OPL Workbench');
          heroCopy.textContent = text(feedback.headline, summary);

          const summaryInbox = asRecord(workspaceInbox().summary);
          const files = workspaceFiles();
          const deliverables = asList(files.deliverable_files);
          const metrics = [
            {
              title: 'Next focus',
              value: text(state.progress.next_focus, 'Ask OPL for the next action.'),
            },
            {
              title: 'Running tasks',
              value: String(count(summaryInbox.running_count, laneEntries('running').length)),
            },
            {
              title: 'Deliverables',
              value: String(deliverables.length),
            },
            {
              title: 'Interaction mode',
              value: text(settingsPayload().interaction_mode, 'codex'),
            },
          ];
          metricGrid.innerHTML = metrics.map((entry) => {
            return '<div class="metric-item">'
              + '<div class="metric-row"><span class="metric-title">' + escapeHtml(entry.title) + '</span>'
              + chip(entry.value) + '</div>'
              + '</div>';
          }).join('');
        }

        function renderConversation() {
          const study = currentStudy();
          const feedback = progressFeedback();
          const messages = [
            {
              role: 'agent',
              kicker: 'Workspace brief',
              body: text(state.progress.progress_summary, '当前还没有结构化项目摘要。'),
            },
            {
              role: 'agent',
              kicker: 'Live progress',
              body: text(feedback.latest_update, text(feedback.headline, '当前还没有新的自然语言进度反馈。')),
            },
            {
              role: 'agent',
              kicker: 'Next step',
              body: text(feedback.next_step, text(study.next_system_action, '继续查看当前任务的详细进度。')),
            },
          ];

          if (ui.askResult) {
            messages.unshift({
              role: 'user',
              kicker: ui.askResult.kicker,
              body: ui.askResult.body,
            });
          }

          conversationTitle.textContent = text(study.title, text(currentProject().label, 'Current mission'));
          conversationStatus.innerHTML = [
            chip(text(feedback.current_status, 'status')),
            chip(text(feedback.runtime_status, text(settingsPayload().execution_mode, 'codex')), 'info'),
          ].join('');

          conversationFeed.innerHTML = messages.map((entry) => {
            return '<div class="message ' + entry.role + '">'
              + '<span class="feed-kicker">' + escapeHtml(entry.kicker) + '</span>'
              + '<div class="detail-copy">' + escapeHtml(entry.body) + '</div>'
              + '</div>';
          }).join('');

          const cards = [
            {
              title: 'Study story',
              body: text(study.story_summary, '当前还没有抽出论文主线。'),
            },
            {
              title: 'Clinical question',
              body: text(study.clinical_question, '当前还没有抽出临床问题摘要。'),
            },
            {
              title: 'Writing boundary',
              body: text(study.innovation_summary, '当前还没有抽出写作边界。'),
            },
            {
              title: 'Current effect',
              body: text(study.current_effect_summary, '当前还没有抽出阶段结果。'),
            },
          ];

          storyGrid.innerHTML = cards.map((entry) => {
            return '<div class="story-card">'
              + '<div class="story-title">' + escapeHtml(entry.title) + '</div>'
              + '<p class="card-copy">' + escapeHtml(entry.body) + '</p>'
              + '</div>';
          }).join('');
        }

        function renderProgressDrawer() {
          const feedback = progressFeedback();
          const inspectPaths = asList(state.progress.inspect_paths);
          const userOptions = asList(state.progress.user_options);
          const items = [
            {
              kicker: 'Now',
              body: text(feedback.headline, '当前还没有读到新的 headline。'),
            },
            {
              kicker: 'Current state',
              body: text(feedback.status_summary, '当前还没有结构化状态摘要。'),
            },
            {
              kicker: 'Latest update',
              body: text(feedback.latest_update, '当前还没有新的更新时间。'),
            },
            {
              kicker: 'Next step',
              body: text(feedback.next_step, '继续读取当前任务的详细进度。'),
            },
          ];

          if (inspectPaths.length > 0) {
            items.push({
              kicker: 'Inspect paths',
              body: inspectPaths.map((entry) => text(entry)).filter(Boolean).join('\\n'),
            });
          }

          if (userOptions.length > 0) {
            items.push({
              kicker: 'Ask like this',
              body: userOptions.map((entry) => text(entry)).filter(Boolean).join('\\n'),
            });
          }

          progressDrawer.innerHTML = items.map((entry) => {
            return '<div class="feed-item">'
              + '<span class="feed-kicker">' + escapeHtml(entry.kicker) + '</span>'
              + '<div class="detail-copy">' + escapeHtml(entry.body) + '</div>'
              + '</div>';
          }).join('');
        }

        function renderFilesDrawer() {
          const files = workspaceFiles();
          const groups = [
            {
              title: 'Deliverables',
              items: asList(files.deliverable_files),
            },
            {
              title: 'Supporting files',
              items: asList(files.supporting_files),
            },
          ];

          const rows = [];
          groups.forEach((group) => {
            rows.push('<div class="file-item"><div class="file-row"><span class="file-title">' + escapeHtml(group.title) + '</span>'
              + chip(String(group.items.length)) + '</div></div>');
            if (group.items.length === 0) {
              rows.push('<div class="file-item"><p class="card-copy">No files surfaced yet.</p></div>');
            } else {
              group.items.forEach((entry) => {
                const file = asRecord(entry);
                rows.push(
                  '<div class="file-item">'
                  + '<div class="file-row"><span class="file-title">' + escapeHtml(text(file.label, 'File')) + '</span>'
                  + chip(text(file.file_id, 'file')) + '</div>'
                  + pathBlock(file.path, 'Unknown path')
                  + '<p class="card-copy">' + escapeHtml(text(file.summary, 'No summary available.')) + '</p>'
                  + '</div>',
                );
              });
            }
          });

          filesDrawer.innerHTML = rows.join('');
        }

        function renderSettingsDrawer() {
          const env = environmentPayload();
          const codex = asRecord(asRecord(env.core_engines).codex);
          const hermes = asRecord(asRecord(env.core_engines).hermes);

          interactionMode.value = text(settingsPayload().interaction_mode, 'codex');
          executionMode.value = text(settingsPayload().execution_mode, 'codex');

          const engines = [
            {
              title: 'Codex',
              tone: text(codex.health_status, 'missing') === 'ready' ? 'success' : 'warning',
              lines: [
                'Version: ' + text(codex.version, 'Unavailable'),
                'Model: ' + text(codex.default_model, 'Unset'),
                'Reasoning: ' + text(codex.default_reasoning_effort, 'Unset'),
                'Config: ' + text(codex.config_path, 'Unavailable'),
              ],
            },
            {
              title: 'Hermes-Agent',
              tone: text(hermes.health_status, 'missing') === 'ready' ? 'success' : 'warning',
              lines: [
                'Version: ' + text(hermes.version, 'Unavailable'),
                'Gateway: ' + (hermes.gateway_loaded ? 'Loaded' : 'Not loaded'),
                'Status: ' + text(hermes.health_status, 'missing'),
              ],
            },
          ];

          environmentGrid.innerHTML = engines.map((entry) => {
            return '<div class="engine-item">'
              + '<div class="module-row"><span class="module-title">' + escapeHtml(entry.title) + '</span>'
              + chip(text(entry.tone, 'ready'), entry.tone === 'success' ? 'success' : 'warning') + '</div>'
              + '<p class="card-copy">' + escapeHtml(entry.lines.join('\\n')) + '</p>'
              + '</div>';
          }).join('');

          const moduleRows = moduleList().map((entry) => {
            const git = asRecord(entry.git);
            const actions = asList(entry.available_actions);
            const tone = text(entry.health_status) === 'ready'
              ? 'success'
              : (text(entry.health_status) === 'dirty' ? 'warning' : 'danger');
            const actionButtons = actions.map((action) => {
              return '<button class="button secondary" type="button" data-module-action="' + escapeHtml(String(action)) + '" data-module-id="' + escapeHtml(text(entry.module_id, '')) + '">'
                + escapeHtml(String(action))
                + '</button>';
            }).join('');

            return '<div class="module-item">'
              + '<div class="module-row"><span class="module-title">' + escapeHtml(text(entry.label, text(entry.module_id, 'Module'))) + '</span>'
              + chip(text(entry.health_status, 'missing'), tone) + '</div>'
              + '<p class="card-copy">' + escapeHtml(text(entry.description, '')) + '</p>'
              + '<div class="path">' + escapeHtml(text(entry.checkout_path, 'No checkout')) + '</div>'
              + '<p class="card-copy">' + escapeHtml('Origin: ' + text(entry.install_origin, 'missing')) + '</p>'
              + '<p class="card-copy">' + escapeHtml('Git: ' + text(git.branch, 'n/a') + ' @ ' + text(git.short_sha, 'n/a')) + '</p>'
              + '<div class="module-actions">' + actionButtons + '</div>'
              + '</div>';
          });

          modulesGrid.innerHTML = moduleRows.length > 0
            ? moduleRows.join('')
            : '<div class="empty-state">No modules surfaced yet.</div>';
        }

        function renderOperators() {
          const apis = apiEndpoints();
          const links = Object.entries(apis).map(([key, value]) => {
            const href = text(value, '#');
            return '<div class="operator-item">'
              + '<div class="module-row"><span class="module-title">' + escapeHtml(key) + '</span>'
              + '<a class="button secondary" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer">Open</a></div>'
              + '<div class="path">' + escapeHtml(href) + '</div>'
              + '</div>';
          });
          operatorLinks.innerHTML = links.join('');
          bootstrapJson.textContent = JSON.stringify(bootstrap, null, 2);
        }

        function renderDrawerVisibility() {
          drawerButtons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.drawer === ui.activeDrawer);
          });
          drawerPanels.forEach((panel) => {
            panel.classList.toggle('is-hidden', panel.dataset.drawerPanel !== ui.activeDrawer);
          });
        }

        function renderAll() {
          renderWorkspaceSidebar();
          renderTaskSidebar();
          renderSessionSidebar();
          renderHero();
          renderConversation();
          renderProgressDrawer();
          renderFilesDrawer();
          renderSettingsDrawer();
          renderOperators();
          renderDrawerVisibility();
        }

        async function fetchJson(url, options) {
          const response = await fetch(url, options);
          if (!response.ok) {
            throw new Error('Request failed: ' + response.status + ' ' + url);
          }
          return await response.json();
        }

        async function refreshWorkbench() {
          const api = apiEndpoints();
          try {
            const [dashboard, progress, settings, environment, modules, sessions] = await Promise.all([
              fetchJson(text(api.dashboard, '/api/status/dashboard')),
              fetchJson(text(api.project_progress, '/api/project-progress')),
              fetchJson(text(api.frontdesk_settings, '/api/frontdesk/settings')),
              fetchJson(text(api.frontdesk_environment, '/api/frontdesk/environment')),
              fetchJson(text(api.frontdesk_modules, '/api/frontdesk/modules')),
              fetchJson(text(api.sessions, '/api/session/list')),
            ]);

            state.dashboard = asRecord(dashboard).dashboard || {};
            state.progress = asRecord(progress).project_progress || {};
            state.settings = asRecord(settings).frontdesk_settings || {};
            state.environment = asRecord(environment).frontdesk_environment || {};
            state.modules = asRecord(modules).frontdesk_modules || {};
            state.sessions = asRecord(sessions).product_entry ? asRecord(sessions).product_entry.sessions || [] : [];
            renderAll();
          } catch (error) {
            askStatus.textContent = error instanceof Error ? error.message : 'Refresh failed.';
          }
        }

        function buildAskPayload(dryRun) {
          return {
            goal: document.getElementById('goal').value,
            preferred_family: document.getElementById('preferred-family').value || undefined,
            request_kind: document.getElementById('request-kind').value || undefined,
            dry_run: dryRun,
          };
        }

        function summarizeAskPayload(payload) {
          const productEntry = asRecord(payload.product_entry);
          const routing = asRecord(productEntry.routing);
          const task = asRecord(productEntry.task);
          if (productEntry.dry_run) {
            return {
              kicker: 'Route preview',
              body: 'Preview ready for ' + text(routing.domain_id, 'opl') + '.',
            };
          }
          if (text(task.task_id)) {
            return {
              kicker: 'Queued task',
              body: text(task.task_id) + ' accepted and now preparing deliverables.',
            };
          }
          return {
            kicker: 'Updated task',
            body: 'OPL processed the latest instruction.',
          };
        }

        async function submitAsk(dryRun) {
          askStatus.textContent = dryRun ? 'Preparing route preview...' : 'Submitting task...';
          const payload = buildAskPayload(dryRun);
          const api = apiEndpoints();
          try {
            const result = await fetchJson(text(api.ask, '/api/ask'), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(payload),
            });
            ui.askResult = summarizeAskPayload(result);
            askJson.textContent = JSON.stringify(result, null, 2);
            askStatus.textContent = ui.askResult.body;
            renderConversation();
            if (!dryRun) {
              await refreshWorkbench();
            }
          } catch (error) {
            askStatus.textContent = error instanceof Error ? error.message : 'Ask failed.';
          }
        }

        async function saveSettings(event) {
          event.preventDefault();
          settingsStatus.textContent = 'Saving modes...';
          const api = apiEndpoints();
          try {
            const result = await fetchJson(text(api.frontdesk_settings, '/api/frontdesk/settings'), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                interaction_mode: interactionMode.value,
                execution_mode: executionMode.value,
              }),
            });
            state.settings = asRecord(result).frontdesk_settings || {};
            settingsStatus.textContent = 'Modes updated.';
            renderSettingsDrawer();
            renderHero();
          } catch (error) {
            settingsStatus.textContent = error instanceof Error ? error.message : 'Settings update failed.';
          }
        }

        async function runModuleAction(action, moduleId) {
          settingsStatus.textContent = 'Running ' + action + ' for ' + moduleId + '...';
          const api = apiEndpoints();
          try {
            await fetchJson(text(api.frontdesk_module_action, '/api/frontdesk/module/action'), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                action,
                module_id: moduleId,
              }),
            });
            settingsStatus.textContent = 'Module action completed.';
            await refreshWorkbench();
          } catch (error) {
            settingsStatus.textContent = error instanceof Error ? error.message : 'Module action failed.';
          }
        }

        document.getElementById('refresh-button').addEventListener('click', () => {
          refreshWorkbench().catch(() => {});
        });

        document.getElementById('preview-button').addEventListener('click', () => {
          submitAsk(true).catch(() => {});
        });

        document.getElementById('ask-form').addEventListener('submit', (event) => {
          event.preventDefault();
          submitAsk(false).catch(() => {});
        });

        document.getElementById('settings-form').addEventListener('submit', (event) => {
          saveSettings(event).catch(() => {});
        });

        drawerButtons.forEach((button) => {
          button.addEventListener('click', () => {
            ui.activeDrawer = button.dataset.drawer || 'progress';
            renderDrawerVisibility();
          });
        });

        document.body.addEventListener('click', (event) => {
          const button = event.target.closest('[data-module-action]');
          if (!button) {
            return;
          }
          runModuleAction(button.dataset.moduleAction || '', button.dataset.moduleId || '').catch(() => {});
        });

        renderAll();
        window.setInterval(() => {
          refreshWorkbench().catch(() => {});
        }, 30000);
      })();
    </script>
  </body>
</html>`;
}
