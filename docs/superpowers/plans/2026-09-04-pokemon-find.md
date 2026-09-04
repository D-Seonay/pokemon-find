# Pokémon Find — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un jeu web où l'on doit nommer le Pokémon correspondant à un numéro du Pokédex, jouable en solo et en rooms multijoueur temps réel, livré en conteneur Docker unique.

**Architecture:** Monorepo pnpm à trois paquets. `@pkfind/shared` contient toute la logique de jeu (score, tirage, normalisation, protocole) et est consommé à l'identique par le front et le serveur, ce qui garantit que solo et multi obéissent aux mêmes règles. `@pkfind/server` est autoritaire sur le multi : il tire les cibles, ouvre et ferme les manches, calcule les scores, et garde tout en mémoire. `@pkfind/web` est une SPA React. En production, un unique processus Node sert le front statique et le WebSocket sur le même port.

**Tech Stack:** Node 22, pnpm 9, TypeScript 5.6 strict, React 19, Vite 6, Tailwind 4, React Router 7, Express 4.21, Socket.IO 4.8, Vitest 2, Testing Library 16, Playwright 1.48, Docker.

**Spec:** `docs/superpowers/specs/2026-09-04-pokemon-find-design.md`

## Global Constraints

- Node.js ≥ 22 LTS, pnpm ≥ 9, TypeScript ≥ 5.6.
- TypeScript en `strict: true`, avec `noUncheckedIndexedAccess: true` et `exactOptionalPropertyTypes: true`.
- Aucun `any` explicite, aucun `@ts-ignore`, aucun `console.log` hors `apps/server/src/log.ts`.
- Toute la logique de jeu vit dans `packages/shared/src/domain` — le front et le serveur ne la réimplémentent jamais.
- Couverture ≥ 95 % en lignes sur `packages/shared/src/domain`.
- Interface en français. Seuls les noms de Pokémon sont acceptés en anglais à la saisie.
- Le numéro national d'un Pokémon n'apparaît jamais dans les suggestions d'autocomplétion, ni en texte, ni en attribut accessible, ni en infobulle.
- `round:start` ne transporte que le numéro cible ; le nom et le sprite de la cible n'arrivent qu'avec `round:reveal`.
- Constantes de score normatives : `MAX_SCORE = 1000`, `DECAY = 10`, `score = round(1000 × exp(−10 × écart / span))`.
- Durées de manche autorisées : 10000, 15000, 25000 ms. Nombres de manches autorisés : 5, 10, 15.
- Alphabet des codes de room : `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, longueur 4.
- Commit après chaque tâche, message en français, préfixe conventionnel (`feat:`, `test:`, `chore:`, `docs:`).

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `eslint.config.js` | Outillage du monorepo | 1 |
| `packages/shared/src/domain/generations.ts` | Bornes normatives des 9 générations | 1 |
| `packages/shared/src/domain/pool.ts` | Construction d'un pool et calcul de `span` | 2 |
| `packages/shared/src/domain/score.ts` | Formule de score | 3 |
| `packages/shared/src/domain/random.ts` | FNV-1a, mulberry32, tirage sans remise | 4 |
| `packages/shared/src/domain/names.ts` | `normalizeName` puis `searchPokemon` | 5, 7 |
| `packages/shared/src/data/pokemon.json` | Dataset des 1025 Pokémon | 6 |
| `packages/shared/src/data/pokemon.ts` | Chargement typé et index | 6 |
| `scripts/build-dataset.ts` | Import PokeAPI, exécution manuelle | 6 |
| `packages/shared/src/domain/settings.ts` | `GameSettings`, validation, défauts | 8 |
| `packages/shared/src/domain/daily.ts` | Graine du jour, paliers, texte de partage | 8 |
| `packages/shared/src/protocol/events.ts` | Types Socket.IO et codes d'erreur | 15 |
| `apps/web/src/styles/tokens.css`, `components/Button.tsx`, `components/PokemonSprite.tsx` | Design system | 9 |
| `apps/web/src/components/PokemonCombobox.tsx` | Champ de réponse et autocomplétion | 10 |
| `apps/web/src/components/TargetNumber.tsx`, `components/Timer.tsx` | Cible et chrono | 11 |
| `apps/web/src/game/useSoloGame.ts` | Machine à états d'une partie solo | 12 |
| `apps/web/src/storage/local.ts` | Accès tolérant au stockage navigateur | 12 |
| `apps/web/src/pages/*.tsx`, `App.tsx` | Écrans et routes | 13, 14, 19 |
| `apps/web/src/components/RoundResult.tsx`, `Scoreboard.tsx`, `GenerationPicker.tsx` | Restitution des résultats | 13, 19 |
| `apps/server/src/config.ts`, `log.ts`, `http.ts`, `index.ts` | Socle serveur | 15 |
| `apps/server/src/rooms/codes.ts`, `RoomStore.ts` | Codes et registre des rooms | 16 |
| `apps/server/src/rooms/Room.ts` | Machine à états d'une partie multi | 17 |
| `apps/server/src/socket/handlers.ts`, `rateLimit.ts` | Branchement des événements | 18 |
| `apps/web/src/net/socket.ts`, `net/useRoom.ts` | Client temps réel | 19 |
| `e2e/*.spec.ts` | Parcours de bout en bout | 14, 20 |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `README.md` | Livraison | 21 |

---

## Phase 1 — Logique de jeu (`@pkfind/shared`)

### Task 1: Monorepo et bornes de générations

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/domain/generations.ts`
- Test: `packages/shared/src/domain/generations.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `MAX_POKEMON_ID: 1025`, `type GenerationId = 1|2|3|4|5|6|7|8|9`, `ALL_GENERATIONS: readonly GenerationId[]`, `GENERATION_BOUNDS: Readonly<Record<GenerationId, readonly [number, number]>>`, `generationOf(id: number): GenerationId`, `idsOfGeneration(gen: GenerationId): number[]`.

- [ ] **Step 1: Créer le squelette du monorepo**

`pnpm-workspace.yaml` :

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`package.json` racine :

```json
{
  "name": "pokemon-find",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -F @pkfind/shared build && pnpm -F @pkfind/web build && pnpm -F @pkfind/server build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r exec tsc --noEmit",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.12.0",
    "@types/node": "^22.7.0",
    "eslint": "^9.12.0",
    "prettier": "^3.3.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.8.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`vitest.workspace.ts` :

```ts
export default ["packages/*", "apps/*"];
```

`.prettierrc` :

```json
{ "printWidth": 100, "singleQuote": false, "semi": true, "trailingComma": "all" }
```

`eslint.config.js` :

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/playwright-report/**", "e2e-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-console": "error",
    },
  },
  { files: ["apps/server/src/log.ts"], rules: { "no-console": "off" } },
);
```

`packages/shared/package.json` :

```json
{
  "name": "@pkfind/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

`packages/shared/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

Puis `pnpm install`.

- [ ] **Step 2: Écrire le test qui échoue**

`packages/shared/src/domain/generations.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  ALL_GENERATIONS,
  GENERATION_BOUNDS,
  MAX_POKEMON_ID,
  generationOf,
  idsOfGeneration,
} from "./generations.js";

describe("generations", () => {
  it("couvre 1 à 1025 sans trou ni chevauchement", () => {
    let expected = 1;
    for (const gen of ALL_GENERATIONS) {
      const [first, last] = GENERATION_BOUNDS[gen];
      expect(first).toBe(expected);
      expect(last).toBeGreaterThanOrEqual(first);
      expected = last + 1;
    }
    expect(expected - 1).toBe(MAX_POKEMON_ID);
  });

  it("respecte les tailles normatives de la spécification", () => {
    const sizes = ALL_GENERATIONS.map((gen) => {
      const [first, last] = GENERATION_BOUNDS[gen];
      return last - first + 1;
    });
    expect(sizes).toEqual([151, 100, 135, 107, 156, 72, 88, 96, 120]);
  });

  it("trouve la génération d'un numéro", () => {
    expect(generationOf(1)).toBe(1);
    expect(generationOf(151)).toBe(1);
    expect(generationOf(152)).toBe(2);
    expect(generationOf(906)).toBe(9);
    expect(generationOf(1025)).toBe(9);
  });

  it("rejette un numéro hors bornes", () => {
    expect(() => generationOf(0)).toThrow(RangeError);
    expect(() => generationOf(1026)).toThrow(RangeError);
    expect(() => generationOf(1.5)).toThrow(RangeError);
  });

  it("liste les numéros d'une génération", () => {
    const gen1 = idsOfGeneration(1);
    expect(gen1).toHaveLength(151);
    expect(gen1[0]).toBe(1);
    expect(gen1.at(-1)).toBe(151);
    expect(idsOfGeneration(6)).toHaveLength(72);
  });
});
```

- [ ] **Step 3: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/generations.test.ts`
Expected: FAIL — `Failed to resolve import "./generations.js"`.

- [ ] **Step 4: Écrire l'implémentation minimale**

`packages/shared/src/domain/generations.ts` :

```ts
export const MAX_POKEMON_ID = 1025;

export type GenerationId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const ALL_GENERATIONS: readonly GenerationId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const GENERATION_BOUNDS: Readonly<Record<GenerationId, readonly [number, number]>> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};

export function isGenerationId(value: unknown): value is GenerationId {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}

export function generationOf(id: number): GenerationId {
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
    throw new RangeError(`Numéro de Pokémon hors bornes : ${id}`);
  }
  for (const gen of ALL_GENERATIONS) {
    const [first, last] = GENERATION_BOUNDS[gen];
    if (id >= first && id <= last) return gen;
  }
  throw new RangeError(`Numéro de Pokémon hors bornes : ${id}`);
}

export function idsOfGeneration(gen: GenerationId): number[] {
  const [first, last] = GENERATION_BOUNDS[gen];
  const ids: number[] = [];
  for (let id = first; id <= last; id++) ids.push(id);
  return ids;
}
```

`packages/shared/src/index.ts` :

```ts
export * from "./domain/generations.js";
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared` puis `pnpm typecheck && pnpm lint`
Expected: 5 tests PASS, aucune erreur de type, aucune erreur de lint.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shared): monorepo pnpm et bornes normatives des générations"
```

---

### Task 2: Construction du pool

**Files:**
- Create: `packages/shared/src/domain/pool.ts`
- Test: `packages/shared/src/domain/pool.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `GenerationId`, `ALL_GENERATIONS`, `isGenerationId`, `idsOfGeneration` (Task 1).
- Produces: `type Pool = { generations: GenerationId[]; ids: number[]; minId: number; maxId: number; span: number }`, `buildPool(generations: readonly number[]): Pool`, `class InvalidPoolError extends Error`, `poolSignature(generations: readonly GenerationId[]): string`.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/shared/src/domain/pool.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { InvalidPoolError, buildPool, poolSignature } from "./pool.js";

describe("buildPool", () => {
  it("construit le pool de la génération 1", () => {
    const pool = buildPool([1]);
    expect(pool.ids).toHaveLength(151);
    expect(pool.minId).toBe(1);
    expect(pool.maxId).toBe(151);
    expect(pool.span).toBe(151);
  });

  it("construit le pool national", () => {
    const pool = buildPool([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pool.ids).toHaveLength(1025);
    expect(pool.span).toBe(1025);
  });

  it("calcule le span sur l'étendue et non sur le nombre pour un pool discontinu", () => {
    const pool = buildPool([1, 3]);
    expect(pool.ids).toHaveLength(286);
    expect(pool.minId).toBe(1);
    expect(pool.maxId).toBe(386);
    expect(pool.span).toBe(386);
  });

  it("normalise l'entrée : tri, déduplication", () => {
    const pool = buildPool([3, 1, 1]);
    expect(pool.generations).toEqual([1, 3]);
  });

  it("rejette une liste vide", () => {
    expect(() => buildPool([])).toThrow(InvalidPoolError);
  });

  it("rejette une génération hors bornes", () => {
    expect(() => buildPool([0])).toThrow(InvalidPoolError);
    expect(() => buildPool([10])).toThrow(InvalidPoolError);
    expect(() => buildPool([2.5])).toThrow(InvalidPoolError);
  });

  it("renvoie des ids triés croissant", () => {
    const { ids } = buildPool([5, 2]);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]!).toBeGreaterThan(ids[i - 1]!);
    }
  });
});

describe("poolSignature", () => {
  it("produit une signature stable", () => {
    expect(poolSignature([1])).toBe("1");
    expect(poolSignature([1, 3, 5])).toBe("1-3-5");
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/pool.test.ts`
Expected: FAIL — module `./pool.js` introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

`packages/shared/src/domain/pool.ts` :

```ts
import {
  type GenerationId,
  idsOfGeneration,
  isGenerationId,
} from "./generations.js";

export class InvalidPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPoolError";
  }
}

export type Pool = {
  generations: GenerationId[];
  ids: number[];
  minId: number;
  maxId: number;
  span: number;
};

export function buildPool(generations: readonly number[]): Pool {
  const unique = [...new Set(generations)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new InvalidPoolError("Sélectionne au moins une génération.");
  }
  for (const gen of unique) {
    if (!isGenerationId(gen)) {
      throw new InvalidPoolError(`Génération invalide : ${gen}`);
    }
  }
  const typed = unique as GenerationId[];
  const ids = typed.flatMap(idsOfGeneration);
  const minId = ids[0]!;
  const maxId = ids[ids.length - 1]!;
  return { generations: typed, ids, minId, maxId, span: maxId - minId + 1 };
}

export function poolSignature(generations: readonly GenerationId[]): string {
  return [...generations].sort((a, b) => a - b).join("-");
}
```

Ajouter à `packages/shared/src/index.ts` : `export * from "./domain/pool.js";`

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): construction du pool et calcul du span"
```

---

### Task 3: Formule de score

**Files:**
- Create: `packages/shared/src/domain/score.ts`
- Test: `packages/shared/src/domain/score.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `MAX_SCORE: 1000`, `DECAY: 10`, `scoreForAnswer(targetId: number, answerId: number | null, span: number): number`, `gapBetween(targetId: number, answerId: number): number`.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/shared/src/domain/score.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { MAX_SCORE, gapBetween, scoreForAnswer } from "./score.js";

describe("scoreForAnswer", () => {
  it("reproduit le tableau de référence en Gén 1 (span 151)", () => {
    const table: Array<[number, number]> = [
      [0, 1000],
      [1, 936],
      [5, 718],
      [15, 370],
      [50, 36],
      [100, 1],
      [400, 0],
    ];
    for (const [gap, points] of table) {
      expect(scoreForAnswer(500, 500 + gap, 151)).toBe(points);
    }
  });

  it("reproduit le tableau de référence en national (span 1025)", () => {
    const table: Array<[number, number]> = [
      [0, 1000],
      [1, 990],
      [5, 952],
      [15, 864],
      [50, 614],
      [100, 377],
      [400, 20],
    ];
    for (const [gap, points] of table) {
      expect(scoreForAnswer(500, 500 + gap, 1025)).toBe(points);
    }
  });

  it("est symétrique autour de la cible", () => {
    expect(scoreForAnswer(25, 20, 151)).toBe(scoreForAnswer(25, 30, 151));
  });

  it("donne le maximum pour une réponse exacte", () => {
    expect(scoreForAnswer(143, 143, 1025)).toBe(MAX_SCORE);
  });

  it("donne zéro sans réponse", () => {
    expect(scoreForAnswer(143, null, 1025)).toBe(0);
  });

  it("reste un entier dans [0, 1000]", () => {
    for (let gap = 0; gap <= 1024; gap++) {
      const points = scoreForAnswer(1, 1 + gap, 1025);
      expect(Number.isInteger(points)).toBe(true);
      expect(points).toBeGreaterThanOrEqual(0);
      expect(points).toBeLessThanOrEqual(MAX_SCORE);
    }
  });
});

describe("gapBetween", () => {
  it("renvoie une valeur absolue", () => {
    expect(gapBetween(25, 30)).toBe(5);
    expect(gapBetween(30, 25)).toBe(5);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/score.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

`packages/shared/src/domain/score.ts` :

```ts
export const MAX_SCORE = 1000;
export const DECAY = 10;

export function gapBetween(targetId: number, answerId: number): number {
  return Math.abs(answerId - targetId);
}

export function scoreForAnswer(
  targetId: number,
  answerId: number | null,
  span: number,
): number {
  if (answerId === null) return 0;
  const gap = gapBetween(targetId, answerId);
  return Math.round(MAX_SCORE * Math.exp((-DECAY * gap) / span));
}
```

Ajouter à `index.ts` : `export * from "./domain/score.js";`

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared`
Expected: PASS. Si une valeur du tableau diffère, c'est l'implémentation qui est fausse, jamais le tableau — il est normatif.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): formule de score exponentielle relative au span"
```

---

### Task 4: Générateur pseudo-aléatoire et tirage des cibles

**Files:**
- Create: `packages/shared/src/domain/random.ts`
- Test: `packages/shared/src/domain/random.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `fnv1a32(input: string): number`, `mulberry32(seed: number): () => number`, `rngFromSeed(seed: string): () => number`, `pickTargets(poolIds: readonly number[], count: number, rng: () => number): number[]`, `randomSeed(): string`.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/shared/src/domain/random.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildPool } from "./pool.js";
import { fnv1a32, mulberry32, pickTargets, randomSeed, rngFromSeed } from "./random.js";

describe("fnv1a32", () => {
  it("est déterministe et non signé", () => {
    const a = fnv1a32("daily:2026-09-04");
    expect(a).toBe(fnv1a32("daily:2026-09-04"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
  });

  it("produit des valeurs différentes pour des entrées proches", () => {
    expect(fnv1a32("daily:2026-09-04")).not.toBe(fnv1a32("daily:2026-09-05"));
  });
});

describe("mulberry32", () => {
  it("produit des flottants dans [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("rejoue la même suite pour la même graine", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("pickTargets", () => {
  const pool = buildPool([1]);

  it("est déterministe pour une graine donnée", () => {
    const first = pickTargets(pool.ids, 10, rngFromSeed("daily:2026-09-04"));
    const second = pickTargets(pool.ids, 10, rngFromSeed("daily:2026-09-04"));
    expect(first).toEqual(second);
  });

  it("ne tire jamais deux fois la même cible", () => {
    const picks = pickTargets(pool.ids, 15, rngFromSeed("test"));
    expect(new Set(picks).size).toBe(15);
  });

  it("ne tire que des ids du pool", () => {
    const gen5 = buildPool([5]);
    const picks = pickTargets(gen5.ids, 10, rngFromSeed("test"));
    for (const id of picks) {
      expect(id).toBeGreaterThanOrEqual(494);
      expect(id).toBeLessThanOrEqual(649);
    }
  });

  it("plafonne au nombre d'éléments du pool", () => {
    expect(pickTargets([1, 2, 3], 10, rngFromSeed("test"))).toHaveLength(3);
  });

  it("ne modifie pas le tableau source", () => {
    const ids = [...pool.ids];
    pickTargets(ids, 10, rngFromSeed("test"));
    expect(ids).toEqual(pool.ids);
  });

  it("répartit à peu près uniformément sur 100 000 tirages", () => {
    const counts = new Map<number, number>();
    const rng = rngFromSeed("uniformité");
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const [id] = pickTargets(pool.ids, 1, rng);
      counts.set(id!, (counts.get(id!) ?? 0) + 1);
    }
    const expectedPerId = draws / pool.ids.length;
    for (const id of pool.ids) {
      const seen = counts.get(id) ?? 0;
      expect(seen).toBeGreaterThan(expectedPerId * 0.5);
      expect(seen).toBeLessThan(expectedPerId * 1.5);
    }
  });
});

describe("randomSeed", () => {
  it("préfixe et produit 16 caractères hexadécimaux", () => {
    expect(randomSeed()).toMatch(/^solo:[0-9a-f]{16}$/);
    expect(randomSeed()).not.toBe(randomSeed());
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/random.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

`packages/shared/src/domain/random.ts` :

```ts
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}

export function pickTargets(
  poolIds: readonly number[],
  count: number,
  rng: () => number,
): number[] {
  const a = [...poolIds];
  const n = Math.min(count, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    const swap = a[i]!;
    a[i] = a[j]!;
    a[j] = swap;
  }
  return a.slice(0, n);
}

export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `solo:${hex}`;
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared`
Expected: PASS. Le test d'uniformité prend quelques secondes ; c'est normal.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): PRNG déterministe et tirage des cibles sans remise"
```

---

### Task 5: Normalisation des noms

**Files:**
- Create: `packages/shared/src/domain/names.ts`
- Test: `packages/shared/src/domain/names.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `normalizeName(input: string): string`.

- [ ] **Step 1: Écrire le test qui échoue**

`packages/shared/src/domain/names.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { normalizeName } from "./names.js";

describe("normalizeName", () => {
  it("met en minuscules et retire les espaces de bordure", () => {
    expect(normalizeName("  PiKaChu ")).toBe("pikachu");
  });

  it("retire les accents", () => {
    expect(normalizeName("Étourmi")).toBe("etourmi");
    expect(normalizeName("Éoko")).toBe("eoko");
  });

  it("traduit les signes de genre", () => {
    expect(normalizeName("Nidoran♀")).toBe("nidoranf");
    expect(normalizeName("Nidoran♂")).toBe("nidoranm");
  });

  it("distingue les deux Nidoran", () => {
    expect(normalizeName("Nidoran♀")).not.toBe(normalizeName("Nidoran♂"));
  });

  it("retire ponctuation, espaces internes et tirets", () => {
    expect(normalizeName("M. Mime")).toBe("mmime");
    expect(normalizeName("Mime Jr.")).toBe("mimejr");
    expect(normalizeName("Ho-Oh")).toBe("hooh");
    expect(normalizeName("Porygon-Z")).toBe("porygonz");
    expect(normalizeName("Farfetch'd")).toBe("farfetchd");
    expect(normalizeName("Farfetch’d")).toBe("farfetchd");
    expect(normalizeName("Tapu Koko")).toBe("tapukoko");
  });

  it("conserve les chiffres", () => {
    expect(normalizeName("Type:0")).toBe("type0");
  });

  it("renvoie une chaîne vide pour une saisie sans caractère utile", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("!?-.")).toBe("");
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/names.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

`packages/shared/src/domain/names.ts` :

```ts
export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2640/g, "f")
    .replace(/\u2642/g, "m")
    .replace(/[^a-z0-9]/g, "");
}
```

Ajouter à `index.ts` : `export * from "./domain/names.js";`

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): normalisation des noms de Pokémon"
```

---

### Task 6: Dataset des 1025 Pokémon

**Files:**
- Create: `scripts/build-dataset.ts`
- Create: `packages/shared/src/data/pokemon.json` (généré)
- Create: `packages/shared/src/data/pokemon.ts`
- Test: `packages/shared/src/data/pokemon.test.ts`
- Modify: `package.json` (script `dataset:build`), `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `normalizeName` (Task 5), `generationOf`, `MAX_POKEMON_ID` (Task 1).
- Produces: `type Pokemon = { id: number; nameFr: string; nameEn: string; slugFr: string; slugEn: string; generation: GenerationId; spriteUrl: string }`, `POKEMON: readonly Pokemon[]`, `pokemonById(id: number): Pokemon`, `tryPokemonById(id: number): Pokemon | undefined`, `pokemonOfPool(pool: Pool): Pokemon[]`.

- [ ] **Step 1: Écrire le script d'import**

`scripts/build-dataset.ts` :

```ts
import { writeFile } from "node:fs/promises";
import { generationOf, MAX_POKEMON_ID } from "../packages/shared/src/domain/generations.js";
import { normalizeName } from "../packages/shared/src/domain/names.js";

const OUT = new URL("../packages/shared/src/data/pokemon.json", import.meta.url);
const SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

type SpeciesName = { name: string; language: { name: string } };

async function fetchSpecies(id: number): Promise<{ nameFr: string; nameEn: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} définitif pour ${id}`);
      const body = (await res.json()) as { names: SpeciesName[] };
      const nameEn = body.names.find((n) => n.language.name === "en")?.name;
      const nameFr = body.names.find((n) => n.language.name === "fr")?.name;
      if (!nameEn) throw new Error(`Nom anglais manquant pour ${id}`);
      if (!nameFr) process.stderr.write(`Nom français manquant pour ${id}, repli sur l'anglais\n`);
      return { nameFr: nameFr ?? nameEn, nameEn };
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error("inatteignable");
}

async function main(): Promise<void> {
  const entries = [];
  for (let id = 1; id <= MAX_POKEMON_ID; id++) {
    const { nameFr, nameEn } = await fetchSpecies(id);
    entries.push({
      id,
      nameFr,
      nameEn,
      slugFr: normalizeName(nameFr),
      slugEn: normalizeName(nameEn),
      generation: generationOf(id),
      spriteUrl: SPRITE(id),
    });
    if (id % 50 === 0) process.stdout.write(`${id}/${MAX_POKEMON_ID}\n`);
    await new Promise((r) => setTimeout(r, 100)); // 10 requêtes/seconde
  }
  if (entries.length !== MAX_POKEMON_ID) throw new Error("Nombre d'entrées incorrect");
  const slugs = new Set(entries.map((e) => e.slugFr));
  if (slugs.size !== entries.length) throw new Error("Collision de slugFr");
  await writeFile(OUT, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  process.stdout.write(`Écrit ${entries.length} entrées.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
```

Ajouter aux scripts racine : `"dataset:build": "tsx scripts/build-dataset.ts"` et la dépendance de développement `tsx`.

- [ ] **Step 2: Générer le dataset**

Run: `pnpm dataset:build`
Expected: environ 2 minutes, puis `Écrit 1025 entrées.` et `packages/shared/src/data/pokemon.json` d'environ 300 Ko.
Si l'API est indisponible, ne pas inventer de données : réessayer plus tard. Le fichier est versionné une fois pour toutes.

- [ ] **Step 3: Écrire le test qui échoue**

`packages/shared/src/data/pokemon.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { GENERATION_BOUNDS, MAX_POKEMON_ID } from "../domain/generations.js";
import { normalizeName } from "../domain/names.js";
import { buildPool } from "../domain/pool.js";
import { POKEMON, pokemonById, pokemonOfPool, tryPokemonById } from "./pokemon.js";

describe("dataset", () => {
  it("contient 1025 entrées triées, sans trou", () => {
    expect(POKEMON).toHaveLength(MAX_POKEMON_ID);
    POKEMON.forEach((p, index) => expect(p.id).toBe(index + 1));
  });

  it("a des slugs uniques", () => {
    expect(new Set(POKEMON.map((p) => p.slugFr)).size).toBe(MAX_POKEMON_ID);
    expect(new Set(POKEMON.map((p) => p.slugEn)).size).toBe(MAX_POKEMON_ID);
  });

  it("a des slugs cohérents avec les noms", () => {
    for (const p of POKEMON) {
      expect(p.slugFr).toBe(normalizeName(p.nameFr));
      expect(p.slugEn).toBe(normalizeName(p.nameEn));
      expect(p.slugFr.length).toBeGreaterThan(0);
    }
  });

  it("a une génération cohérente avec les bornes normatives", () => {
    for (const p of POKEMON) {
      const [first, last] = GENERATION_BOUNDS[p.generation];
      expect(p.id).toBeGreaterThanOrEqual(first);
      expect(p.id).toBeLessThanOrEqual(last);
    }
  });

  it("a une URL de sprite conforme", () => {
    for (const p of POKEMON) {
      expect(p.spriteUrl).toBe(
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`,
      );
    }
  });

  it("contient les cas particuliers attendus", () => {
    expect(pokemonById(25).nameFr).toBe("Pikachu");
    expect(pokemonById(29).slugFr).toBe("nidoranf");
    expect(pokemonById(32).slugFr).toBe("nidoranm");
    expect(pokemonById(122).slugFr).toBe("mmime");
    expect(pokemonById(83).slugEn).toBe("farfetchd");
    expect(pokemonById(250).slugFr).toBe("hooh");
    expect(pokemonById(474).slugFr).toBe("porygonz");
    expect(pokemonById(772).slugFr).toBe("type0");
  });
});

describe("accès", () => {
  it("trouve un Pokémon par son numéro", () => {
    expect(pokemonById(1).id).toBe(1);
    expect(pokemonById(1025).id).toBe(1025);
  });

  it("lève pour un numéro inconnu et renvoie undefined en variante souple", () => {
    expect(() => pokemonById(9999)).toThrow(RangeError);
    expect(tryPokemonById(9999)).toBeUndefined();
  });

  it("restreint au pool", () => {
    const gen1 = pokemonOfPool(buildPool([1]));
    expect(gen1).toHaveLength(151);
    expect(gen1.every((p) => p.generation === 1)).toBe(true);
  });
});
```

- [ ] **Step 4: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/data/pokemon.test.ts`
Expected: FAIL — module `./pokemon.js` introuvable.

- [ ] **Step 5: Écrire l'implémentation minimale**

`packages/shared/src/data/pokemon.ts` :

```ts
import type { GenerationId } from "../domain/generations.js";
import type { Pool } from "../domain/pool.js";
import raw from "./pokemon.json" with { type: "json" };

export type Pokemon = {
  id: number;
  nameFr: string;
  nameEn: string;
  slugFr: string;
  slugEn: string;
  generation: GenerationId;
  spriteUrl: string;
};

export const POKEMON: readonly Pokemon[] = raw as Pokemon[];

const BY_ID = new Map<number, Pokemon>(POKEMON.map((p) => [p.id, p]));

export function tryPokemonById(id: number): Pokemon | undefined {
  return BY_ID.get(id);
}

export function pokemonById(id: number): Pokemon {
  const found = BY_ID.get(id);
  if (!found) throw new RangeError(`Pokémon inconnu : ${id}`);
  return found;
}

export function pokemonOfPool(pool: Pool): Pokemon[] {
  return pool.ids.map(pokemonById);
}
```

Ajouter à `index.ts` : `export * from "./data/pokemon.js";`

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared && pnpm typecheck`
Expected: PASS. Si `resolveJsonModule` pose problème au build, vérifier que `tsconfig.base.json` le déclare bien et que `packages/shared/tsconfig.json` inclut `src/**/*`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): dataset des 1025 Pokémon et script d'import PokeAPI"
```

