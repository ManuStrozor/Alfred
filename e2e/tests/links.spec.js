import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

test('liens externes RGPD + CONDS (Confidentialité) ouvrent la bonne page', async ({ page }) => {
  // Capture window.open sans réellement ouvrir d'onglet réseau
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(url); return null; };
  });

  await openApp(page);
  await page.locator('#btn-nav-menu').click();
  await page.locator('#btn-open-parametres').click();
  await page.locator('#btn-open-confidentialite').click();

  const conf = page.locator('#modal-confidentialite');
  await expect(conf).toHaveClass(/open/);

  await conf.locator('#btn-link-rgpd').click();
  await conf.locator('#btn-link-conds').click();

  const opened = await page.evaluate(() => window.__opened);
  expect(opened.some((u) => u.includes('alfred-rgpd'))).toBe(true);
  expect(opened.some((u) => u.includes('alfred-conds'))).toBe(true);
});
