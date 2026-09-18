import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SentryConfig, DEFAULT_CONFIG } from './types.js';
import { isPathIgnored } from './pathFilter.js';
import { ScanOptions } from '../detectors/types.js';

export class ConfigManager implements vscode.Disposable {
  private config: SentryConfig = { ...DEFAULT_CONFIG };
  private disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeConfig = new vscode.EventEmitter<SentryConfig>();
  public readonly onDidChangeConfig = this._onDidChangeConfig.event;

  constructor() {
    this.init();
    this.watchConfigFile();
  }

  public getConfig(): SentryConfig {
    return this.config;
  }

  public getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  public getConfigPath(): string | undefined {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return undefined;
    }
    return path.join(root, '.secretsentry', 'config.json');
  }

  /**
   * Toggles protection scanning on or off and persists to config.json.
   */
  public toggleEnabled(): boolean {
    const newState = !this.config.scanning.enabled;
    this.config.scanning.enabled = newState;
    this.saveConfig();
    this._onDidChangeConfig.fire(this.config);
    return newState;
  }

  /**
   * Updates partial config and persists to disk.
   */
  public updateConfig(partial: Partial<SentryConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
      scanning: { ...this.config.scanning, ...(partial.scanning ?? {}) },
      blacklist: { ...this.config.blacklist, ...(partial.blacklist ?? {}) },
      providers: { ...this.config.providers, ...(partial.providers ?? {}) },
    };
    this.saveConfig();
    this._onDidChangeConfig.fire(this.config);
  }

  private saveConfig(): void {
    const configPath = this.getConfigPath();
    if (!configPath) {
      return;
    }
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[LOYAL KNIGHT] Failed to save config:', err);
    }
  }

  /**
   * Initializes config on startup. If .secretsentry/config.json doesn't exist,
   * generates default config file.
   */
  public init(): void {
    const configPath = this.getConfigPath();
    if (!configPath) {
      this.config = { ...DEFAULT_CONFIG };
      return;
    }

    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
        this.config = { ...DEFAULT_CONFIG };
      } else {
        this.loadFromFile(configPath);
      }
    } catch (err) {
      console.error('[LOYAL KNIGHT] Failed to initialize config file:', err);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private loadFromFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<SentryConfig>;
      this.config = {
        version: parsed.version ?? DEFAULT_CONFIG.version,
        scanning: { ...DEFAULT_CONFIG.scanning, ...(parsed.scanning ?? {}) },
        blacklist: {
          folders: parsed.blacklist?.folders ?? DEFAULT_CONFIG.blacklist.folders,
          files: parsed.blacklist?.files ?? DEFAULT_CONFIG.blacklist.files,
        },
        ignoredMatches: parsed.ignoredMatches ?? DEFAULT_CONFIG.ignoredMatches,
        providers: { ...DEFAULT_CONFIG.providers, ...(parsed.providers ?? {}) },
      };
      this._onDidChangeConfig.fire(this.config);
    } catch (err) {
      console.error('[LOYAL KNIGHT] Error reading config file:', err);
    }
  }

  private watchConfigFile(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/.secretsentry/config.json');
    watcher.onDidChange((uri) => this.loadFromFile(uri.fsPath));
    watcher.onDidCreate((uri) => this.loadFromFile(uri.fsPath));
    this.disposables.push(watcher);
  }

  /**
   * Determines whether a given file path should be ignored.
   * Whitelist overrides blacklist.
   */
  public isPathIgnored(filePath: string): boolean {
    return isPathIgnored(filePath, this.config);
  }

  /**
   * Constructs ScanOptions from current configuration.
   */
  public getScanOptions(filePath?: string): ScanOptions {
    return {
      providers: this.config.providers,
      entropyThreshold: this.config.scanning.entropyThreshold,
      ignoredHashes: new Set(this.config.ignoredMatches.map((m) => m.hash)),
      filePath,
    };
  }

  public dispose(): void {
    this._onDidChangeConfig.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
