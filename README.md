<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/logo-dark.png">
    <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/logo.png" width="240" alt="magic">
  </picture>
</h1>

<p align="center">
  A small, observable coding-agent harness.<br>
  <strong>Your model. Your tools. Every call on record.</strong>
</p>

<p align="center">
  <img alt="version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-111111">
  <img alt="node 22.12+" src="https://img.shields.io/badge/node-%3E%3D%2022.12-4D6BFE">
  <img alt="providers" src="https://img.shields.io/badge/providers-Claude%20%C2%B7%20OpenAI%20%C2%B7%20Kimi%20%C2%B7%20DeepSeek%20%C2%B7%20GLM-D97757">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-free%20to%20use-7C3AED"></a>
</p>

magic is a local coding-agent harness built on one idea: the person at the keyboard stays in control. You choose which model handles each turn, and nothing reroutes it behind your back. Every request, response and tool call is written to a per-session log you can open from the UI. Your own tools are plain JavaScript files in a folder; the model can use them on the next turn, and any tool can be switched off with a click. Chat in the terminal or a local web page, run several sessions at once, and plan before anything changes.

## Why

- **Your model.** Several providers behind one interface; you decide which model runs each turn, and nothing reroutes it.
- **Every call on record.** Each session keeps a log of every request, response, tool call and result, and the call log in the UI shows it all in order.
- **Your tools, your rules.** A tool is one JavaScript file in a folder. The model uses it on the next turn; any tool can be switched off in settings.
- **Terminal and web, side by side.** Both share the same sessions, tasks run in several sessions at once, plan mode keeps changes behind an explicit approval, and the UI speaks eight languages.

<p align="center">
  <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/demo-models.gif" width="720" alt="Choosing a model and inspecting the call log">
</p>
<p align="center"><sub>Pick a model, send a task, open the call log: every request and tool call is there.</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/demo-custom-tool.gif" width="720" alt="A custom tool defined in the project and used by the model">
</p>
<p align="center"><sub>A tool defined in <code>.magic/tools/</code>, used by the model, and switchable in settings.</sub></p>

## Features

- Terminal chat and a local web UI (localhost only) sharing the same sessions
- Sessions run in parallel: each session runs one task at a time, and any number of sessions can run at once
- UI in English, 简体中文, 日本語, 한국어, Español, Português (Brasil), Deutsch and Français; switch it in settings or with `/language`
- Projects (experimental): a planner session writes a design and a task tree, a deterministic dispatcher runs the tasks in their own sessions with file scopes and acceptance commands; the terminal and the web page both drive it
- Eight built-in tools plus your own, all switchable; Write and Edit stay inside the project folder
- Five providers through one interface, with the Anthropic message format as the common ground and a translator for OpenAI's Responses API
- Per-model thinking effort (default, low, medium, high, xhigh, max)
- Plan mode: read-only exploration, a written plan, explicit approval before changes
- Questions to the user when the model needs a decision
- Automatic context compaction for long sessions, plus `/compact` on demand
- A JSONL log per session with every request, response, tool call and result; sessions resume from it

## Quick start

Requirements: Node.js 22.12+, ripgrep (`brew install ripgrep` on macOS), and an API key for at least one provider.

```sh
npm install -g github:adrianvossvex/magic-harness
export KIMI_API_KEY='...'        # or ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GLM_API_KEY
cd your-project
magic
```

Type a task and press Enter. The web page opens in your browser; the terminal shows the same session.

```sh
magic --no-web     # terminal only
magic web          # web page only: joins a running magic, or starts one
magic --plan       # start in Plan mode
```

### Keys

One environment variable per provider, or a file at `~/.magic/providers.json` (`chmod 600`):

```json
{ "kimi": { "apiKey": "..." }, "anthropic": { "apiKey": "..." }, "openai": { "apiKey": "..." } }
```

| Provider | Variable | Format |
|---|---|---|
| Kimi | `KIMI_API_KEY` | Anthropic |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | Anthropic |
| OpenAI | `OPENAI_API_KEY` | Responses API |
| DeepSeek | `DEEPSEEK_API_KEY` | Anthropic |
| GLM (Zhipu) | `GLM_API_KEY` | Anthropic |

`MAGIC_MODEL=provider/model` (for example `anthropic/claude-opus-5`) picks the startup model; otherwise the first configured provider's default is used. Keys never reach the web page: the browser only talks to the local loop, which keeps them.

### Commands

| Command | What it does |
|---|---|
| `/model` | Pick a model, grouped by provider; `/model provider/id` switches directly |
| `/effort` | Thinking effort for the current model |
| `/tools` | List the tool switches; `/tools Bash off` turns a tool off from the next turn |
| `/settings` | Settings dialog in the web UI: language, providers, model, effort, tools, context |
| `/language` | List the UI languages; `/language ja` switches the terminal and the web page |
| `/project` | Plan and run a long project as a task tree; see Projects below |
| `/compact` | Summarize the conversation to free up context |
| `/plan`, `/execute`, `/approve` | Switch modes; approve a submitted plan |
| `/new`, `/exit` | New session; quit. `Ctrl+C` cancels the terminal's running task |

