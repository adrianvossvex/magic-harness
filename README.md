# magic

A small, observable coding-agent harness. Chat in your terminal or on a local web page while the model works in your project with Claude Code-style tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch). Works with the Claude, OpenAI, Kimi, DeepSeek and GLM APIs.

## Requirements

- Node.js 22.12 or newer
- ripgrep (`brew install ripgrep` on macOS)
- An API key for at least one provider

## Install

```sh
npm install -g github:adrianvossvex/magic-harness
magic --version
```

## Configure a provider

Set one environment variable per provider you want to use:

| Provider | Variable |
|---|---|
| Kimi | `KIMI_API_KEY` |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| GLM (Zhipu) | `GLM_API_KEY` |

Or put them in `~/.magic/providers.json` (readable only by you: `chmod 600`):

```json
{ "kimi": { "apiKey": "..." }, "anthropic": { "apiKey": "..." } }
```

Optional: `MAGIC_MODEL=provider/model` picks the startup model, for example `anthropic/claude-opus-5`. Otherwise the first configured provider's default model is used.

## Start

```sh
cd your-project
magic              # terminal chat, and the web page opens in your browser
magic --no-web     # terminal only
magic web          # web page only: joins a running magic, or starts one
magic --plan       # start in Plan mode (read-only until you approve a plan)
```

Type a task and press Enter. While chatting:

| Command | What it does |
|---|---|
| `/model` | Pick a model, grouped by provider; `/model provider/id` switches directly |
| `/effort` | Thinking effort: default, low, medium, high, xhigh, max (what the model supports) |
| `/tools` | List the tool switches; `/tools Bash off` turns a tool off from the next turn |
| `/compact` | Summarize the conversation to free up context |
| `/plan`, `/execute`, `/approve` | Switch modes; approve a submitted plan |
| `/new`, `/exit` | New session; quit. `Ctrl+C` cancels the running task |

The web page has the same commands plus a settings dialog (gear icon next to the model name). Session logs and settings live in `.magic/` inside your project. Model, effort and tool changes apply from the next turn.

## Notes

- Tools run automatically with your user's permissions. Write and Edit stay inside the project folder.
- WebSearch and WebFetch use Claude's or OpenAI's built-in search when those providers are active; otherwise they use Kimi's services when a Kimi key is present.
- License: using magic is allowed, modifying or redistributing it is not (see LICENSE). Third-party components are listed in THIRD_PARTY_NOTICES.md.
