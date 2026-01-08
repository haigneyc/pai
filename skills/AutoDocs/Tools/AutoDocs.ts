#!/usr/bin/env bun
/**
 * AutoDocs.ts - Template-Based Documentation Generator
 *
 * Main CLI tool for auto-generating README.md and docs/ARCHITECTURE.md.
 * Uses Handlebars templates with codebase analysis for consistent documentation.
 *
 * Usage:
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts pre-commit   # Git hook mode
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme       # Generate README only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture # Generate architecture only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full         # Generate all docs
 */

import Handlebars from 'handlebars';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

import { analyzeProject, type ProjectMetadata } from './CodeAnalyzer';
import { detectChanges, saveState, type AutoDocsState } from './ChangeDetector';
import { generateC4Diagrams, type C4Diagrams } from './C4Generator';

const PAI_DIR = process.env.PAI_DIR || process.env.PAI_HOME || join(process.env.HOME || '', 'pai');
const TEMPLATES_DIR = join(dirname(import.meta.path), '..', 'Templates');
const README_PATH = join(PAI_DIR, 'README.md');
const ARCHITECTURE_PATH = join(PAI_DIR, 'docs', 'ARCHITECTURE.md');

// Use full path to git because bun snap has restricted PATH
const GIT_PATH = '/usr/bin/git';
const STATE_FILE = join(PAI_DIR, '.autodocs-state.json');

// ============================================================================
// Template Registration
// ============================================================================

function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper('truncate', (str: string, len: number) => {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  });

  Handlebars.registerHelper('join', (arr: string[], sep: string) => {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof sep === 'string' ? sep : ', ');
  });

  Handlebars.registerHelper('now', () => new Date().toISOString().split('T')[0]);

  Handlebars.registerHelper('codeblock', (code: string, lang: string) => {
    const language = typeof lang === 'string' ? lang : '';
    return `\`\`\`${language}\n${code}\n\`\`\``;
  });

  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
}

async function loadTemplate(name: string): Promise<HandlebarsTemplateDelegate> {
  const templatePath = join(TEMPLATES_DIR, `${name}.hbs`);

  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const content = await readFile(templatePath, 'utf-8');
  return Handlebars.compile(content);
}

// ============================================================================
// README Generation
// ============================================================================

async function generateReadme(metadata: ProjectMetadata): Promise<string> {
  const templateData = {
    project: {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      runtime: metadata.runtime,
      paiDir: metadata.paiDir
    },
    skills: metadata.skills.map(s => ({
      name: s.name,
      description: s.description,
      hasTools: s.tools.length > 0,
      hasWorkflows: s.workflows.length > 0
    })),
    tools: [...metadata.tools, ...metadata.skills.flatMap(s => s.tools)].map(t => ({
      name: t.name,
      description: t.description,
      usage: t.usage,
      hasCommands: t.commands.length > 0,
      commands: t.commands
    })),
    hooks: metadata.hooks.map(h => ({
      name: h.name,
      description: h.description,
      events: h.eventTypes
    })),
    directories: metadata.directories,
    generatedAt: new Date().toISOString()
  };

  // Try to load template
  try {
    const template = await loadTemplate('README');
    return template(templateData);
  } catch {
    // Fallback to inline template if file doesn't exist
    return generateReadmeFallback(templateData);
  }
}

