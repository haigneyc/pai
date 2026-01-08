# Investigate Workflow

Analyze a repository to understand its architecture and provide implementation guidance.

## Trigger

- "investigate repo"
- "analyze codebase"
- "understand architecture"
- "how to implement X"
- "explore project structure"
- "onboard to this project"

## Workflow Steps

### Step 1: Collect Repository Signals

Run the signal collector to gather deterministic information about the repository:

```bash
bun $PAI_DIR/skills/Investigator/Tools/PaiInvestigate.ts \
  --repo <target_repo_path> \
  --question "<user_question>" \
  --output prompt
```

This outputs a prompt containing:
- Repository metadata
- File tree structure
- Entrypoint file contents
- Pattern matches (routing, database, etc.)

### Step 2: Spawn Investigation Task

Use Claude Code's Task tool with the generated prompt:

```
Task(
  subagent_type="Explore",
  prompt=<output_from_step_1>,
  description="Investigate repository architecture"
)
```

The Task agent will analyze the signals and return structured findings.

### Step 3: Present Findings

Parse the Task result and present to the user:
- Executive summary
- Architecture overview
- Build/run/test commands
- Implementation pointers (if they asked about implementing something)
- Risks and unknowns

### Step 4: Follow-up (Optional)

Based on the investigation, you may:
- Read specific files mentioned in the findings
- Propose an implementation plan
- Run additional focused investigations

## Example

```
User: "Investigate the tcg-inventory repo to understand how to add a new API endpoint"

Agent:
1. Runs signal collector:
   bun $PAI_DIR/skills/Investigator/Tools/PaiInvestigate.ts \
     --repo /home/chris/projects/tcg-inventory \
     --question "How do I add a new API endpoint?" \
     --output prompt

2. Spawns Task with the prompt

3. Receives findings:
   - Primary language: TypeScript
   - Framework: Express
   - Existing routes in src/routes/
   - Database: PostgreSQL via Prisma
   - Recommendation: Create new route file, add to router index

4. Presents summary to user with specific file paths
```

## Output Modes

The signal collector supports three output modes:

| Mode | Use Case |
|------|----------|
| `--output prompt` | Get just the investigation prompt for Task tool |
| `--output signals` | Get raw signals JSON for custom processing |
| `--output both` | Get structured object with signals + prompt |

## Notes

- Signal collection is **deterministic** - no LLM calls, fast execution
- Analysis uses Claude Code's **native Task tool** - no separate API key needed
- All findings should **cite file paths** from the collected signals
- Focus on **actionable insights** relevant to the user's question
