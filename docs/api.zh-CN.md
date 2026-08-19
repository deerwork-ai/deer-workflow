# API Reference

[English: README](../README.md) ·
[Guide](./index.md) ·
[API](./api.md) |
[简体中文：README](../README.zh-CN.md) ·
[快速入门](./index.zh-CN.md) ·
[API](./api.zh-CN.md)

所有公开 API 都可以从包根路径导入，也可以使用对应的子路径：

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

也可以使用等价的子路径：

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

## Workflow 模块契约

一个可运行的 Workflow 模块使用显式 ESM import，并通过 `default` 或具名的
`run` 导出 Handler。

### `meta`

Workflow 可以通过静态的 `meta` 导出描述自身：

```typescript
export const meta = {
  name: "workflow-name",
  description: "One-line description.",
  phases: [{ title: "Plan" }, { title: "Execute" }],
  exampleArgs: { topic: "A realistic example topic" },
};
```

- `name` 是稳定的 kebab-case 标识符。
- `description` 是一行 Workflow 简介。
- `phases` 是按执行顺序排列的 `{ title }` 列表，其标题应与 Workflow 中的
  `phase()` 调用完全一致。
- `exampleArgs` 是可选的 JSON-safe 对象，键名对应 Handler 实际读取的 `args`
  属性，并提供一个最小可运行示例。

`meta` 必须能被静态读取：只使用字面量、数组和对象，不要使用变量、函数调用、
spread、计算属性或模板字符串。运行时会在模块加载后校验存在的 `meta`，并在
调用 Handler 前通过 `workflow:meta` 事件发送。名称必须是 kebab-case，描述
必须是非空单行文本，phase 标题必须非空且唯一。为保持向后兼容，`meta` 仍可省略。

### Handler 参数

```typescript
type WorkflowHandler<TArgs, TOutput> = (
  args: TArgs,
  context: Readonly<WorkflowExecutionContext<TArgs>>,
) => TOutput | PromiseLike<TOutput>;
```

`args` 是调用方传入的数据，应作为 Handler 的第一个参数。它不是
`globalThis.args` 之类的 JavaScript 全局变量。CLI 未提供输入时，其值为
`undefined`。

第二个参数 `context` 是当前执行上下文，其中包含 Runner、生命周期、Phase、事件
与日志能力。Workflow 不使用这些信息时，无须声明该参数。

### Runtime 上下文与 Imports

Workflow API 需要从 `@deerwork-ai/deer-workflow` 显式导入。CLI 不会把 `agent`、
`parallel`、`pipeline`、`phase`、`workflow` 或 `log` 注入为全局变量。Runner
会在调用 Handler 前建立异步执行上下文，使这些已导入的 API 能安全访问当前
Workflow 的生命周期。

## Agents

### `agent()`

```typescript
function agent<TOutput = string>(
  prompt: string,
  options?: AgentOptions,
): Promise<TOutput>;
```

通过默认的 `CodexAgent` 运行一次完整的 Codex CLI Agent Loop。没有提供
`schema` 时返回文本；提供 JSON Schema 时读取并解析 Codex 的结构化最终响应。

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

`schema` 只约束 Agent 的最终响应，并不会把 Agent Loop 降级成一次普通模型调用。
直接调用失败时 Promise 会被 reject；`agent()` 本身不会把错误转换成 `null`。

### `defaultAgent`

```typescript
const defaultAgent: CodexAgent;
```

导出的 `agent()` 函数所使用的共享 `CodexAgent` 实例。

### `Agent`

```typescript
interface Agent {
  run<TOutput = string>(
    prompt: string,
    options?: AgentOptions,
  ): Promise<TOutput>;
}
```

实现其他 Coding Agent 集成时应遵循的运行时接口。

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

基于非交互式 `codex exec` 的默认实现。Prompt 通过 stdin 发送；默认使用临时
会话，并在调用结束后删除 Schema 和结果临时文件。

`CodexAgentConfig` 支持：

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

