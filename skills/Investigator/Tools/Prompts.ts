/**
 * Prompts.ts - Fixed Investigator Prompt Template
 *
 * Builds a stable, deterministic prompt for the investigation subagent.
 * The prompt structure never changes - only the repo signals are injected.
 */

import type { RepoSignals, GrepPointer } from './Schema';

/**
 * Build the complete investigator prompt with repo signals injected
 */
export function buildInvestigatorPrompt(signals: RepoSignals, question: string): string {
  return `# Role: Repository Investigator

You are a repository investigator analyzing a codebase to answer a specific question. Your job is to provide structured analysis based on the repository signals provided below.

## CRITICAL RULES

1. **You do NOT implement changes.** You only investigate and report findings.
2. **Every claim MUST cite a specific file path** from the signals provided.
3. **Output ONLY valid JSON** matching the schema below. No markdown fences, no explanation.
4. **Do not hallucinate files or paths.** Only reference files mentioned in the signals.
5. **Stay within limits:** max 5 architecture findings, max 8 implementation pointers, max 5 risks, max 5 next steps.

## Output JSON Schema

Return a single JSON object with exactly this structure:

{
  "executiveSummary": "2-3 sentence summary of the repo and how it relates to the question",
  "repoMap": {
    "primaryLanguage": "TypeScript|Python|Go|Rust|Java|etc",
    "framework": "framework name or null if none detected",
    "architecture": "monolith|modular|microservices|library|cli|etc",
    "keyDirectories": [
      {"path": "src/", "purpose": "what this dir contains", "citedFile": "file that proves this"}
    ]
  },
  "buildRunTest": {
    "buildCommand": "command to build or null",
    "runCommand": "command to run or null",
    "testCommand": "command to run tests or null",
    "prerequisites": ["list of required tools/setup"],
    "notes": "any important notes about running the project"
  },
  "architectureFindings": [
    {
      "title": "short title",
      "description": "explanation (max 100 words)",
      "citedFiles": ["file1.ts", "file2.ts"],
      "confidence": "high|medium|low"
    }
  ],
  "implementationPointers": [
    {
      "area": "area of the codebase relevant to the question",
      "relevantFiles": ["file1.ts", "file2.ts"],
      "approach": "suggested approach based on patterns seen",
      "citedFile": "primary file that informs this"
    }
  ],
  "risks": [
    {
      "title": "risk title",
      "severity": "high|medium|low",
      "description": "what the risk is",
      "citedFile": "file that evidences this risk (optional)"
    }
  ],
  "nextSteps": [
    "First thing to do",
    "Second thing to do"
  ]
}

## Repository Signals

${formatMetaSection(signals)}

${formatFileTreeSection(signals)}

${formatEntrypointsSection(signals)}

${formatGrepSection(signals)}

## Investigation Question

${question}

## Your Response

Output ONLY the JSON object. No markdown fences. No commentary before or after.`;
}

// ============================================================================
// Section Formatters
// ============================================================================

function formatMetaSection(signals: RepoSignals): string {
  const meta = signals.meta;
  return `### Metadata

- **Repository:** ${meta.repoName}
- **Root Path:** ${meta.root}
- **Git Branch:** ${meta.gitBranch || 'unknown'}
- **Dirty:** ${meta.gitDirty ? 'yes (uncommitted changes)' : 'no'}
- **Collected:** ${meta.collectedAt}`;
}

function formatFileTreeSection(signals: RepoSignals): string {
  const tree = signals.fileTree;
  let content = `### File Tree (depth ${tree.depth}, ${tree.totalFiles} files, ${tree.totalDirs} directories)`;

  if (tree.truncated) {
    content += '\n*(Tree truncated due to size)*';
  }

  content += `\n\n\`\`\`\n${tree.tree}\`\`\``;

  return content;
}

function formatEntrypointsSection(signals: RepoSignals): string {
  if (signals.entrypoints.length === 0) {
    return '### Entrypoint Files\n\n*No standard entrypoint files found.*';
  }

  let content = '### Entrypoint Files\n';

  for (const entry of signals.entrypoints) {
    content += `\n#### ${entry.path}\n`;
    content += `**Purpose:** ${entry.purpose}\n`;
    content += `**Size:** ${entry.sizeBytes} bytes${entry.truncated ? ' (truncated)' : ''}\n`;
    content += `\n\`\`\`\n${entry.contentPreview}`;
    if (entry.truncated) {
      content += '\n... [truncated]';
    }
    content += '\n```\n';
  }

  return content;
}

function formatGrepSection(signals: RepoSignals): string {
  const patternsWithMatches = signals.grepPointers.filter(p => p.matchCount > 0);

  if (patternsWithMatches.length === 0) {
    return '### Pattern Matches\n\n*No pattern matches found.*';
  }

  let content = '### Pattern Matches\n';

  // Group by category
  const byCategory: Record<string, GrepPointer[]> = {};
  for (const pointer of patternsWithMatches) {
    if (!byCategory[pointer.category]) {
      byCategory[pointer.category] = [];
    }
    byCategory[pointer.category].push(pointer);
  }

  for (const [category, pointers] of Object.entries(byCategory)) {
    content += `\n#### ${capitalize(category)}\n`;

    for (const pointer of pointers) {
      content += `\n**Pattern:** \`${pointer.pattern}\` (${pointer.matchCount} matches)\n`;

      for (const match of pointer.matches.slice(0, 5)) {
        content += `- \`${match.file}:${match.line}\`: ${truncate(match.content, 100)}\n`;
      }

      if (pointer.matches.length > 5) {
        content += `- *(${pointer.matches.length - 5} more matches)*\n`;
      }
    }
  }

  return content;
}

// ============================================================================
// Helpers
// ============================================================================

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

/**
 * Build a repair prompt for when the initial response fails validation
 */
export function buildRepairPrompt(
  originalPrompt: string,
  validationErrors: string[]
): string {
  return `${originalPrompt}

---

**IMPORTANT: Your previous response failed validation with these errors:**

${validationErrors.map(e => `- ${e}`).join('\n')}

Please output ONLY a valid JSON object that fixes these errors. No markdown fences. No explanation.`;
}
