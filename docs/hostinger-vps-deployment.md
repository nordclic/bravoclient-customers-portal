# Deploiement Hostinger VPS

## Architecture cible

Le VPS Hostinger heberge un stack Docker separe pour BravoClient :

- PostgreSQL : base clients
- Directus : back-office admin
- App Next.js : webhooks Stripe et connecteur Climbo
- Traefik Hostinger : HTTPS automatique et reverse proxy

## Prerequis VPS

- Ubuntu 24.04 avec le template Hostinger Docker and Traefik
- Docker et Docker Compose disponibles
- Acces SSH
- Ports 80 et 443 ouverts
- Deux sous-domaines pointant vers le VPS :
  - `cp.bravoclient.co`
  - `dt.bravoclient.co`

## Cloudflare

Pour le premier deploiement, passer temporairement les deux entrees DNS en **DNS only** dans Cloudflare :

```text
cp.bravoclient.co  A  72.62.30.189
dt.bravoclient.co  A  72.62.30.189
```

Si Cloudflare est en mode proxy orange, la resolution publique renvoie des IP Cloudflare. Cela peut fonctionner ensuite, mais complique parfois la creation initiale des certificats Let's Encrypt par Traefik.

Apres validation HTTPS, remettre le proxy Cloudflare si souhaite et utiliser le mode SSL/TLS **Full** ou **Full (strict)**.

## Installation

Sur le VPS :

```bash
mkdir -p /opt/bravoclient
cd /opt/bravoclient
git clone <repo-github> .
cp .env.production.example .env
```

Modifier `.env` avec les vrais secrets.

Verifier aussi `TRAEFIK_CERT_RESOLVER`. Le template Hostinger peut utiliser un nom de resolver different de `letsencrypt`. Si le domaine ne passe pas en HTTPS, c'est le premier champ a controler.

Verifier ensuite le reseau Docker utilise par Traefik :

```bash
docker network ls
```

Creer un reseau Docker partage entre Traefik et BravoClient :

```bash
docker network create bravoclient_proxy
```

Trouver le nom du conteneur Traefik :

```bash
docker ps --format "table {{.Names}}\t{{.Image}}" | grep -i traefik
```

Puis connecter Traefik au reseau, en remplacant `<traefik-container>` :

```bash
docker network connect bravoclient_proxy <traefik-container>
```

Reporter le reseau dans `.env` :

```env
TRAEFIK_NETWORK=bravoclient_proxy
```

Sur d'autres installations Hostinger, le nom peut aussi etre `traefik`, `traefik_default` ou `proxy`. Si ce champ est mauvais, les conteneurs demarrent mais Traefik ne peut pas les router.

Puis lancer :

```bash
docker compose up -d --build
```

## Migrations Prisma

Apres le premier deploiement :

```bash
docker compose exec app npx prisma migrate deploy
```

## URLs

- App : `https://cp.bravoclient.co`
- Directus : `https://dt.bravoclient.co`
- Healthcheck : `https://cp.bravoclient.co/api/health`

## Stripe

Dans Stripe, ajouter le webhook :

```text
https://cp.bravoclient.co/api/webhooks/stripe
```

Evenements minimum :

- `customer.subscription.created`
- `customer.subscription.updated`

## Sauvegardes

Minimum recommande :

- snapshot VPS Hostinger
- dump PostgreSQL quotidien
- sauvegarde externe hebdomadaire

Commande de dump :

```bash
docker compose exec postgres pg_dump -U bravoclient bravoclient > bravoclient.sql
```
