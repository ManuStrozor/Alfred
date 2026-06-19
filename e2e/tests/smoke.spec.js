import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test('boot : le splash est visible puis se masque au clic', async ({ page }) => {
  await page.goto('/');
  const splash = page.locator('#splash');
  await expect(splash).toBeVisible();
  await splash.click();
  await expect(splash).toHaveClass(/is-hidden/);
});

test('getAllData est appelé une fois au démarrage', async ({ page }) => {
  await page.goto('/');
  await expect.poll(_ => page.evaluate(_ => window.__gasCalls.getAllData || 0)).toBe(1);
});

test('le budget courant du fixture (740) est rendu', async ({ page }) => {
  await openApp(page);
  await expect.poll(_ => page.locator('#budget-value').innerText()).toContain('740');
});
