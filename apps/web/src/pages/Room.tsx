import { buildPool, type GameSettings, isUnlimitedRound, tryPokemonById } from "@pkfind/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";
import { PokedexBrowser } from "../components/PokedexBrowser.js";
import { PokemonSprite } from "../components/PokemonSprite.js";
import { QrCode } from "../components/QrCode.js";
import { BlitzRoom } from "../blitz/BlitzRoom.js";
import { GameModePicker } from "../blitz/GameModePicker.js";
import { formatBlitzDuration } from "./BlitzSetup.js";
import { RoundTimingPicker } from "../components/RoundTimingPicker.js";
import { MultiReveal } from "../components/MultiReveal.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useRoom } from "../net/useRoom.js";
import { KEYS, readJson } from "../storage/local.js";

export function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const nickname = readJson(KEYS.nickname, "Dresseur");
  const room = useRoom({
    code,
    nickname,
    create: code === "new",
    onCreated: (realCode) => navigate(`/room/${realCode}`, { replace: true }),
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(handle);
  }, []);

  // GenerationPicker est entièrement piloté par l'état serveur (`value` ci-dessous vient de
  // `state.settings.generations`) : deux clics rapprochés recalculeraient sinon tous deux
  // depuis la même valeur serveur périmée, le second écrasant le premier une fois le débat
  // de `setSettings` écoulé. Le choix en attente compose donc les clics ici, côté état
  // local, et sert de source de vérité pour l'affichage tant que l'écriture réseau n'a pas
  // été accusée ; on se réconcilie avec l'état serveur dès que cet accusé revient.
  // Tous les réglages, et pas seulement les générations : avant l'accusé de réception,
  // `state.settings` porte encore l'ancienne valeur. Composer un second changement à partir
  // de lui annulerait silencieusement le premier — changer la durée puis cocher une
  // génération dans la foulée remettrait la durée à sa valeur d'avant.
  const [pendingSettings, setPendingSettings] = useState<GameSettings | null>(null);
  const [pokedexOpen, setPokedexOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // La règle "leave on unmount" (stopper les fantômes qui ne répondent jamais, ce qui
  // forcerait chaque manche à courir jusqu'à son terme) vit désormais dans `useRoom` lui-même :
  // elle a besoin d'y distinguer un vrai démontage d'un remount `<StrictMode>` synchrone, ce
  // que seul le hook peut faire puisque c'est lui qui possède la ref de jointure à réarmer.

  if (room.closed) return <p>La room a été fermée ({room.closed}).</p>;
  // Erreur fatale : uniquement issue du chemin de jointure (room introuvable, pleine,
  // partie déjà commencée, jeton invalide…). Le joueur ne peut vraiment pas continuer, donc
  // elle remplace tout l'écran pour le reste de la session. Toute erreur d'action
  // (répondre en retard, redémarrer une partie déjà lancée, etc.) est passagère et ne doit
  // jamais produire cet écran mort : voir `room.actionError` plus bas.
  if (room.error) return <p style={{ color: "var(--danger)" }}>{room.error}</p>;
  if (!room.state) return <p>Connexion…</p>;

  const state = room.state;
  const isHost = state.players.find((player) => player.id === room.playerId)?.isHost ?? false;
  const pool = buildPool(state.settings.generations);

  function renderBody() {
    if (room.final) {
      return (
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-extrabold">Classement final</h1>
          <Scoreboard
            standings={room.final.standings}
            {...(room.playerId ? { highlightPlayerId: room.playerId } : {})}
          />
          {isHost && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => room.actions.playAgain(true)}>
                Rejouer les mêmes numéros
              </Button>
              <Button variant="ghost" onClick={() => room.actions.playAgain(false)}>
                Nouvelle partie
              </Button>
            </div>
          )}
        </section>
      );
    }

    if (room.reveal) {
      return (
        <MultiReveal target={room.reveal.target} results={room.reveal.results} maxId={pool.maxId} />
      );
    }

    if (room.blitz) {
      const blitzPool = buildPool(state.blitzSettings.generations);
      return (
        <BlitzRoom
          pool={blitzPool}
          found={room.blitz.found}
          endsAt={room.blitz.localEndsAt}
          now={now}
          players={state.players}
          onFound={(pokemon) => room.actions.submitBlitz(pokemon.nameFr, pokemon.id)}
          {...(room.playerId ? { playerId: room.playerId } : {})}
        />
      );
    }

    if (room.round) {
      const answered =
        room.round.answeredPokemonId === null
          ? null
          : (tryPokemonById(room.round.answeredPokemonId) ?? null);
      const hasAnswered =
        state.players.find((player) => player.id === room.playerId)?.hasAnswered ?? false;

      return (
        <section className="flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <p className="mono text-[var(--text-dim)]">
              Manche {room.round.roundIndex + 1} / {room.round.roundCount}
            </p>
            <ul className="flex gap-1">
              {state.players.map((player) => (
                <li
                  key={player.id}
                  title={player.nickname}
                  aria-label={`${player.nickname} ${player.hasAnswered ? "a répondu" : "réfléchit"}`}
                  className="h-3 w-3 rounded-full"
                  style={{
                    background: player.hasAnswered ? "var(--success)" : "var(--border)",
                    opacity: player.connected ? 1 : 0.3,
                  }}
                />
              ))}
            </ul>
          </header>
          <Timer
            remainingMs={
              isUnlimitedRound(state.settings.roundDurationMs) ? null : room.round.localEndsAt - now
            }
            totalMs={state.settings.roundDurationMs}
          />
          <TargetNumber id={room.round.targetId} maxId={pool.maxId} />
          {answered !== null ? (
            // Répondu : on rappelle le choix et on retire le champ. Le garder actif
            // invitait à resaisir pour ne récolter qu'un « Tu as déjà répondu ».
            <div className="flex flex-col items-center gap-2">
              <p>
                Votre réponse : <strong>{answered.nameFr}</strong>
              </p>
              <PokemonSprite pokemon={answered} size={96} />
              <p className="text-sm text-[var(--text-dim)]">En attente des autres joueurs…</p>
            </div>
          ) : hasAnswered ? (
            // Le serveur nous sait ayant répondu mais on ignore quoi : c'est le cas d'une
            // reconnexion en pleine manche, `answeredPokemonId` ne survivant pas au
            // rechargement. Mieux vaut le dire que de rouvrir un champ qui sera refusé.
            <p className="text-center text-[var(--text-dim)]">
              Vous avez déjà répondu pour cette manche.
            </p>
          ) : (
            <PokemonCombobox pool={pool} onSubmit={(pokemon) => room.actions.answer(pokemon.id)} />
          )}
        </section>
      );
    }

    if (state.status === "countdown") {
      return <p className="mono text-center text-6xl">Ça commence…</p>;
    }

    if (state.status !== "lobby") {
      // Une manche, une révélation ou une fin de partie est en cours côté serveur mais les
      // données précises (round/reveal/final) ne sont pas encore arrivées côté client — par
      // exemple juste après une reconnexion, avant que l'événement de phase associé ne soit
      // traité. Ne jamais retomber sur l'écran du lobby dans ce cas : il exposerait un
      // bouton "Démarrer" actionnable en pleine partie.
      return <p className="mono text-center text-6xl">Reconnexion…</p>;
    }

    // Ce que l'hôte voit : sa dernière intention si elle n'est pas encore confirmée,
    // sinon l'état du serveur. C'est aussi la base de composition du changement suivant.
    const shownSettings = pendingSettings ?? state.settings;
    const roomUrl = `${window.location.origin}/room/${state.code}`;

    const applySettings = (patch: Partial<GameSettings>): void => {
      const next = { ...shownSettings, ...patch };
      setPendingSettings(next);
      room.actions.setSettings(next, () => {
        // Ne retirer l'état optimiste que s'il correspond encore à ce qui a été envoyé :
        // un accusé tardif ne doit pas effacer un réglage cliqué entre-temps.
        setPendingSettings((current) => (current === next ? null : current));
      });
    };

    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold">Room</h1>
        <p
          className="mono tracking-[0.2em] sm:tracking-[0.3em]"
          style={{ fontSize: "clamp(2.5rem, 14vw, 3.75rem)" }}
        >
          {state.code}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => void navigator.clipboard.writeText(roomUrl)}
            className="flex-1"
          >
            Copier le lien
          </Button>
          <Button variant="ghost" onClick={() => setQrOpen((open) => !open)} className="flex-1">
            {qrOpen ? "Masquer le QR code" : "Afficher le QR code"}
          </Button>
        </div>
        {/* Replié par défaut : le lobby porte déjà beaucoup de commandes. Le QR sert
            surtout quand les joueurs sont ensemble dans la même pièce, un cas fréquent
            ici mais pas universel — un clic pour l'obtenir suffit. */}
        {qrOpen && (
          <div className="flex flex-col items-center gap-2">
            <QrCode value={roomUrl} />
            <p className="text-sm text-[var(--text-dim)]">À scanner pour rejoindre cette room.</p>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {state.players.map((player) => (
            <li key={player.id} className="flex items-center gap-2">
              <span style={{ opacity: player.connected ? 1 : 0.4 }}>{player.nickname}</span>
              {player.isHost && <span aria-label="hôte">👑</span>}
            </li>
          ))}
        </ul>
        {state.replayMode !== null && (
          <p className="text-sm text-[var(--text-dim)]">
            {state.replayMode === "same"
              ? "Prochaine partie : mêmes numéros que la précédente."
              : "Prochaine partie : nouvelle série de numéros."}
          </p>
        )}
        {isHost ? (
          <>
            <GameModePicker
              mode={state.gameMode}
              blitz={state.blitzSettings}
              onChange={(mode, blitz) => room.actions.setMode(mode, blitz)}
            />
            <GenerationPicker
              value={shownSettings.generations}
              onChange={(generations) => applySettings({ generations })}
            />
            {/* Réglages propres au mode classique : en blitz, la durée se règle dans le
                sélecteur de jeu et il n'y a pas de manches. Les laisser visibles donnait
                à l'hôte deux champs sans effet. */}
            {state.gameMode === "classic" && (
              <RoundTimingPicker
                durationMs={shownSettings.roundDurationMs}
                roundCount={shownSettings.roundCount}
                onDurationChange={(roundDurationMs) => applySettings({ roundDurationMs })}
                onCountChange={(roundCount) => applySettings({ roundCount })}
              />
            )}
          </>
        ) : (
          // Ce que l'invité doit savoir avant que ça démarre : à quel jeu il joue, sur
          // quelles générations, et pendant combien de temps. Afficher les réglages du
          // mode non choisi l'induirait en erreur — il lisait « 15 s · 10 manches » alors
          // que la room était en contre-la-montre.
          <p className="text-[var(--text-dim)]">
            {state.gameMode === "blitz" ? "Contre la montre" : "Trouver le numéro"} · Générations :{" "}
            {state.settings.generations.join(", ")} ·{" "}
            {state.gameMode === "blitz"
              ? formatBlitzDuration(state.blitzSettings.durationMs)
              : `${state.settings.roundDurationMs / 1000} s · ${state.settings.roundCount} manches`}
          </p>
        )}
        {/* Le Pokédex n'est proposé QUE dans le lobby : la liste associe chaque numéro à
            son nom, donc l'avoir sous la main pendant une manche reviendrait à afficher la
            réponse à côté de la question. Replié par défaut pour ne pas noyer le lobby, et
            rendu sur place plutôt que via un lien vers /pokedex, qui ferait quitter la room. */}
        <Button variant="ghost" onClick={() => setPokedexOpen((open) => !open)}>
          {pokedexOpen ? "Masquer le Pokédex" : "Consulter le Pokédex"}
        </Button>
        {pokedexOpen && <PokedexBrowser initialGenerations={shownSettings.generations} />}

        {isHost && (
          <>
            <Button
              disabled={state.players.filter((player) => player.connected).length < 2}
              onClick={room.actions.start}
            >
              Démarrer
            </Button>
            {state.players.filter((player) => player.connected).length < 2 && (
              <p className="text-sm text-[var(--text-dim)]">
                Il faut au moins 2 joueurs connectés.
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {room.reconnecting && (
        <p role="status" className="mono text-sm text-[var(--text-dim)]">
          Reconnexion…
        </p>
      )}
      {room.actionError && (
        <p
          role="alert"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--danger)] px-4 py-2"
          style={{ color: "var(--danger)" }}
        >
          <span>{room.actionError}</span>
          <Button variant="ghost" onClick={room.actions.dismissActionError}>
            Fermer
          </Button>
        </p>
      )}
      {renderBody()}
    </div>
  );
}
