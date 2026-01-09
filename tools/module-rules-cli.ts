#!/usr/bin/env bun
/**
 * module-rules-cli.ts
 *
 * CLI tool for managing module rules reference documentation.
 *
 * Usage:
 *   bun run $PAI_DIR/tools/module-rules-cli.ts --index [--user | --project]
 *   bun run $PAI_DIR/tools/module-rules-cli.ts --detect [--prompt "text"]
 *   bun run $PAI_DIR/tools/module-rules-cli.ts --list
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  loadReferenceIndex,
  mergeIndices,
  detectModules,
  loadReferences,
  parseFrontmatter,
  type ReferenceIndex,
  type ReferenceEntry,
} from '../hooks/lib/module-rules';

// ============================================================================
// Configuration
// ============================================================================

// Resolve real home directory (snap sandbox overrides HOME)
function getRealHome(): string {
  // Try to detect snap sandbox and use real home
  const snapHome = process.env.HOME || '';
  if (snapHome.includes('/snap/')) {
    const user = process.env.USER;
    if (user) return `/home/${user}`;
  }
  return process.env.HOME || homedir();
}

const USER_DIR = join(getRealHome(), '.claude');
const PROJECT_DIR = join(process.cwd(), '.claude');

// ============================================================================
// Commands
// ============================================================================

/**
 * Generate index.json from reference markdown files
 */
async function generateIndex(dir: string, label: string): Promise<void> {
  const referencesDir = join(dir, 'references');

  if (!existsSync(referencesDir)) {
    console.log(`Creating ${referencesDir}...`);
    mkdirSync(referencesDir, { recursive: true });
  }

  const files = readdirSync(referencesDir).filter(f => f.endsWith('.md') && f !== 'README.md');

  if (files.length === 0) {
    console.log(`No reference files found in ${referencesDir}`);
    console.log('Create .md files with YAML frontmatter to define references.');
    return;
  }

  const index: ReferenceIndex = {};
  let successCount = 0;
  let errorCount = 0;

  console.log(`\nScanning ${label} references in ${referencesDir}...\n`);

  for (const file of files) {
    const filePath = join(referencesDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);

      if (!frontmatter.name) {
        console.log(`  [SKIP] ${file} - missing 'name' in frontmatter`);
        errorCount++;
        continue;
      }

      if (!frontmatter.triggers) {
        console.log(`  [SKIP] ${file} - missing 'triggers' in frontmatter`);
        errorCount++;
        continue;
      }

      const name = frontmatter.name.toLowerCase();
      index[name] = {
        name: frontmatter.name,
        path: filePath,
        description: frontmatter.description || '',
        triggers: frontmatter.triggers,
        priority: frontmatter.priority ?? 50,
        maxTokens: frontmatter.maxTokens ?? 2000,
        disabled: frontmatter.disabled,
        overrideTriggers: frontmatter.overrideTriggers,
      };

      const triggerCount =
        (frontmatter.triggers.filePatterns?.length || 0) +
        (frontmatter.triggers.imports?.length || 0) +
        (frontmatter.triggers.dependencies?.length || 0) +
        (frontmatter.triggers.keywords?.length || 0);

      console.log(`  [OK] ${frontmatter.name} (${triggerCount} triggers, priority ${index[name].priority})`);
      successCount++;
    } catch (error) {
      console.log(`  [ERROR] ${file} - ${error}`);
      errorCount++;
    }
  }

  const indexPath = join(referencesDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`\n${label} Index generated: ${indexPath}`);
  console.log(`  Success: ${successCount}, Errors: ${errorCount}`);
}

/**
 * Detect which modules match the current context
 */
async function detect(prompt?: string): Promise<void> {
  console.log('\nModule Rules Detection\n');
  console.log(`Working directory: ${process.cwd()}`);
  if (prompt) console.log(`Prompt: "${prompt}"`);
  console.log('');

  // Load indices
  const userIndex = await loadReferenceIndex(USER_DIR);
  const projectIndex = await loadReferenceIndex(PROJECT_DIR);

  if (!userIndex && !projectIndex) {
    console.log('No module rules configured.');
    console.log(`  User: ${join(USER_DIR, 'references')} - not found`);
    console.log(`  Project: ${join(PROJECT_DIR, 'references')} - not found`);
    console.log('\nRun --index to generate reference indices.');
    return;
  }

  console.log('Index Status:');
  console.log(`  User: ${userIndex ? Object.keys(userIndex).length + ' modules' : 'not found'}`);
  console.log(`  Project: ${projectIndex ? Object.keys(projectIndex).length + ' modules' : 'not found'}`);

  // Merge indices
  const mergedIndex = mergeIndices(userIndex, projectIndex);
  console.log(`  Merged: ${Object.keys(mergedIndex).length} modules\n`);

  // Run detection
  console.log('Running detection...\n');
  const detected = await detectModules(mergedIndex, process.cwd(), prompt);

  if (detected.length === 0) {
    console.log('No modules detected for current context.');
    console.log('\nAvailable modules:');
    for (const [name, ref] of Object.entries(mergedIndex)) {
      console.log(`  - ${name}: ${ref.description || 'No description'}`);
    }
    return;
  }

  console.log(`Detected ${detected.length} module(s):\n`);
  for (const result of detected) {
    console.log(`  [${result.priority}] ${result.module}`);
    console.log(`      Path: ${result.path}`);
    console.log(`      Triggers: ${result.triggers.join(', ')}`);
    console.log('');
  }

  // Show what would be loaded
  console.log('Content preview (first 200 chars per module):\n');
  for (const result of detected) {
    const content = readFileSync(result.path, 'utf-8');
    const { body } = parseFrontmatter(content);
    const preview = body.slice(0, 200).replace(/\n/g, ' ');
    console.log(`  ${result.module}: ${preview}...`);
  }
}

