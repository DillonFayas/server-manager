// Run with Linux Node: node --test tests/process-lifecycle.linux.cjs
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pm = require('../src/services/processManager');
const dirs = [];
const pids = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw Error('Timed out waiting for process state');
    await sleep(20);
  }
}
function alive(pid) {
  try {
    return !/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch { return false; }
}
function project(files, command = 'node launcher.cjs') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-lifecycle-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return { id: path.basename(dir), name: 'Lifecycle regression', path: dir, command };
}
async function readWorker(p) {
  const file = path.join(p.path, 'worker.pid');
  await until(() => fs.existsSync(file));
  const pid = Number(fs.readFileSync(file, 'utf8'));
  pids.push(pid);
  return pid;
}
const worker = `require('fs').writeFileSync('worker.pid', String(process.pid));
process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`;
const launcher = `require('child_process').spawn('sh', ['-c', 'node worker.cjs'], {stdio: 'inherit'});
setInterval(() => {}, 1000);`;

afterEach(async () => {
  await pm.stopAllProjects();
  for (const pid of pids.splice(0)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

test('stop kills deep descendants, including SIGTERM-resistant workers', { skip: process.platform !== 'linux' }, async () => {
  const p = project({ 'launcher.cjs': launcher, 'worker.cjs': worker });
  assert.equal((await pm.startProject(p)).success, true);
  const pid = await readWorker(p);
  assert.equal((await pm.stopProject(p.id)).success, true);
  await until(() => !alive(pid));
  assert.equal(pm.getHealth(p.id).crashCount, 0);
  assert.equal(pm.getProjectStatus(p.id), 'stopped');
});

test('wrapper crash cleans descendants even after they are reparented', { skip: process.platform !== 'linux' }, async () => {
  const p = project({ 'worker.cjs': worker }, 'node worker.cjs & wait');
  const started = await pm.startProject(p);
  const pid = await readWorker(p);
  process.kill(started.pid, 'SIGKILL');
  await until(() => pm.getProjectStatus(p.id) === 'stopped');
  await until(() => !alive(pid));
  assert.equal(pm.getHealth(p.id).crashCount, 1);
  assert.equal(pm.getHealth(p.id).lastCrash.signal, 'SIGKILL');
});

test('a new start cannot overlap cleanup; late callbacks cannot erase replacement', { skip: process.platform !== 'linux' }, async () => {
  const p = project({ 'launcher.cjs': launcher, 'worker.cjs': worker });
  await pm.startProject(p);
  await readWorker(p);
  const stopping = pm.stopProject(p.id);
  assert.equal((await pm.startProject(p)).success, false);
  await stopping;
  fs.unlinkSync(path.join(p.path, 'worker.pid'));
  const replacement = await pm.startProject(p);
  assert.equal(replacement.success, true);
  await readWorker(p);
  await sleep(1200);
  assert.equal(pm.processes.get(p.id).pid, replacement.pid);
  assert.equal(pm.getProjectStatus(p.id), 'running');
});

test('nonzero exits count as crashes; an immediate manual stop does not', { skip: process.platform !== 'linux' }, async () => {
  const crash = project({}, 'exit 7');
  await pm.startProject(crash);
  await until(() => pm.getProjectStatus(crash.id) === 'stopped');
  assert.equal(pm.getHealth(crash.id).lastCrash.code, 7);
  const p = project({ 'launcher.cjs': 'setInterval(() => {}, 1000)' });
  const starting = pm.startProject(p);
  const stopping = pm.stopProject(p.id);
  await Promise.all([starting, stopping]);
  assert.equal(pm.getProjectStatus(p.id), 'stopped');
  assert.equal(pm.getHealth(p.id).crashCount, 0);
});
