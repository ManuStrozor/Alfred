// ----- Configuration (PropertiesService) -----------------------------------------------------------------------------------------
// USER_PROPS doit être initialisé AVANT TABS pour le multi-utilisateur.

const PROPS      = PropertiesService.getScriptProperties();
const USER_PROPS = PropertiesService.getUserProperties();

// Multi-user : chaque utilisateur peut enregistrer son propre classeur via setSheetId().
// Si aucun ID enregistré, on utilise le classeur container (compte propriétaire du script).

// Si l'utilisateur n'a pas configuré son classeur, TABS = null → doGet redirige vers Setup.
const TABS = (() => {
  const sheetId = USER_PROPS.getProperty('alfred_sheet_id');
  if (!sheetId) return null;
  try { return SpreadsheetApp.openById(sheetId); } catch(_) { return null; }
})();

const SH_BUD = 'Budgets';
const SH_PRE = 'Prevs';
const SH_TRA = 'Trans';
const SH_EPA = 'Epargne';
const SH_HIS = 'Historique';
const SH_ARC = 'Archives';

const BUD_TAB = TABS ? TABS.getSheetByName(SH_BUD) : null;

const BUD_PERIOD = BUD_TAB ? BUD_TAB.getRange('A2') : null;
const BUD_DATE   = BUD_TAB ? BUD_TAB.getRange('A3') : null;

const PRE_TAB = TABS ? TABS.getSheetByName(SH_PRE) : null;
const TRA_TAB = TABS ? TABS.getSheetByName(SH_TRA) : null;
const EPA_TAB = TABS ? TABS.getSheetByName(SH_EPA) : null;
let   HIS_TAB = TABS ? TABS.getSheetByName(SH_HIS) : null;
let   ARC_TAB = TABS ? TABS.getSheetByName(SH_ARC) : null;

// Évalués paresseusement (mémoïsés) : getUrl()/getEmail() ont un coût et ne servent qu'à quelques endroits.
let _WEBAPP_URL, _USER_EMAIL;
function webappUrl() { return _WEBAPP_URL ?? (_WEBAPP_URL = ScriptApp.getService().getUrl()); }
function userEmail() { return _USER_EMAIL ?? (_USER_EMAIL = Session.getActiveUser().getEmail()); }

const EB_DOTCOM = 'enablebanking.com';
const EB_API_SUBDOMAIN = 'api.' + EB_DOTCOM;
const EB_API_SUB_ENDPOINT = `https://${EB_API_SUBDOMAIN}`;
const EB_API_COM_ENDPOINT = `https://${EB_DOTCOM}/api`;

/** Lit une propriété de script ; retourne `fallback` si absente ou vide. */
function getProp(key, fallback = null) {
  const v = PROPS.getProperty(key);
  return (v !== null && v !== '') ? v : fallback;
}

/** Persiste une propriété de script. */
function setProp(key, value) {
  PROPS.setProperty(key, String(value));
}

/**
 * Lit une propriété utilisateur (UserProperties).
 * Fallback sur ScriptProperties pour migration transparente (User A conserve ses valeurs existantes).
 * Puis sur `fallback` si absent des deux.
 */
function getUserProp(key, fallback = null) {
  const uv = USER_PROPS.getProperty(key);
  if (uv !== null && uv !== '') return uv;
  const sv = PROPS.getProperty(key);
  if (sv !== null && sv !== '') return sv;
  return fallback;
}

// ----- Préférences utilisateur (UserProperties) ----------------------------------------------------------------------------------

/**
 * Préférences UI persistées dans UserProperties (propre à chaque utilisateur).
 * Le type du défaut détermine le parsing (boolean → 'true'/'false', number → parseInt).
 * `hideAmounts` est volontairement absent : non persisté, repart à false au reload.
 */
const ALFRED_PREF_DEFAULTS = {
  lightTheme:        false,
  hideSplash:        false,
  autoImportRevolut: false,
  hideNavLabels:     false,
  transLimit:        3,
  dailyGoal:         0,   // objectif de dépense/jour (€) ; 0 = désactivé
  mammothEnabled:    false, // « Le Mammouth » : prévenir un proche en cas de mois difficile
  mammothName:       '',    // libellé du contact (affiché dans l'email)
  mammothEmail:      '',    // destinataire de l'alerte
  mammothMessage:    '',    // message personnalisé (vide → message par défaut)
};

/** Web app : retourne les préférences UI typées (fusion défauts + UserProperties). */
function getUserPrefs() {
  const stored = USER_PROPS.getProperties();
  const out = {};
  for (const k of Object.keys(ALFRED_PREF_DEFAULTS)) {
    const raw    = stored['alfred_' + k];
    const defVal = ALFRED_PREF_DEFAULTS[k];
    if (raw === undefined) { out[k] = defVal; continue; }
    out[k] = typeof defVal === 'boolean' ? raw === 'true'
           : typeof defVal === 'number'  ? parseInt(raw, 10)
           : raw;
  }
  return out;
}

/** Web app : modifie une préférence UI (clé doit être listée dans ALFRED_PREF_DEFAULTS). */
function setUserPref(key, value) {
  if (!(key in ALFRED_PREF_DEFAULTS)) throw new Error('Préférence inconnue : ' + key);
  USER_PROPS.setProperty('alfred_' + key, String(value));
}

/**
 * Web app : liste des propriétés éditables.
 * - LEP_/LA_/CSL_ : UserProperties (avec fallback ScriptProperties pour User A)
 * - GEMINI_API_KEY : ScriptProperties (partagée, gérée par le propriétaire)
 * - EB_* : UserProperties
 */
function getSavingsProps(scriptProps, userProps) {
  scriptProps = scriptProps || PROPS.getProperties();
  userProps   = userProps   || USER_PROPS.getProperties();

  // LEP/LA/CSL : valeur UserProps en priorité, sinon ScriptProps, sinon défaut
  const SAVINGS_KEYS = {
    CSL_NAME:    'CSL',
    LA_CEILING:  '22950',
    LA_RATE:     '0.015',
    LEP_CEILING: '10000',
    LEP_RATE:    '0.025',
  };
  const savingsEntries = Object.entries(SAVINGS_KEYS).map(([k, def]) => ({
    key: k, value: userProps[k] ?? def,
  }));

  // GEMINI_API_KEY : ScriptProperties uniquement
  const geminiEntries = Object.keys(scriptProps)
    .filter(k => /^GEMINI_/.test(k))
    .map(k => ({ key: k, value: scriptProps[k] }));

  // Enable Banking : UserProperties (toujours afficher APP_ID et PRIVATE_KEY)
  const EB_REQUIRED = ['EB_APP_ID', 'EB_PRIVATE_KEY'];
  const ebEntries = new Map(EB_REQUIRED.map(k => [k, userProps[k] || '']));
  Object.keys(userProps).filter(k => /^EB_/.test(k))
    .forEach(k => ebEntries.set(k, userProps[k]));

  return [
    ...savingsEntries,
    ...geminiEntries,
    ...[...ebEntries.entries()].map(([k, v]) => ({ key: k, value: v })),
  ].sort((a, b) => a.key.localeCompare(b.key));
}

