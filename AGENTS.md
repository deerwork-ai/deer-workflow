# deer-workflow

`deer-workflow` is an open-source reimplementation of the Dynamic Workflow idea. The canonical repository is `https://github.com/deerwork-ai/deer-workflow`.

The runtime keeps deterministic orchestration in TypeScript and delegates semantic work to replaceable Agent runtimes. The default Agent runtime is Codex CLI.

Do not copy private or proprietary implementations. Reproduce public behavior through clean-room interfaces, tests, and documentation.

## Runtime

- Use Bun for package management, scripts, tests, and process execution.
- Use strict TypeScript.
- Publish the package as `@deerwork-ai/deer-workflow` while keeping the CLI command
  named `deer-workflow`.
- Document `bun install --global @deerwork-ai/deer-workflow` as the primary global
  CLI installation. Use the GitHub installation only when explicitly
  describing an unreleased repository snapshot.
- Never describe bare `bun install` as a global installation; in this
  repository it installs local development dependencies and Git hooks.
- Keep `deer-workflow run` as the Workflow execution command.
- Keep `deer-workflow create` as the Agent-backed generator. It accepts a user
  prompt from arguments or stdin, explicitly directs the selected Agent to the
  bundled `skills/workflow-creator/SKILL.md`, appends the user prompt, and
  writes only generated source to stdout.
- Keep Codex as the default CLI Agent runtime. Let the `create` command select
  Codex, Claude Code, DeepSeek Harness, or Pi with
  `--agent codex|claude|dsh|pi`. Document the option and its Codex default in
  top-level and `create` help.
- Resolve the [bundled Skill](./skills/workflow-creator/) relative to the
  installed CLI module so `create` works from a global GitHub or npm
  installation. Do not depend on the caller having installed
  `workflow-creator` in a Codex Skill search directory.
- Run the create Agent with a read-only sandbox and allow Codex execution
  outside a Git repository. Strip one enclosing Markdown source fence before
  writing stdout so shell redirection produces a runnable source file. Before
  starting the Agent, write a valid source comment naming the selected Agent
  to stdout so a redirected target is immediately non-empty.
- Route CLI Workflow events to stderr as JSON Lines when stderr is redirected.
  In an interactive terminal, drive the run TUI from typed events instead.
  Keep the final result on stdout in both default modes. With `run --print` or
  `run -p`, disable the TUI, write one JSON event per stdout line, reserve
  stderr for CLI diagnostics, and suppress the separate final result. Present
  Print Mode as the recommended interface for servers and automation.
- Resolve optional run input in this order: `--input`, `--input-file`, then
  non-empty stdin. Reject simultaneous `--input` and `--input-file`; explicit
  options take precedence over stdin.
- Use the `tsconfig.json` path aliases to exercise public
  `@deerwork-ai/deer-workflow/*` imports locally.
- Keep runnable examples under `examples/<example-name>/`, with types in
  `types.ts`, the Workflow entry point in `workflow.ts`, and reciprocal English
  and Simplified Chinese README files.
- Link relevant examples from both language variants of the root README,
  Getting Started guide, and API reference.
- Keep the CLI entry point at `src/cli.ts`.
- Keep all Agent type aliases and interfaces in `src/agents/types.ts`.
- Keep the vendor-neutral Agent binder in `src/agents/agent.ts`.
- Keep Codex-specific process handling in `src/agents/codex-agent.ts`.
- Keep Pi-specific process, structured-output, and tool-policy handling in
  `src/agents/pi-agent.ts`.
- Keep DeepSeek Harness-specific process and structured-output handling in
  `src/agents/deepseek-harness-agent.ts`.
- Detect a missing Codex executable before creating temporary files or starting
  a process. The error must include official CLI installation steps and state
  that Codex CLI and Codex Desktop are separate installations.
- Re-export the default `agent()` function from `src/agents/index.ts`.
- Keep all Flow type aliases and interfaces in `src/flow/types.ts`.
- Keep deterministic orchestration primitives in `src/flow/`.
- Mirror flow tests under `tests/flow/`.
- Keep all Logging type aliases and interfaces in `src/logging/types.ts`.
- Keep Logging implementations in `src/logging/` and tests in
  `tests/logging/`.
