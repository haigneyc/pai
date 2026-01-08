/**
 * Schema.ts - TypeScript interfaces for Investigation
 *
 * Defines:
 * - RepoSignals: Deterministic data collected from repository
 * - InvestigationReport: Expected output structure from Task agent
 */

// ============================================================================
// Collection Options
// ============================================================================

export interface CollectOptions {
  maxFiles: number;
  maxFileSize: number;  // bytes
  treeDepth: number;
  focus: string[];
}

export const DEFAULT_COLLECT_OPTIONS: CollectOptions = {
  maxFiles: 50,
  maxFileSize: 32 * 1024,  // 32KB
  treeDepth: 5,
  focus: []
};

// ============================================================================
// Repo Signals (Deterministic Collection - No LLM)
// ============================================================================

export interface RepoMeta {
  root: string;
  repoName: string;
  gitBranch: string | null;
  gitDirty: boolean;
  collectedAt: string;
  toolVersion: string;
}

export interface FileTreeInfo {
  depth: number;
  totalFiles: number;
  totalDirs: number;
  truncated: boolean;
  tree: string;
}

export interface EntrypointFile {
  path: string;
  purpose: string;
  sizeBytes: number;
  contentPreview: string;
  truncated: boolean;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepPointer {
  pattern: string;
  category: 'bootstrap' | 'routing' | 'database' | 'testing' | 'config' | 'ci';
  matchCount: number;
  matches: GrepMatch[];
}

export interface RepoSignals {
  meta: RepoMeta;
  fileTree: FileTreeInfo;
  entrypoints: EntrypointFile[];
  grepPointers: GrepPointer[];
}

// ============================================================================
// Investigation Report (Expected Task Agent Output)
// ============================================================================

export interface DirectoryInfo {
  path: string;
  purpose: string;
  citedFile: string;
}

export interface RepoMap {
  primaryLanguage: string;
  framework: string | null;
  architecture: string;
  keyDirectories: DirectoryInfo[];
}

export interface BuildRunTest {
  buildCommand: string | null;
  runCommand: string | null;
  testCommand: string | null;
  prerequisites: string[];
  notes: string;
}

export interface ArchitectureFinding {
  title: string;
  description: string;
  citedFiles: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ImplementationPointer {
  area: string;
  relevantFiles: string[];
  approach: string;
  citedFile: string;
}

export interface Risk {
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  citedFile?: string;
}

export interface InvestigationReport {
  executiveSummary: string;
  repoMap: RepoMap;
  buildRunTest: BuildRunTest;
  architectureFindings: ArchitectureFinding[];
  implementationPointers: ImplementationPointer[];
  risks: Risk[];
  nextSteps: string[];
}
