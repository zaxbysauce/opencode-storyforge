# OpenCode Writer Swarm
# OpenCode-StoryForge

OpenCode-StoryForge is the editorial swarm plugin for OpenCode that orchestrates a curated team of AI agents to draft, research, revise, and polish multi-stage writing projects. Designed with GitHub and npm users in mind, it markets a catchy collaborative workflow, pro-level polishing crew, and clear configuration knobs while still linking down to the technical usage sections below.

## Agents

- **Editor-in-Chief**: Orchestrator, direction setter.
- **Writer**: Draft creator.
- **Researcher**: Fact gatherer.
- **Section Editor**: Structure reviewer.
- **Copy Editor**: Language polisher and AI slop remover.
- **Fact Checker**: Verification expert.
- **Reader Advocate**: Audience representative.

## Usage

## Editor-in-Chief Role

OpenCode surfaces `editor_in_chief` as the primary role inside the UI, so you can pick it from the agent selector just like any other OpenCode plugin. When you kick off the Editor-in-Chief, StoryForge inherits whichever model you selected for that session (the same behavior as `opencode-swarm`), and you can still override the model via `opencode-writer-swarm` config if you need a different fallback.

1. Add the plugin to your `opencode.json`.
2. Configure models in `~/.config/opencode/opencode-writer-swarm.json` or `.opencode/opencode-writer-swarm.json`.
3. Invoke `@editor_in_chief` with a writing request.

## Workflow

1. **Brief**: Editor-in-Chief creates a brief.
2. **Research**: Researcher gathers facts.
3. **Plan**: Editor-in-Chief creates a content plan.
4. **Draft**: Writer produces the first draft.
5. **Review**: Section Editor, Copy Editor, Fact Checker, and Reader Advocate review the draft.
6. **Polish**: Copy Editor does a final polish.
7. **Delivery**: Final output saved to `.writer/final/`.

## Configuration

| Setting | Description |
| --- | --- |
| `config_validation_enabled` (`CONFIG_VALIDATION_ENABLED`) | Enables the prototype-pollution guard in `deepMerge`. Set to `false` to fall back to the previous behavior. |
| `FILE_VALIDATION_ENABLED` | Controls symlink/size/depth validation for `.writer` files. Disable to revert to the legacy permissive reader. |
| `FILE_RETRY_ENABLED` / `WRITER_MAX_RETRIES` | Toggles exponential backoff retries for writer file writes and limits the number of retries. |
| `LOG_REDACTION_ENABLED` | When `true` (default), startup logs redact keys ending in `_KEY`, `_SECRET`, or `_TOKEN`. Setting to `false` temporarily disables redaction for debugging. |
| `VERBOSE_INIT` / `LOG_LEVEL=debug` | Emit detailed initialization metadata (agent count, sanitized config keys) during plugin startup. |

## Slash commands

The plugin exposes a `/swarm` command namespace for inspecting and managing the swarm state:

- `/swarm diagnose` – Runs health checks on `.swarm/plan.md`, `.swarm/context.md`, and the plugin config.
- `/swarm export` – Emits the current plan/context bundle as a JSON snapshot for backups or migration.
- `/swarm reset --confirm` – Securely deletes `.swarm/plan.md` and `.swarm/context.md` after a confirmation warning, leaving the workspace in a clean state.

Each slash command validates all arguments and file paths before performing I/O, matching the guardrail philosophy outlined below.

## Guardrails & context budget

Guardrails ensure no single session exceeds configured limits. The defaults (exposed under `guardrails` in your config) are:

- `max_tool_calls: 200`
- `max_duration_minutes: 30`
- `max_repetitions: 10`
- `max_consecutive_errors: 5`
- `warning_threshold: 0.5`

Warnings fire when you cross 50% of a limit (logged as `Guardrail warning: Approaching tool call limit`). When limits are exceeded the guardrail hook throws to halt further tool execution and protect the agent loop.

Context-budget warnings continue to execute through `experimental.chat.system.transform`, ensuring the architect agent receives system-level alerts when plan/context token budgets reach `0.7` (warning) or `0.9` (critical) of the configured window.

## Release 1.2.0

- Slash commands for `/swarm diagnose`, `/swarm export`, and `/swarm reset --confirm`.
- Guardrail engine enforcing tool-call/duration/repetition/error limits with configurable warning thresholds.
- Evidence store keeping `.swarm/evidence` shrink-wrapped with retention and guardrail-aware reads.
- Documentation, tests, and build/typecheck scripts locked in for a full verification phase.
