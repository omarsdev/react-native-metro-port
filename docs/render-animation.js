// Rebuilds docs/how-it-works.gif from docs/animation.html. Needs Chrome and ffmpeg.
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 10;
const PORT = 9333;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'animation-'));

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(work, 'profile')}`,
    '--window-size=960,540',
    '--hide-scrollbars',
    `file://${path.join(__dirname, 'animation.html')}`,
  ], { stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => []);
      target = list.find((entry) => entry.type === 'page' && entry.url.startsWith('file:'));
    }
    if (!target) throw new Error('Chrome did not open the page');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => { socket.onopen = resolve; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) pending.get(message.id)(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      pending.set(++id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    const duration = (await send('Runtime.evaluate', { expression: 'DURATION' })).result.value;
    const frames = duration * FPS;
    for (let i = 0; i < frames; i++) {
      await send('Runtime.evaluate', { expression: `render(${i / FPS})` });
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(work, `frame-${String(i).padStart(4, '0')}.png`), data, 'base64');
    }
    socket.close();
  } finally {
    chrome.kill();
  }

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(work, 'frame-%04d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none',
    '-loop', '0', path.join(__dirname, 'how-it-works.gif'),
  ]);
  fs.rmSync(work, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
