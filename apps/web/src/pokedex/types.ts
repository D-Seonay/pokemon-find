/**
 * Les dix-huit types, avec leur nom français et leur couleur. Table locale plutôt que
 * donnée téléchargée : ces valeurs ne changent jamais, et les avoir en dur évite de faire
 * dépendre l'affichage du fichier de détails, qui peut ne pas être encore arrivé.
 */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  normal: "Normal",
  fire: "Feu",
  water: "Eau",
  electric: "Électrik",
  grass: "Plante",
  ice: "Glace",
  fighting: "Combat",
  poison: "Poison",
  ground: "Sol",
  flying: "Vol",
  psychic: "Psy",
  bug: "Insecte",
  rock: "Roche",
  ghost: "Spectre",
  dragon: "Dragon",
  dark: "Ténèbres",
  steel: "Acier",
  fairy: "Fée",
};

const TYPE_COLORS: Readonly<Record<string, string>> = {
  normal: "#9099a1",
  fire: "#ff9d55",
  water: "#5090d6",
  electric: "#f4d23c",
  grass: "#63bc5a",
  ice: "#73cec0",
  fighting: "#ce4069",
  poison: "#ab6ac8",
  ground: "#d97845",
  flying: "#8fa8dd",
  psychic: "#fa7179",
  bug: "#90c12c",
  rock: "#c7b78b",
  ghost: "#5269ac",
  dragon: "#0b6dc3",
  dark: "#5a5465",
  steel: "#5a8ea2",
  fairy: "#ec8fe6",
};

/** Un type inconnu garde son identifiant brut plutôt que de disparaître de l'écran. */
export function labelOfType(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function colorOfType(type: string): string {
  return TYPE_COLORS[type] ?? "#6b7280";
}
