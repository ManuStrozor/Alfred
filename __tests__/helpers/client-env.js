'use strict';

/**
 * Charge le JS client (gas/js/MainScript.html) dans un contexte vm isolé avec des
 * stubs DOM/window/localStorage/google.script.run minimaux — même approche que gas-env.js.
 *
 * Le top-level de js/MainScript.html s'exécute (IIFE, listeners, init) : les stubs doivent
 * couvrir ce qu'il touche au chargement (google.script.run chaînable, DOM…).
 *
 * Limitation (comme gas-env) : les `function` déclarées sont exposées sur le contexte ;
 * les `const` (STATE, MOIS…) ne le sont pas → ré-exposées via un épilogue `this.__X = X`.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

function strip(rel) {
  return fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8')
           .replace(/<\/?script[^>]*>/gi, '');
}

function loadClient({ prefs = {}, tab = null } = {}) {
  const lsStore = new Map();
  if (tab !== null) lsStore.set('alfred_tab', tab);

  const elStub = () => ({
    textContent: '', innerHTML: '', value: '',
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, append() {}, replaceWith() {}, setAttribute() {},
  });

  const document = {
    getElementById:   () => elStub(),
    querySelector:    () => null,
    querySelectorAll: () => [],
    createElement:    () => elStub(),
    addEventListener: () => {},
    documentElement:  { setAttribute() {}, style: { setProperty() {} } },
    body:             elStub(),
    activeElement:    { blur() {} },
  };

  // google.script.run : API chaînable factice — withSuccessHandler/withFailureHandler
  // renvoient l'objet, les endpoints (getAllData…) = no-op (callbacks jamais déclenchés en test).
  const gsRun = new Proxy({}, {
    get: (_t, prop) =>
      (prop === 'withSuccessHandler' || prop === 'withFailureHandler')
        ? () => gsRun
        : () => {},
  });

  const ctx = {
    window:       {
      ALFRED_PREFS: prefs,
      addEventListener() {}
    },
    document,
    localStorage: {
      getItem:    k => (lsStore.has(k) ? lsStore.get(k) : null),
      setItem:    (k, v) => lsStore.set(k, String(v)),
      removeItem: k => lsStore.delete(k),
    },
    history:      { state: null, pushState() {}, replaceState() {}, back() {}, go() {} },
    setTimeout:   () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    google:       { script: { run: gsRun } },
    console:      { log() {}, warn() {}, error() {} },
  };

  const code = strip('gas/js/MainScript.html')
             + '\n; this.__STATE = STATE; this.__MOIS = MOIS; this.__WEATHER = WEATHER; this.__RULE_COLORS = RULE_COLORS;';

  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

module.exports = { loadClient };
