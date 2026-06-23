# Alfred

**A**utomated **L**ocal **F**inance **R**adar & **E**xpense **D**ashboard — **v3.0.0**

Outil de **prévisionnel budgétaire** et de **suivi d'épargne** sur plusieurs mois, composé de deux parties complémentaires :

- **`gas/Alfred.js`** — backend Google Apps Script (endpoints Web App + CRUD Sheets + forecast + Enable Banking)
- **Web app** — SPA mobile-first (GAS HtmlService, servie dans une iframe sandbox) pour consulter les soldes, ajouter des transactions, estimer une dépense et clôturer le mois depuis un smartphone

Alfred est **multi-utilisateur** : chaque personne enregistre son propre classeur Google Sheets ; ses données ne sont jamais partagées avec les autres.

---

## Fonctionnement général

Il couvre deux dimensions financières :
- **Budget** — solde mensuel (prévisions récurrentes + transactions réelles)
- **Épargne** — évolution des comptes LEP, Livret A et CSL avec capitalisation annuelle des intérêts

---

## Structure du classeur

Le classeur Google Sheets utilise les onglets suivants :

| Onglet | Statut | Contenu |
|---|---|---|
| `Budgets` | obligatoire | Paramètres d'entrée + sortie des résultats (hub) |
| `Prevs` | obligatoire | Prévisions récurrentes (revenus et dépenses planifiés) |
| `Trans` | obligatoire | Transactions réelles du mois courant |
| `Epargne` | obligatoire | Mouvements des comptes LEP, Livret A et CSL |
| `Historique` | auto-créé | Résumé mensuel créé à la clôture : transactions réelles + soldes épargne fin de mois |
| `Archives` | auto-créé | Lignes `Trans` déplacées lors de chaque clôture de mois |

Déclencheur central : `b_date = Budgets!A3` (1er du mois courant), avancé à chaque clôture (`paydayWeb`).

### Paramètres d'entrée (onglet `Budgets`)

| Cellule | Rôle | Format |
|---|---|---|
| `A2` | Période de prévision | `"24"` (mois) ou `"2 ans"` — plafonnée à 200 mois |
| `A3` | Date de départ | Objet Date Google Sheets (ex : `01/01/2025`) |

### Colonnes de sortie (onglet `Budgets`)

| Colonne | Contenu | Ligne de départ |
|---|---|---|
| A | Dates de la période | 4 |
| B | Solde mensuel budget | 3 |
| C | Solde cumulé LEP | 3 |
| D | Solde cumulé Livret A | 3 |
| E | Solde cumulé CSL | 3 |

### Format des données sources

**Onglet `Prevs`** — une ligne par prévision récurrente :

| Col | Contenu | Format |
|---|---|---|
| A | Date de début | `MM/YYYY` (ex : `01/2025`) |
| B | Date de fin | `MM/YYYY` |
| C | Mois actifs | Liste séparée par virgules (ex : `1,6,12`) — vide = tous les mois |
| D | Montant | Nombre (positif = revenu, négatif = dépense) |
| E | Compte d'épargne cible | `LEP`, `LA` ou `CSL` — vide = budget courant |
| F | Occurrence | Formule booléenne (case à cocher) |
| G | Libellé | Texte libre |
| H | Règle budgétaire | `Besoins`, `Envies`, `Epargne` ou `Dette` |

**Onglet `Trans`** — une ligne par transaction :

| Col | Contenu | Format |
|---|---|---|
| A | Date | Date Google Sheets |
| B | Montant | Nombre |
| C | Libellé | Texte libre (optionnel) |
| D | Règle budgétaire | Texte libre (optionnel) |
| E | Catégorie | Texte libre (optionnel) |

> Seules les colonnes A et B sont lues par le moteur de calcul. Les colonnes C–E sont conservées lors de l'archivage à la clôture.

**Onglet `Epargne`** — une ligne par mouvement d'épargne :

