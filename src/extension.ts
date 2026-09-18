import * as vscode from 'vscode';
import { ConfigManager } from './config/configManager.js';
import { DiagnosticsManager } from './diagnostics/diagnosticsManager.js';
import { DocumentScanner } from './scanner/documentScanner.js';
import { DashboardProvider } from './views/dashboardProvider.js';
import { StatusBarManager } from './ui/statusBar.js';
import { LoyalKnightHoverProvider } from './ui/hoverProvider.js';
import { LoyalKnightCodeActionProvider } from './remediation/codeActionProvider.js';
import { registerCommands } from './commands/index.js';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[LOYAL KNIGHT] Activating extension...');

  // 1. Initialize Configuration Manager (.secretsentry/config.json)
  const configManager = new ConfigManager();
  context.subscriptions.push(configManager);

  // 2. Initialize Status Bar Item (ON/OFF toggle & scan feedback)
  const statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // 3. Initialize Diagnostics Manager (vscode.languages.createDiagnosticCollection)
  const diagnosticsManager = new DiagnosticsManager();
  context.subscriptions.push(diagnosticsManager);

  // 4. Initialize Document Scanner (debounced buffer edits, open, save, workspace)
  const scanner = new DocumentScanner(configManager, diagnosticsManager, statusBarManager);
  context.subscriptions.push(scanner);

  // 5. Initialize Activity Bar Security Dashboard WebviewView
  const dashboardProvider = new DashboardProvider(
    diagnosticsManager,
    configManager,
    context.extensionUri
  );
  context.subscriptions.push(dashboardProvider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('loyalKnight.dashboard', dashboardProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    })
  );

  // 6. Register Hover Provider
  const supportedLanguages = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'json',
    'dotenv',
  ];
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      supportedLanguages,
      new LoyalKnightHoverProvider(diagnosticsManager)
    )
  );

  // 7. Register Code Actions Provider (Auto-remediation QuickFix)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      supportedLanguages,
      new LoyalKnightCodeActionProvider(diagnosticsManager, configManager),
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.Empty,
        ],
      }
    )
  );

  // 8. Register Commands
  registerCommands(
    context,
    configManager,
    scanner,
    dashboardProvider,
    diagnosticsManager,
    statusBarManager
  );

  console.log('[LOYAL KNIGHT] Extension activated successfully.');
}

export function deactivate(): void {
  console.log('[LOYAL KNIGHT] Extension deactivated.');
}
