const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COLORS = {
  normal: "var(--accent-2)",
  warn: "var(--warn)",
  danger: "var(--danger)",
} as const;

export function Timer({
  remainingMs,
  totalMs,
}: {
  /** `null` quand la manche est sans limite de temps : il n'y a rien à décompter. */
  remainingMs: number | null;
  totalMs: number;
}) {
  // Un anneau plein et figé plutôt qu'un chrono absent : la place reste occupée, et le
  // joueur voit qu'il n'y a pas de compte à rebours au lieu de croire qu'il n'a pas chargé.
  if (remainingMs === null) {
    return (
      <div className="flex items-center justify-center">
        <span
          role="img"
          aria-label="Pas de limite de temps"
          className="mono flex h-11 w-11 items-center justify-center rounded-full border-4 text-xl"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          ∞
        </span>
      </div>
    );
  }

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
        <text x="22" y="27" textAnchor="middle" className="mono" fill="var(--text)" fontSize="14">
          {seconds}
        </text>
      </svg>
    </div>
  );
}
