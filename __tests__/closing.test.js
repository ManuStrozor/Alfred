'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

describe('_closingBalances — frontière de confiance (Phase 3)', () => {
  test('soldes client fournis (numériques) → utilisés tels quels', () => {
    expect(g._closingBalances({ lep: 9800.5, la: 5000, csl: 1000 }))
      .toEqual({ lep: 9800.5, la: 5000, csl: 1000 });
  });

  test('soldes absents → fallback lecture sheet, sans lever', () => {
    expect(() => g._closingBalances(null)).not.toThrow();
    expect(() => g._closingBalances(undefined)).not.toThrow();
  });

  test('payload invalide (lep non numérique) → fallback, pas de confiance aveugle', () => {
    // typeof balances.lep !== 'number' → on ignore le payload et on relit la sheet.
    const r = g._closingBalances({ lep: '9800', la: 5000, csl: 1000 });
    expect(r.lep).not.toBe('9800');
  });
});

describe('_collectClosingInfo — ne lit plus les soldes épargne', () => {
  test('retourne prevsTotal mais plus lepBal/laBal/cslBal', () => {
    const r = g._collectClosingInfo(2026, 5);
    expect(r).toHaveProperty('prevsTotal');
    expect(r).not.toHaveProperty('lepBal');
    expect(r).not.toHaveProperty('laBal');
    expect(r).not.toHaveProperty('cslBal');
  });
});

describe('maybeAlertMammoth — endpoint mince (best-effort)', () => {
  test('délègue sans lever, même Mammouth désactivé', () => {
    expect(() => g.maybeAlertMammoth({ budget: 100, budgetInit: 1500 })).not.toThrow();
  });
  test('cur invalide (budget null) → ne lève pas', () => {
    expect(() => g.maybeAlertMammoth({ budget: null, budgetInit: 0 })).not.toThrow();
  });
});
