import * as vscode from 'vscode';
import * as path from 'node:path';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';
import { ConfigManager } from '../config/configManager.js';
import { SecretFinding } from '../detectors/types.js';
import { DataFlowGraph } from '../analysis/dataFlowTypes.js';
import { FlowWebviewPanel } from '../ui/flowWebview.js';

export type DashboardItemType =
  | 'root_status'
  | 'root_current_file'
  | 'root_flows'
  | 'root_workspace'
  | 'root_actions'
  | 'root_findings'
  | 'stat_item'
  | 'action_item'
  | 'finding_item'
  | 'flow_item'
  | 'empty_item';

export class DashboardTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemType: DashboardItemType,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly finding?: SecretFinding,
    public readonly flow?: DataFlowGraph,
    public readonly fileUri?: vscode.Uri
  ) {
    super(label, collapsibleState);
  }
}

export class DashboardProvider
  implements vscode.TreeDataProvider<DashboardTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<DashboardTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly diagnosticsManager: DiagnosticsManager,
    private readonly configManager: ConfigManager,
    private readonly extensionUri?: vscode.Uri
  ) {
    this.disposables.push(
      this.diagnosticsManager.onDidChangeFindings(() => this.refresh()),
      this.configManager.onDidChangeConfig(() => this.refresh()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh())
    );
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: DashboardTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: DashboardTreeItem): Thenable<DashboardTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    switch (element.itemType) {
      case 'root_current_file':
        return Promise.resolve(this.getCurrentFileStats());
      case 'root_flows':
        return Promise.resolve(this.getFlowItems());
      case 'root_workspace':
        return Promise.resolve(this.getWorkspaceStats());
      case 'root_actions':
        return Promise.resolve(this.getActionItems());
      case 'root_findings':
        return Promise.resolve(this.getFindingItems());
      default:
        return Promise.resolve([]);
    }
  }

  private getRootItems(): DashboardTreeItem[] {
    const config = this.configManager.getConfig();
    const isActive = config.scanning.enabled;

    // 1. Status Item
    const statusItem = new DashboardTreeItem(
      `Protection: ${isActive ? 'ACTIVE' : 'PAUSED'}`,
      'root_status',
      vscode.TreeItemCollapsibleState.None
    );
    statusItem.description = 'Click to Toggle';
    statusItem.iconPath = new vscode.ThemeIcon(
      'shield',
      isActive
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('disabledForeground')
    );
    statusItem.command = {
      command: 'loyalKnight.toggleProtection',
      title: 'Toggle Protection',
    };

    // 2. Current File Root
    const activeEditor = vscode.window.activeTextEditor;
    const fileName = activeEditor
      ? path.basename(activeEditor.document.uri.fsPath)
      : 'No Active File';

    const currentFileItem = new DashboardTreeItem(
      `Current File: ${fileName}`,
      'root_current_file',
      vscode.TreeItemCollapsibleState.Expanded
    );
    currentFileItem.iconPath = new vscode.ThemeIcon('file');

    // 3. Secret Flows Root
    const flows = this.getActiveDocumentFlows();
    const flowsItem = new DashboardTreeItem(
      `Secret Flows (${flows.length})`,
      'root_flows',
      vscode.TreeItemCollapsibleState.Expanded
    );
    flowsItem.iconPath = new vscode.ThemeIcon('type-hierarchy');

    // 4. Workspace Root
    const workspaceItem = new DashboardTreeItem(
      'Workspace',
      'root_workspace',
      vscode.TreeItemCollapsibleState.Expanded
    );
    workspaceItem.iconPath = new vscode.ThemeIcon('root-folder');

    // 5. Actions Root
    const actionsItem = new DashboardTreeItem(
      'Actions',
      'root_actions',
      vscode.TreeItemCollapsibleState.Expanded
    );
    actionsItem.iconPath = new vscode.ThemeIcon('tools');

    // 6. Findings Root
    const currentFindings = this.getActiveDocumentFindings();
    const findingsItem = new DashboardTreeItem(
      `Findings (${currentFindings.length})`,
      'root_findings',
      vscode.TreeItemCollapsibleState.Expanded
    );
    findingsItem.iconPath = new vscode.ThemeIcon('list-unordered');

    return [statusItem, currentFileItem, flowsItem, workspaceItem, actionsItem, findingsItem];
  }

  private getActiveDocumentFindings(): SecretFinding[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }
    return this.diagnosticsManager.getFindingsForUri(editor.document.uri);
  }

  private getActiveDocumentFlows(): DataFlowGraph[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }
    return this.diagnosticsManager.getFlowsForUri(editor.document.uri);
  }

  private getCurrentFileStats(): DashboardTreeItem[] {
    const findings = this.getActiveDocumentFindings();
    const counts = this.diagnosticsManager.getSeverityCounts(findings);

    const totalItem = new DashboardTreeItem(
      `Findings: ${findings.length}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    totalItem.iconPath = new vscode.ThemeIcon('search');

    const highItem = new DashboardTreeItem(
      `High: ${counts.high}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    highItem.iconPath = new vscode.ThemeIcon(
      'error',
      new vscode.ThemeColor('problemsErrorIcon.foreground')
    );

    const mediumItem = new DashboardTreeItem(
      `Medium: ${counts.medium}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    mediumItem.iconPath = new vscode.ThemeIcon(
      'warning',
      new vscode.ThemeColor('problemsWarningIcon.foreground')
    );

    const lowItem = new DashboardTreeItem(
      `Low: ${counts.low}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    lowItem.iconPath = new vscode.ThemeIcon(
      'info',
      new vscode.ThemeColor('problemsInfoIcon.foreground')
    );

    return [totalItem, highItem, mediumItem, lowItem];
  }

  private getFlowItems(): DashboardTreeItem[] {
    const flows = this.getActiveDocumentFlows();
    if (flows.length === 0) {
      const cleanItem = new DashboardTreeItem(
        'No secret flows detected',
        'empty_item',
        vscode.TreeItemCollapsibleState.None
      );
      cleanItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      return [cleanItem];
    }

    return flows.map((flow) => {
      const item = new DashboardTreeItem(
        flow.summary,
        'flow_item',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        flow
      );

      item.description = `[${flow.highestRisk}]`;
      item.tooltip = `Secret Flow: ${flow.summary}\nRisk: ${flow.highestRisk}\nAdvice: ${flow.remediationAdvice}\nClick to view interactive flow graph.`;

      if (flow.highestRisk === 'CRITICAL') {
        item.iconPath = new vscode.ThemeIcon('flame', new vscode.ThemeColor('errorForeground'));
      } else if (flow.highestRisk === 'HIGH') {
        item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground'));
      } else {
        item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
      }

      item.command = {
        command: 'loyalKnight.showSecretFlow',
        title: 'Open Secret Flow Graph',
        arguments: [flow],
      };

      return item;
    });
  }

  private getWorkspaceStats(): DashboardTreeItem[] {
    const totalFindings = this.diagnosticsManager.getTotalFindingsCount();
    const totalFlows = this.diagnosticsManager.getTotalFlowsCount();

    const findingsItem = new DashboardTreeItem(
      `Total Findings: ${totalFindings}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    findingsItem.iconPath = new vscode.ThemeIcon(
      totalFindings > 0 ? 'shield' : 'check',
      totalFindings > 0
        ? new vscode.ThemeColor('problemsWarningIcon.foreground')
        : new vscode.ThemeColor('testing.iconPassed')
    );

    const flowsItem = new DashboardTreeItem(
      `Total Flows: ${totalFlows}`,
      'stat_item',
      vscode.TreeItemCollapsibleState.None
    );
    flowsItem.iconPath = new vscode.ThemeIcon('type-hierarchy');

    return [findingsItem, flowsItem];
  }

  private getActionItems(): DashboardTreeItem[] {
    const toggle = new DashboardTreeItem(
      'Toggle Protection (ON/OFF)',
      'action_item',
      vscode.TreeItemCollapsibleState.None
    );
    toggle.iconPath = new vscode.ThemeIcon('shield');
    toggle.command = {
      command: 'loyalKnight.toggleProtection',
      title: 'Toggle Protection',
    };

    const scanStaged = new DashboardTreeItem(
      'Scan Staged Changes (Git)',
      'action_item',
      vscode.TreeItemCollapsibleState.None
    );
    scanStaged.iconPath = new vscode.ThemeIcon('git-commit');
    scanStaged.command = {
      command: 'loyalKnight.scanStagedChanges',
      title: 'Scan Staged Changes',
    };

    const showFlow = new DashboardTreeItem(
      'Show Secret Flow Graph',
      'action_item',
      vscode.TreeItemCollapsibleState.None
    );
    showFlow.iconPath = new vscode.ThemeIcon('type-hierarchy');
    showFlow.command = {
      command: 'loyalKnight.showSecretFlow',
      title: 'Show Secret Flow',
    };

    const settings = new DashboardTreeItem(
      'Open Settings',
      'action_item',
      vscode.TreeItemCollapsibleState.None
    );
    settings.iconPath = new vscode.ThemeIcon('gear');
    settings.command = {
      command: 'loyalKnight.openSettings',
      title: 'Open Settings',
    };

    return [toggle, scanStaged, showFlow, settings];
  }

  private getFindingItems(): DashboardTreeItem[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      const emptyItem = new DashboardTreeItem(
        'Open a file to view findings',
        'empty_item',
        vscode.TreeItemCollapsibleState.None
      );
      emptyItem.iconPath = new vscode.ThemeIcon('info');
      return [emptyItem];
    }

    const findings = this.diagnosticsManager.getFindingsForUri(editor.document.uri);
    if (findings.length === 0) {
      const cleanItem = new DashboardTreeItem(
        'No secrets detected in current file',
        'empty_item',
        vscode.TreeItemCollapsibleState.None
      );
      cleanItem.iconPath = new vscode.ThemeIcon(
        'check',
        new vscode.ThemeColor('testing.iconPassed')
      );
      return [cleanItem];
    }

    const fileName = path.basename(editor.document.uri.fsPath);

    return findings.map((finding) => {
      const label = `${finding.type}: ${finding.match}`;
      const item = new DashboardTreeItem(
        label,
        'finding_item',
        vscode.TreeItemCollapsibleState.None,
        finding,
        undefined,
        editor.document.uri
      );

      item.description = `${fileName}:${finding.line + 1}`;
      item.tooltip = `${finding.type} (${finding.provider.toUpperCase()})\nConfidence: ${finding.confidence.toUpperCase()}\nLocation: Line ${finding.line + 1}, Col ${finding.column + 1}\nMasked Secret: ${finding.match}`;

      if (finding.confidence === 'high') {
        item.iconPath = new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('problemsErrorIcon.foreground')
        );
      } else if (finding.confidence === 'medium') {
        item.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('problemsWarningIcon.foreground')
        );
      } else {
        item.iconPath = new vscode.ThemeIcon(
          'info',
          new vscode.ThemeColor('problemsInfoIcon.foreground')
        );
      }

      item.command = {
        command: 'vscode.open',
        title: 'Go to Finding',
        arguments: [
          editor.document.uri,
          {
            selection: new vscode.Range(
              finding.line,
              finding.column,
              finding.endLine,
              finding.endColumn
            ),
          },
        ],
      };

      return item;
    });
  }

  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
