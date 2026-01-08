#!/usr/bin/env bun
/**
 * AutoDocs.ts - AI-Assisted Documentation Generator
 *
 * Main CLI tool for auto-generating README.md and docs/ARCHITECTURE.md.
 * Uses Claude API for intelligent content generation based on codebase analysis.
 *
 * Usage:
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts pre-commit   # Git hook mode
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme       # Generate README only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture # Generate architecture only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full         # Generate all docs
 *   bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full --no-ai # Template-only mode
 */

import Anthropic from '@anthropic-ai/sdk';
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

// Timeout for AI generation (60 seconds)
const AI_TIMEOUT = 60000;

// ============================================================================
// Anthropic Client
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

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
// AI-Assisted Generation
// ============================================================================

async function generateWithAI(prompt: string, maxTokens: number = 4096): Promise<string> {
  const client = getAnthropicClient();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    clearTimeout(timeout);

    const textBlock = message.content.find(block => block.type === 'text');
    return textBlock ? textBlock.text : '';
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new Error('AI generation timed out');
    }
    throw error;
  }
}

// ============================================================================
// README Generation
// ============================================================================

async function generateReadme(metadata: ProjectMetadata, useAI: boolean = true): Promise<string> {
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
  let baseContent: string;
  try {
    const template = await loadTemplate('README');
    baseContent = template(templateData);
  } catch {
    // Fallback to inline template if file doesn't exist
    baseContent = generateReadmeFallback(templateData);
  }

  // If AI is enabled, enhance the content
  if (useAI && process.env.ANTHROPIC_API_KEY) {
    try {
      const enhancedContent = await enhanceReadmeWithAI(baseContent, metadata);
      return enhancedContent;
    } catch (error) {
      console.warn(`[AutoDocs] AI enhancement failed: ${(error as Error).message}`);
      console.warn('[AutoDocs] Using template-only output');
    }
  }

  return baseContent;
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
- Anthropic API key

### Installation

\`\`\`bash
# Clone the repository
git clone <repo-url>
cd pai

# Set environment variables
export PAI_DIR="$(pwd)"
export ANTHROPIC_API_KEY="your-api-key"

# Install dependencies (if any)
cd skills/AutoDocs/Tools && bun install && cd -
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

async function enhanceReadmeWithAI(baseContent: string, metadata: ProjectMetadata): Promise<string> {
  const prompt = `You are a technical writer improving documentation for a developer tool.

Below is auto-generated README content for "PAI" (Personal AI Infrastructure), a modular AI assistant system.

Please enhance this README by:
1. Improving the Quick Start section to be clearer and more actionable
2. Adding a brief "Features" section highlighting key capabilities
3. Ensuring the CLI tool descriptions are clear and useful
4. Adding any missing sections that would help developers get started

Keep the same overall structure and markdown formatting. Keep it concise - developers prefer short, scannable docs.

IMPORTANT: Return ONLY the enhanced markdown content, no explanation or commentary.

---

Current README:

${baseContent}

---

Additional context about the project:
- Runtime: ${metadata.runtime}
- Skills installed: ${metadata.skills.map(s => s.name).join(', ')}
- Hooks active: ${metadata.hooks.length}
- Primary use: AI-assisted coding with Claude Code CLI`;

  const enhanced = await generateWithAI(prompt, 4096);
  return enhanced || baseContent;
}

// ============================================================================
// Architecture Generation
// ============================================================================

async function generateArchitecture(metadata: ProjectMetadata, useAI: boolean = true): Promise<string> {
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
  let baseContent: string;
  try {
    const template = await loadTemplate('ArchitectureC4');
    baseContent = template(templateData);
  } catch {
    // Fallback to inline generation
    baseContent = generateArchitectureFallback(templateData, diagrams);
  }

  // If AI is enabled, enhance the architecture description
  if (useAI && process.env.ANTHROPIC_API_KEY) {
    try {
      const enhancedContent = await enhanceArchitectureWithAI(baseContent, metadata, diagrams);
      return enhancedContent;
    } catch (error) {
      console.warn(`[AutoDocs] AI enhancement failed: ${(error as Error).message}`);
      console.warn('[AutoDocs] Using template-only output');
    }
  }

  return baseContent;
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
| AI | Anthropic Claude API |

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

async function enhanceArchitectureWithAI(baseContent: string, metadata: ProjectMetadata, diagrams: C4Diagrams): Promise<string> {
  const prompt = `You are a software architect writing C4 model documentation.

Below is auto-generated architecture documentation for "PAI" (Personal AI Infrastructure).

Please enhance this documentation by:
1. Adding a brief architectural overview explaining the design philosophy
2. Improving the descriptions of each component/container
3. Adding a "Data Flow" section explaining how data moves through the system
4. Adding any architectural decisions or trade-offs worth noting

Keep the C4 diagrams exactly as they are (don't modify the mermaid code blocks).
Keep the document well-structured and scannable.

IMPORTANT: Return ONLY the enhanced markdown content, no explanation or commentary.

---

Current Architecture Doc:

${baseContent}`;

  const enhanced = await generateWithAI(prompt, 8192);
  return enhanced || baseContent;
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

async function runReadme(useAI: boolean = true): Promise<void> {
  console.log('[AutoDocs] Generating README.md...');
  const metadata = await analyzeProject();
  const readme = await generateReadme(metadata, useAI);
  await writeReadme(readme);
  await updateState(true, false);
}

async function runArchitecture(useAI: boolean = true): Promise<void> {
  console.log('[AutoDocs] Generating docs/ARCHITECTURE.md...');
  const metadata = await analyzeProject();
  const arch = await generateArchitecture(metadata, useAI);
  await writeArchitecture(arch);
  await updateState(false, true);
}

async function runFull(useAI: boolean = true): Promise<void> {
  console.log('[AutoDocs] Generating all documentation...');
  const metadata = await analyzeProject();

  const [readme, arch] = await Promise.all([
    generateReadme(metadata, useAI),
    generateArchitecture(metadata, useAI)
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
  const noAI = args.includes('--no-ai');

  switch (command) {
    case 'pre-commit':
      await runPreCommit();
      break;

    case 'readme':
      await runReadme(!noAI);
      break;

    case 'architecture':
    case 'arch':
      await runArchitecture(!noAI);
      break;

    case 'full':
    case 'all':
      await runFull(!noAI);
      break;

    case 'help':
    default:
      console.log(`
AutoDocs - AI-Assisted Documentation Generator

Usage:
  bun AutoDocs.ts <command> [options]

Commands:
  pre-commit    Git hook mode (auto-detects what needs updating)
  readme        Generate README.md only
  architecture  Generate docs/ARCHITECTURE.md only
  full          Generate all documentation

Options:
  --no-ai       Skip AI enhancement, use templates only

Examples:
  bun AutoDocs.ts full              # Generate all docs with AI
  bun AutoDocs.ts readme --no-ai    # Generate README without AI
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
