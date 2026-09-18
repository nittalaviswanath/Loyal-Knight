import * as vscode from 'vscode';
import { ConfigManager } from '../config/configManager.js';
import { DocumentScanner } from '../scanner/documentScanner.js';
import { DashboardProvider } from '../views/dashboardProvider.js';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { StatusBarManager } from '../ui/statusBar.js';
import { FlowWebviewPanel } from '../ui/flowWebview.js';
import { StagedScanner } from '../git/stagedScanner.js';
import { handleAutoRemediation } from '../remediation/codeActionProvider.js';
import { DataFlowGraph } from '../analysis/dataFlowTypes.js';

export function registerCommands(
  context: vscode.ExtensionContext,
  configManager: ConfigManager,
  scanner: DocumentScanner,
  dashboardProvider: DashboardProvider,
  diagnosticsManager: DiagnosticsManager,
  statusBarManager: StatusBarManager
): void {
  const stagedScanner = new StagedScanner(configManager, diagnosticsManager);

  // 1. Toggle Protection (ON / OFF)
  context.subscriptions.push(
    vscode.commands.registerCommand('loyalKnight.toggleProtection', () => {
      const newState = configManager.toggleEnabled();
      statusBarManager.update(newState);
      dashboardProvider.refresh();

      if (newState) {
        scanner.scanOpenDocuments();
        vscode.window.showInformationMessage('🛡 LOYAL KNIGHT: Protection is now ONLINE.');
      } else {
        diagnosticsManager.clearAll();
        vscode.window.showWarningMessage('⚪ LOYAL KNIGHT: Protection is now OFFLINE.');
      }
    })
  );



  // 4. Scan Staged Changes (Git)
  context.subscriptions.push(
    vscode.commands.registerCommand('loyalKnight.scanStagedChanges', async () => {
      await stagedScanner.scanStagedChanges();
      dashboardProvider.refresh();
    })
  );

  // 5. Show Security Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('loyalKnight.showSecurityDashboard', async () => {
      await vscode.commands.executeCommand('loyalKnight.dashboard.focus');
    })
  );

  // 6. Show Secret Flow Graph
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'loyalKnight.showSecretFlow',
      async (targetFlow?: DataFlowGraph) => {
        if (targetFlow) {
          FlowWebviewPanel.show(context.extensionUri, targetFlow);
          return;
        }

        const editor = vscode.window.activeTextEditor;
        let flows: DataFlowGraph[] = [];

        if (editor) {
          flows = diagnosticsManager.getFlowsForUri(editor.document.uri);
        }

        if (flows.length === 0) {
          // Gather from all open flows
          const allFlows = diagnosticsManager.getAllFlows();
          for (const list of allFlows.values()) {
            flows.push(...list);
          }
        }

        if (flows.length === 0) {
          vscode.window.showInformationMessage(
            'LOYAL KNIGHT: No active secret flows detected in current document.'
          );
          return;
        }

        if (flows.length === 1) {
          FlowWebviewPanel.show(context.extensionUri, flows[0]);
          return;
        }

        const pickItems = flows.map((f) => ({
          label: `${f.highestRisk === 'CRITICAL' ? '🔴' : '🟠'} ${f.secretLabel}`,
          description: f.summary,
          detail: f.remediationAdvice,
          flow: f,
        }));

        const selected = await vscode.window.showQuickPick(pickItems, {
          placeHolder: 'Select a secret flow to view interactive graph',
        });

        if (selected) {
          FlowWebviewPanel.show(context.extensionUri, selected.flow);
        }
      }
    )
  );

  // 7. Auto Remediate Secret
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'loyalKnight.autoRemediate',
      async (varName?: string, rawSecret?: string) => {
        if (varName && rawSecret) {
          await handleAutoRemediation(varName, rawSecret, configManager);
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const findings = diagnosticsManager.getFindingsForUri(editor.document.uri);
        if (findings.length === 0) {
          vscode.window.showInformationMessage('LOYAL KNIGHT: No detected secrets to remediate in active file.');
          return;
        }

        const finding = findings[0];
        const lineText = editor.document.lineAt(finding.line).text;
        const varMatch = lineText.match(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/);
        const resolvedVarName = varMatch ? varMatch[1].toUpperCase() : 'SECRET_API_KEY';

        await handleAutoRemediation(resolvedVarName, finding.rawMatch, configManager);
      }
    )
  );

  // 8. Open Settings (.secretsentry/config.json)
  context.subscriptions.push(
    vscode.commands.registerCommand('loyalKnight.openSettings', async () => {
      configManager.init();
      const configPath = configManager.getConfigPath();
      if (!configPath) {
        vscode.window.showErrorMessage(
          'LOYAL KNIGHT: Open a workspace folder first to configure settings.'
        );
        return;
      }

      try {
        const uri = vscode.Uri.file(configPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        vscode.window.showErrorMessage(
          `LOYAL KNIGHT: Could not open settings file: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // 9. Refresh Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('loyalKnight.refresh', () => {
      scanner.scanOpenDocuments();
      dashboardProvider.refresh();
      vscode.window.showInformationMessage('LOYAL KNIGHT: Security dashboard refreshed.');
    })
  );
}
