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
