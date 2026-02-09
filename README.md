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
