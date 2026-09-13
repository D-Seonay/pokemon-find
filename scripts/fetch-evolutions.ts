import { readFile, writeFile } from "node:fs/promises";
import { MAX_POKEMON_ID } from "../packages/shared/src/domain/generations.js";

/**
 * Ajoute la chaîne d'évolution à chaque fiche de `pokemon-details.json`.
 *
 * La chaîne est stockée par ÉTAGES (`number[][]`) et non à plat : certaines familles
 * se ramifient — Évoli donne huit évolutions au même étage — et une liste plate
 * laisserait croire à une succession.
 *
 * Les chaînes sont mises en cache par identifiant : elles sont partagées par toute une
 * famille, donc ~540 requêtes suffisent pour les 1025 espèces.
 */
const FILE = new URL("../apps/web/public/pokemon-details.json", import.meta.url);
const CONCURRENCY = 6;

type ChainNode = { species: { url: string }; evolves_to: ChainNode[] };

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} définitif pour ${url}`);
      return (await res.json()) as T;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error("inatteignable");
}

/** `https://pokeapi.co/api/v2/pokemon-species/94/` -> 94 */
function idOf(url: string): number {
  const parts = url.split("/").filter(Boolean);
  return Number(parts[parts.length - 1]);
}

function stagesOf(root: ChainNode): number[][] {
  const stages: number[][] = [];
  let level: ChainNode[] = [root];
  while (level.length > 0) {
    // Au-delà du dataset (formes régionales, espèces hors Pokédex national) : écartées,
    // sans quoi la fiche proposerait des évolutions que le jeu ne connaît pas.
    const ids = level.map((n) => idOf(n.species.url)).filter((id) => id <= MAX_POKEMON_ID);
    if (ids.length > 0) stages.push(ids);
    level = level.flatMap((n) => n.evolves_to);
  }
  return stages;
}

async function main(): Promise<void> {
  const details = JSON.parse(await readFile(FILE, "utf8")) as Record<
    string,
    Record<string, unknown>
  >;

  const chainCache = new Map<string, number[][]>();
  const ids = Array.from({ length: MAX_POKEMON_ID }, (_, i) => i + 1);
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const id = ids.shift();
      if (id === undefined) return;
      const species = await getJson<{ evolution_chain: { url: string } | null }>(
        `https://pokeapi.co/api/v2/pokemon-species/${id}`,
      );
      const chainUrl = species.evolution_chain?.url;
      let stages: number[][] = [];
      if (chainUrl) {
        const cached = chainCache.get(chainUrl);
        if (cached) stages = cached;
        else {
          const chain = await getJson<{ chain: ChainNode }>(chainUrl);
          stages = stagesOf(chain.chain);
          chainCache.set(chainUrl, stages);
        }
      }
      const entry = details[String(id)];
      if (entry) entry.evolution = stages;
      done += 1;
      if (done % 200 === 0) process.stdout.write(`${done}/${MAX_POKEMON_ID}\n`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const without = Object.entries(details).filter(([, d]) => !Array.isArray(d.evolution));
  if (without.length > 0) throw new Error(`Chaîne manquante : ${without.length} entrées`);

  await writeFile(FILE, `${JSON.stringify(details)}\n`, "utf8");
  process.stdout.write(`Chaînes ajoutées (${chainCache.size} familles distinctes).\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
