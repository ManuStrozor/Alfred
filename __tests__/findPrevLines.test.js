'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

const JAN25 = g.toAbsMonth(2025, 0); // 24300

// Helpers
const hdr = ['Début', 'Fin', 'Mois', 'Montant', 'Compte'];
const row = (start, end, months, amount, acc) => [start, end, months, amount, acc];

describe('findPrevLines', () => {
  test('ligne active dans la plage → numéro de ligne retourné', () => {
    const prevData = [hdr, row('01/2025', '06/2025', '', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([2]);
  });

  test('mauvais compte → exclu', () => {
    const prevData = [hdr, row('01/2025', '06/2025', '', 200, 'LA')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([]);
  });

  test('montant nul → exclu', () => {
    const prevData = [hdr, row('01/2025', '06/2025', '', 0, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([]);
  });

  test('mois antérieur à la date de début → exclu', () => {
    // La ligne commence en fév 2025, le mois demandé est jan 2025
    const prevData = [hdr, row('02/2025', '06/2025', '', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([]);
  });

  test('mois postérieur à la date de fin → exclu', () => {
    // La ligne se termine en jan 2025, le mois demandé est fév 2025
    const prevData = [hdr, row('01/2025', '01/2025', '', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25 + 1)).toEqual([]);
  });

  test('filtre par mois actifs : mois non listé → exclu', () => {
    // Actif en mars (3) et juin (6) seulement — jan (1) absent
    const prevData = [hdr, row('01/2025', '12/2025', '3,6', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([]);
  });

  test('filtre par mois actifs : mois listé → inclus', () => {
    // Actif en jan (1) et juin (6)
    const prevData = [hdr, row('01/2025', '12/2025', '1,6', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([2]);
  });

  test('plusieurs lignes actives → toutes retournées dans l\'ordre', () => {
    const prevData = [
      hdr,
      row('01/2025', '06/2025', '', 100, 'LEP'),
      row('01/2025', '12/2025', '', 200, 'LEP'),
    ];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([2, 3]);
  });

  test('pas de date de début → active dès le premier mois', () => {
    const prevData = [hdr, row('', '06/2025', '', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25)).toEqual([2]);
  });

  test('pas de date de fin → toujours active', () => {
    const prevData = [hdr, row('01/2025', '', '', 200, 'LEP')];
    expect(g.findPrevLines(prevData, 'LEP', JAN25 + 42)).toEqual([2]);
  });
});
