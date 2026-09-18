import * as vscode from 'vscode';
import { SecretFinding, FindingConfidence } from '../detectors/types.js';
import { DataFlowGraph } from '../analysis/dataFlowTypes.js';

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly findingsByUri = new Map<string, SecretFinding[]>();
  private readonly flowsByUri = new Map<string, DataFlowGraph[]>();
  private readonly _onDidChangeFindings = new vscode.EventEmitter<vscode.Uri | undefined>();
  public readonly onDidChangeFindings = this._onDidChangeFindings.event;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('loyal-knight');
  }

  /**
   * Updates diagnostics and data-flow graphs for a document.
   */
  public updateFindingsAndFlows(
    uri: vscode.Uri,
    findings: SecretFinding[],
    flows: DataFlowGraph[] = []
  ): void {
    const uriKey = uri.toString();

    if (findings.length === 0 && flows.length === 0) {
      this.findingsByUri.delete(uriKey);
      this.flowsByUri.delete(uriKey);
      this.collection.set(uri, []);
    } else {
      this.findingsByUri.set(uriKey, findings);
      this.flowsByUri.set(uriKey, flows);

      const diagnostics: vscode.Diagnostic[] = [];

      // 1. Diagnostics for detected secret patterns / entropy
      for (const finding of findings) {
        const range = new vscode.Range(
          finding.line,
          finding.column,
          finding.endLine,
          finding.endColumn
        );

        const severity = this.confidenceToSeverity(finding.confidence);
        const message = `[LOYAL KNIGHT] ${finding.type} detected (${finding.match})`;

        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = 'LOYAL KNIGHT';
        diagnostic.code = finding.provider;
        diagnostics.push(diagnostic);
      }

      // 2. Diagnostics for dangerous sinks in data-flow graphs
      for (const flow of flows) {
        if (flow.sinkType) {
          const sinkNode = flow.nodes.find((n) => n.kind === 'sink');
          if (sinkNode) {
            const range = new vscode.Range(
              sinkNode.line,
              sinkNode.column,
              sinkNode.endLine,
              sinkNode.endColumn
            );

            let severity = vscode.DiagnosticSeverity.Warning;
            let icon = '🟡';
            if (flow.highestRisk === 'CRITICAL') {
              severity = vscode.DiagnosticSeverity.Error;
              icon = '🔴';
            } else if (flow.highestRisk === 'HIGH') {
              severity = vscode.DiagnosticSeverity.Error;
              icon = '🟠';
            }

            const message = `[LOYAL KNIGHT] ${icon} ${flow.highestRisk} Exposure: ${sinkNode.details ?? flow.summary}`;
            const diag = new vscode.Diagnostic(range, message, severity);
            diag.source = 'LOYAL KNIGHT';
            diag.code = `sink:${flow.sinkType}`;
            diagnostics.push(diag);
          }
        }
      }

      this.collection.set(uri, diagnostics);
    }

    this._onDidChangeFindings.fire(uri);
  }

  public updateFindings(uri: vscode.Uri, findings: SecretFinding[]): void {
    const existingFlows = this.flowsByUri.get(uri.toString()) || [];
    this.updateFindingsAndFlows(uri, findings, existingFlows);
  }

  public clearForUri(uri: vscode.Uri): void {
    const uriKey = uri.toString();
    this.findingsByUri.delete(uriKey);
    this.flowsByUri.delete(uriKey);
    this.collection.delete(uri);
    this._onDidChangeFindings.fire(uri);
  }

  public clearAll(): void {
    this.findingsByUri.clear();
    this.flowsByUri.clear();
    this.collection.clear();
    this._onDidChangeFindings.fire(undefined);
  }

  public getFindingsForUri(uri: vscode.Uri): SecretFinding[] {
    return this.findingsByUri.get(uri.toString()) || [];
  }

  public getFlowsForUri(uri: vscode.Uri): DataFlowGraph[] {
    return this.flowsByUri.get(uri.toString()) || [];
  }

  public getAllFindings(): Map<string, SecretFinding[]> {
    return this.findingsByUri;
  }

  public getAllFlows(): Map<string, DataFlowGraph[]> {
    return this.flowsByUri;
  }

  public getTotalFindingsCount(): number {
    let count = 0;
    for (const findings of this.findingsByUri.values()) {
      count += findings.length;
    }
    return count;
  }

  public getTotalFlowsCount(): number {
    let count = 0;
    for (const flows of this.flowsByUri.values()) {
      count += flows.length;
    }
    return count;
  }

  public getSeverityCounts(findings: SecretFinding[]): { high: number; medium: number; low: number } {
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const f of findings) {
      if (f.confidence === 'high') {
        high++;
      } else if (f.confidence === 'medium') {
        medium++;
      } else if (f.confidence === 'low') {
        low++;
      }
    }

    return { high, medium, low };
  }

  private confidenceToSeverity(confidence: FindingConfidence): vscode.DiagnosticSeverity {
    switch (confidence) {
      case 'high':
        return vscode.DiagnosticSeverity.Error;
      case 'medium':
        return vscode.DiagnosticSeverity.Warning;
      case 'low':
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  public dispose(): void {
    this.collection.dispose();
    this._onDidChangeFindings.dispose();
    this.findingsByUri.clear();
    this.flowsByUri.clear();
  }
}
