// $PAI_DIR/hooks/lib/module-rules.ts
// Module Rules: Auto-detect and load reference documentation based on work context

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Glob } from 'bun';

// ============================================================================
// Types
// ============================================================================

export interface Triggers {
  filePatterns?: string[];   // Glob patterns to match files/dirs
  imports?: string[];        // Strings to grep in source files
  dependencies?: string[];   // Package names in package.json
  keywords?: string[];       // Match against session prompt text
}

export interface ReferenceEntry {
  name: string;
  path: string;
  description?: string;
  triggers: Triggers;
  priority: number;
  maxTokens: number;
  disabled?: boolean;
  overrideTriggers?: boolean;
}

export interface ReferenceIndex {
  [moduleName: string]: ReferenceEntry;
}

export interface ModuleRulesConfig {
  userDir: string;      // ~/.claude
  projectDir: string;   // .claude in cwd
  cwd: string;          // Current working directory
  prompt?: string;      // Session prompt for keyword matching
}

export interface DetectionResult {
  module: string;
  path: string;
  priority: number;
  maxTokens: number;
  triggers: string[];   // Which triggers matched
}

// ============================================================================
// Constants
// ============================================================================

const MAX_TOTAL_TOKENS = 8000;
const SOURCE_FILE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java'];

// ============================================================================
// Index Loading
// ============================================================================

/**
 * Load reference index from a directory
 * Falls back to scanning .md files if index.json doesn't exist
 */
