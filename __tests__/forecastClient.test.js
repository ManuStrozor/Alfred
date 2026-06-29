'use strict';

/**
 * Test GOLDEN du calcul forecast client (gas/js/Forecast.html — AlfredForecast).
 *
 * Depuis la Phase 4, la math n'existe plus côté serveur : ce test fige les sorties attendues
 * (capturées de l'implémentation serveur d'origine, qui faisait foi) et garantit que le port
 * client continue de les produire au centime près. Fixtures exerçant les chemins clés :
 * bornes Prevs, filtre months, transferts épargne, capitalisation janvier, dépassement plafond.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

/** Charge gas/js/Forecast.html dans un vm et retourne window.AlfredForecast. */
function loadForecastClient() {
  const html = fs.readFileSync(path.resolve(__dirname, '../gas/js/Forecast.html'), 'utf8');
  const code = html.replace(/<\/?script[^>]*>/gi, '');
  const ctx  = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.AlfredForecast;
}

const FC = loadForecastClient();

// ── Entrées (forecastInputs + lignes Prevs) ─────────────────────────────────
// currentAbs = nov. 2025 (2025*12+10) ; période 5 → 6 mois, traverse janvier (capitalisation).
const INPUTS = {
  currentAbs: 24310,
  period: 5,
  budgetInit: 1234.56,
  cslName: 'CSL',
  accounts: [
    { id: 'LEP', rate: 0.025, ceiling: 10000 },
    { id: 'LA',  rate: 0.015, ceiling: 22950 },
    { id: 'CSL', rate: 0,     ceiling: null  },
  ],
  tranSums: { 24310: -200.5, 24311: -200, 24312: 50.25 },
  epargne: {
    LEP: { initialAbs: 24310, sums: { 24310: 9500, 24311: 100 } },
    LA:  { initialAbs: 24310, sums: { 24310: 5000 } },
    CSL: { initialAbs: 24310, sums: { 24310: 1000 } },
  },
};
const PREVS = [
  { row: 2, start: '',        end: '', months: '',  amount: -800, type: ''    }, // loyer mensuel
  { row: 3, start: '',        end: '', months: '',  amount: -300, type: 'LEP' }, // virement LEP
  { row: 4, start: '',        end: '', months: '6', amount:  200, type: ''    }, // prime juin
  { row: 5, start: '12/2025', end: '', months: '',  amount: -150, type: 'LA'  }, // virement LA dès déc.
];

// ── Sorties figées (golden) ─────────────────────────────────────────────────
const GOLDEN_MONTHS = [
  { budget: -1300.5,  lep: 9800,     la: 5000,    csl: 1000 },
  { budget: -1450,    lep: 10200,    la: 5150,    csl: 1000 },
  { budget: -1199.75, lep: 10563.54, la: 5319.31, csl: 1000 },
  { budget: -1250,    lep: 10863.54, la: 5469.31, csl: 1000 },
  { budget: -1250,    lep: 11163.54, la: 5619.31, csl: 1000 },
  { budget: -1250,    lep: 11463.54, la: 5769.31, csl: 1000 },
];
const GOLDEN_ALERTS = [
  { title: 'Plafond LEP dépassé', message: 'LEP dépasse 10000 € en 12/2025 (+200 €) — corriger ligne 3 (Prevs) → -100 €.' },
];

describe('AlfredForecast.compute — golden', () => {
  const out = FC.compute(INPUTS, { lines: PREVS });

  test('soldes budget/lep/la/csl conformes au golden', () => {
    const got = out.months.map(m => ({ budget: m.budget, lep: m.lep, la: m.la, csl: m.csl }));
    expect(got).toEqual(GOLDEN_MONTHS);
  });

  test('alertes plafond conformes au golden', () => {
    expect(out.ceilingAlerts).toEqual(GOLDEN_ALERTS);
  });

  test('métadonnées : mois courant marqué, budgetInit, période', () => {
    expect(out.months).toHaveLength(6);
    expect(out.months[0].isCurrent).toBe(true);
    expect(out.months[0].budgetInit).toBe(1234.56);
    expect(out.months[0].month).toBe('11/2025');
    expect(out.months[1].isForecast).toBe(true);
    expect(out.cslName).toBe('CSL');
    expect(out.periodText).toBe('5 mois');
  });
});

describe('AlfredForecast.periodText', () => {
  test('multiples de 12 → années', () => {
    expect(FC.periodText(12)).toBe('1 an');
    expect(FC.periodText(24)).toBe('2 ans');
  });
  test('sinon → mois', () => {
    expect(FC.periodText(5)).toBe('5 mois');
    expect(FC.periodText(13)).toBe('13 mois');
  });
});
