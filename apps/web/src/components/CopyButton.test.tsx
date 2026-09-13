import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton.js";

// `navigator.clipboard` n'a qu'un accesseur en lecture sous jsdom : il faut redéfinir la
// propriété, pas l'assigner. Et on s'en tient à `fireEvent` : `userEvent.setup()` installe
// son PROPRE presse-papiers, qui écraserait ce doublon sans rien dire.
function stubClipboard(impl: () => Promise<void>): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

afterEach(() => vi.restoreAllMocks());

describe("CopyButton", () => {
  it("confirme la copie au lieu de rester muet", async () => {
    stubClipboard(() => Promise.resolve());
    render(<CopyButton value="https://x.test/room/AB23" label="Copier le lien" />);

    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
    await act(async () => {});

    expect(screen.getByRole("button", { name: /Lien copié/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("presse-papiers");
  });

  it("copie bien la valeur demandée", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<CopyButton value="https://x.test/room/AB23" label="Copier le lien" />);

    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
    await act(async () => {});

    expect(writeText).toHaveBeenCalledWith("https://x.test/room/AB23");
  });

  // Le presse-papiers est refusé hors contexte sécurisé ou permission bloquée. Annoncer
  // « Copié » dans ces cas-là ferait envoyer un lien vide à ses amis.
  it("le dit quand la copie échoue, et montre le lien à recopier", async () => {
    stubClipboard(() => Promise.reject(new Error("refusé")));
    render(<CopyButton value="https://x.test/room/AB23" label="Copier le lien" />);

    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
    await act(async () => {});

    expect(screen.getByText(/Copie impossible/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/x.test\/room\/AB23/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lien copié/ })).toBeNull();
  });

  it("revient à son libellé initial après quelques secondes", async () => {
    vi.useFakeTimers();
    try {
      stubClipboard(() => Promise.resolve());
      render(<CopyButton value="x" label="Copier le lien" />);

      fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }));
      // Faux timers actifs : la promesse du presse-papiers doit être laissée se résoudre
      // explicitement, sinon l'état n'a pas encore changé quand on regarde.
      await act(async () => {});
      expect(screen.getByRole("button", { name: /Lien copié/ })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
