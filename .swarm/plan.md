# OpenCode Writer Swarm Code Review Implementation Plan
Swarm: local
Phase: 1 | Updated: 2026-02-08

## Summary of Findings by Category and Severity

| Category | CRITICAL | MAJOR | MINOR |
|----------|----------|-------|-------|
| 1. Stubs and Placeholders | 0 | 0 | 0 |
| 2. Partial Implementations | 0 | 2 | 0 |
| 3. AI Slop in Code | 0 | 0 | 2 |
| 4. Tech Debt | 0 | 2 | 1 |
| 5. Enhancement Opportunities | 0 | 1 | 2 |
| 6. Refactoring Targets | 0 | 0 | 2 |
| **TOTAL** | **0** | **5** | **7** |

## SME Guidance Summary

### TypeScript/Node.js SME Recommendations

**Error Handling**: Use custom error classes with context (hook name, plugin, phase), distinguish recoverable vs fatal errors, consider Result<T,E> types instead of throwing.

**File I/O**: Use p-retry for exponential backoff (50ms→100ms→200ms→400ms), only retry on specific errors (EBUSY, EAGAIN, EMFILE), use atomic writes via temp file + rename pattern.

**Configuration Validation**: Use Zod's `.strict()` to reject unknown keys, add `.refine()` for cross-field validation, use `.transform()` for normalization.

**AST Caching**: Use LRU cache with mtime/hash keys, limit to 500 entries, cache at highest level possible.

**Type Safety**: Use discriminated unions instead of `Record<string, unknown>`, use `satisfies` operator (TS 4.9+), brand primitive types to prevent mixing.

### Security SME Recommendations

**Path Traversal**: Add symlink detection via `fs.lstat()` and `fs.realpath()`, handle UNC paths and 8.3 short names on Windows.

**File Operations**: Add MAX_FILE_SIZE limits (10MB), depth limits for recursive scans, file type allowlist.

**Configuration**: Fix prototype pollution in `deepMerge`, sanitize agent names, reject suspicious model values.

**Markdown Processing**: Add MAX_MARKDOWN_SIZE (1MB), MAX_AST_DEPTH (100), log security events.

## Phase 1: CRITICAL Findings (0 items)
No critical findings blocking production use.

## Phase 2: MAJOR Findings (5 items)

### 2.1: Config Error Context Logging
**File**: `src/config/loader.ts:44-75`
**Size**: SMALL (1 file)
**Description**: Replace generic error swallowing with structured error logging in config loading
**Acceptance Criteria**: 
- `loadConfigFromPath` catches errors and logs: `{ filePath, errorCode, errorName, message, timestamp }`
- Logs emitted through `logConfigLoadError()` and always include JSON payload
- Unit tests cover error types with spy on `console.warn` (Error instances, primitives, objects)
- Test coverage: 100% for each log path, bun test `src/config/loader.test.ts` passes
- **Status**: [x]

### 2.2: Hook Error Context Enhancement
**File**: `src/hooks/utils.ts:29-66`
**Size**: SMALL (2 files: hooks/utils.ts + hooks/utils.test.ts)  
**Description**: Enhance `safeHook` to log hook name, session ID, agent, and input keys alongside any error message
**Acceptance Criteria**:
- `safeHook` now builds a `HookContext` containing `hookName`, optional `sessionID`, optional `agent`, and `inputKeys`
- Errors log to `console.warn` with structured context JSON appended, while SwarmErrors still include guidance text
- Unit tests cover regular errors, SwarmErrors, missing context fields, anonymous functions, and success/no-log path
- Test coverage: 100% for each error path and bun test `src/hooks/utils.test.ts` passes
- **Status**: [x]

