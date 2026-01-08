# PAI Architecture

> C4 Model documentation for Personal AI Infrastructure

**Last Updated:** 2026-01-08

## Overview

Personal AI Infrastructure - Modular AI assistant with skills, hooks, and observability

PAI is designed around a modular, event-driven architecture that integrates deeply with Claude Code. The system emphasizes:

- **Modularity**: Skills can be added, removed, or updated independently
- **Observability**: All events are captured and can be monitored in real-time
- **Extensibility**: Hooks allow custom behavior at every lifecycle event
- **AI-First**: Designed to leverage AI for documentation, code generation, and automation

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | Fast JavaScript/TypeScript runtime |
| Language | TypeScript | Type-safe development |
| Templates | Handlebars | Dynamic content generation |
| Diagrams | Mermaid | Architecture visualization |
| AI | Anthropic Claude | AI-assisted generation |
| Frontend | Vue 3 + Vite | Observability dashboard |

## C4 Model Diagrams

### Level 1: System Context

Shows PAI in relation to users and external systems.

```mermaid
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
```

**Key External Systems:**
- **Claude Code**: The AI assistant CLI that loads and invokes PAI
- **Anthropic API**: Provides AI model access for generation tasks
- **Git/GitHub**: Version control and documentation sync

### Level 2: Container Diagram

Major subsystems within PAI and their interactions.

```mermaid
C4Container
    title Container Diagram for PAI (Level 2)

    Person(user, "Developer", "Software engineer")

    System_Boundary(pai, "PAI System") {
        Container(skills, "Skills System", "TypeScript/Markdown", "Modular capability definitions\n5 skills installed")
        Container(hooks, "Hook System", "TypeScript/Bun", "Event-driven automation\n8 hooks active")
        Container(tools, "CLI Tools", "TypeScript/Bun", "Standalone utilities\n3 tools available")
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
```

**Container Descriptions:**

| Container | Technology | Responsibility |
|-----------|------------|----------------|
| Skills System | TypeScript/Markdown | Modular capability definitions |
| Hook System | TypeScript/Bun | Event-driven automation |
| CLI Tools | TypeScript/Bun | Standalone utilities |
| History System | JSONL/Markdown | Session and activity tracking |
| Observability | Vue/Bun | Real-time monitoring |
| Configuration | JSON | System settings |

### Level 3: Component Diagrams

Detailed breakdown of each major container.

#### Skills System

```mermaid
C4Component
    title Skills System Components (Level 3)

    Container_Boundary(skills, "Skills System") {
        Component(skill_core, "CORE", "Skill", "Personal AI Infrastructure core. AUTO...")
        Component(skill_autodocs, "AutoDocs", "Skill", "Auto-generates README.md and ARCHITEC...")
        Component(skill_prompting, "Prompting", "Skill", "Meta-prompting system for dynamic pro...")
        Component(skill_investigator, "Investigator", "Skill", "Analyzes repositories to understand a...")
        Component(skill_createskill, "CreateSkill", "Skill", "Create and validate skills. USE WHEN ...")
        Component(skill_index, "Skill Index", "JSON", "Discovery and routing")
        Component(skill_tools, "Skill Tools", "TypeScript", "Per-skill CLI utilities")
    }

    Container_Ext(claude, "Claude Code")
    Container_Ext(config, "Configuration")

    Rel(claude, skill_index, "Discovers skills")
    Rel(skill_autodocs, skill_tools, "Uses tools")
    Rel(skill_prompting, skill_tools, "Uses tools")
    Rel(skill_investigator, skill_tools, "Uses tools")
    Rel(config, skill_index, "Tier definitions")
```

#### Hook System

```mermaid
C4Component
    title Hook System Components (Level 3)

    Container_Boundary(hooks, "Hook System") {
        Component(hook_subagent_stop_hook, "subagent-stop-hook", "Hook", "Events: Multiple")
        Component(hook_capture_all_events, "capture-all-events", "Hook", "Events: Stop, SubagentStop")
        Component(hook_load_core_context, "load-core-context", "Hook", "Events: SessionStart")
        Component(hook_security_validator, "security-validator", "Hook", "Events: PreToolUse, Stop")
        Component(hook_capture_session_summary, "capture-session-summary", "Hook", "Events: Multiple")
        Component(hook_update_tab_titles, "update-tab-titles", "Hook", "Events: UserPromptSubmit")
        Component(hook_initialize_session, "initialize-session", "Hook", "Events: SessionStart")
        Component(hook_stop_hook, "stop-hook", "Hook", "Events: Stop")
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
```

#### CLI Tools

```mermaid
C4Component
    title CLI Tools Components (Level 3)

    Container_Boundary(tools, "CLI Tools") {
        Component(tool_skillsearch, "SkillSearch", "CLI Tool", "SkillSearch.ts")
        Component(tool_paiarchitecture, "PaiArchitecture", "CLI Tool", "PaiArchitecture.ts")
        Component(tool_generateskillindex, "GenerateSkillIndex", "CLI Tool", "GenerateSkillIndex.ts")
        Component(tool_c4generator, "C4Generator", "CLI Tool", "C4Generator.ts - Generate C4 arc...")
        Component(tool_changedetector, "ChangeDetector", "CLI Tool", "ChangeDetector.ts - Detect when ...")
        Component(tool_codeanalyzer, "CodeAnalyzer", "CLI Tool", "CodeAnalyzer.ts - Extract projec...")
        Component(tool_autodocs, "AutoDocs", "CLI Tool", "AutoDocs.ts - Template-Based Doc...")
        Component(tool_rendertemplate, "RenderTemplate", "CLI Tool", "RenderTemplate.ts - Template Ren...")
        Component(tool_validatetemplate, "ValidateTemplate", "CLI Tool", "ValidateTemplate.ts - Template S...")
        Component(tool_paiinvestigate, "PaiInvestigate", "CLI Tool", "PaiInvestigate.ts - Repository S...")
    }

    Container_Ext(skills, "Skills System")
    Container_Ext(anthropic, "Anthropic API")
    Container_Ext(filesystem, "File System")

    Rel(skills, tools, "Invokes")
    Rel(tools, anthropic, "AI generation")
    Rel(tools, filesystem, "Read/Write files")
```


