import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test.beforeEach(async ({ page }) => { await openApp(page); });

test('segments réels rendus dans le donut', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-segments .donut-seg').count()).toBeGreaterThan(0);
});

test('anneau de référence 50/30/20 rendu (#donut-target)', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-target circle').count()).toBe(4); // Besoins, Dette, Envies, Épargne
});

test('légende : une cible affichée pour Envies et Épargne uniquement', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-legend .legend-target').count()).toBe(2);
});
