import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Règles et catégories sont des constantes client (RULES / CATEGORIES) — plus de lecture serveur.
 * Le select règle liste les 4 règles fixes ; le select catégorie est groupé par thème (optgroups).
 */
test.describe('Selects transaction (listes fixes)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('tx-rule : option vide + les 4 règles fixes', async ({ page }) => {
    const labels = await page.locator('#tx-rule option').allTextContents();
    expect(labels).toEqual(['—', 'Besoins', 'Envies', 'Epargne', 'Dette']);
  });

  test('tx-category : catégories groupées par thème (optgroups)', async ({ page }) => {
    const themes = await page.locator('#tx-category optgroup').evaluateAll(gs => gs.map(g => g.label));
    expect(themes).toContain('Logement');
    expect(themes).toContain('Transport');
    expect(themes.length).toBe(8);
    expect(await page.locator('#tx-category optgroup option').count()).toBeGreaterThan(20);
  });
});