运行失败或 Schema 响应无法解析时抛出 `CodexAgentError`。错误对象保留
`exitCode`、`stdout` 和 `stderr`，便于宿主诊断。

无法解析配置的可执行文件时，`run()` 会在创建临时文件或启动进程之前抛出
`CodexCliNotFoundError`。错误信息包含官方 npm 安装命令、登录和版本检查，并
明确说明 Codex CLI 与 Codex Desktop 需要分别安装。

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

基于非交互式 `claude --print` 命令的 Agent Harness。Prompt 通过 stdin
发送，响应
从 `--output-format json` 中解析，默认通过 `--no-session-persistence` 使用
临时会话。

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

`AgentOptions.sandbox` 会映射到 Claude Code 的权限控制：`"read-only"` 使用
`--permission-mode plan`，`"workspace-write"` 使用
`--permission-mode acceptEdits`，`"danger-full-access"` 使用
`--dangerously-skip-permissions`。`AgentOptions.schema` 通过 `--json-schema`
传递；解析结果优先读取 `structured_output` 字段，否则回退为解析 `result`
字段中的 JSON。

运行失败或 Schema 响应无法解析时抛出 `ClaudeAgentError`，错误对象保留
`exitCode`、`stdout` 和 `stderr`。

无法解析配置的可执行文件时，`run()` 会在启动进程之前抛出
`ClaudeCliNotFoundError`。错误信息包含官方 npm 安装命令和登录检查。

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

面向 Pi Coding Agent 0.84.1 的 Agent Harness。文本调用通过 stdin 把 Prompt
发送给临时的 `pi --print` 进程。Schema-backed 调用使用 `pi --mode json`，并
为本次运行创建一个 Extension；该 Extension 注册 terminating final-response
工具，以调用方提供的 JSON Schema 作为工具参数 Schema。`PiAgent` 只返回成功
`tool_execution_end` 事件中的 details，不会把尽力生成的 JSON 文本当成已校验
响应。

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

Pi 0.84.1 不提供操作系统 Sandbox，因此 `PiAgent` 对共享策略采用保守映射：

- `read-only` 只启用 `read`、`grep`、`find` 和 `ls`；
- `workspace-write` 额外启用 `edit` 和 `write`，加载路径守卫，把写入限制在
  `cwd` 与 `additionalWritableDirectories`，并且不启用 bash；
- `danger-full-access` 使用 Pi 进程正常拥有的宿主机能力。

省略 `sandbox` 时，Pi 保留正常的宿主机进程行为。无人值守自动化应显式设置策略。

受约束模式会禁用自动发现的 Extension 和未经批准的项目资源，避免它们绕过
活动工具策略。规范路径检查会拒绝符号链接和目录穿越逃逸。如需在不受限制的
命令执行下隔离宿主机，请使用外部容器、虚拟机或其他操作系统边界。

`extraArgs` 可以配置不影响协议的 Pi 功能，但输出、会话、Extension、Trust 和
工具控制参数由 Harness 保留，在 `extraArgs` 中提供时会被拒绝。

进程失败、非法 JSONL 或缺少结构化结果时抛出 `PiAgentError`，并保留
`exitCode`、`stdout` 和 `stderr`。找不到可执行文件时，会在创建临时文件前抛出
`PiCliNotFoundError`，其中包含 Pi 0.84.1 的安装和认证步骤。每次运行生成的
Extension 与策略文件都会在成功、失败或取消后删除。

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

由 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的非交互
`dsh --profile headless "<task>"` 命令支撑的 Agent Harness。每次运行回答一个
任务，把最终助手消息打印到 stdout 后退出。headless 表面没有 stdin 提示通道，
因此任务以命令行参数传递；进程仍以参数数组启动，绝不经过 shell。

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

`AgentOptions.sandbox` 与 DeepSeek Harness 的 `DSH_PERMISSION_MODE` 环境变量
一一对应：`"read-only"`、`"workspace-write"` 和 `"danger-full-access"` 与共享
策略名逐字相同。省略 `sandbox` 时不改动 `DSH_PERMISSION_MODE`，由 DeepSeek
Harness 应用自身的 `workspace-write` 默认值。

