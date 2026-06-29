import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Phase 3 — bascule clôture sur soldes client + Mammouth en endpoint mince.
 * Vérifie côté wiring (via window.__gasLog) :
 *  - maybeAlertMammoth est appelé au chargement avec le mois courant ;
 *  - la clôture transmet les soldes épargne calculés côté client à paydayWeb.
 */
test.describe('Payday & Mammouth (Phase 3)', () => {
  test('maybeAlertMammoth est appelé au chargement avec {budget, budgetInit}', async ({ page }) => {
    await openApp(page);
    const call = await page.waitForFunction(
      () => (window.__gasLog || []).find(c => c.fn === 'maybeAlertMammoth')
    ).then(h => h.jsonValue());
    expect(call.args[0]).toEqual({ budget: 740, budgetInit: 1500 });
  });

  test('la clôture transmet les soldes épargne client à paydayWeb', async ({ page }) => {
    await openApp(page);

    await page.locator('#btn-nav-menu').click();
    await page.locator('#btn-open-outils').click();
    await page.locator('#btn-open-payday').click();
    await expect(page.locator('#modal-payday')).toHaveClass(/open/);

    await page.locator('#salary-input').fill('2000');
    await page.locator('#btn-close-month').click();   // étape 1 : révèle la confirmation
    await page.locator('#btn-confirm-close').click();  // étape 2 : déclenche paydayWeb

    const call = await page.waitForFunction(
      () => (window.__gasLog || []).find(c => c.fn === 'paydayWeb')
    ).then(h => h.jsonValue());

    expect(call.args[0]).toBe(2000);
    // soldes issus du mois courant de la fixture (lep/la/csl)
    expect(call.args[1]).toEqual({ lep: 8000, la: 20000, csl: 0 });
  });
});
