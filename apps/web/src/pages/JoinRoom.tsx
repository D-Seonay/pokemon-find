import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Rejoindre une room</h1>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Code de la room</span>
        <input
          value={code}
          maxLength={4}
          aria-label="Code de la room"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="mono h-14 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 text-3xl tracking-[0.4em]"
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
      <Button
        disabled={code.length !== 4 || nickname.trim().length < 2}
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
