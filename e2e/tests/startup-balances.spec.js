import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Levier 1 — les soldes Enable Banking sont déportés hors de getAllData :
 *  - getAccountBalances() est un appel distinct, déclenché au démarrage,
 *  - le premier rendu n'attend pas la banque,
 *  - renderLinkedAccountCards affiche un skeleton tant que le solde n'est pas connu.
 */
test('démarrage : les soldes sont chargés par un appel séparé de getAllData', async ({ page }) => {
  await openApp(page);

  // getAllData ET getAccountBalances sont deux appels distincts lancés au boot.
  await page.waitForFunction(() => (window.__gasCalls?.getAccountBalances || 0) >= 1);
  expect(await page.evaluate(() => window.__gasCalls.getAllData)).toBeGreaterThanOrEqual(1);

  // Le budget est rendu (plus de skeleton) : le boot ne dépend pas de la réponse des soldes.
  await page.waitForFunction(() => {
    const el = document.getElementById('budget-value');
    return el && !el.querySelector('.skeleton') && el.textContent.trim().length > 0;
  });
});

test('renderLinkedAccountCards : skeleton pendant le chargement, montant ensuite', async ({ page }) => {
  await openApp(page);

  // loading=true → skeleton de solde, aucun montant affiché.
  await page.evaluate(() =>
    renderLinkedAccountCards([{ uid: 'a1', name: 'Courant', currency: 'EUR', balance: null }], true));
  await expect(page.locator('#linked-account-cards .skeleton')).toHaveCount(1);
  await expect(page.locator('#linked-account-cards .balance-hero')).toHaveCount(0);

  // soldes reçus → montant affiché, plus de skeleton.
  await page.evaluate(() =>
    renderLinkedAccountCards([{ uid: 'a1', name: 'Courant', currency: 'EUR', balance: 123.45 }], false));
  await expect(page.locator('#linked-account-cards .skeleton')).toHaveCount(0);
  await expect(page.locator('#linked-account-cards .balance-hero')).toHaveText(/123/);
});
