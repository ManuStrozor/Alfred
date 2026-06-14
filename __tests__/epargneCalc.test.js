'use strict';

const { loadAlfred, ACCOUNTS } = require('./helpers/gas-env');
const g = loadAlfred();

// On choisit février 2025 (24301, %12=1) comme point de départ pour éviter
// que la première capitalisation (currAbs%12===0, soit janvier) tombe immédiatement.
// La prochaine capitalisation sera janvier 2026 (24312, 11 mois plus tard).
const startAbs = g.toAbsMonth(2025, 1); // fév 2025 = 24301

// ─── CSL (taux 0 — accumulation pure, aucun intérêt) ───────────────────────

describe('epargneCalc — CSL (sans intérêts)', () => {
  test('accumulation simple sur plusieurs mois', () => {
    const epMap = new Map([
      [startAbs,     [1000]],
      [startAbs + 1, [500]],
    ]);
    const result = g.epargneCalc(new Map(), epMap, startAbs, startAbs, 3, ACCOUNTS.CSL);
    expect(result[0]).toEqual([1000]);  // fév : dépôt initial
    expect(result[1]).toEqual([1500]);  // mar : +500
    expect(result[2]).toEqual([1500]);  // avr : aucun mouvement
  });

  test('prévision de virement budget→épargne déduite du solde', () => {
    // Un montant prévu en mar 2025 (CSL_startAbs+1) est soustrait du cumul
    const prevMap = new Map([['CSL_' + (startAbs + 1), [200]]]);
    const epMap   = new Map([[startAbs, [1000]]]);
    const result  = g.epargneCalc(prevMap, epMap, startAbs, startAbs, 2, ACCOUNTS.CSL);
    expect(result[0]).toEqual([1000]);  // fév
    expect(result[1]).toEqual([800]);   // mar : 1000 − 200
  });

  test('longueur du résultat = period', () => {
    const epMap  = new Map([[startAbs, [0]]]);
    const result = g.epargneCalc(new Map(), epMap, startAbs, startAbs, 5, ACCOUNTS.CSL);
    expect(result).toHaveLength(5);
  });

  test('solde de départ antérieur à la fenêtre : pré-calculé silencieusement', () => {
    // soldeAbs est 2 mois avant startAbs : le cumul tient compte des mouvements
    // antérieurs mais ne les stocke pas (i < 0 → ignorés).
    const soldeAbs = startAbs - 2;
    const epMap    = new Map([[soldeAbs, [5000]]]);
    const result   = g.epargneCalc(new Map(), epMap, startAbs, soldeAbs, 3, ACCOUNTS.CSL);
    expect(result[0]).toEqual([5000]);  // fév : cumul déjà à 5000
    expect(result[1]).toEqual([5000]);
    expect(result[2]).toEqual([5000]);
  });
});

// ─── LEP (taux 2,7 % — intérêts mensuels, capitalisation en janvier) ─────────

describe('epargneCalc — LEP (avec intérêts)', () => {
  const CAPITAL = 12000;
  const MONTHLY = CAPITAL * ACCOUNTS.LEP.rate / 12; // 27 €/mois

  test('le solde n\'augmente pas avant la capitalisation', () => {
    const epMap  = new Map([[startAbs, [CAPITAL]]]);
    const result = g.epargneCalc(new Map(), epMap, startAbs, startAbs, 2, ACCOUNTS.LEP);
    // Les intérêts s'accumulent en interne mais ne s'ajoutent pas encore
    expect(result[0]).toEqual([CAPITAL]);
    expect(result[1]).toEqual([CAPITAL]);
  });

  test('capitalisation en janvier : 12 mois d\'intérêts ajoutés au cumul', () => {
    // fév 2025 (i=0) → jan 2026 (i=11) = 12 pas.
    // Le mois de capi (jan 2026) accumule lui aussi sa mensualité AVANT de capitaliser,
    // donc benefit = MONTHLY × 12 au moment où il est ajouté au cumul.
    const epMap  = new Map([[startAbs, [CAPITAL]]]);
    const result = g.epargneCalc(new Map(), epMap, startAbs, startAbs, 12, ACCOUNTS.LEP);
    const expected = CAPITAL + MONTHLY * 12; // 12 324 €
    expect(result[11][0]).toBeCloseTo(expected, 6);
  });

  test('après capitalisation, le cumul reste stable le mois suivant', () => {
    // 13 mois : jan 2026 capitalise (i=11), fév 2026 (i=12) redémarre l'accumulation
    // mais ne capitalise pas encore → cumul inchangé par rapport à jan 2026.
    const epMap     = new Map([[startAbs, [CAPITAL]]]);
    const result    = g.epargneCalc(new Map(), epMap, startAbs, startAbs, 13, ACCOUNTS.LEP);
    const afterCapi = CAPITAL + MONTHLY * 12; // même valeur qu'en jan 2026
    expect(result[12][0]).toBeCloseTo(afterCapi, 6);
  });
});