/** Web app : toutes les propriétés Script + User, avec source. */
function getAllProps() {
  const isOwner = userEmail() === PROPS.getProperty('ALFRED_OWNER');
  const up = USER_PROPS.getProperties();
  const entries = [
    ...(isOwner ? Object.entries(PROPS.getProperties()).map(([key, value]) => ({ key, value, source: 'script' })) : []),
    ...Object.entries(up).map(([key, value]) => ({ key, value, source: 'user' })),
  ];
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

/** Web app : modifie une propriété sans restriction de clé. */
function setAnyProp(source, key, value) {
  (source === 'user' ? USER_PROPS : PROPS).setProperty(key, String(value));
  invalidateCache();
  return true;
}

/** Web app : supprime une propriété. */
function deleteProp(source, key) {
  (source === 'user' ? USER_PROPS : PROPS).deleteProperty(key);
  invalidateCache();
  return true;
}

/**
 * Génère un message d'encouragement via Gemini basé sur la situation budgétaire du mois courant.
 * Le résultat est mis en cache 60 secondes (GEMINI_CACHE_TTL).
 * Tier gratuit : 15 RPM / 1 500 RPD — le mécanisme clientKey réduit les appels réels
 * aux seuls moments où les données ont changé ET le cache a expiré.
 *
 * @param {string} [clientKey]  Clé de données stockée par le client. Si elle correspond
 *                              à la clé courante, l'appel Gemini est évité même si le cache
 *                              serveur a expiré — les données n'ont pas changé.
 *
 * Codes de retour :
 *   { noKey: true }            — GEMINI_API_KEY absente
 *   { cached: true, key }      — données inchangées, le client peut afficher son cache local
 *   { message, icon, key }     — succès (nouveau message ou cache serveur servi)
 *   { error: string }          — erreur technique
 */
function getGeminiInsight(clientKey) {
  const apiKey = getProp('GEMINI_API_KEY');
  if (!apiKey) return { noKey: true };

  const GEMINI_CACHE_KEY = 'gemini_insight';
  const GEMINI_CACHE_TTL = 60; // secondes — tier gratuit : 15 RPM / 1 500 RPD

  // ── 1. Cache serveur valide ───────────────────────────────────────────────
  const hit = CACHE.get(GEMINI_CACHE_KEY);
  if (hit) {
    const obj = JSON.parse(hit);
    // Le client a déjà ce message → inutile de le renvoyer
    if (clientKey && obj.key === clientKey) return { cached: true, key: obj.key };
    return { ...obj, apiCalled: false }; // servi depuis le cache serveur
  }

  // ── 2. Cache serveur expiré : calculer la clé courante ───────────────────
  const MODELS = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

  try {
    const fc  = getFullForecast();
    const trs = _getMonthTransactions().filter(tr => tr.category?.length > 0);
    const cur = fc?.months?.find(m => m.isCurrent);
    if (!cur) return { error: 'Mois courant introuvable dans le prévisionnel.' };

    const bdate       = BUD_DATE.getValue();
    const today       = new Date();
    const now         = bdate > today ? bdate : today;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft    = Math.max(1, daysInMonth - now.getDate() + 1);

    // Clé = toutes les variables d'entrée de Gemini (données + jours restants)
    const inputKey = [
      cur.month,
      Math.round(cur.budget  || 0),
      Math.round(cur.lep     || 0),
      Math.round(cur.la      || 0),
      daysLeft,
    ].join('|');

    // ── 3. Données inchangées → économiser l'appel API : disabled ────────────────────
    if (clientKey && clientKey === inputKey && false) return { cached: true, key: inputKey };

    // ── 4. Nouvelles données → appel Gemini ──────────────────────────────
    const margeJour = (cur.budget || 0) / daysLeft;
    const f         = v => (v !== null && v !== undefined) ? Math.round(v) + ' €' : '—';

    const prompt = [
      `Tu es ${APP}, expert comptable, mascotte d'une app.`,
      '',
      `Situation du mois ${cur.month} :`,
      `- Solde actuel : ${f(cur.budget)}`,
      `- ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''} dans le mois`,
      `- Budget journalier : ${f(margeJour)}`,
      (cur.lep + cur.la) > 0
      ? `- Épargne : LEP ${f(cur.lep)} · Livret A ${f(cur.la)}`
      : '- Aucune épargne !',
      '',
      'Transactions du mois :',
      trs.map(tr => {
        return `- ${tr.date} : ${f(tr.amount)} (${tr.category})`;
      }).join('\n'),
      '',
      'Ecrit un message d\'encouragement sous forme de conseil (l\'astuce du jour).',
      'N\'hesite pas à rappeler à l\'ordre si cela semble necessaire.',
      'Réponds en 1 ou 2 phrases sans utiliser markdown.',
    ].join('\n');

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    let got429 = false, got503 = false;
    for (const model of MODELS) {
      const resp = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      const code = resp.getResponseCode();

      if (code === 200) {
        const json = JSON.parse(resp.getContentText());
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) return { error: `Gemini (${model}) a renvoyé une réponse vide.` };
        const result = { message: text, key: inputKey, apiCalled: true, model: model };
        try { CACHE.put(GEMINI_CACHE_KEY, JSON.stringify(result), GEMINI_CACHE_TTL); } catch (_) {}
        return result;
      }

      if (code === 400) {
        const detail = (() => { try { return JSON.parse(resp.getContentText())?.error?.message || ''; } catch (_) { return ''; } })();
        return { error: 'Clé API invalide. Vérifie GEMINI_API_KEY dans les Propriétés.' + (detail ? ' (' + detail + ')' : '') };
      }
      if (code === 429) got429 = true;
      if (code === 503) got503 = true;
    }
    if (got429) return { error: 'Quota Gemini dépassé — réessayez plus tard.' };
    if (got503) return { error: 'Service indisponible actuellement.' };
    return { error: 'Aucun modèle Gemini disponible dans cette région.' };

  } catch (e) {
    return { error: 'getGeminiInsight: ' + e.message };
  }
}

/** Propriétés utilisateur — fallback ScriptProperties pour migration, puis défauts légaux FR */
const CSL_NAME    = getUserProp('CSL_NAME',    'CSL');
const LA_CEILING  = getUserProp('LA_CEILING',  '22950');
const LA_RATE     = getUserProp('LA_RATE',     '0.015');
const LEP_CEILING = getUserProp('LEP_CEILING', '10000');
const LEP_RATE    = getUserProp('LEP_RATE',    '0.025');
const CACHE_TTL   = parseInt(getProp('CACHE_TTL', '60'), 10); // secondes — ScriptProperties (infrastructure)

// ----- Cache (CacheService) ------------------------------------------------------------------------------------------------------

const CACHE = CacheService.getScriptCache();

/**
 * Retourne la valeur en cache pour `key` si elle existe,
 * sinon appelle `fn()`, met le résultat en cache et le retourne.
 * Le try/catch absorbe silencieusement les valeurs trop volumineuses (> 100 KB).
 */
function getCached(key, fn, ttl = CACHE_TTL) {
  const hit = CACHE.get(key);
  if (hit) return JSON.parse(hit);
  const result = fn();
  try { CACHE.put(key, JSON.stringify(result), ttl); } catch (_) {}
  return result;
}

/** Supprime les entrées de cache invalidées par une modification du classeur. */
function invalidateCache() {
  CACHE.removeAll(['forecast', 'budget_rules']);
  // gemini_insight expire naturellement via son TTL (60s) —
  // la clé de données (clientKey) détecte les changements à l'expiration.
}

// ----- Constantes ----------------------------------------------------------------------------------------------------------------

const MAX_PERIOD = 200; // (month) Max forecast period
const LEP = { id: 'LEP', rate: parseFloat(LEP_RATE), ceiling: parseFloat(LEP_CEILING) };
const LA = { id: 'LA', rate: parseFloat(LA_RATE), ceiling: parseFloat(LA_CEILING) };
const CSL = { id: 'CSL', rate: 0, ceiling: null };
const SAVINGS_ACCOUNTS = [LEP, LA, CSL];

// Lignes de départ des colonnes de sortie dans l'onglet Budgets.
// ROW_TIMELINE : dates (col A).
// ROW_BALANCE : soldes budget (col B) et épargne (cols C-E) démarrent ligne 3.
const ROW_TIMELINE  = 4;
const ROW_BALANCE = 3;

const COOR = {
  dat:  { col: 1, row: ROW_TIMELINE },
  rev:  { col: 2, row: ROW_BALANCE },
  lep:  { col: 3, row: ROW_BALANCE },
  la:   { col: 4, row: ROW_BALANCE },
  csl:{ col: 5, row: ROW_BALANCE },
};

const APP   = 'Alfred';
const TITSP = APP + ' - Répartir une dépense';
const SL    = 'sans libellé';
let UI, OK, OKC, BOK;
try {
  UI  = SpreadsheetApp.getUi();
  OK  = UI.ButtonSet.OK;
  OKC = UI.ButtonSet.OK_CANCEL;
  BOK = UI.Button.OK;
} catch(e) {
  // Contexte Web App — UI non disponible, fonctions Sheets non affectées
}

/**
 * Demande montant + date cible + libellé + règle, puis ajoute une ligne dans Prevs
 * étalant la dépense mensuellement du mois suivant b_date jusqu'à la date cible.
 */
function spreadExpense() {
  const bDate = BUD_DATE.getValue();

  // Mois de début = mois suivant b_date
  let startMonthIdx = bDate.getMonth() + 1; // 0-indexed
  let startYear     = bDate.getFullYear();
  if (startMonthIdx > 11) { startMonthIdx = 0; startYear++; }
  const startStr = String(startMonthIdx + 1).padStart(2, '0') + '/' + startYear;

  const r1 = UI.prompt(TITSP, 'Montant total à répartir (€, ex : 1200) :', OKC);
  if (r1.getSelectedButton() !== BOK) return;
  const total = parseFloat(r1.getResponseText().replace(',', '.'));
  if (isNaN(total) || total <= 0) { UI.alert(APP, 'Montant invalide.', OK); return; }

  const r2 = UI.prompt(TITSP, 'Date cible MM/YYYY (ex : 11/2026) :', OKC);
  if (r2.getSelectedButton() !== BOK) return;
  const endStr = r2.getResponseText().trim();
  if (!/^\d{2}\/\d{4}$/.test(endStr)) { UI.alert(APP, 'Format invalide. Utilisez MM/YYYY.', OK); return; }
  const endMonth1 = parseInt(endStr.substr(0, 2), 10);
  const endYear   = parseInt(endStr.substr(3),    10);

  const startAbs = toAbsMonth(startYear, startMonthIdx);
  const endAbs   = toAbsMonth(endYear, endMonth1 - 1);
  if (endAbs < startAbs) { UI.alert(APP, `La date cible doit être ≥ ${startStr}.`, OK); return; }

  const n       = endAbs - startAbs + 1;
  const monthly = roundCent(-total / n);

  const r3 = UI.prompt(TITSP, 'Libellé (optionnel) :', OKC);
  if (r3.getSelectedButton() !== BOK) return;
  const label = r3.getResponseText().trim();

  const r4 = UI.prompt(TITSP, 'Règle budgétaire :\nBesoins / Envies / Epargne / Dette', OKC);
  if (r4.getSelectedButton() !== BOK) return;
  const rule = r4.getResponseText().trim();
  if (!['Besoins', 'Envies', 'Epargne', 'Dette'].includes(rule)) {
    UI.alert(APP, 'Règle invalide. Valeurs acceptées : Besoins, Envies, Epargne, Dette.', OK);
    return;
  }

  const summary = `Répartir ${total} € sur ${n} mois (${startStr} → ${endStr})\n` +
                  `→ ${Math.abs(monthly)} €/mois · Pocket `+ (label ? `· ${label} ` : '') + `· ${rule}`;
  if (UI.alert(APP + ' - Confirmer', summary, OKC) !== BOK) return;

  // Écriture dans Prevs (cols A-H en un seul appel, puis formule + validation sur F)
  const newRow = PRE_TAB.getLastRow() + 1;
  PRE_TAB.getRange(newRow, 1, 1, 8).setValues([[startStr, endStr, '', monthly, 'Pocket', '', label, rule]]);
  _setPrevFormula(newRow);

  getForecast();
  handleReminders();
  TABS.toast(`Ligne ajoutée dans Prevs (ligne ${newRow}).`, APP, 10);
}

