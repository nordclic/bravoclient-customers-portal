# Architecture BravoClient Customers Portal

## Objectif

Construire une base clients independante de Climbo, connectee a Stripe et synchronisee avec Climbo pendant la periode de transition.

## Choix recommande

Pour la phase 1, le plus rapide et moderne est :

- GitHub pour le code source
- Next.js pour l'interface et les endpoints API
- PostgreSQL pour la base clients
- Prisma pour le modele de donnees et les migrations
- Stripe webhooks pour activer les clients
- Connecteur API Climbo isole dans `src/lib/climbo.ts`
- Docker Compose en local

## Hebergement

### Court terme

Le cloud partage Infomaniak actuel n'est pas ideal pour cette application car il faut executer une app Node.js persistante, recevoir des webhooks Stripe, gerer des variables secretes et faire tourner PostgreSQL.

### Option la plus simple a piloter

Un VPS Hostinger est adapte si tu veux un environnement direct et economique :

- Docker sur le VPS
- Conteneur Next.js
- PostgreSQL dans Docker ou base managée separee
- Reverse proxy Caddy ou Traefik
- Deploiement via GitHub Actions

### Option plus managed

Infomaniak Jelastic Cloud est plus confortable que le cloud partage pour Node.js, Docker et PostgreSQL. C'est souvent preferable si tu veux rester dans l'ecosysteme Infomaniak avec moins d'administration serveur.

## Flux Stripe vers Climbo

1. Le client demarre un trial ou un abonnement Stripe.
2. Stripe appelle `POST /api/webhooks/stripe`.
3. L'application cree ou met a jour le client dans PostgreSQL.
4. L'application appelle le connecteur Climbo.
5. Le statut de synchronisation est stocke dans `Customer.climboSyncStatus`.
6. Les erreurs sont historisees dans `SyncEvent`.

## Migration hors Climbo

La strategie est progressive :

1. Posseder la base clients.
2. Synchroniser les profils et statuts.
3. Exporter et sauvegarder les donnees critiques.
4. Refaire les modules Climbo un par un.
5. Couper la dependance quand le perimetre metier est couvert.
