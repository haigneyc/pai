# GenerateArchitecture Workflow

> **Trigger:** "generate architecture", "update architecture", "refresh architecture docs", "generate C4"

## Purpose

Regenerates the docs/ARCHITECTURE.md file with C4 model diagrams:
- L1 Context: System boundaries and external actors
- L2 Container: Major subsystems
- L3 Component: Detailed component breakdown

## Workflow Steps

### Step 1: Analyze Codebase

Run the CodeAnalyzer to gather structural information:

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts --pretty
```

### Step 2: Preview C4 Diagrams

Preview the diagrams that will be generated:

```bash
# All levels
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts

# Specific level
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 2
```

### Step 3: Generate Architecture Documentation

Generate the full architecture documentation:

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture
```

Or without AI enhancement:

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture --no-ai
```

### Step 4: Verify Output

Check the generated documentation:

```bash
cat $PAI_DIR/docs/ARCHITECTURE.md
```

View in browser (Mermaid diagrams render on GitHub):

```bash
# If you have a local markdown viewer
open $PAI_DIR/docs/ARCHITECTURE.md
```

## C4 Diagram Levels

### L1 - Context

Shows PAI as a black box with:
- User (Developer)
- Claude Code (AI Assistant)
- Git/GitHub (Version Control)
- Anthropic API (AI Model)

### L2 - Container

Shows major subsystems:
- Skills System
- Hook System
- CLI Tools
- History System
- Observability Dashboard
- Configuration

### L3 - Component

Detailed breakdown of:
- Individual skills within Skills System
- Individual hooks within Hook System
- Individual tools within CLI Tools

## Output

- **File:** `$PAI_DIR/docs/ARCHITECTURE.md`
- **Diagrams:** Mermaid C4 syntax (renders on GitHub)
- **State:** `.autodocs-state.json` updated

## Example Output

```
SUMMARY: Architecture documentation regenerated with C4 diagrams
ACTIONS: Analyzed structure, generated L1/L2/L3 diagrams, enhanced with AI
RESULTS: docs/ARCHITECTURE.md updated with 3 diagram levels
COMPLETED: C4 architecture documentation refreshed
```