Settings and session logs live in `.magic/` inside your project. Model, effort and tool changes apply from the next turn. The UI language is personal, so it is kept in `~/.magic/preferences.json`; `MAGIC_LANG=de` overrides it for one run, and without either magic follows your locale.

## Custom tools

A tool is an ES module in `.magic/tools/` (project) or `~/.magic/tools/` (personal). magic loads them when it starts and declares them to the model next to the built-in ones.

```js
// .magic/tools/todo-count.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export default {
  name: 'todo_count',
  description: 'Counts TODO comments in the project and lists the files that contain them.',
  parameters: {
    type: 'object',
    properties: { marker: { type: 'string', description: 'Marker to look for, default TODO' } },
  },
  readOnly: true,   // also available in Plan mode
  async execute({ marker = 'TODO' }, { cwd, signal }) {
    const files = {};
    for await (const file of walk(cwd, signal)) {
      const text = await readFile(file, 'utf8').catch(() => '');
      const count = text.split(marker).length - 1;
      if (count) files[relative(cwd, file)] = count;
    }
    return { marker, total: Object.values(files).reduce((sum, count) => sum + count, 0), files };
  },
};

async function* walk(directory, signal) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted();
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path, signal);
    else yield path;
  }
}
```

The contract:

- `name`: a letter followed by letters, digits, `_` or `-` (up to 64 characters). Built-in names are reserved.
- `description`: what the tool does and returns, written for the model.
- `parameters`: a JSON Schema object for the input (optional; no parameters when omitted). Required keys are checked before `execute` runs.
- `execute(input, { cwd, signal, toolUseId })`: return any JSON value, or `{ content, isError }`; throw to report an error. `cwd` is the session's folder, `signal` fires when the user cancels.
- A tool can also return `{ content, images: [{ mediaType: "image/png", data: "<base64>" }] }` (up to four images, PNG, JPEG, WebP or GIF). The model receives them as image blocks next to the text, so a tool that takes a screenshot lets the model see what it built, when the model can see images at all. The log stores each image once, with the tool result; the call log shows it; old screenshots are cleared first when the context is compacted.
- `readOnly: true` keeps the tool available in Plan mode.
- A module may export one definition or an array, as `default` or as `tools`. A project tool replaces a personal one with the same name. Restart magic after editing a tool file.

Custom tools run with your user's permissions, like everything else magic executes.

## Projects (experimental)

A single conversation is the wrong unit for a piece of work that takes days: compaction keeps the last few steps and loses the structure. A project keeps the structure in files and gives every task its own session.

```text
/project plan Build a small platformer: player, one level, enemies, a title screen
/project run
/project           # progress
/project stop      # pause; running tasks go back to the queue
/project replan Enemies should patrol instead of chasing
```

Three roles, one shared state:

- **Planner** (a model session with read-only tools): explores the repository, writes `design.md`, and submits a task tree through `plan_write`. Every task has a spec, acceptance commands, dependencies, and the file globs it may change. The harness validates the tree and the planner fixes what it rejects. Later, `plan_update` revises the tree without touching tasks that ran.
- **Dispatcher** (code, not a model): runs tasks whose dependencies are done, up to two at a time, never two with overlapping file scopes. Each task gets a fresh session with the brief, the design, the decisions so far and the reports of its dependencies. When the executor calls `task_report`, the dispatcher runs the acceptance commands; failures go back to the same session, up to the task's attempt budget and time limit. Milestones marked for user approval pause the project until you run it again. When tasks fail or report themselves blocked, the planner is asked for a revision; if that does not help, the project pauses and `/project run` retries the failed tasks.
- **Executors** (ordinary sessions): Write and Edit are refused outside the task's file scope (symbolic links resolved), questions are off, and the turn ends with `task_report` (complete, or `blocked` with a reason), `task_split` for a task that turned out too large, or `task_note` for a decision worth recording. Stopping an executor session from the web page marks its task blocked until the next `/project run`; `/project stop` pauses everything and returns running tasks to the queue.

Everything lives in `.magic/project/`: `project.json` (the tree and every attempt), `brief.md`, `design.md`, `decisions.md`, and `events.jsonl` with every dispatcher action. Executor sessions are normal sessions: they show up in the sidebar while they run and keep their full call log.

In the web page, choose **Project** in the mode picker next to Execute and Plan (or click the Project entry in the sidebar, or open `/?view=project`). The transcript gives way to the task tree: the goal, the status, the milestones and every task with its attempts and a button to its session. The message box then starts a project from a goal, or sends a revision once one exists; the planner's session opens so its questions reach you; **Approve the plan and run**, **Continue** and **Stop** do what the terminal commands do, and `/project …` works in the message box too. The web API mirrors the commands: `GET /api/project` and `POST /api/project` with `{ action: "plan" | "run" | "stop" | "replan" }`. A finished project takes more work the same way: describe it, and the planner appends tasks (and can replace the design document) instead of starting over.

