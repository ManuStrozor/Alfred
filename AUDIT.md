# Audit du projet Alfred — 11 septembre 2026

Revue du backend Apps Script, du calcul client, des interfaces HTML, des écritures Sheets, de la connexion bancaire, des dépendances et des workflows GitHub Actions. Les changements sont locaux : aucun déploiement, accès aux comptes bancaires, envoi de message ou modification d’un classeur réel n’a été effectué.

## Architecture et choix retenus

Le calcul budgétaire est déjà isolé dans `gas/js/Forecast.html`, tandis que le backend prépare les données et gère leur persistance. Cette séparation est adaptée à la taille du projet. Une migration de framework ou un découpage intégral du backend ajouterait un risque sans bénéfice démontré à ce stade.

Les changements se concentrent donc sur les frontières de confiance, les validations communes, les écritures concurrentes et les appels Sheets évitables. Le modèle de calcul des intérêts et les valeurs métier restent inchangés.

## Failles et défauts corrigés

| Priorité | Constat initial | Correction |
| --- | --- | --- |
| Critique | `getProp`/`setProp` pouvaient lire et modifier les ScriptProperties depuis le navigateur, dont `GEMINI_API_KEY` et `ALFRED_OWNER`. Le contrôle présent dans `setAnyProp` était contournable. | Helpers privés avec suffixe `_`, accès public d’administration conservé derrière le contrôle propriétaire. Identité vide refusée. |
| Élevée | Les helpers avec un underscore initial restaient publics, notamment signature bancaire, appels HTTP, échange OAuth, écritures directes et alerte email. | Tous les helpers avec ce préfixe portent maintenant un underscore final. Les endpoints publics conservent leurs validations. |
| Élevée | Le cache Gemini était commun à tous les utilisateurs ; le fallback générique vers ScriptProperties pouvait également transmettre des valeurs privées d’un ancien compte. | Cache utilisateur, migration des propriétés réservée au propriétaire identifié. Suppression du cache financier dans localStorage. |
| Élevée | La génération RSA embarquée pouvait se rabattre sur `Math.random` dans GAS. | Clé RSA 2048 générée avec Web Crypto, export PKCS8, validation et certificat côté serveur. Aucune génération de clé serveur de secours. |
| Élevée | `jsrsasign` 11.1.0 était embarqué hors du suivi npm, avec des correctifs de sécurité ultérieurs, notamment dans le parseur ASN.1. | Bibliothèque officielle mise à jour en 11.1.4. Sa fin de maintenance reste une limite, détaillée ci-dessous. |
| Élevée | Les champs texte de Prevs et les archives pouvaient être réinterprétés comme formules Sheets. | Neutralisation des textes, validation des périodes et protection du libellé de répartition d’une dépense. |
| Moyenne | Les erreurs OAuth étaient insérées directement dans le HTML de retour. | Échappement du contenu des erreurs. |
| Moyenne | Après expiration du cache d’import, un nouveau scan réattribuait des indices pouvant désigner d’autres transactions. Une clé répétée pouvait être écrite plusieurs fois. | Aperçu expiré refusé, clés propres à chaque aperçu, sélection dédupliquée avec Map, cache consommé après écriture et invalidé après changement de données. |
| Moyenne | Les écritures `getLastRow + setValues` pouvaient se concurrencer. Deux confirmations de clôture pouvaient avancer de deux mois. | Verrou utilisateur autour des principales mutations, flush avant libération et vérification du mois attendu à la clôture. |
| Moyenne | Dates impossibles acceptées par normalisation JavaScript, montants partiellement numériques acceptés par `parseFloat`, Infinity accepté comme solde. | Parsing strict commun, même interprétation locale à l’ajout et à l’édition, soldes finis exigés. |
| Moyenne | L’import ne lisait que la première page, ne filtrait pas la devise et supposait certains champs bancaires toujours présents. | Pagination, filtre du mois et de la devise lorsqu’elle est fournie, champs facultatifs tolérés et montants non finis ignorés. |
| Moyenne | Des secrets et le nom de ref GitHub étaient interpolés directement dans le code shell du déploiement. | Passage par variables d’environnement et arguments shell quotés. |
| Faible | Les tests ne se déclenchaient pas pour plusieurs changements de configuration, fixtures ou helpers ; Chromium installé en CI ne correspondait pas au canal Edge demandé. | Filtres élargis, tests sur PR, contrôle statique du client et Chromium en CI. Edge conservé localement. |
| Faible | Serveur de test exposé sur toutes les interfaces, contrôle de chemin par simple préfixe. | Écoute loopback et validation du chemin relatif. |