---

### Task 7: Recherche pour l'autocomplétion

**Files:**
- Modify: `packages/shared/src/domain/names.ts`
- Modify: `packages/shared/src/domain/names.test.ts`

**Interfaces:**
- Consumes: `normalizeName` (Task 5), `Pokemon`, `pokemonOfPool` (Task 6), `Pool` (Task 2).
- Produces: `searchPokemon(query: string, pool: Pool, limit?: number): Pokemon[]` (limite par défaut 8).

- [ ] **Step 1: Ajouter le test qui échoue**

Ajouter à `packages/shared/src/domain/names.test.ts` :

```ts
import { buildPool } from "./pool.js";
import { searchPokemon } from "./names.js";

describe("searchPokemon", () => {
  const gen1 = buildPool([1]);
  const national = buildPool([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it("renvoie une liste vide pour une requête vide ou sans caractère utile", () => {
    expect(searchPokemon("", gen1)).toEqual([]);
    expect(searchPokemon("   ", gen1)).toEqual([]);
    expect(searchPokemon("!!", gen1)).toEqual([]);
  });

  it("place le préfixe français en tête", () => {
    const results = searchPokemon("pika", gen1);
    expect(results[0]?.id).toBe(25);
  });

  it("trouve par le nom anglais", () => {
    const results = searchPokemon("charizard", gen1);
    expect(results[0]?.id).toBe(6);
  });

  it("tolère accents, casse et ponctuation dans la requête", () => {
    expect(searchPokemon("m. mime", national)[0]?.id).toBe(122);
    expect(searchPokemon("HO-OH", national)[0]?.id).toBe(250);
  });

  it("classe les préfixes avant les sous-chaînes", () => {
    const results = searchPokemon("chu", national);
    const prefixIndex = results.findIndex((p) => p.slugFr.startsWith("chu"));
    const substringIndex = results.findIndex((p) => !p.slugFr.startsWith("chu"));
    if (prefixIndex !== -1 && substringIndex !== -1) {
      expect(prefixIndex).toBeLessThan(substringIndex);
    }
  });

  it("respecte strictement le pool", () => {
    expect(searchPokemon("mewtwo", buildPool([5]))).toEqual([]);
    expect(searchPokemon("mewtwo", gen1)[0]?.id).toBe(150);
  });

  it("plafonne à 8 résultats par défaut", () => {
    expect(searchPokemon("a", national).length).toBeLessThanOrEqual(8);
    expect(searchPokemon("a", national, 3)).toHaveLength(3);
  });

  it("départage les égalités par numéro croissant", () => {
    const results = searchPokemon("nidoran", national);
    expect(results.map((p) => p.id)).toEqual([29, 32]);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm vitest run packages/shared/src/domain/names.test.ts`
Expected: FAIL — `searchPokemon is not a function`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Ajouter à `packages/shared/src/domain/names.ts` :

```ts
import { type Pokemon, pokemonOfPool } from "../data/pokemon.js";
import type { Pool } from "./pool.js";

const DEFAULT_LIMIT = 8;

function rankOf(pokemon: Pokemon, query: string): number {
  if (pokemon.slugFr.startsWith(query)) return 0;
  if (pokemon.slugEn.startsWith(query)) return 1;
  if (pokemon.slugFr.includes(query)) return 2;
  if (pokemon.slugEn.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

export function searchPokemon(query: string, pool: Pool, limit = DEFAULT_LIMIT): Pokemon[] {
  const normalized = normalizeName(query);
  if (normalized.length === 0) return [];
  return pokemonOfPool(pool)
    .map((pokemon) => ({ pokemon, rank: rankOf(pokemon, normalized) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.pokemon.id - b.pokemon.id)
    .slice(0, limit)
    .map((entry) => entry.pokemon);
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): recherche de Pokémon restreinte au pool pour l'autocomplétion"
```

---

### Task 8: Réglages de partie et défi du jour

**Files:**
- Create: `packages/shared/src/domain/settings.ts`
- Create: `packages/shared/src/domain/daily.ts`
- Test: `packages/shared/src/domain/settings.test.ts`, `packages/shared/src/domain/daily.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `isGenerationId` (Task 1), `buildPool` (Task 2).
- Produces:
  - `ROUND_DURATIONS = [10000, 15000, 25000] as const`, `ROUND_COUNTS = [5, 10, 15] as const`
  - `type GameSettings = { generations: GenerationId[]; roundDurationMs: 10000 | 15000 | 25000; roundCount: 5 | 10 | 15 }`
  - `DEFAULT_SETTINGS: GameSettings`, `class InvalidSettingsError extends Error`, `validateSettings(input: unknown): GameSettings`
  - `dailyKey(date: Date): string`, `dailySeed(date: Date): string`, `DAILY_SETTINGS: GameSettings`
  - `tierOf(points: number): 0 | 1 | 2 | 3 | 4`, `TIER_EMOJI: readonly string[]`, `shareText(input: { date: Date; total: number; points: readonly number[]; url: string }): string`

- [ ] **Step 1: Écrire les tests qui échouent**

`packages/shared/src/domain/settings.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, InvalidSettingsError, validateSettings } from "./settings.js";

describe("validateSettings", () => {
  it("accepte les réglages par défaut", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("a des valeurs par défaut conformes à la spécification", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      generations: [1],
      roundDurationMs: 15000,
      roundCount: 10,
    });
  });

  it("trie et déduplique les générations", () => {
    const settings = validateSettings({ generations: [3, 1, 3], roundDurationMs: 10000, roundCount: 5 });
    expect(settings.generations).toEqual([1, 3]);
  });

  it("rejette une durée non autorisée", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, roundDurationMs: 12000 })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette un nombre de manches non autorisé", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, roundCount: 7 })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette une liste de générations vide ou invalide", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: [] })).toThrow(
      InvalidSettingsError,
    );
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: [12] })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette une entrée qui n'est pas un objet", () => {
    expect(() => validateSettings(null)).toThrow(InvalidSettingsError);
    expect(() => validateSettings("gen1")).toThrow(InvalidSettingsError);
  });
});
```

`packages/shared/src/domain/daily.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { DAILY_SETTINGS, dailyKey, dailySeed, shareText, tierOf } from "./daily.js";

describe("dailyKey", () => {
  it("utilise la date UTC", () => {
    expect(dailyKey(new Date("2026-09-04T00:00:00Z"))).toBe("2026-09-04");
    expect(dailyKey(new Date("2026-09-04T23:59:59Z"))).toBe("2026-09-04");
    expect(dailyKey(new Date("2026-09-05T00:00:00Z"))).toBe("2026-09-05");
  });

  it("bascule à minuit UTC et non à minuit local", () => {
    // 01h30 à Paris en été = 23h30 UTC la veille : le défi de la veille est encore actif.
    expect(dailyKey(new Date("2026-09-04T23:30:00Z"))).toBe("2026-09-04");
    // 02h30 à Paris = 00h30 UTC : on est passé au défi suivant.
    expect(dailyKey(new Date("2026-09-05T00:30:00Z"))).toBe("2026-09-05");
  });
});

describe("dailySeed", () => {
  it("est stable dans la journée et change le lendemain", () => {
    expect(dailySeed(new Date("2026-09-04T08:00:00Z"))).toBe("daily:2026-09-04");
    expect(dailySeed(new Date("2026-09-04T20:00:00Z"))).toBe("daily:2026-09-04");
    expect(dailySeed(new Date("2026-09-05T08:00:00Z"))).toBe("daily:2026-09-05");
  });
});

describe("DAILY_SETTINGS", () => {
  it("est le pool national, 15 secondes, 10 manches", () => {
    expect(DAILY_SETTINGS).toEqual({
      generations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      roundDurationMs: 15000,
      roundCount: 10,
    });
  });
});

describe("tierOf", () => {
  it("applique les paliers normatifs", () => {
    expect(tierOf(1000)).toBe(4);
    expect(tierOf(999)).toBe(3);
    expect(tierOf(700)).toBe(3);
    expect(tierOf(699)).toBe(2);
    expect(tierOf(400)).toBe(2);
    expect(tierOf(399)).toBe(1);
    expect(tierOf(150)).toBe(1);
    expect(tierOf(149)).toBe(0);
    expect(tierOf(0)).toBe(0);
  });
});

