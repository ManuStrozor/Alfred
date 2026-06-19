# Alfred — CLAUDE.md

**A**utomated **L**ocal **F**inance **R**adar & **E**xpense **D**ashboard.
Prévisionnel budgétaire perso : Google Sheets (données) + Web App GAS (SPA mobile-first).
Toujours « Alfred » dans le code/messages. Répondre en **français**.

## Stack

| Couche | Techno |
|---|---|
| Backend | `gas/Alfred.js` — GAS Web App (`executeAs: USER_ACCESSING`, `access: ANYONE`) |
| Frontend | `gas/**/*.html` — HtmlService SPA en iframe sandbox |
| Tests | Jest `__tests__/` — backend (`gas-env.js`) + client (`client-env.js`), via `vm.runInContext` |
| CI/Deploy | `clasp` + GitHub Actions (`test.yml` réutilisable + `deploy.yml`), e2e Playwright, secret `CLASPRC_JSON` |

## Structure (`gas/` = rootDir clasp)

```
gas/
├── Alfred.js          backend : endpoints + CRUD Sheets + forecast + Enable Banking
├── appsscript.json    manifest (Advanced Service: Tasks v1)
├── jsrsasign.js       lib JWT/RSA (Enable Banking)
├── App.html           template principal (doGet→'App'), assemble via include()/includes([])
├── Setup.html         page first-time (si pas de classeur configuré)
├── pages/             Budget, Evaluate, Prevs
├── modals/            modaux plein-écran
├── shared/            Menu, Nav, Splash
├── scripts/           Script (JS client SPA ~1900 l.)
└── styles/            Styles (CSS global)
```

Includes dans `App.html` : `include('styles/Styles')`, `includes(['pages/Budget', …])`. Tout `_modal.ALL` doit avoir un `id="modal-<nom>"` inclus dans `App.html`.

## Navigation

Nav bottom = **Budget · Estimer · Prévisionnel** + hamburger (pastille `nav-badge` si tâches). Menu hiérarchique (modaux imbriqués) : Tâches · Outils (Passer en paie) · Comptes (Connecter EB, Accounts) · Paramètres (Confidentialité, Apparence, Système).
Modaux clés : `Meteo, MonthTrans, Transaction, Payday, PrevLine, Connect, Accounts, Props`.

## JS client (`scripts/`)

### État global
`STATE` (prefs UI + `hideAmounts` éphémère), `_meteo`, `_cache` (cur/rules/props), `_trans`, `_modal` (stack+ALL), `_swipe`, `_charges`, `_toast`. Consts : `TRANS_LIMIT`, `RULE_COLORS` (Besoins/Envies/Epargne — **pas Dette** → gris), `MOIS`, `WEATHER`.