- Keep all Workflow Event type aliases and interfaces in `src/events/types.ts`.
- Keep Event implementations in `src/events/` and tests in `tests/events/`.
- Keep all Runner type aliases and interfaces in `src/runner/types.ts`.
- Keep Runner implementations in `src/runner/` and tests in `tests/runner/`.
- Write `log()` messages directly to stderr when no Log Sink is active.
- Emit Runner events as JSON Lines. A standalone Runner's default `logWriter`
  calls `console.log` once per event, while the CLI sends redirected events to
  stderr and uses typed events for its interactive TUI so stdout remains
  reserved for the final result.
- Keep Workflow arguments and results out of events by default. Event payloads
  must remain JSON-safe and suitable for external process boundaries.
- Workflow modules export a handler as either `default` or `run`.
- Workflow Creator output also exports a pure-literal `meta` object with a
  kebab-case `name`, one-line `description`, and unique `phases` whose titles
  exactly match `phase()` calls, plus JSON-safe `exampleArgs` whose keys match
  Handler `args` properties. The Runner validates this export and emits
  `workflow:meta`; the interactive CLI uses its phase plan in the run TUI, and
  `create` uses the example args in its next command.
- The interactive run TUI identifies the Workflow name, module path, and
  working directory. It displays metadata phases beside Markdown logs and uses
  a looping highlight sweep only on the active phase.
- Name the Handler's first caller-input parameter `args`. It is an ordinary
  function parameter, not a JavaScript global.
- Workflow modules import APIs explicitly from `@deerwork-ai/deer-workflow` or its
  subpaths. The Runner injects async-local lifecycle, phase, event, and logging
  context; it does not install API functions on `globalThis` or pass them as a
  destructured handler argument.
- Resolve nested Workflow paths relative to their parent module.
- Keep Workflow nesting limited to one level unless the public contract changes.

## Flow contract

- `parallel()` starts every lazy task immediately, waits for all tasks to
  settle, and preserves input order. A synchronous throw or rejected Promise
  becomes `null` without cancelling sibling tasks.
- `pipeline()` lets each item advance through its stages independently without
  a global stage barrier. A failed item becomes `null`, skips its remaining
  stages, and does not cancel sibling items. Preserve stage-to-stage type
  inference for up to five stages.
- The Flow primitives do not currently impose a concurrency or item-count
  limit. Adding limits, queues, retries, fail-fast behavior, or cancellation
  propagation is a public contract change.
- Callers must handle nullable `parallel()` and `pipeline()` results explicitly
  and decide whether partial completion is acceptable.
- Workflow branches share one phase state. Set `phase()` before entering
  `parallel()` or `pipeline()`; do not change the phase from concurrent tasks
  or stages.
- Repeating the active phase title is a no-op. Changing the title ends the
  previous phase before starting the new one, and Workflow success or failure
  ends any active phase.

## Workflow execution contract

- A host-started relative Workflow path resolves from the current working
  directory. A nested relative path resolves from the parent Workflow module.
  Continue to accept absolute paths, `file:` URLs, and `{ scriptPath }`
  references.
- When a Workflow module exports both `default` and `run`, prefer `default`.
  Emit `workflow:start` before loading the module, and emit exactly one
  terminal `workflow:end` or `workflow:error` event after execution begins.
- Preserve the event protocol types: `workflow:start`, `workflow:meta`,
  `workflow:end`, `workflow:error`, `workflow:phase:start`,
  `workflow:phase:end`, and `log`. Keep their existing context, metadata,
  duration, phase, message, and serialized error fields compatible.
- `WorkflowEventEmitter` invokes listeners synchronously in subscription order.
  Each Emitter assigns its own monotonically increasing sequence and ISO-8601
  timestamp, and freezes the completed event object before delivery.
- A `WorkflowRunner` may be reused and may run Workflows concurrently.
  Executions keep separate async-local Workflow and Logging contexts while
  sharing the Runner's Emitter and sequence space.
- `WorkflowRunner.dispose()` removes only the JSON writer installed by the
  Runner, preserves external event listeners, is idempotent, and prevents
  future `run()` calls.
- Keep CLI result serialization stable: `undefined` writes nothing, strings
  are written as text, and every other result is serialized with
  `JSON.stringify()` on one line. A serialization failure makes the command
  fail rather than falling back to descriptive text.