describe("shareText", () => {
  it("produit le format de partage attendu", () => {
    const text = shareText({
      date: new Date("2026-09-04T10:00:00Z"),
      total: 7842,
      points: [1000, 800, 500, 100, 750, 1000, 450, 20, 200, 900],
      url: "https://exemple.fr/daily",
    });
    expect(text).toBe(
      [
        "Pokémon Find — 2026-09-04",
        "7 842 / 10 000",
        "🟦🟩🟨⬛🟩🟦🟨⬛🟧🟩",
        "https://exemple.fr/daily",
      ].join("\n"),
    );
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm vitest run packages/shared/src/domain/settings.test.ts packages/shared/src/domain/daily.test.ts`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire l'implémentation minimale**

`packages/shared/src/domain/settings.ts` :

```ts
import { type GenerationId, isGenerationId } from "./generations.js";

export const ROUND_DURATIONS = [10000, 15000, 25000] as const;
export const ROUND_COUNTS = [5, 10, 15] as const;

export type RoundDurationMs = (typeof ROUND_DURATIONS)[number];
export type RoundCount = (typeof ROUND_COUNTS)[number];

export type GameSettings = {
  generations: GenerationId[];
  roundDurationMs: RoundDurationMs;
  roundCount: RoundCount;
};

export const DEFAULT_SETTINGS: GameSettings = {
  generations: [1],
  roundDurationMs: 15000,
  roundCount: 10,
};

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

export function validateSettings(input: unknown): GameSettings {
  if (typeof input !== "object" || input === null) {
    throw new InvalidSettingsError("Réglages invalides.");
  }
  const candidate = input as Partial<Record<keyof GameSettings, unknown>>;

  if (!Array.isArray(candidate.generations)) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  const generations = [...new Set(candidate.generations)].sort((a, b) => Number(a) - Number(b));
  if (generations.length === 0) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  for (const gen of generations) {
    if (!isGenerationId(gen)) throw new InvalidSettingsError(`Génération invalide : ${String(gen)}`);
  }

  const duration = candidate.roundDurationMs;
  if (!ROUND_DURATIONS.includes(duration as RoundDurationMs)) {
    throw new InvalidSettingsError("Durée de manche invalide.");
  }

  const count = candidate.roundCount;
  if (!ROUND_COUNTS.includes(count as RoundCount)) {
    throw new InvalidSettingsError("Nombre de manches invalide.");
  }

  return {
    generations: generations as GenerationId[],
    roundDurationMs: duration as RoundDurationMs,
    roundCount: count as RoundCount,
  };
}
```

`packages/shared/src/domain/daily.ts` :

```ts
import { ALL_GENERATIONS } from "./generations.js";
import type { GameSettings } from "./settings.js";

export const DAILY_SETTINGS: GameSettings = {
  generations: [...ALL_GENERATIONS],
  roundDurationMs: 15000,
  roundCount: 10,
};

export const TIER_EMOJI = ["⬛", "🟧", "🟨", "🟩", "🟦"] as const;

export function dailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(date: Date): string {
  return `daily:${dailyKey(date)}`;
}

export function tierOf(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points >= 1000) return 4;
  if (points >= 700) return 3;
  if (points >= 400) return 2;
  if (points >= 150) return 1;
  return 0;
}

export function shareText(input: {
  date: Date;
  total: number;
  points: readonly number[];
  url: string;
}): string {
  const max = input.points.length * 1000;
  // toLocaleString("fr-FR") insère U+202F ou U+00A0 comme séparateur de milliers ;
  // on le normalise en espace ordinaire pour rendre le test stable entre versions de Node.
  const format = (value: number) =>
    value.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
  return [
    `Pokémon Find — ${dailyKey(input.date)}`,
    `${format(input.total)} / ${format(max)}`,
    input.points.map((p) => TIER_EMOJI[tierOf(p)]).join(""),
    input.url,
  ].join("\n");
}
```

Ajouter à `index.ts` : `export * from "./domain/settings.js";` et `export * from "./domain/daily.js";`

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm vitest run packages/shared && pnpm typecheck && pnpm lint`
Expected: PASS. Le formatage des milliers avec `toLocaleString("fr-FR")` produit une espace insécable étroite : le remplacement par une espace ordinaire est ce qui rend le test déterministe entre versions de Node.

- [ ] **Step 5: Vérifier la couverture du domaine**

Run: `pnpm vitest run packages/shared --coverage`
Expected: `packages/shared/src/domain` ≥ 95 % en lignes. Compléter les tests si nécessaire.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shared): réglages de partie validés et défi du jour déterministe"
```

---

## Phase 2 — Jeu solo (`@pkfind/web`)

### Task 9: Socle du front et design system

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/vitest.setup.ts`
- Create: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/components/Button.tsx`, `apps/web/src/components/PokemonSprite.tsx`
- Test: `apps/web/src/components/PokemonSprite.test.tsx`

**Interfaces:**
- Consumes: `Pokemon` (Task 6).
- Produces: `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" })`, `PokemonSprite(props: { pokemon: Pokemon; size?: number })`.

- [ ] **Step 1: Créer le paquet front**

`apps/web/package.json` :

```json
{
  "name": "@pkfind/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "@pkfind/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "socket.io-client": "^4.8.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/web/vite.config.ts` :

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/socket.io": { target: "http://localhost:3000", ws: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

`apps/web/vitest.setup.ts` :

```ts
import "@testing-library/jest-dom/vitest";
```

`apps/web/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "vite.config.ts", "vitest.setup.ts"]
}
```

`apps/web/index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pokémon Find</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Space+Mono:wght@700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Écrire les jetons de design**

`apps/web/src/styles/tokens.css` :

```css
@import "tailwindcss";

:root {
  --bg: #0a0b0f;
  --surface: #14161d;
  --surface-2: #1d202a;
  --border: #2a2e3a;
  --text: #e8eaf0;
  --text-dim: #9aa0ae;
  --accent: #ffcb05;
  --accent-2: #3d7bff;
  --success: #35d07f;
  --warn: #ffb020;
  --danger: #ff4d5e;
  --radius: 14px;
  --radius-sm: 8px;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.mono {
  font-family: "Space Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 3: Écrire le test qui échoue**

`apps/web/src/components/PokemonSprite.test.tsx` :

```tsx
import { pokemonById } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PokemonSprite } from "./PokemonSprite.js";

describe("PokemonSprite", () => {
  it("affiche l'image avec le nom français en texte alternatif", () => {
    render(<PokemonSprite pokemon={pokemonById(25)} />);
    const image = screen.getByRole("img", { name: "Pikachu" });
    expect(image).toHaveAttribute("src", pokemonById(25).spriteUrl);
  });

  it("bascule sur une pastille avec l'initiale si l'image échoue", () => {
    render(<PokemonSprite pokemon={pokemonById(25)} />);
    const image = screen.getByRole("img", { name: "Pikachu" });
    image.dispatchEvent(new Event("error"));
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("n'expose jamais le numéro national en texte ou en infobulle", () => {
    const { container } = render(<PokemonSprite pokemon={pokemonById(25)} />);
    expect(container.textContent ?? "").not.toContain("25");
    expect(container.querySelector("[title]")).toBeNull();
  });
});
```

- [ ] **Step 4: Lancer le test et vérifier qu'il échoue**

Run: `pnpm -F @pkfind/web exec vitest run src/components/PokemonSprite.test.tsx`
Expected: FAIL — module `./PokemonSprite.js` introuvable.

- [ ] **Step 5: Écrire l'implémentation minimale**

`apps/web/src/components/PokemonSprite.tsx` :

```tsx
import type { Pokemon } from "@pkfind/shared";
import { useEffect, useState } from "react";

export function PokemonSprite({ pokemon, size = 64 }: { pokemon: Pokemon; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [pokemon.id]);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={pokemon.nameFr}
        className="mono inline-flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: "var(--surface-2)",
          color: "var(--text-dim)",
          fontSize: size * 0.4,
        }}
      >
        {pokemon.nameFr.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={pokemon.spriteUrl}
      alt={pokemon.nameFr}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
```

`apps/web/src/components/Button.tsx` :

```tsx
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

const STYLES: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-[var(--accent)] text-[#0a0b0f] font-extrabold",
  ghost: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]",
  danger: "bg-[var(--danger)] text-white font-semibold",
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`rounded-[var(--radius-sm)] px-5 py-3 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${STYLES[variant]} ${className}`}
    />
  );
}
```

`apps/web/src/main.tsx` :

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import "./styles/tokens.css";

const container = document.getElementById("root");
if (!container) throw new Error("Élément #root introuvable");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`apps/web/src/App.tsx` (routes complétées aux tâches 13, 14 et 19) :

```tsx
import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-8">
      <Routes>
        <Route path="*" element={<p>Pokémon Find</p>} />
      </Routes>
    </main>
  );
}
```

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run && pnpm typecheck`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): socle Vite/React, jetons de design et composants de base"
```

---

### Task 10: Champ de réponse avec autocomplétion

**Files:**
- Create: `apps/web/src/components/PokemonCombobox.tsx`
- Test: `apps/web/src/components/PokemonCombobox.test.tsx`

**Interfaces:**
- Consumes: `Pool`, `searchPokemon`, `normalizeName`, `pokemonOfPool`, `Pokemon` (Tasks 2, 5, 6, 7), `PokemonSprite`, `Button` (Task 9).
- Produces: `PokemonCombobox(props: { pool: Pool; disabled?: boolean; onSubmit: (pokemon: Pokemon) => void })`.

**Note sur la fuite par l'URL du sprite :** l'URL de l'artwork contient le numéro national (`.../25.png`). Le critère d'acceptation n°2 de la spécification porte sur le texte visible et les attributs accessibles, pas sur `src` ; quelqu'un qui inspecte le DOM peut donc lire le numéro. C'est un compromis assumé — retirer les sprites des suggestions coûterait plus en lisibilité que ça ne rapporte contre un tricheur qui a déjà ouvert les outils de développement.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/web/src/components/PokemonCombobox.test.tsx` :

```tsx
import { buildPool } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PokemonCombobox } from "./PokemonCombobox.js";

const gen1 = buildPool([1]);

function setup() {
  const onSubmit = vi.fn();
  render(<PokemonCombobox pool={gen1} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup(), input: screen.getByRole("combobox") };
}

describe("PokemonCombobox", () => {
  it("n'ouvre aucune liste tant que rien n'est saisi", () => {
    setup();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("filtre dès le premier caractère et plafonne à 8 suggestions", async () => {
    const { user, input } = setup();
    await user.type(input, "a");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(8);
  });

  it("n'expose jamais le numéro national dans les suggestions", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent ?? "").not.toContain("25");
    expect(listbox.textContent ?? "").not.toContain("025");
    expect(listbox.querySelector("[title]")).toBeNull();
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("aria-label")).toBeNull();
    }
  });

  it("garde le bouton de validation désactivé tant que rien n'est sélectionné", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    expect(screen.getByRole("button", { name: /valider/i })).toBeDisabled();
  });

  it("sélectionne à la première Entrée puis valide à la seconde", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "pika");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Pikachu");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 25 }));
  });

  it("navigue au clavier et boucle aux extrémités", async () => {
    const { user, input } = setup();
    await user.type(input, "char");
    const first = screen.getAllByRole("option")[0]!;
    const last = screen.getAllByRole("option").at(-1)!;
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(last).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("auto-sélectionne un nom exact tapé intégralement", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "ho-oh");
    expect(screen.queryByRole("option")).toBeNull(); // Ho-Oh n'est pas en Gén 1
    await user.clear(input);
    await user.type(input, "mewtwo");
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 150 }));
  });

  it("ferme la liste à Échap puis efface la saisie à la seconde pression", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("refuse un Pokémon hors pool", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "lucario");
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("se désactive entièrement quand disabled est vrai", () => {
    render(<PokemonCombobox pool={gen1} disabled onSubmit={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /valider/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm -F @pkfind/web exec vitest run src/components/PokemonCombobox.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire l'implémentation minimale**

`apps/web/src/components/PokemonCombobox.tsx` :

```tsx
import {
  type Pokemon,
  type Pool,
  normalizeName,
  pokemonOfPool,
  searchPokemon,
} from "@pkfind/shared";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "./Button.js";
import { PokemonSprite } from "./PokemonSprite.js";

type Props = {
  pool: Pool;
  disabled?: boolean;
  onSubmit: (pokemon: Pokemon) => void;
};

export function PokemonCombobox({ pool, disabled = false, onSubmit }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => searchPokemon(query, pool), [query, pool]);
  const members = useMemo(() => pokemonOfPool(pool), [pool]);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  function exactMatch(): Pokemon | null {
    const slug = normalizeName(query);
    if (slug.length === 0) return null;
    const found = members.filter((p) => p.slugFr === slug || p.slugEn === slug);
    return found.length === 1 ? found[0]! : null;
  }

  function choose(pokemon: Pokemon): void {
    setSelected(pokemon);
    setQuery(pokemon.nameFr);
    setOpen(false);
  }

  function submit(pokemon: Pokemon | null): void {
    if (!pokemon) return;
    onSubmit(pokemon);
    setQuery("");
    setSelected(null);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = suggestions[activeIndex];
      if (open && active) {
        choose(active);
        return;
      }
      if (selected) {
        submit(selected);
        return;
      }
      const match = exactMatch();
      if (match) choose(match);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (open) {
        setOpen(false);
        return;
      }
      setQuery("");
      setSelected(null);
    }
  }

  const activeId = suggestions[activeIndex] ? `${listId}-${suggestions[activeIndex]!.id}` : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Nom du Pokémon"
          {...(activeId ? { "aria-activedescendant": activeId } : {})}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder="Nom du Pokémon…"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!selected) {
              const match = exactMatch();
              if (match) choose(match);
            }
            setOpen(false);
          }}
          className="mono h-14 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 text-lg text-[var(--text)]"
        />
        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)]"
          >
            {suggestions.map((pokemon, index) => (
              <li
                key={pokemon.id}
                id={`${listId}-${pokemon.id}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(pokemon);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                  index === activeIndex ? "bg-[var(--surface)]" : ""
                }`}
              >
                <PokemonSprite pokemon={pokemon} size={32} />
                <span>{pokemon.nameFr}</span>
                {pokemon.nameEn !== pokemon.nameFr && (
                  <span className="text-sm text-[var(--text-dim)]">{pokemon.nameEn}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="button" disabled={disabled || !selected} onClick={() => submit(selected)}>
        Valider
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run src/components/PokemonCombobox.test.tsx`
Expected: 10 tests PASS. Si le test de bouclage échoue, vérifier que `activeIndex` est bien remis à 0 à chaque frappe et que le modulo gère l'index négatif.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): champ de réponse avec autocomplétion restreinte au pool"
```

---

### Task 11: Affichage de la cible et du chrono

**Files:**
- Create: `apps/web/src/components/TargetNumber.tsx`, `apps/web/src/components/Timer.tsx`
- Test: `apps/web/src/components/TargetNumber.test.tsx`, `apps/web/src/components/Timer.test.tsx`

**Interfaces:**
- Consumes: rien.
- Produces: `TargetNumber(props: { id: number; maxId: number })`, `Timer(props: { remainingMs: number; totalMs: number })`.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/TargetNumber.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TargetNumber } from "./TargetNumber.js";

describe("TargetNumber", () => {
  it("complète sur 3 chiffres quand le pool tient sous 1000", () => {
    render(<TargetNumber id={25} maxId={151} />);
    expect(screen.getByText("025")).toBeInTheDocument();
  });

  it("complète sur 4 chiffres pour le pool national", () => {
    render(<TargetNumber id={782} maxId={1025} />);
    expect(screen.getByText("0782")).toBeInTheDocument();
  });

  it("annonce le numéro aux lecteurs d'écran", () => {
    render(<TargetNumber id={25} maxId={151} />);
    expect(screen.getByLabelText("Numéro cible 25")).toBeInTheDocument();
  });
});
```

`apps/web/src/components/Timer.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timer } from "./Timer.js";

describe("Timer", () => {
  it("arrondit les secondes vers le haut", () => {
    render(<Timer remainingMs={14200} totalMs={15000} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("n'affiche jamais de valeur négative", () => {
    render(<Timer remainingMs={-500} totalMs={15000} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("annonce une seule fois les 5 secondes restantes aux lecteurs d'écran", () => {
    const { rerender } = render(<Timer remainingMs={6000} totalMs={15000} />);
    expect(screen.queryByText("5 secondes restantes")).toBeNull();
    rerender(<Timer remainingMs={5000} totalMs={15000} />);
    const alert = screen.getByText("5 secondes restantes");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    rerender(<Timer remainingMs={1500} totalMs={15000} />);
    expect(screen.queryByText("5 secondes restantes")).toBeNull();
  });

  it("passe en alerte sous 5 secondes puis en danger sous 2 secondes", () => {
    const { rerender, container } = render(<Timer remainingMs={6000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "normal");
    rerender(<Timer remainingMs={5000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "warn");
    rerender(<Timer remainingMs={2000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "danger");
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/web exec vitest run src/components/TargetNumber.test.tsx src/components/Timer.test.tsx`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire l'implémentation minimale**

`apps/web/src/components/TargetNumber.tsx` :

```tsx
export function TargetNumber({ id, maxId }: { id: number; maxId: number }) {
  const width = maxId > 999 ? 4 : 3;
  return (
    <p
      aria-label={`Numéro cible ${id}`}
      className="mono my-6 text-center leading-none"
      style={{ fontSize: "clamp(4rem, 18vw, 10rem)", color: "var(--accent)" }}
    >
      <span aria-hidden="true" style={{ fontSize: "0.4em", color: "var(--text-dim)" }}>
        #
      </span>
      <span>{String(id).padStart(width, "0")}</span>
    </p>
  );
}
```

`apps/web/src/components/Timer.tsx` :

```tsx
const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COLORS = {
  normal: "var(--accent-2)",
  warn: "var(--warn)",
  danger: "var(--danger)",
} as const;

export function Timer({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const clamped = Math.max(0, Math.min(remainingMs, totalMs));
  const seconds = Math.ceil(clamped / 1000);
  const state = clamped <= 2000 ? "danger" : clamped <= 5000 ? "warn" : "normal";
  const ratio = totalMs > 0 ? clamped / totalMs : 0;

  return (
    <div data-state={state} className="flex items-center justify-center">
      {/* Le chrono n'est pas dans une région live : seul le seuil des 5 s est annoncé. */}
      {state === "warn" && (
        <span aria-live="assertive" className="sr-only">
          5 secondes restantes
        </span>
      )}
      <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={RADIUS}
          fill="none"
          stroke={COLORS[state]}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          transform="rotate(-90 22 22)"
        />
        <text
          x="22"
          y="27"
          textAnchor="middle"
          className="mono"
          fill="var(--text)"
          fontSize="14"
        >
          {seconds}
        </text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): affichage de la cible et anneau de chrono"
```

---

### Task 12: Stockage navigateur et machine à états solo

**Files:**
- Create: `apps/web/src/storage/local.ts`, `apps/web/src/storage/scores.ts`
- Create: `apps/web/src/game/useSoloGame.ts`
- Test: `apps/web/src/storage/local.test.ts`, `apps/web/src/storage/scores.test.ts`, `apps/web/src/game/useSoloGame.test.ts`

**Interfaces:**
- Consumes: `buildPool`, `pickTargets`, `rngFromSeed`, `scoreForAnswer`, `GameSettings`, `poolSignature` (Tasks 2, 3, 4, 8).
- Produces:
  - `KEYS = { nickname, best, daily, session }`, `readJson<T>(key: string, fallback: T, kind?: "local" | "session"): T`, `writeJson(key: string, value: unknown, kind?: "local" | "session"): void`, `removeKey(key: string, kind?: "local" | "session"): void`
  - `type BestEntry = { score: number; date: string }`, `bestKey(settings: GameSettings): string`, `readBest(settings: GameSettings): BestEntry | null`, `saveBest(settings: GameSettings, score: number): boolean`
  - `SOLO_REVEAL_MS = 3000`, `type SoloRound`, `type SoloPhase`, `type SoloGame`, `useSoloGame(settings: GameSettings, seed: string): SoloGame`

- [ ] **Step 1: Écrire les tests de stockage qui échouent**

`apps/web/src/storage/local.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYS, readJson, removeKey, writeJson } from "./local.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("stockage tolérant", () => {
  it("écrit puis relit une valeur", () => {
    writeJson(KEYS.nickname, "Mathéo");
    expect(readJson(KEYS.nickname, "")).toBe("Mathéo");
  });

  it("renvoie la valeur de repli si la clé est absente", () => {
    expect(readJson("pkfind.absent", { a: 1 })).toEqual({ a: 1 });
  });

  it("renvoie la valeur de repli si le JSON est corrompu", () => {
    localStorage.setItem(KEYS.best, "{pas du json");
    expect(readJson(KEYS.best, null)).toBeNull();
  });

  it("n'explose pas si l'écriture échoue", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => writeJson(KEYS.nickname, "Mathéo")).not.toThrow();
  });

  it("n'explose pas si la lecture échoue", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    expect(readJson(KEYS.nickname, "repli")).toBe("repli");
  });

  it("supprime une clé", () => {
    writeJson(KEYS.daily, { date: "2026-09-04" });
    removeKey(KEYS.daily);
    expect(readJson(KEYS.daily, null)).toBeNull();
  });
});
```

`apps/web/src/storage/scores.test.ts` :

```ts
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { afterEach, describe, expect, it } from "vitest";
import { bestKey, readBest, saveBest } from "./scores.js";

afterEach(() => localStorage.clear());

describe("meilleurs scores", () => {
  it("construit une clé stable à partir des réglages", () => {
    expect(bestKey(DEFAULT_SETTINGS)).toBe("1|15000|10");
    expect(bestKey({ ...DEFAULT_SETTINGS, generations: [3, 1] })).toBe("1-3|15000|10");
  });

  it("enregistre un premier score", () => {
    expect(saveBest(DEFAULT_SETTINGS, 5000)).toBe(true);
    expect(readBest(DEFAULT_SETTINGS)?.score).toBe(5000);
  });

  it("n'écrase que sur un score strictement supérieur", () => {
    saveBest(DEFAULT_SETTINGS, 5000);
    expect(saveBest(DEFAULT_SETTINGS, 5000)).toBe(false);
    expect(saveBest(DEFAULT_SETTINGS, 4999)).toBe(false);
    expect(saveBest(DEFAULT_SETTINGS, 5001)).toBe(true);
    expect(readBest(DEFAULT_SETTINGS)?.score).toBe(5001);
  });

  it("sépare les scores par configuration", () => {
    saveBest(DEFAULT_SETTINGS, 5000);
    expect(readBest({ ...DEFAULT_SETTINGS, roundCount: 5 })).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/web exec vitest run src/storage`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire le stockage**

`apps/web/src/storage/local.ts` :

```ts
export const KEYS = {
  nickname: "pkfind.nickname.v1",
  best: "pkfind.best.v1",
  daily: "pkfind.daily.v1",
  session: "pkfind.session.v1",
} as const;

type Kind = "local" | "session";

function storageOf(kind: Kind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T, kind: Kind = "local"): T {
  try {
    const raw = storageOf(kind)?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: Kind = "local"): void {
  try {
    storageOf(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    // Mode privé, quota atteint : le jeu doit rester jouable sans stockage.
  }
}

export function removeKey(key: string, kind: Kind = "local"): void {
  try {
    storageOf(kind)?.removeItem(key);
  } catch {
    // idem
  }
}
```

`apps/web/src/storage/scores.ts` :

```ts
import { type GameSettings, poolSignature } from "@pkfind/shared";
import { KEYS, readJson, writeJson } from "./local.js";

export type BestEntry = { score: number; date: string };

type BestMap = Record<string, BestEntry>;

export function bestKey(settings: GameSettings): string {
  return `${poolSignature(settings.generations)}|${settings.roundDurationMs}|${settings.roundCount}`;
}

export function readBest(settings: GameSettings): BestEntry | null {
  const map = readJson<BestMap>(KEYS.best, {});
  return map[bestKey(settings)] ?? null;
}

export function saveBest(settings: GameSettings, score: number): boolean {
  const map = readJson<BestMap>(KEYS.best, {});
  const key = bestKey(settings);
  const previous = map[key];
  if (previous && score <= previous.score) return false;
  map[key] = { score, date: new Date().toISOString() };
  writeJson(KEYS.best, map);
  return true;
}
```

- [ ] **Step 4: Écrire le test de la machine à états solo**

`apps/web/src/game/useSoloGame.test.ts` :

```ts
import { DEFAULT_SETTINGS, buildPool, pickTargets, rngFromSeed } from "@pkfind/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOLO_REVEAL_MS, useSoloGame } from "./useSoloGame.js";

const SEED = "solo:test";
const targets = pickTargets(
  buildPool(DEFAULT_SETTINGS.generations).ids,
  DEFAULT_SETTINGS.roundCount,
  rngFromSeed(SEED),
);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useSoloGame", () => {
  it("démarre sur la manche 1 avec la première cible de la graine", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    expect(result.current.phase).toBe("round");
    expect(result.current.roundIndex).toBe(0);
    expect(result.current.targetId).toBe(targets[0]);
    expect(result.current.remainingMs).toBe(DEFAULT_SETTINGS.roundDurationMs);
  });

  it("marque 1000 points pour une réponse exacte et passe en révélation", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    expect(result.current.phase).toBe("reveal");
    expect(result.current.totalScore).toBe(1000);
    expect(result.current.rounds[0]?.points).toBe(1000);
    expect(result.current.rounds[0]?.answerId).toBe(targets[0]);
  });

  it("enchaîne automatiquement après la révélation", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    advance(SOLO_REVEAL_MS + 100);
    expect(result.current.phase).toBe("round");
    expect(result.current.roundIndex).toBe(1);
    expect(result.current.targetId).toBe(targets[1]);
  });

  it("permet de passer la révélation immédiatement", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    act(() => result.current.skipReveal());
    expect(result.current.roundIndex).toBe(1);
  });

  it("compte zéro quand le chrono expire sans réponse", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    advance(DEFAULT_SETTINGS.roundDurationMs + 200);
    expect(result.current.phase).toBe("reveal");
    expect(result.current.rounds[0]).toMatchObject({ answerId: null, points: 0, responseTimeMs: null });
  });

  it("ignore une seconde réponse dans la même manche", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    act(() => result.current.answer(targets[0]!));
    act(() => result.current.answer(targets[1]!));
    expect(result.current.rounds).toHaveLength(1);
  });

  it("termine après le nombre de manches configuré", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    for (let i = 0; i < DEFAULT_SETTINGS.roundCount; i++) {
      act(() => result.current.answer(result.current.targetId));
      advance(SOLO_REVEAL_MS + 100);
    }
    expect(result.current.phase).toBe("finished");
    expect(result.current.rounds).toHaveLength(DEFAULT_SETTINGS.roundCount);
    expect(result.current.totalScore).toBe(1000 * DEFAULT_SETTINGS.roundCount);
  });

  it("ne tire jamais deux fois la même cible", () => {
    const { result } = renderHook(() => useSoloGame(DEFAULT_SETTINGS, SEED));
    const seen: number[] = [];
    for (let i = 0; i < DEFAULT_SETTINGS.roundCount; i++) {
      seen.push(result.current.targetId);
      act(() => result.current.answer(result.current.targetId));
      advance(SOLO_REVEAL_MS + 100);
    }
    expect(new Set(seen).size).toBe(DEFAULT_SETTINGS.roundCount);
  });
});
```

- [ ] **Step 5: Lancer le test et vérifier qu'il échoue**

Run: `pnpm -F @pkfind/web exec vitest run src/game/useSoloGame.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 6: Écrire la machine à états**

`apps/web/src/game/useSoloGame.ts` :

```ts
import {
  type GameSettings,
  type Pool,
  buildPool,
  pickTargets,
  rngFromSeed,
  scoreForAnswer,
} from "@pkfind/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SOLO_REVEAL_MS = 3000;

export type SoloPhase = "round" | "reveal" | "finished";

export type SoloRound = {
  targetId: number;
  answerId: number | null;
  points: number;
  responseTimeMs: number | null;
};

export type SoloGame = {
  phase: SoloPhase;
  roundIndex: number;
  roundCount: number;
  targetId: number;
  remainingMs: number;
  totalScore: number;
  rounds: SoloRound[];
  pool: Pool;
  answer: (pokemonId: number) => void;
  skipReveal: () => void;
};

export function useSoloGame(settings: GameSettings, seed: string): SoloGame {
  const pool = useMemo(() => buildPool(settings.generations), [settings.generations]);
  const targets = useMemo(
    () => pickTargets(pool.ids, settings.roundCount, rngFromSeed(seed)),
    [pool, settings.roundCount, seed],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<SoloPhase>("round");
  const [rounds, setRounds] = useState<SoloRound[]>([]);
  const [deadline, setDeadline] = useState(() => Date.now() + settings.roundDurationMs);
  const [now, setNow] = useState(() => Date.now());

  const answered = useRef(false);
  const roundStartedAt = useRef(Date.now());

  const finishRound = useCallback(
    (answerId: number | null) => {
      if (answered.current) return;
      answered.current = true;
      const targetId = targets[index]!;
      const at = Date.now();
      setRounds((list) => [
        ...list,
        {
          targetId,
          answerId,
          points: scoreForAnswer(targetId, answerId, pool.span),
          responseTimeMs: answerId === null ? null : at - roundStartedAt.current,
        },
      ]);
      setDeadline(at + SOLO_REVEAL_MS);
      setNow(at);
      setPhase("reveal");
    },
    [index, pool.span, targets],
  );

  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= targets.length) {
      setPhase("finished");
      return;
    }
    const at = Date.now();
    answered.current = false;
    roundStartedAt.current = at;
    setIndex(next);
    setDeadline(at + settings.roundDurationMs);
    setNow(at);
    setPhase("round");
  }, [index, settings.roundDurationMs, targets.length]);

  useEffect(() => {
    if (phase === "finished") return undefined;
    const handle = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(handle);
  }, [phase]);

  useEffect(() => {
    if (now < deadline) return;
    if (phase === "round") finishRound(null);
    else if (phase === "reveal") advance();
  }, [advance, deadline, finishRound, now, phase]);

  return {
    phase,
    roundIndex: index,
    roundCount: targets.length,
    targetId: targets[index] ?? targets[targets.length - 1]!,
    remainingMs: phase === "round" ? Math.max(0, deadline - now) : 0,
    totalScore: rounds.reduce((sum, round) => sum + round.points, 0),
    rounds,
    pool,
    answer: finishRound,
    skipReveal: () => {
      if (phase === "reveal") advance();
    },
  };
}
```

- [ ] **Step 7: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run && pnpm typecheck`
Expected: PASS. Si `remainingMs` n'est pas exactement `roundDurationMs` au premier rendu, vérifier que `now` et `deadline` sont initialisés au même `Date.now()` — d'où l'usage de `vi.useFakeTimers()` qui fige l'horloge.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): stockage tolérant aux pannes et machine à états de la partie solo"
```

---

### Task 13: Écrans du mode solo

**Files:**
- Create: `apps/web/src/components/GenerationPicker.tsx`, `apps/web/src/components/RoundResult.tsx`, `apps/web/src/components/GameOver.tsx`
- Create: `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/SoloSetup.tsx`, `apps/web/src/pages/SoloGame.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/components/GenerationPicker.test.tsx`, `apps/web/src/pages/SoloSetup.test.tsx`

**Interfaces:**
- Consumes: tout le paquet `shared`, `useSoloGame` (Task 12), `PokemonCombobox` (Task 10), `TargetNumber`, `Timer` (Task 11), `readBest`, `saveBest` (Task 12).
- Produces: `GenerationPicker(props: { value: GenerationId[]; onChange: (next: GenerationId[]) => void })`, `RoundResult(props: { round: SoloRound; pool: Pool; onSkip?: () => void })`, `GameOver(props: { rounds: SoloRound[]; settings: GameSettings; onReplay: () => void })`, pages `Home`, `SoloSetup`, `SoloGame`.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/GenerationPicker.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerationPicker } from "./GenerationPicker.js";

describe("GenerationPicker", () => {
  it("affiche les neuf générations", () => {
    render(<GenerationPicker value={[1]} onChange={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });

  it("coche celles qui sont sélectionnées", () => {
    render(<GenerationPicker value={[1, 3]} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /génération 1/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /génération 2/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /génération 3/i })).toBeChecked();
  });

  it("ajoute une génération en gardant l'ordre croissant", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[3]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 1/i }));
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("retire une génération", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1, 3]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 3/i }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("refuse de retirer la dernière génération cochée", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 1/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sélectionne tout d'un clic", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
```

`apps/web/src/pages/SoloSetup.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SoloSetup } from "./SoloSetup.js";

function renderSetup() {
  render(
    <MemoryRouter initialEntries={["/solo"]}>
      <Routes>
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/solo/play" element={<p>Partie lancée</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SoloSetup", () => {
  it("propose les trois durées et les trois formats de partie", () => {
    renderSetup();
    expect(screen.getByRole("radio", { name: "10 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "15 s" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "25 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10 manches" })).toBeChecked();
  });

  it("lance la partie", async () => {
    renderSetup();
    await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
    expect(screen.getByText("Partie lancée")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/web exec vitest run src/components/GenerationPicker.test.tsx src/pages/SoloSetup.test.tsx`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire les composants**

`apps/web/src/components/GenerationPicker.tsx` :

```tsx
import { ALL_GENERATIONS, type GenerationId } from "@pkfind/shared";
import { Button } from "./Button.js";

type Props = { value: GenerationId[]; onChange: (next: GenerationId[]) => void };

export function GenerationPicker({ value, onChange }: Props) {
  function toggle(gen: GenerationId): void {
    if (value.includes(gen)) {
      if (value.length === 1) return; // au moins une génération doit rester cochée
      onChange(value.filter((item) => item !== gen));
      return;
    }
    onChange([...value, gen].sort((a, b) => a - b));
  }

  return (
    <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
      <legend className="px-2 text-sm text-[var(--text-dim)]">Générations</legend>
      <div className="grid grid-cols-3 gap-2">
        {ALL_GENERATIONS.map((gen) => (
          <label
            key={gen}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2"
          >
            <input
              type="checkbox"
              aria-label={`Génération ${gen}`}
              checked={value.includes(gen)}
              onChange={() => toggle(gen)}
            />
            <span className="mono">Gén {gen}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="ghost" onClick={() => onChange([...ALL_GENERATIONS])}>
          Tout sélectionner
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange([1])}>
          Gén 1 seulement
        </Button>
      </div>
    </fieldset>
  );
}
```

`apps/web/src/components/RoundResult.tsx` :

```tsx
import { type Pool, pokemonById, tryPokemonById } from "@pkfind/shared";
import type { SoloRound } from "../game/useSoloGame.js";
import { PokemonSprite } from "./PokemonSprite.js";

export function RoundResult({
  round,
  pool,
  onSkip,
}: {
  round: SoloRound;
  pool: Pool;
  onSkip?: () => void;
}) {
  const target = pokemonById(round.targetId);
  const answer = round.answerId === null ? null : tryPokemonById(round.answerId);
  const gap = round.answerId === null ? null : Math.abs(round.answerId - round.targetId);

  return (
    <section
      role="button"
      tabIndex={0}
      aria-live="polite"
      onClick={onSkip}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSkip?.();
      }}
      className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center"
    >
      <PokemonSprite pokemon={target} size={160} />
      <p className="text-2xl font-extrabold">{target.nameFr}</p>
      <p className="mono text-[var(--text-dim)]">
        #{String(target.id).padStart(pool.maxId > 999 ? 4 : 3, "0")}
      </p>
      <p>
        {answer
          ? `Votre réponse : ${answer.nameFr} — écart ${gap}`
          : "Pas de réponse — temps écoulé"}
      </p>
      <p className="mono text-4xl" style={{ color: "var(--accent)" }}>
        +{round.points}
      </p>
      {onSkip && <p className="text-sm text-[var(--text-dim)]">Clic ou Entrée pour continuer</p>}
    </section>
  );
}
```

`apps/web/src/components/GameOver.tsx` :

```tsx
import { type GameSettings, pokemonById, tryPokemonById } from "@pkfind/shared";
import type { SoloRound } from "../game/useSoloGame.js";
import { readBest, saveBest } from "../storage/scores.js";
import { Button } from "./Button.js";

export function GameOver({
  rounds,
  settings,
  onReplay,
}: {
  rounds: SoloRound[];
  settings: GameSettings;
  onReplay: () => void;
}) {
  const total = rounds.reduce((sum, round) => sum + round.points, 0);
  const previousBest = readBest(settings)?.score ?? null;
  const isRecord = saveBest(settings, total);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Partie terminée</h1>
      <p className="mono text-5xl" style={{ color: "var(--accent)" }}>
        {total} / {rounds.length * 1000}
      </p>
      {isRecord ? (
        <p style={{ color: "var(--success)" }}>Nouveau record pour cette configuration.</p>
      ) : (
        previousBest !== null && (
          <p className="text-[var(--text-dim)]">Votre record : {previousBest}</p>
        )
      )}
      <table className="w-full text-left text-sm">
        <thead className="text-[var(--text-dim)]">
          <tr>
            <th scope="col">Cible</th>
            <th scope="col">Pokémon</th>
            <th scope="col">Réponse</th>
            <th scope="col">Écart</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody className="mono">
          {rounds.map((round, index) => {
            const answer = round.answerId === null ? null : tryPokemonById(round.answerId);
            return (
              <tr key={`${round.targetId}-${index}`}>
                <td>#{round.targetId}</td>
                <td>{pokemonById(round.targetId).nameFr}</td>
                <td>{answer?.nameFr ?? "—"}</td>
                <td>{round.answerId === null ? "—" : Math.abs(round.answerId - round.targetId)}</td>
                <td>{round.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Button onClick={onReplay}>Rejouer</Button>
    </section>
  );
}
```

- [ ] **Step 4: Écrire les pages et les routes**

`apps/web/src/pages/Home.tsx` :

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  function go(path: string): void {
    writeJson(KEYS.nickname, nickname.trim());
    navigate(path);
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-4xl font-extrabold">Pokémon Find</h1>
      <p className="text-[var(--text-dim)]">
        Un numéro s'affiche. Trouve le Pokémon — exact, ou le plus proche possible.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Ton pseudo</span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={16}
          placeholder="Sacha"
          className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      <div className="grid gap-3">
        <Button onClick={() => go("/solo")}>Jouer en solo</Button>
        <Button variant="ghost" onClick={() => go("/daily")}>
          Défi du jour
        </Button>
        <Button variant="ghost" onClick={() => go("/room/new")}>
          Créer une room
        </Button>
        <Button variant="ghost" onClick={() => go("/join")}>
          Rejoindre une room
        </Button>
      </div>
    </section>
  );
}
```

`apps/web/src/pages/SoloSetup.tsx` :

```tsx
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  ROUND_COUNTS,
  ROUND_DURATIONS,
  type RoundCount,
  type RoundDurationMs,
} from "@pkfind/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";

