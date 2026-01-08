#!/usr/bin/env bun
/**
 * CodeAnalyzer.ts - Extract project metadata for documentation generation
 *
 * Scans the PAI codebase to extract structured information about:
 * - Skills and their workflows
 * - Hooks and their event types
 * - CLI tools and their usage
 * - Configuration files
 *
 * Usage:
 *   bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts          # Output JSON
 *   bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts --pretty # Pretty print
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

const PAI_DIR = process.env.PAI_DIR || process.env.PAI_HOME || join(process.env.HOME || '', 'pai');

// ============================================================================
// Type Definitions
// ============================================================================

export interface WorkflowInfo {
  name: string;
  trigger: string;
  file: string;
}

export interface ToolInfo {
  name: string;
  file: string;
  description: string;
  usage: string;
  commands: string[];
}

export interface SkillInfo {
  name: string;
  path: string;
  description: string;
  triggers: string[];
  workflows: WorkflowInfo[];
  tools: ToolInfo[];
}

export interface HookInfo {
  name: string;
  file: string;
  eventTypes: string[];
  description: string;
}

export interface ConfigInfo {
  name: string;
  file: string;
  keys: string[];
}

export interface ProjectMetadata {
  name: string;
  description: string;
  version: string;
  runtime: string;
  paiDir: string;
  skills: SkillInfo[];
  hooks: HookInfo[];
  tools: ToolInfo[];
  configs: ConfigInfo[];
  directories: {
    name: string;
    purpose: string;
    files: number;
  }[];
  lastAnalyzed: string;
}

// ============================================================================
// Skill Analysis
// ============================================================================

async function parseSkillFrontmatter(content: string): Promise<{ name: string; description: string }> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { name: '', description: '' };
  }

  try {
    const yaml = parseYaml(frontmatterMatch[1]) as { name?: string; description?: string };
    return {
      name: yaml.name || '',
      description: yaml.description || ''
    };
  } catch {
    return { name: '', description: '' };
  }
}

function extractWorkflowsFromSkill(content: string): WorkflowInfo[] {
  const workflows: WorkflowInfo[] = [];

  // Match workflow routing table rows: | **WorkflowName** | "trigger" | `file` |
  const tableRegex = /\|\s*\*\*(\w+)\*\*\s*\|\s*"([^"]+)"\s*\|\s*`([^`]+)`\s*\|/g;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    workflows.push({
      name: match[1],
      trigger: match[2],
      file: match[3]
    });
  }

  return workflows;
}

function extractTriggersFromDescription(description: string): string[] {
  // Extract triggers from "USE WHEN" clause
  const useWhenMatch = description.match(/USE WHEN\s+(.+?)(?:\.|$)/i);
  if (!useWhenMatch) return [];

  return useWhenMatch[1]
    .split(/\s+OR\s+/i)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);
}

async function analyzeSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  const skillsDir = join(PAI_DIR, 'skills');

  if (!existsSync(skillsDir)) return skills;

  const entries = await readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const content = await readFile(skillFile, 'utf-8');
    const { name, description } = await parseSkillFrontmatter(content);
    const workflows = extractWorkflowsFromSkill(content);
    const triggers = extractTriggersFromDescription(description);

    // Scan for tools in this skill
    const toolsDir = join(skillsDir, entry.name, 'Tools');
    const skillTools: ToolInfo[] = [];

    if (existsSync(toolsDir)) {
      const toolFiles = await readdir(toolsDir);
      for (const toolFile of toolFiles) {
        if (toolFile.endsWith('.ts') && !toolFile.startsWith('.')) {
          const toolPath = join(toolsDir, toolFile);
          const toolContent = await readFile(toolPath, 'utf-8');
          const toolInfo = extractToolInfo(toolFile, toolPath, toolContent);
          if (toolInfo) skillTools.push(toolInfo);
        }
      }
    }

    skills.push({
      name: name || entry.name,
      path: `skills/${entry.name}/SKILL.md`,
      description,
      triggers,
      workflows,
      tools: skillTools
    });
  }

  return skills;
}

// ============================================================================
// Tool Analysis
// ============================================================================

function extractToolInfo(fileName: string, filePath: string, content: string): ToolInfo | null {
  // Skip non-tool files
  if (fileName === 'package.json' || fileName.endsWith('.d.ts')) return null;

  const name = basename(fileName, '.ts');

  // Extract JSDoc description
  const jsdocMatch = content.match(/\/\*\*\s*\n([^*]|\*[^/])*\*\//);
  let description = '';
  let usage = '';
  const commands: string[] = [];

  if (jsdocMatch) {
    const jsdoc = jsdocMatch[0];

    // Extract first line as description
    const descMatch = jsdoc.match(/\*\s+(\w[^\n*]+)/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // Extract usage examples
    const usageMatch = jsdoc.match(/Usage:\s*\n([\s\S]*?)(?:\n\s*\*\s*\n|\*\/)/);
    if (usageMatch) {
      usage = usageMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*\*\s*/, '').trim())
        .filter(l => l.length > 0)
        .join('\n');
    }
  }

  // Extract CLI commands from switch statements
  const switchMatch = content.match(/switch\s*\([^)]+\)\s*\{([\s\S]*?)\n\s*default:/);
  if (switchMatch) {
    const caseMatches = switchMatch[1].matchAll(/case\s*['"](\w+)['"]/g);
    for (const match of caseMatches) {
      commands.push(match[1]);
    }
  }

  return {
    name,
    file: filePath.replace(PAI_DIR + '/', ''),
    description,
    usage,
    commands
  };
}

async function analyzeTools(): Promise<ToolInfo[]> {
  const tools: ToolInfo[] = [];
  const toolsDir = join(PAI_DIR, 'tools');

  if (!existsSync(toolsDir)) return tools;

  const entries = await readdir(toolsDir);

  for (const entry of entries) {
    if (!entry.endsWith('.ts') || entry.startsWith('.')) continue;

    const toolPath = join(toolsDir, entry);
    const content = await readFile(toolPath, 'utf-8');
    const toolInfo = extractToolInfo(entry, toolPath, content);
    if (toolInfo) tools.push(toolInfo);
  }

  return tools;
}

// ============================================================================
// Hook Analysis
// ============================================================================

async function analyzeHooks(): Promise<HookInfo[]> {
  const hooks: HookInfo[] = [];
  const hooksDir = join(PAI_DIR, 'hooks');

  if (!existsSync(hooksDir)) return hooks;

  const entries = await readdir(hooksDir);

  for (const entry of entries) {
    if (!entry.endsWith('.ts') || entry.startsWith('.')) continue;
    // Skip lib directory files
    if (entry === 'lib') continue;

    const hookPath = join(hooksDir, entry);
    const content = await readFile(hookPath, 'utf-8');

    // Extract event types from the hook
    const eventTypes: string[] = [];
    const eventMatch = content.match(/event_type['"]?\s*[=:]\s*['"](\w+)['"]/gi);
    if (eventMatch) {
      for (const match of eventMatch) {
        const type = match.match(/['"](\w+)['"]/);
        if (type && !eventTypes.includes(type[1])) {
          eventTypes.push(type[1]);
        }
      }
    }

    // Also check for event types in function parameters or comments
    const knownEvents = ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit'];
    for (const event of knownEvents) {
      if (content.includes(event) && !eventTypes.includes(event)) {
        eventTypes.push(event);
      }
    }

    // Extract description from JSDoc or first comment
    let description = '';
    const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*([^\n]+)/);
    if (jsdocMatch) {
      description = jsdocMatch[1].trim();
    }

    hooks.push({
      name: basename(entry, '.ts'),
      file: `hooks/${entry}`,
      eventTypes,
      description
    });
  }

  return hooks;
}

// ============================================================================
// Config Analysis
// ============================================================================

async function analyzeConfigs(): Promise<ConfigInfo[]> {
  const configs: ConfigInfo[] = [];
  const configDir = join(PAI_DIR, 'config');

  if (!existsSync(configDir)) return configs;

  const entries = await readdir(configDir);

  for (const entry of entries) {
    if (!entry.endsWith('.json') || entry.startsWith('.')) continue;

    const configPath = join(configDir, entry);
    const content = await readFile(configPath, 'utf-8');

    try {
      const json = JSON.parse(content);
      const keys = Object.keys(json);

      configs.push({
        name: basename(entry, '.json'),
        file: `config/${entry}`,
        keys
      });
    } catch {
      // Skip invalid JSON
    }
  }

  return configs;
}

// ============================================================================
// Directory Analysis
// ============================================================================

async function analyzeDirectories(): Promise<{ name: string; purpose: string; files: number }[]> {
  const dirs = [
    { name: 'skills', purpose: 'Modular skill definitions and workflows' },
    { name: 'hooks', purpose: 'Event-driven automation handlers' },
    { name: 'tools', purpose: 'Standalone CLI utilities' },
    { name: 'config', purpose: 'System configuration files' },
    { name: 'history', purpose: 'Session and activity tracking' },
    { name: 'observability', purpose: 'Monitoring and dashboard' },
    { name: 'docs', purpose: 'Generated documentation' }
  ];

  const result = [];

  for (const dir of dirs) {
    const dirPath = join(PAI_DIR, dir.name);
    if (existsSync(dirPath)) {
      try {
        const entries = await readdir(dirPath);
        result.push({
          name: dir.name,
          purpose: dir.purpose,
          files: entries.filter(e => !e.startsWith('.')).length
        });
      } catch {
        result.push({ ...dir, files: 0 });
      }
    }
  }

  return result;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export async function analyzeProject(): Promise<ProjectMetadata> {
  const [skills, hooks, tools, configs, directories] = await Promise.all([
    analyzeSkills(),
    analyzeHooks(),
    analyzeTools(),
    analyzeConfigs(),
    analyzeDirectories()
  ]);

  return {
    name: 'PAI',
    description: 'Personal AI Infrastructure - Modular AI assistant with skills, hooks, and observability',
    version: '1.0.0',
    runtime: 'Bun',
    paiDir: PAI_DIR,
    skills,
    hooks,
    tools,
    configs,
    directories,
    lastAnalyzed: new Date().toISOString()
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const pretty = args.includes('--pretty') || args.includes('-p');

  const metadata = await analyzeProject();

  if (pretty) {
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    console.log(JSON.stringify(metadata));
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
