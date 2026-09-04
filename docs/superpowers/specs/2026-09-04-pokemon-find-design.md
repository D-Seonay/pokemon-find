# Pokémon Find — Cahier des charges

**Version 1.0 — 2026-09-04**

Ce document est la référence unique du projet. Il est écrit pour que deux développeurs
travaillant séparément à partir de lui produisent la même application : chaque règle
chiffrable est chiffrée, chaque algorithme non trivial est donné, chaque cas limite est
tranché. Toute ambiguïté restante est un défaut de ce document, pas une liberté
d'implémentation.

---

## 1. Objectif

Un jeu web où un numéro du Pokédex national s'affiche et où le joueur doit nommer le
Pokémon correspondant, en 15 secondes, sans indice. Le score récompense la proximité :
répondre un Pokémon dont le numéro est proche de la cible rapporte des points, répondre
exactement juste en rapporte le maximum.

Deux façons de jouer :

- **Solo** — une partie de 10 manches, plus un « défi du jour » identique pour tous.
- **Multijoueur** — des rooms temps réel de 2 à 8 joueurs, où tout le monde reçoit le même
  numéro au même instant et où les réponses sont comparées à la fin de chaque manche.

## 2. Périmètre

### 2.1 Dans le périmètre

- Partie solo configurable (générations, durée de manche, nombre de manches).
- Défi du jour déterministe et partageable.
- Rooms multijoueur temps réel avec code de room, lobby, réglages par l'hôte, révélation
  comparative et classement final.
- Autocomplétion des noms de Pokémon en français et en anglais.
- Meilleurs scores solo conservés localement dans le navigateur.
- Interface sombre, responsive, jouable au clavier, du mobile au desktop.
- Déploiement par conteneur Docker autonome.

### 2.2 Hors périmètre (décisions actées, à ne pas implémenter)

- Comptes utilisateurs, inscription, authentification.
- Base de données, persistance côté serveur, classement mondial.
- Chat texte ou vocal dans les rooms.
- Modes équipe, tournoi, ou spectateur.
- Internationalisation de l'interface (l'interface est en français ; seuls les *noms de
  Pokémon* sont acceptés en anglais à la saisie).
- Application mobile native, mode hors-ligne, service worker.
- Sons et musique.

## 3. Glossaire

| Terme | Définition |
|---|---|
| **Cible** | Le numéro national affiché au joueur pour une manche. |
| **Proposition** | Le Pokémon choisi par le joueur pour répondre à une cible. |
| **Écart** | Valeur absolue de la différence entre le numéro de la proposition et la cible. |
| **Pool** | L'ensemble des Pokémon jouables pour une partie, défini par les générations sélectionnées. |
| **Étendue** (*span*) | `maxId − minId + 1` sur le pool. Sert de dénominateur au score. |
| **Manche** (*round*) | Une cible, une réponse, un score. |
| **Partie** (*game*) | Une suite de manches, terminée par un classement. |
| **Room** | Une partie multijoueur identifiée par un code de 4 caractères. |
| **Hôte** | Le joueur qui règle et démarre la partie dans une room. |
| **Slug** | Forme normalisée d'un nom, utilisée pour la comparaison. |

---

## 4. Données Pokémon

### 4.1 Schéma

Le jeu s'appuie sur un fichier `packages/shared/src/data/pokemon.json`, versionné dans le
dépôt. C'est un tableau JSON trié par `id` croissant, contenant exactement 1025 entrées
(numéros nationaux 1 à 1025, sans trou).

```ts
type Pokemon = {
  id: number;          // numéro national, 1..1025, unique, sans trou dans la série
  nameFr: string;      // nom d'affichage français, ex. "Pikachu", "M. Mime"
  nameEn: string;      // nom d'affichage anglais, ex. "Pikachu", "Mr. Mime"
  slugFr: string;      // normalizeName(nameFr)
  slugEn: string;      // normalizeName(nameEn)
  generation: number;  // 1..9
  spriteUrl: string;   // URL absolue de l'artwork officiel
};
```

`spriteUrl` pointe vers l'artwork officiel hébergé par le dépôt public de PokeAPI :

```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png
```

Les images sont donc chargées depuis un CDN externe au runtime ; seules les **données
textuelles** sont locales. Le jeu reste jouable si les images ne chargent pas : chaque
`<img>` a un `onError` qui affiche à la place une pastille avec l'initiale du Pokémon.

### 4.2 Bornes de générations

Ces bornes sont normatives et servent à construire les pools sans relire le dataset :

| Gén | Premier id | Dernier id | Nombre |
|---:|---:|---:|---:|
| 1 | 1 | 151 | 151 |
| 2 | 152 | 251 | 100 |
| 3 | 252 | 386 | 135 |
| 4 | 387 | 493 | 107 |
| 5 | 494 | 649 | 156 |
| 6 | 650 | 721 | 72 |
| 7 | 722 | 809 | 88 |
| 8 | 810 | 905 | 96 |
| 9 | 906 | 1025 | 120 |

### 4.3 Script d'import

`scripts/build-dataset.ts`, exécuté manuellement via `pnpm dataset:build`, régénère
`pokemon.json`. Il n'est **jamais** appelé au build ni au runtime de l'application.

Comportement :

1. Pour `id` de 1 à 1025, récupérer `https://pokeapi.co/api/v2/pokemon-species/{id}`.
2. `nameFr` = l'entrée `names[]` dont `language.name === "fr"`. `nameEn` = celle dont
   `language.name === "en"`. Si `fr` est absente, retomber sur la valeur anglaise et
   journaliser un avertissement.
3. `generation` = déduite des bornes du tableau 4.2 à partir de l'`id` (et non du champ
   `generation` de l'API, pour garantir la cohérence avec les pools).
4. `slugFr` / `slugEn` = `normalizeName()` appliqué aux noms (section 6.1).
5. Écrire le JSON indenté de 2 espaces, tableau trié par `id`.
6. Limiter la cadence à 10 requêtes par seconde, avec 3 tentatives et un back-off
   exponentiel (1 s, 2 s, 4 s) sur erreur réseau ou HTTP 5xx.
7. Échouer en sortie non nulle si le résultat ne contient pas exactement 1025 entrées, si
   un `id` manque, ou si deux entrées produisent le même `slugFr`.

Un test de validation du dataset (`packages/shared/src/data/pokemon.test.ts`) rejoue ces
invariants sur le fichier versionné, à chaque exécution de la suite de tests.

### 4.4 Cas particuliers de noms

Ces cas doivent être couverts par des tests explicites, car ils cassent une normalisation
naïve :

