import * as ts from 'typescript';
import * as path from 'node:path';
import { SecretFinding } from '../detectors/types.js';
import {
  DataFlowGraph,
  DataFlowNode,
  DataFlowEdge,
  RiskLevel,
  SinkType,
} from './dataFlowTypes.js';

interface TrackedSecret {
  id: string;
  sourceLabel: string;
  sourceNode: DataFlowNode;
  variables: Map<string, DataFlowNode>; // variableName -> node
  transformations: DataFlowNode[];
  sinks: Array<{ sinkType: SinkType; node: DataFlowNode; destination?: string }>;
}

export class AstAnalyzer {
  /**
   * Analyzes a JavaScript or TypeScript document to extract secret sources,
   * variable assignments, transformations, and dangerous sinks.
   */
  public analyzeDocument(
    text: string,
    filePath: string,
    existingFindings: SecretFinding[] = []
  ): DataFlowGraph[] {
    const ext = path.extname(filePath).toLowerCase();
    const isSupported = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext);

    if (!isSupported || !text.trim()) {
      return [];
    }

    try {
      const scriptKind =
        ext === '.tsx'
          ? ts.ScriptKind.TSX
          : ext === '.jsx'
          ? ts.ScriptKind.JSX
          : ext === '.ts'
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;

      const sourceFile = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      );

      const graphs: DataFlowGraph[] = [];
      const trackedSecrets: TrackedSecret[] = [];

      // Helper to get line & column (0-indexed)
      const getPos = (node: ts.Node) => {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        return {
          line: start.line,
          column: start.character,
          endLine: end.line,
          endColumn: end.character,
        };
      };

      // 1. Collect Secret Sources from process.env.*
      const visitForSources = (node: ts.Node) => {
        // Match process.env.SOME_KEY or process.env['SOME_KEY']
        let envKey: string | undefined;

        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(sourceFile) === 'process' &&
          node.expression.name.text === 'env'
        ) {
          envKey = node.name.text;
        } else if (
          ts.isElementAccessExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(sourceFile) === 'process' &&
          node.expression.name.text === 'env' &&
          node.argumentExpression &&
          ts.isStringLiteral(node.argumentExpression)
        ) {
          envKey = node.argumentExpression.text;
        }

        if (envKey) {
          const pos = getPos(node);
          const sourceId = `src_${pos.line}_${pos.column}`;
          const sourceNode: DataFlowNode = {
            id: sourceId,
            label: `process.env.${envKey}`,
            kind: 'source',
            line: pos.line,
            column: pos.column,
            endLine: pos.endLine,
            endColumn: pos.endColumn,
            details: `Environment variable credential: ${envKey}`,
            codeSnippet: node.getText(sourceFile),
          };

          trackedSecrets.push({
            id: sourceId,
            sourceLabel: `process.env.${envKey}`,
            sourceNode,
            variables: new Map(),
            transformations: [],
            sinks: [],
          });
        }

