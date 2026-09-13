import { useEffect, useState } from "react";
import { Button } from "./Button.js";

const FEEDBACK_MS = 2000;

type State = "idle" | "copied" | "failed";

/**
 * Copie un texte et le DIT. Le bouton restait auparavant muet : rien ne distinguait un
 * clic réussi d'un clic manqué, et l'échec était même avalé par un `void`.
 *
 * L'échec n'est pas théorique : le presse-papiers est refusé hors contexte sécurisé et
 * quand la permission est bloquée. Annoncer « Copié » dans ces cas-là serait mentir, et
 * le joueur enverrait un lien vide à ses amis.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return undefined;
    const handle = setTimeout(() => setState("idle"), FEEDBACK_MS);
    return () => clearTimeout(handle);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Button variant="ghost" onClick={() => void copy()}>
        {state === "copied" ? "Lien copié ✓" : label}
      </Button>
      {/* Annoncé aussi aux lecteurs d'écran : le changement de libellé du bouton ne
          suffit pas, le focus restant dessus sans qu'il soit relu. Rendu seulement quand
          il y a quelque chose à dire — une région live vide reste un repère annoncé, et
          en laisser une en permanence encombre la page pour rien. */}
      {state === "copied" && (
        <span role="status" className="sr-only">
          Lien copié dans le presse-papiers.
        </span>
      )}
      {state === "failed" && (
        <span className="text-sm" style={{ color: "var(--danger)" }}>
          Copie impossible. Le lien reste sélectionnable à la main : {value}
        </span>
      )}
    </div>
  );
}
