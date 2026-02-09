# Context
Swarm: local

## Decisions
- [decision]: Use standard Node.js `path` module for validation where possible.
- [decision]: Use a configuration-driven approach for agent creation to eliminate boilerplate.
- [decision]: Keep `src/hooks/extractors.ts` near the hook logic because it needs access to the same hook utilities and shared state; document this rationale in the context file instead of moving it to `utils/`.
- [decision]: Retry behavior is a single, global setting (`fileRetryEnabled`) rather than per-operation toggles.
- [decision]: Markdown AST caching stays in-memory only (no disk persistence).
- [decision]: Default logging verbosity is `WARN`; debug-level logs enabled via env flag when needed.
- [decision]: Performance target: repeated markdown parse loops should stay under 500ms with caching.
- [decision]: Security posture is fail-secure; validation errors block further processing.

- [decision]: Run `scripts/check-records.ts` before linting so any `Record<string, unknown>` must include a `RECORD-JUSTIFIED` comment.
- [decision]: Enforce coverage >= 90% via `scripts/check-coverage.ts` before releasing.
## SME Cache
### typescript
- [guidance]: Document helper methods with `@param`/`@returns`, include accuracy remarks for estimators, keep helper modules single-responsibility (tokens vs. delegation), and guard map accesses with explicit `has` checks instead of optional chaining.
- [guidance]: Export a `PluginInitConfig` type for the config hook, guard `Map`/`Record` accesses with explicit `has`/`in` checks before `.get()`/`[...]`, and ensure logging helpers report missing configs rather than silently skipping.
### observability
- [guidance]: Use structured logs for initialization, record safe metadata (agent count, config keys, environment), include a startup banner at INFO, and make `LOG_LEVEL`/`VERBOSE_INIT` flags control DEBUG output while redacting secrets (keys ending in `_KEY`, `_SECRET`, `_TOKEN`).

## Patterns
- [pattern]: Agent factory pattern used in `src/agents/*.ts`

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 77 | 77 | 0 | 8ms |
| bash | 59 | 59 | 0 | 1068ms |
| edit | 41 | 41 | 0 | 1291ms |
| task | 14 | 14 | 0 | 71568ms |
| todowrite | 13 | 13 | 0 | 2ms |
| memory_set | 5 | 5 | 0 | 1191ms |
| write | 4 | 4 | 0 | 1688ms |
| memory_replace | 2 | 2 | 0 | 3ms |
| memory_list | 2 | 2 | 0 | 3ms |
| apply_patch | 2 | 2 | 0 | 33ms |
| glob | 1 | 1 | 0 | 48ms |
| mystatus | 1 | 1 | 0 | 1828ms |
| grep | 1 | 1 | 0 | 2039ms |