### 2.3: File Security Validation
**File**: `src/hooks/utils.ts`, `src/tools/file-manager.ts`, `src/config/constants.ts`, `tests/unit/tools.test.ts`
**Size**: MEDIUM (4 files)
**Description**: Enforce 10MB size limit, symlink rejection, and 10-level depth guard for `.writer` file operations
**Acceptance Criteria**:
- `config/constants.ts` exports `MAX_FILE_SIZE` and `MAX_DIRECTORY_DEPTH`
- `validateWriterPath` detects symlinks via `fs.lstatSync`/`fs.realpathSync` and rejects escaping paths (disabled only when `ENABLE_FILE_VALIDATION=false`)
- `read_writer_file` checks `checkFileSizeLimit` before reading and surfaces `exceeds maximum allowed size` errors when the configured (env-overridable) limit is exceeded
- `list_writer_files` tracks depth (env-overridable) and skips symlinks, and returns `Error listing files: Directory depth (...) exceeds ...` when exceeded
- Unit tests cover: size-limit rejection with env override, symlink rejection (skip on unsupported platforms), depth guard with env override, validation disabled flag, and default values when env vars unset
- Security test: path traversal via symlink properly blocked
- Tests: `bun test src/hooks/utils.test.ts` and `bun test tests/unit/tools.test.ts`
- **Rollback Strategy**: Feature flag `ENABLE_FILE_VALIDATION=false` bypasses all validation checks
- **Status**: [x]

### 2.4: File Operation Retry Logic
**File**: `src/tools/file-manager.ts`, `src/config/schema.ts`, `tests/unit/tools.test.ts`
**Size**: MEDIUM (3 files)
**Description**: Add configurable retry logic for writer file writes with exponential backoff and jitter
**Acceptance Criteria**:
- `PluginConfigSchema` now exposes `file_retry_enabled` (boolean, default true) and `max_file_operation_retries` (0–5, default 3) plus env overrides `FILE_RETRY_ENABLED` and `WRITER_MAX_RETRIES`
- `write_writer_file` reads the plugin config, respects the retry flag, and passes the configured retry count to `writeFileWithRetry`
- `writeFileWithRetry` retries only on `EBUSY`, `EAGAIN`, and `EMFILE`, uses delays 50ms, 100ms, 200ms (±20% jitter), and stops when the configured maximum is reached
- Unit tests cover jitter ranges, retryable vs non-retryable errors, disabling retries, retry limits, and actual transient-success integration
- **Rollback Strategy**: Set `FILE_RETRY_ENABLED=false` (or config flag) to bypass retries
- **Status**: [x]

### 2.5: Markdown AST Performance Caching
**File**: `src/hooks/extractors.ts`, `src/state.ts`, `src/hooks/extractors.test.ts`
**Size**: MEDIUM (3 files)
**Description**: Cache markdown ASTs with TTL, entry/size limits, and cache metrics
**Acceptance Criteria**:
- The cache stores up to 500 entries, 50 MB of serialized data, and expires entries after 5 minutes
- Metrics `cacheHits`, `cacheMisses`, and `cacheSizeBytes` live in `swarmState.cacheStats` and update on hits/misses
- `extractCurrentPhase`, `extractIncompleteTasks`, and `extractDecisions` use `parseMarkdownWithCache()` to parse while triggering cache stats
- Extractor tests reset the cache, assert hit/miss behavior, and confirm consistent results
- **Status**: [x]

## Phase 3: Major and Refactoring (4 tasks, completed)

### 3.1: Prototype Pollution Protection
**File**: `src/config/loader.ts:72-78`
**Size**: SMALL (1 file)
**Severity**: CRITICAL (prototype pollution is a security risk)
**Description**: Fix prototype pollution vulnerability in `deepMerge` function
**Acceptance Criteria**:
- `deepMerge` creates objects via `Object.create(null)` (no prototype)
- Keys `__proto__`, `constructor`, `prototype` rejected in override objects
- Introduce the configuration property `config_validation_enabled` (default `true`) that gates the prototype-pollution guard and can be overridden via the `CONFIG_VALIDATION_ENABLED` environment variable
- Tests verify the guard blocks prototype injection and that the flag can disable it without affecting other validation flags
- Add or extend `src/config/loader.test.ts` to assert the injection is blocked, that `config_validation_enabled=false` (or `CONFIG_VALIDATION_ENABLED=false`) bypasses the guard, and that the flag can coexist with `FILE_VALIDATION_ENABLED`
- Document the `config_validation_enabled` flag (and its `CONFIG_VALIDATION_ENABLED` env override) in the plugin README so operators know how to toggle the guard
- Security test: Attempt prototype pollution via config → operation blocked
- **Status**: [x]

