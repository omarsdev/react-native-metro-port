const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, afterEach, beforeEach, test } = require('node:test');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'resolve-metro-port.sh');

// Far from 8081 so these tests don't see a Metro that happens to be running.
const SCAN_START = 28081;

const servers = [];

function fakeMetro(port, projectRootHeader) {
  return new Promise((resolve) => {
    const server = http.createServer((_, res) => {
      if (projectRootHeader) {
        res.setHeader('X-React-Native-Project-Root', projectRootHeader);
      }
      res.end('packager-status:running');
    });
    servers.push(server);
    server.listen(port, 'localhost', resolve);
  });
}

function closeServers() {
  return Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
}

let projectRoot;
let derivedDir;

beforeEach(() => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'metro port ')));
  projectRoot = path.join(tmp, 'app');
  derivedDir = path.join(tmp, 'derived');
  fs.mkdirSync(path.join(projectRoot, 'ios', 'Pods'), { recursive: true });
});

afterEach(closeServers);
after(closeServers);

// Async on purpose: the fake Metros live in this process, so a spawnSync would block
// the event loop they need to answer curl.
function run(env = {}) {
  const { RCT_METRO_PORT: _, ...parentEnv } = process.env;
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SCRIPT], {
      env: {
        ...parentEnv,
        PODS_ROOT: path.join(projectRoot, 'ios', 'Pods'),
        DERIVED_FILE_DIR: derivedDir,
        RN_METRO_PORT_SCAN_START: String(SCAN_START),
        RN_METRO_PORT_SCAN_COUNT: '4',
        ...env,
      },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

const header = () => fs.readFileSync(path.join(derivedDir, 'RNMetroPortConfig.h'), 'utf8');

test('uses RCT_METRO_PORT from the CLI', async () => {
  const result = await run({ RCT_METRO_PORT: '8082' });
  assert.equal(result.status, 0);
  assert.match(header(), /#define RN_METRO_PORT_RESOLVED 8082\n/);
});

test('leaves the default alone when the port is 8081', async () => {
  await run({ RCT_METRO_PORT: '8081' });
  assert.doesNotMatch(header(), /#define/);
});

test("finds this project's Metro and skips another project's", async () => {
  await fakeMetro(SCAN_START, '/Users/someone/other-app');
  await fakeMetro(SCAN_START + 1, projectRoot);
  await run();
  assert.match(header(), new RegExp(`#define RN_METRO_PORT_RESOLVED ${SCAN_START + 1}\\n`));
});

test('does not settle for a server that has no project root header', async () => {
  await fakeMetro(SCAN_START);
  await run();
  assert.doesNotMatch(header(), /#define/);
});

test('reads a percent-encoded root with a doubled leading slash', async () => {
  await fakeMetro(SCAN_START, `/${encodeURI(projectRoot)}`);
  await run();
  assert.match(header(), new RegExp(`#define RN_METRO_PORT_RESOLVED ${SCAN_START}\\n`));
});

test('writes no define when no Metro is running', async () => {
  const result = await run();
  assert.equal(result.status, 0);
  assert.doesNotMatch(header(), /#define/);
});

test('falls back to scanning when RCT_METRO_PORT is not a number', async () => {
  await fakeMetro(SCAN_START, projectRoot);
  const result = await run({ RCT_METRO_PORT: 'nope' });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /ignoring invalid RCT_METRO_PORT/);
  assert.match(header(), new RegExp(`#define RN_METRO_PORT_RESOLVED ${SCAN_START}\\n`));
});

test('leaves an unchanged header alone so nothing recompiles', async () => {
  await run({ RCT_METRO_PORT: '8082' });
  const file = path.join(derivedDir, 'RNMetroPortConfig.h');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(file, past, past);

  await run({ RCT_METRO_PORT: '8082' });
  assert.equal(fs.statSync(file).mtimeMs, past.getTime());

  await run({ RCT_METRO_PORT: '8083' });
  assert.notEqual(fs.statSync(file).mtimeMs, past.getTime());
  assert.match(header(), /#define RN_METRO_PORT_RESOLVED 8083\n/);
});
