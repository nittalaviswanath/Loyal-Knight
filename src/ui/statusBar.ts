import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private revertTimeout?: NodeJS.Timeout;
  private isEnabled = true;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'loyalKnight.toggleProtection';
    this.update(true);
    this.item.show();
  }

  public update(enabled: boolean): void {
    this.isEnabled = enabled;
    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
      this.revertTimeout = undefined;
    }

    if (enabled) {
      this.item.text = '$(shield) Loyal Knight: ON';
      this.item.tooltip = 'Loyal Knight: Real-time secret protection is ACTIVE. Click to toggle OFF.';
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(circle-slash) Loyal Knight: OFF';
      this.item.tooltip = 'Loyal Knight: Protection is PAUSED. Click to toggle ON.';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  /**
   * Displays brief status update when a file save scan completes.
   */
  public showSaveScanResult(
    durationMs: number,
    findingsCount: number,
    flowsCount: number
  ): void {
    if (!this.isEnabled) {
      return;
    }

    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
    }

    const issuesText = findingsCount > 0 ? `$(error) ${findingsCount} findings` : 'Clean';
    const flowsText = flowsCount > 0 ? ` | $(type-hierarchy) ${flowsCount} flows` : '';
    this.item.text = `$(shield) Loyal Knight: Saved (${durationMs}ms) - ${issuesText}${flowsText}`;

    this.revertTimeout = setTimeout(() => {
      this.update(this.isEnabled);
    }, 3500);
  }

  public dispose(): void {
    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
    }
    this.item.dispose();
  }
}
