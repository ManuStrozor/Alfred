import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test('dailyGoal : debounce 1s → un seul appel après rafale de clics', async ({ page }) => {
  await openApp(page);

  await page.clock.install();

  await page.locator('#btn-nav-menu').click();
  await page.getByRole('button', { name: '⚙️ Paramètres Confidentialit' }).click();
  await page.getByRole('button', { name: '👤 Profil ›' }).click();

  for (let i = 0; i < 5; i++) await page.locator('#btn-goal-plus').click();


  // ✅ AUCUN appel avant la fin du debounce
  let calls = await page.evaluate(_ => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(0);

  // ⏩ avance de 950ms → toujours rien
  await page.clock.fastForward(950);
  calls = await page.evaluate(_ => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(0);

  // ⏩ +100ms → debounce expire
  await page.clock.fastForward(100);
  calls = await page.evaluate(_ => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(1);

  // ✅ pas de second appel parasite
  await page.clock.fastForward(1000);
  calls = await page.evaluate(_ => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(1);
});