### 3.2: Token Estimation Documentation
**File**: `src/hooks/utils.ts:85-91`
**Size**: SMALL (1 file)
**Description**: Document token estimation formula and add accuracy disclaimer
**Acceptance Criteria**:
- Function includes JSDoc comment: `@param text - Input text to estimate`
- Comment includes: formula (`Math.ceil(text.length * 0.33)`), accuracy disclaimer ("±40% variance for English text"), use case guidance ("suitable for rough budgeting, not precise counting")
- No implementation change required
**Status**: [x]

### 3.3: Remove Redundant Hook Wrapping
**File**: `src/hooks/utils.ts:23-36`
**Size**: SMALL (1 file)
**Description**: Remove redundant `safeHook` wrapping inside `composeHandlers`
**Acceptance Criteria**:
- `composeHandlers` no longer wraps individual handlers in `safeHook`
- Error handling behavior unchanged (errors still caught by outer `safeHook`)
- Tests verify: all handlers execute, errors still caught, no duplicate error logging
**Status**: [x]

### 3.4: Null Safety in Delegation Tracker
**File**: `src/hooks/delegation-tracker.ts:32-33`
**Size**: SMALL (1 file)
**Description**: Add null check before pushing to delegation chain array
**Acceptance Criteria**:
- Replace `chain?.push(entry)` with explicit handling (e.g., `if (chain) { chain.push(entry); } else { swarmState.delegationChains.set(input.sessionID, [entry]); }`).
- Add a unit test that clears the delegation map and ensures a delegation entry is recorded without throwing when the chain is undefined.
- Document the rationale in comments so future readers understand why we guard the chain.
- **Status**: [x]

## Phase 4: MINOR Findings and Enhancements (6 tasks)

### 4.1: Plugin Initialization Logging
**File**: `src/index.ts:24-35`
**Size**: SMALL (1 file)
**Description**: Emit structured startup logs and safe config metadata per observability guidance
**Acceptance Criteria**:
- Log an INFO banner such as `[WRITER_SWARM INIT] agents=<count> configKeys=<sorted keys> directory=<sanitized>` with an ISO timestamp
- Respect safe logging: include agent count, directory (relative or sanitized), and only config key names (no secret values)
- Do not log config values—only key names that pass the `_KEY`, `_SECRET`, `_TOKEN` redaction filter
- Any environment-derived metadata must also obey the redaction filter; do not log raw env values unless explicitly allowed
- Support `VERBOSE_INIT` or `LOG_LEVEL=debug` to emit additional metadata while defaulting to WARN for normal operations
- Document the log format, flag controls, and safe metadata in `.swarm/context.md`
- Add a unit test that mocks `console.log` to verify the formatted banner and sanitization behavior (e.g., secrets removed via `_KEY|_SECRET|_TOKEN` filtering)
- Leverage `tests/unit/index.test.ts` to cover plugin initialization logging, the system enhancer hook, and the logger utilities so the new metadata code is exercised
- Introduce the environment flag `LOG_REDACTION_ENABLED` (default `true`) so redaction can be disabled for debugging if needed
- **Status**: [x]

### 4.2: Type Safety for Configuration Objects
**File**: `src/index.ts:18-70`
**Size**: SMALL (1 file)
**Description**: Define a `PluginInitConfig` interface for the OpenCode config hook and guard agent records as per TypeScript guidance
**Acceptance Criteria**:
- Export `PluginInitConfig` (documented with JSDoc) that describes `agent?: Record<string, SDKAgentConfig>` and any required hooks
- Use `PluginInitConfig` as the type for the `config(opencodeConfig)` parameter in the plugin and guard `config.agent` with `if (!config.agent)` before merging
- When the guard triggers, log the warning message "Missing config.agent - injecting defaults" and inject a fresh `Record<string, SDKAgentConfig>` fallback record
- Avoid optional chaining when reading or merging `config.agent`; log a warning if the agent map is missing rather than ignoring it
- Document the interface shape and fallback behavior in `src/index.ts`
- Add a test that uses a stub logger to verify the warning is emitted and defaults are injected when `config.agent` is absent
- **Status**: [x]