模型无法按次覆盖，因为 headless 表面没有模型参数：DeepSeek Harness 从
`$DSH_HOME/settings.yaml` 的 `agent-default-model` 设置解析模型。因此提供
`AgentOptions.model` 会抛出 `TypeError` 而不是被静默忽略；
`AgentOptions.additionalWritableDirectories` 同样抛出（写入始终限制在会话
工作区和平台临时根目录内）。

`AgentOptions.schema` 作为结构化输出契约嵌入任务，`DeepSeekHarnessAgent`
从最终消息解析 JSON 对象，容忍周围的说明文字或 Markdown 围栏。会话记录保留
在 `$DSH_HOME` 下供审计；没有临时会话开关。

进程失败或缺少结构化结果时抛出 `DeepSeekHarnessAgentError`，并保留
`exitCode`、`stdout` 和 `stderr`。找不到可执行文件时，会在启动进程前抛出
`DeepSeekHarnessCliNotFoundError`，其中包含
`bun install --global @deepseek-ai/dsh` 安装步骤。

## Flow

### `parallel()`

```typescript
function parallel<const TTasks extends readonly ParallelTask[]>(
  tasks: TTasks,
): Promise<ParallelResults<TTasks>>;
```

同时启动所有惰性任务，并等待它们全部完成。结果顺序与任务顺序一致。单个任务
抛出异常或 Promise rejection 时，对应结果为 `null`，不会取消其他任务。

当前实现会立即启动传入的全部任务，没有对外承诺并发数或条目数上限。

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

让每个输入独立通过一系列有序阶段。某个输入完成当前阶段后可以立即进入下一
阶段，不需要等待其他输入形成全局 Barrier。

```typescript
const results = await pipeline(
  documents,
  (document) => extract(document),
  (content, original, index) => review(content, original, index),
  (review) => format(review),
);
```

阶段函数接收当前值、原始输入和原始索引：

```typescript
type PipelineStage<TValue, TOriginal, TNext> = (
  value: TValue,
  original: TOriginal,
  index: number,
) => TNext | PromiseLike<TNext>;
```

第一个阶段收到的 `value` 就是原始输入，并不是 `undefined`。
单个输入失败后会跳过它的剩余阶段，并在原位置返回 `null`。其他输入继续执行。
类型推断覆盖最多五个阶段。

### `phase()`

```typescript
function phase(title: string): void;
```

设置当前 Workflow 的活动阶段。进入新阶段时自动发出上一阶段的
`workflow:phase:end`，然后发出新阶段的 `workflow:phase:start`。在 Workflow
之外调用会抛出 `PhaseContextError`。应在进入 `parallel()` 或 `pipeline()`
之前设置阶段；从并发分支中修改共享阶段会产生竞态。

### `getCurrentPhase()`

```typescript
function getCurrentPhase(): string | undefined;
```

返回当前阶段名称。Workflow 外部或尚未调用 `phase()` 时返回 `undefined`。

### `workflow()`

```typescript
function workflow<TOutput = unknown, TArgs = unknown>(
  target: string | { scriptPath: string },
  args?: TArgs,
): Promise<TOutput>;
```

加载并运行一个 Workflow 模块。目标模块必须导出 `default` 函数或具名的
`run()` 函数：

```typescript
type WorkflowHandler<TArgs, TOutput> = (
  args: TArgs,
  context: Readonly<WorkflowExecutionContext<TArgs>>,
) => TOutput | PromiseLike<TOutput>;
```

宿主启动的 Workflow 深度为 `0`。嵌套路径相对于父 Workflow 文件解析，目前
最多支持一层嵌套。模块无法加载或没有有效入口时抛出 `WorkflowLoadError`；
超过嵌套限制时抛出 `WorkflowNestingError`。调用方没有提供 Input 时，Handler
收到的 `args` 为 `undefined`。

