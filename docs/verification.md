# Vérifications du 14 novembre 2026

## Réseau réel Springer

- Les pages publiques de série 714 et de deux livres ont été accessibles par requête serveur, après les redirections ordinaires de Springer. Les blocs de prix et une pagination `rel=next` ont été examinés.
- Le **collecteur TypeScript réel**, utilisant son contrôle de robots.txt, son agent propre, ses délais et ses redirections limitées, a été exécuté sur le livre fourni par l’utilisateur : `10.1007/978-3-642-56468-0`, le 14 novembre 2026 à 11:24 UTC. Résultat : Softcover 17,71 EUR / prix barré 73,84 EUR ; eBook 17,99 EUR / prix barré 53,49 EUR ; TVA France. Hardcover non exposé, donc non vérifiable. Le test est ciblé, pas un crawl complet de série.
- Un autre livre, `10.1007/978-3-319-11080-6`, a fourni un bloc eBook à 17,99 EUR / prix barré 32,09 EUR, TVA France. Le HTML brut et ses en-têtes ont été examinés via requête serveur ; ce relevé a ensuite été utilisé comme copie de test.
- La réponse HTML finale examinée ne contenait pas d’en-tête `Access-Control-Allow-Origin`. Un accès lisible depuis GitHub Pages n’est donc pas acquis. L’application ne tente jamais cet accès direct.
- Le service de lecture web a reçu une autre variante de la page de contrôle : prix suisses en CHF et pas de remise. Cela confirme l’importance de la région de sortie et des relevés horodatés ; cela ne mesure pas tous les pays possibles.
- robots.txt a été lu. Ses règles techniques ne remplacent pas les conditions de collecte systématique de Springer. La configuration livrée reste désactivée par défaut.

## Tests automatisés

11 tests passent :

- distinction des montants/ISBN Softcover et eBook dans les extraits du contrôle ;
- aucune propagation de remise eBook au Hardcover ;
- contradictions entre blocs, devises distinctes, formats absents ;
- nombres français/internationaux, rejet des prix ambigus ;
- pagination réelle de la série 714 (10 titres sur la page capturée) ;
- refus d’URL externes et non conformes ;
- checkpoint, redémarrage, reprise, historique stable, nouvelle observation au changement de prix ;
- arrêt pendant une requête en cours sans perte du relevé terminé ;
- génération de catalogue autonome, échappement HTML et tri ;
- API : authentification des commandes, CORS autorisé/refusé, progression publique sans file privée ;
- PDF paginé et dédoublonné avec 500 URL.

La compilation TypeScript stricte et la construction de production passent. La variante portable de Rollup (WASM) est fixée dans les dépendances pour éviter une incompatibilité de signature native du Node fourni localement. Aucune modification de logiciel système n’a été faite.

## Interface et exports

Essais dans le navigateur intégré de Codex sur une page locale :

- chargement du relevé de contrôle ;
- sélection d’eBook en plus des formats papier : 3 offres ;
- plafond de 17,71 EUR : uniquement le Softcover du livre de contrôle ;
- taux minimal de 70 % : uniquement ce Softcover ;
- dialogue de catalogues séparés par série ;
- téléchargement effectif du catalogue HTML et du PDF des résultats ;
- aucune erreur console relevée pendant cet essai ;
- viewport simulé de 390 × 844 : largeur du document 390, pas de débordement horizontal ; structure en une colonne.

Le PDF téléchargé dans le navigateur a été relu : il contient le lien correspondant au filtre, pas celui du second livre. L’essai de 500 URL produit 17 pages et une extraction confirme la présence des **500 adresses complètes distinctes**. Les rendus de la première page d’exemple et d’une page intérieure ont été inspectés visuellement. Le PDF d’exemple livré contient seulement les deux vraies adresses de contrôle ; les 500 URL artificielles sont uniquement un essai temporaire.

## Ce qui n’a pas été testé

- Aucun déploiement sur GitHub Pages, hébergement externe ou runner GitHub Actions n’a été effectué ; les workflows et conteneurs sont fournis pour déploiement, pas présentés comme exécutés.
- Aucun crawl intégral des sept séries ; ni exhaustivité des promotions ni stabilité future de la structure Springer ne sont garanties.
- Le script fixed9 et son ancien état ne sont pas accessibles : aucune affirmation de migration complète des séries, de reprise ou d’historique Python.
- Pas de validation du collecteur sur une IP d’hébergement choisie par l’utilisateur. Les prix depuis une IP française locale ne prouvent pas les prix depuis un datacenter étranger.
- Les exécutables de test Chromium, Firefox et WebKit proposés par Playwright ne sont pas installés. Le navigateur intégré a servi pour l’essai réel de l’interface. Pas d’essai physique Android/iPhone et pas de certification Chrome/Edge/Firefox/Safari. L’usage d’API web standard et la mise en page adaptative sont une base de compatibilité ; une recette dans les navigateurs cibles reste nécessaire.
- Pas de test de charge, de concurrence multi-instance ou de conformité d’accessibilité exhaustive. L’application est conçue pour un opérateur, une API, un volume persistant.

Les exemples et la capture utilisent des prix enregistrés, pas une consultation en temps réel lors de l’ouverture du fichier.
