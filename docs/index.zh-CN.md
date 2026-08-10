# Deer Workflow：快速入门

[English: README](../README.md) ·
[Guide](./index.md) ·
[API](./api.md) |
[简体中文：README](../README.zh-CN.md) ·
[快速入门](./index.zh-CN.md) ·
[API](./api.zh-CN.md)

本指南将带你从一段自然语言编排需求开始，得到可运行、可观察的 TypeScript
Workflow，并帮助你充分理解生成的代码，从而有信心继续编辑。

## 你将构建什么

示例 Workflow 将会：

1. 并发研究多个主题；
2. 让每条成功的研究结果依次经过起草和编辑阶段；
3. 通过命名阶段和 Markdown 日志暴露进度；
4. 在容忍部分任务失败的同时返回已完成的内容。

最终模块会使用 Deer Workflow 的核心原语：

| API          | 作用                                               |
| ------------ | -------------------------------------------------- |
| `agent()`    | 运行包含工具调用的完整 Agent Loop。                |
| `parallel()` | 同时启动相互独立的惰性任务，并保持输入顺序。       |
| `pipeline()` | 让每个项目独立经过一系列有序阶段。                 |
| `phase()`    | 标记 Workflow 当前可观察的活动阶段。               |
| `log()`      | 向 stderr 或活动 Event Stream 发送 Markdown 进度。 |
| `meta`       | 声明 Workflow 标识、阶段计划和可运行的示例输入。   |

## 理解模型

Workflow 是一个普通的 TypeScript 模块，导出 `default` 函数或具名 `run` 函数。
TypeScript 负责确定性决策：哪些工作并发执行、哪些阶段保持顺序、如何处理失败，
以及最终返回什么结果。Coding Agent 则处理需要语言理解、判断或工具的工作。

Workflow API 通过显式 ESM import 引入。Runner 会建立异步执行上下文，用于保存
生命周期、阶段、事件和日志状态；它不会把 API 注入 `globalThis`，也不会通过
解构的 Handler 参数传入这些 API。

## 安装 CLI

