import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const f of ['index.html','styles.css','app.js','server.mjs','.github/workflows/pages.yml']) {
  if (!fs.existsSync(path.join(root,f))) throw new Error(`Missing ${f}`);
}
const js = fs.readFileSync(path.join(root,'app.js'),'utf8');
new Function(js);
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
if (!html.includes('multiple') || !html.includes('downloadZipBtn')) throw new Error('Bulk/ZIP UI missing');
console.log('Static checks: PASS');
