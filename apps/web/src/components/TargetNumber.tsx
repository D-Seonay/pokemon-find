export function TargetNumber({ id, maxId }: { id: number; maxId: number }) {
  const width = maxId > 999 ? 4 : 3;
  return (
    <p
      aria-label={`Numéro cible ${id}`}
      className="mono my-6 text-center leading-none"
      style={{ fontSize: "clamp(4rem, 18vw, 10rem)", color: "var(--accent)" }}
    >
      <span aria-hidden="true" style={{ fontSize: "0.4em", color: "var(--text-dim)" }}>
        #
      </span>
      <span>{String(id).padStart(width, "0")}</span>
    </p>
  );
}