export function SoloSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Partie solo</h1>

      <GenerationPicker
        value={settings.generations}
        onChange={(generations) => setSettings({ ...settings, generations })}
      />

      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Temps par manche</legend>
        <div className="flex gap-4">
          {ROUND_DURATIONS.map((duration) => (
            <label key={duration} className="flex items-center gap-2">
              <input
                type="radio"
                name="duration"
                aria-label={`${duration / 1000} s`}
                checked={settings.roundDurationMs === duration}
                onChange={() =>
                  setSettings({ ...settings, roundDurationMs: duration as RoundDurationMs })
                }
              />
              <span className="mono">{duration / 1000} s</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Nombre de manches</legend>
        <div className="flex gap-4">
          {ROUND_COUNTS.map((count) => (
            <label key={count} className="flex items-center gap-2">
              <input
                type="radio"
                name="count"
                aria-label={`${count} manches`}
                checked={settings.roundCount === count}
                onChange={() => setSettings({ ...settings, roundCount: count as RoundCount })}
              />
              <span className="mono">{count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button onClick={() => navigate("/solo/play", { state: settings })}>Lancer</Button>
    </section>
  );
}
```

`apps/web/src/pages/SoloGame.tsx` :

```tsx
import { type GameSettings, randomSeed, validateSettings } from "@pkfind/shared";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { GameOver } from "../components/GameOver.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { RoundResult } from "../components/RoundResult.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useSoloGame } from "../game/useSoloGame.js";

export function SoloGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const [seed, setSeed] = useState(randomSeed);

  let settings: GameSettings;
  try {
    settings = validateSettings(location.state);
  } catch {
    return <Navigate to="/solo" replace />;
  }

  return <SoloGameBoard settings={settings} seed={seed} onReplay={() => setSeed(randomSeed())} onQuit={() => navigate("/solo")} />;
}

function SoloGameBoard({
  settings,
  seed,
  onReplay,
  onQuit,
}: {
  settings: GameSettings;
  seed: string;
  onReplay: () => void;
  onQuit: () => void;
}) {
  const game = useSoloGame(settings, seed);

  if (game.phase === "finished") {
    return (
      <>
        <GameOver rounds={game.rounds} settings={settings} onReplay={onReplay} />
        <button type="button" className="mt-4 underline" onClick={onQuit}>
          Changer les réglages
        </button>
      </>
    );
  }

  const lastRound = game.rounds[game.rounds.length - 1];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <p className="mono text-[var(--text-dim)]">
          Manche {game.roundIndex + 1} / {game.roundCount}
        </p>
        <p className="mono">{game.totalScore} pts</p>
      </header>

      {game.phase === "round" ? (
        <>
          <Timer remainingMs={game.remainingMs} totalMs={settings.roundDurationMs} />
          <TargetNumber id={game.targetId} maxId={game.pool.maxId} />
          <PokemonCombobox pool={game.pool} onSubmit={(pokemon) => game.answer(pokemon.id)} />
        </>
      ) : (
        lastRound && <RoundResult round={lastRound} pool={game.pool} onSkip={game.skipReveal} />
      )}
    </section>
  );
}
```

`apps/web/src/App.tsx` :

```tsx
import { Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.js";
import { SoloGame } from "./pages/SoloGame.js";
import { SoloSetup } from "./pages/SoloSetup.js";

export function App() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-8">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/solo/play" element={<SoloGame />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </main>
  );
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Vérifier à la main**

Run: `pnpm -F @pkfind/web dev` puis ouvrir `http://localhost:5173`
Expected: on saisit un pseudo, on lance une partie Gén 1, le numéro s'affiche, l'autocomplétion fonctionne, le chrono descend, la révélation dure 3 secondes, l'écran final affiche le récapitulatif.
Vérifier aussi la largeur 375 px dans les outils de développement : aucune barre de défilement horizontale, le numéro cible reste entier grâce au `clamp`, et la liste de suggestions reste lisible.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): écrans du mode solo, du choix des réglages au récapitulatif"
```

---

### Task 14: Défi du jour et parcours solo de bout en bout

**Files:**
- Create: `apps/web/src/pages/Daily.tsx`
- Create: `playwright.config.ts`, `e2e/solo.spec.ts`
- Modify: `apps/web/src/App.tsx`, `package.json` (script `test:e2e`)
- Test: `apps/web/src/pages/Daily.test.tsx`

**Interfaces:**
- Consumes: `DAILY_SETTINGS`, `dailyKey`, `dailySeed`, `shareText` (Task 8), `useSoloGame` (Task 12), composants des tâches 9 à 13.
- Produces: page `Daily`, entrée `pkfind.daily.v1` de forme `{ date: string; total: number; points: number[] }`.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/web/src/pages/Daily.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYS, writeJson } from "../storage/local.js";
import { Daily } from "./Daily.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function renderDaily() {
  render(
    <MemoryRouter>
      <Daily />
    </MemoryRouter>,
  );
}

describe("Daily", () => {
  it("lance une partie quand le défi du jour n'a pas encore été joué", () => {
    renderDaily();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("affiche le résultat déjà obtenu au lieu de relancer une partie", () => {
    writeJson(KEYS.daily, {
      date: "2026-09-04",
      total: 7842,
      points: [1000, 800, 500, 100, 750, 1000, 450, 20, 200, 900],
    });
    renderDaily();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/7 842/)).toBeInTheDocument();
    expect(screen.getByText("🟦🟩🟨⬛🟩🟦🟨⬛🟧🟩")).toBeInTheDocument();
  });

  it("relance une partie si l'entrée mémorisée date d'un autre jour", () => {
    writeJson(KEYS.daily, { date: "2026-09-03", total: 100, points: [100] });
    renderDaily();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm -F @pkfind/web exec vitest run src/pages/Daily.test.tsx`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire la page**

`apps/web/src/pages/Daily.tsx` :

```tsx
import { DAILY_SETTINGS, TIER_EMOJI, dailyKey, dailySeed, shareText, tierOf } from "@pkfind/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { RoundResult } from "../components/RoundResult.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useSoloGame } from "../game/useSoloGame.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

type DailyEntry = { date: string; total: number; points: number[] };

export function Daily() {
  const today = dailyKey(new Date());
  const [entry, setEntry] = useState<DailyEntry | null>(() => {
    const stored = readJson<DailyEntry | null>(KEYS.daily, null);
    return stored && stored.date === today ? stored : null;
  });

  if (entry) return <DailyResult entry={entry} />;
  return <DailyBoard onFinish={setEntry} today={today} />;
}

function DailyBoard({
  today,
  onFinish,
}: {
  today: string;
  onFinish: (entry: DailyEntry) => void;
}) {
  const game = useSoloGame(DAILY_SETTINGS, dailySeed(new Date()));

  useEffect(() => {
    if (game.phase !== "finished") return;
    const result: DailyEntry = {
      date: today,
      total: game.totalScore,
      points: game.rounds.map((round) => round.points),
    };
    writeJson(KEYS.daily, result);
    onFinish(result);
  }, [game.phase, game.rounds, game.totalScore, onFinish, today]);

  if (game.phase === "finished") return null;

  const lastRound = game.rounds[game.rounds.length - 1];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Défi du jour — {today}</h1>
        <p className="mono">{game.totalScore} pts</p>
      </header>
      <p className="mono text-sm text-[var(--text-dim)]">
        Manche {game.roundIndex + 1} / {game.roundCount} · Pokédex national
      </p>
      {game.phase === "round" ? (
        <>
          <Timer remainingMs={game.remainingMs} totalMs={DAILY_SETTINGS.roundDurationMs} />
          <TargetNumber id={game.targetId} maxId={game.pool.maxId} />
          <PokemonCombobox pool={game.pool} onSubmit={(pokemon) => game.answer(pokemon.id)} />
        </>
      ) : (
        lastRound && <RoundResult round={lastRound} pool={game.pool} onSkip={game.skipReveal} />
      )}
    </section>
  );
}

function DailyResult({ entry }: { entry: DailyEntry }) {
  const [copied, setCopied] = useState(false);
  const emojis = entry.points.map((points) => TIER_EMOJI[tierOf(points)]).join("");
  const max = entry.points.length * 1000;

  async function copy(): Promise<void> {
    const text = shareText({
      date: new Date(`${entry.date}T12:00:00Z`),
      total: entry.total,
      points: entry.points,
      url: `${window.location.origin}/daily`,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt("Copie ce résumé :", text);
    }
  }

  return (
    <section className="flex flex-col gap-4 text-center">
      <h1 className="text-2xl font-extrabold">Défi du jour — {entry.date}</h1>
      <p className="mono text-5xl" style={{ color: "var(--accent)" }}>
        {entry.total.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")}
      </p>
      <p className="text-3xl tracking-widest">{emojis}</p>
      <Button onClick={copy}>{copied ? "Copié" : "Partager le résultat"}</Button>
      <p className="text-sm text-[var(--text-dim)]">Reviens demain pour un nouveau défi.</p>
      <Link to="/" className="underline">
        Retour à l'accueil
      </Link>
    </section>
  );
}
```

Ajouter la route dans `App.tsx` : `<Route path="/daily" element={<Daily />} />`.

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run`
Expected: PASS. Le test attend `7 842` avec une espace : `toLocaleString("fr-FR")` insère une espace insécable, donc utiliser un `getByText` avec une expression régulière tolérante — `screen.getByText(/7\s842/)` si l'assertion stricte échoue.

- [ ] **Step 5: Installer Playwright et écrire le parcours solo**

Run: `pnpm add -Dw @playwright/test && pnpm exec playwright install chromium`

`playwright.config.ts` (adapté à la tâche 20 pour couvrir le multijoueur) :

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "pnpm -F @pkfind/web build && pnpm -F @pkfind/web preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

`e2e/solo.spec.ts` :

```ts
import { expect, test } from "@playwright/test";

test("une partie solo de 10 manches se joue jusqu'au récapitulatif", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Sacha").fill("Mathéo");
  await page.getByRole("button", { name: "Jouer en solo" }).click();
  await page.getByRole("button", { name: "Lancer" }).click();

  for (let round = 1; round <= 10; round++) {
    await expect(page.getByText(`Manche ${round} / 10`)).toBeVisible();
    await page.getByRole("combobox").fill("pikachu");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.getByText(/Votre réponse|temps écoulé/).click();
  }

  await expect(page.getByRole("heading", { name: "Partie terminée" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(11); // en-tête + 10 manches
});

test("le défi du jour affiche son résultat au second passage", async ({ page }) => {
  await page.goto("/daily");
  for (let round = 1; round <= 10; round++) {
    await page.getByRole("combobox").fill("pikachu");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.getByText(/Votre réponse|temps écoulé/).click();
  }
  await expect(page.getByRole("button", { name: /Partager/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Partager/ })).toBeVisible();
});
```

Ajouter au `package.json` racine : `"test:e2e": "playwright test"`.

- [ ] **Step 6: Lancer les tests de bout en bout**

Run: `pnpm test:e2e`
Expected: 2 tests PASS. Si un test dépasse le délai, c'est probablement que la révélation de 3 secondes n'est pas passée : le clic sur le bloc de résultat doit la raccourcir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): défi du jour partageable et parcours solo de bout en bout"
```

---

## Phase 3 — Multijoueur

### Task 15: Protocole partagé et socle du serveur

**Files:**
- Create: `packages/shared/src/protocol/events.ts`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/config.ts`, `apps/server/src/log.ts`, `apps/server/src/http.ts`, `apps/server/src/index.ts`
- Test: `apps/server/src/config.test.ts`, `apps/server/src/http.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `GameSettings` (Task 8), `Pokemon` (Task 6).
- Produces:
  - Types `RoomStatus`, `PlayerPublic`, `RoomState`, `RoundResult`, `Standing`, `ErrorCode`, `Ack<T>`, `ClientToServerEvents`, `ServerToClientEvents`, `ERROR_MESSAGES: Record<ErrorCode, string>`
  - `type Config`, `loadConfig(env?: NodeJS.ProcessEnv): Config`, `class ConfigError extends Error`
  - `createHttpApp(config: Config, stats: () => { rooms: number; players: number }): express.Express`
  - `log.info/warn/error(event: string, data?: Record<string, unknown>): void`

- [ ] **Step 1: Écrire le protocole partagé**

`packages/shared/src/protocol/events.ts` :

```ts
import type { Pokemon } from "../data/pokemon.js";
import type { GameSettings } from "../domain/settings.js";

export type RoomStatus = "lobby" | "countdown" | "round" | "reveal" | "finished";

export type PlayerPublic = {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  hasAnswered: boolean;
};

export type RoomState = {
  code: string;
  status: RoomStatus;
  settings: GameSettings;
  players: PlayerPublic[];
  roundIndex: number;
  roundCount: number;
};

export type RoundResult = {
  playerId: string;
  nickname: string;
  pokemonId: number | null;
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

export const ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "GAME_IN_PROGRESS",
  "NOT_HOST",
  "NOT_IN_ROOM",
  "NOT_ENOUGH_PLAYERS",
  "INVALID_NICKNAME",
  "INVALID_SETTINGS",
  "INVALID_CODE",
  "ALREADY_ANSWERED",
  "ROUND_CLOSED",
  "NOT_IN_POOL",
  "INVALID_TOKEN",
  "RATE_LIMITED",
  "SERVER_BUSY",
  "CODE_EXHAUSTED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: "Cette room n'existe pas ou plus.",
  ROOM_FULL: "Cette room est complète (8 joueurs maximum).",
  GAME_IN_PROGRESS: "La partie a déjà commencé, impossible de rejoindre.",
  NOT_HOST: "Seul l'hôte peut faire ça.",
  NOT_IN_ROOM: "Tu n'es pas dans cette room.",
  NOT_ENOUGH_PLAYERS: "Il faut au moins 2 joueurs connectés pour démarrer.",
  INVALID_NICKNAME: "Pseudo invalide : 2 à 16 caractères, lettres et chiffres.",
  INVALID_SETTINGS: "Réglages de partie invalides.",
  INVALID_CODE: "Ce code contient un caractère invalide.",
  ALREADY_ANSWERED: "Tu as déjà répondu à cette manche.",
  ROUND_CLOSED: "Trop tard, la manche est terminée.",
  NOT_IN_POOL: "Ce Pokémon ne fait pas partie de la sélection.",
  INVALID_TOKEN: "Session invalide, reconnecte-toi.",
  RATE_LIMITED: "Trop de requêtes, ralentis un peu.",
  SERVER_BUSY: "Le serveur est saturé, réessaie dans un instant.",
  CODE_EXHAUSTED: "Impossible de générer un code, réessaie.",
  INTERNAL: "Erreur interne du serveur.",
};

export type Ack<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

export type JoinPayload = {
  roomCode: string;
  playerId: string;
  playerToken: string;
  nickname: string;
  state: RoomState;
};

export type ClientToServerEvents = {
  "room:create": (
    input: { nickname: string; settings: GameSettings },
    ack: (result: Ack<JoinPayload>) => void,
  ) => void;
  "room:join": (
    input: { roomCode: string; nickname: string },
    ack: (result: Ack<JoinPayload>) => void,
  ) => void;
  "room:rejoin": (
    input: { roomCode: string; playerId: string; playerToken: string },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "room:leave": (input: Record<string, never>, ack: (result: Ack<null>) => void) => void;
  "room:settings": (
    input: { settings: GameSettings },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "room:start": (input: Record<string, never>, ack: (result: Ack<null>) => void) => void;
  "room:playAgain": (
    input: Record<string, never>,
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "round:answer": (
    input: { roundIndex: number; pokemonId: number },
    ack: (result: Ack<{ accepted: true }>) => void,
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (state: RoomState) => void;
  "game:countdown": (payload: { startsAt: number; serverNow: number }) => void;
  "round:start": (payload: {
    roundIndex: number;
    roundCount: number;
    targetId: number;
    endsAt: number;
    serverNow: number;
  }) => void;
  "round:answered": (payload: { playerId: string }) => void;
  "round:reveal": (payload: {
    roundIndex: number;
    target: Pokemon;
    results: RoundResult[];
    standings: Standing[];
    revealEndsAt: number;
    serverNow: number;
  }) => void;
  "game:end": (payload: { standings: Standing[]; history: RoundResult[][] }) => void;
  "room:closed": (payload: { reason: "expired" | "empty" | "shutdown" }) => void;
};
```

Ajouter à `packages/shared/src/index.ts` : `export * from "./protocol/events.js";`

- [ ] **Step 2: Écrire les tests du socle serveur**

`apps/server/package.json` :

```json
{
  "name": "@pkfind/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@pkfind/shared": "workspace:*",
    "express": "^4.21.0",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "socket.io-client": "^4.8.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`apps/server/tsconfig.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "module": "NodeNext", "moduleResolution": "nodenext" },
  "include": ["src/**/*"]
}
```

`apps/server/src/config.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applique les valeurs par défaut de la spécification", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 3000,
      logLevel: "info",
      corsOrigin: "",
      revealMs: 6000,
      countdownMs: 3000,
      answerGraceMs: 1500,
      reconnectGraceMs: 60_000,
      roomEmptyTtlMs: 300_000,
      roomMaxAgeMs: 10_800_000,
      maxRooms: 500,
    });
  });

  it("lit les variables d'environnement", () => {
    const config = loadConfig({ PORT: "8080", ROUND_REVEAL_MS: "2000", MAX_ROOMS: "10" });
    expect(config.port).toBe(8080);
    expect(config.revealMs).toBe(2000);
    expect(config.maxRooms).toBe(10);
  });

  it("refuse un port hors bornes", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "abc" })).toThrow(ConfigError);
  });

  it("refuse des durées absurdes", () => {
    expect(() => loadConfig({ ROUND_REVEAL_MS: "-1" })).toThrow(ConfigError);
    expect(() => loadConfig({ RECONNECT_GRACE_MS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ MAX_ROOMS: "0" })).toThrow(ConfigError);
  });

  it("refuse un niveau de journalisation inconnu", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });
});
```

`apps/server/src/http.test.ts` :

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";

let baseUrl = "";
const server = createServer(
  createHttpApp(loadConfig({}), () => ({ rooms: 2, players: 5 })),
);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("HTTP", () => {
  it("répond sur /healthz avec les statistiques", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "ok", rooms: 2, players: 5 });
    expect(typeof body.uptimeMs).toBe("number");
  });

  it("renvoie l'index sur une route inconnue quand le front est absent", async () => {
    const response = await fetch(`${baseUrl}/room/ABCD`);
    expect([200, 404]).toContain(response.status);
  });
});
```