        ts.forEachChild(node, visitForSources);
      };

      visitForSources(sourceFile);

      // Add hardcoded findings as secret sources
      for (const f of existingFindings) {
        const sourceId = `hardcoded_${f.line}_${f.column}`;
        const sourceNode: DataFlowNode = {
          id: sourceId,
          label: `${f.type} (${f.match})`,
          kind: 'source',
          line: f.line,
          column: f.column,
          endLine: f.endLine,
          endColumn: f.endColumn,
          details: `Hardcoded secret (${f.provider})`,
          riskLevel: f.confidence === 'high' ? 'HIGH' : 'MEDIUM',
          codeSnippet: f.match,
        };

        trackedSecrets.push({
          id: sourceId,
          sourceLabel: `${f.type} (${f.match})`,
          sourceNode,
          variables: new Map(),
          transformations: [],
          sinks: [],
        });
      }

      // 2. Track Variable Declarations and Assignments
      const visitForVariables = (node: ts.Node) => {
        // Variable declaration: const token = process.env.KEY or const token = "..."
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
          const varName = node.name.text;
          const initializerText = node.initializer.getText(sourceFile);
          const pos = getPos(node);

          for (const secret of trackedSecrets) {
            // Check if initializer matches source node
            const initPos = getPos(node.initializer);
            const matchesSource =
              initPos.line === secret.sourceNode.line &&
              initPos.column >= secret.sourceNode.column &&
              initPos.endColumn <= secret.sourceNode.endColumn + 2;

            // Or initializer references an existing tracked variable
            const referencesTrackedVar = Array.from(secret.variables.keys()).some((v) =>
              new RegExp(`\\b${v}\\b`).test(initializerText)
            );

            if (matchesSource || referencesTrackedVar) {
              const varNode: DataFlowNode = {
                id: `var_${pos.line}_${pos.column}_${varName}`,
                label: varName,
                kind: 'variable',
                line: pos.line,
                column: pos.column,
                endLine: pos.endLine,
                endColumn: pos.endColumn,
                details: `Assigned secret value`,
                codeSnippet: node.getText(sourceFile),
              };
              secret.variables.set(varName, varNode);
            }
          }
        }

        // Binary assignment: auth = token
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(node.left)
        ) {
          const targetName = node.left.text;
          const rightText = node.right.getText(sourceFile);
          const pos = getPos(node);

          for (const secret of trackedSecrets) {
            if (Array.from(secret.variables.keys()).some((v) => rightText.includes(v))) {
              const varNode: DataFlowNode = {
                id: `var_${pos.line}_${pos.column}_${targetName}`,
                label: targetName,
                kind: 'variable',
                line: pos.line,
                column: pos.column,
                endLine: pos.endLine,
                endColumn: pos.endColumn,
                details: `Reassigned secret to ${targetName}`,
                codeSnippet: node.getText(sourceFile),
              };
              secret.variables.set(targetName, varNode);
            }
          }
        }

        ts.forEachChild(node, visitForVariables);
      };

      visitForVariables(sourceFile);

      // 3. Track Simple Function Parameters
      // e.g. function send(token) { ... } called with send(myToken)
      const functionParams = new Map<string, string[]>(); // funcName -> [paramNames]
      const visitForFunctionDefs = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name && node.parameters) {
          const params = node.parameters
            .map((p) => (ts.isIdentifier(p.name) ? p.name.text : ''))
            .filter(Boolean);
          functionParams.set(node.name.text, params);
        }
        ts.forEachChild(node, visitForFunctionDefs);
      };
      visitForFunctionDefs(sourceFile);

      // Check function calls passing secret variables
      const visitForCallArgs = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const funcName = node.expression.text;
          const params = functionParams.get(funcName);
          if (params) {
            node.arguments.forEach((arg, index) => {
              const argText = arg.getText(sourceFile);
              for (const secret of trackedSecrets) {
                if (secret.variables.has(argText) && params[index]) {
                  const paramName = params[index];
                  const pos = getPos(arg);
                  const varNode: DataFlowNode = {
                    id: `param_${pos.line}_${pos.column}_${paramName}`,
                    label: `${funcName}(${paramName})`,
                    kind: 'variable',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: `Passed into parameter '${paramName}' of '${funcName}'`,
                    codeSnippet: node.getText(sourceFile),
                  };
                  secret.variables.set(paramName, varNode);
                }
              }
            });
          }
        }
        ts.forEachChild(node, visitForCallArgs);
      };
      visitForCallArgs(sourceFile);

      // 4. Track Sinks (Logger, HTTP, Frontend response, Error, Telemetry)
      const visitForSinks = (node: ts.Node) => {
        // A. Call expressions: console.log, res.json, fetch, axios, etc.
        if (ts.isCallExpression(node)) {
          const callText = node.expression.getText(sourceFile);
          const argsText = node.arguments.map((a) => a.getText(sourceFile)).join(', ');
          const pos = getPos(node);

          for (const secret of trackedSecrets) {
            // Check if any tracked variable or the source directly is in the call arguments
            const trackedNames = Array.from(secret.variables.keys());
            const touchesSecret =
              trackedNames.some((v) => new RegExp(`\\b${v}\\b`).test(argsText)) ||
              argsText.includes(secret.sourceNode.label);

            if (touchesSecret) {
              // Logger Sink
              if (
                /^(?:(?:window|global|globalThis)\.)?(?:console\.(?:log|error|warn|info|debug|trace|table|dir)|logger\.(?:log|error|warn|info|debug|trace))$/.test(
                  callText
                )
              ) {
                secret.sinks.push({
                  sinkType: 'logger',
                  node: {
                    id: `sink_log_${pos.line}_${pos.column}`,
                    label: `${callText}()`,
                    kind: 'sink',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: 'Exposed to console / logger output',
                    riskLevel: 'CRITICAL',
                    codeSnippet: node.getText(sourceFile),
                  },
                });
              }

              // Frontend / Client Response Sink (res.json, res.send, res.end)
              else if (/^(res\.(json|send|end)|response\.(json|send))$/.test(callText)) {
                secret.sinks.push({
                  sinkType: 'frontend_response',
                  node: {
                    id: `sink_res_${pos.line}_${pos.column}`,
                    label: `${callText}()`,
                    kind: 'sink',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: 'Credential sent in HTTP response to client / frontend',
                    riskLevel: 'CRITICAL',
                    codeSnippet: node.getText(sourceFile),
                  },
                });
              }

              // HTTP Request Sink (fetch, axios, http.request)
              else if (
                /^(?:(?:window|global|globalThis)\.)?fetch$/.test(callText) ||
                /^(?:axios|axios\.(?:get|post|put|patch|delete)|http\.request|https\.request)$/.test(callText)
              ) {
                let destination = 'Unknown / dynamic';
                if (node.arguments.length > 0) {
                  const firstArg = node.arguments[0];
                  if (ts.isStringLiteral(firstArg)) {
                    try {
                      const urlObj = new URL(firstArg.text);
                      destination = urlObj.hostname;
                    } catch {
                      destination = firstArg.text;
                    }
                  }
                }

                secret.sinks.push({
                  sinkType: 'http',
                  destination,
                  node: {
                    id: `sink_http_${pos.line}_${pos.column}`,
                    label: `${callText}(${destination})`,
                    kind: 'sink',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: `Sent to external destination: ${destination}`,
                    riskLevel: 'MEDIUM',
                    codeSnippet: node.getText(sourceFile),
                  },
                });
              }

              // Telemetry Sink (telemetry.track, analytics.track)
              else if (/^(telemetry|analytics)\.track$/.test(callText)) {
                secret.sinks.push({
                  sinkType: 'telemetry',
                  node: {
                    id: `sink_telemetry_${pos.line}_${pos.column}`,
                    label: `${callText}()`,
                    kind: 'sink',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: 'Credential forwarded to analytics / telemetry service',
                    riskLevel: 'HIGH',
                    codeSnippet: node.getText(sourceFile),
                  },
                });
              }

              // External / Unknown Function Call Sink
              else if (!functionParams.has(callText)) {
                secret.sinks.push({
                  sinkType: 'external_call',
                  node: {
                    id: `sink_ext_${pos.line}_${pos.column}`,
                    label: `${callText}()`,
                    kind: 'sink',
                    line: pos.line,
                    column: pos.column,
                    endLine: pos.endLine,
                    endColumn: pos.endColumn,
                    details: `Passed as argument to external or imported function '${callText}'`,
                    riskLevel: 'MEDIUM',
                    codeSnippet: node.getText(sourceFile),
                  },
                });
              }
            }
          }
        }

        // B. Throw Statement Sink: throw new Error(...)
        if (ts.isThrowStatement(node) && node.expression) {
          const exprText = node.expression.getText(sourceFile);
          const pos = getPos(node);

          for (const secret of trackedSecrets) {
            const trackedNames = Array.from(secret.variables.keys());
            const touchesSecret =
              trackedNames.some((v) => new RegExp(`\\b${v}\\b`).test(exprText)) ||
              exprText.includes(secret.sourceNode.label);

            if (touchesSecret) {
              secret.sinks.push({
                sinkType: 'error',
                node: {
                  id: `sink_err_${pos.line}_${pos.column}`,
                  label: 'throw new Error()',
                  kind: 'sink',
                  line: pos.line,
                  column: pos.column,
                  endLine: pos.endLine,
                  endColumn: pos.endColumn,
                  details: 'Credential leaked in thrown exception / error message',
                  riskLevel: 'HIGH',
                  codeSnippet: node.getText(sourceFile),
                },
              });
            }
          }
        }

        ts.forEachChild(node, visitForSinks);
      };

      visitForSinks(sourceFile);

      // 5. Assemble DataFlowGraph for secrets that have sinks or tracked variables
      for (const secret of trackedSecrets) {
        if (secret.variables.size === 0 && secret.sinks.length === 0) {
          continue;
        }

        const nodes: DataFlowNode[] = [secret.sourceNode];
        const edges: DataFlowEdge[] = [];
        const reasons: string[] = [];

        // Connect source to first-level variables
        let previousNodeId = secret.sourceNode.id;
        for (const [varName, varNode] of secret.variables) {
          nodes.push(varNode);
          edges.push({
            from: previousNodeId,
            to: varNode.id,
            label: 'assigned to',
            certainty: 'certain',
          });
          previousNodeId = varNode.id;
        }

        // Determine highest risk and connect to sinks
        let highestRisk: RiskLevel = 'LOW';
        let primarySinkType: SinkType | undefined;
        let remediationAdvice = 'Ensure credential is kept in local environment variables.';

        if (secret.sinks.length > 0) {
          for (const s of secret.sinks) {
            nodes.push(s.node);
            edges.push({
              from: previousNodeId,
              to: s.node.id,
              label: s.sinkType === 'http' ? 'passed as header / payload' : 'exposed in argument',
              certainty: 'certain',
            });

            primarySinkType = s.sinkType;
            if (s.sinkType === 'logger') {
              highestRisk = 'CRITICAL';
              reasons.push('🔴 Critical: Secret is written directly to standard output or logs.');
              remediationAdvice = 'Remove secret from console/logger calls. Use masked values if logging is required.';
            } else if (s.sinkType === 'frontend_response') {
              highestRisk = 'CRITICAL';
              reasons.push('🔴 Critical: Secret is returned in HTTP response to frontend / client.');
              remediationAdvice = 'Strip sensitive credential from the response payload before sending.';
            } else if (s.sinkType === 'error') {
              if (highestRisk !== 'CRITICAL') {
                highestRisk = 'HIGH';
              }
              reasons.push('🟠 High: Secret is embedded in exception message.');
              remediationAdvice = 'Sanitize error message to prevent secret leaking into error logs.';
            } else if (s.sinkType === 'telemetry') {
              if (highestRisk !== 'CRITICAL') {
                highestRisk = 'HIGH';
              }
              reasons.push('🟠 High: Secret is sent to third-party telemetry / analytics.');
              remediationAdvice = 'Filter out secrets from telemetry payload.';
            } else if (s.sinkType === 'http') {
              if (highestRisk !== 'CRITICAL' && highestRisk !== 'HIGH') {
                highestRisk = 'MEDIUM';
              }
              reasons.push(`🟡 Medium: Secret transmitted in external HTTP request to ${s.destination}.`);
              remediationAdvice = `Verify that ${s.destination} is a trusted, secure destination.`;
            } else if (s.sinkType === 'external_call') {
              if (highestRisk !== 'CRITICAL' && highestRisk !== 'HIGH') {
                highestRisk = 'MEDIUM';
              }
              reasons.push(`🟡 Medium: Secret passed to external or unverified function \`${s.node.label}\`.`);
              remediationAdvice = `Verify that \`${s.node.label}\` does not log or leak the credential.`;
            }
          }
        } else {
          // Hardcoded secret without sink yet
          highestRisk = secret.sourceNode.riskLevel ?? 'HIGH';
          reasons.push('Credential is hardcoded in application source code.');
          remediationAdvice = 'Extract secret into .env and load via process.env.';
        }

        const summary = `${secret.sourceLabel} ➔ ${Array.from(secret.variables.keys()).join(' ➔ ') || 'direct'}${
          secret.sinks.length > 0 ? ` ➔ ${secret.sinks[0].node.label}` : ''
        }`;

        graphs.push({
          id: `flow_${secret.id}`,
          secretLabel: secret.sourceLabel,
          sourceFile: filePath,
          nodes,
          edges,
          summary,
          highestRisk,
          sinkType: primarySinkType,
          remediationAdvice,
          reasons,
        });
      }

      return graphs;
    } catch (err) {
      console.error('[LOYAL KNIGHT] AST Analysis error:', err);
      return [];
    }
  }
}
