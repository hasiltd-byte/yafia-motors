import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
if (!fs.existsSync(path.join(root, 'node_modules/next/dist/bin/next'))) {
  const result = spawnSync(
    process.platform === 'win32' ? 'cmd.exe' : 'npm',
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ci'] : ['ci'],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0)
    throw Error('Dependency installation failed. Run npm ci in the project folder.');
}
const prepared = spawnSync(process.execPath, [path.join(root, 'scripts/prepare.mjs')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (prepared.status !== 0) throw Error('Could not prepare the website assets.');
const address = 'http://localhost:4173';
async function ready() {
  try {
    const r = await fetch(address + '/he/', { signal: AbortSignal.timeout(10000) });
    return r.ok && (await r.text()).includes('Yafia Motors Next CMS');
  } catch {
    return false;
  }
}
if (!(await ready())) {
  // Upgrade the old static server only when its exact script belongs to this checkout.
  // Never stop a listener belonging to another project.
  if (process.platform === 'win32') {
    const stopLegacy = `$ErrorActionPreference='Stop'; $expectedScript=[IO.Path]::GetFullPath((Join-Path $env:YAFIA_LOCAL_ROOT 'server.mjs')); Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { $candidate=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$_); if($candidate.Name -eq 'node.exe' -and $candidate.CommandLine.Contains('"'+$expectedScript+'"')) { Stop-Process -Id $candidate.ProcessId -Force } }; exit 0`;
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', stopLegacy],
      {
        cwd: root,
        env: { ...process.env, YAFIA_LOCAL_ROOT: root },
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw Error(
        'Could not stop the legacy server for this checkout. Close it before launching Next.js.',
      );
  }
  fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
  const log = fs.openSync(path.join(root, 'qa/local-server.log'), 'a');
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      '4173',
    ],
    { cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true },
  );
  child.unref();
  fs.closeSync(log);
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !(await ready())) await new Promise((r) => setTimeout(r, 200));
}
if (!(await ready()))
  throw Error(
    'Could not start Next.js on port 4173. Close an older local server if it is using that port; see qa/local-server.log.',
  );
console.log(
  'Hebrew: ' +
    address +
    '/he/\nArabic: ' +
    address +
    '/ar/\nSite management: ' +
    address +
    '/admin/',
);
if (process.platform === 'win32' && !process.argv.includes('--no-open'))
  spawn('powershell.exe', ['-NoProfile', '-Command', "Start-Process 'http://localhost:4173/he/'"], {
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
