import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

// Modals atteints en profondeur ≥ 2 via le menu hiérarchique.
// `path` = boutons à cliquer APRÈS le hamburger pour atteindre le modal.
const NESTED = [
  { id: 'taches',          path: ['btn-open-taches'] },
  { id: 'outils',          path: ['btn-open-outils'] },
  { id: 'comptes',         path: ['btn-open-comptes'] },
  { id: 'parametres',      path: ['btn-open-parametres'] },
  { id: 'payday',          path: ['btn-open-outils', 'btn-open-payday'] },
  { id: 'connect',         path: ['btn-open-comptes', 'btn-open-connect'] },
  { id: 'accounts',        path: ['btn-open-comptes', 'btn-open-accounts'] },
  { id: 'profil',          path: ['btn-open-parametres', 'btn-open-profil'] },
  { id: 'confidentialite', path: ['btn-open-parametres', 'btn-open-confidentialite'] },
  { id: 'appearance',      path: ['btn-open-parametres', 'btn-open-appearance'] },
  { id: 'systeme',         path: ['btn-open-parametres', 'btn-open-systeme'] },
  { id: 'interface',       path: ['btn-open-parametres', 'btn-open-appearance', 'btn-open-interface'] },
];

for (const { id, path } of NESTED) {
  test(`croix « ${id} » (profondeur ${path.length + 1}) ferme toute la pile`, async ({ page }) => {
    await openApp(page);

    await page.locator('#btn-nav-menu').click();              // ouvre le menu (stack = 1)
    for (const btn of path) await page.locator('#' + btn).click();

    const modal = page.locator('#modal-' + id);
    await expect(modal).toHaveClass(/open/);                  // modal cible ouvert (stack ≥ 2)

    await modal.locator(`#${id}-exit`).click();          // croix → closeAll()
    await expect(page.locator('.modal-overlay.open')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/modal-active/);
  });
}