function generateReadmeFallback(data: any): string {
  const skillTable = data.skills
    .map((s: any) => `| ${s.name} | ${s.description.slice(0, 60)}${s.description.length > 60 ? '...' : ''} |`)
    .join('\n');

  const toolList = data.tools
    .slice(0, 10)
    .map((t: any) => `- **${t.name}**: ${t.description || 'CLI tool'}`)
    .join('\n');

  return `# ${data.project.name}

${data.project.description}

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code](https://claude.ai/code) CLI

### Installation

\`\`\`bash
# Clone the repository
git clone <repo-url>
cd pai

# Set environment variable
export PAI_DIR="$(pwd)"

# Install skill dependencies
cd skills/AutoDocs/Tools && bun install && cd -
cd skills/Prompting/Tools && bun install && cd -
\`\`\`

### First Run

\`\`\`bash
# Generate skill index
bun $PAI_DIR/tools/GenerateSkillIndex.ts

# Verify installation
bun $PAI_DIR/tools/PaiArchitecture.ts check
\`\`\`

## Skills

| Skill | Description |
|-------|-------------|
${skillTable}

## CLI Tools

${toolList}

## Project Structure

| Directory | Purpose | Files |
|-----------|---------|-------|
${data.directories.map((d: any) => `| ${d.name}/ | ${d.purpose} | ${d.files} |`).join('\n')}

---

*Documentation auto-generated by PAI AutoDocs on ${data.generatedAt.split('T')[0]}*
`;
}

// ============================================================================
// Architecture Generation
// ============================================================================

async function generateArchitecture(metadata: ProjectMetadata): Promise<string> {
  const diagrams = await generateC4Diagrams(metadata);

  const templateData = {
    project: {
      name: metadata.name,
      description: metadata.description,
      runtime: metadata.runtime
    },
    diagrams,
    skills: metadata.skills,
    hooks: metadata.hooks,
    tools: metadata.tools,
    directories: metadata.directories,
    generatedAt: new Date().toISOString()
  };

  // Try to load template
  try {
    const template = await loadTemplate('ArchitectureC4');
    return template(templateData);
  } catch {
    // Fallback to inline generation
    return generateArchitectureFallback(templateData, diagrams);
  }
}