| `nameFr` | `slugFr` | Piège |
|---|---|---|
| Nidoran♀ (#29) | `nidoranf` | Caractère de genre. |
| Nidoran♂ (#32) | `nidoranm` | Idem, doit se distinguer du précédent. |
| M. Mime (#122) | `mmime` | Point et espace. |
| Canarticho (#83) — `nameEn` Farfetch'd | `farfetchd` | Apostrophe droite ou typographique. |
| Ho-Oh (#250) | `hooh` | Trait d'union. |
| Porygon-Z (#474) | `porygonz` | Trait d'union et lettre isolée. |
| Type:0 (#772) | `type0` | Deux-points et chiffre. |
| Tapu Koko (#785) | `tapukoko` | Espace. |
| Mime Jr. (#439) | `mimejr` | Point final. |
| Étourmi (#396) | `etourmi` | Accent en tête de nom. |

---

## 5. Règles du jeu

### 5.1 Pool

Le pool est défini par une liste de générations : `generations: number[]`, valeurs uniques
comprises entre 1 et 9, au moins une, triées croissant. Le pool national correspond aux
neuf générations sélectionnées.

- `poolIds` = tous les `id` des générations retenues, triés croissant.
- `minId` = le plus petit `id` du pool, `maxId` le plus grand.
- `span` = `maxId − minId + 1`.

Pour des générations contiguës, `span` égale le nombre de Pokémon ; pour une sélection
discontinue (par exemple 1 et 5), `span` couvre l'intervalle complet, ce qui rend le score
cohérent avec les écarts réellement possibles.

**Restriction stricte** : les cibles comme les propositions appartiennent au pool.
L'autocomplétion ne propose que des Pokémon du pool, et le serveur rejette toute
proposition hors pool (`NOT_IN_POOL`).

### 5.2 Tirage des cibles

Le tirage se fait sans remise : une même cible ne peut pas sortir deux fois dans une même
partie. Si `roundCount > poolIds.length`, le nombre de manches est ramené à
`poolIds.length` (cas théorique : le plus petit pool, la Gén 6, compte 72 Pokémon).

L'algorithme est normatif — deux implémentations doivent produire la même série pour la
même graine.

```ts
// Hachage FNV-1a 32 bits
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;               // 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);   // 16777619
  }
  return h >>> 0;
}

// PRNG mulberry32
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tirage sans remise : Fisher-Yates partiel
function pickTargets(poolIds: number[], count: number, rng: () => number): number[] {
  const a = [...poolIds];                     // poolIds est trié croissant
  const n = Math.min(count, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
```

L'appel se fait toujours par `pickTargets(poolIds, roundCount, mulberry32(fnv1a32(seed)))`.

Graines selon le mode :

| Mode | Graine |
|---|---|
| Solo classique | `solo:` + 16 caractères hexadécimaux aléatoires (`crypto.getRandomValues`) |
| Défi du jour | `daily:YYYY-MM-DD` — date **UTC** du jour |
| Multijoueur | `room:{CODE}:{gameId}` — `gameId` = UUID v4 régénéré à chaque partie de la room |

### 5.3 Score

```ts
const MAX_SCORE = 1000;
const DECAY = 10;

function scoreForAnswer(targetId: number, answerId: number | null, span: number): number {
  if (answerId === null) return 0;                 // pas de réponse ou temps écoulé
  const gap = Math.abs(answerId - targetId);
  return Math.round(MAX_SCORE * Math.exp((-DECAY * gap) / span));
}
```

Valeurs de référence, à figer dans les tests :

| Pool | span | écart 0 | 1 | 5 | 15 | 50 | 100 | 400 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gén 1 | 151 | 1000 | 936 | 718 | 370 | 36 | 1 | 0 |
| National | 1025 | 1000 | 990 | 952 | 864 | 614 | 377 | 20 |

Le score d'une partie est la somme des scores de manche. Le maximum théorique d'une partie
de 10 manches est donc 10 000.

### 5.4 Chrono

- Durées proposées : **10 s**, **15 s** (défaut), **25 s**. Aucune autre valeur n'est
  acceptée par le serveur.
- Le décompte est affiché sous forme d'anneau et de secondes entières arrondies vers le
  haut (`ceil`), donc de `15` à `0`.
- Une réponse validée arrête la manche pour ce joueur ; il attend alors les autres (en
  multi) ou passe à la révélation (en solo).
- Une manche sans réponse vaut 0 point et s'affiche « — (temps écoulé) ».

### 5.5 Nombre de manches

`roundCount` ∈ {5, 10, 15}, défaut **10**. Le défi du jour est figé à 10.

---

## 6. Saisie du nom

### 6.1 Normalisation

`normalizeName()` est utilisée à la fois pour construire les slugs du dataset et pour
normaliser la saisie du joueur. Elle est définie une seule fois dans `packages/shared` et
son comportement est normatif :

```ts
export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // retire les diacritiques combinants
    .replace(/\u2640/g, "f")           // signe femelle
    .replace(/\u2642/g, "m")           // signe male
    .replace(/[^a-z0-9]/g, "");        // retire espaces, points, tirets, apostrophes
}
```

Exemples normatifs : `"  Pikachu "` → `pikachu` ; `"M. Mime"` → `mmime` ;
`"Nidoran♀"` → `nidoranf` ; `"Ho-Oh"` → `hooh` ; `"Farfetch'd"` → `farfetchd` ;
`"Étourmi"` → `etourmi` ; `"Type:0"` → `type0`.

Aucune tolérance aux fautes de frappe n'est implémentée : la sélection passe
obligatoirement par l'autocomplétion, ce qui rend la distance d'édition inutile.

### 6.2 Autocomplétion

- Se déclenche dès **1 caractère** saisi. En dessous, la liste est fermée.
- La recherche se fait sur `slugFr` et `slugEn` des Pokémon **du pool uniquement**.
- Un Pokémon correspond si son `slugFr` ou son `slugEn` **contient** la requête normalisée.
- Tri des résultats, dans cet ordre :
  1. Préfixe sur `slugFr`
  2. Préfixe sur `slugEn`
  3. Sous-chaîne sur `slugFr`
  4. Sous-chaîne sur `slugEn`
  5. À rang égal, `id` croissant
- **Maximum 8 résultats affichés.**
- Chaque suggestion affiche : sprite miniature 32 px, `nameFr`, et `nameEn` en gris clair
  si différent de `nameFr`.
- **Le numéro national n'est jamais affiché dans les suggestions.** C'est la réponse au
  jeu ; l'afficher rendrait la partie triviale. Cette règle vaut aussi pour les attributs
  `title`, `alt`, `aria-label` et les URL de sprite visibles dans le DOM : la clé React et
  les identifiants d'options utilisent l'`id`, mais aucun texte lisible ni infobulle ne
  doit le contenir.
- La validation exige qu'un Pokémon soit **sélectionné**, et la sélection se fait de deux
  façons seulement : par clic ou `Entrée` sur une suggestion, ou par auto-sélection. Cette
  auto-sélection se déclenche au `blur` du champ et à la première `Entrée` : si la saisie
  normalisée est **égale** au `slugFr` ou au `slugEn` d'un unique Pokémon du pool, ce
  Pokémon est sélectionné. Dans tout autre cas — saisie partielle, saisie ambiguë, saisie
  hors pool — aucune sélection n'a lieu et le bouton de validation reste désactivé.
- Après validation, le champ est vidé et désactivé jusqu'à la manche suivante.

### 6.3 Clavier

| Touche | Effet |
|---|---|
| Caractère | Filtre et ouvre la liste |
| `↓` / `↑` | Déplace la sélection active, boucle aux extrémités |
| `Entrée` | Sélectionne la suggestion active ; si un Pokémon est déjà sélectionné, valide la réponse |
| `Échap` | Ferme la liste sans effacer la saisie ; une seconde pression efface la saisie |
| `Tab` | Ferme la liste et sort du champ |

Le champ garde le focus automatiquement au début de chaque manche.

---

## 7. Mode solo

### 7.1 Partie classique

Écran de configuration : cases à cocher des générations 1 à 9 (défaut : Gén 1 seule, plus
un bouton « Tout sélectionner »), durée de manche, nombre de manches. Le bouton « Lancer »
est désactivé si aucune génération n'est cochée.

Déroulement d'une manche : affichage de la cible et démarrage du chrono → réponse ou
expiration → écran de résultat de manche pendant **3 secondes**, avec possibilité de
passer immédiatement par un clic ou la touche `Entrée` → manche suivante.

L'écran de résultat de manche affiche : le sprite et le nom du Pokémon cible, la réponse
donnée, l'écart, les points gagnés, et le score cumulé.

Tout se déroule dans le navigateur : le serveur n'est pas sollicité en solo.

### 7.2 Écran final

Récapitulatif des manches sous forme de tableau (numéro cible, Pokémon cible, réponse,
écart, points), score total, comparaison au meilleur score enregistré pour ce pool, et deux
boutons : « Rejouer » (même configuration, nouvelle graine) et « Changer les réglages ».

### 7.3 Meilleurs scores locaux

Stockés dans `localStorage` sous la clé `pkfind.best.v1`, sous la forme d'un objet dont les
clés sont la signature du pool (`generations` triées et jointes par `-`, par exemple
`1` ou `1-3-5`) concaténée à la durée et au nombre de manches :

```json
{ "1|15000|10": { "score": 7420, "date": "2026-09-04T18:22:11.000Z" } }
```

Une entrée n'est mise à jour que si le nouveau score est strictement supérieur. Toute
erreur de lecture ou d'écriture (mode privé, quota) est avalée silencieusement : le jeu
fonctionne sans stockage.

### 7.4 Défi du jour

- Pool national, chrono 15 s, 10 manches, graine `daily:YYYY-MM-DD` en UTC.
- Une seule tentative par jour et par navigateur, mémorisée dans `localStorage` sous
  `pkfind.daily.v1` : `{ "date": "2026-09-04", "score": 6810, "tiers": [4,3,2,...] }`.
  Si une entrée existe pour la date du jour, l'écran affiche directement le résultat
  précédent au lieu de relancer une partie. C'est un système d'honneur : sans comptes, il
  n'y a rien à contourner de plus qu'un vidage du stockage, et c'est accepté.
- Résumé partageable copié dans le presse-papiers via `navigator.clipboard.writeText`,
  avec repli sur une zone de texte sélectionnée si l'API est indisponible :

```
Pokémon Find — 2026-09-04
7 842 / 10 000
🟦🟩🟨⬛🟩🟦🟨⬛🟧🟩
https://<hôte>/daily
```

Les paliers de couleur par manche sont normatifs :

| Points | Symbole |
|---|---|
| = 1000 | 🟦 |
| ≥ 700 | 🟩 |
| ≥ 400 | 🟨 |
| ≥ 150 | 🟧 |
| < 150 | ⬛ |

---

## 8. Mode multijoueur

### 8.1 Principe

Le serveur est **autoritaire** : il tire les cibles, ouvre et ferme les manches, horodate
les réponses et calcule les scores. Le client n'affiche que ce que le serveur lui envoie et
ne calcule aucun score qui compte. Tout l'état vit en mémoire dans le processus serveur ;
un redémarrage détruit les rooms en cours, et c'est accepté.

### 8.2 Codes de room

- 4 caractères tirés de l'alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symboles ; ni
  `I`, ni `O`, ni `0`, ni `1`, pour éviter les confusions à l'oral et à la lecture).
- Générés avec `crypto.randomInt`. En cas de collision avec une room vivante, on
  régénère, jusqu'à 10 fois, puis on renvoie l'erreur `CODE_EXHAUSTED`.
- La saisie d'un code par un joueur est insensible à la casse et les espaces sont ignorés.
  Tout caractère hors alphabet — `I`, `O`, `0`, `1` compris — provoque un rejet avec le
  message « Ce code contient un caractère invalide ». Aucune correspondance approximative
  n'est tentée : `0` n'est pas interprété comme `O`.

### 8.3 Pseudos

- Après `trim`, longueur entre 2 et 16 caractères, correspondant à
  `/^[\p{L}\p{N} _.\-]{2,16}$/u`. Sinon : `INVALID_NICKNAME`.
- En cas de doublon dans une room, le serveur suffixe ` (2)`, ` (3)`, etc., et renvoie au
  client le pseudo effectivement retenu.
- Le pseudo est mémorisé dans `localStorage` sous `pkfind.nickname.v1` et pré-rempli.

### 8.4 Machine à états d'une room

```
lobby ──room:start──▶ countdown ──(3 s)──▶ round ──┬──(chrono écoulé)──────┐
  ▲                                                └──(tous ont répondu)───┤
  │                                                                        ▼
  └────────room:playAgain───── finished ◀──(dernière manche)──── reveal (6 s)
                                                                        │
                                                     (manche suivante) ──┘
```

| État | Description |
|---|---|
| `lobby` | Les joueurs arrivent, l'hôte règle la partie. |
| `countdown` | Décompte de 3 secondes avant la première manche. |
| `round` | La cible est affichée, le chrono tourne, les réponses sont acceptées. |
| `reveal` | 6 secondes de tableau comparatif, puis manche suivante ou fin. |
| `finished` | Classement final ; l'hôte peut relancer, ce qui ramène au lobby. |

Seul l'hôte peut modifier les réglages, démarrer et relancer. Les réglages sont verrouillés
hors de l'état `lobby`.

### 8.5 Déroulement d'une manche

1. Le serveur émet `round:start` avec `targetId`, `endsAt` et `serverNow`. Le client
   calcule `remaining = endsAt − serverNow` **à la réception** et fait tourner un décompte
   local ; aucune synchronisation d'horloge n'est nécessaire entre client et serveur.
2. Chaque joueur envoie au plus un `round:answer`. Le serveur accepte la réponse si :
   `status === "round"`, `roundIndex` correspond, le joueur n'a pas déjà répondu,
   `pokemonId` appartient au pool, et `Date.now() ≤ roundStartedAt + roundDurationMs +
   GRACE_MS` (avec `GRACE_MS = 1500`, pour ne pas pénaliser la latence réseau).
3. `responseTimeMs` = `min(Date.now() − roundStartedAt, roundDurationMs)`.
4. À chaque réponse acceptée, le serveur diffuse `round:answered { playerId }` — les autres
   voient qui a déjà répondu, **jamais quoi**.
5. La manche se termine dès que le chrono expire, ou 400 ms après que tous les joueurs
   connectés ont répondu.
6. Le serveur émet `round:reveal` avec le Pokémon cible complet, le détail par joueur et le
   classement mis à jour, plus `revealEndsAt`. Après 6 secondes, il enchaîne sur la manche
   suivante ou émet `game:end`.

### 8.6 Classement et départage

Le classement trie par, dans l'ordre :

1. Score total **décroissant**
2. Temps de réponse cumulé **croissant** (une manche sans réponse compte pour
   `roundDurationMs`)
3. Pseudo par ordre alphabétique (`localeCompare` en `fr`), pour garantir un ordre stable

Une égalité parfaite sur les trois critères est impossible, les pseudos étant uniques dans
une room. Les rangs sont attribués en compétition standard : deux joueurs à égalité sur les
deux premiers critères partagent le même `rank` affiché, mais restent ordonnés.

### 8.7 Déconnexion, reconnexion, hôte

- À la connexion, le serveur renvoie un `playerId` (UUID v4) et un `playerToken` (32
  caractères hexadécimaux aléatoires). Le client les stocke dans `sessionStorage` sous
  `pkfind.session.v1` avec le code de room.
- Une déconnexion marque le joueur `connected: false` sans le supprimer. Il conserve son
  score, et les manches qu'il rate valent 0.
- `room:rejoin` avec le bon `playerId` **et** le bon `playerToken` restaure la place du
  joueur, y compris en pleine partie. Le token empêche l'usurpation d'un `playerId` deviné.
- Passé `RECONNECT_GRACE_MS` (60 000 ms) hors ligne, le joueur est retiré de la room. S'il
  était le dernier, la room entre en compte à rebours de destruction.
- Si l'hôte se déconnecte, le rôle passe immédiatement au joueur connecté le plus
  anciennement arrivé. Si l'hôte d'origine revient, il ne le redevient pas.
- Si le nombre de joueurs connectés tombe à 1 pendant une partie, la partie continue : le
  joueur restant termine seul. Si elle tombe à 0, la partie est abandonnée et la room passe
  en `lobby`.

### 8.8 Limites et garde-fous

| Paramètre | Valeur |
|---|---|
| Joueurs par room | 2 minimum pour démarrer, 8 maximum |
| Rooms simultanées par processus | 500 (au-delà : `SERVER_BUSY`) |
| Durée de vie d'une room vide | 5 minutes |
| Durée de vie absolue d'une room | 3 heures |
| Débit par socket | 20 événements par 10 secondes |
| Dépassements de débit avant déconnexion | 3 |
| Taille maximale d'un message entrant | 4 Ko |

Rejoindre une room dont le `status` n'est pas `lobby` est refusé avec
`GAME_IN_PROGRESS` — on n'entre pas en cours de partie. Il faut attendre la fin, ou l'hôte
relance depuis le lobby.

---

## 9. Protocole Socket.IO

Les types sont définis dans `packages/shared/src/protocol/events.ts` et utilisés par les
génériques `Server<ClientToServerEvents, ServerToClientEvents>` et
`Socket<ServerToClientEvents, ClientToServerEvents>` : le contrat est donc vérifié à la
compilation des deux côtés.

### 9.1 Types partagés

```ts
export type GameSettings = {
  generations: number[];                  // 1..9, uniques, triées, au moins une
  roundDurationMs: 10000 | 15000 | 25000;
  roundCount: 5 | 10 | 15;
};

export type RoomStatus = "lobby" | "countdown" | "round" | "reveal" | "finished";

export type PlayerPublic = {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  hasAnswered: boolean;                   // pour la manche en cours
};

export type RoomState = {
  code: string;
  status: RoomStatus;
  settings: GameSettings;
  players: PlayerPublic[];                // ordre d'arrivée
  roundIndex: number;                     // -1 hors partie, sinon 0-based
  roundCount: number;
};

export type RoundResult = {
  playerId: string;
  nickname: string;
  pokemonId: number | null;               // null = pas de réponse
  gap: number | null;
  points: number;
  responseTimeMs: number | null;
};

export type Standing = {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  totalResponseTimeMs: number;
};

export type Ack<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };
```

### 9.2 Client → serveur

| Événement | Charge utile | Réponse (ack) | Contraintes |
|---|---|---|---|
| `room:create` | `{ nickname, settings }` | `{ roomCode, playerId, playerToken, state }` | pseudo et réglages valides |
| `room:join` | `{ roomCode, nickname }` | `{ roomCode, playerId, playerToken, state }` | room en `lobby`, non pleine |
| `room:rejoin` | `{ roomCode, playerId, playerToken }` | `{ state }` | token correspondant |
| `room:leave` | `{}` | `{}` | — |
| `room:settings` | `{ settings }` | `{ state }` | hôte, état `lobby` |
| `room:start` | `{}` | `{}` | hôte, état `lobby`, ≥ 2 joueurs connectés |
| `room:playAgain` | `{}` | `{ state }` | hôte, état `finished` |
| `round:answer` | `{ roundIndex, pokemonId }` | `{ accepted: true }` | voir 8.5, point 2 |

### 9.3 Serveur → client

| Événement | Charge utile | Quand |
|---|---|---|
| `room:state` | `RoomState` | à chaque changement d'effectif, de réglages ou d'état |
| `game:countdown` | `{ startsAt, serverNow }` | au démarrage, avant la manche 1 |
| `round:start` | `{ roundIndex, roundCount, targetId, endsAt, serverNow }` | ouverture d'une manche |
| `round:answered` | `{ playerId }` | une réponse a été acceptée |
| `round:reveal` | `{ roundIndex, target: Pokemon, results: RoundResult[], standings: Standing[], revealEndsAt, serverNow }` | fin d'une manche |
| `game:end` | `{ standings: Standing[], history: RoundResult[][] }` | après la dernière révélation |
| `room:closed` | `{ reason: "expired" \| "empty" \| "shutdown" }` | destruction de la room |

`round:start` ne contient **que** le numéro cible, jamais le nom ni le sprite du Pokémon
cible : ils n'arrivent qu'avec `round:reveal`. Un joueur qui inspecte le trafic réseau ne
doit pas pouvoir lire la réponse avant la révélation.

### 9.4 Codes d'erreur

`ROOM_NOT_FOUND`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `NOT_HOST`, `NOT_IN_ROOM`,
`INVALID_NICKNAME`, `INVALID_SETTINGS`, `INVALID_CODE`, `ALREADY_ANSWERED`,
`ROUND_CLOSED`, `NOT_IN_POOL`, `INVALID_TOKEN`, `RATE_LIMITED`, `SERVER_BUSY`,
`CODE_EXHAUSTED`, `INTERNAL`.

Chaque code est associé à un message français affichable tel quel par le client, défini
dans `packages/shared/src/protocol/events.ts` — le client n'invente aucun message d'erreur.

---

## 10. Architecture technique

### 10.1 Choix structurants

Monorepo pnpm à trois paquets. Le paquet `shared` contient toute la logique de jeu — score,
normalisation, tirage, validation des réglages, types du protocole — et est consommé à
l'identique par le front et par le serveur. C'est ce qui garantit qu'une manche solo et une
manche multi obéissent exactement aux mêmes règles, et qu'un changement de formule ne peut
pas diverger entre les deux côtés.

En production, un **unique processus Node** sert le front statique et le WebSocket sur le
même port. Front et serveur partagent donc l'origine : aucune configuration CORS n'est
nécessaire, et le client se connecte à Socket.IO sans URL absolue.

### 10.2 Versions

| Outil | Version minimale |
|---|---|
| Node.js | 22 LTS |
| pnpm | 9 |
| TypeScript | 5.6 |
| React | 19 |
| Vite | 6 |
| Tailwind CSS | 4 |
| React Router | 7 |
| Express | 4.21 |
| Socket.IO / socket.io-client | 4.8 |
| Vitest | 2 |
| Testing Library (React) | 16 |
| Playwright | 1.48 |

TypeScript est en `strict: true`, avec `noUncheckedIndexedAccess` et
`exactOptionalPropertyTypes`. ESLint et Prettier sont configurés à la racine et appliqués
aux trois paquets.

### 10.3 Arborescence

```
pokemon-find/
├─ package.json                    scripts racine
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.js
├─ Dockerfile
├─ docker-compose.yml
├─ .dockerignore
├─ .env.example
├─ README.md
├─ scripts/
│  └─ build-dataset.ts             import PokeAPI → pokemon.json (manuel)
├─ packages/shared/                @pkfind/shared
│  └─ src/
│     ├─ index.ts                  ré-exports publics
│     ├─ data/pokemon.json         1025 entrées, versionné
│     ├─ data/pokemon.ts           chargement typé, index par id, index par génération
│     ├─ domain/generations.ts     bornes normatives du tableau 4.2
│     ├─ domain/pool.ts            buildPool(generations) → { ids, minId, maxId, span }
│     ├─ domain/score.ts           scoreForAnswer, MAX_SCORE, DECAY
│     ├─ domain/random.ts          fnv1a32, mulberry32, pickTargets
│     ├─ domain/names.ts           normalizeName, searchPokemon(query, pool, limit)
│     ├─ domain/settings.ts        DEFAULT_SETTINGS, validateSettings
│     ├─ domain/daily.ts           dailySeed(date), shareText(results)
│     └─ protocol/events.ts        types d'événements, ErrorCode, messages
├─ apps/server/                    @pkfind/server
│  └─ src/
│     ├─ index.ts                  bootstrap : config → http → socket → arrêt propre
│     ├─ config.ts                 lecture et validation des variables d'environnement
│     ├─ http.ts                   /healthz, statique du front, fallback SPA
│     ├─ log.ts                    journalisation structurée (JSON, niveaux)
│     ├─ rooms/codes.ts            génération et normalisation des codes
│     ├─ rooms/Room.ts             machine à états, timers, scoring, sérialisation
│     ├─ rooms/RoomStore.ts        Map<code, Room>, création, recherche, purge
│     ├─ socket/handlers.ts        branchement des événements client → Room
│     └─ socket/rateLimit.ts       compteur glissant par socket
└─ apps/web/                       @pkfind/web
   ├─ index.html
   ├─ vite.config.ts
   └─ src/
      ├─ main.tsx
      ├─ App.tsx                   routes
      ├─ styles/tokens.css         variables de design
      ├─ pages/Home.tsx
      ├─ pages/SoloSetup.tsx
      ├─ pages/SoloGame.tsx
      ├─ pages/Daily.tsx
      ├─ pages/JoinRoom.tsx
      ├─ pages/Room.tsx
      ├─ game/useSoloGame.ts       machine à états solo (identique en règles au serveur)
      ├─ net/socket.ts             singleton socket.io-client, typé
      ├─ net/useRoom.ts            hook d'abonnement à l'état de room
      ├─ storage/local.ts          accès localStorage/sessionStorage tolérants aux erreurs
      └─ components/
         ├─ TargetNumber.tsx
         ├─ Timer.tsx
         ├─ PokemonCombobox.tsx
         ├─ PokemonSprite.tsx
         ├─ RoundResult.tsx
         ├─ Scoreboard.tsx
         ├─ GenerationPicker.tsx
         └─ Button.tsx
```

### 10.4 Scripts racine

| Script | Effet |
|---|---|
| `pnpm dev` | Lance en parallèle le serveur (`tsx watch`, port 3000) et Vite (port 5173, proxy `/socket.io` vers 3000) |
| `pnpm build` | Compile `shared`, puis `web` (Vite), puis `server` (tsc) |
| `pnpm test` | Vitest sur les trois paquets |
| `pnpm test:e2e` | Playwright |
| `pnpm lint` | ESLint + vérification Prettier |
| `pnpm typecheck` | `tsc --noEmit` sur les trois paquets |
| `pnpm dataset:build` | Régénère `pokemon.json` (manuel, réseau requis) |

### 10.5 API HTTP

| Route | Méthode | Réponse |
|---|---|---|
| `/healthz` | GET | `200 { status: "ok", uptimeMs, rooms, players }` |
| `/socket.io/*` | — | géré par Socket.IO |
| `/assets/*` | GET | fichiers statiques du build front, `Cache-Control: public, max-age=31536000, immutable` |
| toute autre route | GET | `index.html`, `Cache-Control: no-cache` (fallback SPA) |

Aucune autre API HTTP n'existe : le jeu passe intégralement par le WebSocket.

---

## 11. Interface

### 11.1 Routes

| Route | Écran |
|---|---|
| `/` | Accueil : pseudo, et quatre entrées — Solo, Défi du jour, Créer une room, Rejoindre |
| `/solo` | Configuration de la partie solo |
| `/solo/play` | Partie solo en cours (redirige vers `/solo` si aucun état en mémoire) |
| `/daily` | Défi du jour (ou son résultat si déjà joué aujourd'hui) |
| `/join` | Saisie d'un code de room |
| `/room/:code` | Lobby, partie et classement final d'une room |

L'état d'une partie solo vit en mémoire React et n'est pas persisté : un rechargement de
page abandonne la partie en cours. Un `beforeunload` avertit le joueur.

### 11.2 Design system

Direction : sombre, net, typographie forte, animations brèves. Le numéro cible est
l'élément dominant de l'écran de jeu.

```css
:root {
  --bg:        #0A0B0F;
  --surface:   #14161D;
  --surface-2: #1D202A;
  --border:    #2A2E3A;
  --text:      #E8EAF0;
  --text-dim:  #9AA0AE;
  --accent:    #FFCB05;  /* jaune Pokémon — actions principales, numéro cible */
  --accent-2:  #3D7BFF;  /* bleu — réponse exacte, éléments multijoueur */
  --success:   #35D07F;
  --warn:      #FFB020;
  --danger:    #FF4D5E;
  --radius:    14px;
  --radius-sm: 8px;
}
```

Typographie, chargée depuis Google Fonts avec repli système :

- Interface : `Outfit`, graisses 400 / 600 / 800, repli
  `ui-sans-serif, system-ui, sans-serif`.
- Chiffres (numéro cible, chrono, scores) : `Space Mono` graisse 700, repli
  `ui-monospace, monospace`, avec `font-variant-numeric: tabular-nums`.

Échelle d'espacement : multiples de 4 px. Rayon des cartes : 14 px. Bordure de 1 px en
`--border` sur toutes les surfaces.

### 11.3 Écran de jeu

Disposition verticale centrée, largeur maximale 560 px :

1. Bandeau : `Manche 3 / 10` à gauche, score cumulé à droite.
2. Chrono : anneau SVG de 44 px avec le nombre de secondes au centre. L'anneau se vide dans
   le sens horaire. Il passe en `--warn` sous 5 s et en `--danger` sous 2 s, avec une
   pulsation de 600 ms.
3. Numéro cible : `TargetNumber`, taille `clamp(4rem, 18vw, 10rem)`, couleur `--accent`,
   `tabular-nums`, précédé d'un `#` en `--text-dim` à 40 % de la taille. Complété par des
   zéros de tête sur 3 chiffres si `maxId ≤ 999`, sinon 4 : `#025`, `#0782`.
4. Champ de réponse : `PokemonCombobox`, pleine largeur, hauteur 56 px.
5. Bouton « Valider », pleine largeur, désactivé tant qu'aucun Pokémon n'est sélectionné.
6. En multi uniquement : une rangée de pastilles de joueurs, celles des joueurs ayant déjà
   répondu passant en `--success`.

### 11.4 Écran de résultat de manche

- **Solo** : sprite de la cible en 160 px, nom, `#numéro`, la réponse donnée, l'écart et
  les points en gros. Fond `--success` à faible opacité si écart ≤ 3, `--accent-2` si
  exact, neutre sinon. Dure 3 secondes, avec une barre de progression et un passage
  immédiat au clic ou à `Entrée`.
- **Multi** : même en-tête, puis un tableau trié par points décroissants — pseudo, Pokémon
  proposé (sprite 28 px + nom), écart, points, et le delta de score cumulé. Les lignes
  apparaissent en cascade sur 600 ms. Dure 6 secondes, sans possibilité de passer.

En multijoueur, le client construit son pool localement avec `buildPool(settings.generations)`
à partir du `RoomState` reçu, et s'en sert pour l'autocomplétion. Le serveur revalide
systématiquement l'appartenance au pool à la réception d'une réponse : le client n'est
jamais la source de vérité.

### 11.5 Lobby de room

Code de room en très gros caractères espacés, avec un bouton « Copier le lien » qui copie
`https://<hôte>/room/<CODE>`. Liste des joueurs avec pastille de connexion et couronne pour
l'hôte. Panneau de réglages — sélecteur de générations, durée, nombre de manches — éditable
uniquement par l'hôte, affiché en lecture seule pour les autres. Bouton « Démarrer »,
désactivé avec un motif explicite en dessous s'il manque des joueurs.

### 11.6 Responsive

Un seul point de rupture, à 640 px. En dessous : marges de 16 px, numéro cible réduit par
le `clamp`, tableau de révélation qui masque la colonne du delta et empile pseudo et
Pokémon. La liste d'autocomplétion s'affiche au-dessus du champ si l'espace en dessous est
insuffisant.

### 11.7 Accessibilité

- L'autocomplétion suit le motif ARIA *combobox* : `role="combobox"`,
  `aria-expanded`, `aria-controls`, `aria-activedescendant`, liste en `role="listbox"`,
  éléments en `role="option"` avec `aria-selected`.
- Le résultat de chaque manche est annoncé dans une région `aria-live="polite"` :
  « Manche 3, cible 143, Ronflex. Votre réponse : Rhinocorne, écart 32, 340 points. »
- Le chrono n'est pas dans une région live (trop bavard) ; un texte
  `aria-live="assertive"` annonce uniquement « 5 secondes restantes ».
- Contraste minimum AA (4,5:1) sur tout le texte. `--accent` sur `--bg` et `--text` sur
  `--surface` sont vérifiés.
- Focus visible sur tous les éléments interactifs : contour de 2 px en `--accent-2`,
  décalé de 2 px.
- `@media (prefers-reduced-motion: reduce)` supprime les cascades, pulsations et
  transitions ; les durées d'affichage restent inchangées.
- Le jeu est intégralement jouable au clavier, sans souris.

---

## 12. Tests

La logique de jeu vit dans `shared` : c'est là que se concentre l'effort de test, et c'est
elle qui rend deux implémentations comparables.

### 12.1 `packages/shared` (Vitest, unitaires)

**Dataset** — 1025 entrées ; `id` de 1 à 1025 sans trou ; unicité de `slugFr` et de
`slugEn` ; `generation` cohérente avec les bornes du tableau 4.2 ; `spriteUrl` conforme au
gabarit.

**`normalizeName`** — les dix cas particuliers du tableau 4.4, plus : espaces de tête et de
fin, casse mixte, chaîne vide, chaîne composée uniquement de ponctuation.

**`buildPool`** — Gén 1 seule → 151 ids, span 151 ; national → 1025 ids, span 1025 ;
Gén 1 + Gén 3 → 286 ids, span 386 ; rejet d'une liste vide ; rejet d'une génération hors
bornes ; tri croissant garanti même si l'entrée est désordonnée.

**`scoreForAnswer`** — les quatorze valeurs du tableau de référence 5.3 ; réponse `null`
→ 0 ; écart symétrique (proposer 20 pour la cible 25 vaut autant que 30 pour 25) ; score
toujours dans `[0, 1000]` et entier.

**`pickTargets`** — déterminisme (même graine → même série, vérifié sur une série de
référence figée dans le test) ; absence de doublon ; tous les ids appartiennent au pool ;
`count > poolSize` renvoie `poolSize` éléments ; uniformité approximative sur 100 000
tirages (chaque id sort entre 0,5× et 1,5× la moyenne attendue).

**`searchPokemon`** — au plus 8 résultats ; `"pika"` renvoie Pikachu en premier ; recherche
en anglais (`"charizard"` trouve Dracaufeu) ; restriction au pool (`"mewtwo"` ne renvoie
rien avec un pool Gén 5) ; ordre préfixe avant sous-chaîne ; requête vide renvoie une liste
vide.

**`dailySeed`** — même date UTC → même graine ; deux dates distinctes → graines distinctes ;
la bascule se fait bien à minuit UTC et non à minuit local.

### 12.2 `apps/server` (Vitest, intégration avec un vrai client Socket.IO)

- Création d'une room : code à 4 caractères de l'alphabet autorisé, créateur hôte.
- Rejoindre : état diffusé aux deux joueurs ; refus au-delà de 8 ; refus si la partie a
  démarré ; pseudo dupliqué suffixé.
- Réglages : acceptés de l'hôte, refusés d'un autre joueur (`NOT_HOST`), refusés hors
  lobby, refusés si invalides.
- Cycle complet d'une partie à 2 joueurs sur 5 manches, avec des timers accélérés :
  `round:start` reçu par les deux, scores conformes à `scoreForAnswer`, `game:end` avec un
  classement correct.
- Réponse hors délai rejetée (`ROUND_CLOSED`) ; deuxième réponse rejetée
  (`ALREADY_ANSWERED`) ; Pokémon hors pool rejeté (`NOT_IN_POOL`) ; mauvais `roundIndex`
  rejeté.
- Avance anticipée : quand les deux joueurs répondent, la révélation arrive avant
  l'expiration du chrono.
- `round:start` ne contient ni nom ni sprite de la cible (assertion sur la charge utile).
- Déconnexion : joueur marqué hors ligne, score conservé, manches manquées à 0 ; `rejoin`
  avec le bon token restaure la place ; avec un mauvais token → `INVALID_TOKEN` ; après
  60 s, le joueur est retiré.
- Transfert d'hôte au départ de l'hôte.
- Purge : room vide détruite après le délai, room détruite après sa durée de vie absolue.
- Limitation de débit : au-delà de 20 événements en 10 s → `RATE_LIMITED`.

Les délais (chrono, révélation, grâce de reconnexion, purge) sont injectés dans `Room` et
`RoomStore` plutôt que codés en dur, précisément pour rendre ces tests rapides.

### 12.3 `apps/web` (Vitest + Testing Library)

- `PokemonCombobox` : filtre à la frappe ; navigation `↓`/`↑` avec bouclage ; `Entrée`
  sélectionne puis valide ; `Échap` ferme puis efface ; **aucun numéro national présent
  dans le DOM rendu des suggestions** (assertion sur le texte accessible complet de la
  liste) ; bouton de validation désactivé sans sélection.
- `TargetNumber` : zéros de tête sur 3 ou 4 chiffres selon `maxId`.
- `Timer` : bascule de couleur à 5 s et à 2 s ; atteint 0 et n'affiche pas de négatif.
- `useSoloGame` : enchaînement des 10 manches, cumul du score, manche sans réponse à 0,
  fin de partie.
- `storage/local` : lecture d'une valeur absente, JSON corrompu, écriture en échec — aucun
  jet d'exception dans les trois cas.

### 12.4 Bout en bout (Playwright)

1. **Parcours solo** : accueil → saisie du pseudo → configuration Gén 1 → partie de 10
   manches en répondant à chacune → écran final affichant un score cohérent et le
   récapitulatif des 10 manches.
2. **Parcours multi à deux onglets** : l'onglet A crée une room et copie le code ;
   l'onglet B rejoint ; A démarre ; les deux voient le même numéro ; les deux répondent
   différemment ; les deux voient le même tableau de révélation et le même classement final.
3. **Défi du jour** : une partie complète, puis un rechargement de `/daily` affiche le
   résultat déjà obtenu au lieu d'une nouvelle partie.
4. **Reconnexion** : en pleine partie, l'onglet B est rechargé et retrouve sa place avec son
   score.

### 12.5 Critères de qualité

- La suite complète (`pnpm lint && pnpm typecheck && pnpm test`) passe sans avertissement.
- Couverture de `packages/shared/src/domain` ≥ 95 % en lignes.
- Aucun `any` explicite, aucun `@ts-ignore`, aucun `console.log` résiduel hors `log.ts`.

---

## 13. Docker et déploiement

Cible : un serveur personnel, un seul conteneur, aucune dépendance externe (pas de base de
données, pas de cache, pas de reverse proxy obligatoire).

### 13.1 Dockerfile

Construction multi-étapes :

1. **`deps`** — image `node:22-alpine`, activation de pnpm via corepack, copie des
   manifestes et des lockfiles seuls, `pnpm install --frozen-lockfile`. Cette étape est
   mise en cache tant que les dépendances ne bougent pas.
2. **`build`** — copie du code source, `pnpm build` (shared → web → server).
3. **`runner`** — image `node:22-alpine`, `NODE_ENV=production`, installation des seules
   dépendances de production, copie de `apps/server/dist`, de `apps/web/dist` et du
   `pokemon.json` compilé. Exécution sous l'utilisateur non privilégié `node`.
   `EXPOSE 3000`. `CMD ["node", "apps/server/dist/index.js"]`.

Le conteneur embarque un `HEALTHCHECK` interrogeant `http://127.0.0.1:${PORT}/healthz`
toutes les 30 secondes, avec 3 essais et un délai de grâce de 10 secondes au démarrage.

`.dockerignore` exclut au minimum : `node_modules`, `**/dist`, `.git`, `docs`,
`test-results`, `playwright-report`, `*.log`, `.env`.

L'image finale doit peser moins de 250 Mo.

### 13.2 docker-compose.yml

Un unique service `app`, construit depuis le `Dockerfile` local, avec :
`restart: unless-stopped`, `ports: "3000:3000"`, les variables d'environnement lues depuis
un fichier `.env`, le `healthcheck` hérité de l'image, et une limite de journalisation
(`json-file`, `max-size: 10m`, `max-file: 3`). Aucun volume : il n'y a rien à persister.

Mise en service : `docker compose up -d --build`. Mise à jour : `git pull` puis la même
commande.

### 13.3 Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute HTTP et WebSocket |
| `NODE_ENV` | `production` | — |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `CORS_ORIGIN` | *(vide)* | Vide = même origine uniquement. À ne renseigner que si le front est servi séparément |
| `ROUND_REVEAL_MS` | `6000` | Durée de la révélation |
| `COUNTDOWN_MS` | `3000` | Décompte avant la manche 1 |
| `ANSWER_GRACE_MS` | `1500` | Tolérance de latence sur la fin de manche |
| `RECONNECT_GRACE_MS` | `60000` | Délai avant retrait d'un joueur déconnecté |
| `ROOM_EMPTY_TTL_MS` | `300000` | Destruction d'une room vide |
| `ROOM_MAX_AGE_MS` | `10800000` | Durée de vie absolue d'une room |
| `MAX_ROOMS` | `500` | Rooms simultanées |

Le serveur valide ces variables au démarrage et **refuse de démarrer** avec un message
explicite si l'une est hors bornes. Un `.env.example` documenté est versionné.

### 13.4 Exploitation

- **Arrêt propre** : sur `SIGTERM`, le serveur émet `room:closed { reason: "shutdown" }` à
  toutes les rooms, ferme les sockets, puis le serveur HTTP, avec un délai maximum de 5
  secondes avant sortie forcée.
- **Journalisation** : une ligne JSON par événement notable (création et destruction de
  room, début et fin de partie, erreurs), sans donnée personnelle au-delà du pseudo choisi.
- **Derrière un reverse proxy** (Nginx, Traefik, Caddy), le WebSocket exige le passage des
  en-têtes `Upgrade` et `Connection`, et un `proxy_read_timeout` d'au moins 120 secondes.
  Le README fournit un exemple de configuration Nginx.
- **Aucune sauvegarde n'est nécessaire** : le serveur ne détient aucun état durable.

---

## 14. Critères d'acceptation

Le projet est considéré comme conforme quand chacune de ces affirmations est vérifiable.

1. Une partie solo de 10 manches se joue de bout en bout, chrono compris, et affiche un
   score total égal à la somme des scores de manche calculés par `scoreForAnswer`.
2. L'autocomplétion ne propose que des Pokémon du pool actif et n'affiche jamais de numéro
   national, dans aucun texte visible ni attribut accessible.
3. Répondre exactement juste rapporte 1000 points ; ne pas répondre en rapporte 0.
4. La formule de score produit, aux valeurs du tableau 5.3, exactement les nombres indiqués.
5. Deux navigateurs différents ouvrant le défi du jour le même jour UTC reçoivent la même
   série de 10 numéros, dans le même ordre.
6. Une room créée dans un navigateur est rejoignable dans un autre via son code de 4
   caractères, insensible à la casse.
7. Dans une room de 3 joueurs, les trois voient le même numéro et un chrono dont les
   décomptes ne diffèrent pas de plus d'une seconde.
8. Après chaque manche multi, les trois joueurs voient un tableau identique, avec les
   réponses, écarts et points de chacun.
9. Le classement final départage correctement deux joueurs à score égal, au temps de
   réponse cumulé.
10. Recharger la page pendant une partie multi ramène le joueur dans la room, avec son
    score, en moins de 5 secondes.
11. La fermeture de l'onglet de l'hôte transfère le rôle d'hôte à un autre joueur, et la
    partie continue.
12. L'inspection du trafic WebSocket ne révèle ni le nom ni le sprite du Pokémon cible avant
    l'événement `round:reveal`.
13. Le jeu se joue intégralement au clavier, de l'accueil au classement final.
14. `docker compose up -d --build` sur une machine vierge rend le jeu accessible sur le port
    3000, front et multijoueur compris, sans configuration supplémentaire.
15. `/healthz` répond `200` avec le nombre de rooms et de joueurs en cours.
16. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` passe entièrement.

---

## 15. Décisions actées

Ces points ont été tranchés pendant la conception ; les rouvrir demande une révision de ce
document.

| Décision | Raison |
|---|---|
| Numéro → nommer le Pokémon (et non l'inverse) | La saisie d'un nom est plus riche et permet l'autocomplétion ; deviner un nombre serait un jeu de hasard. |
| Un seul essai par manche | Format identique en solo et en multi, comparaison directe des réponses, aucune règle d'égalité complexe. |
| Chrono sans bonus de rapidité | La formule de score reste lisible ; le temps ne sert qu'au départage. |
| Propositions restreintes au pool actif | Sans cette restriction, l'écart perd son sens : on pourrait répondre un Pokémon de Gén 9 sur une partie Gén 1. |
| `span` plutôt que le nombre d'éléments au dénominateur | Rend le score cohérent pour des sélections de générations non contiguës. |
| Décroissance exponentielle plutôt que linéaire | Une décroissance linéaire annule tout écart supérieur à 50 et cesse de discriminer ; l'exponentielle reste informative sur toute la plage. |
| Serveur autoritaire, état en mémoire | Le multi doit être fiable ; la persistance, elle, n'apporte rien à un jeu entre amis. |
| Aucun compte, aucune base de données | Réduit le périmètre, supprime toute donnée personnelle à protéger et toute sauvegarde à exploiter. |
| Dataset local plutôt qu'appels à PokeAPI au runtime | Déterminisme, absence de latence, tests reproductibles, jeu insensible à une panne de l'API. |
| Conteneur unique servant front et WebSocket | Même origine, donc aucun CORS ; un seul objet à déployer sur le serveur de l'utilisateur. |
| Pas d'entrée en cours de partie dans une room | Un arrivant partirait avec un score de zéro sur les manches déjà jouées : la partie serait faussée. |