/**
 * Crée des tâches Google Tasks pour les Pockets à configurer (nouveaux) ou à désactiver (expirés).
 * Déclenchée par spreadExpense(), édition de Prevs col E (p_type), ou changement de b_date.
 */
function handleReminders() {
  const bDate      = BUD_DATE.getValue();
  const currentAbs = toAbsMonth(bDate.getFullYear(), bDate.getMonth());
  const nextAbs    = currentAbs + 1;

  const lastRow   = PRE_TAB.getLastRow();
  const preValues = PRE_TAB.getRange(1, 1, lastRow, 8).getValues();

  const newPockets     = [];
  const expiredPockets = [];

  for (let i = 1; i < preValues.length; i++) {
    const p = preValues[i];
    if (String(p[4]).trim() !== 'Pocket') continue;

    const startStr = String(p[0]).trim();
    const endStr   = String(p[1]).trim();
    const amount   = p[3];
    const label    = String(p[6]).trim();

    const startAbs = parseMmYyyy(startStr);

    if (endStr) {
      const endAbs = parseMmYyyy(endStr);
      if (endAbs == currentAbs) {
        expiredPockets.push({ label, amount, startStr, endStr });
        continue;
      }
    }

    // Nouveau : démarre le mois suivant b_date (ajouté via spreadExpense ou manuellement)
    if (startAbs === nextAbs) newPockets.push({ label, amount, startStr, endStr });
  }

  // Rien à créer ni à désactiver → éviter l'appel coûteux à Google Tasks
  if (!newPockets.length && !expiredPockets.length) return;

  // Titres des tâches existantes dans '@default' — pour détecter les hashs déjà présents
  const existingTitles = _listTasks({ showCompleted: true, showHidden: true })
    .filter(t => t.title)
    .map(t => t.title);

  const hashExists = h => existingTitles.some(t => t.includes('[#' + h + ']'));
  const due = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate()).toISOString();

  for (const p of newPockets) {
    const lbl = p.label || SL;
    const h = shortHash('new|' + p.label + '|' + p.amount + '|' + p.startStr + '|' + p.endStr);
    if (hashExists(h)) continue;
    Tasks.Tasks.insert({
      title: `Revolut - Pocket "${lbl}" [#${h}]`,
      notes: `Répartition du revenu :\n\n• Compte cible : Pocket "${lbl}"\n• Montant : ${Math.abs(p.amount)} €`,
      due,
    }, '@default');
  }

  for (const p of expiredPockets) {
    const lbl = p.label || SL;
    const h = shortHash('exp|' + p.label + '|' + p.amount + '|' + p.startStr + '|' + p.endStr);
    if (hashExists(h)) continue;
    Tasks.Tasks.insert({
      title: `Revolut - Pocket expiré "${lbl}" [#${h}]`,
      notes: `A traiter :\n\n• Pocket "${lbl}" - ${Math.abs(p.amount)} €/mois (fin : ${p.endStr})`,
      due,
    }, '@default');
  }
}

function _getClosingDates(bDate) {
  const closingMonth = bDate.getMonth();   // 0-indexé
  const closingYear  = bDate.getFullYear();
  return {
    closingMonth, closingYear,
    closingStr: absMonthToText(toAbsMonth(closingYear, closingMonth)),
    nextDate:   new Date(closingYear, closingMonth + 1, 1),
  };
}

/**
 * Passe en paie depuis la Web App (sans dialogue UI) :
 * calcule l'écart salaire, clôture le mois, retourne le nouveau prévisionnel.
 * @param {number} salary  Montant du salaire reçu
 * @returns {{ closedMonth: string, archivedCount: number, diff: number, forecast: object }}
 */
function paydayWeb(salary) {
  const bDate = BUD_DATE.getValue();
  if (!(bDate instanceof Date)) throw new Error('Date invalide en A3.');

  const { closingMonth, closingYear, closingStr, nextDate } = _getClosingDates(bDate);

  const { forecasted, toArchive, transTotal, lepBal, laBal, cslBal, prevsTotal } =
    _collectClosingInfo(closingYear, closingMonth);
  const diff  = roundCent(salary - forecasted);
  const solde = roundCent(prevsTotal + transTotal + diff);

  _applyClose(closingStr, nextDate, solde, toArchive, transTotal, lepBal, laBal, cslBal);
  handleReminders();

  return { closedMonth: closingStr, archivedCount: toArchive.length, diff: solde, forecast: getFullForecast() };
}

/**
 * Collecte les données du mois à clôturer sans modifier le classeur.
 * @param {number} closingYear   Année du mois à clôturer
 * @param {number} closingMonth  Mois 0-indexé du mois à clôturer
 * @returns {{ forecasted: number, toArchive: object[], transTotal: number,
 *             lepBal: number, laBal: number, cslBal: number }}
 */
function _collectClosingInfo(closingYear, closingMonth) {

  // Salaire prévisionnel ([Salaire] dans Prevs)
  const preLastRow    = PRE_TAB.getLastRow();
  const preValues     = preLastRow >= 1 ? PRE_TAB.getRange(1, 1, preLastRow, 5).getValues() : [[]];
  const closingAbs    = toAbsMonth(closingYear, closingMonth);
  const salaryRowNums = findPrevLines(preValues, '[Salaire]', closingAbs);
  const forecasted    = salaryRowNums.reduce((s, n) => s + (Number(preValues[n - 1][3]) || 0), 0);

  const traLastRow = TRA_TAB.getLastRow();
  const traData    = traLastRow >= 2
    ? TRA_TAB.getRange(2, 1, traLastRow - 1, 5).getValues() : [];

  const toArchive = [];
  let transTotal  = 0;
  for (let i = 0; i < traData.length; i++) {
    const d = new Date(traData[i][0]);
    if (isNaN(d)) continue;
    if (d.getFullYear() === closingYear && d.getMonth() === closingMonth) {
      toArchive.push({ sheetRow: i + 2, row: traData[i] });
      transTotal += traData[i][1];
    }
  }

  const [lepBal, laBal, cslBal] = BUD_TAB.getRange(ROW_BALANCE, COOR.lep.col, 1, 3).getValues()[0];

  // Somme de toutes les prévisions actives pour le mois de clôture
  let prevsTotal = 0;
  for (let i = 1; i < preValues.length; i++) {
    const p = preValues[i];
    if (!p[3]) continue;
    if (!prevLineApplies(_parsePrevBounds(p[0], p[1], p[2]), closingAbs)) continue;
    prevsTotal += Number(p[3]);
  }

  return { forecasted, toArchive, transTotal, lepBal, laBal, cslBal, prevsTotal };
}

function _ensureSheetWithHeader(name, header) {
  let tab = TABS.getSheetByName(name);
  if (!tab) {
    tab = TABS.insertSheet(name);
    tab.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return tab;
}

/**
 * Applique la clôture : Historique, Archives, avance b_date, ligne "Solde", recalcul.
 * @param {string}   closingStr  Mois clôturé "MM/YYYY"
 * @param {Date}     nextDate    1er du mois suivant
 * @param {number}   solde       Écart salaire réel vs prévisionnel
 * @param {object[]} toArchive   Transactions à archiver
 * @param {number}   transTotal  Somme des montants archivés
 * @param {number}   lepBal      Solde LEP courant
 * @param {number}   laBal       Solde LA courant
 * @param {number}   cslBal    Solde CSL courant
 */
function _applyClose(closingStr, nextDate, solde, toArchive, transTotal, lepBal, laBal, cslBal) {

  // Historique
  HIS_TAB = HIS_TAB || _ensureSheetWithHeader(SH_HIS, ['Mois','Transactions réelles','Solde LEP','Solde LA','Solde CSL']);
  HIS_TAB.getRange(HIS_TAB.getLastRow() + 1, 1, 1, 5).setValues([[closingStr, transTotal, lepBal, laBal, cslBal]]);

  // Archives
  if (toArchive.length > 0) {
    ARC_TAB = ARC_TAB || _ensureSheetWithHeader(SH_ARC, ['Date','Montant','Label','Règle','Catégorie']);
    ARC_TAB.getRange(ARC_TAB.getLastRow() + 1, 1, toArchive.length, 5)
      .setValues(toArchive.map(t => t.row));
    toArchive.map(t => t.sheetRow).sort((a, b) => b - a).forEach(row => TRA_TAB.deleteRow(row));
  }

  // Avancer b_date + ligne Trans "Solde"
  BUD_DATE.setFormula(`=DATE(${nextDate.getFullYear()};${nextDate.getMonth()+1};1)`);
  TRA_TAB.getRange(TRA_TAB.getLastRow() + 1, 1, 1, 5)
    .setValues([[nextDate, solde, 'Solde', '', '']]);

  getForecast();
}

/**
 * Point d'entrée HTTP GET — sert l'interface web ou capture le callback OAuth Enable Banking.
 * Déploiement : Exécuter en tant que moi, accès réservé à moi.
 *
 * Quand Enable Banking redirige vers cette URL après consentement Revolut,
 * le paramètre ?code= est présent : on échange le code et on affiche une page de confirmation.
 */
function _callbackPage(icon, title, body) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,interactive-widget=resizes-content">' +
    '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;' +
    'min-height:100vh;margin:0;background:#111;color:#eee;text-align:center;padding:24px}</style></head>' +
    '<body><div><div style="font-size:2.5rem">' + icon + '</div>' +
    '<h2 style="margin:.5rem 0">' + title + '</h2>' +
    '<p style="color:#aaa">' + body + '</p></div></body></html>'
  );
}

