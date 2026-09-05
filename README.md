# Pokémon Find

Un jeu web où un numéro du Pokédex national s'affiche et où le joueur doit nommer le
Pokémon correspondant, en 15 secondes, sans indice. Le score récompense la proximité :
répondre un Pokémon dont le numéro est proche de la cible rapporte des points, répondre
exactement juste en rapporte le maximum. Deux façons de jouer : en solo (une partie de
10 manches, ou le défi du jour identique pour tous) ou en multijoueur, dans des rooms
temps réel de 2 à 8 joueurs qui reçoivent le même numéro au même instant.

La spécification complète du jeu (règles, algorithmes, protocole Socket.IO, critères
d'acceptation) est disponible dans
[`docs/superpowers/specs/2026-09-04-pokemon-find-design.md`](docs/superpowers/specs/2026-09-04-pokemon-find-design.md).

## Prérequis

- Node.js 22 ou supérieur
- pnpm 9 (via `corepack enable`, ou installé séparément)
- Docker et Docker Compose, pour le déploiement en conteneur

## Démarrage en développement

```bash
pnpm install
```

Il n'existe pas de script `dev` unique à la racine : lancer le serveur et le front dans
deux terminaux séparés.

```bash
pnpm -F @pkfind/server dev   # serveur + WebSocket, tsx watch
pnpm -F @pkfind/web dev      # front Vite, rechargement à chaud, http://localhost:5173
```

Le front est servi séparément du serveur en développement ; c'est en production, via le
conteneur, que le même processus sert le front construit et le WebSocket sur un seul
port.

## Variables d'environnement

Toutes les variables sont optionnelles ; les valeurs par défaut correspondent à la
spécification. Copier `.env.example` vers `.env` pour les ajuster.

| Variable             | Défaut       | Description                                                                                      |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `PORT`               | `3000`       | Port d'écoute HTTP et WebSocket.                                                                 |
| `NODE_ENV`           | `production` | Environnement Node.                                                                              |
| `LOG_LEVEL`          | `info`       | Niveau de journalisation : `debug`, `info`, `warn` ou `error`.                                   |
| `CORS_ORIGIN`        | _(vide)_     | Vide = même origine uniquement. À ne renseigner que si le front est servi séparément du serveur. |
| `ROUND_REVEAL_MS`    | `6000`       | Durée de la révélation entre deux manches (ms).                                                  |
| `COUNTDOWN_MS`       | `3000`       | Décompte avant la première manche (ms).                                                          |
| `ANSWER_GRACE_MS`    | `1500`       | Tolérance de latence sur la fin de manche (ms).                                                  |
| `RECONNECT_GRACE_MS` | `60000`      | Délai avant de retirer un joueur déconnecté (ms).                                                |
| `ROOM_EMPTY_TTL_MS`  | `300000`     | Délai avant destruction d'une room vide (ms).                                                    |
| `ROOM_MAX_AGE_MS`    | `10800000`   | Durée de vie absolue d'une room (ms).                                                            |
| `MAX_ROOMS`          | `500`        | Nombre de rooms simultanées.                                                                     |

## Déploiement avec Docker

Le conteneur est autonome : un seul processus Node sert le front construit et le
WebSocket sur le même port, sans base de données ni service externe.

```bash
cp .env.example .env
docker compose up -d --build
```

Le jeu est alors accessible sur `http://localhost:3000`. Vérifier l'état du serveur :

```bash
curl http://localhost:3000/healthz
```

qui répond `{"status":"ok","uptimeMs":...,"rooms":...,"players":...}`. Le conteneur
tourne avec l'utilisateur non privilégié `node`, redémarre automatiquement sauf arrêt
explicite (`restart: unless-stopped`), et ses logs sont plafonnés à 3 fichiers de 10 Mo.

Pour arrêter :

```bash
docker compose down
```

## Tests

| Commande         | Portée                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`      | ESLint et vérification du formatage Prettier sur tout le dépôt.                                                                            |
| `pnpm typecheck` | Vérification TypeScript stricte de tous les packages.                                                                                      |
| `pnpm test`      | Tests unitaires et d'intégration Vitest (`packages/shared`, `apps/server`, `apps/web`).                                                    |
| `pnpm test:e2e`  | Tests de bout en bout Playwright, contre le serveur Node en topologie de production (le front construit et le WebSocket sur un seul port). |

`pnpm test:e2e` construit l'application et démarre son propre serveur sur le port 3000 ;
ce port doit être libre avant de le lancer (arrêter un serveur de développement ou un
`docker compose up` en cours).

## Déploiement derrière un reverse proxy (Nginx)

Le WebSocket (Socket.IO) nécessite la propagation des en-têtes de mise à niveau
(`Upgrade`/`Connection`) :

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```
