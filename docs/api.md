# API Reference

[English: README](../README.md) ·
[Guide](./index.md) ·
[API](./api.md) |
[简体中文：README](../README.zh-CN.md) ·
[快速入门](./index.zh-CN.md) ·
[API](./api.zh-CN.md)

Public APIs are available from the package root and from focused subpath
exports:

```typescript
import {
  agent,
  log,
  parallel,
  phase,
  pipeline,
  workflow,
  WorkflowEventEmitter,
  WorkflowRunner,
} from "@deerwork-ai/deer-workflow";
```

Equivalent focused subpath imports:

```typescript
import { agent } from "@deerwork-ai/deer-workflow/agents";
import {
  parallel,
  phase,
  pipeline,
  workflow,
} from "@deerwork-ai/deer-workflow/flow";
import { WorkflowEventEmitter } from "@deerwork-ai/deer-workflow/events";
import { log } from "@deerwork-ai/deer-workflow/logging";
import { WorkflowRunner } from "@deerwork-ai/deer-workflow/runner";
```

## Workflow module contract

A runnable Workflow module uses explicit ESM imports and exports its Handler as
either `default` or a named `run` export.

### `meta`

A Workflow may describe itself with a static `meta` export:

```typescript
export const meta = {
  name: "workflow-name",
  description: "One-line description.",
  phases: [{ title: "Plan" }, { title: "Execute" }],
  exampleArgs: { topic: "A realistic example topic" },
};
```

- `name` is a stable, kebab-case identifier.
- `description` is a one-line summary of the Workflow.
- `phases` is an ordered list of `{ title }` objects. Its titles should exactly
  match the Workflow's `phase()` calls.
- `exampleArgs` is an optional JSON-safe object. Its keys match properties read
  from the Handler's `args` parameter and provide a minimal runnable example.

Keep `meta` statically readable: use only literal values, arrays, and objects.
Do not use variables, function calls, spreads, computed properties, or template
literals. The runtime validates a present `meta` export after loading the
module and emits it as `workflow:meta` before invoking the Handler. Names must
be kebab-case, descriptions must be non-empty and one-line, and phase titles
must be non-empty and unique. Metadata remains optional for backward
compatibility.

### Handler arguments

```typescript
type WorkflowHandler<TArgs, TOutput> = (
  args: TArgs,
  context: Readonly<WorkflowExecutionContext<TArgs>>,
) => TOutput | PromiseLike<TOutput>;
```

`args` is the caller-provided input and should be the first Handler parameter.
It is not a JavaScript global such as `globalThis.args`. When the CLI does not
provide input, its value is `undefined`.

The second parameter, `context`, exposes the current execution context,
including the Runner, lifecycle, phase, event, and logging facilities. A
Workflow does not need to declare this parameter when it does not use it.

### Runtime context and imports

Workflow APIs are imported explicitly from `@deerwork-ai/deer-workflow`. The CLI does
not inject `agent`, `parallel`, `pipeline`, `phase`, `workflow`, or `log` as
globals. The Runner establishes the asynchronous execution context before
calling the Handler, allowing those imported APIs to access the active Workflow
lifecycle safely.

## Agents

### `agent()`

```typescript
function agent<TOutput = string>(
  prompt: string,
  options?: AgentOptions,
): Promise<TOutput>;
```

Runs a complete Codex CLI Agent Loop through the default `CodexAgent`. It
returns text when no `schema` is provided and parses the structured final
response when a JSON Schema is present.

```typescript
const result = await agent<{
  ok: boolean;
  issues: string[];
}>("Run all repository checks.", {
  cwd: process.cwd(),
  sandbox: "read-only",
  schema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      issues: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["ok", "issues"],
    additionalProperties: false,
  },
});
```

### `AgentOptions`

```typescript
interface AgentOptions {
  cwd?: string;
  model?: string;
  schema?: JsonSchema;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  additionalWritableDirectories?: string[];
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
}
```

The schema constrains only the final response. It does not reduce the Agent
Loop to a single model completion. A failed direct call rejects its Promise;
`agent()` does not convert failures to `null`.

### `defaultAgent`

```typescript
const defaultAgent: CodexAgent;
```

The shared `CodexAgent` instance used by the exported `agent()` function.

### `Agent`

