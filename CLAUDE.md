# Alfred — CLAUDE.md

**A**utomated **L**ocal **F**inance **R**adar & **E**xpense **D**ashboard.
Outil de prévisionnel budgétaire personnel : Google Sheets (backend de données) + Web App GAS (frontend SPA mobile-first).

Repo : `C:\Github\Budgeto` — le dossier garde son ancien nom, le projet s'appelle **Alfred**.
Toujours utiliser "Alfred" dans le code et les messages. Répondre en **français**.

---

## Stack

| Couche | Technologie |
|---|---|
| Backend | `gas/Alfred.js` — Google Apps Script (Web App, `executeAs: USER_ACCESSING`, `access: ANYONE`) |
| Frontend | `gas/**/*.html` — HtmlService SPA, servie dans une iframe sandbox |
| Tests | Jest via `__tests__/` — backend (`gas-env.js`) + client (`client-env.js`), tous deux par `vm.runInContext` |
| CI/Deploy | `clasp` + GitHub Actions (`ci.yml`, `deploy.yml`, `deploy-dev.yml`), creds via secret `CLASPRC_JSON` |

---

## Structure des fichiers (`gas/` = `rootDir` clasp)

```
gas/
├── Alfred.js              ← backend : endpoints Web App + CRUD Sheets + forecast + Enable Banking
├── appsscript.json        ← manifest (Advanced Service: Tasks v1)
├── jsrsasign.js           ← lib JWT/RSA (signature Enable Banking)
├── App.html               ← template principal (doGet → 'App'), assemble via include()/includes([])
├── Setup.html             ← page first-time (doGet → 'Setup' si pas de classeur configuré)
├── pages/                 ← pages de la nav : Budget, Evaluate, Prevs
├── modals/                ← modaux plein-écran (voir menu ci-dessous)
├── shared/                ← Menu, Nav, Splash
├── scripts/               ← Constantes.html, Helpers.html, Script.html (JS client SPA ~1800 lignes)
└── styles/                ← Styles.html (CSS global)
```

**Include paths** dans `App.html` : `include('styles/Styles')`, `includes(['pages/Budget', 'modals/Charges', 'scripts/Script', …])`.
Tout `_modal.ALL` (Constantes) doit avoir un `id="modal-<nom>"` correspondant inclus dans `App.html`.

---

## Navigation & menu

- **Nav bottom = 3 pages + hamburger** : **Budget** · **Estimer** · **Prévisionnel** (+ bouton menu). Pastille rouge `nav-badge` sur le hamburger si tâches en attente.
- Menu hiérarchique (modaux imbriqués) :
  - **Menu** → Tâches (pastille) · Outils · Comptes · Paramètres
  - **Outils** → Passer en paie
  - **Comptes** → Connecter (Enable Banking) · Connexions disponibles (modal Accounts)
  - **Paramètres** → Confidentialité · Apparence · Système
    - **Confidentialité** → Masquer les montants
    - **Apparence** → Thème · **Interface** (aperçu transactions · libellés nav · désactiver splash)
    - **Système** → Auto-import Revolut · Propriétés (modal Props)

Modaux clés : `Meteo, MonthTrans, Transaction, Payday, PrevLine, Connect, Accounts, Props`.

---

## Architecture JS client (`scripts/`)

### État global (`Constantes.html`)
```js
STATE          // prefs UI (window.ALFRED_PREFS) + hideAmounts éphémère (jamais persisté)
_meteo         // { ratio, weather, budget, budgetInit }
_cache         // { cur, rules, props } — re-render hideAmounts + cache savingsProps client
_trans         // { items, editingRow }
_modal         // { stack, ALL } — pile de modaux + liste exhaustive des noms
_swipe         // { PX: 96, row } — ligne révélée courante
_charges       // { lines, types, filters, loaded, editingRow, sign }
_toast         // { GAP, queue, busy }
TRANS_LIMIT · RULE_COLORS (Besoins/Envies/Epargne) · MOIS · WEATHER
```

### Patterns établis
- **Modaux** : slide horizontal (`translateX`), pile `_modal.stack` + `history.pushState` (back Android via popstate). `_openModal(name)` / `_bindModal(name)` (bind `<nom>-back`).
- **Swipe-to-reveal** edit/delete : `makeSwipeable(row, { onEdit, onDelete })` (transactions + charges). **Tap simple** révèle/masque aussi les boutons. Lignes archivées (`archived:true`) non swipeables.
  - CSS **`touch-action: pan-y`** obligatoire sur `.month-trans-item` / `.prev-item` (sinon Chromium annule le geste horizontal).
