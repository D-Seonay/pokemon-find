import { useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Daily } from "./pages/Daily.js";
import { Home } from "./pages/Home.js";
import { JoinRoom } from "./pages/JoinRoom.js";
import { Pokedex } from "./pages/Pokedex.js";
import { Stats } from "./pages/Stats.js";
import { Room } from "./pages/Room.js";
import { SoloGame } from "./pages/SoloGame.js";
import { SoloSetup } from "./pages/SoloSetup.js";

export function App() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Référence sur la valeur du pathname au moment du tout premier rendu, jamais réinitialisée
  // ensuite. Comparer des VALEURS plutôt qu'un drapeau "déjà monté" rend ce garde-fou
  // insensible au nombre de fois où l'effet ci-dessous est invoqué au montage (React rejoue
  // les effets une fois en développement sous StrictMode) : tant que le pathname n'a pas
  // réellement changé par rapport à ce premier rendu, on ne fait rien. C'est exactement le
  // comportement voulu par l'issue #9 : ne jamais voler le focus au chargement initial, où le
  // comportement natif du navigateur est déjà correct.
  const initialPathname = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === initialPathname.current) return;

    // Ne prend le relais QUE si rien n'a déjà réclamé le focus pendant ce montage. Certaines
    // pages gèrent délibérément leur propre focus à l'arrivée directe sur une manche en cours
    // (PokemonCombobox se focalise lui-même sur son champ de réponse dès qu'il apparaît — voir
    // /solo/play et /daily, tous deux chronométrés). Ces effets, plus profonds dans l'arbre,
    // s'exécutent AVANT celui-ci au sein du même commit (React exécute les effets enfants
    // avant ceux de leurs ancêtres) : si l'un d'eux a déjà déplacé le focus, activeElement ne
    // vaut plus <body>, et on laisse ce choix plus spécifique l'emporter plutôt que de le lui
    // voler en pleine manche chronométrée pour le porter sur un <h1> — mesuré empiriquement :
    // sans cette garde, App gagnait systématiquement cette course (étant l'ancêtre, son effet
    // s'exécute en dernier) et volait le focus du champ de réponse à chaque entrée directe sur
    // ces deux routes.
    if (document.activeElement !== document.body) return;

    // Même technique que RoundResult/MultiReveal (voir leurs commentaires) : un <h1> n'est
    // pas focalisable nativement, tabIndex=-1 le rend atteignable par ce focus()
    // programmatique sans l'ajouter à l'ordre de tabulation. Recherché dans le DOM plutôt que
    // via une ref par page : App ne connaît pas les composants que chaque route monte.
    //
    // Se déclenche une seule fois par changement de pathname, à l'instant du commit de la
    // nouvelle route — pas de nouvelle tentative sur les rendus suivants. Certaines pages
    // (SoloGame en cours de manche, Room avant que l'état du serveur n'arrive) n'ont
    // synchrone­ment aucun <h1> à cet instant ; on ne force rien dans ce cas plutôt que de
    // retenter indéfiniment, ce qui risquerait de voler le focus bien plus tard, en pleine
    // interaction, dès qu'un <h1> finirait par apparaître (ex. le classement final d'une
    // partie rejointe en cours de route, après de nombreux rendus).
    const heading = mainRef.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus();
  }, [location.pathname]);

  return (
    <main ref={mainRef} className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-8">
      <ErrorBoundary resetKey={location.pathname} fallback={<ErrorFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/solo" element={<SoloSetup />} />
          <Route path="/solo/play" element={<SoloGame />} />
          <Route path="/daily" element={<Daily />} />
          <Route path="/pokedex" element={<Pokedex />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/join" element={<JoinRoom />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </ErrorBoundary>
    </main>
  );
}

function ErrorFallback() {
  return (
    <section role="alert" className="flex flex-col gap-4 text-center">
      <h1 className="text-3xl font-extrabold">Un problème est survenu</h1>
      <p className="text-[var(--text-dim)]">
        Cette page n'a pas pu s'afficher correctement. Vous pouvez repartir de l'accueil.
      </p>
      <Link to="/" className="underline">
        Retour à l'accueil
      </Link>
    </section>
  );
}
