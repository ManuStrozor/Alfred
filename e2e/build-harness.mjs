/* Assemble gas/App.html en un index.html statique pour les tests Playwright.
 * Reproduit include()/includes() de GAS — y compris les items paramétrés
 * include('items/x', { ... }) et leurs scriptlets <?= expr ?> (expressions JS) —
 * et remplace les scriptlets serveur (getUserPrefs) par des mocks.
 * Résolution RÉCURSIVE (App → pages/modals → items/svg). Le JS client
 * (js/MainScript) est extrait dans script.js pour une coverage mappée. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAS    = resolve(ROOT, 'gas');
const E2E    = resolve(ROOT, 'e2e');
const OUT    = resolve(ROOT, 'dist', 'test');
const CLIENT = 'js/MainScript'; // fragment portant le <script> client

const read = (p) => readFileSync(p, 'utf8');
let count = 0;
let clientJs = '';

/** Lit gas/<name>.html — échoue bruyamment si absent (assure la complétude des includes). */
function rawFragment(name) {
  const file = resolve(GAS, name + '.html');
  if (!existsSync(file)) throw new Error(`[build-harness] fragment introuvable : « ${name} » → ${file}`);
  count++;
  return read(file);
}

/** Évalue un scriptlet <?= expr ?> avec les params du template en portée (comme GAS). */
function evalExpr(expr, params) {
  try {
    const v = new Function('__p', `with (__p) { return (${expr}); }`)(params);
    return v == null ? '' : String(v);
  } catch (e) {
    throw new Error(`[build-harness] scriptlet « ${expr.trim()} » : ${e.message}`);
  }
}

/** Parse l'objet de params littéral d'un include (issu de notre propre source). */
const parseParams = (objStr) => (objStr ? new Function(`return (${objStr});`)() : {});

const prefsJson = read(resolve(E2E, 'fixtures', 'prefs.json')).trim();

/** Bloc injecté avant le script client : fixtures + mock google.script.run. */
function mockBlock() {
  const fixtures = { getAllData: JSON.parse(read(resolve(E2E, 'fixtures', 'getAllData.json'))) };
  const mock = read(resolve(E2E, 'mock-gas.js'));
  return `<script>window.__FIXTURES__ = ${JSON.stringify(fixtures)};</script>\n<script>\n${mock}\n</script>`;
}

/** Rendu récursif d'un template avec ses params. */
function render(content, params) {
  // getUserPrefsJson() (ou l'ancien JSON.stringify(getUserPrefs())) → prefs mock
  content = content.replace(/<\?!=\s*(?:getUserPrefsJson\(\)|JSON\.stringify\(getUserPrefs\(\)\))\s*\?>/g, prefsJson);

  // includes([ 'a', 'b' ]) → fragments rendus (sans params)
  content = content.replace(/<\?!=\s*includes\(\[([\s\S]*?)\]\)\s*\?>/g, (_m, list) =>
    [...list.matchAll(/['"]([^'"]+)['"]/g)].map((x) => render(rawFragment(x[1]), {})).join('\n')
  );

  // include('path' [, { params }]) → fragment rendu ; le client est extrait dans script.js
  content = content.replace(
    /<\?!=\s*include\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)\s*\?>/g,
    (_m, name, objStr) => {
      if (name === CLIENT) {
        clientJs = rawFragment(name).replace(/<\/?script[^>]*>/gi, '');
        return mockBlock() + '\n<script src="script.js"></script>';
      }
      return render(rawFragment(name), parseParams(objStr));
    }
  );

  // Scriptlets de valeur restants <?= expr ?> / <?!= expr ?> → évalués avec params
  content = content.replace(/<\?!?=\s*([\s\S]*?)\s*\?>/g, (_m, expr) => evalExpr(expr, params));

  return content;
}

function build() {
  const html = render(read(resolve(GAS, 'App.html')), {});

  const leftover = html.match(/<\?[\s\S]*?\?>/g);
  if (leftover) throw new Error(`[build-harness] scriptlet(s) non résolu(s) :\n  ${leftover.join('\n  ')}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'index.html'), html, 'utf8');
  writeFileSync(resolve(OUT, 'script.js'), clientJs, 'utf8');

  console.log(`[build-harness] ${count} fragments inclus (items paramétrés compris)`);
  console.log(`[build-harness] → dist/test/index.html (${html.length} o) · script.js (${clientJs.length} o)`);
}

build();
