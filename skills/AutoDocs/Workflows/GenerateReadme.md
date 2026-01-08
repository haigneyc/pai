# GenerateReadme Workflow

> **Trigger:** "generate readme", "update readme", "refresh readme"

## Purpose

Regenerates the README.md file with current project information including:
- Quick start guide
- Skills list
- CLI tool reference
- Project structure

## Workflow Steps

### Step 1: Analyze Codebase

Run the CodeAnalyzer to gather current project metadata:

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/CodeAnalyzer.ts --pretty
```

This extracts:
- All installed skills and their descriptions
- CLI tools and their usage
- Hook definitions
- Directory structure

### Step 2: Generate README

Generate the README with AI enhancement:

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme
```

Or without AI (template only):

```bash
bun $PAI_DIR/skills/AutoDocs/Tools/AutoDocs.ts readme --no-ai
```

### Step 3: Verify Output

Check the generated README:

```bash
cat $PAI_DIR/README.md
```

## Output

- **File:** `$PAI_DIR/README.md`
- **State:** `.autodocs-state.json` updated

## Example Output

```
SUMMARY: README.md regenerated with current skills and tools
ACTIONS: Analyzed codebase, generated template, enhanced with AI
RESULTS: README.md updated with 4 skills, 8 tools documented
COMPLETED: README documentation refreshed successfully
```
