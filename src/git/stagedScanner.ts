import * as vscode from 'vscode';
import * as cp from 'node:child_process';
import * as path from 'node:path';
import { ConfigManager } from '../config/configManager.js';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { scanText } from '../detectors/scorer.js';
import { SecretFinding } from '../detectors/types.js';

export class StagedScanner {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly diagnosticsManager: DiagnosticsManager
  ) {}

  public async scanStagedChanges(): Promise<SecretFinding[]> {
    const root = this.configManager.getWorkspaceRoot();
    if (!root) {
      vscode.window.showWarningMessage('LOYAL KNIGHT: Open a workspace folder first.');
      return [];
    }

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'LOYAL KNIGHT: Scanning git staged changes...',
        cancellable: false,
      },
      async () => {
        try {
          const diffOutput = await this.runGitDiff(root);
          if (!diffOutput.trim()) {
            vscode.window.showInformationMessage('LOYAL KNIGHT: No staged changes to scan.');
            return [];
          }

          const findings = this.parseAndScanDiff(diffOutput, root);

          if (findings.length === 0) {
            vscode.window.showInformationMessage(
              'LOYAL KNIGHT: 🛡 Staged changes clean. No secrets detected!'
            );
          } else {
            vscode.window.showErrorMessage(
              `LOYAL KNIGHT: 🔴 Found ${findings.length} secret(s) in staged changes! Review before committing.`
            );
          }

          return findings;
        } catch (err) {
          vscode.window.showWarningMessage(
            `LOYAL KNIGHT: Git scan notice: ${err instanceof Error ? err.message : String(err)}`
          );
          return [];
        }
      }
    );
  }

  private runGitDiff(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec('git diff --cached -U0', { cwd }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private parseAndScanDiff(diff: string, root: string): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const lines = diff.split(/\r?\n/);
    let currentFile: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('+++ b/')) {
        currentFile = line.substring(6).trim();
        continue;
      }

      if (!currentFile || line.startsWith('+++') || line.startsWith('---')) {
        continue;
      }

      // Check if file is blacklisted
      const fullPath = path.join(root, currentFile);
      if (this.configManager.isPathIgnored(fullPath)) {
        continue;
      }

      // Added lines start with +
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedContent = line.substring(1);
        const options = this.configManager.getScanOptions(fullPath);
        const lineFindings = scanText(addedContent, options);

        if (lineFindings.length > 0) {
          findings.push(...lineFindings);
          try {
            const uri = vscode.Uri.file(fullPath);
            this.diagnosticsManager.updateFindings(uri, lineFindings);
          } catch {
            // Ignore URI resolution for deleted/untracked
          }
        }
      }
    }

    return findings;
  }
}
