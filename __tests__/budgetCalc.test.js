'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

const startAbs = g.toAbsMonth(2025, 0); // jan 2025

describe('budgetCalc', () => {
  test('aucune donnée → tableau de zéros', () => {
    const result = g.budgetCalc(new Map(), new Map(), startAbs, 3);
    expect(result).toEqual([[0], [0], [0]]);
  });

  test('longueur du résultat = period', () => {
    const result = g.budgetCalc(new Map(), new Map(), startAbs, 6);
    expect(result).toHaveLength(6);
  });

  test('prévisions seules : somme des montants du mois', () => {
    const prevMap = new Map([[startAbs, [1000, -200]]]);
    const result  = g.budgetCalc(prevMap, new Map(), startAbs, 1);
    expect(result[0]).toEqual([800]);
  });

  test('transactions seules : somme des montants du mois', () => {
    const tranMap = new Map([[startAbs, [-300, 100]]]);
    const result  = g.budgetCalc(new Map(), tranMap, startAbs, 1);
    expect(result[0]).toEqual([-200]);
  });

  test('prévisions + transactions : additionnées ensemble', () => {
    const prevMap = new Map([[startAbs, [500, -100]]]);   // jan : 400
    const tranMap = new Map([[startAbs, [-50]]]);          // jan : -50
    const result  = g.budgetCalc(prevMap, tranMap, startAbs, 2);
    expect(result[0]).toEqual([350]);  // jan
    expect(result[1]).toEqual([0]);    // fév : aucune donnée
  });

  test('données uniquement sur certains mois, les autres restent à 0', () => {
    const prevMap = new Map([[startAbs + 2, [100]]]);
    const result  = g.budgetCalc(prevMap, new Map(), startAbs, 4);
    expect(result[0]).toEqual([0]);    // i=0 → startAbs (jan)
    expect(result[1]).toEqual([0]);    // i=1 → startAbs+1 (fév)
    expect(result[2]).toEqual([100]);  // i=2 → startAbs+2 (mar)
    expect(result[3]).toEqual([0]);    // i=3 → startAbs+3 (avr)
  });
});