- [ ] **Step 3: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/server exec vitest run`
Expected: FAIL — modules `./config.js` et `./http.js` introuvables.

- [ ] **Step 4: Écrire le socle**

`apps/server/src/config.ts` :

```ts
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Config = {
  port: number;
  nodeEnv: string;
  logLevel: LogLevel;
  corsOrigin: string;
  webDir: string;
  revealMs: number;
  countdownMs: number;
  answerGraceMs: number;
  reconnectGraceMs: number;
  roomEmptyTtlMs: number;
  roomMaxAgeMs: number;
  maxRooms: number;
};

function readInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} doit être un entier entre ${min} et ${max} (reçu "${raw}").`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new ConfigError(`LOG_LEVEL doit valoir ${LOG_LEVELS.join(", ")} (reçu "${logLevel}").`);
  }
  return {
    port: readInt(env, "PORT", 3000, 1, 65535),
    nodeEnv: env.NODE_ENV ?? "production",
    logLevel: logLevel as LogLevel,
    corsOrigin: env.CORS_ORIGIN ?? "",
    webDir: env.WEB_DIR ?? "../../web/dist",
    countdownMs: readInt(env, "COUNTDOWN_MS", 3000, 100, 30_000),
    revealMs: readInt(env, "ROUND_REVEAL_MS", 6000, 100, 60_000),
    answerGraceMs: readInt(env, "ANSWER_GRACE_MS", 1500, 0, 10_000),
    reconnectGraceMs: readInt(env, "RECONNECT_GRACE_MS", 60_000, 1, 600_000),
    roomEmptyTtlMs: readInt(env, "ROOM_EMPTY_TTL_MS", 300_000, 1, 3_600_000),
    roomMaxAgeMs: readInt(env, "ROOM_MAX_AGE_MS", 10_800_000, 60_000, 86_400_000),
    maxRooms: readInt(env, "MAX_ROOMS", 500, 1, 10_000),
  };
}
```

`apps/server/src/log.ts` :

```ts
import type { LogLevel } from "./config.js";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let threshold: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
};
```

`apps/server/src/http.ts` :

```ts
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Config } from "./config.js";

const startedAt = Date.now();

export function createHttpApp(
  config: Config,
  stats: () => { rooms: number; players: number },
): express.Express {
  const app = express();

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", uptimeMs: Date.now() - startedAt, ...stats() });
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const webDir = resolve(here, config.webDir);
  const indexFile = join(webDir, "index.html");

  if (existsSync(webDir)) {
    app.use(
      "/assets",
      express.static(join(webDir, "assets"), {
        maxAge: "1y",
        immutable: true,
      }),
    );
    app.use(express.static(webDir, { index: false, maxAge: 0 }));
  }

  app.get("*", (_request, response) => {
    if (!existsSync(indexFile)) {
      response.status(404).type("text/plain").send("Front non construit");
      return;
    }
    response.set("Cache-Control", "no-cache").sendFile(indexFile);
  });

  return app;
}
```

`apps/server/src/index.ts` :

```ts
import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";
import { log, setLogLevel } from "./log.js";

const config = loadConfig();
setLogLevel(config.logLevel);

// Le registre des rooms et le branchement Socket.IO arrivent aux tâches 16 à 18.
const app = createHttpApp(config, () => ({ rooms: 0, players: 0 }));
const server = createServer(app);

server.listen(config.port, () => log.info("server_started", { port: config.port }));

process.on("SIGTERM", () => {
  log.info("shutdown_requested");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/server exec vitest run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): protocole Socket.IO typé, configuration validée et socle HTTP"
```

---

### Task 16: Codes de room et lobby

**Files:**
- Create: `apps/server/src/rooms/codes.ts`, `apps/server/src/rooms/Room.ts`
- Test: `apps/server/src/rooms/codes.test.ts`, `apps/server/src/rooms/Room.lobby.test.ts`

**Interfaces:**
- Consumes: `GameSettings`, `DEFAULT_SETTINGS`, `validateSettings` (Task 8), types du protocole et `ERROR_MESSAGES` (Task 15).
- Produces:
  - `CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"`, `CODE_LENGTH = 4`, `generateCode(): string`, `normalizeCode(raw: string): string`
  - `class RoomError extends Error { readonly code: ErrorCode }`
  - `MAX_PLAYERS = 8`, `MIN_PLAYERS_TO_START = 2`
  - `type RoomTimings = { countdownMs: number; revealMs: number; answerGraceMs: number; allAnsweredDelayMs: number; roundDurationMsOverride?: number }`
  - `type RoomListeners` (voir le code), `class Room`

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/server/src/rooms/codes.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, normalizeCode } from "./codes.js";
import { RoomError } from "./Room.js";

describe("generateCode", () => {
  it("produit 4 caractères de l'alphabet autorisé", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("n'utilise jamais I, O, 0 ni 1", () => {
    for (const forbidden of ["I", "O", "0", "1"]) {
      expect(CODE_ALPHABET).not.toContain(forbidden);
    }
  });
});

describe("normalizeCode", () => {
  it("met en majuscules et retire les espaces", () => {
    expect(normalizeCode(" ab cd ")).toBe("ABCD");
  });

  it("rejette une longueur incorrecte", () => {
    expect(() => normalizeCode("ABC")).toThrow(RoomError);
    expect(() => normalizeCode("ABCDE")).toThrow(RoomError);
  });

  it("rejette les caractères ambigus sans les corriger", () => {
    expect(() => normalizeCode("AB0D")).toThrow(RoomError);
    expect(() => normalizeCode("ABID")).toThrow(RoomError);
  });
});
```

`apps/server/src/rooms/Room.lobby.test.ts` :

```ts
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS, Room, RoomError, type RoomListeners, type RoomTimings } from "./Room.js";

const TIMINGS: RoomTimings = {
  countdownMs: 20,
  revealMs: 20,
  answerGraceMs: 0,
  allAnsweredDelayMs: 5,
};