## Commands

```bash
bun install
bun run lint
bun run format:check
bun run prepare
bun run typecheck
bun test
bun run check
bun run dev -- create "Create a research Workflow"
```

Run `bun run check` before handing off a change.

## package.json scripts

The root `package.json` is the source of truth for project commands:

| Script                  | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `bun run dev -- <args>` | Run the TypeScript CLI entry point directly and forward arguments to it. |
| `bun run lint`          | Lint JavaScript and TypeScript without modifying files.                  |
| `bun run lint:fix`      | Apply safe ESLint fixes.                                                 |
| `bun run format`        | Format supported repository files with Prettier.                         |
| `bun run format:check`  | Check Prettier formatting without modifying files.                       |
| `bun run lint:staged`   | Run the pre-commit checks against Git-staged files.                      |
| `bun run prepare`       | Install the repository-managed Husky hooks.                              |
| `bun test`              | Run every test under the top-level `tests/` directory.                   |
| `bun run typecheck`     | Type-check both `src/` and `tests/` without emitting files.              |
| `bun run check`         | Run type-checking, lint, format checks, and the complete test suite.     |

Keep script names stable. When adding or changing a script, update this table
and the corresponding table in both language variants of `docs/index.md`.

## Quality gates

- Use ESLint Flat Config from `eslint.config.js`.
- Use Prettier as the only code formatter.
- Keep `.husky/pre-commit` limited to `lint-staged` followed by the project-wide
  `typecheck`; do not run the complete test suite during a commit.
- Keep staged-file commands in `lint-staged.config.js`.
- Preserve lint-staged's default backup stash and rollback behavior.

## Agent contract

- `agent(prompt, options)` represents a complete Agent Loop, not a single model completion.
- JSON Schema constrains the final Agent response only.
- A schema-backed call returns parsed JSON; a call without a schema returns text.
- The Agent runtime is responsible for enforcing a supplied JSON Schema. The
  shared Deer Workflow contract transports the schema and parses the final
  response; the TypeScript output generic is not runtime validation.
- Per-run `AgentOptions` override runtime constructor defaults. Merge process,
  runtime, and per-run environments in that order; an `undefined` value removes
  that environment variable.
- An already-aborted signal must fail before starting the Agent process.
  Aborting an active run must terminate its subprocess, remove the abort
  listener, propagate the abort reason, and still clean up temporary files.
- Keep the generic Agent interface independent from Codex CLI flags whenever possible.
- New runtimes should implement the same `Agent` interface and remain swappable.

## Public package contract

- Preserve the package root and the focused `./agents`, `./events`, `./flow`,
  `./logging`, and `./runner` export paths. Add public APIs through the relevant
  `index.ts` and re-export them from `src/index.ts` when they belong at the
  package root.
- The package currently publishes Bun-runnable TypeScript source directly:
  package exports point to `src/**/*.ts` and the CLI `bin` points to
  `src/cli.ts`. Introducing compiled `dist` artifacts, a build step, or Node.js
  runtime compatibility is a release architecture change that requires
  coordinated export, bin, installation, test, and documentation updates.

## Release process

- Treat the user's instruction `publish` as explicit authorization to
  execute the complete release process end to end, including preparing and
  committing release changes, pushing `main`, publishing to npm, creating and
  pushing the tag, creating the GitHub Release, and publishing to GitHub
  Packages. Do not stop merely to ask for confirmation of these steps.
- Releases are made from a clean `main` branch that is synchronized with
  `origin/main`. Do not publish from an uncommitted worktree or an unpushed
  commit.
- Start every release by creating or updating the root `CHANGELOG.md`. Move the
  relevant entries from `Unreleased` into a version heading with an ISO date,
  then add a fresh empty `Unreleased` section. Mention only substantial,
  user-visible changes as individual entries; consolidate small fixes instead
  of enumerating them, using a concise summary such as `Minor bug fixes`.
- Update the English and Simplified Chinese installation and API documentation
  whenever a release changes package requirements, commands, or public
  behavior.
- Set an explicit release version with
  `bun pm version <version> --no-git-tag-version`. Keep `package.json` and
  `bun.lock` synchronized, and inspect their diff before continuing.
- Confirm the version is not already present in the registry before publishing.
  npm versions are immutable; never attempt to reuse a version that reached
  the registry.
