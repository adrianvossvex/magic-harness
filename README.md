<p align="center">
  <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/logo.png" width="128" alt="magic logo">
</p>

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/wordmark-dark.png">
    <img src="https://raw.githubusercontent.com/adrianvossvex/magic-harness/main/assets/wordmark-light.png" width="200" alt="magic">
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

magic runs Claude Code-style tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch) in your project while you chat from the terminal or a local web page. It talks to the Claude, OpenAI, Kimi, DeepSeek and GLM APIs directly, with nothing in between.

## Why

**You choose the model. Nothing routes behind your back.** Pick any model from any configured provider, switch between turns, and see exactly which one answered. Every request magic sends is on record: the system prompt, the declared tools, the messages, the model's reply and the tool results, in a timeline you can open at any time.

**Your tools, your rules.** Drop a JavaScript file into `.magic/tools/` and the model can use it on the next turn; switch any tool off with one click. A harness should not let one person decide how everyone else works.

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
- `readOnly: true` keeps the tool available in Plan mode.
- A module may export one definition or an array, as `default` or as `tools`. A project tool replaces a personal one with the same name. Restart magic after editing a tool file.

Custom tools run with your user's permissions, like everything else magic executes.

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
