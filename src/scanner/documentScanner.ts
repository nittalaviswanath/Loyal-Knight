import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager.js';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { StatusBarManager } from '../ui/statusBar.js';
import { AstAnalyzer } from '../analysis/astAnalyzer.js';
import { scanText } from '../detectors/scorer.js';

export class DocumentScanner implements vscode.Disposable {
  private readonly configManager: ConfigManager;
  private readonly diagnosticsManager: DiagnosticsManager;
  private readonly statusBarManager?: StatusBarManager;
  private readonly astAnalyzer = new AstAnalyzer();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    configManager: ConfigManager,
    diagnosticsManager: DiagnosticsManager,
    statusBarManager?: StatusBarManager
  ) {
    this.configManager = configManager;
    this.diagnosticsManager = diagnosticsManager;
    this.statusBarManager = statusBarManager;

    this.registerEventListeners();
    this.scanOpenDocuments();
  }

  private registerEventListeners(): void {
    // 1. Live buffer changes (~250ms debounced)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.handleDocumentChange(event.document);
      })
    );

    // 2. Full-file scan on open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.scanDocument(document, 'MANUAL');
      })
    );

    // 3. Dedicated Save Scan on save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.scanDocument(document, 'SAVE');
      })
    );

    // 4. Cleanup on close if untitled or deleted
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.clearDebounce(document.uri);
        if (document.isClosed && document.isUntitled) {
          this.diagnosticsManager.clearForUri(document.uri);
        }
      })
    );

    // 5. Re-scan on config change
    this.disposables.push(
      this.configManager.onDidChangeConfig((config) => {
        this.statusBarManager?.update(config.scanning.enabled);
        if (config.scanning.enabled) {
          this.scanOpenDocuments();
        } else {
          this.diagnosticsManager.clearAll();
        }
      })
    );
  }

  private clearDebounce(uri: vscode.Uri): void {
    const key = uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(key);
    }
  }

  private handleDocumentChange(document: vscode.TextDocument): void {
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return;
    }

    const config = this.configManager.getConfig();
    if (!config.scanning.enabled) {
      return;
    }

    if (this.configManager.isPathIgnored(document.uri.fsPath)) {
      return;
    }

    this.clearDebounce(document.uri);

    const debounceMs = config.scanning.debounceMs || 250;
    const timer = setTimeout(() => {
      this.debounceTimers.delete(document.uri.toString());
      this.scanDocument(document, 'LIVE');
    }, debounceMs);

    this.debounceTimers.set(document.uri.toString(), timer);
  }

  /**
   * Performs detection and AST data-flow scan on a text document.
   */
  public scanDocument(
    document: vscode.TextDocument,
    scanType: 'LIVE' | 'SAVE' | 'MANUAL' = 'LIVE'
  ): void {
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return;
    }

    const config = this.configManager.getConfig();
    if (!config.scanning.enabled) {
      this.diagnosticsManager.clearForUri(document.uri);
      return;
    }

    if (this.configManager.isPathIgnored(document.uri.fsPath)) {
      this.diagnosticsManager.clearForUri(document.uri);
      return;
    }

    const startTime = Date.now();
    const text = document.getText();
    const options = this.configManager.getScanOptions(document.uri.fsPath);

    // 1. Secret pattern and entropy detection
    const findings = scanText(text, options);

    // 2. AST Data-flow and dangerous sink analysis
    const flows = this.astAnalyzer.analyzeDocument(text, document.uri.fsPath, findings);

    // 3. Update diagnostics and in-memory caches
    this.diagnosticsManager.updateFindingsAndFlows(document.uri, findings, flows);

    const durationMs = Date.now() - startTime;

    // 4. If save scan, provide brief status telemetry
    if (scanType === 'SAVE' && this.statusBarManager) {
      this.statusBarManager.showSaveScanResult(durationMs, findings.length, flows.length);
    }
  }

  /**
   * Scans all currently open documents in the workspace.
   */
  public scanOpenDocuments(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.scanDocument(doc, 'MANUAL');
    }
  }

  /**
   * Scans eligible files across the entire workspace.
   */
  public async scanWorkspace(): Promise<number> {
    const config = this.configManager.getConfig();
    if (!config.scanning.enabled) {
      vscode.window.showWarningMessage('LOYAL KNIGHT: Scanning is disabled in configuration.');
      return 0;
    }

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'LOYAL KNIGHT: Scanning workspace for secrets...',
        cancellable: true,
      },
      async (progress, token) => {
        const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
        const eligibleFiles = files.filter((uri) => !this.configManager.isPathIgnored(uri.fsPath));
        let totalFindings = 0;
        let processed = 0;

        for (const uri of eligibleFiles) {
          if (token.isCancellationRequested) {
            break;
          }

          try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const options = this.configManager.getScanOptions(uri.fsPath);
            const findings = scanText(text, options);
            const flows = this.astAnalyzer.analyzeDocument(text, uri.fsPath, findings);

            this.diagnosticsManager.updateFindingsAndFlows(uri, findings, flows);
            totalFindings += findings.length;
          } catch (err) {
            console.error(`[LOYAL KNIGHT] Error scanning file ${uri.fsPath}:`, err);
          }

          processed++;
          progress.report({
            message: `${processed}/${eligibleFiles.length} files scanned`,
            increment: (1 / eligibleFiles.length) * 100,
          });
        }

        vscode.window.showInformationMessage(
          `LOYAL KNIGHT: Workspace scan complete. Found ${totalFindings} secret${
            totalFindings === 1 ? '' : 's'
          } across ${processed} files.`
        );

        return totalFindings;
      }
    );
  }

  public dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
