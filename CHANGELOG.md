# Changelog

## Unreleased

- Fixed `ENOENT: no such file or directory, uv_spawn` when running
  `CodexAgent` or `ClaudeAgent` on Windows. Both now resolve the configured
  command through its `.exe`/`.cmd`/`.bat` sibling before spawning, instead of
  handing `Bun.spawn` the bare, extension-less npm shim name it cannot
  execute directly.
- Removed the general-purpose `deer-workflow agent` CLI command. Agent runtime
  selection remains available on `deer-workflow create`.

## 0.2.0 - 2026-07-27

- Added `ClaudeAgent`, a built-in Agent Harness backed by Claude Code CLI, with
  text and JSON Schema output, sandbox mapping, cancellation, and actionable
  installation errors.
- Added `--agent codex|claude` to the `agent` and `create` CLI commands, with
  Codex remaining the default runtime.

## 0.1.0 - 2026-07-26

- Added an interactive `🦌 Deer Workflow` TUI for long-running CLI commands.
  Workflow runs show metadata-backed phase states beside live Markdown logs,
  while default-mode redirected stderr retains JSONL events.
- Added `deer-workflow run --print` / `-p` as the recommended server and
  automation interface, exposing a stdout-only JSONL Workflow Event Stream.
- Added runtime validation and `workflow:meta` events for Workflow metadata.
- Improved Workflow generation feedback and examples, including an immediate
  source placeholder and a self-contained interactive HTML output for Deep
  Research.

## 0.0.1 - 2026-07-26

- Initial public release of the deterministic TypeScript Workflow runtime,
  including Agent adapters, Flow primitives, lifecycle events, logging, and the
  reusable Workflow Runner.
- Added the `deer-workflow` CLI for running and generating Workflows, together
  with the
  [bundled Workflow Creator Skill](./skills/workflow-creator/), runnable
  examples, and bilingual documentation.
