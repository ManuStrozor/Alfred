'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

describe('_closingBalances — frontière de confiance (Phase 3)', () => {
  test('soldes client fournis (numériques) → utilisés tels quels', () => {
    expect(g._closingBalances({ lep: 9800.5, la: 5000, csl: 1000 }))
      .toEqual({ lep: 9800.5, la: 5000, csl: 1000 });
  });

  test('soldes absents → erreur (pas d\'archive de données obsolètes)', () => {
    // Plus de repli sur la sheet (cellules de soldes non alimentées depuis la Phase 4).
    expect(() => g._closingBalances(null)).toThrow(/manquants/);
    expect(() => g._closingBalances(undefined)).toThrow(/manquants/);
  });

  test('payload invalide (lep non numérique) → erreur, pas de confiance aveugle', () => {
    expect(() => g._closingBalances({ lep: '9800', la: 5000, csl: 1000 })).toThrow(/manquants/);
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
