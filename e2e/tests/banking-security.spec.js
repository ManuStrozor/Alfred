import { test, expect } from '../coverage.js';
import { openApp } from '../helpers.js';

test('Gemini : aucun conseil financier conservé dans le stockage partagé du navigateur', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    localStorage.setItem('alfred_gemini_cache', JSON.stringify({ key: 'old', message: 'Ancien utilisateur' }));
    window.__FIXTURES__.getGeminiInsight = { message: 'Conseil actuel', key: 'current' };
    _geminiDone = false;
    document.getElementById('splash').classList.remove('is-hidden');
    _maybeShowGemini();
  });
  await expect(page.locator('#splash-message')).toHaveText('Conseil actuel');
  expect(await page.evaluate(() => localStorage.getItem('alfred_gemini_cache'))).toBeNull();
  const call = await page.evaluate(() => window.__gasLog.filter(c => c.fn === 'getGeminiInsight').at(-1));
  expect(call.args[0]).toBeNull();
});

test('connexion : génère une clé RSA PKCS8 via Web Crypto avant l’appel serveur', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.__FIXTURES__.getSavingsProps = [];
    window.__FIXTURES__.registerEnableBankingApp = { error: 'Test sans banque' };
  });
  await page.locator('#btn-nav-menu').click();
  await page.locator('#btn-open-comptes').click();
  await page.locator('#btn-open-connect').click();
  await page.locator('#conn-bearer').fill('token-test');
  await page.locator('#btn-conn-register').click();
  await page.waitForFunction(() => window.__gasCalls.registerEnableBankingApp === 1);
  const valid = await page.evaluate(async () => {
    const call = window.__gasLog.find(c => c.fn === 'registerEnableBankingApp');
    const der = Uint8Array.from(atob(call.args[1].replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    return call.args[0] === 'token-test' && key.algorithm.modulusLength === 2048;
  });
  expect(valid).toBe(true);
  await expect(page.locator('#btn-conn-register')).toBeEnabled();
});

test('aucun appel bancaire si la génération sécurisée échoue', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.__FIXTURES__.getSavingsProps = [];
    crypto.subtle.generateKey = async () => { throw new Error('indisponible'); };
  });
  await page.locator('#btn-nav-menu').click();
  await page.locator('#btn-open-comptes').click();
  await page.locator('#btn-open-connect').click();
  await page.locator('#conn-bearer').fill('token-test');
  await page.locator('#btn-conn-register').click();
  await expect(page.locator('#btn-conn-register')).toBeEnabled();
  expect(await page.evaluate(() => window.__gasCalls.registerEnableBankingApp || 0)).toBe(0);
});