function doGet(e) {
  if (e && e.parameter.code) {
    try {
      _exchangeEnableBankingCode(e.parameter.code, e.parameter.state || '');
      return _callbackPage('✅', 'Revolut connecté !', 'La session a été enregistrée.<br>Vous pouvez fermer cette page.');
    } catch (err) {
      return _callbackPage('❌', 'Erreur', err.message);
    }
  }

  // Multi-user : si le classeur n'est pas accessible, afficher la page de configuration
  if (!BUD_TAB) {
    return HtmlService.createTemplateFromFile('Setup')
      .evaluate()
      .setTitle(APP + ' — Installation')
      .setFaviconUrl('https://drive.google.com/uc?id=1ZsdnRrrR4kexfyypNExnhVHTmiMiqJCV&.png')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, interactive-widget=resizes-content');
  }

  return HtmlService.createTemplateFromFile('App')
    .evaluate()
    .setTitle(APP)
    .setFaviconUrl('https://drive.google.com/uc?id=1ZsdnRrrR4kexfyypNExnhVHTmiMiqJCV&.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, interactive-widget=resizes-content');
}

// ----- Multi-user : gestion du classeur par utilisateur -------------------------------------------------------------------------

/**
 * Enregistre le classeur Google Sheets de l'utilisateur.
 * @param {string} urlOrId  URL complète ou ID du classeur
 * @returns {{ success: boolean, title?: string, error?: string }}
 */
function setSheetId(urlOrId) {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id    = match ? match[1] : urlOrId.trim();
  try {
    const ss      = SpreadsheetApp.openById(id);
    const missing = ['Budgets', 'Prevs', 'Trans', 'Epargne'].filter(n => !ss.getSheetByName(n));
    if (missing.length) return { error: 'Onglets manquants : ' + missing.join(', ') };
    USER_PROPS.setProperty('alfred_sheet_id', id);
    return { success: true, title: ss.getName() };
  } catch(_) {
    return { error: 'Classeur introuvable ou accès refusé. Vérifiez l\'URL et vos permissions.' };
  }
}

/**
 * Web app : crée une copie du modèle Alfred (classeur template partagé en lecture seule)
 * dans le Drive de l'utilisateur et enregistre l'ID de la copie.
 * @returns {{ success: boolean, title?: string, id?: string, error?: string }}
 */
function createSheetFromTemplate() {
  try {
    const templateId = getProp('ALFRED_TEMPLATE_ID');
    if (!templateId) return { error: 'Problème de configuration du modèle. Contactez le développeur.' };

    const copy = DriveApp.getFileById(templateId).makeCopy(APP + ' — ' + userEmail());
    const id   = copy.getId();

    USER_PROPS.setProperty('alfred_sheet_id', id);
    return { success: true, title: copy.getName(), id, url: webappUrl() };
  } catch (e) {
    return { error: e.message };
  }
}

/** Retourne les infos de configuration pour la page de setup. */
function getSetupInfo() {
  return {
    email:    Session.getActiveUser().getEmail(),
    sheetId:  USER_PROPS.getProperty('alfred_sheet_id') || '',
    hasSheet: !!BUD_TAB,
  };
}


/**
 * Inclut le contenu d'un fichier HTML (utilisé par les scriptlets <?!= include(...) ?>).
 * @param {string} filename
 * @returns {string}
 */
function include(filename, params = {}) {
  const template = HtmlService.createTemplateFromFile(filename);
  Object.assign(template, params);
  return template.evaluate().getContent();
}

function includes(filenames) {
  return filenames.map(include).join('');
}


/**
 * Retourne la totalité du prévisionnel en une seule requête :
 * mois archivés (Historique) + mois courant + mois prévisionnels (Budgets).
 * Les mois sans données entre deux entrées sont remplis avec null.
 * b_date n'est jamais modifié.
 * @returns {{ periodText: string, months: { month: string, isCurrent?: boolean, isForecast?: boolean,
 *             budget: number|null, budgetInit?: number, lep: number|null, la: number|null, csl: number|null }[] }}
 */
function getFullForecast() {
  return getCached('forecast', _getFullForecast);
}

function _getFullForecast() {
  const bDate      = BUD_DATE.getValue();
  const currentAbs = toAbsMonth(bDate.getFullYear(), bDate.getMonth());
  const dataMap    = new Map();

  getForecast();
  // 1. Mois courant (ROW_BALANCE, cols B–E + G2/I3 pour budgetInit = b_in + b_out + d_in)
  const balRow   = BUD_TAB.getRange(ROW_BALANCE, COOR.rev.col, 1, 4).getValues()[0];
  const initVals = BUD_TAB.getRange('G2:I3').getValues(); // [[G2=b_in, H2, I2=d_in], [G3, H3=b_out, I3]]
  const curStr   = absMonthToText(currentAbs);
  dataMap.set(currentAbs, {
    month: curStr, isCurrent: true,
    budget:     roundCent(balRow[0]),
    budgetInit: roundCent(initVals[0][0] + initVals[1][1] + initVals[0][2]),
    lep:        roundCent(balRow[1]),
    la:         roundCent(balRow[2]),
    csl:        roundCent(balRow[3]),
  });

  // 2. Mois prévisionnels (Budgets, ROW_TIMELINE+, cols A–E)
  let maxAbs = currentAbs;
  const lastRow = BUD_TAB.getLastRow();
  if (lastRow >= ROW_TIMELINE) {
    const rows = BUD_TAB.getRange(ROW_TIMELINE, COOR.dat.col, lastRow - ROW_TIMELINE + 1, 5).getValues();
    for (const row of rows) {
      if (!(row[0] instanceof Date)) continue;
      const d   = row[0];
      const abs = toAbsMonth(d.getFullYear(), d.getMonth());
      if (abs > maxAbs) maxAbs = abs;
      dataMap.set(abs, {
        month: absMonthToText(abs),
        isForecast: true,
        budget: roundCent(row[1]),
        lep:    roundCent(row[2]),
        la:     roundCent(row[3]),
        csl:  roundCent(row[4]),
      });
    }
  }

  // Plage continue de currentAbs à maxAbs
  const months = [];
  for (let abs = currentAbs; abs <= maxAbs; abs++) {
    months.push(dataMap.get(abs) || {
      month: absMonthToText(abs), budget: null, lep: null, la: null, csl: null,
    });
  }

  // Période en toutes lettres
  const n          = getPeriod(BUD_PERIOD.getValue());
  const periodText = n % 12 === 0 && n >= 12
    ? (n / 12) + ' an' + (n / 12 > 1 ? 's' : '')
    : n + ' mois';

  return { periodText, months, cslName: CSL_NAME, monthTransactions: _getMonthTransactions() };
}


/** Transactions du mois courant (b_date), triées du plus récent au plus ancien. */
function _getMonthTransactions() {
  const bDate = BUD_DATE.getValue();
  if (!(bDate instanceof Date)) return [];
  const year  = bDate.getFullYear();
  const month = bDate.getMonth();

  // Lit les lignes (date|montant|label|règle|catégorie) d'un onglet pour le mois courant.
  // `archived` : lignes issues d'Archives → non éditables (row null) côté client.
  const collect = (tab, archived) => {
    const lastRow = tab.getLastRow();
    if (lastRow < 2) return [];
    return tab.getRange(2, 1, lastRow - 1, 5).getValues().map((r, i) => {
      const d = new Date(r[0]);
      if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month) return null;
      return {
        row:      archived ? null : i + 2, // ligne réelle dans Trans (1-indexed, +1 pour header)
        archived: archived || undefined,
        date:     Utilities.formatDate(d, 'Europe/Paris', 'dd/MM'),
        isoDate:  Utilities.formatDate(d, 'Europe/Paris', 'yyyy-MM-dd'),
        amount:   roundCent(r[1]),
        label:    String(r[2] || '').trim() || '—',
        rule:     String(r[3] || '').trim(),
        category: String(r[4] || '').trim(),
      };
    }).filter(Boolean);
  };

  // Mois archivé redevenu courant → Trans ne contient rien pour ce mois : compléter depuis Archives.
  let rows = collect(TRA_TAB, false);
  if (rows.length === 0 && ARC_TAB) rows = collect(ARC_TAB, true);

  rows.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return rows;
}

/** Web app : supprime la ligne Trans à l'index donné, recalcule et renvoie le forecast. */
function deleteTransactionByRow(rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) throw new Error('Index invalide : ' + rowIndex);
  TRA_TAB.deleteRow(rowIndex);
  getForecast(); // invalide déjà le cache en fin d'exécution
  return _getFullForecast();
}

/** Web app : modifie une ligne Trans existante, recalcule et renvoie le forecast. */
function editTransactionByRow(rowIndex, amount, date, label, rule, category) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) throw new Error('Index invalide : ' + rowIndex);
  const dateObj = new Date(date);
  if (isNaN(dateObj)) throw new Error('Date invalide.');
  TRA_TAB.getRange(rowIndex, 1, 1, 5).setValues([[
    dateObj, parseFloat(amount), String(label || ''), String(rule || ''), String(category || ''),
  ]]);
  TRA_TAB.getRange(rowIndex, 1).setNumberFormat('dd/MM/yyyy');
  getForecast(); // invalide déjà le cache en fin d'exécution
  return _getFullForecast();
}


/**
 * Retourne la répartition du budget par règle pour le mois courant.
 * Lit Budgets F4:H8 — F : libellé, G : % décimal consommé, H : montant € (= G × total revenus).
 * @returns {{ label: string, pct: number, amount: number }[]}
 */
