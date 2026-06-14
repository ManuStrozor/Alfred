'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

const jan25 = g.toAbsMonth(2025, 0); // 24300
const feb25 = g.toAbsMonth(2025, 1); // 24301

describe('indexTran', () => {
  test('plusieurs montants sur le même mois → regroupés dans un tableau', () => {
    const rows = [
      ['Date', 'Montant'],
      [new Date(2025, 0, 10),  100],
      [new Date(2025, 0, 25), -50],
    ];
    const map = g.indexTran(rows, 'Trans');
    expect(map.get(jan25)).toEqual([100, -50]);
  });

  test('deux mois différents → deux clés distinctes', () => {
    const rows = [
      ['Date', 'Montant'],
      [new Date(2025, 0, 1), 100],
      [new Date(2025, 1, 1), 200],
    ];
    const map = g.indexTran(rows, 'Trans');
    expect(map.get(jan25)).toEqual([100]);
    expect(map.get(feb25)).toEqual([200]);
  });

  test('montant négatif conservé tel quel', () => {
    const rows = [
      ['Date', 'Montant'],
      [new Date(2025, 0, 5), -300],
    ];
    const map = g.indexTran(rows, 'Trans');
    expect(map.get(jan25)).toEqual([-300]);
  });

  test('header seul → Map vide', () => {
    const map = g.indexTran([['Date', 'Montant']], 'Trans');
    expect(map.size).toBe(0);
  });

  test('date invalide → erreur mentionnant le numéro de ligne et l\'onglet', () => {
    const rows = [['Date', 'Montant'], ['pas-une-date', 100]];
    expect(() => g.indexTran(rows, 'Trans')).toThrow(/Date invalide ligne 2.*Trans/);
  });
});
