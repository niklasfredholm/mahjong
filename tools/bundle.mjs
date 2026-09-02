/* Fold the whole game into one self-contained .html file.
 *
 * For sending directly to someone as an attachment. Everything -- styles,
 * scripts, artwork, the icon -- is inlined, so the file has no dependencies
 * and needs no server and no network. The service worker is dropped: it
 * cannot register from a file:// page, and with everything already inline
 * there is nothing left for it to cache. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let html = read('index.html');
const css = read('css/app.css');
const js = ['js/layouts.js', 'js/tiles.js', 'js/engine.js', 'js/ui.js'].map(read).join('\n');
const icon = fs.readFileSync(path.join(ROOT, 'icons/icon-192.png')).toString('base64');

html = html
  .replace('<link rel="stylesheet" href="css/app.css">', `<style>\n${css}\n</style>`)
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/png;base64,${icon}">`)
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace(/\n?<script src="js\/[^"]+"><\/script>/g, '')
  .replace('</body>', `<script>\n${js}\n</script>\n</body>`);

// The registration is harmless (it rejects and is caught) but pointless here.
html = html.replace(
  /    if \('serviceWorker' in navigator\) \{\n.*\n    \}\n/,
  '    // (service worker omitted: this build is already fully self-contained)\n');

const out = path.join(ROOT, 'dist', 'mahjong.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`wrote dist/mahjong.html  (${kb} kB, one file, no dependencies)`);
for (const bad of [/href="css\//, /src="js\//, /href="icons\//, /manifest/]) {
  if (bad.test(html)) { console.log(`  WARNING: still references ${bad}`); process.exitCode = 1; }
}
console.log('  no external references remain');