function getBudgetRules() {
  return getCached('budget_rules', () =>
    BUD_TAB.getRange('F4:H8').getValues().map(r => ({
      label:  String(r[0]).trim(),
      pct:    typeof r[1] === 'number' ? Math.round(r[1] * 1000) / 10 : 0,
      amount: typeof r[2] === 'number' ? roundCent(r[2]) : 0,
    }))
  );
}

/** Lit les valeurs autorisées d'une colonne via sa validation de données. */
function _listFromValidation(tab, col) {
  const validation = tab.getRange(2, col).getDataValidation();
  if (!validation) return [];
  const type   = validation.getCriteriaType();
  const values = validation.getCriteriaValues();
  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return values[0] || [];
  }
  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
    return values[0].getValues().flat().filter(v => v !== '');
  }
  return [];
}

function getTransOptions() {
  return {
    rules:      _listFromValidation(TRA_TAB, 4), // col D
    categories: _listFromValidation(TRA_TAB, 5), // col E
  };
}

/**
 * Ajoute une transaction dans l'onglet Trans, puis recalcule.
 * @param {number} amount    Montant (positif = crédit, négatif = débit)
 * @param {string} date      Date au format ISO 'YYYY-MM-DD'
 * @param {string} label     Libellé
 * @param {string} [rule]    Règle facultative
 * @param {string} [category] Catégorie facultative
 * @returns {object} Soldes mis à jour
 */
function addTransaction(amount, date, label, rule, category) {
  const parts = date.split('-');
  const d     = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const newRow = TRA_TAB.getLastRow() + 1;
  TRA_TAB.getRange(newRow, 1, 1, 5).setValues([[d, amount, label, rule || '', category || '']]);
  getForecast();
  return _getFullForecast();
}

// ----- Prevs CRUD (Web App) ----------------------------------------------------------------------------------------------------

/** Web app : retourne toutes les lignes Prevs + types distincts (col E). */
function getPrevLines() {
  // Types depuis la validation col E — disponible même si le sheet est vide
  const validationTypes = _listFromValidation(PRE_TAB, 5);
  const typesSet = new Set(validationTypes);

  const lastRow = PRE_TAB.getLastRow();
  if (lastRow < 2) return { lines: [], types: [...typesSet] };

  const rows = PRE_TAB.getRange(2, 1, lastRow - 1, 8).getValues();
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const type   = String(r[4] || '').trim();
    const amount = typeof r[3] === 'number' ? roundCent(r[3]) : 0;
    const label  = String(r[6] || '').trim();
    if (!amount && !label) continue;
    if (type) typesSet.add(type);
    lines.push({
      row:    i + 2,
      start:  String(r[0] || '').trim(),
      end:    String(r[1] || '').trim(),
      months: String(r[2] || '').trim(),
      amount, type, label,
      rule:   String(r[7] || '').trim(),
    });
  }
  return { lines, types: [...typesSet].sort() };
}

function _prevRowData(d) {
  return [d.start||'', d.end||'', d.months||'', parseFloat(d.amount)||0, d.type||'', '', d.label||'', d.rule||''];
}

function _setPrevFormula(row) {
  const r = PRE_TAB.getRange(row, 6);
  r.setFormula(
    `=AND(OR(C${row}="";IFERROR(SEARCH(","&MONTH(b_date)&",";","&C${row}&",")));` +
    `IFERROR(DATEVALUE("01/"&A${row})<=b_date;TRUE);` +
    `IFERROR(DATEVALUE("01/"&B${row})>=b_date;TRUE))`
  );
  r.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

/** Web app : ajoute une ligne Prevs et retourne le nouveau prévisionnel. */
function addPrevLine(data) {
  const newRow = PRE_TAB.getLastRow() + 1;
  PRE_TAB.getRange(newRow, 1, 1, 8).setValues([_prevRowData(data)]);
  _setPrevFormula(newRow);
  getForecast();
  return _getFullForecast();
}

/** Web app : modifie une ligne Prevs existante et retourne le nouveau prévisionnel. */
function editPrevLine(rowIndex, data) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) throw new Error('Index invalide : ' + rowIndex);
  PRE_TAB.getRange(rowIndex, 1, 1, 8).setValues([_prevRowData(data)]);
  _setPrevFormula(rowIndex);
  getForecast();
  return _getFullForecast();
}

/** Web app : supprime une ligne Prevs et retourne le nouveau prévisionnel. */
function deletePrevLine(rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) throw new Error('Index invalide : ' + rowIndex);
  PRE_TAB.deleteRow(rowIndex);
  getForecast();
  return _getFullForecast();
}

/** Itère sur toutes les pages de Tasks.Tasks.list('@default') et retourne le tableau plat. */
function _listTasks(extraOpts = {}) {
  const items = [];
  let pageToken;
  do {
    const opts = Object.assign({ maxResults: 100 }, extraOpts);
    if (pageToken) opts.pageToken = pageToken;
    const res = Tasks.Tasks.list('@default', opts);
    if (res.items) items.push(...res.items);
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

function getRevolutTasks() {
  return _listTasks({ showCompleted: false, showHidden: false })
    .filter(t => t.title && t.title.includes('Revolut'))
    .map(t => ({ id: t.id, title: t.title, notes: t.notes || '' }));
}

/**
 * Marque une tâche comme terminée et retourne la liste mise à jour.
 * @param {string} taskId  ID Google Tasks
 * @returns {object[]} Tâches Revolut restantes
 */
function completeTask(taskId) {
  Tasks.Tasks.patch({ status: 'completed' }, '@default', taskId);
  return getRevolutTasks();
}

// ----- Orchestration principale ------------------------------------------------------------------------------------------------

function getForecast() {
  try {
    const requiredSheets = { [SH_BUD]: BUD_TAB, [SH_PRE]: PRE_TAB, [SH_TRA]: TRA_TAB, [SH_EPA]: EPA_TAB };
    for (const [name, tab] of Object.entries(requiredSheets)) {
      if (!tab) throw new Error(`Onglet "${name}" introuvable dans le classeur.`);
    }

    const period = getPeriod(BUD_PERIOD.getValue());
    const date = BUD_DATE.getValue();
    if (!(date instanceof Date)) throw new Error('Date invalide en A3.');

    const preValues = readSheetData(PRE_TAB, 5); // A–E : col E = compte d'épargne cible
    const traValues = readSheetData(TRA_TAB, 2); // A–B : date, montant
    const epaValues = readSheetData(EPA_TAB, 3); // A–C : date, montant, compte
    const dateAbs = toAbsMonth(date.getFullYear(), date.getMonth());

    let tranMap = indexTran(traValues, TRA_TAB.getName());

    // Si Trans n'a pas de transactions pour ce mois,
    // les données ont probablement été archivées → compléter depuis Archives.
    if (!tranMap.has(dateAbs) && ARC_TAB) {
      const arcLastRow = ARC_TAB.getLastRow();
      if (arcLastRow >= 2) {
        const arcValues = ARC_TAB.getRange(1, 1, arcLastRow, 2).getValues();
        const arcMap = indexTran(arcValues, ARC_TAB.getName());
        for (const [month, amounts] of arcMap) {
          if (!tranMap.has(month)) tranMap.set(month, amounts);
        }
      }
    }
    const epaMaps = indexEpargne(epaValues);
    const accountsData = SAVINGS_ACCOUNTS.map(acc => {
      const map = epaMaps[acc.id];
      return { acc, map, initialAbs: map.keys().next().value };
    });

    const min = Math.min(...accountsData.map(a => a.initialAbs), dateAbs);
    const max = Math.max(period, period+1 + dateAbs - min);
    const prevMap = indexPrev(preValues, min, max);

    BUD_TAB.getRange(ROW_TIMELINE, COOR.dat.col, MAX_PERIOD+1, 5).clearContent();

    BUD_TAB.getRange(ROW_TIMELINE, COOR.dat.col, period, 1).setValues(getMonthsText(date, period));

    const revOutput     = budgetCalc(prevMap, tranMap, dateAbs, period + 1);
    const accOutputs    = accountsData.map(a =>
      epargneCalc(prevMap, a.map, dateAbs, a.initialAbs, period + 1, a.acc));
    const mergedBalancesOutput = revOutput.map((rev, i) =>
      [rev[0], ...accOutputs.map(o => o[i][0])]);
    BUD_TAB.getRange(ROW_BALANCE, COOR.rev.col, period + 1, 4).setValues(mergedBalancesOutput);

    accountsData.forEach((a, i) => checkCeiling(accOutputs[i], dateAbs, a.acc, prevMap, preValues));
    invalidateCache();
  } catch (err) {
    try {
      TABS.toast('Erreur : ' + err.message, APP, 10);
    } catch (_) {
      // toast indisponible (ex. exécution depuis l'éditeur) — erreur déjà loggée.
    }
  }
}

// ----- Indexation --------------------------------------------------------------------------------------------------------------------------

function indexPrev(prevs, startAbs, period) {
  const map = new Map();
  const endAbs = startAbs + period;

  const parsedPrevs = prevs.slice(1).map(p => ({
    ..._parsePrevBounds(p[0], p[1], p[2]),
    amount: p[3],
    accId:  p[4] || null
  }));

  for (let p of parsedPrevs) {
    if (!p.amount) continue;

    const start = clampStart(p.start, startAbs, endAbs);
    const end = clampEnd(p.end, startAbs, endAbs);
    if (start == null || end == null) continue;

    for (let occur = start; occur <= end; occur++) {
      if (!p.months || p.months.has(occur%12+1)) {
        mapPush(map, occur, p.amount);
        if ([LEP.id, LA.id, CSL.id].includes(p.accId))
          mapPush(map, p.accId + '_' + occur, p.amount);
      }
    }
  }
  return map;
}

function indexTran(trans, sheetName) {
  const map = new Map();

  const parsedTrans = trans.slice(1).map((t, idx) => {
    const d = new Date(t[0]);
    if (isNaN(d)) throw new Error(`Date invalide ligne ${idx + 2} dans ${sheetName || '?'} : "${t[0]}"`);
    return { absMonth: toAbsMonth(d.getFullYear(), d.getMonth()), amount: t[1] };
  });

  for (let t of parsedTrans) {
    mapPush(map, t.absMonth, t.amount);
  }
  return map;
}

function indexEpargne(epaValues) {
  const maps = Object.fromEntries(SAVINGS_ACCOUNTS.map(a => [a.id, new Map()]));

  for (let i = 1; i < epaValues.length; i++) {
    const t = epaValues[i];
    const d = new Date(t[0]);
    if (isNaN(d)) throw new Error(`Date invalide ligne ${i + 1} dans Epargne : "${t[0]}"`);
    const absMonth = toAbsMonth(d.getFullYear(), d.getMonth());
    const accId = String(t[2]).trim();
    const map = maps[accId];
    if (!map) throw new Error(`Compte inconnu ligne ${i + 1} dans Epargne : "${accId}"`);
    mapPush(map, absMonth, t[1]);
  }
  return maps;
}

// ----- Calculs --------------------------------------------------------------------------------------------------------------------------

function budgetCalc(prevMap, tranMap, startAbs, period) {
  let amounts = new Array(period);
  let currAbs = startAbs;

  for(let i = 0; i < period; i++, currAbs++) {
    let prevs = 0, trans = 0;

    if (prevMap.has(currAbs)) {
      for (let amount of prevMap.get(currAbs)) prevs += amount;
    }

    if (tranMap.has(currAbs)) {
      for (let amount of tranMap.get(currAbs)) trans += amount;
    }

    amounts[i] = [prevs + trans];
  }
  return amounts;
}

function epargneCalc(prevMap, epMap, startAbs, soldeAbs, period, acc) {
  let amounts = new Array(period);
  let currAbs = soldeAbs;

  let cumul = 0, benefit = 0;
  for (let i = soldeAbs-startAbs; i < period; i++, currAbs++) {
    let prevs = 0, eps = 0;

    if (prevMap.has(acc.id+'_'+currAbs)) {
      for (let amount of prevMap.get(acc.id+'_'+currAbs)) prevs -= amount;
    }

    if (epMap.has(currAbs)) {
      for(let amount of epMap.get(currAbs)) eps += amount;
    }

    cumul += prevs + eps;

    if (acc.rate > 0) {
      benefit += acc.rate * cumul / 12;
      if (currAbs % 12 == 0) {
        cumul += benefit;
        benefit = 0;
      }
    }

    if (i >= 0) amounts[i] = [cumul];
  }
  return amounts;
}

// ----- Utilitaires ---------------------------------------------------------------------------------------------------------------------

/**
 * Hash djb2 — 6 caractères base-36 majuscules.
 * Le même pocket produit toujours le même hash, quelle que soit b_date : permet de dédupliquer les tâches Tasks.
 */
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36).slice(0, 6).toUpperCase();
}

