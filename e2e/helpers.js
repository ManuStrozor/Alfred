import { expect } from '@playwright/test';

/**
 * Ouvre l'app prête à l'emploi pour les tests « post splash » :
 *  - navigue vers le harnais,
 *  - attend le boot (1er getAllData),
 *  - ferme le splash s'il est affiché (z-index 9999, sinon il bloque toute interaction).
 * Gère aussi le cas hideSplash=true (le splash naît déjà `is-hidden` → pas de clic).
 */
export async function openApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__gasCalls?.getAllData || 0) >= 1);

  const splash = page.locator('#splash');
  const hidden = await splash.evaluate((el) => el.classList.contains('is-hidden')).catch(() => true);
  if (!hidden) await splash.click(); // premier clic = ferme le splash
  await expect(splash).toHaveClass(/is-hidden/);
}
