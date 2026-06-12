# BravoClient AI - Customers Portal

Portail interne pour centraliser les clients BravoClient, synchroniser Stripe et Climbo, puis préparer la migration vers un système propriétaire.

## Stack

- Next.js avec App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma
- Stripe webhooks
- Directus pour le back-office admin
- Docker pour le deploiement VPS Hostinger
- Basic Auth sur le portail `cp.bravoclient.co`

## Demarrage local

1. Copier `.env.example` vers `.env`
2. Lancer PostgreSQL avec Docker :

```bash
docker compose -f docker-compose.local.yml up -d
```

3. Installer les dependances :

```bash
npm install
```

4. Generer Prisma et appliquer la migration :

```bash
npm run prisma:migrate
```

5. Lancer l'application :

```bash
npm run dev
```

## Endpoints

- `GET /api/health`
- `POST /api/webhooks/stripe`

## Notes Climbo

Le connecteur `src/lib/climbo.ts` utilise un endpoint placeholder `/accounts`. Il faudra l'adapter a la documentation API reelle de Climbo.

## Deploiement

Voir `docs/hostinger-vps-deployment.md`.

Pour le gestionnaire Docker Hostinger, voir `docs/hostinger-docker-manager.md`.

Pour la protection Cloudflare, voir `docs/cloudflare-protection.md`.
