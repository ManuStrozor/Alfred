import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Phase 2 (parallèle-vérif) : le module client AlfredForecast calcule le forecast en tâche
 * de fond et le compare au forecast serveur. L'UI reste pilotée par le serveur (zéro écart
 * attendu sur la fixture, qui est auto-cohérente : forecastInputs reproduit forecast.months).
 */
test.describe('Forecast — parallèle-vérif (calcul client)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => window.__forecastParity !== undefined);
  });

  test('le module client AlfredForecast est chargé', async ({ page }) => {
    const ok = await page.evaluate(() => typeof window.AlfredForecast?.compute === 'function');
    expect(ok).toBe(true);
  });

  test('la parité client/serveur est vérifiée, sans écart', async ({ page }) => {
    const parity = await page.evaluate(() => window.__forecastParity);
    expect(parity.error).toBeUndefined();
    expect(parity.skipped).toBeUndefined();
    expect(parity.checked).toBeGreaterThan(0);
    expect(parity.diffs).toEqual([]);
    expect(parity.ok).toBe(true);
  });

  test('le serveur pilote toujours l\'UI (budget 740 inchangé)', async ({ page }) => {
    await expect.poll(() => page.locator('#budget-value').innerText()).toContain('740');
  });
});
