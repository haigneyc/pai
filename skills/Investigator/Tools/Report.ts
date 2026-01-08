/**
 * Report.ts - Investigation Report Storage and Rendering
 *
 * Handles:
 * - Saving reports to docs/investigation/
 * - Timestamped archival
 * - Optional markdown rendering
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { InvestigationReport, RepoSignals, InvestigationReportContent } from './Schema';

const DEFAULT_OUTPUT_DIR = 'docs/investigation';

export interface SaveOptions {
  outputPath?: string;
  format?: 'json' | 'md' | 'both';
  includeSignals?: boolean;
}

export interface SaveResult {
  jsonPath: string;
  mdPath?: string;
  archivedPath?: string;
}

/**
 * Save investigation report to filesystem
 */
export async function saveReport(
  reportContent: InvestigationReportContent,
  signals: RepoSignals,
  question: string,
  meta: { modelUsed: string; tokensUsed: number },
  options: SaveOptions = {}
): Promise<SaveResult> {
  const repoRoot = signals.meta.root;
  const outputDir = join(repoRoot, DEFAULT_OUTPUT_DIR);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Build full report with metadata
  const fullReport: InvestigationReport = {
    meta: {
      repoRoot: signals.meta.root,
      question,
      generatedAt: new Date().toISOString(),
      modelUsed: meta.modelUsed,
      tokensUsed: meta.tokensUsed
    },
    ...reportContent
  };

  // Optionally include raw signals for reproducibility
  const reportWithSignals = options.includeSignals
    ? { ...fullReport, _signals: signals }
    : fullReport;

  // Generate paths
  const timestamp = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const slug = generateSlug(reportContent.executiveSummary);
  const latestPath = join(outputDir, 'latest.json');
  const archivedPath = join(outputDir, `${timestamp}_${slug}.json`);

  // Write JSON files
  await writeFile(latestPath, JSON.stringify(reportWithSignals, null, 2));
  await writeFile(archivedPath, JSON.stringify(reportWithSignals, null, 2));

  const result: SaveResult = {
    jsonPath: latestPath,
    archivedPath
  };

  // Generate markdown if requested
  if (options.format === 'md' || options.format === 'both') {
    const mdContent = renderMarkdown(fullReport);
    const mdPath = latestPath.replace('.json', '.md');
    await writeFile(mdPath, mdContent);
    result.mdPath = mdPath;
  }

  return result;
}

/**
 * Generate URL-safe slug from text
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * Render report as markdown
 */
export function renderMarkdown(report: InvestigationReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Investigation Report');
  lines.push('');
  lines.push(`**Generated:** ${report.meta.generatedAt}`);
  lines.push(`**Model:** ${report.meta.modelUsed}`);
  lines.push(`**Tokens Used:** ${report.meta.tokensUsed}`);
  lines.push('');

  // Question
  lines.push('## Question');
  lines.push('');
  lines.push(`> ${report.meta.question}`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.executiveSummary);
  lines.push('');

  // Repository Map
  lines.push('## Repository Map');
  lines.push('');
  lines.push(`- **Primary Language:** ${report.repoMap.primaryLanguage}`);
  lines.push(`- **Framework:** ${report.repoMap.framework || 'None detected'}`);
  lines.push(`- **Architecture:** ${report.repoMap.architecture}`);
  lines.push('');

  if (report.repoMap.keyDirectories.length > 0) {
    lines.push('### Key Directories');
    lines.push('');
    lines.push('| Directory | Purpose | Source |');
    lines.push('|-----------|---------|--------|');
    for (const dir of report.repoMap.keyDirectories) {
      lines.push(`| \`${dir.path}\` | ${dir.purpose} | \`${dir.citedFile}\` |`);
    }
    lines.push('');
  }

  // Build/Run/Test
  lines.push('## Build / Run / Test');
  lines.push('');
  const brt = report.buildRunTest;
  if (brt.buildCommand) lines.push(`- **Build:** \`${brt.buildCommand}\``);
  if (brt.runCommand) lines.push(`- **Run:** \`${brt.runCommand}\``);
  if (brt.testCommand) lines.push(`- **Test:** \`${brt.testCommand}\``);
  lines.push('');

  if (brt.prerequisites.length > 0) {
    lines.push('**Prerequisites:**');
    for (const prereq of brt.prerequisites) {
      lines.push(`- ${prereq}`);
    }
    lines.push('');
  }

  if (brt.notes) {
    lines.push(`**Notes:** ${brt.notes}`);
    lines.push('');
  }

  // Architecture Findings
  if (report.architectureFindings.length > 0) {
    lines.push('## Architecture Findings');
    lines.push('');
    for (const finding of report.architectureFindings) {
      lines.push(`### ${finding.title}`);
      lines.push('');
      lines.push(finding.description);
      lines.push('');
      lines.push(`**Confidence:** ${finding.confidence}`);
      lines.push(`**Sources:** ${finding.citedFiles.map(f => `\`${f}\``).join(', ')}`);
      lines.push('');
    }
  }

  // Implementation Pointers
  if (report.implementationPointers.length > 0) {
    lines.push('## Implementation Pointers');
    lines.push('');
    for (const pointer of report.implementationPointers) {
      lines.push(`### ${pointer.area}`);
      lines.push('');
      lines.push(pointer.approach);
      lines.push('');
      lines.push(`**Relevant Files:** ${pointer.relevantFiles.map(f => `\`${f}\``).join(', ')}`);
      lines.push(`**Primary Source:** \`${pointer.citedFile}\``);
      lines.push('');
    }
  }

  // Risks
  if (report.risks.length > 0) {
    lines.push('## Risks');
    lines.push('');
    for (const risk of report.risks) {
      const severityIcon = risk.severity === 'high' ? '🔴' : risk.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`- ${severityIcon} **[${risk.severity.toUpperCase()}] ${risk.title}**`);
      lines.push(`  ${risk.description}`);
      if (risk.citedFile) {
        lines.push(`  *(Source: \`${risk.citedFile}\`)*`);
      }
    }
    lines.push('');
  }

  // Next Steps
  if (report.nextSteps.length > 0) {
    lines.push('## Recommended Next Steps');
    lines.push('');
    for (let i = 0; i < report.nextSteps.length; i++) {
      lines.push(`${i + 1}. ${report.nextSteps[i]}`);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by PAI Investigator*');

  return lines.join('\n');
}
