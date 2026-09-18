import * as vscode from 'vscode';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager.js';

export class LoyalKnightHoverProvider implements vscode.HoverProvider {
  constructor(private readonly diagnosticsManager: DiagnosticsManager) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const findings = this.diagnosticsManager.getFindingsForUri(document.uri);
    const flows = this.diagnosticsManager.getFlowsForUri(document.uri);

    // 1. Check if hovering over a detected secret finding
    for (const finding of findings) {
      const range = new vscode.Range(
        finding.line,
        finding.column,
        finding.endLine,
        finding.endColumn
      );

      if (range.contains(position)) {
        const relatedFlow = flows.find(
          (fl) =>
            fl.nodes.some((n) => n.line === finding.line) ||
            fl.secretLabel.includes(finding.match)
        );

        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        md.appendMarkdown(`### 🛡 Loyal Knight\n\n`);
        md.appendMarkdown(`**Potential Credential Detected**: \`${finding.type}\`\n\n`);
        md.appendMarkdown(`- **Masked Value**: \`${finding.match}\`\n`);
        md.appendMarkdown(`- **Confidence**: \`${finding.confidence.toUpperCase()}\`\n`);
        md.appendMarkdown(`- **Provider**: \`${finding.provider.toUpperCase()}\`\n`);
        md.appendMarkdown(`- **Entropy**: \`${finding.entropy.toFixed(2)} bits/char\`\n\n`);

        if (relatedFlow) {
          const riskBadge =
            relatedFlow.highestRisk === 'CRITICAL'
              ? '🔴 CRITICAL'
              : relatedFlow.highestRisk === 'HIGH'
              ? '🟠 HIGH'
              : '🟡 MEDIUM';
          md.appendMarkdown(`**Risk Level**: ${riskBadge}\n\n`);
          md.appendMarkdown(`**Data Flow**: \`${relatedFlow.summary}\`\n\n`);
          if (relatedFlow.sinkType) {
            md.appendMarkdown(`> ⚠️ **Warning**: Secret reaches dangerous sink: \`${relatedFlow.sinkType}\`\n\n`);
          }
        } else {
          md.appendMarkdown(`**Risk Level**: 🟠 HIGH (Hardcoded in application source)\n\n`);
        }

        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(
          `[🔍 View Secret Flow](command:loyalKnight.showSecretFlow) &nbsp;|&nbsp; ` +
            `[⚡ Fix Automatically](command:loyalKnight.autoRemediate) &nbsp;|&nbsp; ` +
            `[⚙ Settings](command:loyalKnight.openSettings)`
        );

        return new vscode.Hover(md, range);
      }
    }

    // 2. Check if hovering over a dangerous sink in data-flow
    for (const flow of flows) {
      for (const node of flow.nodes) {
        if (node.kind === 'sink') {
          const range = new vscode.Range(node.line, node.column, node.endLine, node.endColumn);
          if (range.contains(position)) {
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.supportHtml = true;

            const riskBadge =
              flow.highestRisk === 'CRITICAL'
                ? '🔴 CRITICAL'
                : flow.highestRisk === 'HIGH'
                ? '🟠 HIGH'
                : '🟡 MEDIUM';

            md.appendMarkdown(`### 🛡 Loyal Knight — Dangerous Sink\n\n`);
            md.appendMarkdown(`**Exposure**: ${riskBadge} RISK (\`${node.label}\`)\n\n`);
            md.appendMarkdown(`- **Details**: ${node.details ?? 'Secret exposed at sink'}\n`);
            md.appendMarkdown(`- **Trace**: \`${flow.summary}\`\n`);
            md.appendMarkdown(`- **Remediation**: ${flow.remediationAdvice}\n\n`);
            md.appendMarkdown(`---\n\n`);
            md.appendMarkdown(
              `[🔍 Open Interactive Flow Graph](command:loyalKnight.showSecretFlow) &nbsp;|&nbsp; ` +
                `[⚙ Settings](command:loyalKnight.openSettings)`
            );

            return new vscode.Hover(md, range);
          }
        }
      }
    }

    return null;
  }
}
