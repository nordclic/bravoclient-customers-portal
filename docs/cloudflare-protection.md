# Protection Cloudflare

## Objectif

Ajouter une couche Cloudflare devant `cp.bravoclient.co`, en plus de la Basic Auth deja presente dans l'application.

## DNS

Dans Cloudflare, repasser `cp.bravoclient.co` en mode **Proxied** apres validation HTTPS.

Conserver `dt.bravoclient.co` selon le besoin :

- **Proxied** si l'on veut aussi beneficier de Cloudflare devant Directus.
- **DNS only** si un probleme de proxy apparait avec Directus.

## SSL/TLS

Dans Cloudflare :

```text
SSL/TLS mode: Full (strict)
```

Le VPS sert deja HTTPS via Traefik.

## Option recommandee : Cloudflare Access

Creer une application Access pour :

```text
cp.bravoclient.co
```

Politique recommandee :

```text
Action: Allow
Include: Emails
Emails: les adresses autorisees
```

Important : les endpoints techniques doivent rester accessibles aux services externes.

Exclusions a prevoir :

```text
/api/webhooks/stripe
/api/health
```

Si l'interface Access ne permet pas facilement les exclusions par chemin, utiliser une regle WAF a la place.

## Alternative simple : WAF Custom Rule

Creer une regle WAF qui challenge le portail, sauf les endpoints publics :

```text
Hostname equals cp.bravoclient.co
AND URI Path does not start with /api/webhooks/stripe
AND URI Path does not equal /api/health
```

Action :

```text
Managed Challenge
```

Cette option ajoute une friction Cloudflare, mais ne remplace pas une vraie authentification utilisateur. La Basic Auth de l'application reste donc active.

## Notes Stripe

Ne jamais bloquer :

```text
https://cp.bravoclient.co/api/webhooks/stripe
```

Stripe doit pouvoir appeler cette URL sans login Cloudflare.
