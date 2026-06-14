'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

// ─── roundCent ───────────────────────────────────────────────────────────────
describe('roundCent', () => {
  test('arrondit au centime', () => expect(g.roundCent(1234.5678)).toBe(1234.57));
  test('corrige les flottants', () => expect(g.roundCent(0.1 + 0.2)).toBe(0.3));
  test('entier inchangé', () => expect(g.roundCent(5)).toBe(5));
  test('négatif', () => expect(g.roundCent(-2.346)).toBe(-2.35));
});

// ─── _parsePrevBounds ────────────────────────────────────────────────────────
describe('_parsePrevBounds', () => {
  test('start/end/months parsés', () => {
    const b = g._parsePrevBounds('01/2025', '12/2025', '3,6');
    expect(b.start).toBe(g.parseMmYyyy('01/2025'));
    expect(b.end).toBe(g.parseMmYyyy('12/2025'));
    expect([...b.months]).toEqual([3, 6]);
  });

  test('cellules vides → null', () => {
    const b = g._parsePrevBounds('', '', '');
    expect(b.start).toBeNull();
    expect(b.end).toBeNull();
    expect(b.months).toBeNull();
  });
});

// ─── prevLineApplies ─────────────────────────────────────────────────────────
describe('prevLineApplies', () => {
  const may2025  = g.parseMmYyyy('05/2025');
  const june2025 = g.parseMmYyyy('06/2025');

  test('dans la plage → true', () => {
    const b = g._parsePrevBounds('01/2025', '12/2025', '');
    expect(g.prevLineApplies(b, june2025)).toBe(true);
  });

  test('avant start → false', () => {
    const b = g._parsePrevBounds('07/2025', '', '');
    expect(g.prevLineApplies(b, june2025)).toBe(false);
  });

  test('après end → false', () => {
    const b = g._parsePrevBounds('', '05/2025', '');
    expect(g.prevLineApplies(b, june2025)).toBe(false);
  });

  test('filtre mensuel : juin actif, mai non', () => {
    const b = g._parsePrevBounds('', '', '6'); // mois n°6 = juin
    expect(g.prevLineApplies(b, june2025)).toBe(true);
    expect(g.prevLineApplies(b, may2025)).toBe(false);
  });

  test('sans borne ni mois → toujours actif', () => {
    expect(g.prevLineApplies(g._parsePrevBounds('', '', ''), june2025)).toBe(true);
  });
});

// ─── _extractAccounts ────────────────────────────────────────────────────────
describe('_extractAccounts', () => {
  test('accounts_data prioritaire', () => expect(g._extractAccounts({ accounts_data: [1], accounts: [2] })).toEqual([1]));
  test('fallback accounts', () => expect(g._extractAccounts({ accounts: [2] })).toEqual([2]));
  test('objet vide → []', () => expect(g._extractAccounts({})).toEqual([]));
  test('null → []', () => expect(g._extractAccounts(null)).toEqual([]));
});

// ─── _parseBalance ───────────────────────────────────────────────────────────
describe('_parseBalance', () => {
  test('préfère interimAvailable', () => {
    const json = { balances: [
      { balance_type: 'expected', balance_amount: { amount: '99' } },
      { balance_type: 'interimAvailable', balance_amount: { amount: '12.5' } },
    ] };
    expect(g._parseBalance(json)).toBe(12.5);
  });

  test('sinon le premier solde', () =>
    expect(g._parseBalance({ balances: [{ amount: '7' }] })).toBe(7));

  test('aucun solde → null', () => expect(g._parseBalance({ balances: [] })).toBeNull());
  test('json null → null', () => expect(g._parseBalance(null)).toBeNull());
});

// ─── getCached / invalidateCache ─────────────────────────────────────────────
describe('getCached / invalidateCache', () => {
  test('1er appel calcule + met en cache, 2e appel sert le cache', () => {
    const gg = loadAlfred();
    let calls = 0;
    const fn = () => { calls++; return { v: 42 }; };
    expect(gg.getCached('k', fn)).toEqual({ v: 42 });
    expect(gg.getCached('k', () => { throw new Error('ne doit pas être appelé'); })).toEqual({ v: 42 });
    expect(calls).toBe(1);
  });

  test('invalidateCache supprime forecast + budget_rules, garde le reste', () => {
    const gg = loadAlfred();
    gg._cacheStore.set('forecast', '1');
    gg._cacheStore.set('budget_rules', '1');
    gg._cacheStore.set('gemini_insight', '1');
    gg.invalidateCache();
    expect(gg._cacheStore.has('forecast')).toBe(false);
    expect(gg._cacheStore.has('budget_rules')).toBe(false);
    expect(gg._cacheStore.has('gemini_insight')).toBe(true);
  });
});

// ─── _getClosingDates ────────────────────────────────────────────────────────
describe('_getClosingDates', () => {
  test('juin 2026 → 06/2026 + 1er juillet', () => {
    const r = g._getClosingDates(new Date(2026, 5, 1));
    expect(r.closingMonth).toBe(5);
    expect(r.closingYear).toBe(2026);
    expect(r.closingStr).toBe('06/2026');
    expect(r.nextDate).toEqual(new Date(2026, 6, 1));
  });

  test('décembre → bascule sur janvier suivant', () => {
    const r = g._getClosingDates(new Date(2025, 11, 1));
    expect(r.closingStr).toBe('12/2025');
    expect(r.nextDate).toEqual(new Date(2026, 0, 1));
  });
});
