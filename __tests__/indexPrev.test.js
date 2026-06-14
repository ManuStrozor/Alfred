'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

// Fenêtre de test : janvier 2025, 12 mois
// Format des dates Prevs : 'MM/YYYY' (texte)
const startAbs = g.toAbsMonth(2025, 0); // 24300
const PERIOD   = 12;

describe('indexPrev', () => {
  test('prévision sans compte : indexée par mois absolu uniquement', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '02/2025',  '',     500,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.get(startAbs)).toEqual([500]);          // jan
    expect(map.get(startAbs + 1)).toEqual([500]);      // fév
    expect(map.has(startAbs + 2)).toBe(false);         // mar : hors plage
  });

  test('prévision avec compte LEP : indexée aussi par clé composée "LEP_<abs>"', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '01/2025',  '',     300,        'LEP'],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.get(startAbs)).toEqual([300]);
    expect(map.get('LEP_' + startAbs)).toEqual([300]);
    expect(map.has('LA_'  + startAbs)).toBe(false);
    expect(map.has('ELIE_'+ startAbs)).toBe(false);
  });

  test('prévision avec compte LA : clé composée "LA_<abs>"', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '01/2025',  '',     200,        'LA'],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.get('LA_' + startAbs)).toEqual([200]);
  });

  test('filtre par mois actifs : seuls les mois listés sont inclus', () => {
    // Actif uniquement en janvier (1) et juin (6)
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '06/2025',  '1,6',  100,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.has(startAbs)).toBe(true);        // jan (1) ✓
    expect(map.has(startAbs + 1)).toBe(false);   // fév (2) ✗
    expect(map.has(startAbs + 5)).toBe(true);    // jun (6) ✓
    expect(map.has(startAbs + 6)).toBe(false);   // jul (7) ✗
  });

  test('pas de date de début → démarre au startAbs de la fenêtre', () => {
    const rows = [
      ['Début', 'Fin',      'Mois', 'Montant', 'Compte'],
      ['',      '01/2025',  '',     200,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.has(startAbs)).toBe(true);
  });

  test('pas de date de fin → court jusqu\'à la fin de la fenêtre', () => {
    const rows = [
      ['Début',   'Fin', 'Mois', 'Montant', 'Compte'],
      ['01/2025', '',    '',     200,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.has(startAbs + PERIOD)).toBe(true);
    expect(map.has(startAbs + PERIOD + 1)).toBe(false);
  });

  describe('prévision qui chevauche la fenêtre est clippée aux bornes', () => {

    test('Début avant la fenêtre, fin dans la fenêtre', () => {
      const rows = [
        ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
        ['06/2024', '06/2025',  '',     100,        ''],
      ];
      const map = g.indexPrev(rows, startAbs, PERIOD);
      expect(map.has(startAbs)).toBe(true);       // jan 2025 : dans la fenêtre ✓
      expect(map.has(startAbs + 5)).toBe(true);   // jun 2025 : dernière occurrence ✓
      expect(map.has(startAbs + 6)).toBe(false);  // jul 2025 : après la fin de la prévision ✗
    });

    test('Début dans la fenêtre, fin après la fenêtre', () => {
      const rows = [
        ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
        ['06/2025', '06/2026',  '',     100,        ''],
      ];
      const map = g.indexPrev(rows, startAbs, PERIOD);
      expect(map.has(startAbs)).toBe(false);      // jan 2025 : avant la début de la prévision ✗
      expect(map.has(startAbs + 5)).toBe(true);   // jun 2025 : première occurence ✓
      expect(map.has(startAbs + 17)).toBe(false); // jun 2026 : dernière occurrence ✗
    });
  });

  test('prévision entièrement antérieure à la fenêtre → ignorée', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2020', '12/2020',  '',     100,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.size).toBe(0);
  });

  test('montant nul → ligne ignorée', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '03/2025',  '',     0,          ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.size).toBe(0);
  });

  test('plusieurs prévisions sur le même mois → montants cumulés', () => {
    const rows = [
      ['Début',   'Fin',      'Mois', 'Montant', 'Compte'],
      ['01/2025', '01/2025',  '',     100,        ''],
      ['01/2025', '01/2025',  '',     -40,        ''],
    ];
    const map = g.indexPrev(rows, startAbs, PERIOD);
    expect(map.get(startAbs)).toEqual([100, -40]);
  });
});
