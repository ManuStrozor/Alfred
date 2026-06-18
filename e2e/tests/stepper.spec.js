import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test('dailyGoal : appuis successifs → un seul appel setUserPref (debounce 1s)', async ({ page }) => {
  await openApp(page);

  await page.locator('#btn-nav-menu').click();
  await page.getByRole('button', { name: '⚙️ Paramètres Confidentialit' }).click();
  await page.getByRole('button', { name: '👤 Profil ›' }).click();
  await page.evaluate(() => {
    const b = document.getElementById('btn-goal-plus');
    for (let i = 0; i < 5; i++) b.dispatchEvent(new Event('click'));
  });

  await page.waitForTimeout(1200); // > 1s de debounce
  const calls = await page.evaluate(() => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(1); // les 5 appuis sont regroupés en une seule persistance
});