### 4.3: Module Placement Documentation
**File**: `.swarm/context.md`
**Size**: SMALL (documentation-only)
**Description**: Capture the rationale for keeping extractor utilities near hook logic and note when relocation would be justified
**Acceptance Criteria**:
- Expand the decision entry in `.swarm/context.md` to mention the extractor utilities’ reliance on shared hook state, logging metadata, and why they stay in `hooks/`
- Document signals (new consumers outside hooks, heavy reuse) that would trigger moving `extractors.ts` to `utils/parsing/`
- Include a reference to the observability guidance so future maintainers know why the placement matters for logging/metrics
- Schedule the documentation after Tasks 3.1–3.4 are merged so the recorded rationale reflects the finalized code structure
- Owner (mega architect) will revisit `.swarm/context.md` after Phase 3 merges to confirm the documentation reflects the final dependency state
- **Status**: [x]

### 4.4: Record Usage Enforcement
**File**: `scripts/check-records.ts`
**Size**: SMALL (1 file + lint integration)
**Description**: Block unqualified `Record<string, unknown>` usage via a dedicated lint script
**Acceptance Criteria**:
- `scripts/check-records.ts` walks every `.ts` file (excluding `node_modules`, `dist`, `.swarm`, and generated artifacts) and fails when `Record<string, unknown>` appears without the `RECORD-JUSTIFIED` comment
- The `lint` script now runs this script before `biome lint .`
- Existing dynamic `Record<string, unknown>` usages declare the `// RECORD-JUSTIFIED` justification comment where appropriate
- **Status**: [x]

### 4.5: Coverage Gate
**File**: `scripts/check-coverage.ts`
**Size**: SMALL (1 file)
**Description**: Fail CI when overall line coverage drops below 90%
**Acceptance Criteria**:
- Script runs `bun test --coverage`, captures both stdout/stderr, and parses the `All files` line to extract line coverage
- The command `bun run scripts/check-coverage.ts` exits non-zero when coverage < 90% and prints the percentage for verification
- Add a `check-coverage` script to `package.json` so CI can call it directly
- **Status**: [x]

### 4.6: Configuration Documentation
**File**: `README.md`
**Size**: SMALL (1 file)
**Description**: Document the new configuration and environment flags for file validation, retries, and logging
**Acceptance Criteria**:
- Added a "Configuration" section describing `config_validation_enabled` (`CONFIG_VALIDATION_ENABLED`), `FILE_VALIDATION_ENABLED`, `FILE_RETRY_ENABLED`/`WRITER_MAX_RETRIES`, `LOG_REDACTION_ENABLED`, and `VERBOSE_INIT`/`LOG_LEVEL`
- Clarified the default behavior and how operators can override each flag
- **Status**: [x]


## Dependencies Between Tasks

### Blocking Relationships
- 3.4 (Null Safety in Delegation Tracker) should only begin once 3.3 (Hook composition cleanup) is complete and committed because both edit `src/hooks/utils.ts`, so coordinating the order avoids merge conflicts.
- 4.3 (Module Placement Decision) depends on Tasks 3.1–3.4 being complete so the documented rationale reflects the current structure.

### Independent Tasks (Can Proceed in Parallel)
- 3.1 (Prototype Pollution) - Security critical, can proceed immediately
- 3.3 (Hook Wrapping) - Standalone optimization
- 4.1 (Initialization Logging) - Standalone improvement
- 4.2 (Type Safety) - Standalone improvement
- 4.3 (Module Location) - Can proceed after Phase 2

## Testing Strategy

