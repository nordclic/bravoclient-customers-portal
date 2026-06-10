# Hostinger Docker Manager

Le gestionnaire Docker Hostinger propose plusieurs modes de creation. Pour BravoClient, le choix depend de la facon dont l'image de l'application Next.js est fournie.

## Option recommandee

Utiliser **A partir d'une URL** avec le repository GitHub du projet.

Raison : le service `app` utilise :

```yaml
build:
  context: .
  dockerfile: Dockerfile
```

Hostinger doit donc avoir acces au repository complet pour construire l'image Docker.

## Option manuelle

Le mode **Composer manuellement** fonctionne bien pour Directus et PostgreSQL, mais pas pour l'application Next.js si Hostinger n'a pas les fichiers du projet.

Pour utiliser le mode manuel, il faudrait d'abord publier une image Docker :

```text
ghcr.io/<compte-github>/bravoclient-customers-portal:latest
```

Puis remplacer dans `docker-compose.prod.yml` :

```yaml
build:
  context: .
  dockerfile: Dockerfile
```

par :

```yaml
image: ghcr.io/<compte-github>/bravoclient-customers-portal:latest
```

## Reglages DNS confirmes

Cloudflare doit rester en **DNS only** pour le premier deploiement :

```text
cp.bravoclient.co  A  72.62.30.189
dt.bravoclient.co  A  72.62.30.189
```

## Reglage Traefik confirme

Le VPS Hostinger ne montre pas de reseau Traefik dedie dans `docker network ls`. La configuration actuelle utilise donc :

```env
TRAEFIK_NETWORK=bridge
```