export async function loadReferenceIndex(dir: string): Promise<ReferenceIndex | null> {
  const referencesDir = join(dir, 'references');

  if (!existsSync(referencesDir)) {
    return null;
  }

  const indexPath = join(referencesDir, 'index.json');

  if (existsSync(indexPath)) {
    try {
      const content = readFileSync(indexPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[ModuleRules] Failed to parse ${indexPath}:`, error);
    }
  }

  // Fallback: scan .md files and parse frontmatter
  return scanReferencesDirectory(referencesDir);
}

/**
 * Scan references directory and build index from .md files
 */
async function scanReferencesDirectory(dir: string): Promise<ReferenceIndex> {
  const index: ReferenceIndex = {};

  const files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md');

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(content);

      if (parsed.frontmatter.name && parsed.frontmatter.triggers) {
        const name = parsed.frontmatter.name.toLowerCase();
        index[name] = {
          name: parsed.frontmatter.name,
          path: filePath,
          description: parsed.frontmatter.description,
          triggers: parsed.frontmatter.triggers,
          priority: parsed.frontmatter.priority ?? 50,
          maxTokens: parsed.frontmatter.maxTokens ?? 2000,
          disabled: parsed.frontmatter.disabled,
          overrideTriggers: parsed.frontmatter.overrideTriggers,
        };
      }
    } catch (error) {
      console.error(`[ModuleRules] Failed to parse ${filePath}:`, error);
    }
  }

  return index;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: any; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yaml, body] = match;

  // Simple YAML parser for our specific format
  const frontmatter: any = {};
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (currentArray) {
        const value = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
        currentArray.push(value);
      }
      continue;
    }

    // Key: value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      // Check if this is a nested object start
      if (value === '' || value === '{') {
        // Check if it's an array start on next lines
        const isArrayParent = ['filePatterns', 'imports', 'dependencies', 'keywords'].includes(key);
        if (isArrayParent) {
          currentArray = [];
          if (!frontmatter.triggers) frontmatter.triggers = {};
          frontmatter.triggers[key] = currentArray;
        } else if (key === 'triggers') {
          frontmatter.triggers = {};
        }
        currentKey = key;
      } else {
        // Simple key: value
        currentArray = null;
        const cleanValue = value.replace(/^["']|["']$/g, '');

        // Handle inline arrays like [a, b, c]
        if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
          const items = cleanValue.slice(1, -1).split(',').map(s =>
            s.trim().replace(/^["']|["']$/g, '')
          );
          if (currentKey === 'triggers' || frontmatter.triggers) {
            if (!frontmatter.triggers) frontmatter.triggers = {};
            frontmatter.triggers[key] = items;
          } else {
            frontmatter[key] = items;
          }
        } else if (cleanValue === 'true') {
          frontmatter[key] = true;
        } else if (cleanValue === 'false') {
          frontmatter[key] = false;
        } else if (!isNaN(Number(cleanValue))) {
          frontmatter[key] = Number(cleanValue);
        } else {
          frontmatter[key] = cleanValue;
        }
      }
    }
  }

  return { frontmatter, body: body.trim() };
}

// ============================================================================
// Index Merging
// ============================================================================

/**
 * Merge user and project indices with cascade rules
 * - Same module: project replaces user entirely (unless overrideTriggers)
 * - Different modules: both included
 * - Disabled: removed from merged result
 */
export function mergeIndices(
  userIndex: ReferenceIndex | null,
  projectIndex: ReferenceIndex | null
): ReferenceIndex {
  const merged: ReferenceIndex = { ...(userIndex || {}) };

  if (!projectIndex) {
    return merged;
  }

  for (const [name, projectRef] of Object.entries(projectIndex)) {
    if (projectRef.disabled) {
      // Project explicitly disables this module
      delete merged[name];
      continue;
    }

    if (merged[name] && !projectRef.overrideTriggers) {
      // Merge triggers: project content, combined triggers
      merged[name] = {
        ...projectRef,
        triggers: mergeTriggers(merged[name].triggers, projectRef.triggers),
      };
    } else {
      // Complete override or new module
      merged[name] = projectRef;
    }
  }

  return merged;
}

/**
 * Merge two trigger objects (additive)
 */
function mergeTriggers(userTriggers: Triggers, projectTriggers: Triggers): Triggers {
  return {
    filePatterns: [...(userTriggers.filePatterns || []), ...(projectTriggers.filePatterns || [])],
    imports: [...(userTriggers.imports || []), ...(projectTriggers.imports || [])],
    dependencies: [...(userTriggers.dependencies || []), ...(projectTriggers.dependencies || [])],
    keywords: [...(userTriggers.keywords || []), ...(projectTriggers.keywords || [])],
  };
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect which modules are relevant for the current context
 */
export async function detectModules(
  index: ReferenceIndex,
  cwd: string,
  prompt?: string
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];

  for (const [moduleName, ref] of Object.entries(index)) {
    const matchedTriggers: string[] = [];

    // Check file patterns
    if (ref.triggers.filePatterns?.length) {
      const fileMatches = await checkFilePatterns(ref.triggers.filePatterns, cwd);
      if (fileMatches.length > 0) {
        matchedTriggers.push(`files: ${fileMatches.slice(0, 2).join(', ')}`);
      }
    }

    // Check imports
    if (ref.triggers.imports?.length) {
      const importMatch = await checkImports(ref.triggers.imports, cwd);
      if (importMatch) {
        matchedTriggers.push(`import: ${importMatch}`);
      }
    }

    // Check dependencies
    if (ref.triggers.dependencies?.length) {
      const depMatch = await checkDependencies(ref.triggers.dependencies, cwd);
      if (depMatch) {
        matchedTriggers.push(`dependency: ${depMatch}`);
      }
    }

    // Check keywords in prompt
    if (ref.triggers.keywords?.length && prompt) {
      const keywordMatch = checkKeywords(ref.triggers.keywords, prompt);
      if (keywordMatch) {
        matchedTriggers.push(`keyword: ${keywordMatch}`);
      }
    }

    if (matchedTriggers.length > 0) {
      results.push({
        module: moduleName,
        path: ref.path,
        priority: ref.priority,
        maxTokens: ref.maxTokens,
        triggers: matchedTriggers,
      });
    }
  }

  // Sort by priority (highest first)
  results.sort((a, b) => b.priority - a.priority);

  return results;
}

/**
 * Check file patterns against cwd
 */
async function checkFilePatterns(patterns: string[], cwd: string): Promise<string[]> {
  const matches: string[] = [];

  for (const pattern of patterns) {
    try {
      const glob = new Glob(pattern);
      for await (const file of glob.scan({ cwd, onlyFiles: false })) {
        // Skip node_modules and .git
        if (file.includes('node_modules') || file.includes('.git')) continue;
        matches.push(file);
        if (matches.length >= 3) break; // Limit for performance
      }
      if (matches.length > 0) break;
    } catch {
      // Invalid glob pattern, skip
    }
  }

  return matches;
}

/**
 * Check for import patterns in source files
 */
async function checkImports(patterns: string[], cwd: string): Promise<string | null> {
  // Build grep pattern
  const importPattern = patterns.map(p => escapeRegex(p)).join('|');

  try {
    const proc = Bun.spawn([
      'grep', '-rlE', importPattern,
      '--include=*.ts', '--include=*.tsx',
      '--include=*.js', '--include=*.jsx',
      '--include=*.py',
      '.'
    ], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (output.trim()) {
      // Return first matching pattern
      for (const p of patterns) {
        if (output.includes(p) || patterns.some(pat => output.length > 0)) {
          return p;
        }
      }
      return patterns[0];
    }
  } catch {
    // grep failed or not available
  }

  return null;
}

/**
 * Check dependencies in package.json
 */
async function checkDependencies(packages: string[], cwd: string): Promise<string | null> {
  // Check package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      for (const pkgName of packages) {
        if (allDeps[pkgName]) {
          return pkgName;
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  // Check requirements.txt for Python
  const reqPath = join(cwd, 'requirements.txt');
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, 'utf-8');
      for (const pkgName of packages) {
        if (content.toLowerCase().includes(pkgName.toLowerCase())) {
          return pkgName;
        }
      }
    } catch {
      // File read error
    }
  }

  return null;
}

/**
 * Check keywords in prompt text
 */
function checkKeywords(keywords: string[], prompt: string): string | null {
  const promptLower = prompt.toLowerCase();

  for (const keyword of keywords) {
    if (promptLower.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }

  return null;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Reference Loading
// ============================================================================

/**
 * Load reference content with token budget management
 */
export async function loadReferences(detected: DetectionResult[]): Promise<string> {
  let totalTokens = 0;
  const loadedContent: string[] = [];
  const loadedModules: string[] = [];

  for (const module of detected) {
    if (totalTokens + module.maxTokens > MAX_TOTAL_TOKENS) {
      console.error(`[ModuleRules] Token budget exceeded, skipping ${module.module}`);
      continue;
    }

    try {
      const content = readFileSync(module.path, 'utf-8');
      const { body } = parseFrontmatter(content);

      loadedContent.push(`### ${module.module.toUpperCase()}\n_Triggered by: ${module.triggers.join(', ')}_\n\n${body}`);
      loadedModules.push(module.module);
      totalTokens += module.maxTokens;
    } catch (error) {
      console.error(`[ModuleRules] Failed to load ${module.path}:`, error);
    }
  }

  if (loadedContent.length === 0) {
    return '';
  }

  return `## Module Rules (Auto-detected: ${loadedModules.join(', ')})\n\n${loadedContent.join('\n\n---\n\n')}`;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Detect and load module rules for the current session
 */
export async function detectAndLoadModuleRules(config: ModuleRulesConfig): Promise<string | null> {
  try {
    // 1. Load indices from both levels
    const userIndex = await loadReferenceIndex(config.userDir);
    const projectIndex = await loadReferenceIndex(config.projectDir);

    if (!userIndex && !projectIndex) {
      return null; // No module rules configured
    }

    // 2. Merge indices
    const mergedIndex = mergeIndices(userIndex, projectIndex);

    if (Object.keys(mergedIndex).length === 0) {
      return null;
    }

    // 3. Run detection
    const detected = await detectModules(mergedIndex, config.cwd, config.prompt);

    if (detected.length === 0) {
      return null; // No modules detected for current context
    }

    // 4. Load and combine reference content
    const content = await loadReferences(detected);

    return content || null;
  } catch (error) {
    console.error('[ModuleRules] Detection error:', error);
    return null;
  }
}

// ============================================================================
// Exports for CLI
// ============================================================================

export { parseFrontmatter };
