'use strict';

const { loadAlfred } = require('./helpers/gas-env');

/**
 * Couvre le déport des soldes hors de getAllData (levier 1) et le nouveau flux d'import
 * Revolut à validation (levier 2) : scan sans écriture, mise en cache, et confirmation
 * sécurisée (deFormula + borne de règle, données de la feuille = serveur, pas le client).
 */
describe('Levier 1 — soldes hors du chemin critique', () => {
  test('getAllData ne fait AUCUN appel réseau et renvoie les comptes sans solde', () => {
    const g = loadAlfred();
    let fetchAllCalls = 0;
    g._setFetchAll(() => { fetchAllCalls++; return []; });
    g._propStore.set('EB_ALL_ACCOUNTS', JSON.stringify([{ uid: 'a1', name: 'X', currency: 'EUR' }]));
    g._propStore.set('EB_SHOWN_ACCOUNTS', JSON.stringify(['a1']));
    // Isole getAllData des lectures de feuilles (testées ailleurs).
    g._forecastInputs      = () => null;
    g._getMonthTransactions = () => [];
    g.getSavingsProps      = () => ({});
    g.getRevolutTasks      = () => [];
    g.getPrevLines         = () => ({ lines: [], types: [] });

    const data = g.getAllData();

    expect(fetchAllCalls).toBe(0);
    expect(data.shownAccounts).toEqual([{ uid: 'a1', name: 'X', currency: 'EUR', balance: null }]);
  });

  test('getAccountBalances récupère les soldes des seuls comptes affichés', () => {
    const g = loadAlfred();
    g._enableBankingHeaders = () => ({});
    g._propStore.set('EB_ALL_ACCOUNTS', JSON.stringify([
      { uid: 'a1', name: 'Courant', currency: 'EUR' },
      { uid: 'a2', name: 'Autre', currency: 'EUR' },
    ]));
    g._propStore.set('EB_SHOWN_ACCOUNTS', JSON.stringify(['a1']));
    g._setFetchAll(reqs => reqs.map(() => ({
      getResponseCode: () => 200,
      getContentText:  () => JSON.stringify({ balances: [{ balance_type: 'interimAvailable', balance_amount: { amount: '123.45' } }] }),
    })));

    const res = g.getAccountBalances();

    expect(res).toHaveLength(1);
    expect(res[0].uid).toBe('a1');
    expect(res[0].balance).toBeCloseTo(123.45);
  });

  test('getAccountBalances est best-effort : [] si les propriétés sont illisibles', () => {
    const g = loadAlfred();
    g._propStore.set('EB_ALL_ACCOUNTS', 'not-json');
    expect(g.getAccountBalances()).toEqual([]);
  });
});

describe('Levier 2 — scan / preview / confirm import Revolut', () => {
  const stubOneTransaction = g => {
    g._enableBankingHeaders = () => ({});
    g.Utilities = { formatDate: () => '2025-07-01' };
    g._propStore.set('EB_ACCOUNT_ID', 'acc1');
    g._setFetch(() => ({
      getResponseCode: () => 200,
      getContentText:  () => JSON.stringify({ transactions: [{
        transaction_amount:     { amount: '12.50' },
        credit_debit_indicator: 'DBIT',
        booking_date:           '2025-07-01',
        creditor:               { name: 'IKEA' },
        debtor:                 { name: '' },
        remittance_information: ['Meuble'],
        entry_reference:        'r1',
      }] }),
    }));
  };

  test('_scanRevolutCandidates retourne les candidates SANS rien écrire', () => {
    const g = loadAlfred();
    stubOneTransaction(g);

    const candidates = g._scanRevolutCandidates();

    expect(g._writes).toHaveLength(0); // aucune écriture pendant le scan
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      key: '0', isoDate: '2025-07-01', amount: -12.5, label: 'Meuble', rule: 'Envies', category: 'Unknown',
    });
  });

  test('previewRevolutImport met les candidates en cache utilisateur', () => {
    const g = loadAlfred();
    stubOneTransaction(g);

    const res = g.previewRevolutImport();

    expect(res.candidates).toHaveLength(1);
    expect(JSON.parse(g._cacheStore.get('EB_IMPORT_CANDIDATES'))).toHaveLength(1);
  });

  test('previewRevolutImport est best-effort : { candidates: [] } sans connexion', () => {
    const g = loadAlfred();
    // Pas d'EB_ACCOUNT_ID → _scanRevolutCandidates throw → preview absorbe.
    expect(g.previewRevolutImport()).toEqual({ candidates: [] });
  });

  test('confirmRevolutImport écrit la sélection, borne la règle et neutralise les formules', () => {
    const g = loadAlfred();
    g.getForecast = () => {};
    g.getAllData  = () => ({}); // isole la logique d'écriture du payload de retour
    g._cacheStore.set('EB_IMPORT_CANDIDATES', JSON.stringify([
      { key: '0', isoDate: '2025-07-01', amount: -10, label: '=hack', rule: 'Envies', category: 'Unknown' },
      { key: '1', isoDate: '2025-07-02', amount: -20, label: 'Courses', rule: 'Envies', category: 'Alimentation' },
    ]));

    const res = g.confirmRevolutImport([
      { key: '0', rule: 'BadRule', category: '=formula' }, // règle hors liste → '' ; catégorie formule → deFormula
      { key: '1', rule: 'Besoins', category: 'Alimentation' },
      { key: '9', rule: 'Envies', category: 'X' },          // clé inconnue → ignorée
    ]);

    expect(res.imported).toBe(2);
    const rows = g._writes.at(-1);
    expect(rows).toHaveLength(2);
    // La colonne date est un Date construit dans le contexte vm (instanceof non fiable) → on teste getTime.
    expect(typeof rows[0][0].getTime).toBe('function');
    expect(rows[0].slice(1)).toEqual([-10, "'=hack", '', "'=formula"]); // règle hors liste → '' ; formules neutralisées
    expect(rows[1].slice(1)).toEqual([-20, 'Courses', 'Besoins', 'Alimentation']);
  });

  test('confirmRevolutImport sans sélection n\'écrit rien', () => {
    const g = loadAlfred();
    g.getAllData = () => ({});
    const res = g.confirmRevolutImport([]);
    expect(res.imported).toBe(0);
    expect(g._writes).toHaveLength(0);
  });
});
