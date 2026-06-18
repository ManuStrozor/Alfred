import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test('dailyGoal : appuis successifs → un seul appel setUserPref (debounce 1s)', async ({ page }) => {
  await openApp(page);

  // Le stepper vit dans un modal ; on déclenche les clics via dispatchEvent sur le bouton
  // (le listener click est attaché au démarrage, indépendamment de la visibilité du modal).
  await page.evaluate(() => {
    const b = document.getElementById('btn-goal-plus');
    for (let i = 0; i < 5; i++) b.dispatchEvent(new Event('click'));
  });

  await page.waitForTimeout(1200); // > 1s de debounce
  const calls = await page.evaluate(() => window.__gasCalls.setUserPref || 0);
  expect(calls).toBe(1); // les 5 appuis sont regroupés en une seule persistance
});