This is a test version: Bash commands are not confined to the file scope, review-only acceptance is accepted on the executor's word, and tasks run in the same working tree rather than in separate worktrees.

## Compared with dsh

Same model, same tasks, different harness. [`bench/`](bench/README.md) runs four coding tasks through magic and through DeepSeek's own harness, [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh), both driving `deepseek-flash` (DeepSeek V4.1 Flash) with the same prompt, then scores the result with hidden acceptance suites the agents never see. Three runs per cell, means shown; the full per-run tables and every run's record are in the folder.

| Task | dsh | magic, one session |
|---|---|---|
| `01-todo`: extend a tiny library (8 checks) | 3/3 passed · 0.4 min · $0.006 | 3/3 passed · 0.3 min · $0.005 |
| `02-kv`: a key-value CLI with TTL (10 checks) | 3/3 passed · 1.4 min · $0.023 | 3/3 passed · 1.5 min · $0.024 |
| `03-library`: a library system, three modules and a CLI (15 checks) | 3/3 passed · 2.9 min · $0.050 | 3/3 passed · 2.2 min · $0.040 |
| `04-invoicing`: an invoicing system with money rules and reports (12 checks) | 3/3 passed · 5.6 min · $0.091 | 3/3 passed · 3.5 min · $0.060 |

Both harnesses solved every task in every run. magic's session used fewer requests and tool calls on the larger tasks, so it finished sooner and cost less at the same pass rate; on the small tasks they are even. The project system (planner, dispatcher, executors) also took every task from goal to green, at four to five times the cost of one session: that is the price of a design document, a task tree and a fresh session per task, worth paying for work that does not fit one session and not for a ten-minute task. The benchmark also found and fixed a weakness in magic: a tool call whose JSON the model mangled used to end the turn; now it comes back to the model as an error that says where the brackets went wrong.

The fifth task runs for hours: DELVE, a turn-based roguelike with a deterministic core, a three.js renderer and, in a second phase, a ten-turn rewind, specified in 2,400 words and judged by 21 hidden tests. DeepSeek V4.1 Flash built it three ways from the same text.

<p align="center">
  <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/delve-project.gif" width="720" alt="DELVE as built by magic's project system: walking the dungeon, then rewinding three turns">
</p>
<p align="center"><sub>DELVE as built by the project system: 19 tasks, 5 milestones, 42 sessions, 136 minutes, $1.68, every request on record. Walking the first corridor, then pressing z three times.</sub></p>

| Game (15 checks) + rewind (6 checks) | dsh, one session | magic, one session | magic, project |
|---|---|---|---|
| Round 1 | 15 + 6 · 48 min · $0.37 | 13 + 6 · 79 min · $0.38 | 15 + 6 · 136 min · $1.68 |
| Round 2 | 15 + 6 · 45 min · $0.34 | 15 + 6 · 57 min · $0.31 | 12 + 6 · 99 min · $1.18 |

The honest reading: at two hours, with a million-token model, a single session does not run out of structure yet, and the two harnesses' sessions are close. The project system reached full marks once in two rounds at three to four times the cost, and what that money bought is in the record rather than in the score: a design document, a task tree with acceptance commands, milestone checkpoints a user could have tried, a blocked task that explained itself and a planner that fixed the plan, and a curve of features passing over time. The misses on every side were contract details (a message not returned, a room chosen by a rounded centre), not broken games. The whole method, the per-run records and the curves are in [`bench/README.md`](bench/README.md).

## Providers and effort

magic uses the Anthropic message format with every provider that offers it (Claude, Kimi, DeepSeek, GLM) and translates to OpenAI's Responses API for OpenAI. Effort levels follow each vendor's documentation:

| Models | Effort levels |
|---|---|
| Claude Opus 5, Sonnet 5, Fable 5.1, Opus 4.8, Opus 4.7 | default, low, medium, high, xhigh, max |
| Claude Opus 4.6, Sonnet 4.6 | default, low, medium, high, max |
| Claude Haiku 4.5 | default |
| Kimi k3, k3-256k, kimi-for-coding | default, low, high, max |
| DeepSeek V4 Pro, DeepSeek Flash | default, low, high, max |
| GLM-5.3, GLM-5.2 | default |
| GPT-6 Astra, GPT-5.6, GPT-5.5, GPT-5.4 | default, low, medium, high, xhigh, max |

WebSearch and WebFetch use Claude's built-in web tools or OpenAI's built-in search when those providers are active; with the other providers they use Kimi's search and fetch services when a Kimi key is present, and are simply not declared otherwise.

## How it works

One loop: append your message, send the history and tool list to the model, run the tools it asks for, append the results, repeat until it answers. The loop writes every step to `.magic/sessions/<id>.jsonl`; the web page is a separate process that reads that log and sends commands over a local socket, so a stuck browser never stalls the model. Tools execute automatically, without permission prompts, which is why the log and the switches matter. Each session has its own loop and its own log, so several sessions can run at the same time; within a session, one task runs at a time.

## License

Free to use, including commercially. Modifying, reverse engineering or redistributing magic is not permitted; see [LICENSE](LICENSE). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
