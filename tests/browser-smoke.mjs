import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = 8099;
const server = spawn(process.execPath, [path.join(root,'server.mjs'), String(port)], { stdio:['ignore','pipe','pipe'] });
await new Promise(r => setTimeout(r, 600));
const profile = fs.mkdtempSync('/tmp/pixelshift-chrome-');
const args = ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--user-data-dir=${profile}`,'--virtual-time-budget=9000','--dump-dom',`http://127.0.0.1:${port}/?fallback=1&selftest=1`];
const html = await new Promise((resolve,reject)=>{
  const c = spawn('/usr/bin/chromium', args);
  let out='',err=''; c.stdout.on('data',d=>out+=d); c.stderr.on('data',d=>err+=d);
  c.on('close',code=>code===0?resolve(out):reject(new Error(`Chromium exit ${code}\n${err}`)));
});
server.kill('SIGTERM');
if (!html.includes('PixelShift')) throw new Error('UI did not render');
if (!html.includes('data-selftest="pass"')) {
  const m = html.match(/data-selftest-error="([^"]+)/);
  throw new Error(`Conversion self-test failed${m ? `: ${m[1]}` : ''}`);
}
console.log('Browser bulk conversion + ZIP self-test: PASS');
