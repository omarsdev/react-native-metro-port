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
    // /bin/bash on macOS is the 3.2 that Xcode runs the script with.
    const child = spawn(process.platform === 'darwin' ? '/bin/bash' : 'bash', [SCRIPT], {
      env: {
        ...parentEnv,
        PODS_ROOT: path.join(projectRoot, 'ios', 'Pods'),
        DERIVED_FILE_DIR: derivedDir,
        GCC_PREPROCESSOR_DEFINITIONS: 'POD_CONFIGURATION_DEBUG=1 DEBUG=1  COCOAPODS=1',
        RN_METRO_PORT_DEFAULT: String(SCAN_START),
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
const define = (port) => new RegExp(`#define RN_METRO_PORT_RESOLVED ${port}\\n`);

test('uses RCT_METRO_PORT when that Metro is this project', async () => {
  await fakeMetro(SCAN_START + 1, projectRoot);
  const result = await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.equal(result.status, 0);
  assert.match(header(), define(SCAN_START + 1));
});

test('uses RCT_METRO_PORT when nothing is running yet', async () => {
  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.match(header(), define(SCAN_START + 1));
});

test('leaves the default alone when RCT_METRO_PORT is the default', async () => {
  await run({ RCT_METRO_PORT: String(SCAN_START) });
  assert.doesNotMatch(header(), /#define/);
});

test("rejects a stale RCT_METRO_PORT that points at another project's Metro", async () => {
  await fakeMetro(SCAN_START, '/Users/someone/other-app');
  await fakeMetro(SCAN_START + 2, projectRoot);
  await run({ RCT_METRO_PORT: String(SCAN_START) });
  assert.match(header(), define(SCAN_START + 2));
});

test("prefers this project's Metro when nothing answers on RCT_METRO_PORT", async () => {
  await fakeMetro(SCAN_START + 2, projectRoot);
  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.match(header(), define(SCAN_START + 2));
});

test('trusts RCT_METRO_PORT on a Metro too old to report its root', async () => {
  await fakeMetro(SCAN_START + 1);
  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.match(header(), define(SCAN_START + 1));
});

test("keeps RCT_METRO_PORT and warns when it is another project's and this one isn't found", async () => {
  await fakeMetro(SCAN_START + 1, '/Users/someone/other-app');
  const result = await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /belongs to another project/);
  assert.match(header(), define(SCAN_START + 1));
});

test('overrides a rejected port even when the right one is the default', async () => {
  await fakeMetro(SCAN_START, projectRoot);
  await fakeMetro(SCAN_START + 1, '/Users/someone/other-app');
  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.match(header(), define(SCAN_START));
});

test("finds this project's Metro and skips another project's", async () => {
  await fakeMetro(SCAN_START, '/Users/someone/other-app');
  await fakeMetro(SCAN_START + 1, projectRoot);
  await run();
  assert.match(header(), define(SCAN_START + 1));
});

test('does not settle for a server that has no project root header', async () => {
  await fakeMetro(SCAN_START);
  await run();
  assert.doesNotMatch(header(), /#define/);
});

test('reads a percent-encoded root with a doubled leading slash', async () => {
  await fakeMetro(SCAN_START + 1, `/${encodeURI(projectRoot)}`);
  await run();
  assert.match(header(), define(SCAN_START + 1));
});

test('writes no define when no Metro is running', async () => {
  const result = await run();
  assert.equal(result.status, 0);
  assert.doesNotMatch(header(), /#define/);
});

test('falls back to scanning when RCT_METRO_PORT is not a number', async () => {
  await fakeMetro(SCAN_START + 1, projectRoot);
  const result = await run({ RCT_METRO_PORT: 'nope' });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /ignoring invalid RCT_METRO_PORT/);
  assert.match(header(), define(SCAN_START + 1));
});

test('leaves an unchanged header alone so nothing recompiles', async () => {
  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  const file = path.join(derivedDir, 'RNMetroPortConfig.h');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(file, past, past);

  await run({ RCT_METRO_PORT: String(SCAN_START + 1) });
  assert.equal(fs.statSync(file).mtimeMs, past.getTime());

  await run({ RCT_METRO_PORT: String(SCAN_START + 2) });
  assert.notEqual(fs.statSync(file).mtimeMs, past.getTime());
  assert.match(header(), define(SCAN_START + 2));
});

const setPort = (line) =>
  fs.writeFileSync(path.join(projectRoot, 'react-native.config.js'), `${line}\nmodule.exports = {};\n`);

test('uses the port set in react-native.config.js before Metro has started', async () => {
  setPort(`process.env.RCT_METRO_PORT = '${SCAN_START + 2}';`);
  await run();
  assert.match(header(), define(SCAN_START + 2));
});

test('reads the port with double quotes, no quotes and a trailing comment', async () => {
  for (const value of [`"${SCAN_START + 2}"`, `${SCAN_START + 2}`]) {
    setPort(`  process.env.RCT_METRO_PORT = ${value}; // this project`);
    await run();
    assert.match(header(), define(SCAN_START + 2));
  }
});

test('a port passed to the build beats react-native.config.js', async () => {
  setPort(`process.env.RCT_METRO_PORT = '${SCAN_START + 2}';`);
  await run({ RCT_METRO_PORT: String(SCAN_START + 3) });
  assert.match(header(), define(SCAN_START + 3));
});

test("prefers this project's Metro over a configured port that is another project's", async () => {
  setPort(`process.env.RCT_METRO_PORT = '${SCAN_START + 1}';`);
  await fakeMetro(SCAN_START + 1, '/Users/someone/other-app');
  await fakeMetro(SCAN_START + 2, projectRoot);
  await run();
  assert.match(header(), define(SCAN_START + 2));
});

test('ignores a commented-out port', async () => {
  setPort(`// process.env.RCT_METRO_PORT = '${SCAN_START + 2}';`);
  await run();
  assert.doesNotMatch(header(), /#define/);
});

test('ignores a computed port and searches instead', async () => {
  setPort(`process.env.RCT_METRO_PORT = String(${SCAN_START + 2});`);
  await fakeMetro(SCAN_START + 1, projectRoot);
  await run();
  assert.match(header(), define(SCAN_START + 1));
});

test("prefers this project's Metro over a given port that reports no project", async () => {
  await fakeMetro(SCAN_START);
  await fakeMetro(SCAN_START + 1, projectRoot);
  await run({ RCT_METRO_PORT: String(SCAN_START) });
  assert.match(header(), define(SCAN_START + 1));
});

test('reads the fixed port from every config file the CLI loads', async () => {
  for (const extension of ['cjs', 'ts', 'mjs']) {
    const file = path.join(projectRoot, `react-native.config.${extension}`);
    fs.writeFileSync(file, `process.env.RCT_METRO_PORT = '${SCAN_START + 2}';\n`);
    await run();
    assert.match(header(), define(SCAN_START + 2));
    fs.rmSync(file);
    fs.rmSync(path.join(derivedDir, 'RNMetroPortConfig.h'));
  }
});

test('finds a Metro whose project path is not ASCII', async () => {
  projectRoot = path.join(projectRoot, 'تطبيق my app');
  fs.mkdirSync(path.join(projectRoot, 'ios', 'Pods'), { recursive: true });
  await fakeMetro(SCAN_START + 1, encodeURI(projectRoot));
  await run();
  assert.match(header(), define(SCAN_START + 1));
});

test('does not mistake a dead port for this project when the root is missing', async () => {
  const result = await run({
    PODS_ROOT: path.join(projectRoot, 'missing', 'ios', 'Pods'),
    RN_METRO_PORT_DEFAULT: '8081',
  });
  assert.equal(result.status, 0);
  assert.doesNotMatch(header(), /#define/);
});

test('does nothing in a configuration without DEBUG', async () => {
  await fakeMetro(SCAN_START + 1, projectRoot);
  const result = await run({ GCC_PREPROCESSOR_DEFINITIONS: 'POD_CONFIGURATION_RELEASE=1  COCOAPODS=1' });
  assert.equal(result.status, 0);
  assert.doesNotMatch(header(), /#define/);
});

function android(env = {}) {
  const resFile = path.join(derivedDir, 'values', 'rn_metro_port.xml');
  return run({
    PODS_ROOT: '',
    DERIVED_FILE_DIR: '',
    GCC_PREPROCESSOR_DEFINITIONS: '',
    PROJECT_ROOT: projectRoot,
    RN_METRO_PORT_ANDROID_RES: resFile,
    ...env,
  }).then((result) => ({ ...result, resource: () => fs.readFileSync(resFile, 'utf8') }));
}

// Stands in for adb. Lists the given devices and records every other call.
function fakeAdb(devicesOutput) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake adb '));
  const calls = path.join(dir, 'calls.log');
  const adb = path.join(dir, 'adb');
  fs.writeFileSync(
    adb,
    `#!/bin/bash
if [[ "$1" == devices ]]; then
  printf '%b' ${JSON.stringify(devicesOutput)}
else
  echo "$*" >> ${JSON.stringify(calls)}
fi
`,
    { mode: 0o755 },
  );
  return { adb, calls: () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '') };
}

test("android: finds this project's Metro with no port given, as from Android Studio", async () => {
  await fakeMetro(SCAN_START, '/Users/someone/other-app');
  await fakeMetro(SCAN_START + 1, projectRoot);
  const result = await android();
  assert.equal(result.status, 0);
  assert.match(result.resource(), new RegExp(`name="rn_metro_port">${SCAN_START + 1}<`));
});

test('android: records 0 when there is nothing to override', async () => {
  const result = await android();
  assert.match(result.resource(), /name="rn_metro_port">0</);
});

test('android: reverses the port on every connected device and skips offline ones', async () => {
  await fakeMetro(SCAN_START + 1, projectRoot);
  const { adb, calls } = fakeAdb(
    'List of devices attached\nemulator-5554\tdevice\nR58M\tdevice\nOLD1\toffline\n\n',
  );
  await android({ ADB: adb });
  const port = SCAN_START + 1;
  assert.equal(
    calls(),
    `-s emulator-5554 reverse tcp:${port} tcp:${port}\n-s R58M reverse tcp:${port} tcp:${port}\n`,
  );
});

test("android: reverses the port when this project's Metro is on the default", async () => {
  await fakeMetro(SCAN_START, projectRoot);
  const { adb, calls } = fakeAdb('List of devices attached\nR58M\tdevice\n\n');
  const result = await android({ ADB: adb });
  assert.match(result.resource(), /name="rn_metro_port">0</);
  assert.equal(calls(), `-s R58M reverse tcp:${SCAN_START} tcp:${SCAN_START}\n`);
});

test('android: reverses nothing when no Metro was found', async () => {
  const { adb, calls } = fakeAdb('List of devices attached\nR58M\tdevice\n\n');
  await android({ ADB: adb });
  assert.equal(calls(), '');
});

test('android: reverses a configured port before Metro has started', async () => {
  setPort(`process.env.RCT_METRO_PORT = '${SCAN_START + 2}';`);
  const { adb, calls } = fakeAdb('List of devices attached\nR58M\tdevice\n\n');
  const result = await android({ ADB: adb });
  const port = SCAN_START + 2;
  assert.match(result.resource(), new RegExp(`name="rn_metro_port">${port}<`));
  assert.equal(calls(), `-s R58M reverse tcp:${port} tcp:${port}\n`);
});

test('android: a missing adb does not fail the build', async () => {
  await fakeMetro(SCAN_START + 1, projectRoot);
  const result = await android({ ADB: '/nonexistent/adb' });
  assert.equal(result.status, 0);
  assert.match(result.resource(), new RegExp(`name="rn_metro_port">${SCAN_START + 1}<`));
});
