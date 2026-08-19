# Deer Workflow API

This reference describes the currently implemented public contract. Do not add
capabilities merely because they appear in another Dynamic Workflow runtime.

## Module contract

A runnable module exports either a default handler or a named `run` handler:

```ts
type WorkflowHandler<TArgs, TOutput> = (
  args: TArgs,
  context: Readonly<WorkflowExecutionContext<TArgs>>,
) => TOutput | PromiseLike<TOutput>;
```

The Workflow Creator also emits a pure-literal metadata export:

```ts
export const meta = {
  name: "workflow-name",
  description: "One-line description.",
  phases: [{ title: "Plan" }, { title: "Execute" }],
  exampleArgs: { key: "value" },
};
```

The runtime validates this export and emits a `workflow:meta` event before the
Handler runs. The interactive CLI uses its ordered phases in the execution
dashboard. Keep the object literal static, use a kebab-case name, and keep
phase titles non-empty and unique. `exampleArgs` is a JSON-safe object whose
keys match properties read from the Handler's `args` parameter.

The CLI loads it with:

```sh
deer-workflow run ./workflow.ts --input '{"key":"value"}'
```

Input may instead come from `--input-file` or JSON on stdin. `--input` and
`--input-file` cannot be combined; explicit input takes precedence over stdin.
`run --print` and `run -p` disable the TUI and write one compact JSON Workflow
event per stdout line. Print Mode is the recommended interface for servers,
CI/CD, task queues, process pipelines, automation runners, and event
collectors. It suppresses the separate handler result and reserves stderr for
CLI diagnostics.
Outside Print Mode, the final returned value is written to stdout. For
substantial generated content, prefer writing an artifact file and returning
compact metadata with
its path instead of writing the whole document to stdout. Do not overwrite an
existing artifact; use atomic exclusive creation and add a numeric suffix
before the extension when necessary. In the default mode, Workflow events and
logs are JSON Lines on stderr. When stderr is an interactive terminal, `run`
instead drives the TUI. Default-mode redirected stderr remains pure JSONL.

There is no global API injection. Caller input is the Handler's first
parameter, conventionally named `args`; it is not a `globalThis` property.

The CLI can ask the default Codex Agent, Claude Code selected with
`--agent claude`, DeepSeek Harness selected with `--agent dsh`, or Pi selected
with `--agent pi` to apply this [bundled Skill](../) and emit a new module as
raw source:

```sh
deer-workflow create "Describe the Workflow" > workflow.ts
deer-workflow create --agent claude "Describe the Workflow" > workflow.ts
deer-workflow create --agent dsh "Describe the Workflow" > workflow.ts
deer-workflow create --agent pi "Describe the Workflow" > workflow.ts
```

`--agent` is scoped to `create` and selects the generator harness. There is no
standalone general-purpose Agent CLI command; generated Workflows invoke Agent
Loops through the imported TypeScript `agent()` API.

`create` generates the module but does not execute it.
In an interactive terminal it shows an indefinite spinner, notes that
generation usually takes 1–5 minutes, and finishes with the next-step example
`deer-workflow run ./workflow.ts`. Redirected stderr has no progress UI.
The shared terminal UI honors `NO_COLOR`, disables visual output for
non-interactive or `TERM=dumb` destinations, and renders a failure state before
the CLI reports an error.

Install this [bundled Skill](../) for other Agents that support Agent Skills:

```bash
deer-workflow skill install
```

The command copies `workflow-creator` into existing `~/.agents/skills` and
`~/.claude/skills` directories and reports installed or skipped destinations.
Pi 0.84.1 discovers the shared `~/.agents/skills` destination.

## Imports

Prefer the package root for generated modules:

```ts
import {
  agent,
  log,
  parallel,
  phase,
  pipeline,
  workflow,
} from "@deerwork-ai/deer-workflow";
```

Focused exports are also available from `/agents`, `/flow`, and `/logging`.

## `agent()`

```ts
function agent<TOutput = string>(
  prompt: string,
  options?: AgentOptions,
): Promise<TOutput>;
```

`agent()` runs a complete Coding Agent loop. Without a schema it returns text.
With a schema, Codex CLI validates the final response and Deer Workflow parses
the JSON.

The schema must use the JSON Schema subset accepted by Codex structured
outputs. URL fields should currently be plain strings; do not use
`format: "uri"`, which Codex rejects as an invalid response schema. Validate or
sanitize URLs in deterministic Workflow code before using them.

```ts
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

There are no `label`, `phase`, `isolation`, retry, or token-budget fields in
`AgentOptions`. `phase()` is a separate Flow API. Direct Agent failures throw
rather than returning `null`.

## `parallel()`

```ts
function parallel<const TTasks extends readonly ParallelTask[]>(
  tasks: TTasks,
): Promise<ParallelResults<TTasks>>;
```

Every task must be a zero-argument lazy function. All tasks start concurrently
and results remain in input order. A thrown or rejected task produces `null`
without cancelling siblings.

```ts
const results = await parallel([
  () => agent("Inspect authentication.", { sandbox: "read-only" }),
  () => agent("Inspect authorization.", { sandbox: "read-only" }),
]);
```

The runtime does not currently impose a documented concurrency or item limit.

## `pipeline()`

```ts
function pipeline<TOriginal>(
  items: readonly TOriginal[],
  ...stages: Array<PipelineStage<unknown, TOriginal, unknown>>
): Promise<Array<unknown | null>>;
```

Each item advances through its stages independently. Every stage receives:

```ts
(currentValue, originalItem, originalIndex);
```

The first stage's `currentValue` is the original item, not `undefined`. A failed
stage makes that item's final result `null` and skips its remaining stages.

```ts
const articles = await pipeline(
  topics,
  (topic) => agent(`Draft: ${topic}`),
  (draft, topic) => agent(`Edit the draft for ${topic}:\n${draft}`),
);
```

## `phase()`

```ts
function phase(title: string): void;
```

`phase()` changes the current Workflow phase and emits phase lifecycle events.
Calling it outside an active Workflow throws. Set it before concurrent work,
not from within concurrent branches.

## `log()`

```ts
function log(message: string): void;
```

Inside a `WorkflowRunner`, `log()` emits a typed `log` event. Its phase is read
from the active Workflow context. Messages may contain Markdown; the
interactive CLI renders headings, emphasis, inline code, links, quotes, lists,
and fenced code blocks. Outside a Runner it writes to stderr. A standalone
Runner writes JSON events through `console.log` by default; the CLI uses pure
JSONL on redirected stderr and an event-driven dashboard on an interactive
terminal.

Emit a useful log before each potentially slow Agent call, during concurrent
fan-out as individual tasks start and finish, when concise findings become
available, and before and after artifact writes. Logs are the user's live
evidence that work is progressing. Keep them factual and compact; do not emit
timer-only heartbeats, secrets, complete prompts, full Agent responses, or the
entire final artifact.

## `workflow()`

```ts
function workflow<TOutput = unknown, TArgs = unknown>(
  target: string | { scriptPath: string },
  args?: TArgs,
): Promise<TOutput>;
```

Nested relative paths resolve from the parent Workflow module. One nested level
is supported. A child receives its own handler arguments and execution context.

## Execution context

The optional second handler parameter contains:

```ts
interface WorkflowExecutionContext<TArgs = unknown> {
  readonly id: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly scriptPath: string;
  readonly args: TArgs;
  phase?: string;
}
```

Most Workflows need only their first `args` parameter.
