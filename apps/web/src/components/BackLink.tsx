import { Link } from "react-router-dom";

/**
 * Le retour, en tête d'écran. Il était auparavant en bas de page : sur le Pokédex, il
 * fallait faire défiler un millier de fiches pour le trouver. Au-delà du confort, c'est
 * aussi le premier élément focalisable de la page, donc celui qu'une tabulation atteint
 * en premier — ce qu'on attend d'une commande de retour.
 */
export function BackLink({
  to = "/",
  label = "Retour à l'accueil",
}: {
  to?: string;
  label?: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-dim)] hover:text-[var(--text)]"
    >
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