function listeners(): RoomListeners {
  return {
    onState: vi.fn(),
    onCountdown: vi.fn(),
    onRoundStart: vi.fn(),
    onAnswered: vi.fn(),
    onReveal: vi.fn(),
    onEnd: vi.fn(),
  };
}

let room: Room;

beforeEach(() => {
  room = new Room("ABCD", TIMINGS, listeners());
});

describe("lobby", () => {
  it("démarre vide en lobby", () => {
    const state = room.toState();
    expect(state).toMatchObject({ code: "ABCD", status: "lobby", roundIndex: -1 });
    expect(state.players).toEqual([]);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("fait du premier arrivant l'hôte", () => {
    const first = room.addPlayer("Mathéo");
    room.addPlayer("Léa");
    const state = room.toState();
    expect(state.players[0]?.id).toBe(first.playerId);
    expect(state.players[0]?.isHost).toBe(true);
    expect(state.players[1]?.isHost).toBe(false);
  });

  it("valide le pseudo", () => {
    expect(() => room.addPlayer("a")).toThrow(RoomError);
    expect(() => room.addPlayer("x".repeat(17))).toThrow(RoomError);
    expect(() => room.addPlayer("  ")).toThrow(RoomError);
    expect(room.addPlayer("  Mathéo  ").nickname).toBe("Mathéo");
  });

  it("suffixe un pseudo déjà pris", () => {
    room.addPlayer("Léa");
    expect(room.addPlayer("Léa").nickname).toBe("Léa (2)");
    expect(room.addPlayer("Léa").nickname).toBe("Léa (3)");
  });

  it("refuse un neuvième joueur", () => {
    for (let i = 0; i < MAX_PLAYERS; i++) room.addPlayer(`Joueur${i}`);
    expect(() => room.addPlayer("DeTrop")).toThrow(
      expect.objectContaining({ code: "ROOM_FULL" }),
    );
  });

  it("n'accepte les réglages que de l'hôte, et seulement en lobby", () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    expect(() => room.updateSettings(guest.playerId, settings)).toThrow(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
    room.updateSettings(host.playerId, settings);
    expect(room.toState().settings.roundCount).toBe(5);
  });

  it("rejette des réglages invalides", () => {
    const host = room.addPlayer("Mathéo");
    expect(() => room.updateSettings(host.playerId, { generations: [] } as never)).toThrow(
      expect.objectContaining({ code: "INVALID_SETTINGS" }),
    );
  });

  it("refuse de démarrer à moins de deux joueurs connectés", () => {
    const host = room.addPlayer("Mathéo");
    expect(() => room.start(host.playerId)).toThrow(
      expect.objectContaining({ code: "NOT_ENOUGH_PLAYERS" }),
    );
  });

  it("marque un joueur hors ligne sans le supprimer", () => {
    const player = room.addPlayer("Mathéo");
    room.markDisconnected(player.playerId);
    expect(room.toState().players[0]?.connected).toBe(false);
    expect(room.playerCount).toBe(1);
    expect(room.connectedCount).toBe(0);
  });

  it("transfère l'hôte au joueur connecté le plus ancien", () => {
    const host = room.addPlayer("Mathéo");
    const second = room.addPlayer("Léa");
    room.addPlayer("Tom");
    room.markDisconnected(host.playerId);
    expect(room.toState().players.find((p) => p.isHost)?.id).toBe(second.playerId);
  });

  it("ne redonne pas l'hôte à celui qui revient", () => {
    const host = room.addPlayer("Mathéo");
    const second = room.addPlayer("Léa");
    room.markDisconnected(host.playerId);
    expect(room.rejoin(host.playerId, host.playerToken)).toBe(true);
    expect(room.toState().players.find((p) => p.isHost)?.id).toBe(second.playerId);
  });

  it("refuse une reconnexion avec un mauvais jeton", () => {
    const player = room.addPlayer("Mathéo");
    room.markDisconnected(player.playerId);
    expect(() => room.rejoin(player.playerId, "mauvais")).toThrow(
      expect.objectContaining({ code: "INVALID_TOKEN" }),
    );
  });

  it("signale une room vide", () => {
    const player = room.addPlayer("Mathéo");
    expect(room.isEmpty).toBe(false);
    room.removePlayer(player.playerId);
    expect(room.isEmpty).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/server exec vitest run src/rooms`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire les codes de room**

`apps/server/src/rooms/codes.ts` :

```ts
import { randomInt } from "node:crypto";
import { RoomError } from "./Room.js";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw: string): string {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) throw new RoomError("INVALID_CODE");
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) throw new RoomError("INVALID_CODE");
  }
  return code;
}
```

- [ ] **Step 4: Écrire la partie lobby de `Room`**

`apps/server/src/rooms/Room.ts` (la boucle de jeu est ajoutée à la tâche 17) :

```ts
import { randomBytes, randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  ERROR_MESSAGES,
  type ErrorCode,
  type GameSettings,
  type PlayerPublic,
  type RoomState,
  type RoomStatus,
  validateSettings,
} from "@pkfind/shared";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

const NICKNAME_PATTERN = /^[\p{L}\p{N} _.\-]{2,16}$/u;

export class RoomError extends Error {
  constructor(readonly code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RoomError";
  }
}

export type RoomTimings = {
  countdownMs: number;
  revealMs: number;
  answerGraceMs: number;
  allAnsweredDelayMs: number;
  /** Réservé aux tests : court-circuite la durée de manche des réglages. */
  roundDurationMsOverride?: number;
};

export type RoomListeners = {
  onState: (state: RoomState) => void;
  onCountdown: (payload: { startsAt: number; serverNow: number }) => void;
  onRoundStart: (payload: {
    roundIndex: number;
    roundCount: number;
    targetId: number;
    endsAt: number;
    serverNow: number;
  }) => void;
  onAnswered: (payload: { playerId: string }) => void;
  onReveal: (payload: {
    roundIndex: number;
    targetId: number;
    results: RoundResult[];
    standings: Standing[];
    revealEndsAt: number;
    serverNow: number;
  }) => void;
  onEnd: (payload: { standings: Standing[]; history: RoundResult[][] }) => void;
};

type Player = {
  id: string;
  token: string;
  nickname: string;
  connected: boolean;
  joinedAt: number;
  score: number;
  totalResponseTimeMs: number;
  answer: { pokemonId: number; responseTimeMs: number } | null;
};

export class Room {
  readonly createdAt = Date.now();
  private players: Player[] = [];
  private hostId: string | null = null;
  private settings: GameSettings = DEFAULT_SETTINGS;
  private state: RoomStatus = "lobby";

  constructor(
    readonly code: string,
    private readonly timings: RoomTimings,
    private readonly listeners: RoomListeners,
    private readonly newGameSeed: () => string = () => `room:${code}:${randomUUID()}`,
  ) {}

  get status(): RoomStatus {
    return this.state;
  }

  get playerCount(): number {
    return this.players.length;
  }

  get connectedCount(): number {
    return this.players.filter((player) => player.connected).length;
  }

  get isEmpty(): boolean {
    return this.players.length === 0;
  }

  addPlayer(rawNickname: string): { playerId: string; playerToken: string; nickname: string } {
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.players.length >= MAX_PLAYERS) throw new RoomError("ROOM_FULL");

    const nickname = this.uniqueNickname(rawNickname.trim());
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(16).toString("hex"),
      nickname,
      connected: true,
      joinedAt: Date.now(),
      score: 0,
      totalResponseTimeMs: 0,
      answer: null,
    };
    this.players.push(player);
    this.hostId ??= player.id;
    this.emitState();
    return { playerId: player.id, playerToken: player.token, nickname };
  }

  rejoin(playerId: string, token: string): boolean {
    const player = this.find(playerId);
    if (player.token !== token) throw new RoomError("INVALID_TOKEN");
    player.connected = true;
    this.hostId ??= player.id;
    this.emitState();
    return true;
  }

  markDisconnected(playerId: string): void {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    player.connected = false;
    this.reassignHostIfNeeded();
    this.emitState();
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((player) => player.id !== playerId);
    if (this.hostId === playerId) this.hostId = null;
    this.reassignHostIfNeeded();
    this.emitState();
  }

  updateSettings(playerId: string, settings: unknown): void {
    this.assertHost(playerId);
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    try {
      this.settings = validateSettings(settings);
    } catch {
      throw new RoomError("INVALID_SETTINGS");
    }
    this.emitState();
  }

  toState(): RoomState {
    return {
      code: this.code,
      status: this.state,
      settings: this.settings,
      players: this.players.map(
        (player): PlayerPublic => ({
          id: player.id,
          nickname: player.nickname,
          connected: player.connected,
          isHost: player.id === this.hostId,
          score: player.score,
          hasAnswered: player.answer !== null,
        }),
      ),
      roundIndex: this.currentRoundIndex,
      roundCount: this.settings.roundCount,
    };
  }

  /** Redéfini à la tâche 17. */
  protected currentRoundIndex = -1;

  private uniqueNickname(nickname: string): string {
    if (!NICKNAME_PATTERN.test(nickname)) throw new RoomError("INVALID_NICKNAME");
    const taken = new Set(this.players.map((player) => player.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let suffix = 2; suffix <= MAX_PLAYERS + 1; suffix++) {
      const candidate = `${nickname} (${suffix})`;
      if (!taken.has(candidate)) return candidate;
    }
    throw new RoomError("INVALID_NICKNAME");
  }

  private reassignHostIfNeeded(): void {
    const host = this.players.find((player) => player.id === this.hostId);
    if (host?.connected) return;
    const next = this.players
      .filter((player) => player.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.hostId = next?.id ?? null;
  }

  protected find(playerId: string): Player {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM");
    return player;
  }

  protected assertHost(playerId: string): void {
    if (playerId !== this.hostId) throw new RoomError("NOT_HOST");
  }

  protected emitState(): void {
    this.listeners.onState(this.toState());
  }
}
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/server exec vitest run src/rooms`
Expected: les tests de `codes.test.ts` passent, ainsi que ceux du lobby — sauf « refuse de démarrer à moins de deux joueurs connectés », qui échoue parce que `start` n'existe pas encore. C'est attendu : il est implémenté à la tâche 17. Marquer ce test `it.todo` temporairement n'est pas nécessaire si la tâche 17 suit immédiatement.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): codes de room et gestion du lobby"
```

---

### Task 17: Boucle de jeu d'une room

**Files:**
- Modify: `apps/server/src/rooms/Room.ts`
- Test: `apps/server/src/rooms/Room.game.test.ts`

**Interfaces:**
- Consumes: `buildPool`, `pickTargets`, `rngFromSeed`, `scoreForAnswer`, `gapBetween` (Tasks 2, 3, 4), `Room` (Task 16).
- Produces, ajoutés à `Room` : `start(playerId: string): void`, `answer(playerId: string, roundIndex: number, pokemonId: number): void`, `playAgain(playerId: string): void`, `dispose(): void`.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/server/src/rooms/Room.game.test.ts` :

```ts
import { DEFAULT_SETTINGS, buildPool, pickTargets, rngFromSeed } from "@pkfind/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomListeners, type RoomTimings } from "./Room.js";

const SEED = "room:ABCD:test";
const TIMINGS: RoomTimings = {
  countdownMs: 10,
  revealMs: 10,
  answerGraceMs: 0,
  allAnsweredDelayMs: 5,
  roundDurationMsOverride: 60,
};

const targets = pickTargets(
  buildPool(DEFAULT_SETTINGS.generations).ids,
  DEFAULT_SETTINGS.roundCount,
  rngFromSeed(SEED),
);

let room: Room;
let events: RoomListeners;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  events = {
    onState: vi.fn(),
    onCountdown: vi.fn(),
    onRoundStart: vi.fn(),
    onAnswered: vi.fn(),
    onReveal: vi.fn(),
    onEnd: vi.fn(),
  };
  room = new Room("ABCD", TIMINGS, events, () => SEED);
});

afterEach(() => room.dispose());

function seat(nickname: string) {
  return room.addPlayer(nickname);
}

describe("boucle de jeu", () => {
  it("passe par le décompte puis ouvre la première manche", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    expect(room.status).toBe("countdown");
    expect(events.onCountdown).toHaveBeenCalled();

    await wait(TIMINGS.countdownMs + 20);
    expect(room.status).toBe("round");
    expect(events.onRoundStart).toHaveBeenCalledWith(
      expect.objectContaining({ roundIndex: 0, targetId: targets[0], roundCount: 10 }),
    );
  });

  it("n'expose jamais le nom ni le sprite de la cible à l'ouverture d'une manche", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    const payload = vi.mocked(events.onRoundStart).mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {})).toEqual([
      "roundIndex",
      "roundCount",
      "targetId",
      "endsAt",
      "serverNow",
    ]);
  });

  it("note les réponses et révèle dès que tout le monde a répondu", async () => {
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);

    room.answer(host.playerId, 0, targets[0]!);
    expect(events.onAnswered).toHaveBeenCalledWith({ playerId: host.playerId });
    room.answer(guest.playerId, 0, targets[0]! === 1 ? 2 : 1);

    await wait(TIMINGS.allAnsweredDelayMs + 20);
    const reveal = vi.mocked(events.onReveal).mock.calls[0]?.[0];
    expect(reveal?.targetId).toBe(targets[0]);
    expect(reveal?.results.find((r) => r.playerId === host.playerId)?.points).toBe(1000);
    expect(reveal?.standings[0]?.playerId).toBe(host.playerId);
  });

  it("compte zéro pour un joueur qui ne répond pas", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    room.answer(host.playerId, 0, targets[0]!);
    await wait(TIMINGS.roundDurationMsOverride! + 40);
    const reveal = vi.mocked(events.onReveal).mock.calls[0]?.[0];
    const absent = reveal?.results.find((r) => r.playerId !== host.playerId);
    expect(absent).toMatchObject({ pokemonId: null, gap: null, points: 0, responseTimeMs: null });
  });

  it("rejette une deuxième réponse, un mauvais index et un Pokémon hors pool", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);

    room.answer(host.playerId, 0, targets[0]!);
    expect(() => room.answer(host.playerId, 0, 5)).toThrow(
      expect.objectContaining({ code: "ALREADY_ANSWERED" }),
    );
    expect(() => room.answer(host.playerId, 7, 5)).toThrow(
      expect.objectContaining({ code: "ROUND_CLOSED" }),
    );
  });

  it("rejette un Pokémon hors du pool actif", async () => {
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, { ...DEFAULT_SETTINGS, generations: [1] });
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    expect(() => room.answer(guest.playerId, 0, 448)).toThrow(
      expect.objectContaining({ code: "NOT_IN_POOL" }),
    );
  });

  it("enchaîne les manches puis termine la partie", async () => {
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, settings);
    room.start(host.playerId);

    for (let index = 0; index < settings.roundCount; index++) {
      await wait(TIMINGS.countdownMs + 20);
      const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
      room.answer(host.playerId, index, started!.targetId);
      room.answer(guest.playerId, index, started!.targetId);
      await wait(TIMINGS.allAnsweredDelayMs + TIMINGS.revealMs + 30);
    }

    expect(room.status).toBe("finished");
    const end = vi.mocked(events.onEnd).mock.calls[0]?.[0];
    expect(end?.history).toHaveLength(settings.roundCount);
    expect(end?.standings).toHaveLength(2);
    expect(end?.standings[0]?.score).toBe(5000);
  });

  it("départage deux scores égaux au temps de réponse cumulé", async () => {
    const host = seat("Rapide");
    const guest = seat("Lent");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
    room.answer(host.playerId, 0, started!.targetId);
    await wait(20);
    room.answer(guest.playerId, 0, started!.targetId);
    await wait(TIMINGS.allAnsweredDelayMs + 20);

    const reveal = vi.mocked(events.onReveal).mock.calls.at(-1)?.[0];
    expect(reveal?.standings[0]?.playerId).toBe(host.playerId);
    expect(reveal?.standings[0]?.rank).toBe(1);
  });

  it("revient au lobby avec les scores remis à zéro sur relance", async () => {
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, settings);
    room.start(host.playerId);
    for (let index = 0; index < settings.roundCount; index++) {
      await wait(TIMINGS.countdownMs + 20);
      const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
      room.answer(host.playerId, index, started!.targetId);
      room.answer(guest.playerId, index, started!.targetId);
      await wait(TIMINGS.allAnsweredDelayMs + TIMINGS.revealMs + 30);
    }
    room.playAgain(host.playerId);
    expect(room.status).toBe("lobby");
    expect(room.toState().players.every((player) => player.score === 0)).toBe(true);
    expect(room.toState().roundIndex).toBe(-1);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm -F @pkfind/server exec vitest run src/rooms/Room.game.test.ts`
Expected: FAIL — `room.start is not a function`.

- [ ] **Step 3: Compléter `Room` avec la boucle de jeu**

Ajouter les imports dans `apps/server/src/rooms/Room.ts` :

```ts
import {
  buildPool,
  gapBetween,
  pickTargets,
  type Pool,
  rngFromSeed,
  type RoundResult,
  scoreForAnswer,
  type Standing,
} from "@pkfind/shared";
```

Ajouter les champs et méthodes à la classe `Room` (et supprimer le champ provisoire `protected currentRoundIndex = -1` de la tâche 16 au profit de celui-ci) :

```ts
  private pool: Pool = buildPool(DEFAULT_SETTINGS.generations);
  private targets: number[] = [];
  private history: RoundResult[][] = [];
  private roundStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  protected currentRoundIndex = -1;

  start(playerId: string): void {
    this.assertHost(playerId);
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.connectedCount < MIN_PLAYERS_TO_START) throw new RoomError("NOT_ENOUGH_PLAYERS");

    this.pool = buildPool(this.settings.generations);
    this.targets = pickTargets(
      this.pool.ids,
      this.settings.roundCount,
      rngFromSeed(this.newGameSeed()),
    );
    this.history = [];
    this.currentRoundIndex = -1;
    for (const player of this.players) {
      player.score = 0;
      player.totalResponseTimeMs = 0;
      player.answer = null;
    }

    this.state = "countdown";
    const now = Date.now();
    this.listeners.onCountdown({ startsAt: now + this.timings.countdownMs, serverNow: now });
    this.emitState();
    this.schedule(() => this.openRound(0), this.timings.countdownMs);
  }

  answer(playerId: string, roundIndex: number, pokemonId: number): void {
    const player = this.find(playerId);
    if (this.state !== "round" || roundIndex !== this.currentRoundIndex) {
      throw new RoomError("ROUND_CLOSED");
    }
    if (player.answer !== null) throw new RoomError("ALREADY_ANSWERED");
    if (!this.pool.ids.includes(pokemonId)) throw new RoomError("NOT_IN_POOL");

    const elapsed = Date.now() - this.roundStartedAt;
    if (elapsed > this.roundDurationMs + this.timings.answerGraceMs) {
      throw new RoomError("ROUND_CLOSED");
    }

    player.answer = { pokemonId, responseTimeMs: Math.min(elapsed, this.roundDurationMs) };
    this.listeners.onAnswered({ playerId });
    this.emitState();

    const connected = this.players.filter((candidate) => candidate.connected);
    if (connected.length > 0 && connected.every((candidate) => candidate.answer !== null)) {
      this.schedule(() => this.closeRound(), this.timings.allAnsweredDelayMs);
    }
  }

  playAgain(playerId: string): void {
    this.assertHost(playerId);
    if (this.state !== "finished") throw new RoomError("GAME_IN_PROGRESS");
    this.resetToLobby();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private get roundDurationMs(): number {
    return this.timings.roundDurationMsOverride ?? this.settings.roundDurationMs;
  }

  private schedule(action: () => void, delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(action, delayMs);
  }

  private openRound(index: number): void {
    this.currentRoundIndex = index;
    this.state = "round";
    this.roundStartedAt = Date.now();
    for (const player of this.players) player.answer = null;

    this.listeners.onRoundStart({
      roundIndex: index,
      roundCount: this.targets.length,
      targetId: this.targets[index]!,
      endsAt: this.roundStartedAt + this.roundDurationMs,
      serverNow: this.roundStartedAt,
    });
    this.emitState();
    this.schedule(() => this.closeRound(), this.roundDurationMs);
  }

  private closeRound(): void {
    if (this.state !== "round") return;
    const targetId = this.targets[this.currentRoundIndex]!;

    const results: RoundResult[] = this.players.map((player) => {
      const answer = player.answer;
      const points = scoreForAnswer(targetId, answer?.pokemonId ?? null, this.pool.span);
      player.score += points;
      player.totalResponseTimeMs += answer?.responseTimeMs ?? this.roundDurationMs;
      return {
        playerId: player.id,
        nickname: player.nickname,
        pokemonId: answer?.pokemonId ?? null,
        gap: answer ? gapBetween(targetId, answer.pokemonId) : null,
        points,
        responseTimeMs: answer?.responseTimeMs ?? null,
      };
    });

    this.history.push(results);
    this.state = "reveal";
    const now = Date.now();
    this.listeners.onReveal({
      roundIndex: this.currentRoundIndex,
      targetId,
      results: [...results].sort((a, b) => b.points - a.points),
      standings: this.standings(),
      revealEndsAt: now + this.timings.revealMs,
      serverNow: now,
    });
    this.emitState();

    const next = this.currentRoundIndex + 1;
    this.schedule(
      () => (next < this.targets.length ? this.openRound(next) : this.endGame()),
      this.timings.revealMs,
    );
  }

  private endGame(): void {
    this.state = "finished";
    this.listeners.onEnd({ standings: this.standings(), history: this.history });
    this.emitState();
  }

  private resetToLobby(): void {
    this.dispose();
    this.state = "lobby";
    this.currentRoundIndex = -1;
    this.targets = [];
    this.history = [];
    for (const player of this.players) {
      player.score = 0;
      player.totalResponseTimeMs = 0;
      player.answer = null;
    }
    this.emitState();
  }

  private standings(): Standing[] {
    const sorted = [...this.players].sort(
      (a, b) =>
        b.score - a.score ||
        a.totalResponseTimeMs - b.totalResponseTimeMs ||
        a.nickname.localeCompare(b.nickname, "fr"),
    );
    let rank = 0;
    let previous: { score: number; time: number } | null = null;
    return sorted.map((player, index) => {
      const tied =
        previous !== null &&
        previous.score === player.score &&
        previous.time === player.totalResponseTimeMs;
      if (!tied) rank = index + 1;
      previous = { score: player.score, time: player.totalResponseTimeMs };
      return {
        rank,
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        totalResponseTimeMs: player.totalResponseTimeMs,
      };
    });
  }
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/server exec vitest run src/rooms && pnpm typecheck`
Expected: PASS, y compris le test « refuse de démarrer à moins de deux joueurs connectés » de la tâche 16.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): boucle de jeu autoritaire d'une room, du décompte au classement"
```

---

### Task 18: Registre des rooms et branchement Socket.IO

**Files:**
- Create: `apps/server/src/rooms/RoomStore.ts`, `apps/server/src/socket/rateLimit.ts`, `apps/server/src/socket/handlers.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/src/socket/rateLimit.test.ts`, `apps/server/src/socket/handlers.test.ts`

**Interfaces:**
- Consumes: `Room`, `RoomError`, `generateCode`, `normalizeCode` (Tasks 16, 17), `Config` (Task 15), `pokemonById` (Task 6).
- Produces:
  - `class RoomStore { constructor(config: Config, io: Server); create(): Room; get(code: string): Room; tryGet(code: string): Room | undefined; destroy(code: string, reason: "expired" | "empty" | "shutdown"): void; stats(): { rooms: number; players: number }; startPurge(): void; stopPurge(): void; destroyAll(reason): void }`
  - `createRateLimiter(max: number, windowMs: number): (key: string) => boolean`
  - `registerHandlers(io: Server, store: RoomStore, config: Config): void`

**Conversion à faire ici :** `Room` émet `onReveal` avec un `targetId` ; le handler le traduit en `round:reveal` avec `target: pokemonById(targetId)`. C'est le seul endroit où le Pokémon complet de la cible est envoyé au client.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/server/src/socket/rateLimit.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createRateLimiter", () => {
  it("laisse passer jusqu'à la limite", () => {
    const allow = createRateLimiter(3, 1000);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, true]);
    expect(allow("a")).toBe(false);
  });

  it("compte séparément chaque clé", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    expect(allow("b")).toBe(true);
    expect(allow("a")).toBe(false);
  });

  it("libère après la fenêtre glissante", () => {
    const allow = createRateLimiter(1, 1000);
    expect(allow("a")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(allow("a")).toBe(true);
  });
});
```

`apps/server/src/socket/handlers.test.ts` :

```ts
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  Ack,
  ClientToServerEvents,
  JoinPayload,
  RoomState,
  ServerToClientEvents,
} from "@pkfind/shared";
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { RoomStore } from "../rooms/RoomStore.js";
import { registerHandlers } from "./handlers.js";