La confidentialité des fonctions avec suffixe `_` est une règle de [google.script.run](https://developers.google.com/apps-script/guides/html/communication#private_functions). L’isolation du cache suit la [documentation CacheService](https://developers.google.com/apps-script/reference/cache/cache-service). La pagination suit la [documentation Enable Banking](https://enablebanking.com/docs/faq/#how-does-transaction-fetching-with-a-continuation-key-work).

## Simplifications et optimisations

- Déduplication bancaire avec compteurs Map : parcours linéaire au lieu de recherches et suppressions répétées dans une liste ; les doublons légitimes restent possibles.
- Archivage : une suppression Sheets par bloc contigu, au lieu d’une suppression par ligne.
- Validations réutilisées pour les montants, dates et prévisions.
- Suppression d’une invalidation redondante après import et du mécanisme local de conservation des conseils Gemini.
- Départ du calcul d’épargne au mois réellement le plus ancien, même si le classeur n’est pas trié.
- Préférences numériques relues sans perdre les centimes du report de solde.
- Mocks de tests séparant réellement ScriptProperties/UserProperties et cache script/utilisateur : l’ancien store unique empêchait de détecter les erreurs d’isolation.

Ces gains sont structurels ; aucune mesure de latence réelle sur Google Apps Script n’a été effectuée.

## Dépendances

`npm audit` signalait cinq paquets de développement : `@babel/core`, `baseline-browser-mapping`, `brace-expansion`, `browserslist`, `js-yaml` ; trois étaient classés élevés. Les mises à jour compatibles du lockfile ramènent ce contrôle à **zéro vulnérabilité connue**. Aucune montée de version majeure forcée ni script d’installation exécuté.

`gas/jsrsasign.js` provient de [jsrsasign 11.1.4](https://github.com/kjur/jsrsasign/tree/11.1.4), fichier `jsrsasign-all-min.js`, avec les deux adaptations GAS existantes `navigator` et `window`. SHA-256 du fichier livré : `0FDA8C12BA324CB1093972089705A54B8E84946CA24BE84A876EA4FE66ABA305`. Les signatures RSA générées sont vérifiées indépendamment avec Node/OpenSSL dans les tests.

## Actions après revue et limites restantes

1. **Déployer les correctifs et renouveler les secrets potentiellement exposés.** L’ancienne surface RPC permettait de lire la clé Gemini et d’altérer les propriétés globales. Vérifier `ALFRED_OWNER`, `ALFRED_TEMPLATE_ID`, les usages et journaux disponibles. Renouveler les clés/applications bancaires créées par l’ancien générateur. L’audit démontre une possibilité d’exposition, pas une exploitation passée.
2. **Prévoir le remplacement de jsrsasign.** La version finale corrige les défauts connus précédents, mais le projet est [sans support depuis le 14 août 2026](https://github.com/kjur/jsrsasign#end-of-support-announcement-for-jsrsasign). Une migration vers les signatures natives GAS et une solution maintenue pour les certificats reste souhaitable.
3. **Les opérations multi-onglets Sheets ne sont pas transactionnelles.** Une panne au milieu d’une clôture peut laisser une archive ou un historique partiel. Le verrou réduit les courses mais ne fournit ni rollback ni reprise après panne. Un journal d’opérations serait nécessaire pour garantir cette reprise.
4. **Les éditions restent fondées sur un numéro de ligne.** Un autre onglet ouvert, un tri manuel ou une suppression entre lecture et modification peut rendre l’index obsolète. Des identifiants de transaction stables avec contrôle de version sont nécessaires pour traiter complètement ce cas. Le verrou utilisateur ne couvre pas les modifications manuelles ni deux utilisateurs partageant volontairement le même classeur.
5. **Données calculées côté client.** Les soldes de clôture sont vérifiés comme nombres finis, mais leur exactitude n’est pas recalculée côté serveur. Le déclenchement Mammouth et les entrées de Gemini restent également pilotés par le client. Une application avec exigences d’intégrité plus fortes devrait vérifier ces décisions côté serveur.
6. **Fonction Mammouth et autorisations.** `MailApp.sendEmail` est présent alors que le manifeste ne déclare pas `https://www.googleapis.com/auth/script.send_mail`. Son erreur est absorbée. Cette fonctionnalité doit être validée sur GAS avec son consentement explicite ; aucun scope email supplémentaire n’a été ajouté pendant cet audit.
7. **Quotas et services facultatifs.** La clé Gemini est partagée sans limitation globale par utilisateur. Une indisponibilité Google Tasks peut encore faire échouer `getAllData`. Les lectures répétées de Sheets peuvent être regroupées si la volumétrie le justifie.

Le frontend et le backend doivent être publiés ensemble : `registerEnableBankingApp` reçoit désormais la clé PKCS8, et `paydayWeb` exige le mois attendu. Les pages déjà ouvertes doivent être rechargées. Le fallback historique de propriétés n’est disponible que pour le compte correspondant à `ALFRED_OWNER`.

## Vérifications

- Tests unitaires sur les sources : **176 réussis**, dont 27 nouveaux scénarios de sécurité/intégrité.
- Mêmes tests sur le backend minifié : **176 réussis**.
- Contrôle statique des scripts client : réussi.
- Parcours Playwright : **55 réussis** sur Edge, avec le backend simulé.
- Syntaxe YAML des workflows et `git diff --check` : vérifiés.
- Serveur de test : page d’accueil accessible, traversée de répertoire refusée.

Les tests Apps Script utilisent des mocks, et les tests navigateur un backend simulé. Ils ne certifient pas les autorisations réelles, la configuration du déploiement, les quotas Google, un consentement bancaire réel ou l’absence de toute autre faille. Le déploiement doit rester en `USER_ACCESSING` pour respecter l’isolation prévue.
