'use strict';

const { loadClient } = require('../helpers/client-env');
const c = loadClient({ prefs: { lightTheme: true, transLimit: 3 } });

// ─── escHtml ───────────────────────────────────────────────────────────────
describe('escHtml', () => {
  test('échappe &, <, >, "', () =>
    expect(c.escHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;'));

  test('coerce les non-strings', () =>
    expect(c.escHtml(42)).toBe('42'));

  test('chaîne neutre inchangée', () =>
    expect(c.escHtml('abc 123')).toBe('abc 123'));
});

// ─── cleanTitle ──────────────────────────────────────────────────────────────
describe('cleanTitle', () => {
  test('retire le suffixe [#XXXXXX]', () =>
    expect(c.cleanTitle('Revolut - Pocket "Voyage" [#A1B2C3]')).toBe('Revolut - Pocket "Voyage"'));

  test('inchangé sans suffixe', () =>
    expect(c.cleanTitle('Sans hash')).toBe('Sans hash'));

  test('ne retire pas un hash mal formé', () =>
    expect(c.cleanTitle('Texte [#abc]')).toBe('Texte [#abc]'));
});

// ─── fmtMonth ────────────────────────────────────────────────────────────────
describe('fmtMonth', () => {
  test('06/2026 → Juin', () => expect(c.fmtMonth('06/2026')).toBe('Juin'));
  test('01/2025 → Jan',  () => expect(c.fmtMonth('01/2025')).toBe('Jan'));
  test('12/2025 → Déc',  () => expect(c.fmtMonth('12/2025')).toBe('Déc'));
});

// ─── utilitaires de mois absolu ──────────────────────────────────────────────
describe('dates absolues (_absM / _parsePrevDate / _absToMmYyyy / _absToLabel)', () => {
  test('_absM(2026, 5) = 2026*12+5', () =>
    expect(c._absM(2026, 5)).toBe(2026 * 12 + 5));

  test('_parsePrevDate valide', () =>
    expect(c._parsePrevDate('06/2026')).toBe(c._absM(2026, 5)));

  test('_parsePrevDate format invalide → null', () => {
    expect(c._parsePrevDate('xx')).toBeNull();
    expect(c._parsePrevDate('2026')).toBeNull();
    expect(c._parsePrevDate('')).toBeNull();
  });

  test('_absToMmYyyy round-trip', () =>
    expect(c._absToMmYyyy(c._absM(2026, 5))).toBe('06/2026'));

  test('_absToLabel', () =>
    expect(c._absToLabel(c._absM(2026, 5))).toBe('Juin 2026'));
});

// ─── fmt ─────────────────────────────────────────────────────────────────────
describe('fmt', () => {
  test('null → —', () => expect(c.fmt(null)).toBe('—'));

  test('montant : contient € et les chiffres (séparateurs locaux ignorés)', () => {
    const s = c.fmt(1234.5).replace(/\s/g, '');
    expect(s).toBe('1234,50€');
  });

  test('compact : pas de symbole €', () =>
    expect(c.fmt(1000, true)).not.toMatch(/€/));

  test('hideAmounts masque les valeurs', () => {
    c.__STATE.hideAmounts = true;
    expect(c.fmt(1234.5)).toBe('••••• €');
    expect(c.fmt(1000, true)).toBe('•••');
    c.__STATE.hideAmounts = false; // restaure pour les autres tests
  });
});

// ─── État / constantes ───────────────────────────────────────────────────────
describe('STATE & constantes', () => {
  test('STATE hérite de window.ALFRED_PREFS', () =>
    expect(c.__STATE.lightTheme).toBe(true));

  test('STATE.hideAmounts vaut false par défaut', () =>
    expect(c.__STATE.hideAmounts).toBe(false));

  test('MOIS contient 12 entrées', () =>
    expect(c.__MOIS).toHaveLength(12));

  test('RULE_COLORS couvre Besoins/Envies/Epargne', () => {
    expect(c.__RULE_COLORS).toHaveProperty('Besoins');
    expect(c.__RULE_COLORS).toHaveProperty('Envies');
    expect(c.__RULE_COLORS).toHaveProperty('Epargne');
  });
});

// ─── logoSpinner ─────────────────────────────────────────────────────────────
describe('logoSpinner', () => {
  test('génère un SVG à la taille demandée avec 2 paths animés', () => {
    const svg = c.logoSpinner(40);
    expect(svg).toMatch(/<svg class="logo-spin"/);
    expect(svg).toMatch(/width="40" height="40"/);
    expect((svg.match(/class="run"/g) || []).length).toBe(2);
  });
});
