import * as vscode from 'vscode';
import * as path from 'node:path';
import { DataFlowGraph } from '../analysis/dataFlowTypes.js';

export class FlowWebviewPanel {
  public static currentPanel: FlowWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, flow: DataFlowGraph) {
    this.panel = panel;
    this.update(flow);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'jumpTo') {
          const uri = vscode.Uri.file(message.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc);
          const range = new vscode.Range(
            message.line,
            message.column,
            message.endLine,
            message.endColumn
          );
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
      },
      null,
      this.disposables
    );
  }

  public static show(extensionUri: vscode.Uri, flow: DataFlowGraph): void {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (FlowWebviewPanel.currentPanel) {
      FlowWebviewPanel.currentPanel.panel.reveal(column);
      FlowWebviewPanel.currentPanel.update(flow);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'loyalKnightFlow',
      `Secret Flow: ${flow.secretLabel}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    FlowWebviewPanel.currentPanel = new FlowWebviewPanel(panel, flow);
  }

  public update(flow: DataFlowGraph): void {
    this.panel.title = `Flow: ${flow.secretLabel}`;
    this.panel.webview.html = this.getHtmlForWebview(flow);
  }

  private getHtmlForWebview(flow: DataFlowGraph): string {
    const fileName = path.basename(flow.sourceFile);

    const riskColor =
      flow.highestRisk === 'CRITICAL'
        ? '#f85149'
        : flow.highestRisk === 'HIGH'
        ? '#f0883e'
        : flow.highestRisk === 'MEDIUM'
        ? '#d29922'
        : '#58a6ff';

    const nodesHtml = flow.nodes
      .map((node, index) => {
        const isLast = index === flow.nodes.length - 1;
        const kindBadge =
          node.kind === 'source'
            ? 'SOURCE'
            : node.kind === 'sink'
            ? 'DANGEROUS SINK'
            : node.kind === 'transformation'
            ? 'TRANSFORM'
            : 'VARIABLE';

        const kindColor =
          node.kind === 'source'
            ? '#a371f7'
            : node.kind === 'sink'
            ? '#f85149'
            : node.kind === 'transformation'
            ? '#e3b341'
            : '#58a6ff';

        return `
          <div class="flow-step">
            <div class="node-card ${node.kind}">
              <div class="node-header">
                <span class="kind-tag" style="background: ${kindColor}22; color: ${kindColor}; border: 1px solid ${kindColor}55;">
                  ${kindBadge}
                </span>
                <span class="location-tag">Line ${node.line + 1}:${node.column + 1}</span>
              </div>
              <div class="node-title">${this.escapeHtml(node.label)}</div>
              ${
                node.details
                  ? `<div class="node-details">${this.escapeHtml(node.details)}</div>`
                  : ''
              }
              ${
                node.codeSnippet
                  ? `<pre class="code-snippet"><code>${this.escapeHtml(node.codeSnippet)}</code></pre>`
                  : ''
              }
              <button class="jump-btn" onclick="jumpTo(${node.line}, ${node.column}, ${node.endLine}, ${node.endColumn})">
                Jump to Code
              </button>
            </div>
            ${
              !isLast
                ? `<div class="flow-arrow">
                    <div class="arrow-line"></div>
                    <div class="arrow-point">▼</div>
                   </div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    const reasonsHtml = flow.reasons
      .map((r) => `<li>${this.escapeHtml(r)}</li>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Loyal Knight - Secret Flow</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --border: var(--vscode-widget-border, #333333);
      --font: var(--vscode-font-family, system-ui, sans-serif);
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      padding: 24px;
      margin: 0;
      line-height: 1.5;
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 12px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 20px;
      margin: 12px 0 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .file-ref {
      color: #8b949e;
      font-size: 13px;
    }
    .flow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 600px;
      margin: 20px auto;
    }
    .flow-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }
    .node-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 18px;
      width: 100%;
      box-sizing: border-box;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .node-card.sink {
      border-color: #f8514988;
      background: #f8514911;
    }
    .node-card.source {
      border-color: #a371f788;
    }
    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .kind-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .location-tag {
      font-size: 12px;
      color: #8b949e;
      font-family: monospace;
    }
    .node-title {
      font-size: 15px;
      font-weight: 600;
      font-family: monospace;
    }
    .node-details {
      font-size: 13px;
      color: #8b949e;
      margin-top: 4px;
    }
    .code-snippet {
      background: rgba(0,0,0,0.3);
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .jump-btn {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 6px;
    }
    .jump-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    .flow-arrow {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 8px 0;
    }
    .arrow-line {
      width: 2px;
      height: 20px;
      background: var(--border);
    }
    .arrow-point {
      color: #8b949e;
      font-size: 10px;
      line-height: 1;
    }
    .info-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      max-width: 600px;
      margin: 20px auto;
    }
    .info-card h3 {
      margin-top: 0;
      font-size: 14px;
    }
    ul {
      margin: 8px 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge" style="background: ${riskColor}22; color: ${riskColor}; border: 1px solid ${riskColor}55;">
      ${flow.highestRisk} RISK EXPOSURE
    </span>
    <h1>🛡 Loyal Knight — Secret Lifecycle Trace</h1>
    <div class="file-ref">File: ${this.escapeHtml(fileName)} | Trace: ${this.escapeHtml(flow.summary)}</div>
  </div>

  <div class="flow-container">
    ${nodesHtml}
  </div>

  <div class="info-card">
    <h3>🔍 Exposure Analysis & Evidence</h3>
    <ul>${reasonsHtml}</ul>
  </div>

  <div class="info-card" style="border-left: 3px solid #2ea043;">
    <h3 style="color: #2ea043;">💡 Recommended Remediation</h3>
    <p>${this.escapeHtml(flow.remediationAdvice ?? 'Move secret to environment configuration.')}</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function jumpTo(line, column, endLine, endColumn) {
      vscode.postMessage({
        command: 'jumpTo',
        filePath: ${JSON.stringify(flow.sourceFile)},
        line,
        column,
        endLine,
        endColumn
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose(): void {
    FlowWebviewPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
