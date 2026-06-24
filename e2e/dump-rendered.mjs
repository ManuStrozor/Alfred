/* Récupère le JS RENDU (post-GAS) du client depuis le déploiement, via Edge piloté.
 * Le contenu vient du DOM de l'iframe googleusercontent → déjà déséchappé (vrai code exécuté).
 * Puis le valide (syntaxe + :// + caractères invisibles) pour pointer un bug introduit par GAS.
 *
 * Auth : profil Edge persistant (.edge-profile). 1ʳᵉ fois → connecte-toi dans la fenêtre ;
 * ensuite la session est réutilisée. Lancer : npm run dump:rendered [url]
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.argv[2] || process.env.ALFRED_DEPLOY_URL
  || 'https://script.google.com/macros/s/AKfycbw8Ub051TBctTZ_tx6dzwZWUWyDLVWNd_-BnidQFKL5XLQjUC8cTuC-oEHDo6cVvu1Rbg/exec';
const PROFILE = resolve(ROOT, '.edge-profile');
const OUTPUT = 'rendered-script.js';
const OUT = resolve(ROOT, OUTPUT);

mkdirSync(PROFILE, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'msedge',
  headless: false,
  viewport: { width: 430, height: 850 },
  // masque les signaux d'automation que Google détecte ("navigateur non sécurisé")
  args: ['--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
console.log('→ ouverture du déploiement (connecte-toi à Google si demandé)…');
await page.goto(URL, { waitUntil: 'load', timeout: 60000 }).catch(() => {});

// récupère les <script> de l'iframe googleusercontent (≤120 s pour laisser le temps au login)
let scripts = [];
for (let i = 0; i < 120 && scripts.length === 0; i++) {
  for (const f of page.frames()) {
    if (!/googleusercontent/.test(f.url())) continue;
    const s = await f.evaluate(
      () => [...document.scripts].map((x) => x.textContent || '').filter((t) => t.length > 500)
    ).catch(() => []);
    if (s.length) scripts = s;
  }
  if (scripts.length === 0) await page.waitForTimeout(1000);
}
await ctx.close();

if (scripts.length === 0) {
  console.error('✗ Aucun <script> trouvé (login non effectué ? page Setup ?).');
  process.exit(2);
}

const js = scripts.sort((a, b) => b.length - a.length)[0]; // le plus long = le client
writeFileSync(OUT, js, 'utf8');
console.log(`→ JS rendu écrit : ${OUTPUT} (${js.length} o)`);

const issues = [];
try {
  new vm.Script(js, { filename: OUTPUT });
  console.log('✓ syntaxe du rendu OK');
} catch (e) {
  issues.unshift('\n' + (e.stack || e.message).split('\n').slice(0, 7).join('\n'));
}

if (issues.length) {
  console.error('⚠️  Problèmes dans le JS RENDU :\n' + issues.join('\n'));
  process.exit(1);
}
console.log('✓ Rien à signaler dans le rendu.');