- **Pull-to-refresh** : geste swipe-down en haut de page (hors modal/splash) → `loadAppData()`. Indicateur = spinner logo (v-draw) qui se **dessine selon `dy/THRESHOLD`** ; voile sombre plein écran (`.ptr-backdrop`) ; scroll page verrouillé pendant le geste (`preventDefault`) et le chargement (`body.overflow=hidden`). Garde de direction : ne s'engage que si geste dominant vertical.
- **Spinner logo** : `logoSpinner(size)` (Helpers) → `.logo-spin` (v-draw), gradient `#alfredGrad` + filtre `#glow` définis une fois dans `App.html`. Utilisé pour pull-to-refresh + boutons de chargement.
- **Toggles UI** : `bindToggle({ btnId, labelId, stateKey, onLabel, offLabel, onChange, persist })` — label = action quand ON ; **rollback** de l'état si la persistance GAS échoue.
- **Toast** : `showToast(msg, duration?)` — file séquentielle via `_drainToast()`.
- **Visibilité** : classe `.is-visible` uniquement (pas d'attribut `hidden`).
- **Donut** : légende cliquable en **délégation** (listener unique sur `#donut-legend`), `_selectedRule` au niveau module (survit au re-render).
- **Skeletons** : `_showSkeleton(id, kind)` + `_resetDonut()` (appelés par `loadAppData`).

### Flux de chargement
```
loadAppData() → getAllData() → _applyAllData(data)
  → renderDonut · applyForecast (renderBalances/renderMeteo/renderForecast/_renderTransList)
  → renderLinkedAccountCards · renderTasks (+ _updateTaskBadge) · renderPrevList · _maybeShowGemini
```

---

## Architecture backend (`Alfred.js`)

### Multi-user
- Chaque utilisateur enregistre **son** classeur : `USER_PROPS.getProperty('alfred_sheet_id')` → `TABS = SpreadsheetApp.openById(id)`. Si absent → `doGet` sert `Setup.html`.
- **Onboarding** : `createSheetFromTemplate()` copie le modèle (ScriptProp **`ALFRED_TEMPLATE_ID`**, partagé lecture seule) via `DriveApp.makeCopy`, stocke l'ID auto, retourne `{ success, title, id, url }`. Le Setup ouvre l'app via un lien `target="_top"` (la nav top auto est bloquée dans l'iframe sandbox).

### Propriétés (Script vs User)
- **UserProperties** (par compte) : `alfred_sheet_id`, prefs `alfred_*`, comptes épargne `LEP_*/LA_*/CSL_NAME`, Enable Banking `EB_*`.
- **ScriptProperties** (partagées) : `GEMINI_API_KEY`, `CACHE_TTL`, `ALFRED_OWNER`, `ALFRED_TEMPLATE_ID`.
- `getUserProp(key, fallback)` : UserProps → fallback ScriptProps (migration) → défaut.
- Modal « Paramètres » : `getAllProps()` (ScriptProps visibles **owner uniquement** = `userEmail() === ALFRED_OWNER`), `setAnyProp(source, key, value)`, `deleteProp(source, key)`.

### Endpoints Web App (via `google.script.run`)
`getAllData` (tout en un appel), `addTransaction / editTransactionByRow / deleteTransactionByRow`, `getPrevLines / addPrevLine / editPrevLine / deletePrevLine`, `getBudgetRules`, `getTransOptions`, `paydayWeb(salary)`, `getGeminiInsight(clientKey, weatherLevels)`, `getUserPrefs / setUserPref`, `importRevolutTransactionsWeb` (= `_importRevolutCore()` PUIS `getAllData()`), `getRevolutTasks / completeTask`, `createSheetFromTemplate`, `getSetupInfo`.

`getAllData()` payload : `{ forecast, rules, options, savingsProps, mainAccountName, linkedAccountsCount, shownAccounts(+balance), tasks, prevs }`. Les soldes EB sont récupérés en parallèle via `_getAccountBalances` (`UrlFetchApp.fetchAll`).

### Helpers métier factorisés
- `_parsePrevBounds(a,b,c)` + `prevLineApplies(bounds, absMonth)` : prédicat « ligne Prevs active » (réutilisé par `_collectClosingInfo`, `findPrevLines`, `indexPrev`).
- `roundCent`, `toAbsMonth`, `parseMmYyyy`, `absMonthToText`, `clampStart/clampEnd`, `getPeriod`, `indexPrev/Tran/Epargne`, `budgetCalc`, `epargneCalc`, `checkCeiling`.

### Cache serveur (CacheService)
- `forecast` + `budget_rules` : invalidés par `invalidateCache()` (appelé en fin de `getForecast()`).
- `gemini_insight` : TTL 60s — **exclu** d'`invalidateCache()` (expire naturellement).
- `CACHE_TTL` (défaut 60) parsé en number.

### Enable Banking (Open Banking PSD2) — clés `EB_*`
Flow via modal Connect (4 étapes, country FR, ASPSP Revolut) :
1. Bearer Token (portail) · 2. `registerEnableBankingApp` (génère RSA + cert X.509, `POST /applications`, puis `activateAppEB`) · 3. `activateAppEB` (`POST /link_accounts`) · 4. `setupEnableBankingWeb` (`POST /auth` → OAuth → `doGet(?code=)` → `_exchangeEnableBankingCode` → session + comptes).
- `_enableBankingHeaders()` construit le JWT RS256 inline. `_ebFetchJson(url, opts)` / `_extractAccounts(body)` mutualisent les appels.
- `_storeAccounts` choisit comme `EB_ACCOUNT_ID` le **premier compte avec IBAN** (récupéré via `/accounts/{uid}/details`).
- Endpoints : `EB_API_SUB_ENDPOINT = https://api.enablebanking.com` (PSD2) · `EB_API_COM_ENDPOINT = https://enablebanking.com/api` (portail).

### Préférences UI (`ALFRED_PREF_DEFAULTS`)
```js
{ lightTheme: false, hideSplash: false, autoImportRevolut: false, hideNavLabels: false, transLimit: 3 }
```
Toutes les valeurs par défaut = toggle **OFF**.

---

## Classeur Google Sheets

6 onglets : **Budgets** (hub), **Prevs** (charges planifiées), **Trans** (transactions du mois),
**Epargne** (mouvements LEP/LA/CSL), **Historique** (clôtures), **Archives** (transactions archivées).

Déclencheur central : `b_date = Budgets!A3` (1er du mois courant, avance à chaque `paydayWeb`).
Comptes épargne : **LEP** (2,5%, plafond 10 000€), **LA** (1,5%, 22 950€), **CSL** (0%, aucun) — taux/plafonds surchargeables par UserProperties.
Règles budgétaires : `Besoins · Envies · Epargne · Dette` (dropdowns Prevs/Trans). ⚠️ `RULE_COLORS` (client) ne définit pas encore `Dette` → tombe sur gris.

---

## Gemini Insight

Cache localStorage `alfred_gemini_cache` : `{ key, message, ts }`.
- Clé = `"MM/YYYY|budget|lep|la|csl|daysLeft"`, construite inline dans `getGeminiInsight`.
- Si `clientKey === inputKey` (données inchangées) → `{ cached: true }`, pas d'appel API.
- Cache serveur `gemini_insight` TTL 60s. Tier gratuit : 15 RPM / 1 500 RPD.

---

## Tests

- **`__tests__/helpers/gas-env.js`** : charge `gas/Alfred.js` en `vm.runInContext` avec stubs GAS (SpreadsheetApp, PropertiesService partagé, CacheService, UrlFetchApp via `_setFetch`…). Expose les `function` (pas les `const`).
- **`__tests__/helpers/client-env.js`** : charge `Constantes.html` + `Helpers.html` (pas `Script.html`) avec stubs DOM/window/localStorage. Expose `fmt, escHtml, cleanTitle, fmtMonth`, utils dates, `logoSpinner` + consts via épilogue (`__STATE`, `__MOIS`…).
- Suites : pipeline calcul (utils, budgetCalc, epargneCalc, index*, checkCeiling, findPrevLines, geminiInsight) + props/cache/EB-helpers/bounds + client helpers.
- **Limitation coverage** : `vm.runInContext` n'est pas instrumenté par istanbul → `npm run test:cov` ne reporte que les helpers, pas `Alfred.js`. Coverage = manuelle/fonctionnelle.

---

## Règles absolues

### Ne JAMAIS faire sans signaler
- Modifier une valeur littérale (couleur, montant, label, URL, taux) — montrer avant/après et demander validation avant de toucher.

### Tests
- `npm test` **uniquement si `gas/Alfred.js` ou `gas/scripts/Helpers.html` est modifié** (la CI le détecte via `grep '^gas/Alfred\.js$'`).

### Commits
- Toujours proposer un message de commit court à la fin de chaque modification ou série.

### Style
- Réponses courtes et directes. Pas de verbosité, pas de suggestions non sollicitées.
- Emmanuel fait souvent ses propres ajustements visuels/UX/refactors après génération — ne pas s'en étonner ; relire les fichiers avant d'éditer.
- Il teste en live sur le déploiement GAS et donne un feedback précis.

---

## Patterns CSS (`styles/Styles.html`)

- Variables : `--surface-rgb` (pivot light/dark via `data-theme`), `--clr-*`, `--neon-*`, `--font-mono`.
- Thème : `document.documentElement.setAttribute('data-theme', 'light'|'dark')`.
- Layout desktop : `@media (min-width:640px)` → `max-width: clamp(480px, 60vw, 560px)` centré sur `#app`, `nav`, `.modal-sheet`.
- Visibilité via `.is-visible` ; nav labels masqués par `body.no-nav-labels`.
- Utilitaire `.icon-circle` (boutons ronds), pills de filtre mutualisées, `logoSpinner` / `.logo-spin`.
