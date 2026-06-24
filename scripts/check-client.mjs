/* Vérifie la SYNTAXE des scripts client (gas/js/*.html) sans déploiement.
 * GAS ne renvoie qu'un « SyntaxError » cryptique, sans ligne ni trace.
 * Ici, vm.Script compile le code (sans l'exécuter) et pointe fichier + ligne + extrait.
 * Les numéros de ligne correspondent au .html (on vide juste le texte <script>, on garde les retours).
 * Lancer : npm run check:client */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = resolve(ROOT, 'gas', 'js');

if (!existsSync(JS_DIR)) { console.error('gas/js introuvable'); process.exit(1); }

let failed = false;
for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.html'))) {
  const rel = `gas/js/${file}`;
  const js  = readFileSync(resolve(JS_DIR, file), 'utf8').replace(/<\/?script[^>]*>/gi, '');
  try {
    new vm.Script(js, { filename: rel });
    console.log(`✓ ${rel}`);
  } catch (e) {
    failed = true;
    console.error(`\n✗ ${rel}`);
    console.error((e.stack || e.message).split('\n').slice(0, 5).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