安装 [Bun](https://bun.sh)，以及默认 Agent Runtime 使用的
[Codex CLI](https://github.com/openai/codex)：

```bash
npm install -g @openai/codex
codex login
codex --version
```

Codex CLI 与 Codex Desktop 是两个独立安装。安装 Desktop 应用不会提供终端中的
`codex` 命令。

全局安装正式发布的 Deer Workflow CLI：

```bash
bun install --global @deerwork-ai/deer-workflow
deer-workflow --help
```

直接运行 `bun install` 不会安装全局 CLI。在本仓库中，它会安装本地开发依赖和
Git Hooks。

Deer Workflow 也支持 Claude Code。如果更愿意使用它，请安装并登录
[Claude Code CLI](https://claude.com/product/claude-code)，然后在下一步使用
`create --agent claude`。

同时支持 Pi Coding Agent 0.84.1。安装并认证官方 CLI 后，可使用
`create --agent pi`：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.1
pi auth check
pi --version
```

## 创建第一个 Workflow

描述编排目标，而不是具体实现：

```bash
deer-workflow create \
  "创建一个接收 topics 字符串数组的 Workflow，并行研究每个主题，让成功的研究结果依次经过起草和编辑，最后返回已完成的内容" \
  > workflow.ts
```

`create` 会让选中的 Coding Agent 应用
[内置的 `workflow-creator` Skill](../skills/workflow-creator/)。该 Skill
定义公共 Workflow 契约、模式和源码模板；用户 Prompt 会追加到这些指令之后。

生成过程运行在只读 Sandbox 中。命令从已安装的包内解析 Skill，因此全局安装
不依赖单独的 Codex Skill 目录。生成的源码写入 stdout，但不会自动执行。

如需让其他支持 Agent Skills 的 Agent 使用相同 Skill：

```bash
deer-workflow skill install
```

该命令会把 `workflow-creator` 复制到已有的 `~/.agents/skills` 和
`~/.claude/skills` 目录，并报告每个实际安装或跳过的位置。Pi 0.84.1 会发现共享
的 `~/.agents/skills` 目标，因此无须重复安装另一份 Skill。

## 阅读生成的模块

生成的模块会遵循以下结构：

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

### Metadata 即执行计划

导出的 `meta` 对象是一个纯粹、JSON-safe 的字面量：

- `name` 是稳定的 kebab-case 标识符。
- `description` 是简洁的单行摘要。
- `phases` 有序且唯一，并与传给 `phase()` 的标题完全一致。
- `exampleArgs` 是可运行的示例输入，其键与 Handler 的 `args` 参数中实际读取的
  属性一致。

Runner 会校验该对象并发送 `workflow:meta`。交互式 CLI 使用其中的阶段构建
TUI，而 `create` 使用 `exampleArgs` 展示可复制的下一步命令。

### Flow 失败是显式值

`parallel()` 会立即启动每个惰性任务，等待所有任务结束，并保持输入顺序。
同步抛错或 Promise reject 会变成 `null`，且不会取消其他任务。

`pipeline()` 让每个项目独立经过各个阶段。失败的项目会变成 `null`、跳过剩余
阶段，并且不会取消其他项目。

这两个原语都不会静默重试、排队、快速失败或限制并发。调用方必须过滤或以其他
方式处理 nullable 结果，并决定是否接受部分完成。

### 阶段属于整个 Workflow

Workflow 的所有分支共享一个阶段状态。进入 `parallel()` 或 `pipeline()` 前
设置 `phase()`；不要在并发任务或阶段内部改变 phase。重复设置当前标题是
no-op。选择新标题会结束上一个阶段，Workflow 完成时也会结束任何活动阶段。

## 运行 Workflow

以内联 JSON 形式传入示例参数：

```bash
deer-workflow run ./workflow.ts \
  --input '{"topics":["Agent Skills","Dynamic Workflows"]}'
```

输入也可以来自 `--input-file` 或非空 stdin。`--input` 与 `--input-file` 不能
同时使用；显式选项的优先级高于 stdin。

### 交互模式

当 stderr 连接交互式终端时，CLI 会在实时 TUI 中显示 Workflow 名称、模块路径、
工作目录、声明的阶段和渲染后的 Markdown 日志。最终结果仍写入 stdout。

stderr 被重定向时，TUI 会禁用，Workflow 事件将以 JSON Lines 写入 stderr。
stdout 仍然只包含最终结果。

### Print Mode

在服务器、CI/CD、任务队列、进程管道和事件采集器中，使用 `--print` 或 `-p`：

```bash
deer-workflow run ./workflow.ts --print \
  --input '{"topics":["Agent Skills","Dynamic Workflows"]}'
```

Print Mode 会禁用 TUI、向 stdout 每行写入一个紧凑的 Workflow 事件、把 stderr
留给诊断信息，并抑制单独的最终结果。

事件协议包括：

- `workflow:start`
- `workflow:meta`
- `workflow:phase:start`
- `workflow:phase:end`
- `log`
- `workflow:end`
- `workflow:error`

默认情况下，Workflow 参数和结果不会包含在事件中，避免外部 Event Stream
意外暴露大量数据或敏感值。

## 从 TypeScript 使用 Workflow

由宿主应用启动 Workflow 时，使用 `WorkflowRunner`：

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

独立 Runner 默认向 stdout 每行写入一个 JSON 事件。它可以复用于并发执行；
异步 Workflow 和 Logging 上下文保持隔离，而所有事件共享同一个单调递增的
sequence。

Typed Subscription、自定义输出位置、嵌套 Workflow、结果序列化和完整事件 Schema
详见 [API 参考](./api.zh-CN.md)。

## 选择 Agent Runtime

`create` 命令接受 `--agent codex|claude|pi`，默认使用 Codex：

```bash
deer-workflow create --agent claude "描述需要的 Workflow" > workflow.ts
deer-workflow create --agent pi "描述需要的 Workflow" > workflow.ts
```

该选项只选择生成器使用的 Harness。Workflow 模块通过导入的 TypeScript
`agent()` API 调用 Agent Loop，其共享默认 Runtime 为 Codex。

如需直接调用 Claude Code，请实例化它的 Adapter：

```typescript
import { ClaudeAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new ClaudeAgent({ model: "sonnet" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

如需直接调用 Pi，请实例化它的 Adapter：

```typescript
import { PiAgent } from "@deerwork-ai/deer-workflow/agents";

const runtime = new PiAgent({ model: "anthropic/claude-sonnet-4" });
const result = await runtime.run("Inspect this repository.", {
  sandbox: "read-only",
});
```

Pi 0.84.1 没有内置操作系统 Sandbox。`PiAgent` 通过非修改型工具 allowlist
落实 `read-only`；`workspace-write` 使用受路径守卫限制的 edit/write 工具，
写入范围为 `cwd` 与 `additionalWritableDirectories`，并且不启用 bash；
`danger-full-access` 具有 Pi 进程本身的权限。如需宿主机隔离，应使用外部容器或
虚拟机。

三个 Adapter 都实现同一个厂商中立的 `Agent` 接口。提供 Schema 的调用会约束并
解析最终响应，但不会把完整 Agent Loop 降级成单次模型生成。

## 继续学习

- [Deep Research](../examples/deep-research/README.zh-CN.md) 会界定研究主题、
  并行研究多个独立角度、验证结论，并生成交互式 HTML 报告。
- [Blog Writer](../examples/blog-writer/README.zh-CN.md) 使用 `pipeline()` 独立
  起草和审阅各个章节。
- [API 参考](./api.zh-CN.md) 记录每个公共函数、类型、事件和 Runtime 契约。
- [Workflow Creator Skill](../skills/workflow-creator/SKILL.md) 包含 `create`
  使用的生成指令。

## 开发仓库

克隆仓库，然后安装本地依赖和 Git Hooks：

```bash
git clone https://github.com/deerwork-ai/deer-workflow.git
cd deer-workflow
bun install
```

交付修改前运行完整质量门禁：

```bash
bun run check
```

根目录的 `package.json` 是项目命令的事实来源：

| 命令                    | 作用                                               |
| ----------------------- | -------------------------------------------------- |
| `bun run dev -- <args>` | 直接运行 TypeScript CLI 并转发参数。               |
| `bun run lint`          | 检查 JavaScript 和 TypeScript，但不修改文件。      |
| `bun run lint:fix`      | 应用安全的 ESLint 修复。                           |
| `bun run format`        | 使用 Prettier 格式化支持的文件。                   |
| `bun run format:check`  | 检查格式但不修改文件。                             |
| `bun run lint:staged`   | 对 Git 暂存文件运行 pre-commit 检查。              |
| `bun run prepare`       | 安装仓库管理的 Husky Hooks。                       |
| `bun test`              | 运行顶层 `tests/` 目录下的全部测试。               |
| `bun run test:coverage` | 运行全部测试并输出 Bun 覆盖率报告。                |
| `bun run typecheck`     | 对 `src/` 和 `tests/` 执行类型检查，但不输出文件。 |
| `bun run check`         | 运行类型检查、Lint、格式检查和全部测试。           |

每次提交都会通过 `lint-staged` 对暂存文件运行 ESLint 和 Prettier，然后对完整
项目执行类型检查。Lint-staged 保留默认的备份 stash 和回滚行为。