### Patterns établis
- **Modaux** : slide `translateX`, pile `_modal.stack` + `history.pushState` (back Android via popstate). `_openModal(name)` / `_bindModal(name)`.
- **Swipe-to-reveal** edit/delete : `makeSwipeable(row, {onEdit, onDelete})`. Tap simple révèle aussi. Lignes `archived` non swipeables. CSS **`touch-action: pan-y`** obligatoire sur `.month-trans-item`/`.prev-item`.
- **Pull-to-refresh** : swipe-down en haut (hors modal/splash) → `loadAppData()`. Spinner logo v-draw selon `dy/THRESHOLD`, voile `.ptr-backdrop`, scroll verrouillé. Garde : geste dominant vertical.
- **Spinner logo** : `logoSpinner(size)` → `.logo-spin`, gradient `#alfredGrad`/filtre `#glow` définis dans `App.html`.
- **Toggles** : `bindToggle({btnId, labelId, stateKey, onLabel, offLabel, onChange, persist})` — label = action quand ON ; rollback si persistance GAS échoue.
- **Toast** : `showToast(msg, duration?)` file séquentielle.
- **Visibilité** : classe `.is-visible` (pas d'attribut `hidden`).
- **Donut** : légende en délégation (`#donut-legend`), `_selectedRule` au niveau module.
- **Skeletons** : `_showSkeleton(id, kind)` + `_resetDonut()`.

### Flux de chargement
`loadAppData() → getAllData() → _applyAllData(data)` → renderDonut · applyForecast (balances/meteo/forecast/transList) · renderLinkedAccountCards · renderTasks(+badge) · renderPrevList · _maybeShowGemini.

## Backend (`Alfred.js`)

- **Multi-user** : `USER_PROPS.getProperty('alfred_sheet_id')` → `TABS = SpreadsheetApp.openById(id)`. Absent → `doGet` sert `Setup.html`. Onboarding : `createSheetFromTemplate()` copie le modèle (ScriptProp `ALFRED_TEMPLATE_ID`) via `DriveApp.makeCopy`.
- **Propriétés** : UserProps `alfred_sheet_id`, `alfred_*`, `LEP_*/LA_*/CSL_NAME`, `EB_*` · ScriptProps `GEMINI_API_KEY`, `CACHE_TTL`, `ALFRED_OWNER`, `ALFRED_TEMPLATE_ID`. `getUserProp(key, fallback)` : UserProps → ScriptProps → défaut. ScriptProps visibles owner only (`userEmail() === ALFRED_OWNER`) via `getAllProps`/`setAnyProp`/`deleteProp`.
- **Endpoints** (via `google.script.run`) : signatures dans `Alfred.js`. `getAllData()` = tout en un appel → `{forecast, rules, options, savingsProps, mainAccountName, linkedAccountsCount, shownAccounts(+balance), tasks, prevs}`. Soldes EB en parallèle via `_getAccountBalances` (`fetchAll`).
- **Helpers métier** (dans `Alfred.js`) : `_parsePrevBounds`/`prevLineApplies`, `roundCent`, `toAbsMonth`, `parseMmYyyy`, `budgetCalc`, `epargneCalc`, `checkCeiling`, `index*`…
- **Cache serveur** : `forecast`+`budget_rules` invalidés par `invalidateCache()` (fin `getForecast()`) ; `gemini_insight` TTL 60s exclu (expire seul). `CACHE_TTL` défaut 60.
- **Enable Banking** (PSD2, clés `EB_*`) : modal Connect 4 étapes (token portail → `registerEnableBankingApp` → `activateAppEB` → `setupEnableBankingWeb` OAuth). JWT RS256 via `_enableBankingHeaders()`, `_ebFetchJson`/`_extractAccounts`. `EB_ACCOUNT_ID` = 1er compte avec IBAN. **Détail complet dans `Alfred.js`.**
- **Préférences UI** (`ALFRED_PREF_DEFAULTS`) : `{lightTheme, hideSplash, autoImportRevolut, hideNavLabels, transLimit:3}` — tous défauts = toggle OFF.

## Classeur Sheets

6 onglets : **Budgets** (hub), **Prevs** (charges planifiées), **Trans**, **Epargne** (LEP/LA/CSL), **Historique** (clôtures), **Archives**. Déclencheur : `b_date = Budgets!A3` (1er du mois, avance à chaque `paydayWeb`). Épargne : LEP 2,5% / 10 000€ · LA 1,5% / 22 950€ · CSL 0% — surchargeables par UserProps. Règles : `Besoins · Envies · Epargne · Dette`.

## Gemini Insight

Cache localStorage `alfred_gemini_cache` `{key, message, ts}`. Clé = `"MM/YYYY|budget|lep|la|daysLeft"`. `clientKey === inputKey` → `{cached:true}` sans appel. Cache serveur TTL 60s. Tier gratuit 15 RPM / 1 500 RPD.

## Tests

- `gas-env.js` : charge `Alfred.js` (`vm.runInContext`, stubs GAS). Expose les `function`, pas les `const`.
- `client-env.js` : charge `Script`, stubs DOM, helpers via épilogue.
- `vm.runInContext` non instrumenté → `test:cov` ne couvre que les helpers, pas `Alfred.js`. Coverage manuelle/fonctionnelle.

## Règles absolues

### Ne JAMAIS faire sans signaler
- Modifier une valeur littérale (couleur, montant, label, URL, taux) — montrer avant/après et demander validation avant de toucher.

### Tests
- `npm test` **uniquement si `gas/Alfred.js` est modifié** (CI le détecte via `dorny/paths-filter`, job `changes` de `test.yml`).
- Tout changement à un `.html` (`gas/**/*.html`) **doit** être couvert par un test e2e Playwright (`e2e/tests/*.spec.js`) — proposer/étendre le spec dans la même série que la modif.

### Commits
- Toujours proposer un message de commit court à la fin de chaque modif ou série.

### Style
- Réponses courtes et directes. Pas de verbosité, pas de suggestions non sollicitées.
- Emmanuel fait souvent ses propres ajustements visuels/UX/refactors après génération — relire les fichiers avant d'éditer.
- Il teste en live sur le déploiement GAS → **pour un bug runtime, lui demander l'erreur console avant de fouiller le code.**

## Patterns CSS (`styles/Styles.html`)

Variables `--surface-rgb` (pivot light/dark via `data-theme`), `--clr-*`, `--neon-*`, `--font-mono`. Thème `documentElement[data-theme]`. Desktop `@media (min-width:640px)` → `max-width: clamp(480px,60vw,560px)` centré. Visibilité `.is-visible` ; nav labels via `body.no-nav-labels`. Utilitaires `.icon-circle`, pills, `logoSpinner`/`.logo-spin`.
