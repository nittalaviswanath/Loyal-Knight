import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { ConfigManager } from '../config/configManager.js';
import { SecretFinding } from '../detectors/types.js';

export class LoyalKnightCodeActionProvider implements vscode.CodeActionProvider {
  constructor(
    private readonly diagnosticsManager: DiagnosticsManager,
    private readonly configManager: ConfigManager
  ) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] {
    const findings = this.diagnosticsManager.getFindingsForUri(document.uri);
    const intersectingFindings = findings.filter((f) => {
      const fRange = new vscode.Range(f.line, f.column, f.endLine, f.endColumn);
      return fRange.intersection(range) !== undefined;
    });

    if (intersectingFindings.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const finding of intersectingFindings) {
      const lineText = document.lineAt(finding.line).text;
      const varMatch = lineText.match(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/);
      const varName = varMatch ? varMatch[1].toUpperCase() : 'APP_SECRET';

      // 1. Move to .env (QuickFix)
      const envFix = new vscode.CodeAction(
        `🛡 Loyal Knight: Move secret to .env (process.env.${varName})`,
        vscode.CodeActionKind.QuickFix
      );
      envFix.isPreferred = true;

      // Check if quotes wrap the rawMatch
      let replaceRange = new vscode.Range(
        finding.line,
        finding.column,
        finding.endLine,
        finding.endColumn
      );

      // If wrapped in quotes, replace quotes as well
      const charBefore = lineText[finding.column - 1];
      const charAfter = lineText[finding.endColumn];
      if ((charBefore === '"' && charAfter === '"') || (charBefore === "'" && charAfter === "'")) {
        replaceRange = new vscode.Range(
          finding.line,
          finding.column - 1,
          finding.endLine,
          finding.endColumn + 1
        );
      }

      envFix.edit = new vscode.WorkspaceEdit();
      envFix.edit.replace(document.uri, replaceRange, `process.env.${varName}`);

      envFix.command = {
        command: 'loyalKnight.autoRemediate',
        title: 'Apply .env & .gitignore update',
        arguments: [varName, finding.rawMatch],
      };

      actions.push(envFix);

      // 2. View Secret Flow Action
      const flowAction = new vscode.CodeAction(
        '🛡 Loyal Knight: View Secret Lifecycle Flow',
        vscode.CodeActionKind.Empty
      );
      flowAction.command = {
        command: 'loyalKnight.showSecretFlow',
        title: 'Show Secret Flow',
      };
      actions.push(flowAction);

      // 3. Ignore Secret Action
      const ignoreAction = new vscode.CodeAction(
        `🛡 Loyal Knight: Ignore secret (${finding.type})`,
        vscode.CodeActionKind.QuickFix
      );
      ignoreAction.command = {
        command: 'loyalKnight.openSettings',
        title: 'Open Settings to Ignore',
      };
      actions.push(ignoreAction);
    }

    return actions;
  }
}

/**
 * Handles appending secret to .env and securing in .gitignore.
 */
export async function handleAutoRemediation(
  varName: string,
  rawSecret: string,
  configManager: ConfigManager
): Promise<void> {
  const root = configManager.getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('LOYAL KNIGHT: Open a workspace folder to auto-remediate.');
    return;
  }

  try {
    // 1. Update .env
    const envPath = path.join(root, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    if (!envContent.includes(`${varName}=`)) {
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `${varName}=${rawSecret}\n`;
      fs.writeFileSync(envPath, envContent, 'utf-8');
    }

    // 2. Ensure .env in .gitignore
    const gitignorePath = path.join(root, '.gitignore');
    let gitignoreContent = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';

    if (!/\b\.env\b/.test(gitignoreContent)) {
      if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
        gitignoreContent += '\n';
      }
      gitignoreContent += '.env\n';
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    }

    vscode.window.showInformationMessage(
      `LOYAL KNIGHT: Extracted to .env as ${varName}. Verified .gitignore.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `LOYAL KNIGHT: Failed to update .env or .gitignore: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