## Data Flow

### Session Lifecycle

```
User Input → Claude Code → PAI Skills
                ↓
        Hook Events Triggered
                ↓
    ┌───────────┼───────────┐
    ↓           ↓           ↓
 History    Observability  Tools
 (JSONL)    (Dashboard)    (CLI)
```

### Skill Loading Flow

```
Session Start
    ↓
load-core-context.ts hook
    ↓
Read skill-index.json
    ↓
Load "always" tier skills
    ↓
On-demand: Load "deferred" skills
```

## Installed Skills

### CORE

**Path:** `skills/CORE/SKILL.md`

Personal AI Infrastructure core. AUTO-LOADS at session start. USE WHEN any session begins OR user asks about identity, response format, contacts, stack preferences, security protocols, or asset management.



### AutoDocs

**Path:** `skills/AutoDocs/SKILL.md`

Auto-generates README.md and ARCHITECTURE.md documentation. USE WHEN git pre-commit triggers OR user requests documentation generation OR user says &quot;generate readme&quot; OR &quot;update architecture&quot; OR &quot;generate docs&quot;.


**Tools:**
- `C4Generator`: C4Generator.ts - Generate C4 architecture diagrams in Mermaid syntax
- `ChangeDetector`: ChangeDetector.ts - Detect when documentation needs updating
- `CodeAnalyzer`: CodeAnalyzer.ts - Extract project metadata for documentation generation
- `AutoDocs`: AutoDocs.ts - Template-Based Documentation Generator

### Prompting

**Path:** `skills/Prompting/SKILL.md`

Meta-prompting system for dynamic prompt generation using templates, standards, and patterns. USE WHEN meta-prompting, template generation, prompt optimization, or programmatic prompt composition.


**Tools:**
- `RenderTemplate`: RenderTemplate.ts - Template Rendering Engine
- `ValidateTemplate`: ValidateTemplate.ts - Template Syntax Validator

### Investigator

**Path:** `skills/Investigator/SKILL.md`

Analyzes repositories to understand architecture and provide implementation guidance. USE WHEN investigate repo OR analyze codebase OR understand architecture OR how to implement OR explore project structure OR onboard to new project.


**Tools:**
- `PaiInvestigate`: PaiInvestigate.ts - Repository Signal Collector for Investigation
- `Prompts`: Prompts.ts - Fixed Investigator Prompt Template
- `Schema`: Schema.ts - TypeScript interfaces for Investigation
- `Collect`: Collect.ts - Deterministic Repository Signal Collection
- `Report`: Report.ts - Investigation Report Storage and Rendering

### CreateSkill

**Path:** `skills/CreateSkill/SKILL.md`

Create and validate skills. USE WHEN create skill, new skill, skill structure, canonicalize. SkillSearch(&#x27;createskill&#x27;) for docs.




## Hook System

Hooks are triggered at various lifecycle events. All hooks are defined in `config/settings-hooks.json`.

| Hook | Events | Purpose |
|------|--------|---------|
| subagent-stop-hook |  | Event handler |
| capture-all-events | Stop, SubagentStop | Event handler |
| load-core-context | SessionStart | Event handler |
| security-validator | PreToolUse, Stop | Event handler |
| capture-session-summary |  | Event handler |
| update-tab-titles | UserPromptSubmit | Event handler |
| initialize-session | SessionStart | Event handler |
| stop-hook | Stop | Extract the last assistant response from... |

### Event Types

- **SessionStart**: When a Claude Code session begins
- **SessionEnd**: When a session ends
- **PreToolUse**: Before a tool is invoked
- **PostToolUse**: After a tool completes
- **Stop**: When main agent stops
- **SubagentStop**: When a subagent completes
- **UserPromptSubmit**: When user submits input

## Directory Structure

```
pai/
├── skills/    # Modular skill definitions and workflows
├── hooks/    # Event-driven automation handlers
├── tools/    # Standalone CLI utilities
├── config/    # System configuration files
├── history/    # Session and activity tracking
├── observability/    # Monitoring and dashboard
├── docs/    # Generated documentation
├── .autodocs-state.json    # Documentation generation state
└── .env                    # Environment configuration
```

## Architectural Decisions

### Why Bun?

Bun provides faster startup times and native TypeScript support, which is critical for hooks that run on every Claude Code event.

### Why JSONL for History?

JSONL (JSON Lines) format allows:
- Append-only writes (no file locking)
- Easy streaming and tailing
- Line-by-line processing for large files

### Why Handlebars Templates?

Handlebars offers:
- Familiar mustache-style syntax
- Custom helpers for complex logic
- Separation of content from presentation

---

*Architecture documentation auto-generated by PAI AutoDocs*
