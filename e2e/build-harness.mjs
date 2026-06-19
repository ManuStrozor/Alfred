/* Assemble gas/App.html en un index.html statique pour les tests Playwright.
 * Reproduit include()/includes() de GAS et remplace les scriptlets <?!= ?> par des mocks.
 * Garde-fous : chaque fragment doit exister, aucun scriptlet <? ?> ne doit subsister. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAS  = resolve(ROOT, 'gas');
const E2E  = resolve(ROOT, 'e2e');
const OUT  = resolve(ROOT, 'dist', 'test');

const read = (p) => readFileSync(p, 'utf8');
const included = [];
let clientJs = ''; // JS client extrait → servi comme fichier séparé (coverage mappée)

/** Lit gas/<name>.html — échoue bruyamment si absent (assure la complétude des includes). */
function fragment(name) {
  const file = resolve(GAS, name + '.html');
  if (!existsSync(file)) throw new Error(`[build-harness] fragment introuvable : « ${name} » → ${file}`);
  included.push(name);
  return read(file);
}

/** Bloc injecté avant le script client : fixtures + mock google.script.run. */
function mockBlock() {
  const fixtures = {
    getAllData: JSON.parse(read(resolve(E2E, 'fixtures', 'getAllData.json'))),
  };
  const mock = read(resolve(E2E, 'mock-gas.js'));
  return `<script>window.__FIXTURES__ = ${JSON.stringify(fixtures)};</script>\n`
       + `<script>\n${mock}\n</script>`;
}

function resolveIncludes(html) {
  // includes([ 'a', 'b', … ]) — tableau éventuellement multi-ligne
  html = html.replace(/<\?!=\s*includes\(\[([\s\S]*?)\]\)\s*\?>/g, (_m, list) => {
    const names = [...list.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    return names.map(fragment).join('\n');
  });
  // include('x') — le client est extrait dans script.js (coverage), précédé du mock GAS
  html = html.replace(/<\?!=\s*include\(\s*['"]([^'"]+)['"]\s*\)\s*\?>/g, (_m, name) => {
    if (name === 'scripts/Script') {
      clientJs = fragment(name).replace(/<\/?script[^>]*>/gi, '');
      return mockBlock() + '\n<script src="script.js"></script>';
    }
    return fragment(name);
  });
  return html;
}

function build() {
  let html = read(resolve(GAS, 'App.html'));

  // getUserPrefs() → prefs.json
  const prefs = read(resolve(E2E, 'fixtures', 'prefs.json')).trim();
  html = html.replace(/<\?!=\s*JSON\.stringify\(getUserPrefs\(\)\)\s*\?>/g, prefs);

  html = resolveIncludes(html);

  const leftover = html.match(/<\?[\s\S]*?\?>/g);
  if (leftover) throw new Error(`[build-harness] scriptlet(s) GAS non résolu(s) :\n  ${leftover.join('\n  ')}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');
  writeFileSync(resolve(OUT, 'script.js'), clientJs, 'utf8');

  console.log(`[build-harness] ${included.length} fragments inclus :`);
  included.forEach((n) => console.log('  ✓ ' + n));
  console.log(`[build-harness] → dist/test/index.html (${html.length} octets)`);
}

build();
