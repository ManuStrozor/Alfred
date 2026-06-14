'use strict';

const { loadAlfred } = require('./helpers/gas-env');
const g = loadAlfred();

// ─── toAbsMonth ───────────────────────────────────────────────────────────────

describe('toAbsMonth', () => {
  test('janvier 2025 = 24300', () =>
    expect(g.toAbsMonth(2025, 0)).toBe(24300));

  test('décembre 2025 = 24311', () =>
    expect(g.toAbsMonth(2025, 11)).toBe(24311));

  test('janvier 2026 est consécutif à décembre 2025', () =>
    expect(g.toAbsMonth(2026, 0)).toBe(g.toAbsMonth(2025, 11) + 1));

  test('aller-retour : année = Math.floor(abs / 12)', () =>
    expect(Math.floor(g.toAbsMonth(2024, 6) / 12)).toBe(2024));

  test('aller-retour : mois = abs % 12', () =>
    expect(g.toAbsMonth(2024, 6) % 12).toBe(6));
});

// ─── clampStart ───────────────────────────────────────────────────────────────

describe('clampStart', () => {
  test('null → startAbs (pas de borne de début)', () =>
    expect(g.clampStart(null, 100, 200)).toBe(100));

  test('avant la fenêtre → ramené à startAbs', () =>
    expect(g.clampStart(50, 100, 200)).toBe(100));

  test('dans la fenêtre → valeur inchangée', () =>
    expect(g.clampStart(150, 100, 200)).toBe(150));

  test('égal à startAbs → startAbs', () =>
    expect(g.clampStart(100, 100, 200)).toBe(100));

  test('égal à endAbs → endAbs', () =>
    expect(g.clampStart(200, 100, 200)).toBe(200));

  test('après la fenêtre → null (aucun chevauchement)', () =>
    expect(g.clampStart(250, 100, 200)).toBeNull());
});

// ─── clampEnd ─────────────────────────────────────────────────────────────────

describe('clampEnd', () => {
  test('null → endAbs (pas de borne de fin)', () =>
    expect(g.clampEnd(null, 100, 200)).toBe(200));

  test('après la fenêtre → ramené à endAbs', () =>
    expect(g.clampEnd(250, 100, 200)).toBe(200));

  test('dans la fenêtre → valeur inchangée', () =>
    expect(g.clampEnd(150, 100, 200)).toBe(150));

  test('égal à startAbs → startAbs', () =>
    expect(g.clampEnd(100, 100, 200)).toBe(100));

  test('avant la fenêtre → null (aucun chevauchement)', () =>
    expect(g.clampEnd(50, 100, 200)).toBeNull());
});

// ─── getPeriod ────────────────────────────────────────────────────────────────

describe('getPeriod', () => {
  test('entier seul', () =>
    expect(g.getPeriod('24')).toBe(24));

  test('format "N ans"', () =>
    expect(g.getPeriod('2 ans')).toBe(24));

  test('format "1 an"', () =>
    expect(g.getPeriod('1 an')).toBe(12));

  test('plafond à 200', () =>
    expect(g.getPeriod('300')).toBe(200));

  test('plancher à 1', () =>
    expect(g.getPeriod('0')).toBe(1));

  test('texte non numérique → erreur', () =>
    expect(() => g.getPeriod('abc')).toThrow());
});

// ─── getMonthsText ────────────────────────────────────────────────────────────

describe('getMonthsText', () => {
  const start = new Date(2025, 0, 1); // 1er janvier 2025

  test('longueur = period', () =>
    expect(g.getMonthsText(start, 3)).toHaveLength(3));

  test('chaque entrée est un tableau à un élément', () =>
    expect(g.getMonthsText(start, 2)[0]).toHaveLength(1));

  test('premier mois = mois suivant la date de départ', () =>
    expect(g.getMonthsText(start, 3)[0][0]).toEqual(new Date(2025, 1, 1)));

  test('mois consécutifs', () => {
    const months = g.getMonthsText(start, 3);
    expect(months[1][0]).toEqual(new Date(2025, 2, 1));
    expect(months[2][0]).toEqual(new Date(2025, 3, 1));
  });
});

// ─── absMonthToText ───────────────────────────────────────────────────────────

describe('absMonthToText', () => {
  test('24300 = 01/2025', () => expect(g.absMonthToText(24300)).toEqual('01/2025'));
  test('24311 = 12/2025', () => expect(g.absMonthToText(24311)).toEqual('12/2025'));
});

// ─── parseMmYyyy ──────────────────────────────────────────────────────────────

describe('parseMmYyyy', () => {
  test('01/2025 → toAbsMonth(2025, 0)', () =>
    expect(g.parseMmYyyy('01/2025')).toBe(g.toAbsMonth(2025, 0)));

  test('12/2025 → toAbsMonth(2025, 11)', () =>
    expect(g.parseMmYyyy('12/2025')).toBe(g.toAbsMonth(2025, 11)));

  test('résultat cohérent : 01/2026 = 01/2025 + 12', () =>
    expect(g.parseMmYyyy('01/2026')).toBe(g.parseMmYyyy('01/2025') + 12));
});

// ─── mapPush ──────────────────────────────────────────────────────────────────

describe('mapPush', () => {
  test('nouvelle clé → crée un tableau avec la valeur', () => {
    const m = new Map();
    g.mapPush(m, 'k', 42);
    expect(m.get('k')).toEqual([42]);
  });

  test('clé existante → ajoute la valeur au tableau existant sans écraser', () => {
    const m = new Map([['k', [1]]]);
    g.mapPush(m, 'k', 2);
    expect(m.get('k')).toEqual([1, 2]);
  });
});

// ─── shortHash ────────────────────────────────────────────────────────────────

describe('shortHash', () => {
  test('renvoie exactement 6 caractères', () =>
    expect(g.shortHash('test')).toHaveLength(6));

  test('résultat en majuscules base-36 uniquement', () =>
    expect(g.shortHash('test')).toMatch(/^[0-9A-Z]{6}$/));

  test('déterministe : même entrée → même sortie', () =>
    expect(g.shortHash('new|Vacances|500|01/2025|12/2025'))
      .toBe(g.shortHash('new|Vacances|500|01/2025|12/2025')));

  test('préfixe différent → hash différent (new vs exp)', () =>
    expect(g.shortHash('new|Vacances|500|01/2025|12/2025'))
      .not.toBe(g.shortHash('exp|Vacances|500|01/2025|12/2025')));
});