function generateArchitectureFallback(data: any, diagrams: C4Diagrams): string {
  return `# PAI Architecture

> C4 Model documentation for Personal AI Infrastructure

**Last Updated:** ${data.generatedAt.split('T')[0]}

## Overview

${data.project.description}

**Runtime:** ${data.project.runtime}

## C4 Model Diagrams

### Level 1: System Context

Shows PAI in relation to users and external systems.

${diagrams.contextDiagram}

### Level 2: Container Diagram

Major subsystems within PAI.

${diagrams.containerDiagram}

### Level 3: Component Diagrams

Detailed breakdown of each container.

${diagrams.componentDiagrams.map(c => `#### ${c.name}\n\n${c.diagram}`).join('\n\n')}

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Templates | Handlebars |
| Diagrams | Mermaid |
| AI | Claude Code CLI |

## Key Components

### Skills System

Modular capability definitions loaded by Claude Code.

| Skill | Description |
|-------|-------------|
${data.skills.map((s: any) => `| ${s.name} | ${s.description.slice(0, 50)}... |`).join('\n')}

### Hook System

Event-driven automation triggered by Claude Code lifecycle events.

| Hook | Events |
|------|--------|
${data.hooks.map((h: any) => `| ${h.name} | ${h.eventTypes.join(', ') || 'Multiple'} |`).join('\n')}

---

*Architecture documentation auto-generated by PAI AutoDocs*
`;
}

// ============================================================================
// File Writing
// ============================================================================

async function writeReadme(content: string): Promise<void> {
  await writeFile(README_PATH, content);
  console.log(`[AutoDocs] Generated: ${README_PATH}`);
}

async function writeArchitecture(content: string): Promise<void> {
  const docsDir = dirname(ARCHITECTURE_PATH);
  if (!existsSync(docsDir)) {
    await mkdir(docsDir, { recursive: true });
  }
  await writeFile(ARCHITECTURE_PATH, content);
  console.log(`[AutoDocs] Generated: ${ARCHITECTURE_PATH}`);
}

async function getFileHash(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  try {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

async function updateState(readmeUpdated: boolean, archUpdated: boolean): Promise<void> {
  const state: AutoDocsState = {
    lastReadmeGeneration: readmeUpdated ? new Date().toISOString() : '',
    lastArchitectureGeneration: archUpdated ? new Date().toISOString() : '',
    lastCommitHash: '',
    filesAtLastGeneration: {},
    lastAnalyzedFiles: []
  };

  // Get current commit hash (from env if available, since bun snap can't access git)
  state.lastCommitHash = process.env.AUTODOCS_COMMIT_HASH || '';
  if (!state.lastCommitHash) {
    try {
      const proc = Bun.spawn([GIT_PATH, 'rev-parse', 'HEAD'], {
        cwd: PAI_DIR,
        stdout: 'pipe'
      });
      state.lastCommitHash = (await new Response(proc.stdout).text()).trim();
    } catch {
      // Ignore git errors
    }
  }

  // Store file hashes
  if (readmeUpdated) {
    const hash = await getFileHash(README_PATH);
    if (hash) state.filesAtLastGeneration['README.md'] = hash;
  }
  if (archUpdated) {
    const hash = await getFileHash(ARCHITECTURE_PATH);
    if (hash) state.filesAtLastGeneration['docs/ARCHITECTURE.md'] = hash;
  }

  await saveState(state);
}

// ============================================================================
// Main Commands
// ============================================================================

async function runPreCommit(): Promise<void> {
  console.log('[AutoDocs] Running pre-commit check...');

  try {
    const changes = await detectChanges();

    if (!changes.needsReadmeUpdate && !changes.needsArchitectureUpdate) {
      console.log('[AutoDocs] No documentation updates needed');
      return;
    }

    console.log('[AutoDocs] Changes detected:');
    for (const trigger of changes.triggers) {
      console.log(`  - ${trigger}`);
    }

    const metadata = await analyzeProject();

    if (changes.needsReadmeUpdate) {
      const readme = await generateReadme(metadata);
      await writeReadme(readme);
    }

    if (changes.needsArchitectureUpdate) {
      const arch = await generateArchitecture(metadata);
      await writeArchitecture(arch);
    }

    await updateState(changes.needsReadmeUpdate, changes.needsArchitectureUpdate);

  } catch (error) {
    // Pre-commit should never block - log and continue
    console.error(`[AutoDocs] Warning: ${(error as Error).message}`);
    console.error('[AutoDocs] Skipping doc generation - commit will proceed');
  }
}

async function runReadme(): Promise<void> {
  console.log('[AutoDocs] Generating README.md...');
  const metadata = await analyzeProject();
  const readme = await generateReadme(metadata);
  await writeReadme(readme);
  await updateState(true, false);
}

async function runArchitecture(): Promise<void> {
  console.log('[AutoDocs] Generating docs/ARCHITECTURE.md...');
  const metadata = await analyzeProject();
  const arch = await generateArchitecture(metadata);
  await writeArchitecture(arch);
  await updateState(false, true);
}

async function runFull(): Promise<void> {
  console.log('[AutoDocs] Generating all documentation...');
  const metadata = await analyzeProject();

  const [readme, arch] = await Promise.all([
    generateReadme(metadata),
    generateArchitecture(metadata)
  ]);

  await writeReadme(readme);
  await writeArchitecture(arch);
  await updateState(true, true);

  console.log('[AutoDocs] Documentation generation complete');
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  registerHandlebarsHelpers();

  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'pre-commit':
      await runPreCommit();
      break;

    case 'readme':
      await runReadme();
      break;

    case 'architecture':
    case 'arch':
      await runArchitecture();
      break;

    case 'full':
    case 'all':
      await runFull();
      break;

    case 'help':
    default:
      console.log(`
AutoDocs - Template-Based Documentation Generator

Usage:
  bun AutoDocs.ts <command>

Commands:
  pre-commit    Git hook mode (auto-detects what needs updating)
  readme        Generate README.md only
  architecture  Generate docs/ARCHITECTURE.md only
  full          Generate all documentation

Examples:
  bun AutoDocs.ts full              # Generate all docs
  bun AutoDocs.ts readme            # Generate README only
  bun AutoDocs.ts pre-commit        # Run in git hook mode
`);
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(`[AutoDocs] Error: ${error.message}`);
    process.exit(1);
  });
}
