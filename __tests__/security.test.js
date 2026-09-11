'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { generateKeyPairSync, createPublicKey, verify } = require('crypto');
const { loadAlfred } = require('./helpers/gas-env');

describe('Isolation et surface RPC', () => {
  test('aucun helper sensible ne reste appelable via google.script.run', () => {
    const g = loadAlfred();
    for (const name of ['getProp', 'setProp', 'getUserProp', '_enableBankingHeaders',
      '_ebFetchJson', '_exchangeEnableBankingCode', '_applyClose', '_commitRevolutRows', '_maybeAlertMammoth']) {
      expect(g[name]).toBeUndefined();
      expect(typeof g[name + '_']).toBe('function');
    }
    expect(Object.keys(g).filter(k => /^_[a-z]/.test(k) && !k.endsWith('_') &&
      typeof g[k] === 'function' && !['_setLastRow', '_setFetch', '_setFetchAll'].includes(k))).toEqual([]);
  });

  test('les propriétés globales et le cache ne fuient pas entre utilisateurs', () => {
    const scriptStore = new Map([['GEMINI_API_KEY', 'secret'], ['ALFRED_OWNER', 'owner@example.test'], ['alfred_soldeReport', '999']]);
    const scriptCache = new Map();
    const owner = loadAlfred({ scriptStore, scriptCache, email: 'owner@example.test' });
    const other = loadAlfred({ scriptStore, scriptCache });
    expect(owner.getUserProp_('alfred_soldeReport', 0)).toBe('999');
    expect(other.getUserProp_('alfred_soldeReport', 0)).toBe(0);
    expect(other.getAllProps().some(p => p.source === 'script')).toBe(false);
    expect(() => other.setAnyProp('script', 'ALFRED_OWNER', 'user@example.test')).toThrow();
    owner.getCached_('gemini_insight', () => ({ message: 'Budget privé' }));
    expect(other.getCached_('gemini_insight', () => ({ message: 'Autre budget' })).message).toBe('Autre budget');
    expect(scriptCache.size).toBe(0);
  });

  test('une identité vide ne peut pas devenir propriétaire', () => {
    const g = loadAlfred({ email: '', scriptStore: new Map([['ALFRED_OWNER', '']]) });
    expect(g.isOwner()).toBe(false);
    expect(() => g.setAnyProp('script', 'X', 'Y')).toThrow();
  });

  test('le callback OAuth échappe le HTML des erreurs externes', () => {
    const g = loadAlfred();
    g._exchangeEnableBankingCode_ = () => { throw new Error('<img src=x onerror=alert(1)>'); };
    g.HtmlService = { createHtmlOutput: html => html };
    const html = g.doGet({ parameter: { code: 'code' } });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
});

describe('Validation avant écriture', () => {
  test.each(['2025-02-29', '2025-13-01', '2025-04-31', '', null])('date impossible refusée : %s', date => {
    const g = loadAlfred();
    g._setLastRow(3);
    expect(() => g.addTransaction(10, date, 'test')).toThrow();
    expect(() => g.editTransactionByRow(2, 10, date, 'test')).toThrow();
    expect(g._writes).toEqual([]);
  });

  test.each(['12euros', '', null, true, Infinity, NaN])('montant invalide refusé : %s', amount => {
    const g = loadAlfred();
    expect(() => g.addTransaction(amount, '2025-01-01', 'test')).toThrow();
    expect(() => g.addPrevLine({ amount })).toThrow();
    expect(g._writes).toEqual([]);
  });

  test('prévisions : texte neutralisé et période vérifiée', () => {
    const g = loadAlfred();
    g._editResponse_ = () => ({});
    g.addPrevLine({ amount: -10, start: '01/2025', end: '12/2025', months: '1,12', type: '=type', label: '=IMPORTXML("x")', rule: '+rule' });
    expect(g._writes[0][0].slice(3)).toEqual([-10, "'=type", '', "'=IMPORTXML(\"x\")", "'+rule"]);
    expect(() => g.addPrevLine({ amount: 1, start: '=IMPORTXML("x")' })).toThrow();
    expect(() => g.addPrevLine({ amount: 1, months: '13' })).toThrow();
  });

  test('préférences : décimales conservées et clés héritées refusées', () => {
    const g = loadAlfred();
    g.setUserPref('soldeReport', 12.34);
    expect(g.getUserPrefs().soldeReport).toBe(12.34);
    expect(() => g.setUserPref('toString', 'x')).toThrow();
    expect(() => g.setUserPref('transLimit', 'x')).toThrow();
    expect(() => g._closingBalances_({ lep: Infinity, la: 0, csl: 0 })).toThrow();
  });

  test('le verrou entoure la lecture/écriture et est libéré même sur erreur', () => {
    const g = loadAlfred();
    const events = [];
    g.LockService.getUserLock = () => ({ waitLock: () => events.push('lock'), releaseLock: () => events.push('release') });
    g.SpreadsheetApp.flush = () => events.push('flush');
    g._mockSheet.getLastRow = () => { events.push('read'); return 1; };
    g._mockRange.setValues = () => { events.push('write'); throw new Error('Sheets indisponible'); };
    expect(() => g.addTransaction(10, '2025-01-01', 'test')).toThrow('Sheets indisponible');
    expect(events).toEqual(['lock', 'read', 'write', 'flush', 'release']);
  });

  test('une seconde clôture portant sur le même mois est refusée', () => {
    const g = loadAlfred();
    g._mockRange.getValue = () => vm.runInContext('new Date(2025, 6, 1)', g);
    expect(() => g.paydayWeb(2000, { lep: 0, la: 0, csl: 0 }, '06/2025')).toThrow(/mois a changé/);
    expect(g._writes).toEqual([]);
  });

  test('archivage : formules neutralisées et suppressions par blocs contigus', () => {
    const g = loadAlfred();
    const deleted = [];
    g._mockSheet.deleteRows = (start, count) => deleted.push([start, count]);
    const rows = [2, 3, 5].map(sheetRow => ({ sheetRow, row: ['2025-01-01', 10, '=IMPORTXML("x")', 'Besoins', 'Courses'] }));
    g._applyClose_('01/2025', new Date(2025, 1, 1), 30, rows, 30, 0, 0, 0);
    expect(deleted).toEqual([[5, 1], [2, 2]]);
    expect(g._writes[1][0][2]).toBe("'=IMPORTXML(\"x\")");
  });

  test('épargne : le calcul démarre au premier mois chronologique', () => {
    const g = loadAlfred();
    const january = g.toAbsMonth(2025, 0), march = january + 2;
    g._mockRange.getValue = () => vm.runInContext('new Date(2025, 2, 1)', g);
    g._mockRange.getValues = () => [[0, 0, 0], [0, 0, 0]];
    g.getPeriod = () => 12;
    g.readSheetData = () => [];
    g.indexTran = () => new Map();
    g.indexEpargne = () => ({ LEP: new Map([[march, [20]], [january, [100]]]), LA: new Map(), CSL: new Map() });
    expect(g._forecastInputs_().epargne.LEP.initialAbs).toBe(january);
  });
});

describe('Import : intégrité de la sélection', () => {
  const candidate = { key: '0', isoDate: '2025-07-01', amount: -10, label: 'Courses' };
  const setup = () => {
    const g = loadAlfred();
    g.getAllData = () => ({});
    g._scanRevolutCandidates_ = () => [candidate];
    return g;
  };

  test('aperçu expiré : aucune nouvelle sélection implicite', () => {
    const g = setup();
    expect(() => g.confirmRevolutImport([{ key: '0' }])).toThrow(/expiré/);
    expect(g._writes).toEqual([]);
  });

  test('deux aperçus distincts ne partagent pas les mêmes clés', () => {
    const g = setup();
    const first = g.previewRevolutImport().candidates[0];
    const second = g.previewRevolutImport().candidates[0];
    expect(first.key).not.toBe(second.key);
    expect(g.confirmRevolutImport([{ key: first.key }]).imported).toBe(0);
    expect(g._writes).toEqual([]);
  });

  test('doublons et clés héritées ignorés, confirmation non rejouable', () => {
    const g = setup();
    const c = g.previewRevolutImport().candidates[0];
    const selections = [{ key: c.key }, { key: c.key }, { key: '__proto__' }, { key: 'constructor' }];
    expect(g.confirmRevolutImport(selections).imported).toBe(1);
    expect(g._writes[0]).toHaveLength(1);
    expect(() => g.confirmRevolutImport(selections)).toThrow(/expiré/);
  });

  test('une modification du classeur invalide l’aperçu', () => {
    const g = setup();
    const c = g.previewRevolutImport().candidates[0];
    g.setAnyProp('user', 'alfred_sheet_id', 'other-sheet');
    expect(() => g.confirmRevolutImport([{ key: c.key }])).toThrow(/expiré/);
  });

  test('pagination, devises et champs facultatifs de la banque', () => {
    const g = loadAlfred();
    g._propStore.set('EB_ACCOUNT_ID', 'acc');
    g.Utilities.formatDate = () => '2025-07-01';
    g._enableBankingHeaders_ = () => ({});
    const tx = (currency, date, amount = '12') => ({ transaction_amount: { amount, currency }, booking_date: date, credit_debit_indicator: 'DBIT' });
    const urls = [];
    g._setFetch(url => {
      urls.push(url);
      const json = urls.length === 1
        ? { transactions: [], continuation_key: 'next/key' }
        : { transactions: [tx('EUR', '2025-07-02'), tx('USD', '2025-07-02'), tx('EUR', '2025-08-01'), tx('EUR', '2025-07-02', 'bad')] };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(json) };
    });
    expect(g._scanRevolutCandidates_()).toHaveLength(1);
    expect(urls[1]).toContain('continuation_key=next%2Fkey');
  });
});

describe('Clé bancaire Web Crypto / signature serveur', () => {
  test('une clé PKCS8 sûre permet certificat et JWT sans génération aléatoire serveur', () => {
    const g = loadAlfred();
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../gas/jsrsasign.js'), 'utf8'), g);
    vm.runInContext('Math.random = () => { throw new Error("Pas de RNG serveur"); }', g);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const requests = [];
    g._setFetch((url, opts) => {
      requests.push({ url, payload: JSON.parse(opts.payload) });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'app-id', url: 'https://enablebanking.com/auth' }) };
    });
    expect(g.registerEnableBankingApp('fake-token', pem)).toHaveProperty('authUrl');
    expect(requests[0].payload.certificate).toContain('BEGIN CERTIFICATE');
    const jwt = g._enableBankingHeaders_().Authorization.slice(7);
    const [header, payload, sig] = jwt.split('.');
    expect(verify('RSA-SHA256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(createPublicKey(g._propStore.get('EB_PRIVATE_KEY')).asymmetricKeyDetails.modulusLength).toBe(2048);
    expect(g.registerEnableBankingApp('fake-token')).toHaveProperty('error');
  });
});
