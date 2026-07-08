import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Levier 2 — import Revolut à valider (non bloquant) :
 *  - previewRevolutImport ne fait que proposer (pastille + notification, aucune écriture),
 *  - le modal permet de cocher/décocher et d'ajuster règle/catégorie,
 *  - confirmRevolutImport ne reçoit QUE les lignes cochées, avec leurs choix.
 */
const CANDIDATES = [
  { key: '0', isoDate: '2025-07-01', amount: -12.5, label: 'IKEA', rule: 'Envies', category: 'Unknown' },
  { key: '1', isoDate: '2025-07-02', amount: -30, label: 'Leclerc', rule: 'Envies', category: 'Unknown' },
];

async function mockImport(page) {
  await page.evaluate((cands) => {
    window.__FIXTURES__.previewRevolutImport = () => ({ candidates: cands });
    window.__FIXTURES__.confirmRevolutImport = (selections) =>
      ({ imported: selections.length, ...window.__FIXTURES__.getAllData });
  }, CANDIDATES);
}

test('le bouton import ouvre le modal de validation (aucune écriture directe)', async ({ page }) => {
  await openApp(page);
  await mockImport(page);

  await page.locator('#btn-show-all-trans').click();
  await expect(page.locator('#modal-month-trans')).toHaveClass(/open/);
  await page.locator('#btn-import-revolut').click();

  // Modal de validation ouvert avec les 2 candidates ; la pastille reflète le nombre.
  await expect(page.locator('#modal-import')).toHaveClass(/open/);
  await expect(page.locator('#import-list .import-item')).toHaveCount(2);
  await expect(page.locator('#recent-trans-badge')).toHaveText('2');

  // Rien n'est importé tant qu'on n'a pas validé.
  expect(await page.evaluate(() => window.__gasCalls?.confirmRevolutImport || 0)).toBe(0);
});

test('valider n\'envoie que les lignes cochées avec règle/catégorie choisies', async ({ page }) => {
  await openApp(page);
  await mockImport(page);

  await page.locator('#btn-show-all-trans').click();
  await page.locator('#btn-import-revolut').click();
  await expect(page.locator('#modal-import')).toHaveClass(/open/);

  // Décoche la 1re ligne, change la règle de la 2e.
  await page.locator('#import-list .import-item').nth(0).locator('.import-check').uncheck();
  await page.locator('#import-list .import-item').nth(1).locator('.import-rule').selectOption('Besoins');

  await page.locator('#btn-import-confirm').click();
  await page.waitForFunction(() => (window.__gasCalls?.confirmRevolutImport || 0) >= 1);

  // Seule la ligne cochée (key '1', règle 'Besoins') est transmise.
  const selections = await page.evaluate(
    () => window.__gasLog.filter((e) => e.fn === 'confirmRevolutImport')[0].args[0]);
  expect(selections).toHaveLength(1);
  expect(selections[0]).toMatchObject({ key: '1', rule: 'Besoins' });

  // Modal fermé, pastille effacée.
  await expect(page.locator('#modal-import')).not.toHaveClass(/open/);
  await expect(page.locator('#recent-trans-badge')).not.toHaveClass(/is-visible/);
});

test('scan de fond : pastille + notification quand il y a des nouvelles transactions', async ({ page }) => {
  await openApp(page);
  await mockImport(page);

  // Reproduit le scan lancé par loadAppData quand l'auto-import est actif.
  await page.evaluate(() => _scanImport());
  await page.waitForFunction(() => (window.__gasCalls?.previewRevolutImport || 0) >= 1);

  await expect(page.locator('#recent-trans-badge')).toHaveText('2');
  await expect(page.locator('#recent-trans-badge')).toHaveClass(/is-visible/);
  await expect(page.locator('#toast')).toContainText('à valider');
});
