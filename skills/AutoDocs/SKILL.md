---
name: AutoDocs
description: Auto-generates README.md and ARCHITECTURE.md documentation. USE WHEN git pre-commit triggers OR user requests documentation generation OR user says "generate readme" OR "update architecture" OR "generate docs".
---

# AutoDocs - Automatic Documentation Generator

**Invoke when:** documentation needs updating, git pre-commit, generating README, updating architecture docs.

Generates and maintains:
- **README.md**: Quick start guide, CLI reference, skills overview
- **docs/ARCHITECTURE.md**: C4 diagrams (L1-L3), system structure

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **GenerateReadme** | "generate readme", "update readme" | `Workflows/GenerateReadme.md` |
| **GenerateArchitecture** | "generate architecture", "update architecture" | `Workflows/GenerateArchitecture.md` |

## CLI Usage

```bash
# Git hook mode (auto-detects what needs updating)
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts pre-commit

# Generate specific docs
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts architecture

# Generate all docs
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts full
```

## Examples

**Example 1: Auto-update on commit**
```
User: git commit -m "Add new skill"
-> Pre-commit hook triggers AutoDocs
-> Detects skill change, regenerates README
-> Stages updated README.md
-> Commit proceeds
```

**Example 2: Manual documentation refresh**
```
User: "generate architecture docs"
-> Invokes GenerateArchitecture workflow
-> Analyzes codebase structure
-> Generates C4 Mermaid diagrams
-> Writes docs/ARCHITECTURE.md
```

**Example 3: Full documentation regeneration**
```
User: "regenerate all docs"
-> Runs full mode
-> Updates README.md and docs/ARCHITECTURE.md
-> Reports what changed
```