### Required Testing
- **Unit Tests**: All error handling improvements
- **Integration Tests**: File operations with retry logic
- **Performance Benchmarks**: Markdown parsing improvements (caching)
- **Security Tests**: Path traversal protection, prototype pollution prevention
- **Type Safety**: TypeScript compiler strict mode verification

### Test Coverage Requirements
- 90%+ code coverage for modified files
- All security-critical paths tested
- Edge cases documented and tested

## Risk Mitigation & Rollback Strategy

### Security Changes (Tasks 2.3, 2.4, 3.1)
- **Feature Flags**: All security validation can be disabled via config:
  - `FILE_VALIDATION_ENABLED=false` (disables size/depth/symlink checks introduced in Task 2.3)
  - `FILE_RETRY_ENABLED=false` (disables retry logic introduced in Task 2.4)
  - `config_validation_enabled=false` (disables the prototype-pollution guard added in Task 3.1 and can be overridden by `CONFIG_VALIDATION_ENABLED`)
- **Rollback**: Disable the appropriate flag → behavior reverts to previous implementation
- **Deployment**: Feature flags default to `true`; gradual rollout via config update
- The `config_validation_enabled` guard is evaluated when the plugin loads its configuration and can be toggled before runtime via `CONFIG_VALIDATION_ENABLED`.
-- **Rollback for Task 3.1**: Set `config_validation_enabled=false` (or `CONFIG_VALIDATION_ENABLED=false`) before the plugin starts, restart the plugin, and rerun `bun test src/config/loader.test.ts` to verify the regression is undone.
- **Logging Rollback**: Setting `LOG_REDACTION_ENABLED=false` turns off the redaction behavior added in Task 4.1, reverting to the prior log format for troubleshooting.

### Performance Changes (Task 2.5)
- **Cache Size Limits**: Hard limits prevent memory exhaustion (500 entries, 50MB)
- **Fallback**: If cache initialization fails, continue without caching
- **Monitoring**: Cache metrics logged to detect issues

## CI/CD Updates Required

### Pre-Implementation
- [x] Add lint rule: No `Record<string, unknown>` without documented justification
- [ ] Add type check: Strict TypeScript compilation passes
- [ ] Add security scan: Dependency audit for markdown parsing libraries

### Post-Implementation  
- [ ] Update CI: New test suites pass (security, performance, integration)
- [ ] Update CD: Build pipeline includes security validation step
- [x] Documentation: Update README with security configuration options

## Resolved Decisions

1. **Retry Configuration**: A single global retry setting (`file_retry_enabled` / `max_file_operation_retries`) controls write retries; overrides are exposed via `FILE_RETRY_ENABLED` and `WRITER_MAX_RETRIES`.

2. **Cache Persistence**: Markdown AST caching remains in-memory with TTL/size limits—no disk persistence is needed.

3. **Logging Level**: Default logs are at `WARN`; enable debug logs with `OPENCODE_WRITER_SWARM_DEBUG=1` if more verbosity is required.

4. **Performance Targets**: Re-parsing the same markdown 100 times should complete inside 500ms thanks to the cache, and cache metrics will validate this.

5. **Security Posture**: Validation failures stop execution (fail-secure) unless explicitly bypassed via feature flags (e.g., `FILE_VALIDATION_ENABLED=false`).

## Implementation Timeline

**Week 1**:
- Day 1-2: Tasks 2.1, 2.2 (Error handling foundation)
- Day 3-4: Tasks 2.3, 2.4 (File security and retry)
- Day 5: Task 3.1 (Prototype pollution fix)

**Week 2**:
- Day 1-2: Task 2.5 (Markdown caching performance)
- Day 3: Task 3.2 (Token estimation documentation)
- Day 4: Task 3.3 (Hook composition cleanup)
- Day 5: Task 3.4 (Delegation tracker null safety)

**Week 3**:
- Day 1-2: Tasks 4.1 and 4.2 (Observability and type safety)
- Day 3-4: Task 4.3 (Module placement documentation) and CI/CD updates/documentation
- Day 5: Final testing and release preparation
