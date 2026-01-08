#!/usr/bin/env bun
/**
 * C4Generator.ts - Generate C4 architecture diagrams in Mermaid syntax
 *
 * Generates C4 model diagrams at three levels:
 * - L1 Context: System boundary and external actors
 * - L2 Container: Major subsystems and their relationships
 * - L3 Component: Detailed component breakdown per container
 *
 * Usage:
 *   bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts          # Generate all levels
 *   bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 1 # L1 only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 2 # L2 only
 *   bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 3 # L3 only
 */

import { analyzeProject, type ProjectMetadata } from './CodeAnalyzer';

// ============================================================================
// Type Definitions
// ============================================================================

export interface C4Diagrams {
  contextDiagram: string;      // L1
  containerDiagram: string;    // L2
  componentDiagrams: {         // L3
    name: string;
    diagram: string;
  }[];
}

// ============================================================================
// L1 Context Diagram
// ============================================================================

function generateContextDiagram(metadata: ProjectMetadata): string {
  return `\`\`\`mermaid
C4Context
    title System Context Diagram for PAI (Level 1)

    Person(user, "Developer", "Software engineer using AI assistance")

    System(pai, "PAI", "Personal AI Infrastructure - Modular AI assistant system with skills, hooks, and observability")

    System_Ext(claude, "Claude Code", "Anthropic's AI coding assistant CLI")
    System_Ext(git, "Git", "Version control system")
    System_Ext(github, "GitHub", "Code hosting and collaboration")
    System_Ext(anthropic_api, "Anthropic API", "Claude AI model access")

    Rel(user, claude, "Interacts via CLI")
    Rel(claude, pai, "Loads skills, triggers hooks")
    Rel(pai, anthropic_api, "AI-assisted generation")
    Rel(user, git, "Commits code")
    Rel(git, pai, "Pre-commit hooks")
    Rel(pai, github, "Documentation sync")
\`\`\``;
}

// ============================================================================
// L2 Container Diagram
// ============================================================================

function generateContainerDiagram(metadata: ProjectMetadata): string {
  const skillCount = metadata.skills.length;
  const hookCount = metadata.hooks.length;
  const toolCount = metadata.tools.length;

  return `\`\`\`mermaid
C4Container
    title Container Diagram for PAI (Level 2)

    Person(user, "Developer", "Software engineer")

    System_Boundary(pai, "PAI System") {
        Container(skills, "Skills System", "TypeScript/Markdown", "Modular capability definitions\\n${skillCount} skills installed")
        Container(hooks, "Hook System", "TypeScript/Bun", "Event-driven automation\\n${hookCount} hooks active")
        Container(tools, "CLI Tools", "TypeScript/Bun", "Standalone utilities\\n${toolCount} tools available")
        Container(history, "History System", "JSONL/Markdown", "Session and activity tracking")
        Container(observability, "Observability", "Vue/Bun", "Real-time monitoring dashboard")
        Container(config, "Configuration", "JSON", "System settings and hook definitions")
    }

    System_Ext(claude, "Claude Code", "AI Assistant CLI")
    System_Ext(anthropic, "Anthropic API", "AI Model")

    Rel(user, claude, "Commands", "CLI")
    Rel(claude, skills, "Loads & invokes")
    Rel(claude, hooks, "Triggers events")
    Rel(hooks, history, "Captures sessions")
    Rel(hooks, observability, "Sends events")
    Rel(tools, anthropic, "AI generation", "HTTPS")
    Rel(config, hooks, "Configures")
    Rel(config, skills, "Defines loading")
\`\`\``;
}

// ============================================================================
// L3 Component Diagrams
// ============================================================================

function generateSkillsComponentDiagram(metadata: ProjectMetadata): string {
  const skillLines = metadata.skills
    .map(s => `        Component(skill_${s.name.toLowerCase()}, "${s.name}", "Skill", "${truncate(s.description, 40)}")`)
    .join('\n');

  const skillRels = metadata.skills
    .filter(s => s.tools.length > 0)
    .map(s => `    Rel(skill_${s.name.toLowerCase()}, skill_tools, "Uses tools")`)
    .join('\n');

  return `\`\`\`mermaid
C4Component
    title Skills System Components (Level 3)

    Container_Boundary(skills, "Skills System") {
${skillLines}
        Component(skill_index, "Skill Index", "JSON", "Discovery and routing")
        Component(skill_tools, "Skill Tools", "TypeScript", "Per-skill CLI utilities")
    }

    Container_Ext(claude, "Claude Code")
    Container_Ext(config, "Configuration")

    Rel(claude, skill_index, "Discovers skills")
${skillRels}
    Rel(config, skill_index, "Tier definitions")
\`\`\``;
}