/**
 * List all configured references
 */
async function list(): Promise<void> {
  console.log('\nModule Rules - Configured References\n');

  const userIndex = await loadReferenceIndex(USER_DIR);
  const projectIndex = await loadReferenceIndex(PROJECT_DIR);

  if (userIndex && Object.keys(userIndex).length > 0) {
    console.log(`User (~/.claude/references):`);
    for (const [name, ref] of Object.entries(userIndex)) {
      const triggers = [];
      if (ref.triggers.filePatterns?.length) triggers.push(`${ref.triggers.filePatterns.length} file patterns`);
      if (ref.triggers.imports?.length) triggers.push(`${ref.triggers.imports.length} imports`);
      if (ref.triggers.dependencies?.length) triggers.push(`${ref.triggers.dependencies.length} deps`);
      if (ref.triggers.keywords?.length) triggers.push(`${ref.triggers.keywords.length} keywords`);

      console.log(`  [${ref.priority}] ${ref.name}`);
      console.log(`       ${ref.description || 'No description'}`);
      console.log(`       Triggers: ${triggers.join(', ')}`);
    }
  } else {
    console.log('User: No references configured');
  }

  console.log('');

  if (projectIndex && Object.keys(projectIndex).length > 0) {
    console.log(`Project (.claude/references):`);
    for (const [name, ref] of Object.entries(projectIndex)) {
      const triggers = [];
      if (ref.triggers.filePatterns?.length) triggers.push(`${ref.triggers.filePatterns.length} file patterns`);
      if (ref.triggers.imports?.length) triggers.push(`${ref.triggers.imports.length} imports`);
      if (ref.triggers.dependencies?.length) triggers.push(`${ref.triggers.dependencies.length} deps`);
      if (ref.triggers.keywords?.length) triggers.push(`${ref.triggers.keywords.length} keywords`);

      const status = ref.disabled ? '[DISABLED] ' : '';
      console.log(`  ${status}[${ref.priority}] ${ref.name}`);
      console.log(`       ${ref.description || 'No description'}`);
      console.log(`       Triggers: ${triggers.join(', ')}`);
    }
  } else {
    console.log('Project: No references configured');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Module Rules CLI

Usage:
  bun run module-rules-cli.ts --index [--user | --project]
    Generate index.json from reference markdown files.
    Default: generates both user and project indices.

  bun run module-rules-cli.ts --detect [--prompt "text"]
    Detect which modules match the current working directory.
    Optionally provide prompt text for keyword matching.

  bun run module-rules-cli.ts --list
    List all configured references from user and project levels.

Examples:
  bun run module-rules-cli.ts --index --user
  bun run module-rules-cli.ts --detect --prompt "setup supabase auth"
  bun run module-rules-cli.ts --list
`);
    return;
  }

  if (args.includes('--index')) {
    const userOnly = args.includes('--user');
    const projectOnly = args.includes('--project');

    if (!userOnly && !projectOnly) {
      // Both
      await generateIndex(USER_DIR, 'User');
      await generateIndex(PROJECT_DIR, 'Project');
    } else if (userOnly) {
      await generateIndex(USER_DIR, 'User');
    } else if (projectOnly) {
      await generateIndex(PROJECT_DIR, 'Project');
    }
    return;
  }

  if (args.includes('--detect')) {
    const promptIndex = args.indexOf('--prompt');
    const prompt = promptIndex >= 0 ? args[promptIndex + 1] : undefined;
    await detect(prompt);
    return;
  }

  if (args.includes('--list')) {
    await list();
    return;
  }

  console.log('Unknown command. Use --help for usage information.');
}

main().catch(console.error);