/**
 * Lit les numCols premières colonnes d'un onglet ; lève une erreur si l'onglet est vide.
 * getRange() plutôt que getDataRange() : plage bornée explicitement, immune aux cellules parasites.
 */
function readSheetData(sheet, numCols) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Aucune donnée trouvée dans l\'onglet "' + sheet.getName() + '".');
  return sheet.getRange(1, 1, lastRow, numCols).getValues();
}

/** Parse A2 : accepte "24" (mois) ou "2 ans" ; contraint le résultat entre 1 et MAX_PERIOD. */
function getPeriod(str) {
  const items = String(str).split(' ');
  if (isNaN(Number(items[0]))) throw new Error('Periode invalide en A2.');
  let num = items.length > 1 && items[1].includes('an') ? Number(items[0])*12 : Number(items[0]);
  if (num < 1) {
    num = 1;
    BUD_PERIOD.setValue(num);
  } else if (num > MAX_PERIOD) {
    num = MAX_PERIOD;
    BUD_PERIOD.setValue(num);
  }

  return num;
}

/** Génère un tableau [[Date], …] pour chaque mois de la période, à écrire en colonne A. */
function getMonthsText(date, period) {
  return Array.from({ length: period }, (_, i) => [new Date(date.getFullYear(), date.getMonth() + 1 + i, 1)]);
}

/**
 * Convertit (year, month) en entier absolu. Convention : month de 0 (jan) à 11 (déc),
 * partagée par indexPrev (filtre occur%12+1) et indexTran.
 */
function toAbsMonth(year, month) {
  return year * 12 + month;
}

/** Convertit une chaîne "MM/YYYY" en mois absolu (convention toAbsMonth). */
function parseMmYyyy(str) {
  return toAbsMonth(+str.substr(3), +str.substr(0, 2) - 1);
}

/** Parse les colonnes A(start)/B(end)/C(months) d'une ligne Prevs en bornes mois-absolu. */
function _parsePrevBounds(startCell, endCell, monthsCell) {
  return {
    start:  startCell ? parseMmYyyy(String(startCell)) : null,
    end:    endCell   ? parseMmYyyy(String(endCell))   : null,
    months: monthsCell ? new Set(String(monthsCell).split(',').map(Number)) : null,
  };
}

/** True si une ligne Prevs (bornes issues de _parsePrevBounds) s'applique au mois absolu donné. */
function prevLineApplies(b, absMonth) {
  if (b.start !== null && absMonth < b.start) return false;
  if (b.end   !== null && absMonth > b.end)   return false;
  if (b.months && !b.months.has(absMonth % 12 + 1)) return false;
  return true;
}

function mapPush(map, key, value) {
  map.has(key) ? map.get(key).push(value) : map.set(key, [value]);
}

/** Borne de début effective dans [startAbs, endAbs] ; null si la prévision démarre après la fenêtre. */
function clampStart(val, startAbs, endAbs) {
  if (val === null)   return startAbs;
  if (val > endAbs)   return null;
  return Math.max(val, startAbs);
}

/** Borne de fin effective dans [startAbs, endAbs] ; null si la prévision se termine avant la fenêtre. */
function clampEnd(val, startAbs, endAbs) {
  if (val === null)    return endAbs;
  if (val < startAbs)  return null;
  return Math.min(val, endAbs);
}

/**
 * Signale le premier mois où le solde épargne dépasse acc.ceiling.
 * Ignore les dépassements dus aux seuls intérêts ; identifie sinon les lignes Prevs responsables.
 */
function checkCeiling(output, dateAbs, acc, prevMap, prevData) {
  if (!acc.ceiling) return;

  for (let i = 0; i < output.length; i++) {
    if (output[i] === undefined) continue;

    // Arrondi au centime : évite les faux positifs dus aux imprécisions flottantes
    // accumulées lors de la capitalisation (ex. 10000.000000003 au lieu de 10000).
    const balance = roundCent(output[i][0]);
    if (balance <= acc.ceiling) continue;

    const absMonth = dateAbs + i;

    // Aucun versement Prevs ce mois → dépassement dû aux seuls intérêts → rien à faire
    if (!prevMap.has(acc.id + '_' + absMonth)) return;

    // Calcul du montant corrigé à inscrire dans Prevs.
    // Dans epargneCalc : cumul += −totalPrevs + eps, donc :
    //   balance_sans_prevs = balance + totalPrevs
    //   valeur_corrigée    = balance_sans_prevs − plafond
    let totalPrevs = 0;
    for (const a of prevMap.get(acc.id + '_' + absMonth)) totalPrevs += a;
    const corrected = roundCent(balance + totalPrevs - acc.ceiling);
    const excess    = roundCent(balance - acc.ceiling);

    const lines = findPrevLines(prevData, acc.id, absMonth);
    if (lines.length === 0) return;

    const mois   = absMonthToText(absMonth);
    const lignes = lines.length === 1 ? `ligne ${lines[0]}` : `lignes ${lines.join(', ')}`;
    const detail = lines.length === 1
      ? `corriger ${lignes} (Prevs) → ${corrected} €`
      : `nouveau total des versements pour ${lignes} (Prevs) → ${corrected} €`;

    TABS.toast(
      `${acc.id} dépasse ${acc.ceiling} € en ${mois} (+${excess} €) — ${detail}.`,
      `Plafond ${acc.id} dépassé`,
      20
    );
    return; // on signale uniquement le premier dépassement imputable à Prevs
  }
}

/** Numéros de ligne (1-indexés) des entrées Prevs qui versent sur accId au mois absMonth. */
function findPrevLines(prevData, accId, absMonth) {
  const lines = [];
  for (let i = 1; i < prevData.length; i++) {
    const p = prevData[i];
    if (String(p[4]).trim() !== accId || !p[3]) continue;
    if (!prevLineApplies(_parsePrevBounds(p[0], p[1], p[2]), absMonth)) continue;
    lines.push(i + 1);
  }
  return lines;
}

/** Convertit un mois absolu en chaîne lisible "MM/YYYY". */
function absMonthToText(absMonth) {
  const year  = Math.floor(absMonth / 12);
  const month = absMonth % 12 + 1;
  return String(month).padStart(2, '0') + '/' + year;
}

/** Appel Enable Banking : retourne { code, json, raw }. json=null si le corps n'est pas du JSON. */
function _ebFetchJson(url, opts) {
  const resp = UrlFetchApp.fetch(url, opts);
  const raw  = resp.getContentText();
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  return { code: resp.getResponseCode(), json, raw };
}

