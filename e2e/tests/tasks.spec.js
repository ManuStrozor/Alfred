import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

/**
 * Couvre la refonte sécurité du rendu des tâches (MainScript.html) :
 *  - la case à cocher n'utilise plus de handler inline `onchange="onCheckTask('id')"`
 *    (l'id est désormais lu via dataset + addEventListener → immune à une injection
 *    dans l'id de tâche),
 *  - l'id brut est transmis intact à completeTask malgré l'échappement HTML.
 * Vérifie aussi que window.ALFRED_PREFS est bien injecté (App.html → getUserPrefsJson()).
 */
test('tâche Revolut : cocher appelle completeTask avec l\'id brut, sans handler inline', async ({ page }) => {
  await openApp(page);

  // App.html : le scriptlet getUserPrefsJson() a bien été résolu en objet.
  expect(await page.evaluate(() => typeof window.ALFRED_PREFS)).toBe('object');

  // Ouvre le modal Tâches pour que la liste soit visible.
  await page.locator('#btn-nav-menu').click();
  await page.locator('#btn-open-taches').click();
  await expect(page.locator('#modal-taches')).toHaveClass(/open/);

  // Injecte une tâche dont l'id contient des caractères « piégés » (', &, <, >).
  const TRICKY_ID = "a'b&<x>";
  await page.evaluate((id) => {
    window.__FIXTURES__.completeTask = () => []; // tâche terminée → liste vide
    renderTasks([{ id, title: 'Revolut — Import du 06', notes: '3 opérations' }]);
  }, TRICKY_ID);

  const cb = page.locator('.task-check');
  await expect(cb).toHaveCount(1);
  await expect(page.locator('.task-title')).toContainText('Import');

  // Régression : plus aucun handler inline sur la case.
  expect(await cb.evaluate((el) => el.outerHTML)).not.toContain('onchange');

  await cb.click();
  await page.waitForFunction(() => (window.__gasCalls?.completeTask || 0) >= 1);

  // L'id brut (non ré-encodé) est transmis au backend.
  const args = await page.evaluate(
    () => window.__gasLog.filter((e) => e.fn === 'completeTask')[0].args
  );
  expect(args[0]).toBe(TRICKY_ID);
});
