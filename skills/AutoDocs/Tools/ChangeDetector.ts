#!/usr/bin/env bun
/**
 * ChangeDetector.ts - Detect when documentation needs updating
 *
 * Analyzes staged git changes to determine if README.md or ARCHITECTURE.md
 * need to be regenerated.
 *
 * Usage:
 *   bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts          # Check staged changes
 *   bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts --force  # Force regeneration
 *   bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts --status # Show current state
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

const PAI_DIR = process.env.PAI_DIR || process.env.PAI_HOME || join(process.env.HOME || '', 'pai');
const STATE_FILE = join(PAI_DIR, '.autodocs-state.json');

// Use full path to git because bun snap has restricted PATH
const GIT_PATH = '/usr/bin/git';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AutoDocsState {
  lastReadmeGeneration: string;
  lastArchitectureGeneration: string;
  lastCommitHash: string;
  filesAtLastGeneration: {
    'README.md'?: string;
    'docs/ARCHITECTURE.md'?: string;
  };
  lastAnalyzedFiles: string[];
}

export interface ChangeDetectionResult {
  needsReadmeUpdate: boolean;
  needsArchitectureUpdate: boolean;
  changedFiles: string[];
  triggers: string[];
  staleDocs: string[];
}

// ============================================================================
// Trigger Patterns
// ============================================================================

const README_TRIGGERS: RegExp[] = [
  /^skills\/.*\/SKILL\.md$/,           // New/modified skills
  /^tools\/.*\.ts$/,                    // New/modified tools
  /^hooks\/(?!lib\/).*\.ts$/,           // New/modified hooks (not lib/)
  /^package\.json$/,                    // Dependencies changed
  /^config\/.*\.json$/,                 // Config changes
  /^skills\/.*\/Tools\/.*\.ts$/,        // Skill tools
];

const ARCHITECTURE_TRIGGERS: RegExp[] = [
  /^skills\/.*\/SKILL\.md$/,           // Skill structure changes
  /^hooks\/.*\.ts$/,                    // Hook system changes
  /^observability\/.*/,                // Observability changes
  /^tools\/.*\.ts$/,                    // Tool additions
  /^config\/settings.*\.json$/,        // Config structure
  /^skills\/[^/]+\/$/,                 // New skill directories
];

// Files that should always trigger both updates
const CRITICAL_FILES: RegExp[] = [
  /^skills\/CORE\/SkillSystem\.md$/,
  /^\.env$/,
];

// ============================================================================
// Git Integration
// ============================================================================

// Note: bun snap has restricted access and can't call git directly.
// The pre-commit hook passes git info via environment variables.

function getStagedFilesFromEnv(): string[] {
  const envFiles = process.env.AUTODOCS_STAGED_FILES;
  if (!envFiles) return [];
  return envFiles.split(':').filter(f => f.length > 0);
}

function getCommitHashFromEnv(): string {
  return process.env.AUTODOCS_COMMIT_HASH || '';
}