```typescript
interface Agent {
  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

This is the vendor-neutral contract for adding another Coding Agent runtime.

### `CodexAgent`

```typescript
class CodexAgent implements Agent {
  constructor(config?: CodexAgentConfig);

  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

The default runtime uses non-interactive `codex exec`. Prompts are sent over
stdin, sessions are ephemeral by default, and temporary schema and result files
are removed after each call.

```typescript
interface CodexAgentConfig {
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral?: boolean;
  skipGitRepositoryCheck?: boolean;
  extraArgs?: string[];
  env?: Record<string, string | undefined>;
}
```

Failures and invalid schema-backed responses throw `CodexAgentError`, which
retains `exitCode`, `stdout`, and `stderr` for diagnostics.

When the configured executable cannot be resolved, `run()` throws
`CodexCliNotFoundError` before creating temporary files or starting a process.
Its message includes the official npm installation command, login and version
checks, and explains that Codex CLI is installed separately from Codex
Desktop.

### `ClaudeAgent`

```typescript
class ClaudeAgent implements Agent {
  constructor(config?: ClaudeAgentConfig);

  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

An Agent harness backed by the non-interactive `claude --print` command.
Prompts are sent over stdin, responses are parsed from
`--output-format json`, and sessions are ephemeral by default via
`--no-session-persistence`.

```typescript
import { ClaudeAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new ClaudeAgent({ model: "sonnet" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

```typescript
interface ClaudeAgentConfig {
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral?: boolean;
  extraArgs?: string[];
  env?: Record<string, string | undefined>;
}
```

`AgentOptions.sandbox` maps onto Claude Code's permission controls:
`"read-only"` uses `--permission-mode plan`, `"workspace-write"` uses
`--permission-mode acceptEdits`, and `"danger-full-access"` uses
`--dangerously-skip-permissions`. `AgentOptions.schema` is passed through
`--json-schema`; the parsed `structured_output` field is preferred, falling
back to parsing the `result` field as JSON.

Failures and invalid schema-backed responses throw `ClaudeAgentError`, which
retains `exitCode`, `stdout`, and `stderr` for diagnostics.

When the configured executable cannot be resolved, `run()` throws
`ClaudeCliNotFoundError` before starting a process. Its message includes the
official npm installation command and login check.

### `PiAgent`

```typescript
class PiAgent implements Agent {
  constructor(config?: PiAgentConfig);

  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

An Agent Harness targeting Pi Coding Agent 0.84.1. Text calls send the prompt
over stdin to an ephemeral `pi --print` process. Schema-backed calls use
`pi --mode json` and a unique per-run extension that registers a terminating
final-response tool with the supplied JSON Schema as its parameter schema.
`PiAgent` returns the details from the successful `tool_execution_end` event;
it does not treat best-effort JSON text as a validated response.

```typescript
import { PiAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new PiAgent({ model: "anthropic/claude-sonnet-4" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

```typescript
interface PiAgentConfig {
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  model?: string;
  sandbox?: AgentSandbox;
  ephemeral?: boolean;
  extraArgs?: string[];
  env?: Record<string, string | undefined>;
}
```

Pi 0.84.1 does not provide an operating-system Sandbox. `PiAgent` therefore
maps the shared policies conservatively:

- `read-only` enables only `read`, `grep`, `find`, and `ls`;
- `workspace-write` also enables `edit` and `write`, loads a path guard for
  `cwd` and `additionalWritableDirectories`, and does not enable bash; and
- `danger-full-access` uses Pi's normal host-process capabilities.

When `sandbox` is omitted, Pi retains its normal host-process behavior. Set an
explicit policy for unattended automation.

Discovered extensions and unapproved project resources are disabled for the
constrained modes so they cannot bypass the active tool policy. Symlink and
directory-traversal escapes are rejected by canonical path checks. Use an
external container, VM, or other OS boundary when unrestricted command
execution also needs host isolation.

`extraArgs` may configure non-protocol Pi features, but output, session,
extension, trust, and tool-control flags are reserved by the Harness and are
rejected when supplied there.

Process failures, invalid JSONL, and missing structured results throw
`PiAgentError`, which retains `exitCode`, `stdout`, and `stderr`. A missing
executable throws `PiCliNotFoundError` before temporary files are created and
includes installation and authentication steps for Pi 0.84.1. Per-run
extensions and policy files are removed after success, failure, or abort.

### `DeepSeekHarnessAgent`

```typescript
class DeepSeekHarnessAgent implements Agent {
  constructor(config?: DeepSeekHarnessAgentConfig);

  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

An Agent Harness backed by the non-interactive
`dsh --profile headless "<task>"` command from
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Each run
answers one task, prints the final assistant message to stdout, and exits.
The headless surface has no stdin prompt channel, so the task travels as a
command-line argument; processes are still spawned with argument arrays and
never through a shell.

```typescript
import { DeepSeekHarnessAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new DeepSeekHarnessAgent();
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

```typescript
interface DeepSeekHarnessAgentConfig {
  command?: string;
  commandArgs?: string[];
  cwd?: string;
  sandbox?: AgentSandbox;
  extraArgs?: string[];
  env?: Record<string, string | undefined>;
}
```

`AgentOptions.sandbox` maps one-to-one onto DeepSeek Harness's
`DSH_PERMISSION_MODE` environment variable: `"read-only"`, `"workspace-write"`,
and `"danger-full-access"` share the shared policy names verbatim. When
`sandbox` is omitted, `DSH_PERMISSION_MODE` is left untouched and DeepSeek
Harness applies its own `workspace-write` default.

The model cannot be overridden per run because the headless surface has no
model flag: DeepSeek Harness resolves it from the `agent-default-model`
setting in `$DSH_HOME/settings.yaml`. Supplying `AgentOptions.model` therefore
throws a `TypeError` instead of being silently ignored, as does
`AgentOptions.additionalWritableDirectories` (writes stay confined to the
session workspace and platform temporary roots).

`AgentOptions.schema` is embedded as a structured-output contract in the task,
and `DeepSeekHarnessAgent` parses the JSON object from the final message,
tolerating surrounding prose or Markdown fences. Session records persist under
`$DSH_HOME` for audit; there is no ephemeral-session switch.

Process failures and missing structured results throw
`DeepSeekHarnessAgentError`, which retains `exitCode`, `stdout`, and `stderr`.
A missing executable throws `DeepSeekHarnessCliNotFoundError` before a process
starts and includes the `bun install --global @deepseek-ai/dsh` installation
step.

## Flow

### `parallel()`

```typescript
function parallel<const TTasks extends readonly ParallelTask[]>(
  tasks: TTasks,
): Promise<ParallelResults<TTasks>>;
```

Starts all lazy tasks concurrently and waits for them to settle. Results retain
input order. A rejected or synchronously thrown task becomes `null` without
cancelling its siblings.

The current implementation starts every supplied task immediately and does not
document a concurrency or item-count limit.

```typescript
const [lint, typecheck, tests] = await parallel([
  () => runLint(),
  () => runTypecheck(),
  () => runTests(),
]);
```

### `pipeline()`

```typescript
function pipeline<TOriginal>(
  items: readonly TOriginal[],
  ...stages: Array<PipelineStage<unknown, TOriginal, unknown>>
): Promise<Array<unknown | null>>;
```

Moves each input independently through an ordered list of stages. An item can
enter its next stage immediately; it does not wait for a global stage barrier.

```typescript
const results = await pipeline(
  documents,
  (document) => extract(document),
  (content, original, index) => review(content, original, index),
  (review) => format(review),
);
```

Each stage receives the current value, original item, and original index:

```typescript
type PipelineStage<TValue, TOriginal, TNext> = (
  value: TValue,
  original: TOriginal,
  index: number,
) => TNext | PromiseLike<TNext>;
```

For the first stage, `value` is the original item rather than `undefined`.
When one item fails, its remaining stages are skipped and its final value is
`null`. Other items continue. Type inference is preserved for up to five
stages.

### `phase()`

```typescript
function phase(title: string): void;
```

Sets the active Workflow phase. A transition emits
`workflow:phase:end` for the previous phase followed by
`workflow:phase:start` for the new phase. Calling it outside a Workflow throws
`PhaseContextError`. Set phases before entering `parallel()` or `pipeline()`;
changing the shared phase from concurrent branches is race-prone.

### `getCurrentPhase()`

```typescript
function getCurrentPhase(): string | undefined;
```

Returns the active phase, or `undefined` outside a Workflow and before the
first `phase()` call.

### `workflow()`

```typescript
function workflow<TOutput = unknown, TArgs = unknown>(
  target: string | { scriptPath: string },
  args?: TArgs,
): Promise<TOutput>;
```

Loads and runs a Workflow module. The target must export a default function or
a named `run()` function:

```typescript
type WorkflowHandler<TArgs, TOutput> = (
  args: TArgs,
  context: Readonly<WorkflowExecutionContext<TArgs>>,
) => TOutput | PromiseLike<TOutput>;
```

A host-started Workflow has depth `0`. Nested paths resolve relative to the
parent Workflow file, and one nested level is currently supported. Invalid
modules throw `WorkflowLoadError`; exceeding the nesting limit throws
`WorkflowNestingError`. When the caller supplies no input, the handler's
`args` value is `undefined`.

### `getWorkflowContext()`

```typescript
function getWorkflowContext<TArgs = unknown>():
  WorkflowExecutionContext<TArgs> | undefined;
```

Returns the Workflow context for the current async call chain:

```typescript
interface WorkflowExecutionContext<TArgs = unknown> {
  readonly id: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly scriptPath: string;
  readonly args: TArgs;
  phase?: string;
}
```

## Logging

### `log()`

```typescript
function log(message: string): void;
```

Emits progress. Direct calls use stderr by default. Inside
`WorkflowRunner.run()`, each call becomes a `log` event handled by the Runner's
JSON writer. Messages may contain Markdown. JSONL consumers receive the
original Markdown string, while the interactive CLI TUI renders headings,
emphasis, inline code, links, quotes, lists, and fenced code blocks.

### `withLogSink()`

```typescript
function withLogSink<TOutput>(
  sink: (message: string) => void,
  callback: () => TOutput,
): TOutput;
```

Installs a Log Sink for one async call chain. Nested and concurrent scopes are
isolated with `AsyncLocalStorage`, and the parent sink is restored
automatically.

## Events

### Event protocol

```typescript
type WorkflowEventType =
  | "workflow:start"
  | "workflow:meta"
  | "workflow:end"
  | "workflow:error"
  | "workflow:phase:start"
  | "workflow:phase:end"
  | "log";
```

Every event contains context and envelope fields:

```typescript
interface WorkflowEventContext {
  readonly workflowId: string;
  readonly parentWorkflowId?: string;
  readonly depth: number;
  readonly scriptPath: string;
}

interface WorkflowEventEnvelope {
  readonly sequence: number;
  readonly timestamp: string;
}
```

Event-specific fields:

| Event                  | Additional fields           |
| ---------------------- | --------------------------- |
| `workflow:start`       | None                        |
| `workflow:meta`        | `meta`                      |
| `workflow:end`         | `durationMs`                |
| `workflow:error`       | `durationMs`, `error`       |
| `workflow:phase:start` | `phase`                     |
| `workflow:phase:end`   | `phase`, `durationMs`       |
| `log`                  | `message`, optional `phase` |

Errors are represented as JSON-safe objects:

```typescript
interface SerializedWorkflowError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}
```

### `WorkflowEventEmitter`

```typescript
class WorkflowEventEmitter {
  on(listener: WorkflowEventListener): () => void;
  off(listener: WorkflowEventListener): boolean;
  emit(input: WorkflowEventInput): WorkflowEvent;
  clear(): void;
  get listenerCount(): number;
}
```

A synchronous, typed Event Emitter. `emit()` adds a monotonically increasing
`sequence` and an ISO-8601 `timestamp`. Listeners run synchronously in
subscription order.

### `createJsonEventWriter()`

```typescript
function createJsonEventWriter(
  logWriter?: (line: string) => void,
): WorkflowEventListener;
```

Creates a listener that serializes each event as compact JSON. The writer is
called once per event without a trailing newline and defaults to `console.log`.

### `serializeWorkflowError()`

```typescript
function serializeWorkflowError(error: unknown): SerializedWorkflowError;
```

Converts any thrown value into a JSON-safe object containing `name`, `message`,
and an optional `stack`.

## Runner

### CLI

DeerWork asks the selected Coding Agent to apply
[Deer Workflow's bundled Workflow Creator Skill](../skills/workflow-creator/)
and generate a runnable TypeScript Workflow module:

```text
deer-workflow create "Describe the Workflow"
deer-workflow create --agent claude "Describe the Workflow"
deer-workflow create --agent pi "Describe the Workflow"
echo "Describe the Workflow" | deer-workflow create
```

`create --agent` accepts `codex`, `claude`, or `pi` and defaults to `codex`. The
option selects only the Workflow generator harness; there is no standalone
general-purpose Agent CLI command. Use the TypeScript `agent()` API inside
Workflow modules.
`create` resolves the
[bundled Skill](../skills/workflow-creator/) from the installed package, asks
the selected Agent to read it and its required references, then appends the
user's prompt. The Agent runs with a read-only sandbox. Codex may also run
outside a Git repository; Pi uses its read-only built-in tool allowlist. One
enclosing Markdown source fence is removed, so
stdout can be redirected directly to a `.ts` or `.js` file. Before generation
begins, stdout receives a valid source comment naming the selected Agent, so a
redirected target is immediately non-empty while generation runs. The
generated Workflow is not executed.

When stderr is attached to an interactive terminal, `create` explains that
generation with the selected Agent usually takes 1–5 minutes and shows an
indefinite animated progress indicator with elapsed time until generation
finishes. The indicator ends with a copyable next-step example,
`deer-workflow run ./workflow.ts --input '{"topic":"..."}'`, derived from the
generated Workflow's example arguments. It is disabled when stderr is
redirected, so generated source and scripted output remain unchanged.

Install the
[bundled Workflow Creator Skill](../skills/workflow-creator/) for other Agents:

```text
deer-workflow skill install
```

`skill install` checks the existing `~/.agents/skills` and
`~/.claude/skills` directories. It copies `workflow-creator` into each
directory that exists, updates files from the bundled version when necessary,
skips missing directories, and reports every destination. It does not create
an Agent's parent Skill directory. Pi 0.84.1 discovers the shared
`~/.agents/skills` destination.

Run a Workflow module:

```text
deer-workflow run <workflow>
deer-workflow run <workflow> --print
deer-workflow run <workflow> --input '<json>'
deer-workflow run <workflow> --input-file <path>
echo '<json>' | deer-workflow run <workflow>
```

`run` rejects simultaneous `--input` and `--input-file`. It resolves input from
`--input`, then `--input-file`, then non-empty stdin; an explicit option takes
precedence over stdin. Invalid JSON, loading failures, and execution failures
produce a non-zero exit status.

`--print` (short form `-p`) disables the TUI and writes each Workflow event
immediately to stdout as one compact JSON line. It suppresses the separate
Workflow result so stdout remains a pure JSONL Event Stream; stderr is reserved
for CLI diagnostics. This is the recommended mode for servers, CI/CD, task
queues, process pipelines, automation runners, and event collectors:

```text
deer-workflow run ./workflow.ts -p --input '{"topic":"..."}' > events.jsonl
```

The CLI constructs a `WorkflowRunner`. Outside Print Mode, redirected stderr
receives every event as JSONL. In an interactive terminal, events instead drive
a responsive TUI: declared `meta.phases` appear on the left with pending,
active, completed, or failed states, while rendered Markdown logs scroll on the
right.
The header identifies the Workflow by `meta.name`, its module path, and the
current working directory. The active phase combines a spinner with a
continuously sweeping highlight across its title; completed, pending, and
failed phases remain visually stable. Narrow terminals switch to a stacked
layout. Outside Print Mode, a string result is written directly to stdout,
another JSON-serializable value is written as compact JSON, and `undefined`
produces no result line.

The shared TUI activates only when stderr is an interactive terminal and
`TERM` is not `dumb`. It honors `NO_COLOR` while retaining animation and
automatically renders success or failure before the CLI prints final output or
error details. The header uses `🦌 Deer Workflow` consistently across
long-running commands.

### `WorkflowRunner`

```typescript
class WorkflowRunner {
  readonly events: WorkflowEventEmitter;

  constructor(options?: WorkflowRunnerOptions);

  run<TOutput = unknown, TArgs = unknown>(
    target: WorkflowTarget,
    args?: TArgs,
  ): Promise<TOutput>;

  on(listener: WorkflowEventListener): () => void;
  dispose(): void;
}
```

Runs Workflows and exposes lifecycle, phase, and log events through one stream.
A standalone Runner writes each event to stdout as one JSON line by default.
The CLI supplies a stderr writer in its default mode and a stdout writer in
`--print` / `-p` mode. A Runner can be reused and can execute Workflows
concurrently; its async contexts remain isolated while all events share one
increasing sequence.

```typescript
interface WorkflowRunnerOptions {
  readonly logWriter?: (line: string) => void;
  readonly emitter?: WorkflowEventEmitter;
}
```

`dispose()` removes the JSON writer installed by the constructor without
clearing external Emitter listeners. A disposed Runner cannot start new
executions.

## Examples

- [Deep Research](../examples/deep-research/README.md) runs a scoping search
  before planning, then combines `agent()`, `phase()`, `parallel()`, `log()`,
  and `WorkflowRunner`. Its final Present phase opens the generated HTML file
  with the operating system. The Planner proposes the filename, and atomic
  numbered fallbacks preserve existing reports.
- [Blog Writer](../examples/blog-writer/README.md) combines `agent()`,
  `phase()`, `pipeline()`, `log()`, and `WorkflowRunner`.
