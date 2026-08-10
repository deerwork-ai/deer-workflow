# Deer Workflow: Getting Started

[English: README](../README.md) ·
[Guide](./index.md) ·
[API](./api.md) |
[简体中文：README](../README.zh-CN.md) ·
[快速入门](./index.zh-CN.md) ·
[API](./api.zh-CN.md)

This guide takes you from a natural-language orchestration request to a
runnable, observable TypeScript Workflow. It also explains the generated code
well enough for you to edit it confidently.

## What you will build

The example Workflow will:

1. research several topics concurrently;
2. let each successful finding advance through drafting and editing stages;
3. expose its progress as named phases and Markdown logs; and
4. return the completed sections while tolerating partial task failure.

The finished module uses the core Deer Workflow primitives:

| API          | Role                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| `agent()`    | Run a complete tool-using Agent Loop.                                  |
| `parallel()` | Start independent lazy tasks together and preserve input order.        |
| `pipeline()` | Let each item advance independently through ordered stages.            |
| `phase()`    | Mark the active observable phase of the Workflow.                      |
| `log()`      | Emit Markdown progress to stderr or the active event stream.           |
| `meta`       | Declare the Workflow identity, phase plan, and runnable example input. |

## Understand the model

A Workflow is an ordinary TypeScript module with a `default` or named `run`
export. TypeScript owns the deterministic decisions: which work runs
concurrently, which stages are ordered, how failures are handled, and what
result is returned. Coding Agents handle work that requires language
understanding, judgment, or tools.

Workflow APIs are explicit ESM imports. The Runner establishes asynchronous
execution context for lifecycle, phase, event, and logging state; it does not
inject APIs into `globalThis` or pass them through a destructured Handler
argument.

## Install the CLI

