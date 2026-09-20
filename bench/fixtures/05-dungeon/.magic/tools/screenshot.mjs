// A custom magic tool: renders a page of this project in headless Chrome (WebGL works) and returns a PNG screenshot
// together with everything the page wrote to the console, so the model can see what it built and read its own errors.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAX_WAIT_MS = 10_000;
const MAX_CONSOLE_LINES = 80;

const screenshotTool = {
  name: 'screenshot',
  description: 'Opens an HTML file of this project in headless Chrome (WebGL available, file access allowed so module scripts load from '
    + 'file:// URLs), waits for it to render, and returns a PNG screenshot plus every console message and JavaScript error the page produced. Use it after changing the renderer, the UI or '
    + 'the page to see what it shows and whether it errors. Parameters: path (HTML file relative to the project root, default '
    + '"index.html"); query (optional query string appended to the URL, e.g. "?seed=7&script=hjkl"); width and height in pixels '
    + '(default 1280x720); waitMs (render time before the capture, default 1500, max 10000).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'HTML file relative to the project root' },
      query: { type: 'string', description: 'Query string appended to the file URL, starting with ?' },
      width: { type: 'integer', minimum: 200, maximum: 2560 },
      height: { type: 'integer', minimum: 200, maximum: 1600 },
      waitMs: { type: 'integer', minimum: 0, maximum: MAX_WAIT_MS },
    },
  },
  async execute(input, { cwd, signal }) {
    const relative = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : 'index.html';
    const file = resolve(cwd, relative);
    if (!(file + sep).startsWith(resolve(cwd) + sep)) throw new Error('path must stay inside the project: ' + relative);
    await access(file).catch(() => { throw new Error('No such file: ' + relative); });
    const query = typeof input.query === 'string' && input.query.startsWith('?') ? input.query : '';
    const width = Number.isInteger(input.width) ? input.width : 1280;
    const height = Number.isInteger(input.height) ? input.height : 720;
    const waitMs = Number.isInteger(input.waitMs) ? Math.min(input.waitMs, MAX_WAIT_MS) : 1500;
    await access(CHROME).catch(() => { throw new Error('Chrome was not found at ' + CHROME + '; set CHROME_PATH.'); });
    const scratch = await mkdtemp(join(tmpdir(), 'magic-screenshot-'));
    const output = join(scratch, 'shot.png');
    const url = pathToFileURL(file).href + query;
    try {
      // No --user-data-dir: with one, headless Chrome on macOS sits for half a minute before rendering anything.
      const args = [
        '--headless=new', '--allow-file-access-from-files', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--window-size=' + width + ',' + height,
        '--enable-logging=stderr', '--v=0', '--virtual-time-budget=' + waitMs, '--screenshot=' + output, url,
      ];
      const stderr = await run(CHROME, args, signal, waitMs + 30_000);
      const messages = consoleMessages(stderr);
      const image = await readFile(output).catch(() => { throw new Error('Chrome produced no screenshot; console: ' + messages.map(m => m.text).join(' | ')); });
      const errors = messages.filter(message => message.level === 'error').length;
      return {
        content: { url, width, height, waitMs, consoleMessages: messages.length, errors, console: messages.slice(-MAX_CONSOLE_LINES),
          note: errors ? 'The page reported ' + errors + ' error(s); fix them before judging the picture.' : 'No page errors.' },
        images: [{ mediaType: 'image/png', data: image.toString('base64') }],
      };
    } finally { await rm(scratch, { recursive: true, force: true }); }
  },
};
export default screenshotTool;

function run(command, args, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Chrome did not finish within ' + timeoutMs + ' ms')); }, timeoutMs);
    const abort = () => { child.kill('SIGKILL'); reject(new Error('Cancelled')); };
    signal?.addEventListener('abort', abort, { once: true });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(stderr); });
  });
}

// Chrome's logging prints each console call as [pid:tid:time:LEVEL:CONSOLE:line] "message", source: url (line).
function consoleMessages(stderr) {
  const messages = [];
  for (const line of stderr.split('\n')) {
    const match = /^\[[^\]]*:(INFO|WARNING|ERROR|FATAL):CONSOLE:(\d+)\] "([\s\S]*)", source: (\S+) \((\d+)\)\s*$/.exec(line);
    if (!match) continue;
    const text = match[3];
    if (/deprecated with r150\+/.test(text)) continue; // three.js's own notice about the script build
    // Uncaught exceptions arrive at INFO level with an "Uncaught" prefix; they are errors all the same.
    const level = match[1] === 'ERROR' || match[1] === 'FATAL' || /^Uncaught /.test(text) ? 'error' : match[1] === 'WARNING' ? 'warning' : 'log';
    messages.push({ level, text: text.slice(0, 500), source: match[4].replace(/^file:\/\/.*\//, '') + ':' + match[5] });
  }
  return messages;
}

// Also a command: `node .magic/tools/screenshot.mjs [path] [query] [out.png]` writes the screenshot to a file (default
// screenshot.png in the current directory) and prints the console messages as JSON, for agents without the tool.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path = 'index.html', query = '', out = 'screenshot.png'] = process.argv.slice(2);
  const { writeFile } = await import('node:fs/promises');
  const result = await screenshotTool.execute({ path, query }, { cwd: process.cwd(), signal: new AbortController().signal, toolUseId: 'cli' });
  await writeFile(out, Buffer.from(result.images[0].data, 'base64'));
  console.log(JSON.stringify({ ...result.content, screenshot: out }, null, 2));
}