- Before the next release, add and then maintain a `package.json` `files`
  allowlist containing the runtime `src/` tree and bundled
  `skills/workflow-creator/` tree. README, license, and package metadata may be
  included as standard package files; exclude tests and repository tooling.
- Run `bun run check` after the changelog, documentation, and version changes.
  A release must not proceed unless the complete quality gate passes.
- Inspect the npm payload with `bun pm pack --dry-run --ignore-scripts`.
  Published files must be intentional and must not include tests, Git hooks,
  repository instructions, credentials, or unrelated development artifacts.
- Build the exact release tarball with
  `bun pm pack --ignore-scripts --destination dist` in the ignored `dist/`
  directory. Smoke-test that tarball in a new temporary project, including a
  package import and `deer-workflow --help`.
- Commit the version, changelog, documentation, and packaging changes together
  as `release: prepare v<version>`, then push `main` before publishing.
- Publish the tested tarball with
  `bun publish <tarball> --access public --tag latest`. Never expose npm
  passwords, one-time codes, recovery codes, or tokens in source, logs, commit
  messages, or diagnostics.
- Verify the exact version and `latest` dist-tag with `npm view`, then install
  that exact registry version in a fresh temporary project and rerun the import
  and CLI smoke tests.
- Create and push the annotated `v<version>` Git tag only after the registry
  verification succeeds. Then create the GitHub Release from that existing tag
  with `gh release create v<version> --verify-tag --generate-notes`.
- Creating the GitHub Release must trigger
  `.github/workflows/publish-github-package.yml`. Monitor the corresponding
  GitHub Actions run through completion and verify that the exact version is
  available in GitHub Packages. If the release event does not trigger the
  workflow, dispatch it manually and monitor that run instead.
- If publication fails before npm accepts the version, fix the cause, rerun all
  checks, rebuild the tarball, and retry. If npm accepted a broken version,
  never overwrite it; publish a new patch version.

## Process safety

- Spawn commands with argument arrays. Never construct shell command strings from prompts.
- Send prompts over stdin instead of embedding them in a shell command.
- Default to ephemeral Codex sessions.
- Do not enable `danger-full-access` implicitly.
- Never log credentials or copy the entire parent environment into diagnostics.
- Create schema and result files in a unique temporary directory and remove it in `finally`.
- Preserve stderr on failures so callers can diagnose missing authentication, sandbox denials, and CLI errors.

## Testing

- Unit tests must not call the real Codex service.
- Keep all test files under the top-level `tests/` directory and mirror the
  relevant `src/` structure where practical.
- Use a local stub process to test argument construction, stdin handling, structured output, and failures.
- Add integration tests that invoke Codex only behind an explicit environment flag.
- Test both text output and JSON Schema output for every Agent adapter.

## Style

- Prefer small modules with explicit public types.
- Export types with `export type`.
- Keep English documentation at the canonical `*.md` path and place Simplified
  Chinese translations beside it as `*.zh-CN.md`. Add reciprocal language
  links near the top of both files.
- Keep both root README files focused on project positioning, CLI trial
  commands, examples, and documentation links. Put API and runtime details in
  `docs/api.md` and `docs/api.zh-CN.md`.
- Organize each root README into two level-one reader paths: how to use the CLI
  and how to develop or contribute to the repository. Keep a two-level index
  that links each path and its level-two sections.
- Whenever a public API, event, Workflow, Agent, Runner, or CLI behavior
  changes, update its tests, `docs/api.md`, `docs/api.zh-CN.md`, and
  `skills/workflow-creator/references/api.md` in the same change.
- Also update `skills/workflow-creator/SKILL.md`,
  `skills/workflow-creator/references/patterns.md`, and
  `skills/workflow-creator/assets/workflow.ts` when a contract change affects
  generated Workflow guidance or templates.
- Add `Co-authored-by: Codex <codex@openai.com>` to commits containing changes
  materially authored with Codex, unless the user requests otherwise.
- Document every public API with TypeDoc comments, including parameters,
  return values, generics, thrown errors, and non-obvious runtime semantics.
- Avoid `any`; use `unknown` at external boundaries and narrow it.
- Include actionable context in thrown errors without exposing secrets.
- Add comments only when they explain a non-obvious constraint.
