'use strict';

/**
 * Test GOLDEN de computeBudgetRules (gas/js/Forecast.html) — répartition du donut, déplacée
 * depuis l'ancien getBudgetRules serveur (formules Budgets!F4:H8). Valeurs calculées à la main.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

function loadForecastClient() {
  const html = fs.readFileSync(path.resolve(__dirname, '../gas/js/Forecast.html'), 'utf8');
  const code = html.replace(/<\/?script[^>]*>/gi, '');
  const ctx  = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.AlfredForecast;
}

const FC = loadForecastClient();
const LABELS = ['Besoins', 'Envies', 'Epargne', 'Dette'];

describe('computeBudgetRules', () => {
  test('répartition par règle + Reste (golden)', () => {
    // b_in = 1500 (prev revenu), d_in = 500 (transaction sans catégorie > 0) → revenus = 2000.
    // Besoins = -(charge -400 + trans (-100+50)) = 450 → 22,5 %. Envies 300 → 15 %. Epargne 200 → 10 %.
    // Dette 0. Reste = 1 - 0,475 = 0,525 → 52,5 % · 1050 €.
    const out = FC.computeBudgetRules({
      currentAbs: 24317, // 06/2026
      ruleLabels: LABELS,
      prevLines: [
        { row: 2, start: '', end: '', months: '', amount: 1500, rule: '' },             // revenu (b_in)
        { row: 3, start: '', end: '', months: '', amount: -400, rule: 'Besoins' },       // charge active
        { row: 4, start: '01/2030', end: '', months: '', amount: -999, rule: 'Envies' }, // inactive → ignorée
      ],
      monthTransactions: [
        { amount: 500,  rule: '',        category: '' },        // revenu (d_in)
        { amount: -100, rule: 'Besoins', category: 'Courses' },
        { amount: 50,   rule: 'Besoins', category: 'Remb' },
        { amount: -300, rule: 'Envies',  category: 'Loisirs' },
        { amount: -200, rule: 'Epargne', category: 'Invest' },
      ],
    });
    expect(out).toEqual([
      { label: 'Besoins', pct: 22.5, amount: 450 },
      { label: 'Envies',  pct: 15,   amount: 300 },
      { label: 'Epargne', pct: 10,   amount: 200 },
      { label: 'Dette',   pct: 0,    amount: 0 },
      { label: 'Reste',   pct: 52.5, amount: 1050 },
    ]);
  });

  test('charge hors période exclue (active au mois courant uniquement)', () => {
    const out = FC.computeBudgetRules({
      currentAbs: 24317, ruleLabels: LABELS,
      prevLines: [{ row: 4, start: '01/2030', end: '', months: '', amount: -999, rule: 'Envies' }],
      monthTransactions: [{ amount: 1000, rule: '', category: '' }],
    });
    expect(out.find(r => r.label === 'Envies')).toEqual({ label: 'Envies', pct: 0, amount: 0 });
    expect(out.find(r => r.label === 'Reste')).toEqual({ label: 'Reste', pct: 100, amount: 1000 });
  });

  test('aucun revenu (b_in + d_in = 0) → tout à zéro (comme la formule sheet en erreur)', () => {
    const out = FC.computeBudgetRules({
      currentAbs: 24317, ruleLabels: LABELS,
      prevLines: [],
      monthTransactions: [{ amount: -100, rule: 'Besoins', category: 'X' }],
    });
    expect(out).toEqual([
      { label: 'Besoins', pct: 0, amount: 0 },
      { label: 'Envies',  pct: 0, amount: 0 },
      { label: 'Epargne', pct: 0, amount: 0 },
      { label: 'Dette',   pct: 0, amount: 0 },
      { label: 'Reste',   pct: 0, amount: 0 },
    ]);
  });
});
