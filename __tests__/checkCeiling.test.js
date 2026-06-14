'use strict';

const { loadAlfred, ACCOUNTS } = require('./helpers/gas-env');

const JAN25 = loadAlfred().toAbsMonth(2025, 0); // 24300

// Chaque test reçoit un contexte frais avec le spy toast remis à zéro.
function mkCtx() {
  const g = loadAlfred();
  g._mock.toastCalls = [];
  return g;
}

// Prevs: une seule ligne LEP active tout 2025 (ligne 2)
const LEP_PREVDATA = [
  ['Début', 'Fin', 'Mois', 'Montant', 'Compte'],
  ['01/2025', '12/2025', '', 200, 'LEP'],
];

describe('checkCeiling', () => {

  // ─── Compte sans plafond ─────────────────────────────────────────────────────
  test('CSL (pas de plafond) → silencieux', () => {
    const g = mkCtx();
    g.checkCeiling([[500], [600]], JAN25, ACCOUNTS.CSL, new Map(), [['h']]);
    expect(g._mock.toastCalls).toHaveLength(0);
  });

  // ─── Solde sous le plafond ───────────────────────────────────────────────────
  test('solde ≤ plafond → silencieux', () => {
    const g = mkCtx();
    g.checkCeiling([[9000], [10000]], JAN25, ACCOUNTS.LEP, new Map(), [['h']]);
    expect(g._mock.toastCalls).toHaveLength(0);
  });

  // ─── Dépassement par les seuls intérêts ──────────────────────────────────────
  test('solde > plafond sans entrée Prevs → silencieux (intérêts seuls)', () => {
    const g = mkCtx();
    // prevMap sans clé 'LEP_JAN25' → dépassement imputable aux seuls intérêts
    g.checkCeiling([[10050]], JAN25, ACCOUNTS.LEP, new Map(), [['h']]);
    expect(g._mock.toastCalls).toHaveLength(0);
  });

  // ─── Dépassement imputable à Prevs ───────────────────────────────────────────
  test('solde > plafond avec versement Prevs → toast avec excédent correct', () => {
    const g = mkCtx();
    // balance=10100, totalPrevs=200, excess=100, corrected=10100+200−10000=300
    const prevMap = new Map([['LEP_' + JAN25, [200]]]);
    g.checkCeiling([[10100]], JAN25, ACCOUNTS.LEP, prevMap, LEP_PREVDATA);
    expect(g._mock.toastCalls).toHaveLength(1);
    const msg = g._mock.toastCalls[0].msg;
    expect(msg).toContain('+100');     // excédent
    expect(msg).toContain('01/2025'); // mois concerné
    expect(msg).toContain('300');     // montant corrigé suggéré
    expect(msg).toContain('ligne 2'); // numéro de ligne Prevs
  });

  // ─── Seul le premier dépassement est signalé ─────────────────────────────────
  test('plusieurs mois dépassent le plafond → un seul toast (premier mois)', () => {
    const g = mkCtx();
    const prevMap = new Map([
      ['LEP_' + JAN25,       [200]],
      ['LEP_' + (JAN25 + 1), [200]],
    ]);
    g.checkCeiling([[10100], [10200]], JAN25, ACCOUNTS.LEP, prevMap, LEP_PREVDATA);
    expect(g._mock.toastCalls).toHaveLength(1);
    expect(g._mock.toastCalls[0].msg).toContain('01/2025'); // premier mois seulement
  });

  // ─── findPrevLines vide → pas de toast même si balance dépasse ───────────────
  test('balance > plafond + Prevs, mais findPrevLines vide → silencieux', () => {
    const g = mkCtx();
    // prevMap a une entrée LEP, mais prevData ne contient aucune ligne LEP correspondante
    const prevMap = new Map([['LEP_' + JAN25, [200]]]);
    const badPrevData = [
      ['Début', 'Fin', 'Mois', 'Montant', 'Compte'],
      ['01/2025', '12/2025', '', 200, 'LA'], // mauvais compte
    ];
    g.checkCeiling([[10100]], JAN25, ACCOUNTS.LEP, prevMap, badPrevData);
    expect(g._mock.toastCalls).toHaveLength(0);
  });

});
