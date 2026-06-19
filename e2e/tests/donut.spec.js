import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test.beforeEach(async ({ page }) => { await openApp(page); });

test('segments réels rendus dans le donut', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-segments circle').count()).toBe(4); // Besoins, Dette, Envies, Épargne
});

test('anneau de référence 50/30/20 rendu (#donut-target)', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-target circle').count()).toBe(4); // Besoins, Dette, Envies, Épargne
});

test('légende : une cible affichée pour Envies et Épargne uniquement', async ({ page }) => {
  await expect.poll(() => page.locator('#donut-legend .legend-target').count()).toBe(2);
});

test('légende : le donut réagit correctement au clique sur la légende', async ({ page }) => {

  const circles = page.locator('#donut-segments circle');

  async function checkActive(rule) {
    const { circle, legend } = {
      circle: page.locator(`#donut-segments circle[data-rule="${rule}"]`),
      legend: page.locator(`.legend-item[data-rule="${rule}"]`)
    };
    await legend.click();
    await expect.poll(_ => page.locator('#donut-legend .is-active').count()).toBe(1);
    await expect(legend).toHaveClass(/is-active/);
    await expect.poll(async _ =>
      circles.evaluateAll(items =>
        items.filter(el => getComputedStyle(el).opacity === "0.18").length
      )
    ).toBe(3);
    await expect(circle).toHaveCSS('opacity', '1');
  }

  await checkActive('Besoins');
  await checkActive('Dette');
  await checkActive('Envies');
  await checkActive('Epargne');

  await page.locator(`.legend-item[data-rule="Epargne"]`).click();
  await expect.poll(_ => page.locator('#donut-legend .is-active').count()).toBe(0);
  await expect.poll(async _ => circles.evaluateAll(items =>
    items.filter(el => getComputedStyle(el).opacity === "0.18").length
  )).toBe(0);
});