### `getWorkflowContext()`

```typescript
function getWorkflowContext<TArgs = unknown>():
  WorkflowExecutionContext<TArgs> | undefined;
```

读取当前异步调用链中的 Workflow 上下文：

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

发送一条进度消息。直接使用时默认写入 stderr；在
`WorkflowRunner.run()` 内调用时会转换成 `log` 事件并交给 Runner 的 JSON
Writer。消息可以包含 Markdown。JSONL 消费者会收到原始 Markdown 字符串；
交互式 CLI TUI 会渲染标题、强调、行内代码、链接、引用、列表和围栏代码块。

### `withLogSink()`

```typescript
function withLogSink<TOutput>(
  sink: (message: string) => void,
  callback: () => TOutput,
): TOutput;
```

在一个异步调用链中临时安装自定义 Log Sink。嵌套和并发调用通过
`AsyncLocalStorage` 隔离，回调结束后自动恢复上层 Sink。

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

所有事件都包含：

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

事件特有字段：

| Event                  | Additional fields           |
| ---------------------- | --------------------------- |
| `workflow:start`       | 无                          |
| `workflow:meta`        | `meta`                      |
| `workflow:end`         | `durationMs`                |
| `workflow:error`       | `durationMs`, `error`       |
| `workflow:phase:start` | `phase`                     |
| `workflow:phase:end`   | `phase`, `durationMs`       |
| `log`                  | `message`, optional `phase` |

`workflow:error` 中的错误是可以安全序列化的对象：

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

同步、强类型的事件发射器。`emit()` 自动添加递增的 `sequence` 和 ISO-8601
格式的 `timestamp`。Listener 按订阅顺序同步执行。

### `createJsonEventWriter()`

```typescript
function createJsonEventWriter(
  logWriter?: (line: string) => void,
): WorkflowEventListener;
```

创建一个把事件序列化成紧凑 JSON 的 Listener。每个事件调用 Writer 一次，
传入内容不带结尾换行。默认 Writer 为 `console.log`。

### `serializeWorkflowError()`

```typescript
function serializeWorkflowError(error: unknown): SerializedWorkflowError;
```

把任意抛出值转换为包含 `name`、`message` 和可选 `stack` 的 JSON-safe 对象。

## Runner

### CLI

DeerWork 会让选中的 Coding Agent 应用
[Deer Workflow 内置的 Workflow Creator Skill](../skills/workflow-creator/)，
生成可运行的 TypeScript Workflow 模块：

```text
deer-workflow create "Describe the Workflow"
deer-workflow create --agent claude "Describe the Workflow"
deer-workflow create --agent pi "Describe the Workflow"
echo "Describe the Workflow" | deer-workflow create
```

`create --agent` 接受 `codex`、`claude` 或 `pi`，默认值为 `codex`。该选项只选择
Workflow 生成器使用的 Harness；CLI 不提供独立的通用 Agent 命令。Workflow
模块应使用 TypeScript `agent()` API。
`create` 从已安装的包中定位[内置 Skill](../skills/workflow-creator/)，让选中的
Agent 读取它及其要求的 references，然后追加用户 Prompt。Agent 使用只读
Sandbox；Codex 还允许在 Git 仓库外运行，Pi 则使用只读内置工具 allowlist。
命令会移除包裹完整响应的一层 Markdown 源码围栏，因此 stdout 可以直接重定向
到 `.ts` 或 `.js` 文件。生成
开始前，stdout 会先写入一条包含所选 Agent 名称的有效源码注释，因此重定向
目标会立即成为非空文件。生成的 Workflow 不会自动执行。

当 stderr 连接交互式终端时，`create` 会说明所选 Agent 的生成通常需要 1–5
分钟，并持续显示带已用时间的无限 loading 动画，直到生成完成；随后给出可
复制的下一步示例，例如
`deer-workflow run ./workflow.ts --input '{"topic":"..."}'`；参数来自生成
Workflow 的示例 args。stderr 被重定向时不会启用动画，因此生成源码和脚本
输出保持不变。

