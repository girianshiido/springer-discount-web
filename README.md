# Les belles trouvailles — livres Springer remisés

Application TypeScript préparée pour GitHub Pages + une API Node persistante. Dépôt : [girianshiido/springer-discount-web](https://github.com/girianshiido/springer-discount-web). La mise en ligne de l’interface et l’hébergement de l’API restent à configurer. Elle ne dépend pas de Python sur le poste du visiteur.

## Ce qui est disponible

- Séries à cocher, liste modifiable ; lien direct vers un livre pour une vérification ciblée.
- Softcover, Hardcover, eBook, sélection multiple.
- Prix **remisé maximum** (par défaut 20 EUR), **économie minimale** en devise ou **taux minimal** en %. Les unités et formules sont explicites.
- Séparation stricte des blocs de vente et des ISBN par format. Une promotion eBook ne devient jamais une promotion papier.
- Reprise durable, arrêt après la requête en cours, diagnostic des pages bloquées, historique sans doublons.
- Fiches lisibles, regroupement par série, tri alphabétique ou prix d’origine croissant/décroissant.
- Catalogue HTML autonome unique ou fichiers individuels par série, avec tri disponible hors ligne.
- PDF paginé avec liens cliquables : **URL des résultats** respecte les filtres ; **toutes les URL découvertes** inclut aussi les livres non encore vérifiés / hors critères, avec dédoublonnage des URL exactes.
- Sauvegarde JSON des relevés et ouverture locale. Une sauvegarde des relevés n’inclut pas la file de reprise privée ; sauvegarder `data/state.json` pour une restauration du collecteur.

## Séries du projet initial

Les **30 séries** de `springer_discount_finder_series_only_fixed9.py`, fourni le 14 novembre 2026, ont été reprises dans `config/series.json`, avec leurs noms et leurs identifiants d’origine. La liste a été comparée à la constante `SERIES` du fichier fourni, sans exécuter ce programme.

Conformément à la demande, le fichier Python sert uniquement de référence pour les URL des séries. L’application TypeScript conserve son propre fonctionnement ; elle ne reproduit pas le stockage SQLite ni la reprise de l’ancien programme. Les anciens fichiers de données Python ne sont pas importés automatiquement.

Pour d’autres listes nom/URL écrites dans une source Python : `npm run migrate:series -- /chemin/vers/source.py` peut extraire les associations reconnues vers un nouveau fichier JSON, sans exécuter le Python. Vérifier la liste, puis la charger dans « Connexion et données ».

## Architecture conseillée

```text
Navigateur moderne (ordinateur ou mobile)
  └─ interface TypeScript compilée, GitHub Pages
       └─ HTTPS + CORS vers l’API Node
            ├─ commandes administrateur protégées
            ├─ collecteur séquentiel côté serveur
            └─ volume persistant : state.json (progression, livres, historique)
                 └─ pages publiques Springer, uniquement dans le cadre de droits adaptés
```

GitHub Pages sert des fichiers statiques : il n’exécute pas le collecteur. `no-cors` ne permet pas de lire une réponse opaque ; aucun proxy CORS public, extension ou secret GitHub placé dans l’interface n’est utilisé. L’API n’est pas un proxy arbitraire : elle n’accepte que des livres et des séries Springer et contrôle les domaines de redirection.

Les commandes nécessitent une clé administrateur de 32 caractères minimum, saisie dans l’onglet et conservée seulement en mémoire. Les relevés sont consultables publiquement ; n’exposez pas cette version pour des données privées. La clé ne doit jamais être préfixée `VITE_` ni être enregistrée dans le dépôt. CORS limite l’origine du navigateur, mais **n’est pas l’authentification**. Seule la clé autorise les commandes. Héberger l’API derrière HTTPS, dans une seule instance, avec un volume persistant.

### Prix et fiabilité

Le prix actuel et un prix barré strictement supérieur doivent se trouver dans **la même option d’achat**, portant le libellé de format. Le prix du JSON-LD ou des statistiques de panier n’est pas utilisé : il peut omettre le prix d’origine ou utiliser une base hors taxe. Les blocs mobile/ordinateur identiques sont dédoublonnés ; des prix contradictoires donnent « non vérifiable ». Formats absents, devises ambiguës, prix manquants et indisponibilité restent visibles dans les diagnostics.

Les montants sont conservés en centimes entiers. Chaque relevé conserve devise, ISBN, pays/TVA affichés et date. Aucune conversion CHF/EUR et aucune extrapolation d’une remise globale. Le pays réel dépend de la sortie réseau du serveur ; `Accept-Language` ne force pas une tarification française. Pour les prix français, vérifier un hébergement avec sortie en France et son relevé réel. Le prix au paiement peut encore varier. L’interface n’affirme pas qu’un relevé ancien est un prix en temps réel.

Après un échec de revérification, les anciennes observations restent dans l’historique mais sont exclues des résultats jusqu’à une vérification réussie. La collecte s’arrête sur HTTP 403/429, captcha, structure inconnue ou refus robots.txt et conserve la tâche ; reprise explicite ou « Ignorer la page bloquée ». Il n’y a pas de contournement. Deux secondes au minimum séparent les requêtes, redirections comprises ; timeout et taille de réponse sont bornés.

### Conditions Springer constatées

Au 14 novembre 2026, la section 1.3 des [conditions de Springer Nature Link](https://link.springer.com/termsandconditions) interdit notamment la collecte systématique automatisée. Le [robots.txt](https://link.springer.com/robots.txt) examiné distingue les agents et les chemins ; ses autorisations techniques ne remplacent pas un droit contractuel. Le collecteur est donc livré **désactivé par défaut**. Obtenir un droit adapté ou une source commerciale autorisée avant de l’exploiter systématiquement ; activer ensuite `SPRINGER_COLLECTION_ENABLED=true` côté serveur. Les [API Springer](https://dev.springernature.com/) ne sont pas présentées ici comme une source de remises : aucune API commerciale officielle fournissant ces prix par format n’a été confirmée.

## Installation et utilisation en développement

Node 22.12+ et npm (ou Docker). À la racine de ce dossier :

```sh
npm ci
npm test
npm run build
```

Deux terminaux pour l’essai local, après configuration de `.env` à partir de `.env.example` :

```sh
node --env-file=.env --import tsx src/server/main.ts
```

```sh
npm run dev
```

Vite lit `.env` pour `VITE_API_URL` ; Node lit les variables du serveur avec `--env-file`. Garder exactement la même origine : si vous utilisez `http://127.0.0.1:5173` au lieu de `http://localhost:5173`, adapter `FRONTEND_ORIGIN`. La clé n’est requise que pour commander la collecte ou modifier la liste, pas pour consulter les résultats. Sans API, ouvrir `examples/releve-controle.json` pour examiner les deux relevés réels enregistrés pendant la vérification.

## Déploiement GitHub Pages + API

1. Créer un dépôt pour **le contenu de ce dossier** (la racine du dépôt doit contenir `package.json` et `.github`). Ne pas inclure `data/`, `.env` ou `node_modules/`.
2. Déployer l’API via le Dockerfile sur un serveur ou un hébergeur de conteneurs avec disque persistant. Monter `/data`, exposer le port 8787 derrière HTTPS, conserver **une seule instance**, prévoir jusqu’à 90 s pour l’arrêt propre. Le fichier `compose.yaml` fournit une configuration de base sur serveur ; un reverse proxy TLS reste à configurer pour votre nom de domaine.
3. Définir sur le serveur `ADMIN_TOKEN`, `FRONTEND_ORIGIN=https://VOTRE-COMPTE.github.io`, `DATA_DIR=/data` et `COLLECTOR_USER_AGENT` avec votre contact. L’origine n’inclut **pas** le chemin `/nom-du-depot/`. Activer la collecte uniquement dans le cadre décrit plus haut. Les droits d’écriture de `/data` doivent correspondre à l’utilisateur `node` du conteneur.
4. Vérifier `https://votre-api/health` puis `/api/snapshot`. En absence de droit de collecte, la consultation/import/export reste utilisable.
5. GitHub → Settings → Secrets and variables → Actions → **Variables** : définir `VITE_API_URL=https://votre-api`. C’est une adresse publique, pas un secret.
6. Settings → Pages → Source : **GitHub Actions**. Définir aussi la variable Actions `DEPLOY_PAGES=true`, puis lancer le workflow manuellement ou pousser une modification. Le workflow `pages.yml` teste et compile à chaque push ; il publie l’interface uniquement lorsque cette variable est activée. Adapter la branche `main` si besoin. Le chemin relatif des ressources permet l’hébergement sous `/nom-du-depot/`.
7. Ouvrir l’URL Pages, saisir la clé administrateur dans « Connexion et données », sélectionner les séries/formats et lancer. La fermeture du navigateur n’interrompt pas la collecte.
8. Sauvegarder régulièrement le volume. Pour restaurer : arrêter le serveur, remettre son `state.json` dans `/data`, puis redémarrer. Un travail interrompu passe en pause au redémarrage. En cas de coupure brutale, après vérification qu’aucun processus ne tourne, supprimer uniquement `.writer.lock` ; les points de reprise ne sont pas supprimés.

Pour changer de configuration d’hébergement : modifier `VITE_API_URL`, reconstruire Pages, puis adapter `FRONTEND_ORIGIN`. Aucun token GitHub n’est demandé au navigateur. Une machine qui se met en veille, un disque éphémère ou plusieurs réplicas partageant ce JSON ne conviennent pas : privilégier une instance continue avec disque. Pour une utilisation multi-utilisateur ou à grande échelle, remplacer le magasin JSON par une base transactionnelle et une file de tâches ; ce périmètre n’est pas implémenté ici.

## Variante entièrement exécutée par GitHub Actions

Le collecteur et la CLI sont en TypeScript. `npm run collect -- --run` traite par défaut 40 pages (variable `MAX_PAGES`) puis enregistre une pause. Sans `--run`, il exporte les relevés sans contacter Springer. `SERIES_IDS=714,5350` choisit les séries d’une **nouvelle** recherche ; une reprise conserve ses sources. Une recherche bloquée n’est pas relancée automatiquement ; inspecter la cause avant `--resume-blocked`.

Le modèle `.github/workflows/collect.yml.example` :

- exécute un lot sur demande depuis l’onglet Actions ; aucune planification n’est activée ;
- sauvegarde `state.json` par commit sur `collector-state`, pas dans un cache périssable ;
- publie `snapshot.json` et `catalogue.html` dans Pages ;
- reprend le lot suivant à la prochaine exécution ; partage un verrou de workflow pour éviter les collisions.

Renommer en `collect.yml`, désactiver `pages.yml` pour ne pas remplacer le relevé par une publication de l’interface seule, configurer Pages et les variables de collecte, puis lancer le workflow. Ne pas définir `VITE_API_URL` en variante sans API. L’interface charge automatiquement le relevé publié et propose filtres/export HTML/PDF. Les boutons de collecte sont désactivés : lancer/reprendre depuis Actions, avec votre compte GitHub. Les progrès ne sont publiés qu’à la fin d’un lot ; recharger la page après sa publication. Le seuil et les formats filtrent instantanément le relevé, mais **la sélection de nouvelles séries pour la collecte se fait dans le formulaire Actions**, pas depuis la page statique. C’est pourquoi l’API persistante est la recommandation pour l’interface demandée.

Cette variante dépend des limites/quotas d’Actions et de la disponibilité Springer depuis les IP des runners ; elle n’offre pas de progression en direct. Les commits sur la branche d’état sont publics dans un dépôt public. Une annulation forcée peut faire perdre le travail du lot en cours avant le commit ; les lots déjà validés restent disponibles. Le premier commit d’état peut inclure les sources du dépôt car la branche part du commit courant. Ne jamais y mettre de secrets.

## Navigateurs et limites de validation

Le visiteur utilise un navigateur moderne : Chrome, Firefox, Edge, Safari, y compris Android/iOS récents. Les fonctions utilisées (Fetch, fichiers Blob, téléchargement, stockage local et dialogue natif) ne demandent pas d’extension. Les très vieux navigateurs ne sont pas une cible. Le stockage local est facultatif : l’application fonctionne sans lui, seuls les filtres mémorisés se perdent. Les exports HTML sont autonomes ; pour l’application complète, utiliser une adresse HTTP(S), pas ouvrir `index.html` directement sur disque.

Voir [les vérifications et leurs limites](docs/verification.md). Les conditions, CORS, disponibilité et prix peuvent changer après les essais.

## Sources techniques

- [GitHub Pages est un hébergement statique](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
- [Déploiement de Pages par workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Syntaxe des workflows et déclenchement manuel](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
- [Modèle CORS dans les navigateurs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
- [jsPDF : génération de PDF côté navigateur](https://github.com/parallax/jsPDF).