const config = loadConfig({
  COUNTDOWN_MS: "100",
  ROUND_REVEAL_MS: "100",
  RECONNECT_GRACE_MS: "200",
  ROOM_EMPTY_TTL_MS: "200",
});

let httpServer: HttpServer;
let io: Server<ClientToServerEvents, ServerToClientEvents>;
let store: RoomStore;
let url = "";
const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];

function client(): Socket<ServerToClientEvents, ClientToServerEvents> {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  clients.push(socket);
  return socket;
}

function emit<E extends keyof ClientToServerEvents, T>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: E,
  input: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.emit as (e: E, i: unknown, ack: (r: Ack<T>) => void) => void)(event, input, resolve);
  });
}

function once<T>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: keyof ServerToClientEvents,
): Promise<T> {
  return new Promise((resolve) => socket.once(event as never, resolve as never));
}

beforeEach(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  store = new RoomStore(config, io);
  registerHandlers(io, store, config);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.close();
  store.stopPurge();
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("handlers Socket.IO", () => {
  it("crée une room et renvoie un code à 4 caractères", async () => {
    const host = client();
    const ack = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(ack.data.state.players[0]?.isHost).toBe(true);
  });

  it("refuse un pseudo invalide", async () => {
    const ack = await emit(client(), "room:create", { nickname: "x", settings: DEFAULT_SETTINGS });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_NICKNAME" });
  });

  it("refuse un code inconnu", async () => {
    const ack = await emit(client(), "room:join", { roomCode: "ZZZZ", nickname: "Léa" });
    expect(ack).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
  });

  it("refuse un code mal formé sans correspondance approximative", async () => {
    const ack = await emit(client(), "room:join", { roomCode: "AB0D", nickname: "Léa" });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_CODE" });
  });

  it("diffuse l'état à tous quand un joueur rejoint", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");

    const stateOnHost = once<RoomState>(host, "room:state");
    await emit(client(), "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    const state = await stateOnHost;
    expect(state.players.map((p) => p.nickname)).toEqual(["Mathéo", "Léa"]);
  });

  it("interdit à un invité de modifier les réglages", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    const ack = await emit(guest, "room:settings", {
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    expect(ack).toMatchObject({ ok: false, code: "NOT_HOST" });
  });

  it("joue une partie complète à deux et produit un classement", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, generations: [1], roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    const ended = once<{ standings: Array<{ playerId: string; score: number }> }>(host, "game:end");
    await emit(host, "room:start", {});

    for (let index = 0; index < 5; index++) {
      const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
      expect(Object.keys(started).sort()).toEqual(
        ["endsAt", "roundCount", "roundIndex", "serverNow", "targetId"].sort(),
      );
      await emit(host, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId,
      });
      await emit(guest, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId === 1 ? 2 : 1,
      });
    }

    const result = await ended;
    expect(result.standings[0]?.playerId).toBe(created.data.playerId);
    expect(result.standings[0]?.score).toBe(5000);
  });

  it("révèle le Pokémon cible uniquement à la révélation", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });

    const revealed = once<{ target: { id: number; nameFr: string } }>(host, "round:reveal");
    await emit(host, "room:start", {});
    const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
    await emit(host, "round:answer", { roundIndex: started.roundIndex, pokemonId: started.targetId });
    await emit(guest, "round:answer", { roundIndex: started.roundIndex, pokemonId: started.targetId });

    const reveal = await revealed;
    expect(reveal.target.id).toBe(started.targetId);
    expect(typeof reveal.target.nameFr).toBe("string");
  });

  it("refuse de rejoindre une partie déjà commencée", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    await emit(client(), "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    await emit(host, "room:start", {});

    const ack = await emit(client(), "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Retardataire",
    });
    expect(ack).toMatchObject({ ok: false, code: "GAME_IN_PROGRESS" });
  });

  it("conserve la place d'un joueur qui se reconnecte", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    const disconnected = once<RoomState>(host, "room:state");
    guest.close();
    const afterDrop = await disconnected;
    expect(afterDrop.players.find((p) => p.nickname === "Léa")?.connected).toBe(false);

    const back = client();
    const ack = await emit<"room:rejoin", { state: RoomState }>(back, "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
    });
    expect(ack.ok).toBe(true);
  });

  it("refuse une reconnexion avec un mauvais jeton", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const ack = await emit(client(), "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: created.data.playerId,
      playerToken: "faux",
    });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/server exec vitest run src/socket`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire le limiteur de débit**

`apps/server/src/socket/rateLimit.ts` :

```ts
export function createRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
```

- [ ] **Step 4: Écrire le registre des rooms**

`apps/server/src/rooms/RoomStore.ts` :

```ts
import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import { pokemonById } from "@pkfind/shared";
import type { Server } from "socket.io";
import type { Config } from "../config.js";
import { log } from "../log.js";
import { generateCode } from "./codes.js";
import { Room, RoomError, type RoomListeners } from "./Room.js";

const PURGE_INTERVAL_MS = 15_000;

type Entry = { room: Room; emptySince: number | null };

export class RoomStore {
  private readonly rooms = new Map<string, Entry>();
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: Config,
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents>,
  ) {}

  create(): Room {
    if (this.rooms.size >= this.config.maxRooms) throw new RoomError("SERVER_BUSY");

    let code = generateCode();
    for (let attempt = 0; this.rooms.has(code); attempt++) {
      if (attempt >= 10) throw new RoomError("CODE_EXHAUSTED");
      code = generateCode();
    }

    const room = new Room(
      code,
      {
        countdownMs: this.config.countdownMs,
        revealMs: this.config.revealMs,
        answerGraceMs: this.config.answerGraceMs,
        allAnsweredDelayMs: 400,
      },
      this.listenersFor(code),
    );
    this.rooms.set(code, { room, emptySince: null });
    log.info("room_created", { code });
    return room;
  }

  get(code: string): Room {
    const entry = this.rooms.get(code);
    if (!entry) throw new RoomError("ROOM_NOT_FOUND");
    return entry.room;
  }

  tryGet(code: string): Room | undefined {
    return this.rooms.get(code)?.room;
  }

  destroy(code: string, reason: "expired" | "empty" | "shutdown"): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.room.dispose();
    this.rooms.delete(code);
    this.io.to(code).emit("room:closed", { reason });
    log.info("room_destroyed", { code, reason });
  }

  destroyAll(reason: "expired" | "empty" | "shutdown"): void {
    for (const code of [...this.rooms.keys()]) this.destroy(code, reason);
  }

  stats(): { rooms: number; players: number } {
    let players = 0;
    for (const entry of this.rooms.values()) players += entry.room.playerCount;
    return { rooms: this.rooms.size, players };
  }

  startPurge(): void {
    this.purgeTimer ??= setInterval(() => this.purge(), PURGE_INTERVAL_MS);
  }

  stopPurge(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
  }

  /** Exposé pour les tests : exécute un cycle de purge immédiatement. */
  purge(): void {
    const now = Date.now();
    for (const [code, entry] of this.rooms) {
      if (now - entry.room.createdAt > this.config.roomMaxAgeMs) {
        this.destroy(code, "expired");
        continue;
      }
      if (entry.room.isEmpty) {
        entry.emptySince ??= now;
        if (now - entry.emptySince > this.config.roomEmptyTtlMs) this.destroy(code, "empty");
      } else {
        entry.emptySince = null;
      }
    }
  }

  private listenersFor(code: string): RoomListeners {
    const room = () => this.io.to(code);
    return {
      onState: (state) => room().emit("room:state", state),
      onCountdown: (payload) => room().emit("game:countdown", payload),
      onRoundStart: (payload) => room().emit("round:start", payload),
      onAnswered: (payload) => room().emit("round:answered", payload),
      onReveal: ({ targetId, ...rest }) =>
        room().emit("round:reveal", { ...rest, target: pokemonById(targetId) }),
      onEnd: (payload) => room().emit("game:end", payload),
    };
  }
}
```

- [ ] **Step 5: Écrire les handlers**

`apps/server/src/socket/handlers.ts` :

```ts
import {
  type Ack,
  type ClientToServerEvents,
  ERROR_MESSAGES,
  type ErrorCode,
  type ServerToClientEvents,
} from "@pkfind/shared";
import type { Server, Socket } from "socket.io";
import type { Config } from "../config.js";
import { log } from "../log.js";
import { normalizeCode } from "../rooms/codes.js";
import { RoomError } from "../rooms/Room.js";
import type { RoomStore } from "../rooms/RoomStore.js";
import { createRateLimiter } from "./rateLimit.js";

type SocketData = { roomCode?: string; playerId?: string };
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const MAX_EVENTS = 20;
const WINDOW_MS = 10_000;
const MAX_VIOLATIONS = 3;

function fail(code: ErrorCode): Ack<never> {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

function run<T>(action: () => T): Ack<T> {
  try {
    return { ok: true, data: action() };
  } catch (error) {
    if (error instanceof RoomError) return fail(error.code);
    log.error("handler_failed", { message: String(error) });
    return fail("INTERNAL");
  }
}

export function registerHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>,
  store: RoomStore,
  config: Config,
): void {
  const allow = createRateLimiter(MAX_EVENTS, WINDOW_MS);
  const violations = new Map<string, number>();

  io.on("connection", (socket: AppSocket) => {
    socket.use((_event, next) => {
      if (allow(socket.id)) {
        next();
        return;
      }
      const count = (violations.get(socket.id) ?? 0) + 1;
      violations.set(socket.id, count);
      if (count >= MAX_VIOLATIONS) socket.disconnect(true);
      next(new Error("RATE_LIMITED"));
    });

    function currentRoom() {
      const code = socket.data.roomCode;
      if (!code) throw new RoomError("NOT_IN_ROOM");
      return store.get(code);
    }

    function selfId(): string {
      const id = socket.data.playerId;
      if (!id) throw new RoomError("NOT_IN_ROOM");
      return id;
    }

    socket.on("room:create", ({ nickname, settings }, ack) => {
      ack(
        run(() => {
          const room = store.create();
          try {
            room.updateSettingsUnchecked(settings);
            const seat = room.addPlayer(nickname);
            socket.data = { roomCode: room.code, playerId: seat.playerId };
            void socket.join(room.code);
            return {
              roomCode: room.code,
              playerId: seat.playerId,
              playerToken: seat.playerToken,
              nickname: seat.nickname,
              state: room.toState(),
            };
          } catch (error) {
            store.destroy(room.code, "empty");
            throw error;
          }
        }),
      );
    });

    socket.on("room:join", ({ roomCode, nickname }, ack) => {
      ack(
        run(() => {
          const room = store.get(normalizeCode(roomCode));
          const seat = room.addPlayer(nickname);
          socket.data = { roomCode: room.code, playerId: seat.playerId };
          void socket.join(room.code);
          return {
            roomCode: room.code,
            playerId: seat.playerId,
            playerToken: seat.playerToken,
            nickname: seat.nickname,
            state: room.toState(),
          };
        }),
      );
    });

    socket.on("room:rejoin", ({ roomCode, playerId, playerToken }, ack) => {
      ack(
        run(() => {
          const room = store.get(normalizeCode(roomCode));
          room.rejoin(playerId, playerToken);
          socket.data = { roomCode: room.code, playerId };
          void socket.join(room.code);
          return { state: room.toState() };
        }),
      );
    });

    socket.on("room:settings", ({ settings }, ack) => {
      ack(
        run(() => {
          const room = currentRoom();
          room.updateSettings(selfId(), settings);
          return { state: room.toState() };
        }),
      );
    });

    socket.on("room:start", (_input, ack) => {
      ack(run(() => (currentRoom().start(selfId()), null)));
    });

    socket.on("room:playAgain", (_input, ack) => {
      ack(
        run(() => {
          const room = currentRoom();
          room.playAgain(selfId());
          return { state: room.toState() };
        }),
      );
    });

    socket.on("round:answer", ({ roundIndex, pokemonId }, ack) => {
      ack(
        run(() => {
          currentRoom().answer(selfId(), roundIndex, pokemonId);
          return { accepted: true as const };
        }),
      );
    });

    socket.on("room:leave", (_input, ack) => {
      ack(
        run(() => {
          const code = socket.data.roomCode;
          const id = socket.data.playerId;
          if (code && id) store.tryGet(code)?.removePlayer(id);
          socket.data = {};
          return null;
        }),
      );
    });

    socket.on("disconnect", () => {
      violations.delete(socket.id);
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = store.tryGet(roomCode);
      if (!room) return;
      room.markDisconnected(playerId);
      setTimeout(() => {
        const stillThere = store.tryGet(roomCode);
        if (!stillThere) return;
        if (!stillThere.isConnected(playerId)) stillThere.removePlayer(playerId);
      }, config.reconnectGraceMs).unref();
    });
  });
}
```

Deux méthodes à ajouter à `Room` pour ce branchement :

```ts
  /** Applique des réglages à la création, avant qu'un hôte n'existe. */
  updateSettingsUnchecked(settings: unknown): void {
    try {
      this.settings = validateSettings(settings);
    } catch {
      throw new RoomError("INVALID_SETTINGS");
    }
  }

  isConnected(playerId: string): boolean {
    return this.players.some((player) => player.id === playerId && player.connected);
  }
```

- [ ] **Step 6: Brancher le tout dans `index.ts`**

Remplacer le contenu de `apps/server/src/index.ts` :

```ts
import { createServer } from "node:http";
import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import { Server } from "socket.io";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";
import { log, setLogLevel } from "./log.js";
import { RoomStore } from "./rooms/RoomStore.js";
import { registerHandlers } from "./socket/handlers.js";

const config = loadConfig();
setLogLevel(config.logLevel);

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  maxHttpBufferSize: 4096,
  ...(config.corsOrigin ? { cors: { origin: config.corsOrigin } } : {}),
});

const store = new RoomStore(config, io);
store.startPurge();
registerHandlers(io, store, config);

httpServer.on("request", createHttpApp(config, () => store.stats()));
httpServer.listen(config.port, () => log.info("server_started", { port: config.port }));

process.on("SIGTERM", () => {
  log.info("shutdown_requested");
  store.destroyAll("shutdown");
  store.stopPurge();
  void io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
});
```

- [ ] **Step 7: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/server exec vitest run && pnpm typecheck && pnpm lint`
Expected: PASS. Si un test de reconnexion est instable, augmenter `RECONNECT_GRACE_MS` dans la configuration du test — jamais ajouter d'attente arbitraire dans le code de production.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(server): registre des rooms, limitation de débit et branchement Socket.IO"
```

---

### Task 19: Client temps réel et écrans de room

**Files:**
- Create: `apps/web/src/net/socket.ts`, `apps/web/src/net/useRoom.ts`
- Create: `apps/web/src/components/Scoreboard.tsx`, `apps/web/src/components/MultiReveal.tsx`
- Create: `apps/web/src/pages/JoinRoom.tsx`, `apps/web/src/pages/Room.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/components/Scoreboard.test.tsx`, `apps/web/src/components/MultiReveal.test.tsx`

**Interfaces:**
- Consumes: protocole (Task 15), composants (Tasks 9 à 11), `KEYS`/`readJson`/`writeJson` (Task 12).
- Produces: `getSocket(): Socket<ServerToClientEvents, ClientToServerEvents>`, `useRoom(input: { code: string; nickname: string; create: boolean; onCreated: (code: string) => void }): RoomView`, `Scoreboard(props: { standings: Standing[]; highlightPlayerId?: string })`, `MultiReveal(props: { target: Pokemon; results: RoundResult[]; maxId: number })`, pages `JoinRoom` et `Room`.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/Scoreboard.test.tsx` :

```tsx
import type { Standing } from "@pkfind/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Scoreboard } from "./Scoreboard.js";

const standings: Standing[] = [
  { rank: 1, playerId: "a", nickname: "Mathéo", score: 4200, totalResponseTimeMs: 30_000 },
  { rank: 2, playerId: "b", nickname: "Léa", score: 3100, totalResponseTimeMs: 41_000 },
  { rank: 2, playerId: "c", nickname: "Tom", score: 3100, totalResponseTimeMs: 41_000 },
];

describe("Scoreboard", () => {
  it("affiche les joueurs dans l'ordre du classement", () => {
    render(<Scoreboard standings={standings} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Mathéo")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Tom")).toBeInTheDocument();
  });

  it("affiche le même rang pour deux joueurs à égalité", () => {
    render(<Scoreboard standings={standings} />);
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("met en évidence le joueur courant", () => {
    render(<Scoreboard standings={standings} highlightPlayerId="b" />);
    expect(screen.getByText("Léa").closest("tr")).toHaveAttribute("data-self", "true");
  });
});
```

