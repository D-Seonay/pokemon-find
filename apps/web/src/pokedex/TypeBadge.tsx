import { colorOfType, labelOfType } from "./types.js";

export function TypeBadge({ type, size = "sm" }: { type: string; size?: "sm" | "md" }) {
  return (
    <span
      className={
        size === "md"
          ? "rounded-full px-3 py-1 text-sm font-semibold"
          : "rounded-full px-2 py-0.5 text-xs font-semibold"
      }
      // Texte sombre sur pastille colorée : les couleurs de types sont claires et
      // saturées, du blanc dessus serait illisible.
      style={{ background: colorOfType(type), color: "#15171d" }}
    >
      {labelOfType(type)}
    </span>
  );
}
