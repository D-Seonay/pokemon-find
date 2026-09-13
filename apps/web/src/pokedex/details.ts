/**
 * Les fiches détaillées, servies à part de `pokemon.json`.
 *
 * Le jeu n'en a jamais besoin : il lui faut des noms et des numéros, rien d'autre. Les
 * embarquer dans le bundle ferait payer à chaque joueur — y compris à celui qui n'ouvre
 * jamais le Pokédex — environ 45 Ko compressés. Elles sont donc servies en fichier
 * statique par notre propre serveur, chargé au moment où le Pokédex s'ouvre.
 */
export type PokemonDetail = {
  types: string[];
  heightM: number;
  weightKg: number;
  genus: string;
  flavor: string;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  /**
   * La famille d'évolution, par étages. Ramifiée quand un étage compte plusieurs entrées
   * — Évoli en a huit. Vide si l'espèce n'évolue pas.
   */
  evolution: number[][];
};

export type DetailMap = Readonly<Record<string, PokemonDetail>>;

const URL_PATH = "/pokemon-details.json";

// Une seule requête par session, même si plusieurs écrans ouvrent le Pokédex : la promesse
// est mémorisée, pas seulement son résultat.
let pending: Promise<DetailMap> | null = null;

function isDetail(value: unknown): value is PokemonDetail {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    Array.isArray(c.types) &&
    c.types.every((t) => typeof t === "string") &&
    typeof c.heightM === "number" &&
    typeof c.weightKg === "number" &&
    typeof c.genus === "string" &&
    typeof c.flavor === "string" &&
    typeof c.stats === "object" &&
    c.stats !== null &&
    Array.isArray(c.evolution) &&
    c.evolution.every(
      (stage) => Array.isArray(stage) && stage.every((id) => typeof id === "number"),
    )
  );
}

export async function loadDetails(): Promise<DetailMap> {
  pending ??= fetch(URL_PATH)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw: unknown = await response.json();
      if (typeof raw !== "object" || raw === null) throw new Error("Format inattendu");
      // Validé entrée par entrée, comme le stockage local : un fichier tronqué ou d'une
      // version antérieure ne doit pas faire planter l'écran, juste livrer moins.
      const out: Record<string, PokemonDetail> = {};
      for (const [id, value] of Object.entries(raw)) {
        if (isDetail(value)) out[id] = value;
      }
      return out;
    })
    .catch((error: unknown) => {
      // Une panne de chargement ne doit pas condamner la session : on oublie la promesse
      // pour qu'une réouverture du Pokédex retente, et on rend une table vide en attendant.
      pending = null;
      throw error;
    });
  return pending;
}

/** Réservé aux tests : repart d'une session sans cache. */
export function resetDetailsCache(): void {
  pending = null;
}
