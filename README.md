# PAI

Personal AI Infrastructure - Modular AI assistant with skills, hooks, and observability

## Features

- **CORE**: Personal AI Infrastructure core. AUTO-LOADS at session start...
- **AutoDocs**: Auto-generates README.md and ARCHITECTURE.md documentation. ...
- **Prompting**: Meta-prompting system for dynamic prompt generation using te...
- **Investigator**: Analyzes repositories to understand architecture and provide...
- **CreateSkill**: Create and validate skills. USE WHEN create skill, new skill...

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code](https://claude.ai/code) CLI
- Anthropic API key (for AI-assisted features)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd pai

# Set environment variables
export PAI_DIR="$(pwd)"
export ANTHROPIC_API_KEY="your-api-key"

# Install skill dependencies
cd skills/AutoDocs/Tools && bun install && cd -
cd skills/Prompting/Tools && bun install && cd -
```

### First Run

```bash
# Generate the skill index
bun $PAI_DIR/tools/GenerateSkillIndex.ts

# Verify installation health
bun $PAI_DIR/tools/PaiArchitecture.ts check

# Start the observability dashboard (optional)
./observability/manage.sh start
```

## Skills

PAI uses a modular skill system. Skills are loaded automatically based on context.

| Skill | Description |
|-------|-------------|
| **CORE** | Personal AI Infrastructure core. AUTO-LOADS at ses... |
| **AutoDocs** | Auto-generates README.md and ARCHITECTURE.md docum... |
| **Prompting** | Meta-prompting system for dynamic prompt generatio... |
| **Investigator** | Analyzes repositories to understand architecture a... |
| **CreateSkill** | Create and validate skills. USE WHEN create skill,... |

## CLI Tools

### SkillSearch

SkillSearch.ts

```bash
bun run $PAI_DIR/tools/SkillSearch.ts <query>
bun run $PAI_DIR/tools/SkillSearch.ts --list
```


### PaiArchitecture

PaiArchitecture.ts

```bash
bun $PAI_DIR/tools/PaiArchitecture.ts generate    # Generate/refresh Architecture.md
bun $PAI_DIR/tools/PaiArchitecture.ts status      # Show current state (stdout)
bun $PAI_DIR/tools/PaiArchitecture.ts check       # Verify installation health
bun $PAI_DIR/tools/PaiArchitecture.ts log-upgrade "description"  # Add upgrade entry
```

**Commands:** generate, status, check

### GenerateSkillIndex

GenerateSkillIndex.ts



### C4Generator

C4Generator.ts - Generate C4 architecture diagrams in Mermaid syntax

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts          # Generate all levels
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 1 # L1 only
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 2 # L2 only
bun $PAI_DIR/skills/AutoDocs/Tools/C4Generator.ts --level 3 # L3 only
```


### ChangeDetector

ChangeDetector.ts - Detect when documentation needs updating

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts          # Check staged changes
bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts --force  # Force regeneration
bun $PAI_DIR/skills/AutoDocs/Tools/ChangeDetector.ts --status # Show current state
```


### CodeAnalyzer

CodeAnalyzer.ts - Extract project metadata for documentation generation

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts          # Output JSON
bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts --pretty # Pretty print
```


### AutoDocs

AutoDocs.ts - AI-Assisted Documentation Generator

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts pre-commit   # Git hook mode
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme       # Generate README only
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture # Generate architecture only
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full         # Generate all docs
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full --no-ai # Template-only mode
```

**Commands:** readme, architecture, arch, full, all, help

### RenderTemplate

RenderTemplate.ts - Template Rendering Engine

```bash
bun run RenderTemplate.ts --template <path> --data <path> [--output <path>] [--preview]
```


### ValidateTemplate

ValidateTemplate.ts - Template Syntax Validator

```bash
bun run ValidateTemplate.ts --template <path> [--data <path>] [--strict]
```


### PaiInvestigate

PaiInvestigate.ts - Repository Signal Collector for Investigation

```bash
bun PaiInvestigate.ts --repo . --question "How should I implement X?"
bun PaiInvestigate.ts --repo . --question "Architecture?" --output prompt
bun PaiInvestigate.ts --repo . --question "test" --output signals
```


### Prompts

Prompts.ts - Fixed Investigator Prompt Template



### Schema

Schema.ts - TypeScript interfaces for Investigation



### Collect

Collect.ts - Deterministic Repository Signal Collection



### Report

Report.ts - Investigation Report Storage and Rendering




## Project Structure

```
/home/chris/pai/
├── skills/    # Modular skill definitions and workflows
├── hooks/    # Event-driven automation handlers
├── tools/    # Standalone CLI utilities
├── config/    # System configuration files
├── history/    # Session and activity tracking
├── observability/    # Monitoring and dashboard
├── docs/    # Generated documentation
```

| Directory | Purpose |
|-----------|---------|
| `skills/` | Modular skill definitions and workflows |
| `hooks/` | Event-driven automation handlers |
| `tools/` | Standalone CLI utilities |
| `config/` | System configuration files |
| `history/` | Session and activity tracking |
| `observability/` | Monitoring and dashboard |
| `docs/` | Generated documentation |

## Configuration

Configuration files are located in `config/`:

- `settings-hooks.json` - Hook event routing and commands

## Development

### Adding a New Skill

```bash
# Use the CreateSkill workflow
# Or manually create:
mkdir -p skills/NewSkill/{Tools,Workflows}
# Create skills/NewSkill/SKILL.md with required frontmatter
```

### Regenerating Documentation

```bash
# Full documentation regeneration
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full

# README only
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme

# Architecture only
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture
```

## License

Private repository.

---

*Documentation auto-generated by PAI AutoDocs on 2026-01-08*