Install [Bun](https://bun.sh) and the
[Codex CLI](https://github.com/openai/codex) used by the default Agent runtime:

```bash
npm install -g @openai/codex
codex login
codex --version
```

Codex CLI and Codex Desktop are separate installations. Installing the Desktop
app does not provide the `codex` terminal command.

Install the released Deer Workflow CLI globally:

```bash
bun install --global @deerwork-ai/deer-workflow
deer-workflow --help
```

Running bare `bun install` does not install the global CLI. Inside this
repository it installs local development dependencies and Git hooks.

Claude Code is also supported. If you prefer it, install and sign in to
[Claude Code CLI](https://claude.com/product/claude-code), then use
`create --agent claude` in the next step.

Pi Coding Agent 0.84.1 is supported as well. Install and authenticate the
official CLI, then use `create --agent pi`:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.1
pi auth check
pi --version
```

## Create your first Workflow

Describe the orchestration rather than its implementation:

```bash
deer-workflow create \
  "Create a Workflow that accepts a topics string array, researches each topic in parallel, drafts and edits each successful finding, and returns the completed sections" \
  > workflow.ts
```

`create` asks the selected Coding Agent to apply
[the bundled `workflow-creator` Skill](../skills/workflow-creator/). The Skill
defines the public Workflow contract, patterns, and source template; the user
prompt is appended after those instructions.

Generation runs in a read-only sandbox. The command resolves the Skill from the
installed package, so a global installation does not depend on a separate
Codex Skill directory. Generated source is written to stdout and is not
executed automatically.

To make the same Skill available to other Agents that support Agent Skills:

```bash
deer-workflow skill install
```

The command copies `workflow-creator` into existing `~/.agents/skills` and
`~/.claude/skills` directories and reports every installed or skipped
destination. Pi 0.84.1 discovers the shared `~/.agents/skills` destination, so
it does not need a duplicate Skill installation.

## Read the generated module

A generated module will follow this shape:

```typescript
import {
  agent,
  log,
  parallel,
  phase,
  pipeline,
} from "@deerwork-ai/deer-workflow";

export const meta = {
  name: "topic-report",
  description: "Researches topics and turns the findings into edited sections.",
  phases: [{ title: "Research" }, { title: "Draft" }],
  exampleArgs: { topics: ["Agent Skills", "Dynamic Workflows"] },
};

interface WorkflowInput {
  topics: string[];
}

export default async function run(args: WorkflowInput) {
  phase("Research");
  log(`Researching ${args.topics.length} topics`);

  const findings = await parallel(
    args.topics.map(
      (topic) => () =>
        agent(`Research and summarize: ${topic}`, {
          sandbox: "read-only",
        }),
    ),
  );
  const completed = findings.filter(
    (finding): finding is string => finding !== null,
  );

  phase("Draft");
  const sections = await pipeline(
    completed,
    (finding) =>
      agent(`Draft a section:\n${finding}`, {
        sandbox: "read-only",
      }),
    (draft) =>
      agent(`Edit for clarity:\n${draft}`, {
        sandbox: "read-only",
      }),
  );
  const edited = sections.filter(
    (section): section is string => section !== null,
  );
  log(`Completed ${edited.length} sections`);

  return edited.join("\n\n");
}
```

### Metadata is the execution plan

The exported `meta` object is a pure JSON-safe literal:

- `name` is a stable kebab-case identifier.
- `description` is a concise one-line summary.
- `phases` is ordered, unique, and exactly matches the titles passed to
  `phase()`.
- `exampleArgs` is runnable sample input whose keys match properties read from
  the Handler's `args` parameter.

The Runner validates this object and emits `workflow:meta`. The interactive CLI
uses its phases in the TUI, while `create` uses `exampleArgs` to show a
copyable next command.

### Flow failures are explicit values

`parallel()` starts every lazy task immediately, waits for all tasks to settle,
and preserves input order. A synchronous throw or rejected Promise becomes
`null` without cancelling sibling tasks.

`pipeline()` lets each item advance through its stages independently. A failed
item becomes `null`, skips its remaining stages, and does not cancel other
items.

Neither primitive silently retries, queues, fails fast, or limits concurrency.
Callers must filter or otherwise handle nullable results and decide whether
partial completion is acceptable.

### Phases belong to the whole Workflow

Workflow branches share one phase state. Set `phase()` before entering
`parallel()` or `pipeline()`; do not change the phase from concurrent tasks or
stages. Repeating the active title is a no-op. Selecting a new title ends the
previous phase, and Workflow completion ends any active phase.

## Run the Workflow

Pass the example arguments as inline JSON:

```bash
deer-workflow run ./workflow.ts \
  --input '{"topics":["Agent Skills","Dynamic Workflows"]}'
```

Input may instead come from `--input-file` or non-empty stdin. `--input` and
`--input-file` cannot be combined; explicit options take precedence over
stdin.

### Interactive mode

When stderr is an interactive terminal, the CLI displays the Workflow name,
module path, working directory, declared phases, and rendered Markdown logs in
a live TUI. The final result remains on stdout.

When stderr is redirected, the TUI is disabled and Workflow events are emitted
there as JSON Lines. Stdout still contains only the final result.

### Print mode

Use `--print` or `-p` for servers, CI/CD, task queues, process pipelines, and
event collectors:

```bash
deer-workflow run ./workflow.ts --print \
  --input '{"topics":["Agent Skills","Dynamic Workflows"]}'
```

Print Mode disables the TUI, writes one compact Workflow event per stdout line,
reserves stderr for diagnostics, and suppresses the separate final result.

The event protocol includes:

- `workflow:start`
- `workflow:meta`
- `workflow:phase:start`
- `workflow:phase:end`
- `log`
- `workflow:end`
- `workflow:error`

Workflow arguments and results are excluded from events by default so external
streams do not accidentally expose large or sensitive values.

## Use Workflows from TypeScript

Use `WorkflowRunner` when a host application starts the Workflow:

```typescript
import { WorkflowRunner } from "@deerwork-ai/deer-workflow/runner";

const runner = new WorkflowRunner();

try {
  const report = await runner.run<string>("./workflow.ts", {
    topics: ["Agent Skills", "Dynamic Workflows"],
  });
  console.log(report);
} finally {
  runner.dispose();
}
```

A standalone Runner writes one JSON event per stdout line by default. It can be
reused for concurrent executions; asynchronous Workflow and Logging contexts
stay isolated while all events share one monotonically increasing sequence.

For typed subscriptions, custom destinations, nested Workflows, result
serialization, and the complete event schema, see the
[API Reference](./api.md).

## Choose an Agent runtime

The `create` command accepts `--agent codex|claude|pi` and defaults to Codex:

```bash
deer-workflow create --agent claude "Describe the Workflow" > workflow.ts
deer-workflow create --agent pi "Describe the Workflow" > workflow.ts
```

This option selects the generator harness only. Workflow modules invoke Agent
Loops through the imported TypeScript `agent()` API, whose shared default
runtime is Codex.

For direct Claude Code calls, instantiate its adapter:

```typescript
import { ClaudeAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new ClaudeAgent({ model: "sonnet" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

For direct Pi calls, instantiate its adapter:

```typescript
import { PiAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new PiAgent({ model: "anthropic/claude-sonnet-4" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

Pi 0.84.1 has no built-in operating-system Sandbox. `PiAgent` enforces
`read-only` with a non-mutating tool allowlist. `workspace-write` uses guarded
edit/write tools scoped to `cwd` and `additionalWritableDirectories` and does
not enable bash. `danger-full-access` has the permissions of the Pi process;
use an external container or VM when host isolation is required.

All three adapters implement the same vendor-neutral `Agent` interface. A
schema-backed call constrains and parses the final response without reducing
the complete Agent Loop to a single model completion.

## Continue learning

- [Deep Research](../examples/deep-research/README.md) scopes a subject,
  researches independent angles in parallel, verifies claims, and generates an
  interactive HTML report.
- [Blog Writer](../examples/blog-writer/README.md) uses `pipeline()` to draft
  and review sections independently.
- [API Reference](./api.md) documents every public function, type, event, and
  runtime contract.
- [Workflow Creator Skill](../skills/workflow-creator/SKILL.md) contains the
  generation instructions used by `create`.

## Develop the repository

Clone the repository and install local dependencies and Git hooks:

```bash
git clone https://github.com/deerwork-ai/deer-workflow.git
cd deer-workflow
bun install
```

Run the complete quality gate before handing off a change:

```bash
bun run check
```

The root `package.json` is the source of truth for project commands:

| Command                 | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `bun run dev -- <args>` | Run the TypeScript CLI directly and forward arguments.  |
| `bun run lint`          | Lint JavaScript and TypeScript without modifying files. |
| `bun run lint:fix`      | Apply safe ESLint fixes.                                |
| `bun run format`        | Format supported files with Prettier.                   |
| `bun run format:check`  | Check formatting without modifying files.               |
| `bun run lint:staged`   | Run pre-commit checks against Git-staged files.         |
| `bun run prepare`       | Install the repository-managed Husky hooks.             |
| `bun test`              | Run every test under the top-level `tests/` directory.  |
| `bun run test:coverage` | Run every test and print the Bun coverage report.       |
| `bun run typecheck`     | Type-check `src/` and `tests/` without emitting files.  |
| `bun run check`         | Run type-checking, lint, formatting, and all tests.     |

Each commit runs ESLint and Prettier on staged files through `lint-staged`,
then type-checks the complete project. Lint-staged keeps its default backup
stash and rollback behavior.
