import { writeFile } from "node:fs/promises";
import { MAX_POKEMON_ID } from "../packages/shared/src/domain/generations.js";

/**
 * Les données de consultation du Pokédex : types, gabarit, catégorie, description,
 * statistiques de base. Volontairement SÉPARÉES de `pokemon.json`.
 *
 * `pokemon.json` est embarqué dans le bundle parce que le jeu s'en sert à chaque manche
 * (autocomplétion, résolution d'un numéro). Ces données-ci ne servent qu'à l'écran du
 * Pokédex : les embarquer alourdirait le chargement de tout le monde, y compris de ceux
 * qui ne l'ouvrent jamais. Elles partent donc dans un fichier servi à part, chargé au
 * moment où l'on ouvre le Pokédex.
 */
const OUT = new URL("../apps/web/public/pokemon-details.json", import.meta.url);

const CONCURRENCY = 6;

type Detail = {
  types: string[];
  heightM: number;
  weightKg: number;
  genus: string;
  flavor: string;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
};

type PokemonResponse = {
  types: { type: { name: string } }[];
  height: number;
  weight: number;
  stats: { stat: { name: string }; base_stat: number }[];
};

type SpeciesResponse = {
  genera: { genus: string; language: { name: string } }[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
};

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

function statOf(stats: PokemonResponse["stats"], name: string): number {
  return stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
}

async function detailOf(id: number): Promise<Detail> {
  const [mon, species] = await Promise.all([
    getJson<PokemonResponse>(`https://pokeapi.co/api/v2/pokemon/${id}`),
    getJson<SpeciesResponse>(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  const genus = species.genera.find((g) => g.language.name === "fr")?.genus ?? "";
  // Les descriptions contiennent des retours à la ligne et des espaces insécables hérités
  // des cartouches d'origine : illisibles tels quels dans une mise en page fluide.
  const flavor = (
    species.flavor_text_entries.find((f) => f.language.name === "fr")?.flavor_text ?? ""
  )
    .replace(/[\n\f\r­]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    types: mon.types.map((t) => t.type.name),
    // L'API donne des décimètres et des hectogrammes : on convertit une fois ici plutôt
    // que de laisser chaque écran refaire la division.
    heightM: mon.height / 10,
    weightKg: mon.weight / 10,
    genus,
    flavor,
    stats: {
      hp: statOf(mon.stats, "hp"),
      atk: statOf(mon.stats, "attack"),
      def: statOf(mon.stats, "defense"),
      spa: statOf(mon.stats, "special-attack"),
      spd: statOf(mon.stats, "special-defense"),
      spe: statOf(mon.stats, "speed"),
    },
  };
}

async function main(): Promise<void> {
  const ids = Array.from({ length: MAX_POKEMON_ID }, (_, i) => i + 1);
  const out: Record<string, Detail> = {};
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const id = ids.shift();
      if (id === undefined) return;
      out[String(id)] = await detailOf(id);
      done += 1;
      if (done % 100 === 0) process.stdout.write(`${done}/${MAX_POKEMON_ID}\n`);
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (Object.keys(out).length !== MAX_POKEMON_ID) {
    throw new Error(`Attendu ${MAX_POKEMON_ID} entrées, obtenu ${Object.keys(out).length}`);
  }
  const missing = Object.entries(out).filter(([, d]) => d.types.length === 0);
  if (missing.length > 0) throw new Error(`Types manquants : ${missing.length} entrées`);

  // Trié par numéro : un JSON stable d'une génération à l'autre, donc un diff lisible.
  const sorted = Object.fromEntries(
    Object.keys(out)
      .map(Number)
      .sort((a, b) => a - b)
      .map((id) => [String(id), out[String(id)]]),
  );
  await writeFile(OUT, `${JSON.stringify(sorted)}\n`, "utf8");
  process.stdout.write(`Écrit ${Object.keys(sorted).length} fiches.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
