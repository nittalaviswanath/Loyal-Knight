import * as vscode from 'vscode';
import * as path from 'node:path';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { ConfigManager } from '../config/configManager.js';
import { SecretFinding } from '../detectors/types.js';

export class DashboardProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private _view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly diagnosticsManager: DiagnosticsManager,
    private readonly configManager: ConfigManager,
    private readonly _extensionUri?: vscode.Uri
  ) {
    this.disposables.push(
      this.diagnosticsManager.onDidChangeFindings(() => this.refresh()),
      this.configManager.onDidChangeConfig(() => this.refresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh())
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: this._extensionUri ? [this._extensionUri] : [],
    };

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'toggleProtection':
          await vscode.commands.executeCommand('loyalKnight.toggleProtection');
          break;
        case 'openSettings':
          await vscode.commands.executeCommand('loyalKnight.openSettings');
          break;
        case 'openFile':
          if (data.uri) {
            try {
              const uri = vscode.Uri.parse(data.uri);
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc);
            } catch (err) {
              console.error('[LOYAL KNIGHT] Failed to open file:', err);
            }
          }
          break;
        case 'openFinding':
          if (data.uri) {
            try {
              const uri = vscode.Uri.parse(data.uri);
              const doc = await vscode.workspace.openTextDocument(uri);
              const editor = await vscode.window.showTextDocument(doc);
              const range = new vscode.Range(
                data.line,
                data.column,
                data.endLine,
                data.endColumn
              );
              editor.selection = new vscode.Selection(range.start, range.end);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            } catch (err) {
              console.error('[LOYAL KNIGHT] Failed to jump to finding:', err);
            }
          }
          break;
      }
    });

    this.updateWebview();
  }

  public refresh(): void {
    if (this._view) {
      this.updateWebview();
    }
  }

  private updateWebview(): void {
    if (!this._view) {
      return;
    }
    this._view.webview.html = this.renderHtml();
  }

  private renderHtml(): string {
    const config = this.configManager.getConfig();
    const isOnline = config.scanning.enabled;

    // Workspace Stats
    const allFindings: SecretFinding[] = [];
    const allFindingsMap = this.diagnosticsManager.getAllFindings();
    for (const findings of allFindingsMap.values()) {
      allFindings.push(...findings);
    }
    const counts = this.diagnosticsManager.getSeverityCounts(allFindings);
    const totalWorkspaceLeaks = allFindings.length;

    // Current File Stats
    const activeEditor = vscode.window.activeTextEditor;
    const currentFileName = activeEditor
      ? path.basename(activeEditor.document.uri.fsPath)
      : 'No Active File';
    const currentFindings = activeEditor
      ? this.diagnosticsManager.getFindingsForUri(activeEditor.document.uri)
      : [];
    const currentFileLeaksCount = currentFindings.length;

    // Findings by file list
    const fileEntries: { uri: vscode.Uri; findings: SecretFinding[] }[] = [];
    for (const [uriStr, findings] of allFindingsMap.entries()) {
      if (findings.length > 0) {
        fileEntries.push({
          uri: vscode.Uri.parse(uriStr),
          findings: [...findings].sort((a, b) => a.line - b.line || a.column - b.column),
        });
      }
    }
    fileEntries.sort((a, b) =>
      path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath))
    );

    const fileGroupsHtml =
      fileEntries.length === 0
        ? `<div class="text-muted text-sm" style="text-align: center; padding: 20px;">No leaks detected.</div>`
        : fileEntries
            .map((entry, index) => {
              const fileName = path.basename(entry.uri.fsPath);
              const relPath = vscode.workspace.asRelativePath(entry.uri);
              const dirName = path.dirname(relPath);
              const folderDisplay = dirName !== '.' ? dirName : '';
              const fileId = `file-${index}`;
              const uriStr = entry.uri.toString();

              const findingsRows = entry.findings
                .map((f) => {
                  const conf = f.confidence.toLowerCase();
                  const catUpper = f.confidence.toUpperCase();
                  const colorClass = conf === 'high' ? 'color-high' : conf === 'medium' ? 'color-mid' : 'color-low';
                  return `
                  <div class="finding-row" onclick="onFindingClick('${uriStr}', ${f.line}, ${f.column}, ${f.endLine}, ${f.endColumn})" title="Click to jump to line ${f.line + 1}">
                    <span class="finding-cat ${colorClass}">${catUpper}</span>
                    <span class="finding-match mono text-sm">${this.escapeHtml(f.match)}</span>
                    <span class="text-muted text-sm mono">:${f.line + 1}</span>
                  </div>`;
                })
                .join('');

              return `
              <div class="file-group" id="${fileId}">
                <div class="file-header" onclick="toggleGroup('${fileId}')">
                  <span id="chev-${fileId}" class="text-muted text-sm" style="width: 12px; display: inline-block;">▾</span>
                  <span class="text-bold">${this.escapeHtml(fileName)}</span>
                  ${folderDisplay ? `<span class="text-muted text-sm" style="margin-left: 4px;">${this.escapeHtml(folderDisplay)}</span>` : ''}
                  <span class="text-muted text-sm" style="margin-left: auto;">${entry.findings.length}</span>
                </div>
                <div id="body-${fileId}">
                  ${findingsRows}
                </div>
              </div>`;
            })
            .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loyal Knight Dashboard</title>
  <style>
    :root {
      --spacing-sm: 4px;
      --spacing-md: 8px;
      --spacing-lg: 16px;
      --border-color: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
      --bg-subtle: var(--vscode-editor-background, rgba(0, 0, 0, 0.1));
      --bg-hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
      --text-muted: var(--vscode-descriptionForeground, #999);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: var(--spacing-lg);
      line-height: 1.5;
      user-select: none;
    }
    
    /* Typography */
    .text-muted { color: var(--text-muted); }
    .text-sm { font-size: 0.9em; }
    .text-bold { font-weight: 600; }
    .mono { font-family: var(--vscode-editor-font-family, monospace); }
    
    /* Layout */
    .flex { display: flex; }
    .flex-col { display: flex; flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-sm { gap: var(--spacing-sm); }
    .gap-md { gap: var(--spacing-md); }
    .mb-lg { margin-bottom: var(--spacing-lg); }
    .mb-md { margin-bottom: var(--spacing-md); }
    
    /* Top Boxes */
    .top-boxes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
    }
    .action-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 10px;
      cursor: pointer;
    }
    .action-box:hover { background: var(--bg-hover); }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .online .status-dot { background-color: var(--vscode-testing-iconPassed, #73c991); box-shadow: 0 0 4px rgba(115, 201, 145, 0.5); }
    .offline .status-dot { background-color: var(--vscode-testing-iconFailed, #f14c4c); }
    
    /* Workspace Stats (Grid) */
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: var(--spacing-md);
    }
    .stat-total-wrapper {
      grid-row: span 3;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      border-right: 1px solid var(--border-color);
      padding-right: var(--spacing-md);
    }
    .stat-total-num { font-size: 2.2em; font-weight: 300; }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
    }
    .color-high { color: var(--vscode-problemsErrorIcon-foreground, #f14c4c); }
    .color-mid { color: var(--vscode-problemsWarningIcon-foreground, #cca700); }
    .color-low { color: var(--vscode-problemsInfoIcon-foreground, #3794ff); }
    
    /* Current File */
    .current-file-label {
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 8px 10px;
    }

    /* Section Headers */
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: var(--spacing-md);
      font-weight: 600;
    }

    /* Findings */
    .file-group {
      margin-bottom: var(--spacing-md);
    }
    .file-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    .file-header:hover { background: var(--bg-hover); }
    .finding-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: 4px 4px 4px 20px;
      cursor: pointer;
      border-radius: 4px;
    }
    .finding-row:hover { background: var(--bg-hover); }
    .finding-cat { font-weight: 600; font-size: 0.85em; width: 40px; flex-shrink: 0; }
    .finding-match { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
  </style>
</head>
<body>

  <!-- Top Controls -->
  <div class="top-boxes mb-lg">
    <div class="action-box flex-col items-center justify-center gap-sm ${isOnline ? 'online' : 'offline'}" style="text-align: center; padding: 14px 8px;" onclick="onToggleProtection()" title="Click to toggle Loyal Knight real-time protection">
      <div style="margin-bottom: 2px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: ${isOnline ? '#73c991' : '#f14c4c'};">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <span class="text-bold">Loyal Knight</span>
      <span class="text-sm text-muted">${isOnline ? 'Active Protection' : 'Protection Paused'}</span>
    </div>
    
    <div class="action-box flex-col items-center justify-center gap-sm" style="text-align: center; padding: 14px 8px;" onclick="onOpenSettings()" title="Click to configure Loyal Knight settings">
      <div style="margin-bottom: 2px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </div>
      <span class="text-bold">Settings</span>
      <span class="text-sm text-muted">Configuration Rules</span>
    </div>
  </div>

  <!-- Current File -->
  <div class="mb-lg">
    <div class="section-title">Current File</div>
    <div class="current-file-label flex items-center gap-md">
      <span class="mono">${this.escapeHtml(currentFileName)}</span>
      <span class="text-muted">|</span>
      <span class="${currentFileLeaksCount > 0 ? 'color-high text-bold' : 'text-muted'}">${currentFileLeaksCount} leak(s)</span>
    </div>
  </div>

  <!-- Workspace Stats -->
  <div class="mb-lg">
    <div class="section-title">Workspace Leaks</div>
    <div class="flex items-center gap-md" style="background: var(--bg-subtle); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-color);">
      <div class="flex items-center gap-sm">
        <span class="text-bold ${totalWorkspaceLeaks > 0 ? 'color-high' : 'text-muted'}" style="font-size: 1.1em;">${totalWorkspaceLeaks}</span>
        <span class="text-muted text-sm">Total</span>
      </div>
      <span class="text-muted" style="opacity: 0.3;">|</span>
      <div class="flex items-center gap-md text-sm">
        <span><span class="text-bold color-high">${counts.high}</span> <span class="text-muted">High</span></span>
        <span><span class="text-bold color-mid">${counts.medium}</span> <span class="text-muted">Mid</span></span>
        <span><span class="text-bold color-low">${counts.low}</span> <span class="text-muted">Low</span></span>
      </div>
    </div>
  </div>

  <!-- Findings -->
  <div>
    <div class="section-title flex justify-between">
      <span>Findings</span>
    </div>
    <div class="findings-list">
      ${fileGroupsHtml}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function onToggleProtection() {
      vscode.postMessage({ type: 'toggleProtection' });
    }

    function onOpenSettings() {
      vscode.postMessage({ type: 'openSettings' });
    }

    function onFindingClick(uri, line, col, endLine, endCol) {
      vscode.postMessage({
        type: 'openFinding',
        uri,
        line,
        column: col,
        endLine,
        endColumn: endCol
      });
    }

    function toggleGroup(fileId) {
      const body = document.getElementById('body-' + fileId);
      const chev = document.getElementById('chev-' + fileId);
      if (!body) return;
      if (body.style.display === 'none') {
        body.style.display = 'block';
        if (chev) chev.textContent = '▾';
      } else {
        body.style.display = 'none';
        if (chev) chev.textContent = '▸';
      }
    }
  </script>
</body>
</html>`;
  }

  private getFileIconSvg(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.json' || ext === '.jsonc') {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbcb41" stroke-width="2"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/></svg>`;
    }
    if (ext === '.ts' || ext === '.tsx') {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3178c6" stroke-width="2"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/></svg>`;
    }
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f7df1e" stroke-width="2"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/></svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