/** Extrait la liste de comptes d'une réponse session Enable Banking. */
function _extractAccounts(body) {
  return (body && (body.accounts_data || body.accounts)) || [];
}

/**
 * Web app : génère une paire de clés RSA 2048 + certificat X.509 auto-signé,
 * enregistre l'application sur Enable Banking via l'API de gestion,
 * puis stocke APP_ID et clé privée dans UserProperties.
 *
 * @param {string} bearerToken  Token Bearer du portail Enable Banking (onglet "API Keys")
 * @returns {{ appId: string } | { error: string }}
 */
function registerEnableBankingApp(bearerToken) {
  try {
    if (!bearerToken) return { error: 'Bearer Token requis.' };

    // 1. Génération de la paire de clés RSA 2048 (via jsrsasign / KEYUTIL)
    const keypair = KEYUTIL.generateKeypair('RSA', 2048);
    const prvPem  = KEYUTIL.getPEM(keypair.prvKeyObj, 'PKCS8PRV');

    // 2. Certificat X.509 auto-signé (validité 3 ans, format YYMMDDHHMMSSZ)
    const now    = new Date();
    const expiry = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());
    const gasDate = d => [
      String(d.getFullYear()).slice(2),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
      '000000Z',
    ].join('');

    const cert = new KJUR.asn1.x509.Certificate({
      version:   3,
      serial:    { int: 1 },
      issuer:    { str: `/CN=${APP}/O=${APP}/C=FR` },
      notbefore: { str: gasDate(now) },
      notafter:  { str: gasDate(expiry) },
      subject:   { str: `/CN=${APP}/O=${APP}/C=FR` },
      sbjpubkey: keypair.pubKeyObj,
      sigalg:    { name: 'SHA256withRSA' },
      cakey:     keypair.prvKeyObj,
    });
    const certPem = cert.getPEM();

    // 3. Enregistrement de l'application sur Enable Banking
    const { code, json: body, raw } = _ebFetchJson(EB_API_COM_ENDPOINT + '/applications', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + bearerToken, 'Content-Type': 'application/json' },
      payload: JSON.stringify({
        broker_origin: '',
        certificate:   certPem,
        environment:   'PRODUCTION',
        name:          APP,
        description:   'Web App - Google Apps Script',
        redirect_urls: [webappUrl()],
        gdpr_email:    userEmail(),
        privacy_url:   webappUrl(),
        terms_url:     webappUrl(),
      }),
      muteHttpExceptions: true,
    });

    if (code !== 200 && code !== 201) return { error: 'Enable Banking (' + code + ') : ' + raw };

    const appId = (body && (body.id || body.application_id || body.app_id)) || '';
    if (!appId) return { error: 'APP_ID introuvable dans la réponse : ' + raw };

    // 4. Persistance dans UserProperties (Bearer Token stocké pour renouvellements)
    USER_PROPS.setProperty('EB_APP_ID',      appId);
    USER_PROPS.setProperty('EB_PRIVATE_KEY', prvPem);

    // 5. Liaison du compte ASPSP (Revolut)
    const linkResult = activateAppEB(bearerToken);
    if (linkResult.error) return { linkError: linkResult.error };
    return { authUrl: linkResult.url };
  } catch(e) {
    return { error: e.message };
  }
}

/**
 * Appelle link_accounts sur le portail Enable Banking pour générer l'URL d'autorisation Revolut.
 * @returns {{ url: string } | { error: string }}
 */
function activateAppEB(bearerToken) {
  const appId = USER_PROPS.getProperty('EB_APP_ID');
  if (!appId) return { error: 'APP_ID introuvable — effectuez d\'abord l\'étape 2.' };
  const { code, json: body, raw } = _ebFetchJson(EB_API_COM_ENDPOINT + '/link_accounts', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + bearerToken, 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      country:     'FR',
      aspsp:       'Revolut',
      psuType:     'personal',
      appId:       appId,
      redirectUrl: `${EB_API_COM_ENDPOINT}/auth_redirect`,
    }),
    muteHttpExceptions: true,
  });
  if (code !== 200 && code !== 201) return { error: 'link_accounts (' + code + ') : ' + raw };
  const url = (body && (body.url || body.authorization_url || body.redirect_url)) || '';
  if (!url) return { error: 'URL d\'autorisation introuvable : ' + raw };
  return { url };
}

/**
 * Construit un JWT RS256 signé avec la clé privée RSA de l'application Enable Banking.
 * Nécessite jsrsasign.gs dans le projet GAS (KEYUTIL et KJUR globaux).
 * Renvoie les headers communs pour les appels Enable Banking.
 */
function _enableBankingHeaders() {
  const appId = USER_PROPS.getProperty('EB_APP_ID');
  const pem   = USER_PROPS.getProperty('EB_PRIVATE_KEY');
  if (!appId || !pem) {
    throw new Error('EB_APP_ID et EB_PRIVATE_KEY requis dans les propriétés utilisateur.');
  }

  const now    = Math.floor(Date.now() / 1000);
  const header  = JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: appId });
  const payload = JSON.stringify({ iss: EB_DOTCOM, aud: EB_API_SUBDOMAIN, iat: now, exp: now + 3600 });

  const key = KEYUTIL.getKey(pem);
  const jwt = KJUR.jws.JWS.sign(null, header, payload, key);
  return { 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json' };
}

/**
 * Web app : crée une session de consentement Revolut et retourne l'URL d'autorisation.
 * @returns {{ url: string } | { error: string }}
 */
function setupEnableBankingWeb() {
  try {
    const state     = Utilities.getUuid();
    USER_PROPS.setProperty('EB_STATE', state);
    const validUntil = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
    const { json: body, raw } = _ebFetchJson(EB_API_SUB_ENDPOINT + '/auth', {
      method: 'POST',
      headers: _enableBankingHeaders(),
      payload: JSON.stringify({
        aspsp:        { name: 'Revolut', country: 'FR' },
        state,
        redirect_url: webappUrl(),
        psu_type:     'personal',
        access:       { valid_until: validUntil },
      }),
      muteHttpExceptions: true,
    });
    if (!body || !body.url) return { error: 'Enable Banking : ' + raw };
    return { url: body.url };
  } catch(e) {
    return { error: 'Error: ' + e.message };
  }
}

/**
 * Appelé par doGet() quand Enable Banking redirige vers le Web App avec ?code=...
 * Échange le code contre un session_id, stocke l'account_id du premier compte EUR trouvé.
 * @param {string} code  — code OAuth reçu en query param
 * @param {string} state — état renvoyé par Enable Banking (protection CSRF)
 */
function _exchangeEnableBankingCode(code, state) {
  const expected = USER_PROPS.getProperty('EB_STATE');
  if (expected && state !== expected) throw new Error('State mismatch — possible CSRF, import annulé.');

  const { json: body, raw } = _ebFetchJson(EB_API_SUB_ENDPOINT + '/sessions', {
    method: 'POST',
    headers: _enableBankingHeaders(),
    payload: JSON.stringify({ code }),
    muteHttpExceptions: true,
  });

  if (!body || !body.session_id) throw new Error('Échange de code Enable Banking échoué — ' + raw);

  USER_PROPS.setProperty('EB_SESSION_ID', body.session_id);
  const sess = _ebFetchJson(EB_API_SUB_ENDPOINT + '/sessions/' + body.session_id, {
    headers: _enableBankingHeaders(), muteHttpExceptions: true,
  });

  if (sess.code !== 200) throw new Error('Enable Banking : ' + sess.raw);
  const accounts = _extractAccounts(sess.json);

  if (!accounts.length) throw new Error('Enable Banking — Aucun compte white-listé.');

  _storeAccounts(accounts);
  USER_PROPS.deleteProperty('EB_STATE');
}

/**
 * Enrichit, stocke la liste de comptes et définit EB_ACCOUNT_ID
 * sur le premier compte ayant un IBAN (sinon le premier compte EUR, sinon le premier).
 * Si l'IBAN est absent, tente un appel GET /accounts/{uid} pour le récupérer.
 */
function _storeAccounts(accounts) {
  const accountsData = accounts.map(a => {
    const uid      = a.uid || '';
    let   details  = null;
    let   iban     = a.account_id?.iban || null;
    const currency = a.currency || 'EUR';

    // IBAN absent de la réponse session → le récupérer via /details (évité si déjà présent)
    if (!iban && uid) {
      try {
        const { code, json: data } = _ebFetchJson(EB_API_SUB_ENDPOINT + '/accounts/' + uid + '/details', {
          headers: _enableBankingHeaders(), muteHttpExceptions: true,
        });
        if (code === 200 && data) {
          iban    = data.account_id?.iban || '';
          details = data.details || '';
        }
      } catch(_) {}
    }

    const name = details || (iban ? '···' + String(iban).slice(-4) : currency);
    return { uid, name, iban, currency };
  });

  const main = accountsData.find(a => a.iban)
            || accountsData.find(a => a.currency === 'EUR')
            || accountsData[0];

  USER_PROPS.setProperty('EB_ALL_ACCOUNTS', JSON.stringify(accountsData));
  if (main) USER_PROPS.setProperty('EB_ACCOUNT_ID', main.uid);
}

/** Web app : rafraîchit la liste des comptes depuis la session existante. */
function refreshLinkedAccountsWeb() {
  try {
    const sessionId = USER_PROPS.getProperty('EB_SESSION_ID');
    if (!sessionId) return { error: 'Aucune session active — relancez l\'étape 4.' };

    const { code, json, raw } = _ebFetchJson(EB_API_SUB_ENDPOINT + '/sessions/' + sessionId, {
      headers: _enableBankingHeaders(), muteHttpExceptions: true,
    });
    if (code !== 200) return { error: 'Enable Banking : ' + raw };
    const accounts = _extractAccounts(json);
    if (!accounts.length) return { error: 'Aucun compte trouvé dans la session.' };

    _storeAccounts(accounts);
    return { mainUid: USER_PROPS.getProperty('EB_ACCOUNT_ID') };
  } catch(e) {
    return { error: e.message };
  }
}

