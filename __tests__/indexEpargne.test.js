'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

const jan25 = g.toAbsMonth(2025, 0);
const feb25 = g.toAbsMonth(2025, 1);

describe('indexEpargne', () => {
  test('dispatche chaque ligne vers la Map du compte correspondant', () => {
    const rows = [
      ['Date', 'Montant', 'Compte'],
      [new Date(2025, 0, 1), 1000, 'LEP'],
      [new Date(2025, 0, 1),  500, 'LA'],
      [new Date(2025, 1, 1), -200, 'LEP'],
    ];
    const maps = g.indexEpargne(rows);
    expect(maps['LEP'].get(jan25)).toEqual([1000]);
    expect(maps['LA'].get(jan25)).toEqual([500]);
    expect(maps['LEP'].get(feb25)).toEqual([-200]);
    expect(maps['CSL'].size).toBe(0);
  });

  test('plusieurs mouvements du même compte sur le même mois → regroupés', () => {
    const rows = [
      ['Date', 'Montant', 'Compte'],
      [new Date(2025, 0, 5),  300, 'LEP'],
      [new Date(2025, 0, 20), 700, 'LEP'],
    ];
    const maps = g.indexEpargne(rows);
    expect(maps['LEP'].get(jan25)).toEqual([300, 700]);
  });

  test('les trois comptes peuvent coexister sur le même mois', () => {
    const rows = [
      ['Date', 'Montant', 'Compte'],
      [new Date(2025, 0, 1), 100, 'LEP'],
      [new Date(2025, 0, 1), 200, 'LA'],
      [new Date(2025, 0, 1), 300, 'CSL'],
    ];
    const maps = g.indexEpargne(rows);
    expect(maps['LEP'].get(jan25)).toEqual([100]);
    expect(maps['LA'].get(jan25)).toEqual([200]);
    expect(maps['CSL'].get(jan25)).toEqual([300]);
  });

  test('header seul → trois Maps vides', () => {
    const maps = g.indexEpargne([['Date', 'Montant', 'Compte']]);
    expect(maps['LEP'].size).toBe(0);
    expect(maps['LA'].size).toBe(0);
    expect(maps['CSL'].size).toBe(0);
  });

  test('compte inconnu → erreur mentionnant le numéro de ligne et le compte', () => {
    const rows = [['Date', 'Montant', 'Compte'], [new Date(2025, 0, 1), 100, 'PEL']];
    expect(() => g.indexEpargne(rows)).toThrow(/Compte inconnu ligne 2.*PEL/);
  });

  test('date invalide → erreur mentionnant le numéro de ligne', () => {
    const rows = [['Date', 'Montant', 'Compte'], ['pas-une-date', 100, 'LEP']];
    expect(() => g.indexEpargne(rows)).toThrow(/Date invalide ligne 2/);
  });

  test('espaces autour du compte ignorés (trim)', () => {
    const rows = [['Date', 'Montant', 'Compte'], [new Date(2025, 0, 1), 100, ' LEP ']];
    const maps = g.indexEpargne(rows);
    expect(maps['LEP'].get(jan25)).toEqual([100]);
  });
});
