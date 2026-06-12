# Protection Cloudflare

## Objectif

Ajouter une couche Cloudflare devant `cp.bravoclient.co`, en plus de la Basic Auth deja presente dans l'application.

Les webhooks Stripe utilisent un hostname separe :

```text
hooks.bravoclient.co
```

Cela evite de devoir contourner Cloudflare Access sur le meme hostname que le portail.

## DNS

Dans Cloudflare, repasser `cp.bravoclient.co` en mode **Proxied** apres validation HTTPS.

Creer aussi :

```text
hooks.bravoclient.co  A  72.62.30.189
```

`hooks.bravoclient.co` peut rester en **DNS only** au debut. Si le proxy Cloudflare est active plus tard, ne pas lui appliquer Cloudflare Access.

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

Important : ne pas proteger le hostname technique :

```text
hooks.bravoclient.co
```

Stripe doit appeler ce hostname, pas `cp.bravoclient.co`.

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
https://hooks.bravoclient.co/api/webhooks/stripe
```

Stripe doit pouvoir appeler cette URL sans login Cloudflare.
