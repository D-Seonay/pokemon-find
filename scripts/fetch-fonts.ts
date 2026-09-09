import { mkdir, writeFile } from "node:fs/promises";

/**
 * Récupère les woff2 des polices utilisées par l'interface pour les servir nous-mêmes.
 * Sans ça, `index.html` appelle fonts.googleapis.com puis fonts.gstatic.com à chaque
 * chargement de page : deux connexions avant le premier texte affiché, et l'adresse IP
 * de chaque joueur qui part chez un tiers. Pendant du script `fetch-sprites.ts`.
 */
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Space+Mono:wght@700&display=swap";

// Google sert des formats différents selon l'agent annoncé : sans un agent moderne, on
// reçoit du TTF (224 Ko) au lieu du woff2 (87 Ko).
const MODERN_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUT_DIR = new URL("../apps/web/public/fonts/", import.meta.url);

type Face = {
  family: string;
  weight: string;
  style: string;
  url: string;
  /** Le sous-ensemble Unicode (`latin`, `latin-ext`, ...), annoncé en commentaire. */
  subset: string;
  /** Les plages couvertes, à reporter telles quelles : sans elles, le navigateur
   *  télécharge toutes les variantes au lieu de la seule dont la page a besoin. */
  unicodeRange: string;
};

/**
 * Google ne renvoie pas une `@font-face` par graisse mais une par graisse ET par
 * sous-ensemble Unicode : trois graisses d'Outfit donnent six blocs (latin, latin-ext).
 * Les confondre écraserait les fichiers entre eux et ferait disparaître les
 * `unicode-range` — donc les caractères accentués, ce qui se voit immédiatement en
 * français. Chaque bloc garde ici son propre fichier et sa propre plage.
 */
function parseFaces(css: string): Face[] {
  const faces: Face[] = [];
  // Le nom du sous-ensemble n'apparaît que dans le commentaire qui précède le bloc.
  const chunks = css.split(/\/\*\s*([a-z0-9-]+)\s*\*\//i);
  for (let i = 1; i < chunks.length; i += 2) {
    const subset = chunks[i] ?? "";
    const block = chunks[i + 1] ?? "";
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const style = /font-style:\s*(\w+)/.exec(block)?.[1];
    const url = /url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/.exec(block)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (!family || !weight || !style || !url || !unicodeRange) continue;
    faces.push({ family, weight, style, url, subset, unicodeRange: unicodeRange.trim() });
  }
  return faces;
}

/**
 * `Outfit` + `600` + `latin-ext` -> `outfit-600-latin-ext.woff2`. La graisse reste dans
 * le nom : pour une police à fichiers statiques elle distingue les variantes, et pour une
 * police variable elle nomme simplement la première graisse rencontrée, le fichier étant
 * ensuite partagé par les autres (voir la déduplication par URL).
 */
function fileNameOf(face: Face): string {
  const family = face.family.toLowerCase().replace(/\s+/g, "-");
  return `${family}-${face.weight}-${face.subset}.woff2`;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const response = await fetch(CSS_URL, { headers: { "User-Agent": MODERN_AGENT } });
  if (!response.ok) throw new Error(`CSS Google : HTTP ${response.status}`);
  const css = await response.text();

  const faces = parseFaces(css);
  if (faces.length === 0) throw new Error("Aucune @font-face trouvée : le format du CSS a changé");

  // Une police manquante casserait la typographie sans bruit ; mieux vaut échouer ici.
  const expected = new Set(["Outfit-400", "Outfit-600", "Outfit-800", "Space Mono-700"]);
  const found = new Set(faces.map((f) => `${f.family}-${f.weight}`));
  for (const want of expected) {
    if (!found.has(want)) throw new Error(`Police attendue absente du CSS : ${want}`);
  }

  let bytes = 0;
  const rules: string[] = [];

  // Outfit est une police variable : Google sert le MÊME fichier pour 400, 600 et 800,
  // seule la déclaration `font-weight` change. Les écrire sous trois noms différents
  // ferait télécharger trois fois le même octet au navigateur — strictement pire que
  // l'état actuel. On garde donc un fichier par URL source, référencé par autant de
  // règles que nécessaire.
  const byUrl = new Map<string, string>();

  for (const face of faces) {
    let name = byUrl.get(face.url);
    if (name === undefined) {
      const file = await fetch(face.url, { headers: { "User-Agent": MODERN_AGENT } });
      if (!file.ok) throw new Error(`HTTP ${file.status} pour ${face.url}`);
      const data = new Uint8Array(await file.arrayBuffer());
      if (data.byteLength < 1000) throw new Error(`Fichier suspect pour ${face.family}`);
      name = fileNameOf(face);
      await writeFile(new URL(name, OUT_DIR), data);
      byUrl.set(face.url, name);
      bytes += data.byteLength;
    }
    rules.push(
      [
        "@font-face {",
        `  font-family: "${face.family}";`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weight};`,
        // Le texte doit rester lisible pendant le chargement : `swap` affiche
        // immédiatement la police système puis échange, plutôt que de laisser un blanc.
        "  font-display: swap;",
        `  src: url("/fonts/${name}") format("woff2");`,
        `  unicode-range: ${face.unicodeRange};`,
        "}",
      ].join("\n"),
    );
  }

  process.stdout.write(`${rules.join("\n\n")}\n`);
  const subsets = [...new Set(faces.map((f) => f.subset))].join(", ");
  process.stderr.write(
    `${faces.length} règles @font-face, ${byUrl.size} fichiers distincts (${subsets}), ` +
      `${bytes} o dans apps/web/public/fonts/.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