为其他 Agent 安装
[内置 Workflow Creator Skill](../skills/workflow-creator/)：

```text
deer-workflow skill install
```

`skill install` 会检查已有的 `~/.agents/skills` 与 `~/.claude/skills` 目录，
把 `workflow-creator` 复制到其中每个存在的目录，必要时以包内版本更新文件，
跳过缺失目录，并报告每个目标位置。它不会创建 Agent 的上级 Skill 目录。Pi
0.84.1 会发现共享的 `~/.agents/skills` 目标。

运行 Workflow 模块：

```text
deer-workflow run <workflow>
deer-workflow run <workflow> --print
deer-workflow run <workflow> --input '<json>'
deer-workflow run <workflow> --input-file <path>
echo '<json>' | deer-workflow run <workflow>
```

`run` 不允许同时使用 `--input` 与 `--input-file`。Input 的读取顺序为
`--input`、`--input-file`、非空 stdin；显式参数优先于 stdin。JSON 无法解析、
Workflow 无法加载或执行失败时，命令返回非零退出码。

`--print`（短参数 `-p`）会禁用 TUI，并立即把每个 Workflow 事件作为一行紧凑
JSON 写入 stdout。该模式不再单独输出 Workflow 返回值，保证 stdout 是纯净的
JSONL Event Stream；stderr 仅用于 CLI 诊断。服务端、CI/CD、任务队列、进程
管道、自动化 Runner 和事件采集器都应优先使用该模式：

```text
deer-workflow run ./workflow.ts -p --input '{"topic":"..."}' > events.jsonl
```

CLI 会创建 `WorkflowRunner`。非 Print Mode 下，stderr 被重定向时，每个事件
都以 JSONL 写入；在交互式终端中，事件改为驱动响应式 TUI：左栏显示
`meta.phases` 声明的阶段，并标注等待、运行中、已完成或失败；右栏滚动显示
渲染后的 Markdown 日志。顶部会显示 `meta.name`、Workflow 模块路径和当前
工作目录。活动 phase 除 spinner 外还会在标题上循环扫过亮点；已完成、等待和
失败阶段保持静态。窄终端会切换为上下布局。非 Print Mode 下，字符串结果直接
写入 stdout，其他可 JSON 序列化的值写成紧凑 JSON，返回 `undefined` 时不输出
结果行。

共享 TUI 仅在 stderr 为交互式终端且 `TERM` 不是 `dumb` 时启用。设置
`NO_COLOR` 会关闭颜色但保留动画；CLI 输出最终结果或错误详情前，TUI 会自动
切换为成功或失败状态。所有长耗时命令统一使用 `🦌 Deer Workflow` 标题。

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

运行 Workflow，并把生命周期、阶段和日志转换为统一事件流。独立使用 Runner
时，默认将每个事件作为一行 JSON 输出到 stdout；CLI 默认改用 stderr Writer，
而 `--print` / `-p` 模式使用 stdout Writer。同一个 Runner 可以被复用或用于
并发执行，所有运行共享一个递增事件序列，异步上下文保持隔离。

```typescript
interface WorkflowRunnerOptions {
  readonly logWriter?: (line: string) => void;
  readonly emitter?: WorkflowEventEmitter;
}
```

`dispose()` 会移除构造函数安装的 JSON Writer，保留外部注册到 Emitter 的
Listener。释放后的 Runner 不能启动新的 Workflow。

## 示例

- [Deep Research](../examples/deep-research/README.zh-CN.md)：在规划前先执行
  探索搜索，再组合使用 `agent()`、`phase()`、`parallel()`、`log()` 和
  `WorkflowRunner`；Planner 会提出文件名，原子编号后缀会保护已有报告，最后的
  Present 阶段通过操作系统打开生成的 HTML 文件。
- [Blog Writer](../examples/blog-writer/README.zh-CN.md)：组合使用
  `agent()`、`phase()`、`pipeline()`、`log()` 和 `WorkflowRunner`。
