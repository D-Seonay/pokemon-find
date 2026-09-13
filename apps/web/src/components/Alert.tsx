type Tone = "error" | "success";

const TONES: Readonly<Record<Tone, { color: string; icon: string; label: string }>> = {
  // `alert` interrompt un lecteur d'écran, `status` attend une pause : une erreur mérite
  // l'interruption, une confirmation non.
  error: { color: "var(--danger)", icon: "⚠", label: "Erreur" },
  success: { color: "var(--success)", icon: "✓", label: "Confirmation" },
};

/**
 * Un message à l'utilisateur, toujours présenté pareil. Les erreurs avaient jusqu'ici
 * trois traitements différents selon l'écran, dont un simple paragraphe rouge sans issue.
 */
export function Alert({
  tone,
  children,
  onDismiss,
}: {
  tone: Tone;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const { color, icon, label } = TONES[tone];

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className="flex items-center gap-3 rounded-[var(--radius-sm)] border px-4 py-3"
      style={{ borderColor: color, color }}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {icon}
      </span>
      {/* Le pictogramme ne dit rien à qui ne le voit pas : le ton est nommé en toutes lettres. */}
      <span className="sr-only">{label} : </span>
      <span className="flex-1 text-[var(--text)]">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer le message"
          className="shrink-0 rounded-[var(--radius-sm)] border px-2 py-1 text-sm"
          style={{ borderColor: color }}
        >
          Fermer
        </button>
      )}
    </p>
  );
}
