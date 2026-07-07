'use strict';

const { loadAlfred } = require('./helpers/gas-env');

/**
 * Vérifie que les endpoints d'écriture de transactions neutralisent l'injection
 * de formule Google Sheets (`deFormula`) sur les TROIS colonnes texte : libellé,
 * règle ET catégorie (colonnes C/D/E). getForecast/_editResponse sont stubés pour
 * isoler la logique d'écriture ; les valeurs écrites sont capturées via ctx._writes.
 */
describe('addTransaction / editTransactionByRow — neutralisation formule (label, rule, category)', () => {
  test('addTransaction préfixe une apostrophe sur label, rule ET category', () => {
    const g = loadAlfred();
    g.getForecast = () => {};
    g._editResponse = () => ({});

    g.addTransaction(100, '2025-01-15', '=label', '=rule', '@cat');

    const row = g._writes.at(-1)[0]; // dernière écriture, 1re ligne
    expect(row[2]).toBe("'=label"); // C — libellé
    expect(row[3]).toBe("'=rule");  // D — règle
    expect(row[4]).toBe("'@cat");   // E — catégorie
  });

  test('addTransaction laisse un libellé normal intact', () => {
    const g = loadAlfred();
    g.getForecast = () => {};
    g._editResponse = () => ({});

    g.addTransaction(-42.5, '2025-03-01', 'Courses', 'Besoins', 'Alimentation');

    const row = g._writes.at(-1)[0];
    expect(row[2]).toBe('Courses');
    expect(row[3]).toBe('Besoins');
    expect(row[4]).toBe('Alimentation');
  });

  test('editTransactionByRow neutralise aussi label, rule ET category', () => {
    const g = loadAlfred();
    g._setLastRow(10); // pour passer la borne rowIndex <= getLastRow()
    g.getForecast = () => {};
    g._editResponse = () => ({});

    g.editTransactionByRow(3, 12, '2025-02-02', '+label', '=rule', '-cat');

    const row = g._writes.at(-1)[0];
    expect(row[2]).toBe("'+label");
    expect(row[3]).toBe("'=rule");
    expect(row[4]).toBe("'-cat");
  });
});
