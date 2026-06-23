import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

test('items form-field / form-select / link-button : rendu + attributs préservés', async ({ page }) => {
  await openApp(page);

  // form-field — attributs portés par `attrs` correctement injectés
  await expect(page.locator('#tx-amount')).toHaveAttribute('type', 'number');
  await expect(page.locator('#tx-label')).toHaveAttribute('maxlength', '80');
  await expect(page.locator('#mammoth-email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#pl-label')).toHaveClass(/form-input/);

  // form-select — <select> vide (rempli par JS)
  await expect(page.locator('select#tx-rule')).toBeAttached();
  await expect(page.locator('select#tx-category')).toBeAttached();

  // link-button — bouton CTA
  await expect(page.locator('button#btn-see-charges.show-all-btn')).toBeAttached();
  await expect(page.locator('button#btn-import-revolut.show-all-btn')).toBeAttached();
});
