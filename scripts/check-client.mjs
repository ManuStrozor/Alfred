/* Vérifie les scripts client (gas/js/*.html) sans déploiement :
 *   1) « // » dans une chaîne '…'/"…" → GAS le prend pour un commentaire et TRONQUE la
 *      chaîne au rendu (ex. window.open('https://…') → 'https: → SyntaxError). Backticks OK.
 *   2) caractères INVISIBLES (U+2028/U+2029, zero-width, espace insécable, contrôle…) ;
 *   3) SYNTAXE JS (vm.Script compile sans exécuter → fichier + ligne + extrait).
 * Lancer : npm run check:client */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = resolve(ROOT, 'gas', 'js');

const NAMED = {
  0x0085: 'NEL', 0x00A0: 'NO-BREAK SPACE',
  0x200B: 'ZERO WIDTH SPACE', 0x200C: 'ZWNJ', 0x200D: 'ZWJ',
  0x2028: 'LINE SEPARATOR', 0x2029: 'PARAGRAPH SEPARATOR', 0xFEFF: 'BOM / ZWNBSP',
};
const isControl = (c) => c <= 0x08 || c === 0x0B || c === 0x0C || (c >= 0x0E && c <= 0x1F);
const hex = (c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');
// `://` (URL) — GAS tronque le `//` au rendu, dans N'IMPORTE quelle chaîne (', ", ` inclus)
const PROTOCOL_SLASHES = /:\/\//;

if (!existsSync(JS_DIR)) { console.error('gas/js introuvable'); process.exit(1); }

let failed = false;
const fail = (msg) => { failed = true; console.error(msg); };

for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.html'))) {
  const rel = `gas/js/${file}`;
  const raw = readFileSync(resolve(JS_DIR, file), 'utf8');

  raw.split('\n').forEach((line, i) => {
    // 1) `://` (URL) → GAS tronque le `//` au rendu, même dans un backtick → chaîne cassée
    if (PROTOCOL_SLASHES.test(line)) {
      fail(`✗ ${rel}:${i + 1}  « :// » → GAS tronque le // au rendu (même en backtick). Échapper : 'https:\\/\\/…'.`);
      fail(`    ${line.trim()}`);
    }
    // 2) caractères invisibles
    for (let col = 0; col < line.length; col++) {
      const c = line.charCodeAt(col);
      const name = NAMED[c] || (isControl(c) ? 'CONTROL' : null);
      if (name) fail(`✗ ${rel}:${i + 1}:${col + 1}  caractère invisible ${hex(c)} (${name})`);
    }
  });

  // 3) syntaxe
  try {
    new vm.Script(raw.replace(/<\/?script[^>]*>/gi, ''), { filename: rel });
  } catch (e) {
    fail(`\n✗ ${rel} (syntaxe)`);
    fail((e.stack || e.message).split('\n').slice(0, 5).join('\n'));
  }
}

if (!failed) console.log('✓ Scripts client OK (// en chaîne · caractères invisibles · syntaxe)');
process.exit(failed ? 1 : 0);
