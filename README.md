English | [简体中文](./README.zh-CN.md)

# deer-workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@deerwork-ai/deer-workflow)](https://www.npmjs.com/package/@deerwork-ai/deer-workflow)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun&logoColor=000000)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=ffffff)](https://www.typescriptlang.org)
[![Codex CLI](https://img.shields.io/badge/default_agent-Codex_CLI-000000?logo=openai&logoColor=ffffff)](https://github.com/openai/codex)
[![DeerFlow Stars](https://img.shields.io/github/stars/bytedance/deer-flow?label=DeerFlow%20Stars&logo=github)](https://github.com/bytedance/deer-flow)
[![GitHub Stars](https://img.shields.io/github/stars/deerwork-ai/deer-workflow?style=flat&logo=github)](https://github.com/deerwork-ai/deer-workflow)

An open-source Dynamic Workflow runtime for building observable, reusable Agent
graphs.

`deer-workflow` is a pilot project for [**DeerFlow 3.0**](https://github.com/bytedance/deer-flow), also known as **DeerWork**.

## Index

- [Why Deer Workflow](#why-deer-workflow)
- [How to use](#how-to-use)
  - [Quick Start](#quick-start)
  - [Examples](#examples)
  - [Documentation](#documentation)
- [How to develop](#how-to-develop)
  - [Set up](#set-up)
  - [Validate changes](#validate-changes)
  - [Contribute](#contribute)
  - [License](#license)

# Why Deer Workflow

Deer Workflow is a code-first implementation of **[Graph Engineering](https://www.aibuilderclub.com/blog/graph-engineering-guide-2026)**: TypeScript defines the valid execution paths, while Coding Agents perform the semantic work inside each node.

- **Code is the plan.** Control flow, phases, inputs, and failure handling live
  in reviewable TypeScript rather than an opaque Agent conversation.
- **Agents are replaceable.** Codex is the default runtime; Claude Code,
  DeepSeek Harness, and Pi are built in; and the public Agent interface
  remains vendor-neutral.
- **Execution is observable.** Interactive runs provide a phase-aware TUI;
  automation can consume a stable JSONL event stream.

# How to use

## Quick Start

Install [Bun](https://bun.sh) and sign in to
[Codex CLI](https://github.com/openai/codex), then install the released CLI:

```bash
bun install --global @deerwork-ai/deer-workflow
```

Describe the orchestration you want. Deer Workflow asks Codex to apply the
[bundled `workflow-creator` Skill](./skills/workflow-creator/) and writes a
runnable TypeScript module:

```bash
deer-workflow create \
  "Create a Workflow that accepts a topics string array, researches each topic in parallel, and synthesizes a report" \
  > workflow.ts
```

Use `--agent claude`, `--agent dsh` (DeepSeek Harness), or `--agent pi` to
generate with another installed Harness. Codex remains the default.

Run the generated Workflow with its example input:

```bash
deer-workflow run ./workflow.ts \
  --input '{"topics":["Agent Skills","Dynamic Workflows"]}'
```

Interactive terminals show phases and Markdown logs in a live TUI. For
servers, CI, and process pipelines, add `--print` or `-p` to stream one JSON
event per stdout line.

Want to understand or edit the generated module? Continue with the
[Getting Started guide](./docs/index.md).

## Examples

- [Deep Research](./examples/deep-research/README.md) discovers research
  angles, investigates them in parallel, verifies claims, and produces an
  interactive HTML report.
- [Blog Writer](./examples/blog-writer/README.md) plans an article, drafts its
  sections through a pipeline, reviews them, and returns structured output.

These examples live in the repository. Clone or download it before running
their documented commands.

## Documentation

- [Getting Started](./docs/index.md) — learn the execution model and build a
  Workflow step by step.
- [API Reference](./docs/api.md) — inspect exact functions, types, events, and
  runtime behavior.
- [Workflow Creator Skill](./skills/workflow-creator/SKILL.md) — see the
  instructions used to generate Workflow modules.
- [简体中文文档](./README.zh-CN.md)

# How to develop

## Set up

Clone the repository and install local dependencies and Git hooks:

```bash
git clone https://github.com/deerwork-ai/deer-workflow.git
cd deer-workflow
bun install
```

Run the CLI directly from source:

```bash
bun run dev -- --help
```

## Validate changes

Run the complete quality gate before submitting changes:

```bash
bun run check
```

## Contribute

Codex CLI is the default Agent runtime, not an architectural dependency.
`ClaudeAgent`, `DeepSeekHarnessAgent`, and `PiAgent` ship as built-in
Harnesses; integrations for other Coding Agents are welcome.

See the [Getting Started guide](./docs/index.md#develop-the-repository) for the
full command reference.

## License

This project is licensed under the [MIT License](./LICENSE).
