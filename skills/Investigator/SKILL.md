---
name: Investigator
description: Analyzes repositories to understand architecture and provide implementation guidance. USE WHEN investigate repo OR analyze codebase OR understand architecture OR how to implement OR explore project structure OR onboard to new project.
---

# Investigator - Repository Investigation Skill

**Invoke when:** analyzing new repositories, planning implementations, understanding project architecture, onboarding to unfamiliar codebases.

## How It Works

1. **Signal Collection** (CLI tool - deterministic, no LLM)
   - File tree structure
   - Entrypoint files (package.json, README, etc.)
   - Grep pattern matches (routing, database, bootstrap patterns)

2. **Analysis** (Task tool - uses Claude Code's native subagent)
   - Main agent runs signal collector
   - Main agent spawns Task with investigation prompt
   - Task agent returns structured findings

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **Investigate** | "investigate repo", "analyze codebase", "understand architecture" | `Workflows/Investigate.md` |

## Quick Usage

```bash
# Step 1: Collect signals and get the investigation prompt
PROMPT=$(bun $PAI_DIR/skills/Investigator/Tools/PaiInvestigate.ts \
  --repo /path/to/target \
  --question "How should I implement X?" \
  --output prompt)

# Step 2: Use the Task tool with the prompt (done by main agent)
# The main agent calls Task with subagent_type="Explore" or similar
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --repo` | Repository root (required) | - |
| `-q, --question` | Investigation question (required) | - |
| `-f, --focus` | Comma-separated paths to focus on | - |
| `--max-files` | Max matches per grep pattern | 50 |
| `-o, --output` | Output mode: signals, prompt, both | both |

## Output Modes

- **signals**: Raw collected signals as JSON
- **prompt**: Investigation prompt ready for Task tool
- **both**: Structured JSON with signals + prompt

## Example Investigation Flow

When the user asks to investigate a repository:

```
User: "Investigate the tcg-inventory repo to understand the architecture"

Agent steps:
1. Run signal collector:
   bun $PAI_DIR/skills/Investigator/Tools/PaiInvestigate.ts \
     --repo /home/chris/projects/tcg-inventory \
     --question "What is the architecture of this project?" \
     --output prompt

2. Use Task tool with the prompt:
   Task(subagent_type="Explore", prompt=<collected_prompt>)

3. Parse and present the findings to the user
```

## What Gets Collected

### Entrypoint Files (first 32KB each)
- Package managers: package.json, pyproject.toml, Cargo.toml, go.mod
- Documentation: README.md, ARCHITECTURE.md, CLAUDE.md
- Build tools: Makefile, Dockerfile, docker-compose.yml
- CI/CD: .github/workflows/*.yml
- App entrypoints: src/index.ts, main.py, main.go, etc.

### Grep Patterns
- **bootstrap**: createServer, app.listen, FastAPI(), express()
- **routing**: router., @Get, @Post, urlpatterns
- **database**: mongoose.connect, prisma, SQLALCHEMY
- **testing**: describe(), test(), pytest

## Report Structure

The Task agent returns structured findings:

```json
{
  "executiveSummary": "2-3 sentence overview",
  "repoMap": {
    "primaryLanguage": "TypeScript",
    "framework": "Express",
    "architecture": "modular",
    "keyDirectories": [...]
  },
  "buildRunTest": {
    "buildCommand": "bun build",
    "runCommand": "bun start",
    "testCommand": "bun test"
  },
  "architectureFindings": [...],
  "implementationPointers": [...],
  "risks": [...],
  "nextSteps": [...]
}
```

## Files

| File | Purpose |
|------|---------|
| `Tools/PaiInvestigate.ts` | Signal collection CLI |
| `Tools/Collect.ts` | Deterministic signal gathering |
| `Tools/Prompts.ts` | Investigation prompt template |
| `Tools/Schema.ts` | TypeScript interfaces |
| `Workflows/Investigate.md` | Step-by-step workflow |
