import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: ReactNode;
  /**
   * Identité de la page courante — App lui passe `location.pathname`. Une exception de
   * rendu remplace `children` par `fallback` (voir `render` ci-dessous) et RIEN ne le
   * réaffiche jamais tout seul : un ErrorBoundary React ne se réinitialise pas de
   * lui-même. Sans ce mécanisme, un lien "Retour à l'accueil" dans `fallback` changerait
   * bien l'URL, mais l'app resterait figée sur le message d'erreur pour le reste de la
   * session — `componentDidUpdate` compare cette valeur pour sortir de `hasError` dès que
   * le joueur navigue ailleurs, qu'il soit resté sur `fallback` ou pas.
   *
   * Alternative envisagée et écartée : remonter une instance fraîche via
   * `key={location.pathname}` côté App, au lieu de comparer une prop ici. Plus simple en
   * apparence, mais ça forcerait aussi `<Routes>` (l'enfant de cette classe) à démonter et
   * remonter à CHAQUE changement de route — pas seulement après une erreur — ce qui casserait
   * des pages qui comptent explicitement sur leur continuité au sein d'une même route
   * paramétrée : `Room`, par exemple, reste monté quand son `onCreated` corrige l'URL de
   * `/room/new` vers `/room/ABCD` (même `<Route path="/room/:code">`, juste un pathname
   * différent) précisément pour ne pas relancer une deuxième connexion socket par-dessus la
   * première. `componentDidUpdate` ne remonte que CE composant, jamais ses enfants.
   */
  resetKey: string;
};

type State = {
  hasError: boolean;
};

/**
 * Filet de rendu (voir issue #8) : `pokemonById` (paquet `@pkfind/shared`) lève un
 * `RangeError` sur un identifiant hors dataset, et RoundResult/GameOver l'appellent
 * directement pendant leur rendu avec des identifiants qui, en solo, sortent d'un
 * `localStorage` éditable. Sans filet, React démonte tout l'arbre de l'app — page blanche,
 * aucun moyen de repartir sans recharger à la main. `fallback` (fourni par App, voir sa
 * propre justification pour le choix d'un seul filet global plutôt qu'un par route) prend
 * la place de l'arbre cassé.
 *
 * Volontairement minimale par ailleurs : ni `componentDidCatch` ni aucun journal de l'erreur
 * — le projet n'a aucune infrastructure de télémétrie côté client (vérifié : aucune trace de
 * Sentry ou équivalent), et la consigne interdit `console.log`/`console.error` dans ce filet.
 * Le seul rôle de cette classe est de garder l'app utilisable, pas de diagnostiquer.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: Readonly<Props>): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
