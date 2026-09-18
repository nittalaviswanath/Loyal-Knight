export type SinkType =
  | 'logger'
  | 'http'
  | 'frontend_response'
  | 'error'
  | 'telemetry';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type NodeKind = 'source' | 'variable' | 'transformation' | 'sink';

export interface DataFlowNode {
  id: string;
  label: string;
  kind: NodeKind;
  line: number; // 0-indexed
  column: number;
  endLine: number;
  endColumn: number;
  details?: string;
  riskLevel?: RiskLevel;
  codeSnippet?: string;
}

export interface DataFlowEdge {
  from: string;
  to: string;
  label?: string;
  certainty: 'certain' | 'probable';
}

export interface DataFlowGraph {
  id: string;
  secretLabel: string;
  sourceFile: string;
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  summary: string;
  highestRisk: RiskLevel;
  sinkType?: SinkType;
  remediationAdvice?: string;
  reasons: string[];
}

export interface ScanTelemetry {
  timestamp: string;
  file: string;
  scanType: 'LIVE' | 'SAVE' | 'MANUAL' | 'STAGED_CHANGE';
  durationMs: number;
  findingsCount: number;
  highRiskCount: number;
  flowsCount: number;
}
