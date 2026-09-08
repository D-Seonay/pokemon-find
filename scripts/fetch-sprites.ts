import { mkdir, writeFile } from "node:fs/promises";
import { MAX_POKEMON_ID } from "../packages/shared/src/domain/generations.js";

// Le petit sprite 96 px, et non `other/official-artwork` : l'illustration haute
// résolution pèse ~141 Ko contre ~1,5 Ko ici, pour être affichée à 40 px dans le
// Pokédex et 160 px à la révélation. Les 1025 petits sprites tiennent dans ~1 Mo,
// donc dans l'image Docker — le jeu n'a plus besoin d'atteindre GitHub à l'exécution.
const SOURCE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

const OUT_DIR = new URL("../apps/web/public/sprites/", import.meta.url);

// Assez pour que le téléchargement reste court, assez bas pour ne pas se faire
// limiter par GitHub : les 1025 fichiers passent en une poignée de secondes.
const CONCURRENCY = 8;

async function fetchSprite(id: number): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(SOURCE(id));
      if (!response.ok) throw new Error(`HTTP ${response.status} pour ${id}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error("inatteignable");
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const ids = Array.from({ length: MAX_POKEMON_ID }, (_, index) => index + 1);
  let done = 0;
  let bytes = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const id = ids.shift();
      if (id === undefined) return;
      const data = await fetchSprite(id);
      // Un fichier vide ou une page d'erreur passerait sinon inaperçu jusqu'au navigateur.
      if (data.byteLength < 100) throw new Error(`Sprite ${id} suspect : ${data.byteLength} o`);
      await writeFile(new URL(`${id}.png`, OUT_DIR), data);
      bytes += data.byteLength;
      done += 1;
      if (done % 100 === 0) process.stdout.write(`${done}/${MAX_POKEMON_ID}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write(`Écrit ${done} sprites, ${(bytes / 1024 / 1024).toFixed(2)} Mo au total.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
