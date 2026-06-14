'use strict';

const { loadAlfred } = require('./helpers/gas-env');

// Note : le mock gas-env partage UN store entre ScriptProperties et UserProperties.
// On teste donc les comportements observables (valeur présente / absente / défauts),
// pas la priorité User > Script (indistinguable avec un store unique).

describe('getProp / setProp', () => {
  test('getProp : clé absente → fallback', () => {
    const g = loadAlfred();
    expect(g.getProp('INCONNUE', 'def')).toBe('def');
  });

  test('setProp puis getProp', () => {
    const g = loadAlfred();
    g.setProp('MA_CLE', 'valeur');
    expect(g.getProp('MA_CLE')).toBe('valeur');
  });

  test('getProp : valeur vide → fallback', () => {
    const g = loadAlfred();
    g.setProp('VIDE', '');
    expect(g.getProp('VIDE', 'def')).toBe('def');
  });
});

describe('getUserProp', () => {
  test('clé absente → fallback', () => {
    const g = loadAlfred();
    expect(g.getUserProp('RIEN', 'd')).toBe('d');
  });

  test('valeur présente → renvoyée', () => {
    const g = loadAlfred();
    g.setProp('PRESENTE', 'x');
    expect(g.getUserProp('PRESENTE', 'd')).toBe('x');
  });
});

describe('getUserPrefs / setUserPref', () => {
  test('défauts quand rien n\'est stocké', () => {
    const g = loadAlfred();
    const p = g.getUserPrefs();
    expect(p.lightTheme).toBe(false);
    expect(p.transLimit).toBe(3);
  });

  test('setUserPref booléen → relu typé', () => {
    const g = loadAlfred();
    g.setUserPref('lightTheme', true);
    expect(g.getUserPrefs().lightTheme).toBe(true);
  });

  test('setUserPref nombre → relu en number', () => {
    const g = loadAlfred();
    g.setUserPref('transLimit', 5);
    expect(g.getUserPrefs().transLimit).toBe(5);
  });

  test('clé inconnue → throw', () => {
    const g = loadAlfred();
    expect(() => g.setUserPref('inexistante', 1)).toThrow();
  });
});

describe('getSavingsProps', () => {
  test('expose les défauts LEP/LA/CSL', () => {
    const g = loadAlfred();
    const byKey = Object.fromEntries(g.getSavingsProps().map(p => [p.key, p.value]));
    expect(byKey.LEP_RATE).toBe('0.025');
    expect(byKey.LA_CEILING).toBe('22950');
    expect(byKey.CSL_NAME).toBe('CSL');
  });

  test('valeur utilisateur prioritaire sur le défaut', () => {
    const g = loadAlfred();
    g._propStore.set('LEP_RATE', '0.03');
    const byKey = Object.fromEntries(g.getSavingsProps().map(p => [p.key, p.value]));
    expect(byKey.LEP_RATE).toBe('0.03');
  });

  test('expose toujours EB_APP_ID et EB_PRIVATE_KEY (même vides)', () => {
    const g = loadAlfred();
    const keys = g.getSavingsProps().map(p => p.key);
    expect(keys).toContain('EB_APP_ID');
    expect(keys).toContain('EB_PRIVATE_KEY');
  });

  test('liste triée par clé', () => {
    const g = loadAlfred();
    const keys = g.getSavingsProps().map(p => p.key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });
});

describe('setAnyProp / deleteProp', () => {
  test('setAnyProp écrit puis deleteProp supprime', () => {
    const g = loadAlfred();
    g.setAnyProp('user', 'TMP', '1');
    expect(g._propStore.get('TMP')).toBe('1');
    g.deleteProp('user', 'TMP');
    expect(g._propStore.has('TMP')).toBe(false);
  });
});
