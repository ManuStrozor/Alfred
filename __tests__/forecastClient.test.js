'use strict';

/**
 * Parité de la math forecast portée côté client (gas/js/Forecast.html)
 * vs les fonctions backend de gas/Alfred.js, sur des fixtures partagées.
 *
 * Le module client est chargé dans un contexte vm isolé (script HTML dépouillé de
 * ses balises <script>), comme gas-env le fait pour Alfred.js. On ne teste donc que
 * de la math pure — aucun DOM. Tant que le calcul serveur existe (phase parallèle-vérif),
 * ce test garantit que les deux implémentations produisent EXACTEMENT le même forecast.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { loadAlfred, ACCOUNTS } = require('./helpers/gas-env');

/** Charge gas/js/Forecast.html dans un vm et retourne window.AlfredForecast. */
function loadForecastClient() {
  const html = fs.readFileSync(path.resolve(__dirname, '../gas/js/Forecast.html'), 'utf8');
  const code = html.replace(/<\/?script[^>]*>/gi, '');
  const ctx  = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.AlfredForecast;
}

const g  = loadAlfred();
const FC = loadForecastClient();

// ── Fixtures partagées ─────────────────────────────────────────────────────
const currentAbs = g.toAbsMonth(2025, 10); // Nov 2025 = 24310
const period     = 5;                       // 6 mois (Nov→Avr), traverse janvier (capitalisation)

// Lignes Prevs (source unique → dérive la forme sheet A–E et la forme getPrevLines()).
const prevDefs = [
  { row: 2, start: '',        end: '', months: '',  amount: -800, type: ''    }, // loyer mensuel
  { row: 3, start: '',        end: '', months: '',  amount: -300, type: 'LEP' }, // virement LEP (entrée épargne)
  { row: 4, start: '',        end: '', months: '6', amount:  200, type: ''    }, // prime juin uniquement
  { row: 5, start: '12/2025', end: '', months: '',  amount: -150, type: 'LA'  }, // virement LA dès déc.
];
const preValues  = [['A', 'B', 'C', 'D', 'E'], ...prevDefs.map(d => [d.start, d.end, d.months, d.amount, d.type])];
const prevLines  = prevDefs.map(d => ({ ...d, label: '', rule: '' }));

const traRows = [
  ['Date', 'Montant'],
  [new Date(2025, 10, 5),  -120.50], // Nov
  [new Date(2025, 10, 20),  -80],    // Nov
  [new Date(2025, 11, 3),  -200],    // Déc
  [new Date(2026, 0, 15),    50.25], // Jan
];

const epaRows = [
  ['Date', 'Montant', 'Compte'],
  [new Date(2025, 10, 1), 9500, 'LEP'], // solde initial LEP (proche du plafond 10 000)
  [new Date(2025, 10, 1), 5000, 'LA'],
  [new Date(2025, 10, 1), 1000, 'CSL'],
  [new Date(2025, 11, 10), 100, 'LEP'], // dépôt direct LEP en déc.
];

const SA = [ACCOUNTS.LEP, ACCOUNTS.LA, ACCOUNTS.CSL];

// ── Pipeline backend (réplique getForecast + arrondi de _getFullForecast) ───
function backend() {
  const tranMap = g.indexTran(traRows, 'Trans');
  const epaMaps = g.indexEpargne(epaRows);
  const accData = SA.map(acc => {
    const map = epaMaps[acc.id];
    return { acc, map, initialAbs: map.keys().next().value };
  });
  const min = Math.min(...accData.map(a => a.initialAbs), currentAbs);
  const max = Math.max(period, period + 1 + currentAbs - min);
  const prevMap    = g.indexPrev(preValues, min, max);
  const revOutput  = g.budgetCalc(prevMap, tranMap, currentAbs, period + 1);
  const accOutputs = accData.map(a => g.epargneCalc(prevMap, a.map, currentAbs, a.initialAbs, period + 1, a.acc));

  const months = [];
  for (let i = 0; i <= period; i++) {
    months.push({
      budget: g.roundCent(revOutput[i][0]),
      lep:    g.roundCent(accOutputs[0][i][0]),
      la:     g.roundCent(accOutputs[1][i][0]),
      csl:    g.roundCent(accOutputs[2][i][0]),
    });
  }

  g._mock.toastCalls.length = 0;
  accData.forEach((a, k) => g.checkCeiling(accOutputs[k], currentAbs, a.acc, prevMap, preValues));
  const alerts = g._mock.toastCalls.map(t => ({ title: t.title, message: t.msg }));

  return { months, alerts };
}

// ── forecastInputs (ce que getAllData enverrait au client pour ces fixtures) ─
function forecastInputs() {
  const epaMaps = g.indexEpargne(epaRows);
  const epargne = {};
  for (const acc of SA) {
    const map = epaMaps[acc.id];
    epargne[acc.id] = { initialAbs: map.size ? map.keys().next().value : null, sums: g._sumMonthMap(map) };
  }
  return {
    currentAbs,
    period,
    budgetInit: 1234.56,
    cslName:    'CSL',
    accounts:   SA.map(a => ({ id: a.id, rate: a.rate, ceiling: a.ceiling })),
    tranSums:   g._sumMonthMap(g.indexTran(traRows, 'Trans')),
    epargne,
  };
}

describe('Forecast client — parité avec le backend', () => {
  const exp = backend();
  const out = FC.compute(forecastInputs(), { lines: prevLines });

  test('soldes budget/lep/la/csl identiques mois par mois', () => {
    const got = out.months.map(m => ({ budget: m.budget, lep: m.lep, la: m.la, csl: m.csl }));
    expect(got).toEqual(exp.months);
  });

  test('alertes plafond identiques aux toasts serveur', () => {
    // Les fixtures font dépasser le plafond LEP (10 000 €) → au moins une alerte attendue.
    expect(exp.alerts.length).toBeGreaterThan(0);
    expect(out.ceilingAlerts).toEqual(exp.alerts);
  });

  test('métadonnées : mois courant marqué, budgetInit transmis, période ' + (period) + ' mois', () => {
    expect(out.months).toHaveLength(period + 1);
    expect(out.months[0].isCurrent).toBe(true);
    expect(out.months[0].budgetInit).toBe(1234.56);
    expect(out.months[0].month).toBe('11/2025');
    expect(out.months[1].isForecast).toBe(true);
    expect(out.cslName).toBe('CSL');
    expect(out.periodText).toBe('5 mois');
  });
});

describe('Forecast client — periodText', () => {
  test('multiples de 12 → années', () => {
    expect(FC.periodText(12)).toBe('1 an');
    expect(FC.periodText(24)).toBe('2 ans');
  });
  test('sinon → mois', () => {
    expect(FC.periodText(5)).toBe('5 mois');
    expect(FC.periodText(13)).toBe('13 mois');
  });
});