| Col | Contenu | Format |
|---|---|---|
| A | Date | Date Google Sheets |
| B | Montant | Nombre |
| C | Compte | `LEP`, `LA` ou `CSL` |

---

## Installation (onboarding multi-user)

1. Ouvrir l'URL du Web App déployé. Si aucun classeur n'est encore configuré pour votre compte, Alfred sert la page **Setup**.
2. Cliquer sur **Configurer** : Alfred copie le classeur modèle (partagé en lecture seule) dans votre Drive via `createSheetFromTemplate`, enregistre automatiquement son ID dans vos `UserProperties`, et ouvre l'application.

Aucune saisie manuelle d'ID/URL n'est nécessaire : l'ID du classeur est stocké dans la propriété utilisateur `alfred_sheet_id`.

### Connexion bancaire (Enable Banking / Open Banking PSD2)

L'import des transactions Revolut utilise l'API [Enable Banking](https://enablebanking.com). Tout se configure **dans l'application** via le modal **Comptes → Connecter** (4 étapes) :

1. **Bearer Token** — créer un compte sur [enablebanking.com](https://enablebanking.com) et récupérer le Bearer Token du portail.
2. **Enregistrer l'application** — Alfred génère une paire de clés RSA + un certificat X.509 auto-signé et enregistre l'application (`registerEnableBankingApp` → `POST /applications`).
3. **Activer l'application** — lien d'activation sur le compte bancaire (`activateAppEB` → `POST /link_accounts`).
4. **Autoriser l'accès** — consentement PSD2 (`setupEnableBankingWeb` → `POST /auth` → OAuth → `doGet(?code=)` → `_exchangeEnableBankingCode` → session + comptes).

Les clés et la session sont stockées dans les `UserProperties` préfixées `EB_*`. Le compte principal retenu (`EB_ACCOUNT_ID`) est le **premier compte disposant d'un IBAN**. Le consentement PSD2 est valide **180 jours**.

### Propriétés (multi-user)

| Portée | Clés | Rôle |
|---|---|---|
| **UserProperties** (par compte) | `alfred_sheet_id`, prefs `alfred_*`, `LEP_*` / `LA_*` / `CSL_NAME`, `EB_*` | Données et préférences propres à chaque utilisateur |
| **ScriptProperties** (partagées) | `GEMINI_API_KEY`, `CACHE_TTL`, `ALFRED_OWNER`, `ALFRED_TEMPLATE_ID` | Configuration globale, visible/éditable par le propriétaire uniquement |

`getUserProp(key, fallback)` résout dans l'ordre : UserProperties → ScriptProperties (migration) → défaut.

---

## Application web

SPA servie par GAS HtmlService. `App.html` assemble les partials via `include(file, params?)` / `includes([...])`. Les **items** (`gas/items/`) sont des partials réutilisables **paramétrés**, évalués côté serveur (scriptlets `<?= param ?>`, ex. `include('items/modal-header', { name, title })`). Le dossier `gas/` est le `rootDir` clasp :

```
gas/
├── Alfred.js          ← backend (endpoints + CRUD + forecast + Enable Banking)
├── appsscript.json    ← manifest (Advanced Service : Tasks v1)
├── jsrsasign.js       ← lib JWT/RSA (signature Enable Banking)
├── App.html           ← template principal (doGet → 'App')
├── Setup.html         ← page first-time (si aucun classeur configuré)
├── pages/             ← Budget · Evaluate (Estimer) · Prevs (Prévisionnel)
├── modals/            ← Menu, Meteo, MonthTrans, Transaction, Payday, PrevLine,
│                         Connect, Accounts, Props, Charges, Taches, Outils, Comptes,
│                         Parametres, Profil, Confidentialite, Appearance, Interface, Systeme
├── items/             ← partials paramétrés : modal-header, menu-button, menu-link,
│                         menu-toggle, menu-stepper
├── js/                ← MainScript (client SPA), SetupScript
├── css/               ← MainStyle, SetupStyle (thème clair/sombre)
├── svg/               ← icônes inline
└── img/               ← images base64
```

### Navigation

- **Nav basse** = 3 pages + hamburger : **Budget** · **Estimer** · **Prévisionnel**. Pastille rouge sur le hamburger si des tâches sont en attente.
- **Menu hiérarchique** (modaux imbriqués) :
  - **Menu** → Tâches · Outils · Comptes · Paramètres
  - **Outils** → Passer en paie
  - **Comptes** → Connecter (Enable Banking) · Connexions disponibles
  - **Paramètres** → **Profil** · Confidentialité · Apparence · Système
    - **Profil** → Objectif de dépense/jour · Le Mammouth
    - **Apparence** → Thème · Interface (aperçu transactions · libellés nav · splash)
    - **Système** → Auto-import Revolut · Propriétés

### Fonctionnalités

- **Budget** — solde disponible du mois courant, comptes bancaires liés (soldes via Enable Banking), transactions récentes, donut de répartition par règle (`Besoins` / `Envies` / `Epargne` / `Dette`) avec **anneau-cible 50/30/20 adaptatif** (Besoins + Dette subis, le reste réparti Envies/Épargne)
- **Météo budgétaire** — indicateur ⛈️ → ☀️ basé sur le ratio marge du jour / rythme prévu par jour
- **Objectif de dépense/jour** — sélecteur (Profil) ; sur la card Budget, indique si l'objectif est tenable jusqu'à la fin du mois ou dans combien de jours le budget s'épuise
- **Le Mammouth** — alerte email optionnelle d'un proche lorsque le mois devient difficile (météo Orage), une seule alerte par épisode
- **Estimer une dépense** — simule l'impact d'un montant sur la météo budgétaire (avant/après + recommandation)
- **Prévisionnel** — tous les mois de la période, séparateurs d'année, mois courant mis en évidence, 4 soldes par mois
- **Charges** — modal de gestion des prévisions récurrentes (swipe edit/delete), accessible depuis le donut
- **Transactions** — liste du mois (swipe-to-reveal edit/delete, tap pour révéler), ajout / édition / suppression
- **Import Revolut** — import des transactions EUR du mois courant (Enable Banking) puis rechargement
- **Tâches** — tâches Revolut (Google Tasks) avec pastille de notification
- **Clôturer le mois (paie)** — saisie du salaire + confirmation avant archivage
- **Assistant IA** — message d'analyse non nominatif généré par Google Gemini (cache 60 s)
- **Masquer les montants** — remplace les valeurs par `••••• €` (éphémère, jamais persisté)
- **Thème clair / sombre** — toggle persisté, transition sans flash
- **Pull-to-refresh** — swipe vers le bas en haut de page pour recharger (spinner logo animé)
- **Retour rapide** — croix ✕ dans l'en-tête des modaux profonds pour revenir directement à l'accueil

### Déploiement

Le code est poussé vers Google Apps Script via **clasp** + **GitHub Actions** :

| Workflow | Déclencheur |
|---|---|
| `test.yml` | Réutilisable (`workflow_call` / `workflow_dispatch`) : détecte les fichiers changés (`dorny/paths-filter`) puis lance Jest, `build:test` et les e2e Playwright selon ce qui a changé |
| `deploy.yml` | Release publiée **ou** push sur `dev` touchant `gas/**` → tests (via `test.yml`) puis `clasp push` + `clasp deploy` (description = `github.ref_name`) |

1. **Pré-requis** : `npm install -g @google/clasp` puis `clasp login`
2. Renseigner le `scriptId` dans `.clasp.json` (`rootDir` = `gas`)
3. Stocker le contenu de `~/.clasprc.json` dans le secret GitHub `CLASPRC_JSON`
4. Pour publier une nouvelle version publique : **Déployer → Nouveau déploiement → Application Web** (`executeAs: USER_ACCESSING`, `access: ANYONE`), puis ajouter l'URL en raccourci sur l'écran d'accueil

---

## Points de conception

**Calcul des intérêts** — accumulés mensuellement au prorata (`taux / 12`) sur le solde courant, puis capitalisés une fois par an en janvier (`absMonth % 12 === 0`, convention `toAbsMonth` : mois de 0 à 11).

**Solde de départ des comptes d'épargne** — le calcul démarre depuis le premier mois de donnée réelle de l'onglet du compte, prenant en compte un solde existant avant la période budgétée.

**Mois absolu** — toutes les comparaisons de dates passent par `toAbsMonth(year, month)` (`année × 12 + mois`), convention partagée par toutes les fonctions d'indexation.

**Prédicat « ligne Prevs active »** — `_parsePrevBounds()` + `prevLineApplies()` mutualisent la logique réutilisée par `checkCeiling`, `findPrevLines` et `indexPrev`.

**Détection de dépassement de plafond** — après chaque calcul, vérification du plafond LEP (10 000 €) / Livret A (22 950 €). Si le dépassement vient uniquement de la capitalisation des intérêts, rien n'est signalé ; s'il vient d'un versement planifié dans `Prevs`, un toast indique le mois et les lignes responsables.

**Cache serveur** (`CacheService`) — `forecast` et `budget_rules` invalidés par `invalidateCache()` ; `gemini_insight` (TTL 60 s) expire naturellement.

---

## Structure du code (`gas/Alfred.js`)

```
Onboarding / multi-user
  doGet()                    ← sert App ou Setup ; capture le callback OAuth (?code=)
  createSheetFromTemplate()  ← copie le modèle dans le Drive de l'utilisateur, stocke l'ID
  getSetupInfo() · setSheetId()

Préférences & propriétés
  getUserPrefs() / setUserPref()    ← prefs UI typées (ALFRED_PREF_DEFAULTS)
  getUserProp() · getProp() / setProp()
  getSavingsProps() · getAllProps() · setAnyProp() · deleteProp()

Pipeline de calcul (forecast)
  getForecast() / _getFullForecast()  ← lecture → indexation → calcul → écriture
    indexPrev() · indexTran() · indexEpargne()
    budgetCalc() · epargneCalc() · checkCeiling() · findPrevLines()
    getPeriod() · getMonthsText() · toAbsMonth() · parseMmYyyy() · absMonthToText()
    _parsePrevBounds() · prevLineApplies() · clampStart/End() · roundCent()

Endpoints Web App (google.script.run)
  getAllData()               ← tout en un appel (forecast, rules, options, savingsProps,
                                comptes liés, tasks, prevs) + alerte Mammouth
  addTransaction / editTransactionByRow / deleteTransactionByRow
  getPrevLines / addPrevLine / editPrevLine / deletePrevLine
  getBudgetRules / getTransOptions / paydayWeb(salary)
  getGeminiInsight() · getRevolutTasks / completeTask
  importRevolutTransactionsWeb()  ← _importRevolutCore() puis getAllData()
  _maybeAlertMammoth()       ← email best-effort à un proche (météo Orage)

Enable Banking (PSD2)
  registerEnableBankingApp() · activateAppEB() · setupEnableBankingWeb()
  _exchangeEnableBankingCode() · _storeAccounts() · refreshLinkedAccountsWeb()
  getLinkedAccounts / setShownAccounts · _getAccountBalances()
  _enableBankingHeaders() · _ebFetchJson() · _extractAccounts()

Sheets (menu classique)
  spreadExpense() · handleReminders() · include() / includes()
```

---

## Commandes de développement

| Commande | Description |
|---|---|
| `npm test` | Tests unitaires Jest (backend `gas/Alfred.js` + helpers client) |
| `npm run test:watch` | Tests en mode watch |
| `npm run test:cov` | Tests avec rapport de couverture |
| `npm run build` | Minifie `gas/Alfred.js` → `gas/Alfred.min.js` |
| `npm run test:min` | Tests sur `gas/Alfred.min.js` (valide que la minification ne casse rien) |
| `npm run build:test` | Enchaîne `build` puis `test:min` |
| `npm run test:e2e` | Tests end-to-end Playwright (canal **msedge**) sur le client mocké |
| `npm run test:e2e:cov` | Tests e2e + rapport de couverture du JS client (monocart) |
| `npm run test:e2e:ui` | Playwright en mode UI |
| `npm run e2e:codegen` | Enregistreur Playwright pour générer un test depuis l'UI |
| `clasp push` | Pousse les sources vers Google Apps Script manuellement |
| `clasp pull` | Récupère l'état courant du projet GAS |

> **Tests unitaires Jest** (`__tests__/`) — chargés en `vm.runInContext` (`helpers/gas-env.js` pour le backend, `client-env.js` pour le client). istanbul n'instrumente pas ce mode : `test:cov` ne couvre que les helpers.
>
> **Tests e2e Playwright** (`e2e/`) — `build-harness.mjs` assemble `App.html` (résolution récursive des `include`/items paramétrés) en un `index.html` statique avec `google.script.run` **mocké** par fixtures, servi en local et piloté sur **msedge**. Le JS client est extrait en `script.js` pour une couverture V8 mappée (`monocart-coverage-reports`, via `test:e2e:cov`). Règle projet : **tout changement HTML doit être couvert par un spec e2e**.

---

## Politique de release

> **Une release n'est pas un commit, c'est un évènement.** Le but est de livrer des paquets cohérents de valeur, pas de tagger à chaque feature finie.

### Workflow

1. **Branche `dev` = zone d'accumulation.** Plusieurs features sont mergées sur `dev` sans bump de version. `deploy-dev.yml` fournit un environnement de test à chaque push.
2. **Le bump de version n'a lieu que dans le dernier commit avant la PR `dev → main`.** Les commits intermédiaires ne touchent pas `gas/modals/Menu.html`.

### Critères pour ouvrir une PR `dev → main`

La release est justifiée si **au moins une** des conditions est remplie :

- ✅ **≥ 2 features substantielles** accumulées sur `dev`
- ✅ **Bug critique** sur la prod (hotfix immédiat autorisé)
- ✅ **≥ 7 jours** depuis la dernière release et au moins 1 feature mergée

La release est **différée** si :

- ❌ Une seule petite feature ou un nettoyage isolé → laisser mariner sur `dev`
- ❌ La feature n'a pas tourné **≥ 24 h** sur le déploiement dev sans bug
- ❌ Envie de release « parce que c'est fini » → c'est le réflexe à casser

### Cadence cible

**1 release par semaine maximum**, hors hotfix.

### Règles de bump (SemVer)

| Bump | Quand | Exemple |
|---|---|---|
| **PATCH** `x.x.+1` | Correction d'un bug déjà en prod (hotfix) | v2.5.0 → v2.5.1 |
| **MINOR** `x.+1.0` | Nouvelles features bundlées, rétro-compat | v2.5.0 → v2.6.0 |
| **MAJOR** `+1.0.0` | Refonte ou breaking change | v2.5.0 → v3.0.0 |

La version est affichée dans `gas/modals/Menu.html` (`<p class="app-version">`).

### Question miroir avant chaque release

> *« Si je release maintenant, l'utilisateur va-t-il ressentir un saut de valeur tangible, ou est-ce juste moi qui veux pusher le tag ? »*

---

## Conditions d'utilisation

Les conditions générales d'utilisation sont rédigées dans `CONDS.html` (page autonome).

---

## Limites connues

- La période est plafonnée à **200 mois** ; toute valeur supérieure est ramenée à 200.
- Les dates de début/fin dans `Prevs` doivent être au format texte `MM/YYYY`.
- Le calcul des intérêts est une approximation mensuelle ; il ne reproduit pas le calcul officiel par quinzaine du LEP et du Livret A.
- `RULE_COLORS` (client) ne définit pas encore la règle `Dette` → couleur grise par défaut.
