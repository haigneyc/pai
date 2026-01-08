#!/usr/bin/env bun
/**
 * PaiInvestigate.ts - Repository Signal Collector for Investigation
 *
 * Collects deterministic repository signals for use with Claude Code's Task tool.
 * Does NOT call the API directly - outputs signals/prompt for the main agent to use.
 *
 * Usage:
 *   bun PaiInvestigate.ts --repo . --question "How should I implement X?"
 *   bun PaiInvestigate.ts --repo . --question "Architecture?" --output prompt
 *   bun PaiInvestigate.ts --repo . --question "test" --output signals
 *
 * The main agent then uses the Task tool with the generated prompt.
 */

import { parseArgs } from 'util';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { collectRepoSignals } from './Collect';
import { buildInvestigatorPrompt } from './Prompts';

type OutputMode = 'signals' | 'prompt' | 'both';

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      repo: { type: 'string', short: 'r' },
      question: { type: 'string', short: 'q' },
      focus: { type: 'string', short: 'f' },
      'max-files': { type: 'string' },
      output: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });

  // Show help
  if (values.help || !values.repo || !values.question) {
    printHelp();
    process.exit(values.help ? 0 : 1);
  }

  // Parse options
  const repoRoot = resolve(values.repo);
  const question = values.question;
  const maxFiles = values['max-files'] ? parseInt(values['max-files'], 10) : 50;
  const focus = values.focus?.split(',').map(s => s.trim()) || [];
  const outputMode = (values.output as OutputMode) || 'both';

  // Validate repo exists
  if (!existsSync(repoRoot)) {
    console.error(`[Investigator] Error: Repository not found: ${repoRoot}`);
    process.exit(1);
  }

  console.error(`[Investigator] Analyzing repository: ${repoRoot}`);
  console.error(`[Investigator] Question: ${question}`);

  // =========================================================================
  // Collect Repository Signals (Deterministic - No LLM)
  // =========================================================================

  console.error('[Investigator] Collecting repository signals...');
  const startCollect = Date.now();

  const signals = await collectRepoSignals(repoRoot, {
    maxFiles,
    focus,
    maxFileSize: 32 * 1024,
    treeDepth: 5
  });

  const collectTime = Date.now() - startCollect;
  console.error(`[Investigator] Collected signals in ${collectTime}ms`);
  console.error(`[Investigator]   - ${signals.entrypoints.length} entrypoint files`);
  console.error(`[Investigator]   - ${signals.grepPointers.filter(g => g.matchCount > 0).length} pattern categories with matches`);
  console.error(`[Investigator]   - ${signals.fileTree.totalFiles} files, ${signals.fileTree.totalDirs} directories`);

  // =========================================================================
  // Build Prompt for Task Tool
  // =========================================================================

  const prompt = buildInvestigatorPrompt(signals, question);
  const estimatedTokens = Math.ceil(prompt.length / 4);
  console.error(`[Investigator] Prompt size: ~${estimatedTokens} tokens (estimated)`);

  // =========================================================================
  // Output
  // =========================================================================

  if (outputMode === 'signals') {
    console.log(JSON.stringify(signals, null, 2));
  } else if (outputMode === 'prompt') {
    console.log(prompt);
  } else {
    // 'both' - output structured object
    console.log(JSON.stringify({
      question,
      repoRoot,
      collectedAt: signals.meta.collectedAt,
      stats: {
        files: signals.fileTree.totalFiles,
        directories: signals.fileTree.totalDirs,
        entrypoints: signals.entrypoints.length,
        patternMatches: signals.grepPointers.filter(g => g.matchCount > 0).length
      },
      signals,
      prompt
    }, null, 2));
  }

  console.error('[Investigator] Done. Use the prompt with Claude Code Task tool.');
}

function printHelp() {
  console.log(`
PAI Investigator - Repository Signal Collector

Collects deterministic repository signals for investigation.
Output is used with Claude Code's Task tool for analysis.

Usage:
  bun PaiInvestigate.ts --repo <path> --question <string> [options]

Required:
  -r, --repo <path>        Repository root to investigate
  -q, --question <string>  Investigation question

Options:
  -f, --focus <paths>      Comma-separated paths to focus on
  --max-files <n>          Max matches per grep pattern (default: 50)
  -o, --output <mode>      Output mode: signals, prompt, both (default: both)
  -h, --help               Show this help

Output Modes:
  signals    Output raw collected signals as JSON
  prompt     Output the investigation prompt for Task tool
  both       Output signals + prompt in structured JSON

Examples:
  # Get signals + prompt (default)
  bun PaiInvestigate.ts --repo . --question "How should I implement user auth?"

  # Get just the prompt for Task tool
  bun PaiInvestigate.ts --repo . --question "API structure?" --output prompt

  # Get just the signals
  bun PaiInvestigate.ts --repo . --question "test" --output signals

Workflow:
  1. Run this tool to collect signals and generate prompt
  2. Use Claude Code's Task tool with the generated prompt
  3. The Task agent analyzes and returns structured findings
`);
}

if (import.meta.main) {
  main().catch(error => {
    console.error(`[Investigator] Fatal: ${error.message}`);
    process.exit(1);
  });
}
