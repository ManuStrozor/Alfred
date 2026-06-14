'use strict';

const { loadAlfred } = require('./helpers/gas-env');

// ── Données de prévision fictives ─────────────────────────────────────────
const FAKE_CUR = {
  month: '06/2026', isCurrent: true,
  budget: 500, budgetInit: 1500,
  lep: 8000, la: 20000
};
const FAKE_FORECAST = JSON.stringify({
  months: [FAKE_CUR], periodText: '12 mois', monthTransactions: [],
});

// Calcule la clé attendue de la même façon que _geminiInputKey (sans b_date)
function expectedKey() {
  const now       = new Date();
  const daysLeft  = Math.max(1,
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1
  );
  return `06/2026|500|8000|20000|${daysLeft}`;
}

// Réponse Gemini API réussie
function geminiOkResponse(text) {
  return {
    getResponseCode: () => 200,
    getContentText:  () => JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

// ── Setup commun ──────────────────────────────────────────────────────────
function setup({ apiKey = 'valid-api-key', cachePreset = {}, fetchResponse = null } = {}) {
  const g = loadAlfred();
  // Pré-charger le forecast en cache pour que getCached() retourne FAKE_FORECAST
  g._cacheStore.set('forecast', FAKE_FORECAST);
  // Configurer les autres entrées de cache
  Object.entries(cachePreset).forEach(([k, v]) => g._cacheStore.set(k, v));
  // Clé API
  if (apiKey) g._propStore.set('GEMINI_API_KEY', apiKey);
  // Mock UrlFetchApp.fetch
  if (fetchResponse) g._setFetch(() => fetchResponse);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
describe('getGeminiInsight', () => {

  test('Cas 1 — Pas de clé API → { noKey: true }', () => {
    const g = setup({ apiKey: null });
    expect(g.getGeminiInsight(null)).toEqual({ noKey: true });
  });

  test('Cas 2 — Cache serveur valide + même clé client → { cached: true }', () => {
    const key     = expectedKey();
    const cached  = JSON.stringify({ message: 'hello', icon: '☀️', key, apiCalled: false });
    const g       = setup({ cachePreset: { gemini_insight: cached } });

    const result = g.getGeminiInsight(key);
    expect(result).toEqual({ cached: true, key });
  });

  test('Cas 3 — Cache serveur valide + clé client différente → message sans appel API', () => {
    const key    = expectedKey();
    const cached = JSON.stringify({ message: 'hello', icon: '☀️', key, apiCalled: false });
    const g      = setup({ cachePreset: { gemini_insight: cached } });

    const result = g.getGeminiInsight('old|stale|key|0|0|0');
    expect(result.message).toBe('hello');
    expect(result.apiCalled).toBe(false);
    expect(result.key).toBe(key);
  });

  test('Cas 4 — Cache expiré + même clé client (données inchangées) → { cached: true }', () => {
    const key = expectedKey();
    const g   = setup(); // cache vide → expiré

    const result = g.getGeminiInsight(key);
    expect(result).toEqual({ cached: true, key });
  });

  test('Cas 5 — Cache expiré + clé différente → appel API Gemini réel', () => {
    const g = setup({ fetchResponse: geminiOkResponse('Bravo pour ton budget !') });

    const result = g.getGeminiInsight('old|stale|key|0|0|0');
    expect(result.message).toBe('Bravo pour ton budget !');
    expect(result.apiCalled).toBe(true);
    expect(result.key).toBe(expectedKey());
  });

  test('Cas 6 — Réponse API vide → { error }', () => {
    const emptyResponse = {
      getResponseCode: () => 200,
      getContentText:  () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '' }] } }] }),
    };
    const g = setup({ fetchResponse: emptyResponse });

    const result = g.getGeminiInsight('other|key|0|0|0|0');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/vide/);
  });

  test('Cas 7 — API retourne 400 → { error: clé invalide }', () => {
    const badKeyResponse = {
      getResponseCode: () => 400,
      getContentText:  () => JSON.stringify({ error: { message: 'API_KEY_INVALID' } }),
    };
    const g = setup({ fetchResponse: badKeyResponse });

    const result = g.getGeminiInsight(null);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/invalide/i);
  });

  test('Cas 8 — API retourne 429 (quota) → { error: quota }', () => {
    const quotaResponse = { getResponseCode: () => 429, getContentText: () => '' };
    const g = setup({ fetchResponse: quotaResponse });

    const result = g.getGeminiInsight(null);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/quota/i);
  });

});