function generateHooksComponentDiagram(metadata: ProjectMetadata): string {
  // Group hooks by their primary event type
  const eventGroups: Record<string, typeof metadata.hooks> = {};

  for (const hook of metadata.hooks) {
    const primaryEvent = hook.eventTypes[0] || 'General';
    if (!eventGroups[primaryEvent]) {
      eventGroups[primaryEvent] = [];
    }
    eventGroups[primaryEvent].push(hook);
  }

  const hookLines = metadata.hooks
    .map(h => {
      const events = h.eventTypes.length > 0 ? h.eventTypes.join(', ') : 'Multiple';
      return `        Component(hook_${sanitizeId(h.name)}, "${h.name}", "Hook", "Events: ${events}")`;
    })
    .join('\n');

  return `\`\`\`mermaid
C4Component
    title Hook System Components (Level 3)

    Container_Boundary(hooks, "Hook System") {
${hookLines}
        Component(hook_lib, "Hook Library", "TypeScript", "Shared utilities")
        Component(hook_config, "Hook Config", "JSON", "Event routing rules")
    }

    Container_Ext(claude, "Claude Code")
    Container_Ext(history, "History System")
    Container_Ext(observability, "Observability")

    Rel(claude, hook_config, "Reads on events")
    Rel(hook_config, hook_lib, "Configures")
    Rel_Back(history, hook_lib, "Writes sessions")
    Rel_Back(observability, hook_lib, "Sends events")
\`\`\``;
}

function generateToolsComponentDiagram(metadata: ProjectMetadata): string {
  // Include both top-level tools and skill tools
  const allTools = [...metadata.tools];
  for (const skill of metadata.skills) {
    for (const tool of skill.tools) {
      if (!allTools.find(t => t.name === tool.name)) {
        allTools.push(tool);
      }
    }
  }

  const toolLines = allTools
    .slice(0, 10) // Limit to prevent overcrowding
    .map(t => `        Component(tool_${sanitizeId(t.name)}, "${t.name}", "CLI Tool", "${truncate(t.description, 35)}")`)
    .join('\n');

  return `\`\`\`mermaid
C4Component
    title CLI Tools Components (Level 3)

    Container_Boundary(tools, "CLI Tools") {
${toolLines}
    }

    Container_Ext(skills, "Skills System")
    Container_Ext(anthropic, "Anthropic API")
    Container_Ext(filesystem, "File System")

    Rel(skills, tools, "Invokes")
    Rel(tools, anthropic, "AI generation")
    Rel(tools, filesystem, "Read/Write files")
\`\`\``;
}

// ============================================================================
// Helper Functions
// ============================================================================

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  // Remove newlines and collapse spaces
  const clean = str.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ============================================================================
// Main Generator Function
// ============================================================================

export async function generateC4Diagrams(metadata?: ProjectMetadata): Promise<C4Diagrams> {
  const data = metadata || await analyzeProject();

  return {
    contextDiagram: generateContextDiagram(data),
    containerDiagram: generateContainerDiagram(data),
    componentDiagrams: [
      { name: 'Skills System', diagram: generateSkillsComponentDiagram(data) },
      { name: 'Hook System', diagram: generateHooksComponentDiagram(data) },
      { name: 'CLI Tools', diagram: generateToolsComponentDiagram(data) }
    ]
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const levelArg = args.find(a => a.startsWith('--level'));
  const level = levelArg ? parseInt(args[args.indexOf(levelArg) + 1] || args[args.indexOf('--level') + 1]) : 0;

  const diagrams = await generateC4Diagrams();

  if (level === 0 || level === 1) {
    console.log('## L1 Context Diagram\n');
    console.log(diagrams.contextDiagram);
    console.log('\n');
  }

  if (level === 0 || level === 2) {
    console.log('## L2 Container Diagram\n');
    console.log(diagrams.containerDiagram);
    console.log('\n');
  }

  if (level === 0 || level === 3) {
    console.log('## L3 Component Diagrams\n');
    for (const comp of diagrams.componentDiagrams) {
      console.log(`### ${comp.name}\n`);
      console.log(comp.diagram);
      console.log('\n');
    }
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
