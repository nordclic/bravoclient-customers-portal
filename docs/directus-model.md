# Modele Directus

Directus utilisera la meme base PostgreSQL que l'application BravoClient. Pour eviter de dupliquer la logique metier, Directus sert d'interface admin et d'API de consultation, tandis que l'application gere Stripe, Climbo et les operations sensibles.

## Collections initiales

### customers

Correspond au modele Prisma `Customer`.

Champs principaux :

- `companyName`
- `contactName`
- `email`
- `phone`
- `status`
- `plan`
- `trialEndsAt`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `climboAccountId`
- `climboStatus`
- `climboIsActive`
- `climboSyncStatus`
- `climboLastSyncedAt`
- `climboLastCheckedAt`
- `notes`
- `metadata`

### sync_events

Correspond au modele Prisma `SyncEvent`.

Champs principaux :

- `customerId`
- `provider`
- `eventType`
- `status`
- `payload`
- `error`

## Permissions recommandees

### Admin BravoClient

- Lecture/ecriture totale sur `customers`
- Lecture/ecriture totale sur `sync_events`
- Gestion des utilisateurs Directus

### Support BravoClient

- Lecture sur `customers`
- Modification limitee de `notes`, `phone`, `contactName`
- Lecture seule sur `sync_events`

### API Service

- Acces technique reserve a l'application Next.js si une integration Directus directe devient necessaire

## Regle importante

Les champs Stripe et Climbo doivent etre modifies par l'application, pas manuellement dans Directus, sauf intervention de depannage.

## Comparaison Stripe / Climbo

Stripe determine l'etat commercial :

- `TRIAL` et `ACTIVE` doivent correspondre a un compte Climbo actif.
- `CANCELED`, `ARCHIVED` et les statuts non actifs doivent correspondre a un compte Climbo inactif.

La page `/customers` affiche par defaut les clients actifs Stripe et signale les ecarts avec `climboIsActive`.
