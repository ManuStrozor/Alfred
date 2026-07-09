import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Phase 4 — le forecast est calculé côté client (AlfredForecast) à partir de forecastInputs ;
 * le serveur ne renvoie plus de soldes. On vérifie que le module pilote bien l'UI.
 */
test.describe('Forecast calculé côté client (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('le module AlfredForecast est chargé', async ({ page }) => {
    const ok = await page.evaluate(() => typeof window.AlfredForecast?.compute === 'function');
    expect(ok).toBe(true);
  });

  test('le budget courant affiché provient du calcul client (740)', async ({ page }) => {
    await expect.poll(() => page.locator('#budget-value').innerText()).toContain('740');
  });

  test('compute() est cohérent avec la fixture getAllData (budget courant = 740)', async ({ page }) => {
    const budget = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const fc = window.AlfredForecast.compute(fx.forecastInputs, fx.prevs);
      return fc.months.find(m => m.isCurrent).budget;
    });
    expect(budget).toBe(740);
  });
});

/**
 * soldeReport (ex-ligne Trans "Solde", remplacée par la UserProp alfred_soldeReport) :
 *  - compute() l'ajoute au budget du seul mois courant, quel que soit son signe ;
 *  - computeBudgetRules() l'ajoute à d_in (donut) uniquement s'il est positif.
 * On clone forecastInputs de la fixture partagée (jamais modifiée) pour contrôler l'entrée.
 */
test.describe('AlfredForecast — soldeReport (report de solde)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('compute() : soldeReport positif s\'ajoute au budget du mois courant, pas des mois futurs', async ({ page }) => {
    const months = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const inputs = JSON.parse(JSON.stringify(fx.forecastInputs));
      inputs.period = 1;
      inputs.tranSums[inputs.currentAbs + 1] = 500; // mois futur, sommes distinctes
      inputs.soldeReport = 260;
      return window.AlfredForecast.compute(inputs, fx.prevs).months;
    });
    expect(months[0].isCurrent).toBe(true);
    expect(months[0].budget).toBe(1000); // 740 (tranSums) + 260 (report)
    expect(months[1].isForecast).toBe(true);
    expect(months[1].budget).toBe(500); // mois futur inchangé
  });

  test('compute() : soldeReport négatif se soustrait au budget du mois courant', async ({ page }) => {
    const budget = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const inputs = JSON.parse(JSON.stringify(fx.forecastInputs));
      inputs.soldeReport = -200;
      return window.AlfredForecast.compute(inputs, fx.prevs).months.find(m => m.isCurrent).budget;
    });
    expect(budget).toBe(540); // 740 - 200
  });

  test('computeBudgetRules() : soldeReport positif s\'ajoute à d_in et augmente le Reste', async ({ page }) => {
    const { withoutReport, withReport } = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const base = {
        prevLines:         fx.prevs.lines,
        monthTransactions: fx.monthTransactions,
        currentAbs:        fx.forecastInputs.currentAbs,
        ruleLabels:        ['Besoins', 'Dette', 'Epargne', 'Envies'],
      };
      return {
        withoutReport: window.AlfredForecast.computeBudgetRules(base),
        withReport:    window.AlfredForecast.computeBudgetRules({ ...base, soldeReport: 260 }),
      };
    });
    const besoinsSansReport = withoutReport.find(r => r.label === 'Besoins');
    const besoinsAvecReport = withReport.find(r => r.label === 'Besoins');
    const resteSansReport   = withoutReport.find(r => r.label === 'Reste');
    const resteAvecReport   = withReport.find(r => r.label === 'Reste');

    // Montant d'une règle catégorisée = -Σ(charges+trans de la règle) : indépendant de d_in.
    expect(besoinsSansReport.amount).toBe(760);
    expect(besoinsAvecReport.amount).toBe(760);

    // Le Reste (revenus non affectés à une règle) absorbe le report positif.
    expect(resteSansReport.amount).toBe(640);
    expect(resteSansReport.pct).toBe(32);
    expect(resteAvecReport.amount).toBe(900); // 640 + 260
    expect(resteAvecReport.pct).toBeCloseTo(39.8, 1);
  });

  test('computeBudgetRules() : soldeReport nul ou négatif n\'entre pas dans d_in (répartition inchangée)', async ({ page }) => {
    const { base, zero, negative } = await page.evaluate(() => {
      const fx = window.__FIXTURES__.getAllData;
      const input = {
        prevLines:         fx.prevs.lines,
        monthTransactions: fx.monthTransactions,
        currentAbs:        fx.forecastInputs.currentAbs,
        ruleLabels:        ['Besoins', 'Dette', 'Epargne', 'Envies'],
      };
      return {
        base:     window.AlfredForecast.computeBudgetRules(input),
        zero:     window.AlfredForecast.computeBudgetRules({ ...input, soldeReport: 0 }),
        negative: window.AlfredForecast.computeBudgetRules({ ...input, soldeReport: -50 }),
      };
    });
    expect(zero).toEqual(base);
    expect(negative).toEqual(base);
  });
});

/**
 * Flux MainScript intégré : _computeForecast alimente _cache.soldeReport depuis
 * forecastInputs.soldeReport, et _computeRules() le transmet à computeBudgetRules pour le donut.
 * La fixture partagée getAllData.json (soldeReport absent → 0) n'est pas modifiée : on surcharge
 * window.__FIXTURES__ avant le boot via un init script (intercepte l'affectation faite par le harnais).
 */
test.describe('Flux MainScript — soldeReport bout en bout (budget + donut)', () => {
  async function openAppWithSoldeReport(page, soldeReport) {
    await page.addInitScript((solde) => {
      let stored;
      Object.defineProperty(window, '__FIXTURES__', {
        configurable: true,
        get() { return stored; },
        set(v) {
          if (v && v.getAllData && v.getAllData.forecastInputs) {
            v.getAllData.forecastInputs.soldeReport = solde;
          }
          stored = v;
        },
      });
    }, soldeReport);
    await openApp(page);
  }

  test('report positif : budget courant affiché = 740 + report', async ({ page }) => {
    await openAppWithSoldeReport(page, 260);
    const [text, expected] = await Promise.all([
      page.locator('#budget-value').innerText(),
      page.evaluate(() => fmt(1000)),
    ]);
    expect(text).toBe(expected);
  });

  test('report positif : le donut (_computeRules) reporte le montant sur "Reste"', async ({ page }) => {
    await openAppWithSoldeReport(page, 260);
    const reste = await page.evaluate(() => _computeRules().find(r => r.label === 'Reste'));
    expect(reste.amount).toBe(900); // 640 (baseline) + 260 (report)
  });

  test('report négatif : réduit le budget courant mais n\'affecte pas le donut', async ({ page }) => {
    await openAppWithSoldeReport(page, -200);
    const [text, expected, reste] = await Promise.all([
      page.locator('#budget-value').innerText(),
      page.evaluate(() => fmt(540)),
      page.evaluate(() => _computeRules().find(r => r.label === 'Reste')),
    ]);
    expect(text).toBe(expected);
    expect(reste.amount).toBe(640); // inchangé : report négatif ignoré par computeBudgetRules
  });
});
