import { test, expect } from '@playwright/test';
import { openApp } from '../helpers.js';

test.describe('Navigation — Pages (Budget, Evaluate, Prevs)', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('Budget page est visible par défaut', async ({ page }) => {
    const budgetPage = page.locator('#page-budget');
    await expect(budgetPage).toHaveClass(/active/);
  });

  test('Budget nav button a la classe active par défaut', async ({ page }) => {
    const budgetBtn = page.locator('button[data-page="budget"]');
    await expect(budgetBtn).toHaveClass(/active/);
  });

  test('clic sur Evaluate → page-evaluate visible + nav button actif', async ({ page }) => {
    const evaluateBtn = page.locator('button[data-page="evaluate"]');
    await evaluateBtn.click();

    const evaluatePage = page.locator('#page-evaluate');
    await expect(evaluatePage).toHaveClass(/active/);
    await expect(evaluateBtn).toHaveClass(/active/);
  });

  test('clic sur Evaluate → page-budget n\'est pas visible', async ({ page }) => {
    const evaluateBtn = page.locator('button[data-page="evaluate"]');
    await evaluateBtn.click();

    const budgetPage = page.locator('#page-budget');
    await expect(budgetPage).not.toHaveClass(/active/);
  });

  test('clic sur Evaluate → Budget nav button perd la classe active', async ({ page }) => {
    const evaluateBtn = page.locator('button[data-page="evaluate"]');
    const budgetBtn = page.locator('button[data-page="budget"]');

    await evaluateBtn.click();
    await expect(budgetBtn).not.toHaveClass(/active/);
  });

  test('clic sur Prevs → page-prevs visible + nav button actif', async ({ page }) => {
    const prevsBtn = page.locator('button[data-page="prevs"]');
    await prevsBtn.click();

    const prevsPage = page.locator('#page-prevs');
    await expect(prevsPage).toHaveClass(/active/);
    await expect(prevsBtn).toHaveClass(/active/);
  });

  test('clic sur Prevs → page-budget et page-evaluate ne sont pas visibles', async ({ page }) => {
    const prevsBtn = page.locator('button[data-page="prevs"]');
    await prevsBtn.click();

    const budgetPage = page.locator('#page-budget');
    const evaluatePage = page.locator('#page-evaluate');
    await expect(budgetPage).not.toHaveClass(/active/);
    await expect(evaluatePage).not.toHaveClass(/active/);
  });

  test('aller-retour Budget → Evaluate → Budget', async ({ page }) => {
    const budgetBtn = page.locator('button[data-page="budget"]');
    const evaluateBtn = page.locator('button[data-page="evaluate"]');
    const budgetPage = page.locator('#page-budget');

    // Départ : Budget est actif
    await expect(budgetPage).toHaveClass(/active/);

    // Aller à Evaluate
    await evaluateBtn.click();
    await expect(budgetPage).not.toHaveClass(/active/);

    // Revenir à Budget
    await budgetBtn.click();
    await expect(budgetPage).toHaveClass(/active/);
    await expect(budgetBtn).toHaveClass(/active/);
  });

  test('cycle complet : Budget → Evaluate → Prevs → Budget', async ({ page }) => {
    const budgetBtn = page.locator('button[data-page="budget"]');
    const evaluateBtn = page.locator('button[data-page="evaluate"]');
    const prevsBtn = page.locator('button[data-page="prevs"]');

    const budgetPage = page.locator('#page-budget');
    const evaluatePage = page.locator('#page-evaluate');
    const prevsPage = page.locator('#page-prevs');

    // Budget (défaut)
    await expect(budgetPage).toHaveClass(/active/);

    // → Evaluate
    await evaluateBtn.click();
    await expect(evaluatePage).toHaveClass(/active/);
    await expect(budgetPage).not.toHaveClass(/active/);

    // → Prevs
    await prevsBtn.click();
    await expect(prevsPage).toHaveClass(/active/);
    await expect(evaluatePage).not.toHaveClass(/active/);

    // → Budget
    await budgetBtn.click();
    await expect(budgetPage).toHaveClass(/active/);
    await expect(prevsPage).not.toHaveClass(/active/);
  });

  test('aucune page n\'est jamais visible à la fois', async ({ page }) => {
    const pages = ['#page-budget', '#page-evaluate', '#page-prevs'];

    for (const page_id of pages) {
      const btn = page.locator(`button[data-page="${page_id.split('-')[1]}"]`);
      await btn.click();

      // Compter les pages avec la classe active
      const activeCount = await page.evaluate((ids) => {
        return ids.filter(id => document.querySelector(id)?.classList.contains('active')).length;
      }, pages);

      expect(activeCount).toBe(1);
    }
  });
});
