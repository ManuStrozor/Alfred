'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

describe('_sumMonthMap', () => {
  test('somme les montants d\'un même mois', () => {
    const map = new Map([[24300, [100, -50, 25]]]);
    expect(g._sumMonthMap(map)).toEqual({ 24300: 75 });
  });

  test('plusieurs mois → une clé par mois', () => {
    const map = new Map([[24300, [100]], [24301, [200, -50]]]);
    expect(g._sumMonthMap(map)).toEqual({ 24300: 100, 24301: 150 });
  });

  test('Map vide → objet vide', () => {
    expect(g._sumMonthMap(new Map())).toEqual({});
  });

  test('total identique à l\'agrégation de budgetCalc (même ordre, mêmes flottants)', () => {
    // budgetCalc additionne tous les montants d'un mois ; _sumMonthMap doit donner exactement le même total.
    const amounts = [1200.55, -300.20, -49.99];
    const total = amounts.reduce((s, v) => s + v, 0);
    expect(g._sumMonthMap(new Map([[24300, amounts]]))[24300]).toBe(total);
  });
});

describe('_forecastInputs (défensif)', () => {
  test('données manquantes (b_date non Date) → null, sans lever', () => {
    // Mock gas-env : getValue()='' → date non Date → null (le client retombe sur le forecast serveur).
    expect(() => g._forecastInputs()).not.toThrow();
    expect(g._forecastInputs()).toBeNull();
  });
});
