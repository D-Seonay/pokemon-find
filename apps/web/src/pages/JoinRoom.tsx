import { CODE_LENGTH, isCodeChar, isValidRoomCode, sanitizeRoomCodeInput } from "@pkfind/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  // Un caractère écarté qui disparaît sans un mot laisse le joueur croire que son clavier
  // ne répond pas. Le cas courant n'est pas malveillant : on lui dicte un code, il entend
  // « O » et tape la lettre, absente de l'alphabet.
  const [rejected, setRejected] = useState(false);
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Rejoindre une room</h1>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Code de la room</span>
        <input
          value={code}
          // Pas de `maxLength` : il tronquerait la saisie BRUTE avant nettoyage, et un
          // code collé avec des espaces (« ␣␣ab23␣␣ ») perdrait ses derniers caractères.
          // La longueur est imposée par `sanitizeRoomCodeInput`, à un seul endroit.
          aria-label="Code de la room"
          onChange={(event) => {
            const raw = event.target.value;
            setCode(sanitizeRoomCodeInput(raw));
            // Les espaces ne comptent pas : coller un code entouré d'espaces est normal,
            // et n'a pas à déclencher un avertissement.
            const dropped = [...raw.toUpperCase().replace(/\s+/g, "")].filter(
              (char) => !isCodeChar(char),
            );
            setRejected(dropped.length > 0);
          }}
          className="mono h-14 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 text-2xl tracking-[0.3em] sm:text-3xl sm:tracking-[0.4em]"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Ton pseudo</span>
        <input
          value={nickname}
          maxLength={16}
          aria-label="Ton pseudo"
          onChange={(event) => setNickname(event.target.value)}
          className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      {rejected && (
        <p role="status" className="text-sm" style={{ color: "var(--warn)" }}>
          Les codes ne contiennent ni I, ni O, ni 0, ni 1 — pour éviter les confusions quand on se
          les dicte.
        </p>
      )}
      <Button
        disabled={!isValidRoomCode(code) || nickname.trim().length < 2}
        onClick={() => {
          writeJson(KEYS.nickname, nickname.trim());
          navigate(`/room/${code}`);
        }}
      >
        Rejoindre
      </Button>
    </section>
  );
}
