// The preview page: the real media files, the VS Code theme variables of Dark Modern or Light
// Modern, a stubbed acquireVsCodeApi that answers `ready` with the given message, and a pinned
// clock. Shared by preview.mjs and by anything that renders a board the same way.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NOW = Date.parse(process.env.PREVIEW_NOW ?? '2026-10-15T09:40:00Z');

// ---- theme variables -------------------------------------------------------------------------
const THEMES = {
  dark: {
    cls: 'vscode-dark',
    vars: {
      foreground: '#cccccc', descriptionForeground: '#9d9d9d', 'editor-background': '#1f1f1f', 'sideBar-background': '#181818',
      'widget-border': '#313131', 'panel-border': '#2b2b2b', 'textLink-foreground': '#4daafc', errorForeground: '#f85149',
      'editorWarning-foreground': '#cca700', 'testing-iconPassed': '#73c991', 'charts-blue': '#3794ff', focusBorder: '#0078d4',
      'input-background': '#313131', 'input-foreground': '#cccccc', 'input-border': '#3c3c3c', 'textCodeBlock-background': '#2b2b2b',
      'button-background': '#0078d4', 'button-foreground': '#ffffff',
    },
  },
  light: {
    cls: 'vscode-light',
    vars: {
      foreground: '#3b3b3b', descriptionForeground: '#616161', 'editor-background': '#ffffff', 'sideBar-background': '#f8f8f8',
      'widget-border': '#e5e5e5', 'panel-border': '#e5e5e5', 'textLink-foreground': '#005fb8', errorForeground: '#cf222e',
      'editorWarning-foreground': '#9a6700', 'testing-iconPassed': '#1a7f37', 'charts-blue': '#1a85ff', focusBorder: '#005fb8',
      'input-background': '#ffffff', 'input-foreground': '#3b3b3b', 'input-border': '#cecece', 'textCodeBlock-background': '#f2f2f2',
      'button-background': '#005fb8', 'button-foreground': '#ffffff',
    },
  },
};
const FONT = "'Segoe UI', system-ui, sans-serif";
const MONO = "Consolas, 'Cascadia Code', monospace";

/**
 * One page. `media` is the folder with board.css / reltime.js / board.js; the message is what the
 * host posts. Used for this board and, with `--sdlc`, for the SDLC board beside it.
 */
export function page({ media, message, theme, layout, accent, title, tab = null }) {
  const t = THEMES[theme];
  const vars = Object.entries(t.vars).map(([k, v]) => `--vscode-${k}: ${v};`).join(' ');
  const css = readFileSync(join(media, 'board.css'), 'utf8');
  const js = (n) => readFileSync(join(media, n), 'utf8').replace(/<\/script/gi, '<\\/script');
  const msg = JSON.stringify({ command: 'state', accent, ...message }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>:root { ${vars} --vscode-font-family: ${FONT}; --vscode-editor-font-family: ${MONO}; } html { background: ${layout === 'sidebar' ? t.vars['sideBar-background'] : t.vars['editor-background']}; }</style>
<style>${css}</style></head>
<body class="${t.cls}" data-layout="${layout}" data-accent="${accent}">
<div id="app" class="empty">Loading…</div>
<script>
  window.__NOW__ = ${NOW};
  Date.now = () => window.__NOW__;
  window.acquireVsCodeApi = () => ({ postMessage(m) { if (m.command === 'ready') setTimeout(() => window.postMessage(${msg}, '*'), 0); }, getState() { return ${JSON.stringify(tab ? { tab } : null)}; }, setState() {} });
</script>
<script>${js('reltime.js')}</script>
<script>${js('board.js')}</script>
</body></html>`;
}