`apps/web/src/components/MultiReveal.test.tsx` :

```tsx
import { type RoundResult, pokemonById } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MultiReveal } from "./MultiReveal.js";

const results: RoundResult[] = [
  { playerId: "a", nickname: "Mathéo", pokemonId: 143, gap: 0, points: 1000, responseTimeMs: 2400 },
  { playerId: "b", nickname: "Léa", pokemonId: 111, gap: 32, points: 340, responseTimeMs: 5100 },
  { playerId: "c", nickname: "Tom", pokemonId: null, gap: null, points: 0, responseTimeMs: null },
];

describe("MultiReveal", () => {
  it("annonce le Pokémon cible avec son numéro", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    expect(screen.getByText("Ronflex")).toBeInTheDocument();
    expect(screen.getByText("#143")).toBeInTheDocument();
  });

  it("affiche la réponse, l'écart et les points de chaque joueur", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    expect(screen.getByText("Rhinocorne")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
  });

  it("marque explicitement une absence de réponse", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    const row = screen.getByText("Tom").closest("tr");
    expect(row?.textContent).toContain("—");
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `pnpm -F @pkfind/web exec vitest run src/components/Scoreboard.test.tsx src/components/MultiReveal.test.tsx`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Écrire les composants**

`apps/web/src/components/Scoreboard.tsx` :

```tsx
import type { Standing } from "@pkfind/shared";

export function Scoreboard({
  standings,
  highlightPlayerId,
}: {
  standings: Standing[];
  highlightPlayerId?: string;
}) {
  return (
    <table className="w-full text-left">
      <thead className="text-sm text-[var(--text-dim)]">
        <tr>
          <th scope="col">Rang</th>
          <th scope="col">Joueur</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody className="mono">
        {standings.map((standing) => (
          <tr
            key={standing.playerId}
            data-self={standing.playerId === highlightPlayerId ? "true" : undefined}
            className={standing.playerId === highlightPlayerId ? "text-[var(--accent)]" : ""}
          >
            <td>{standing.rank}</td>
            <td>{standing.nickname}</td>
            <td>{standing.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

`apps/web/src/components/MultiReveal.tsx` :

```tsx
import { type Pokemon, type RoundResult, tryPokemonById } from "@pkfind/shared";
import { PokemonSprite } from "./PokemonSprite.js";

export function MultiReveal({
  target,
  results,
  maxId,
}: {
  target: Pokemon;
  results: RoundResult[];
  maxId: number;
}) {
  return (
    <section aria-live="polite" className="flex flex-col items-center gap-4">
      <PokemonSprite pokemon={target} size={140} />
      <p className="text-2xl font-extrabold">{target.nameFr}</p>
      <p className="mono text-[var(--text-dim)]">
        #{String(target.id).padStart(maxId > 999 ? 4 : 3, "0")}
      </p>
      <table className="w-full text-left text-sm">
        <thead className="text-[var(--text-dim)]">
          <tr>
            <th scope="col">Joueur</th>
            <th scope="col">Réponse</th>
            <th scope="col">Écart</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody className="mono">
          {results.map((result) => {
            const answer = result.pokemonId === null ? null : tryPokemonById(result.pokemonId);
            return (
              <tr key={result.playerId}>
                <td>{result.nickname}</td>
                <td>{answer?.nameFr ?? "—"}</td>
                <td>{result.gap ?? "—"}</td>
                <td>{result.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Écrire le client temps réel**

`apps/web/src/net/socket.ts` :

```ts
import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import { type Socket, io } from "socket.io-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  socket ??= io({ transports: ["websocket"], autoConnect: true });
  return socket;
}
```

`apps/web/src/net/useRoom.ts` :

```ts
import {
  type Ack,
  DEFAULT_SETTINGS,
  type GameSettings,
  type Pokemon,
  type RoomState,
  type RoundResult,
  type Standing,
} from "@pkfind/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, readJson, writeJson } from "../storage/local.js";
import { getSocket } from "./socket.js";

type Session = { roomCode: string; playerId: string; playerToken: string };

export type RoundView = {
  roundIndex: number;
  roundCount: number;
  targetId: number;
  localEndsAt: number;
};

export type RevealView = {
  target: Pokemon;
  results: RoundResult[];
  standings: Standing[];
  localEndsAt: number;
};

export type RoomView = {
  connecting: boolean;
  error: string | null;
  closed: string | null;
  state: RoomState | null;
  playerId: string | null;
  round: RoundView | null;
  reveal: RevealView | null;
  final: { standings: Standing[]; history: RoundResult[][] } | null;
  actions: {
    start: () => void;
    setSettings: (settings: GameSettings) => void;
    answer: (pokemonId: number) => void;
    playAgain: () => void;
    leave: () => void;
  };
};

export function useRoom(input: {
  code: string;
  nickname: string;
  create: boolean;
  onCreated: (code: string) => void;
}): RoomView {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState<RoundView | null>(null);
  const [reveal, setReveal] = useState<RevealView | null>(null);
  const [final, setFinal] = useState<RoomView["final"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const joined = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    socket.on("room:state", setState);
    socket.on("round:start", (payload) => {
      setReveal(null);
      setRound({
        roundIndex: payload.roundIndex,
        roundCount: payload.roundCount,
        targetId: payload.targetId,
        localEndsAt: Date.now() + (payload.endsAt - payload.serverNow),
      });
    });
    socket.on("round:reveal", (payload) => {
      setRound(null);
      setReveal({
        target: payload.target,
        results: payload.results,
        standings: payload.standings,
        localEndsAt: Date.now() + (payload.revealEndsAt - payload.serverNow),
      });
    });
    socket.on("game:end", (payload) => {
      setRound(null);
      setFinal(payload);
    });
    socket.on("room:closed", (payload) => setClosed(payload.reason));

    return () => {
      socket.off("room:state");
      socket.off("round:start");
      socket.off("round:reveal");
      socket.off("game:end");
      socket.off("room:closed");
    };
  }, []);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    const socket = getSocket();

    const remember = (session: Session) => {
      writeJson(KEYS.session, session, "session");
      setPlayerId(session.playerId);
    };

    const stored = readJson<Session | null>(KEYS.session, null, "session");
    if (!input.create && stored && stored.roomCode === input.code) {
      socket.emit("room:rejoin", stored, (ack: Ack<{ state: RoomState }>) => {
        if (ack.ok) {
          setPlayerId(stored.playerId);
          setState(ack.data.state);
          return;
        }
        socket.emit("room:join", { roomCode: input.code, nickname: input.nickname }, (retry) => {
          if (!retry.ok) {
            setError(retry.message);
            return;
          }
          remember(retry.data);
          setState(retry.data.state);
        });
      });
      return;
    }

    if (input.create) {
      socket.emit(
        "room:create",
        { nickname: input.nickname, settings: DEFAULT_SETTINGS },
        (ack) => {
          if (!ack.ok) {
            setError(ack.message);
            return;
          }
          remember(ack.data);
          setState(ack.data.state);
          input.onCreated(ack.data.roomCode);
        },
      );
      return;
    }

    socket.emit("room:join", { roomCode: input.code, nickname: input.nickname }, (ack) => {
      if (!ack.ok) {
        setError(ack.message);
        return;
      }
      remember(ack.data);
      setState(ack.data.state);
    });
  }, [input, input.code, input.create, input.nickname]);

  const emitSimple = useCallback((event: "room:start" | "room:playAgain" | "room:leave") => {
    getSocket().emit(event as never, {} as never, ((ack: Ack<unknown>) => {
      if (!ack.ok) setError(ack.message);
    }) as never);
  }, []);

  return {
    connecting: state === null && error === null,
    error,
    closed,
    state,
    playerId,
    round,
    reveal,
    final,
    actions: {
      start: () => emitSimple("room:start"),
      playAgain: () => {
        setFinal(null);
        emitSimple("room:playAgain");
      },
      leave: () => emitSimple("room:leave"),
      setSettings: (settings) =>
        getSocket().emit("room:settings", { settings }, (ack) => {
          if (!ack.ok) setError(ack.message);
        }),
      answer: (pokemonId) => {
        if (!round) return;
        getSocket().emit(
          "round:answer",
          { roundIndex: round.roundIndex, pokemonId },
          (ack) => {
            if (!ack.ok) setError(ack.message);
          },
        );
      },
    },
  };
}
```

- [ ] **Step 5: Écrire les pages**

`apps/web/src/pages/JoinRoom.tsx` :

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Rejoindre une room</h1>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Code de la room</span>
        <input
          value={code}
          maxLength={4}
          aria-label="Code de la room"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="mono h-14 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 text-3xl tracking-[0.4em]"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Ton pseudo</span>
        <input
          value={nickname}
          maxLength={16}
          aria-label="Ton pseudo"
          onChange={(event) => setNickname(event.target.value)}
          className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      <Button
        disabled={code.length !== 4 || nickname.trim().length < 2}
        onClick={() => {
          writeJson(KEYS.nickname, nickname.trim());
          navigate(`/room/${code}`);
        }}
      >
        Rejoindre
      </Button>
    </section>
  );
}
```

`apps/web/src/pages/Room.tsx` :

```tsx
import { buildPool } from "@pkfind/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";
import { MultiReveal } from "../components/MultiReveal.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useRoom } from "../net/useRoom.js";
import { KEYS, readJson } from "../storage/local.js";

export function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const nickname = readJson(KEYS.nickname, "Dresseur");
  const room = useRoom({
    code,
    nickname,
    create: code === "new",
    onCreated: (realCode) => navigate(`/room/${realCode}`, { replace: true }),
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(handle);
  }, []);

  if (room.closed) return <p>La room a été fermée ({room.closed}).</p>;
  if (room.error) return <p style={{ color: "var(--danger)" }}>{room.error}</p>;
  if (!room.state) return <p>Connexion…</p>;

  const state = room.state;
  const isHost = state.players.find((player) => player.id === room.playerId)?.isHost ?? false;
  const pool = buildPool(state.settings.generations);

  if (room.final) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold">Classement final</h1>
        <Scoreboard standings={room.final.standings} highlightPlayerId={room.playerId ?? undefined} />
        {isHost && <Button onClick={room.actions.playAgain}>Rejouer</Button>}
      </section>
    );
  }

  if (room.reveal) {
    return (
      <MultiReveal target={room.reveal.target} results={room.reveal.results} maxId={pool.maxId} />
    );
  }

  if (room.round) {
    return (
      <section className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <p className="mono text-[var(--text-dim)]">
            Manche {room.round.roundIndex + 1} / {room.round.roundCount}
          </p>
          <ul className="flex gap-1">
            {state.players.map((player) => (
              <li
                key={player.id}
                title={player.nickname}
                aria-label={`${player.nickname} ${player.hasAnswered ? "a répondu" : "réfléchit"}`}
                className="h-3 w-3 rounded-full"
                style={{
                  background: player.hasAnswered ? "var(--success)" : "var(--border)",
                  opacity: player.connected ? 1 : 0.3,
                }}
              />
            ))}
          </ul>
        </header>
        <Timer
          remainingMs={room.round.localEndsAt - now}
          totalMs={state.settings.roundDurationMs}
        />
        <TargetNumber id={room.round.targetId} maxId={pool.maxId} />
        <PokemonCombobox pool={pool} onSubmit={(pokemon) => room.actions.answer(pokemon.id)} />
      </section>
    );
  }

  if (state.status === "countdown") {
    return <p className="mono text-center text-6xl">Ça commence…</p>;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Room</h1>
      <p className="mono text-6xl tracking-[0.3em]">{state.code}</p>
      <Button
        variant="ghost"
        onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/room/${state.code}`)}
      >
        Copier le lien
      </Button>
      <ul className="flex flex-col gap-2">
        {state.players.map((player) => (
          <li key={player.id} className="flex items-center gap-2">
            <span style={{ opacity: player.connected ? 1 : 0.4 }}>{player.nickname}</span>
            {player.isHost && <span aria-label="hôte">👑</span>}
          </li>
        ))}
      </ul>
      {isHost ? (
        <GenerationPicker
          value={state.settings.generations}
          onChange={(generations) =>
            room.actions.setSettings({ ...state.settings, generations })
          }
        />
      ) : (
        <p className="text-[var(--text-dim)]">
          Générations : {state.settings.generations.join(", ")} · {state.settings.roundDurationMs / 1000} s ·{" "}
          {state.settings.roundCount} manches
        </p>
      )}
      {isHost && (
        <>
          <Button
            disabled={state.players.filter((player) => player.connected).length < 2}
            onClick={room.actions.start}
          >
            Démarrer
          </Button>
          {state.players.filter((player) => player.connected).length < 2 && (
            <p className="text-sm text-[var(--text-dim)]">Il faut au moins 2 joueurs connectés.</p>
          )}
        </>
      )}
    </section>
  );
}
```

Ajouter les routes dans `App.tsx` : `<Route path="/join" element={<JoinRoom />} />` et `<Route path="/room/:code" element={<Room />} />`.

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

Run: `pnpm -F @pkfind/web exec vitest run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Vérifier à la main**

Run: `pnpm dev` puis ouvrir deux fenêtres sur `http://localhost:5173`
Expected: la première crée une room et affiche un code ; la seconde le saisit dans `/join` ; l'hôte démarre ; les deux voient le même numéro, répondent, puis le même tableau de révélation.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): client temps réel et écrans de room multijoueur"
```

---

### Task 20: Parcours multijoueur de bout en bout

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/multi.spec.ts`

**Interfaces:**
- Consumes: l'application complète.
- Produces: rien de nouveau.

- [ ] **Step 1: Faire tourner Playwright contre le serveur réel**

Remplacer `playwright.config.ts` — les tests visent désormais le serveur Node qui sert aussi le front, exactement comme en production :

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm build && pnpm -F @pkfind/server start",
    url: "http://localhost:3000/healthz",
    env: { PORT: "3000", COUNTDOWN_MS: "500", ROUND_REVEAL_MS: "1000", NODE_ENV: "production" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

- [ ] **Step 2: Écrire le test de bout en bout multijoueur**

`e2e/multi.spec.ts` :

```ts
import { expect, test } from "@playwright/test";

test("deux joueurs jouent une partie complète dans la même room", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("Sacha").fill("Mathéo");
  await host.getByRole("button", { name: "Créer une room" }).click();
  await expect(host).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{4}$/);
  const code = host.url().split("/").at(-1)!;

  await guest.goto("/join");
  await guest.getByLabel("Code de la room").fill(code);
  await guest.getByLabel("Ton pseudo").fill("Léa");
  await guest.getByRole("button", { name: "Rejoindre" }).click();
  await expect(host.getByText("Léa")).toBeVisible();

  await host.getByRole("button", { name: "Démarrer" }).click();

  for (let round = 1; round <= 10; round++) {
    await expect(host.getByText(`Manche ${round} / 10`)).toBeVisible({ timeout: 20_000 });
    const hostTarget = await host.getByLabel(/Numéro cible/).getAttribute("aria-label");
    const guestTarget = await guest.getByLabel(/Numéro cible/).getAttribute("aria-label");
    expect(hostTarget).toBe(guestTarget);

    for (const [page, answer] of [
      [host, "pikachu"],
      [guest, "roucool"],
    ] as const) {
      await page.getByRole("combobox").fill(answer);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
    await expect(host.getByRole("table")).toBeVisible({ timeout: 20_000 });
  }

  await expect(host.getByRole("heading", { name: "Classement final" })).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Classement final" })).toBeVisible();

  const hostRows = await host.getByRole("row").allInnerTexts();
  const guestRows = await guest.getByRole("row").allInnerTexts();
  expect(hostRows).toEqual(guestRows);

  await hostContext.close();
  await guestContext.close();
});

test("un joueur qui recharge la page retrouve sa place et son score", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("Sacha").fill("Mathéo");
  await host.getByRole("button", { name: "Créer une room" }).click();
  const code = host.url().split("/").at(-1)!;

  await guest.goto("/join");
  await guest.getByLabel("Code de la room").fill(code);
  await guest.getByLabel("Ton pseudo").fill("Léa");
  await guest.getByRole("button", { name: "Rejoindre" }).click();

  await host.getByRole("button", { name: "Démarrer" }).click();
  await expect(guest.getByText("Manche 1 / 10")).toBeVisible({ timeout: 20_000 });

  await guest.reload();
  await expect(guest.getByRole("combobox")).toBeVisible({ timeout: 10_000 });
  await expect(host.getByText("Léa")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
```

- [ ] **Step 3: Lancer les tests de bout en bout**

Run: `pnpm test:e2e`
Expected: les 4 tests (2 solo, 2 multi) PASS. Si le parcours multi expire, vérifier que `COUNTDOWN_MS` et `ROUND_REVEAL_MS` sont bien pris en compte par le serveur lancé par Playwright.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): parcours multijoueur à deux navigateurs et reconnexion"
```

---

## Phase 4 — Livraison

### Task 21: Conteneur Docker et documentation

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `README.md`
- Modify: `apps/server/src/config.ts` (valeur par défaut de `WEB_DIR` en production)

**Interfaces:**
- Consumes: l'application construite.
- Produces: une image exécutable exposant le port 3000.

- [ ] **Step 1: Écrire le Dockerfile**

`Dockerfile` :

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter @pkfind/server... \
  && pnpm store prune
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
```

`.dockerignore` :

```
node_modules
**/node_modules
**/dist
.git
.github
docs
e2e
test-results
playwright-report
coverage
*.log
.env
```

- [ ] **Step 2: Vérifier le chemin du front en production**

`config.webDir` vaut `"../../web/dist"` depuis la tâche 15 : résolu depuis `apps/server/dist/http.js`,
cela désigne bien `apps/web/dist`. Ajouter le test qui verrouille cette valeur :

```ts
it("pointe par défaut vers le front construit", () => {
  expect(loadConfig({}).webDir).toBe("../../web/dist");
});
```

- [ ] **Step 3: Écrire la composition et l'exemple d'environnement**

`docker-compose.yml` :

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

`.env.example` :

```bash
# Port d'écoute HTTP et WebSocket
PORT=3000
NODE_ENV=production
# debug | info | warn | error
LOG_LEVEL=info
# Vide = même origine uniquement. À ne renseigner que si le front est servi séparément.
CORS_ORIGIN=
# Durée de la révélation entre deux manches (ms)
ROUND_REVEAL_MS=6000
# Décompte avant la première manche (ms)
COUNTDOWN_MS=3000
# Tolérance de latence sur la fin de manche (ms)
ANSWER_GRACE_MS=1500
# Délai avant de retirer un joueur déconnecté (ms)
RECONNECT_GRACE_MS=60000
# Destruction d'une room vide (ms)
ROOM_EMPTY_TTL_MS=300000
# Durée de vie absolue d'une room (ms)
ROOM_MAX_AGE_MS=10800000
# Rooms simultanées
MAX_ROOMS=500
```

- [ ] **Step 4: Construire et vérifier l'image**

```bash
cp .env.example .env
docker compose up -d --build
curl -s http://localhost:3000/healthz
docker image ls | grep pokemon-find
```

Expected: `/healthz` renvoie `{"status":"ok",...}`, la page d'accueil s'affiche sur `http://localhost:3000`, une partie multi fonctionne entre deux navigateurs, et l'image pèse moins de 250 Mo.

- [ ] **Step 5: Écrire le README**

`README.md` doit contenir : présentation du jeu en trois phrases ; prérequis (Node 22, pnpm 9) ; `pnpm install` puis `pnpm dev` ; le tableau des variables d'environnement ; `docker compose up -d --build` ; le tableau des commandes de test ; un lien vers `docs/superpowers/specs/2026-09-04-pokemon-find-design.md` ; et l'extrait Nginx suivant pour un déploiement derrière un reverse proxy :

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

- [ ] **Step 6: Vérification finale**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: tout passe. Reprendre ensuite les 16 critères d'acceptation de la section 14 de la spécification et les vérifier un par un.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: conteneur Docker autonome, composition et documentation"
```