async function getStagedFiles(): Promise<string[]> {
  // First try environment variable (set by pre-commit hook)
  const envFiles = getStagedFilesFromEnv();
  if (envFiles.length > 0) {
    return envFiles;
  }

  // Fallback to git command (may fail in bun snap)
  try {
    const proc = Bun.spawn([GIT_PATH, 'diff', '--cached', '--name-only'], {
      cwd: PAI_DIR,
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    return output
      .trim()
      .split('\n')
      .filter(f => f.length > 0);
  } catch {
    // Git not available or not a git repo
    return [];
  }
}

async function getLastCommitHash(): Promise<string> {
  // First try environment variable (set by pre-commit hook)
  const envHash = getCommitHashFromEnv();
  if (envHash) {
    return envHash;
  }

  // Fallback to git command (may fail in bun snap)
  try {
    const proc = Bun.spawn([GIT_PATH, 'rev-parse', 'HEAD'], {
      cwd: PAI_DIR,
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    return output.trim();
  } catch {
    // Git not available or not a git repo
    return '';
  }
}

async function getFilesSinceLastGeneration(lastCommit: string): Promise<string[]> {
  if (!lastCommit) return [];

  // Can't easily do git diff from bun snap, skip this check
  // The staged files check is more important for pre-commit
  try {
    const proc = Bun.spawn([GIT_PATH, 'diff', '--name-only', lastCommit, 'HEAD'], {
      cwd: PAI_DIR,
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    return output
      .trim()
      .split('\n')
      .filter(f => f.length > 0);
  } catch {
    // Git not available or not a git repo
    return [];
  }
}

// ============================================================================
// State Management
// ============================================================================

async function loadState(): Promise<AutoDocsState> {
  if (!existsSync(STATE_FILE)) {
    return {
      lastReadmeGeneration: '',
      lastArchitectureGeneration: '',
      lastCommitHash: '',
      filesAtLastGeneration: {},
      lastAnalyzedFiles: []
    };
  }

  try {
    const content = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      lastReadmeGeneration: '',
      lastArchitectureGeneration: '',
      lastCommitHash: '',
      filesAtLastGeneration: {},
      lastAnalyzedFiles: []
    };
  }
}

export async function saveState(state: AutoDocsState): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getFileHash(filePath: string): Promise<string | null> {
  const fullPath = join(PAI_DIR, filePath);
  if (!existsSync(fullPath)) return null;

  try {
    const content = await readFile(fullPath);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

// ============================================================================
// Detection Logic
// ============================================================================

function matchesTriggers(files: string[], triggers: RegExp[]): { matches: boolean; matchedFiles: string[] } {
  const matchedFiles: string[] = [];

  for (const file of files) {
    for (const trigger of triggers) {
      if (trigger.test(file)) {
        matchedFiles.push(file);
        break;
      }
    }
  }

  return {
    matches: matchedFiles.length > 0,
    matchedFiles
  };
}

export async function detectChanges(force: boolean = false): Promise<ChangeDetectionResult> {
  const result: ChangeDetectionResult = {
    needsReadmeUpdate: false,
    needsArchitectureUpdate: false,
    changedFiles: [],
    triggers: [],
    staleDocs: []
  };

  // Force mode
  if (force) {
    result.needsReadmeUpdate = true;
    result.needsArchitectureUpdate = true;
    result.triggers.push('Force regeneration requested');
    return result;
  }

  const state = await loadState();

  // First-run detection: if no commit hash tracked but skills exist, regenerate
  if (!state.lastCommitHash && existsSync(join(PAI_DIR, 'skills'))) {
    result.needsReadmeUpdate = true;
    result.needsArchitectureUpdate = true;
    result.triggers.push('First run - no previous state tracked');
    return result;
  }

  // Get staged files and files since last generation
  const stagedFiles = await getStagedFiles();
  const filesSinceLastGen = await getFilesSinceLastGeneration(state.lastCommitHash);

  // Combine both sets
  const allChangedFiles = [...new Set([...stagedFiles, ...filesSinceLastGen])];
  result.changedFiles = allChangedFiles;

  if (allChangedFiles.length === 0) {
    result.triggers.push('No changed files detected');
    return result;
  }

  // Check for critical file changes
  const criticalMatch = matchesTriggers(allChangedFiles, CRITICAL_FILES);
  if (criticalMatch.matches) {
    result.needsReadmeUpdate = true;
    result.needsArchitectureUpdate = true;
    result.triggers.push(`Critical files changed: ${criticalMatch.matchedFiles.join(', ')}`);
  }

  // Check README triggers
  const readmeMatch = matchesTriggers(allChangedFiles, README_TRIGGERS);
  if (readmeMatch.matches) {
    result.needsReadmeUpdate = true;
    result.triggers.push(`README triggers: ${readmeMatch.matchedFiles.slice(0, 3).join(', ')}${readmeMatch.matchedFiles.length > 3 ? '...' : ''}`);
  }

  // Check Architecture triggers
  const archMatch = matchesTriggers(allChangedFiles, ARCHITECTURE_TRIGGERS);
  if (archMatch.matches) {
    result.needsArchitectureUpdate = true;
    result.triggers.push(`Architecture triggers: ${archMatch.matchedFiles.slice(0, 3).join(', ')}${archMatch.matchedFiles.length > 3 ? '...' : ''}`);
  }

  // Check if docs have been manually modified and need refresh
  const currentReadmeHash = await getFileHash('README.md');
  const currentArchHash = await getFileHash('docs/ARCHITECTURE.md');

  if (currentReadmeHash && state.filesAtLastGeneration['README.md'] !== currentReadmeHash) {
    if (state.filesAtLastGeneration['README.md']) {
      result.staleDocs.push('README.md');
    }
  }

  if (currentArchHash && state.filesAtLastGeneration['docs/ARCHITECTURE.md'] !== currentArchHash) {
    if (state.filesAtLastGeneration['docs/ARCHITECTURE.md']) {
      result.staleDocs.push('docs/ARCHITECTURE.md');
    }
  }

  // If no docs exist yet, generate them
  if (!existsSync(join(PAI_DIR, 'README.md'))) {
    result.needsReadmeUpdate = true;
    result.triggers.push('README.md does not exist');
  }

  if (!existsSync(join(PAI_DIR, 'docs', 'ARCHITECTURE.md'))) {
    result.needsArchitectureUpdate = true;
    result.triggers.push('docs/ARCHITECTURE.md does not exist');
  }

  return result;
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const status = args.includes('--status') || args.includes('-s');

  if (status) {
    const state = await loadState();
    console.log('AutoDocs State:');
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  const result = await detectChanges(force);

  console.log('\nChange Detection Results:');
  console.log('========================');
  console.log(`README needs update:       ${result.needsReadmeUpdate ? 'YES' : 'NO'}`);
  console.log(`Architecture needs update: ${result.needsArchitectureUpdate ? 'YES' : 'NO'}`);
  console.log(`\nChanged files (${result.changedFiles.length}):`);
  for (const file of result.changedFiles.slice(0, 10)) {
    console.log(`  - ${file}`);
  }
  if (result.changedFiles.length > 10) {
    console.log(`  ... and ${result.changedFiles.length - 10} more`);
  }
  console.log(`\nTriggers:`);
  for (const trigger of result.triggers) {
    console.log(`  - ${trigger}`);
  }
  if (result.staleDocs.length > 0) {
    console.log(`\nStale docs (manually modified):`);
    for (const doc of result.staleDocs) {
      console.log(`  - ${doc}`);
    }
  }

  // Exit with code based on whether updates are needed
  process.exit(result.needsReadmeUpdate || result.needsArchitectureUpdate ? 1 : 0);
}

if (import.meta.main) {
  main().catch(console.error);
}