/** Extrait le solde disponible d'une réponse /balances (interimAvailable, sinon premier). */
function _parseBalance(json) {
  if (!json) return null;
  const bals = json.balances || [];
  const bal  = bals.find(b => b.balance_type === 'interimAvailable') || bals[0];
  return bal ? parseFloat(bal.balance_amount?.amount ?? bal.amount ?? 0) : null;
}

/**
 * Soldes de plusieurs comptes en un seul round-trip parallèle (UrlFetchApp.fetchAll).
 * Le rate-limit Enable Banking est par compte/endpoint → même coût qu'en série, mais sans attente cumulée.
 * @param {{uid:string}[]} accounts
 * @returns {object[]} les comptes enrichis d'un champ `balance` (null si échec)
 */
function _getAccountBalances(accounts) {
  if (!accounts.length) return [];
  const headers  = _enableBankingHeaders(); // même JWT valable pour toutes les requêtes
  const requests = accounts.map(a => ({
    url: EB_API_SUB_ENDPOINT + '/accounts/' + a.uid + '/balances',
    headers, muteHttpExceptions: true,
  }));
  let resps;
  try { resps = UrlFetchApp.fetchAll(requests); }
  catch (_) { return accounts.map(a => ({ ...a, balance: null })); }

  return accounts.map((a, i) => {
    let balance = null;
    try {
      const resp = resps[i];
      if (resp.getResponseCode() === 200) balance = _parseBalance(JSON.parse(resp.getContentText()));
    } catch (_) {}
    return { ...a, balance };
  });
}

/** Web app : liste tous les comptes Enable Banking avec leur statut d'affichage. */
function getLinkedAccounts() {
  const raw       = USER_PROPS.getProperty('EB_ALL_ACCOUNTS');
  if (!raw) return [];
  const accounts  = JSON.parse(raw);
  const shownUids = JSON.parse(USER_PROPS.getProperty('EB_SHOWN_ACCOUNTS') || '[]');
  return accounts.map(a => ({ ...a, shown: shownUids.includes(a.uid) }));
}

/** Web app : enregistre les UIDs des comptes à afficher sur la page Budget. */
function setShownAccounts(uids) {
  USER_PROPS.setProperty('EB_SHOWN_ACCOUNTS', JSON.stringify(uids));
  const allAccounts = JSON.parse(USER_PROPS.getProperty('EB_ALL_ACCOUNTS') || '[]');
  return _getAccountBalances(allAccounts.filter(({ uid }) => uids.includes(uid)));
}

/**
 * Importe les transactions EUR du mois en cours depuis Enable Banking → Trans.
 * Déduplique par (date|montant|libellé) via consommation de liste pour gérer les doublons légitimes.
 */
/** Coeur de l'import Revolut : retourne le nombre importé. Throws en cas d'erreur. */
function _importRevolutCore() {
  const accountId = USER_PROPS.getProperty('EB_ACCOUNT_ID');
  if (!accountId) throw new Error('Aucune connexion à vos comptes.');

  const dateFrom = Utilities.formatDate(BUD_DATE.getValue(), 'Europe/Paris', 'yyyy-MM-dd');

  const { code, json, raw } = _ebFetchJson(
    EB_API_SUB_ENDPOINT + '/accounts/' + accountId + '/transactions?date_from=' + dateFrom,
    { headers: _enableBankingHeaders(), muteHttpExceptions: true }
  );

  if (code === 401 || code === 403) throw new Error('Session expirée ou révoquée. Relancez l\'étape 4.');
  if (code !== 200) throw new Error((json && json.message) || raw);

  const transactions = (json && json.transactions) || [];

  // Déduplication : liste (et non Set) des lignes existantes dans Trans.
  // Chaque correspondance est retirée (splice) pour permettre plusieurs transactions
  // identiques (même date, montant, libellé) sans les traiter comme doublons.
  const traLastRow = TRA_TAB.getLastRow();
  const existing   = traLastRow >= 2
    ? TRA_TAB.getRange(2, 1, traLastRow - 1, 3).getValues().map(r =>
        Utilities.formatDate(new Date(r[0]), 'Europe/Paris', 'yyyy-MM-dd') + '|' + r[1] + '|' + String(r[2]).trim().toLowerCase()
      )
    : [];

  const rows = [];

  for (const t of transactions) {
    if (!t.transaction_amount) continue;
    const isDbit  = t.credit_debit_indicator === 'DBIT';
    const date   = t.booking_date;
    const raw    = parseFloat(t.transaction_amount.amount);
    const amount  = isDbit ? -raw : raw;
    const xtorName = isDbit ? t.creditor.name : t.debtor.name;
    const label   = (t.remittance_information?.[0] || xtorName || t.entry_reference).trim();
    const key     = date + '|' + amount + '|' + label.toLowerCase();

    const idx = existing.indexOf(key);
    if (idx !== -1) { existing.splice(idx, 1); continue; }

    rows.push([new Date(date), amount, label, isDbit ? 'Envies' : '', isDbit ? 'Unknown' : '']);
  }

  if (rows.length === 0) return 0;

  const firstNewRow = TRA_TAB.getLastRow() + 1;
  TRA_TAB.getRange(firstNewRow, 1, rows.length, 5).setValues(rows);
  TRA_TAB.getRange(firstNewRow, 1, rows.length, 1).setNumberFormat('dd/MM/yyyy');
  invalidateCache();
  getForecast();
  return rows.length;
}

/** Web app : toutes les données initiales en un seul appel. */
function getAllData() {
  const up           = USER_PROPS.getProperties();
  const allAccounts  = JSON.parse(up.EB_ALL_ACCOUNTS || '[]');
  const shownUids    = JSON.parse(up.EB_SHOWN_ACCOUNTS || '[]');
  const shownAccounts = _getAccountBalances(allAccounts.filter(({ uid }) => shownUids.includes(uid)));
  const forecast      = getCached('forecast', _getFullForecast);

  _maybeAlertMammoth(forecast?.months?.find(m => m.isCurrent), up);

  return {
    forecast,
    rules:               getBudgetRules(),
    options:             getTransOptions(),
    savingsProps:        getSavingsProps(undefined, up),
    shownAccounts,
    tasks:               getRevolutTasks(),
    prevs:               getPrevLines(),
  };
}

// Seuil météo « Orage » (cf. WEATHER côté client) : pire niveau atteignable sans
// découvert autorisé. ratio < 0.2 ⇒ marge journalière restante < 20 % du budget initial/jour.
const MAMMOTH_ORAGE_MAX = 0.2;
const MAMMOTH_DEFAULT_MSG =
  'Alfred (mon appli de budget) me signale que le mois est un peu serré ' +
  'côté finances. Si tu as un moment pour prendre des nouvelles, ça me ferait plaisir. 🙏';

/**
 * « Le Mammouth » : prévient par email un proche lorsque la situation budgétaire
 * du mois courant devient difficile (météo Orage ou pire). Une seule alerte par
 * épisode : ré-armée dès que la situation repasse au-dessus du seuil.
 * Appelée dans getAllData ; n'échoue jamais (try/catch) pour ne pas casser le chargement.
 * @param {object|undefined} cur  mois courant du forecast ({ budget, budgetInit, ... })
 * @param {object} up             USER_PROPS.getProperties() (réutilisé, pas de relecture)
 */
function _maybeAlertMammoth(cur, up) {
  try {
    if (up['alfred_mammothEnabled'] !== 'true') return;
    const email = (up['alfred_mammothEmail'] || '').trim();
    if (!email || email.indexOf('@') < 1) return;
    if (!cur || cur.budget === null) return;

    const bdate       = BUD_DATE.getValue();
    const today       = new Date();
    const now         = bdate > today ? bdate : today;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft    = Math.max(1, daysInMonth - now.getDate() + 1);
    const rj          = cur.budgetInit ? cur.budgetInit / daysInMonth : 0;
    const margeJour   = (cur.budget || 0) / daysLeft;
    const ratio       = rj > 0 ? margeJour / rj : ((cur.budget || 0) < 0 ? -1 : 2);

    const isHard = ratio < MAMMOTH_ORAGE_MAX;
    const alertFlag   = up['alfred_mammothAlert'] || '';

    if (isHard && alertFlag !== 'sent') {
      const name = (up['alfred_mammothName'] || '').trim();
      const body = (up['alfred_mammothMessage'] || '').trim() || MAMMOTH_DEFAULT_MSG;
      MailApp.sendEmail({
        to:      email,
        subject: 'Alfred — un petit coup de main ?',
        body:    (name ? 'Salut ' + name + ',\n\n' : '') + body,
      });
      USER_PROPS.setProperty('alfred_mammothAlert', 'sent');
    } else if (!isHard && alertFlag === 'sent') {
      USER_PROPS.deleteProperty('alfred_mammothAlert'); // ré-armement
    }
  } catch (e) {
    // Alerte best-effort : ne jamais interrompre getAllData.
  }
}

/** Web app : import PUIS toutes les données actualisées (forecast cohérent post-import). */
function importRevolutTransactionsWeb() {
  const imported = _importRevolutCore();
  return { imported, ...getAllData() };
}

/** Arrondit une valeur au centime. */
function roundCent(v) { return Math.round(v * 100) / 100; }
