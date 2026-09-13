import { useMemo } from "react";
import { encode } from "uqr";

/**
 * Zone de silence, en modules. La spécification QR en impose quatre : sans elle, un
 * lecteur peine à isoler le code de ce qui l'entoure. Ce n'est que du blanc, autant le
 * respecter plutôt que de grappiller quelques pixels au prix de la fiabilité.
 */
const QUIET_ZONE = 4;

export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const matrix = useMemo(() => encode(value), [value]);
  const span = matrix.size + QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={`QR code vers ${value}`}
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      // Fond clair et modules sombres, à rebours du reste de l'interface : tous les
      // lecteurs ne gèrent pas un code inversé, et celui-ci doit se scanner du premier
      // coup depuis le téléphone de quelqu'un d'autre.
      style={{ background: "#ffffff", borderRadius: "var(--radius-sm)" }}
      shapeRendering="crispEdges"
    >
      {matrix.data.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect
              key={`${x}-${y}`}
              x={x + QUIET_ZONE}
              y={y + QUIET_ZONE}
              width={1}
              height={1}
              fill="#0a0b0f"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
