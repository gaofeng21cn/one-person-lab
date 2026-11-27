import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { mountOplMcpAppView } from '@opl/mcp-app-shared/view';

const host = new App({ name: 'opl-apps', version: '2.0.0' }, {}, { strict: true });

// Reading the storage property itself throws in Studio's opaque sandbox.
let storage = null;
try { storage = window.sessionStorage; } catch { /* The view uses in-memory storage. */ }

try {
  await mountOplMcpAppView({
    host,
    storage,
    applyTheme: applyDocumentTheme,
    applyStyleVariables: applyHostStyleVariables,
    applyFonts: applyHostFonts,
  });
} catch (error) {
  document.getElementById('status').textContent = '连接失败';
  document.getElementById('body').textContent = error instanceof Error ? error.message : String(error);
}
