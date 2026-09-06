import { Route, Routes } from "react-router-dom";
import { Daily } from "./pages/Daily.js";
import { Home } from "./pages/Home.js";
import { JoinRoom } from "./pages/JoinRoom.js";
import { Pokedex } from "./pages/Pokedex.js";
import { Room } from "./pages/Room.js";
import { SoloGame } from "./pages/SoloGame.js";
import { SoloSetup } from "./pages/SoloSetup.js";

export function App() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-8">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/solo/play" element={<SoloGame />} />
        <Route path="/daily" element={<Daily />} />
        <Route path="/pokedex" element={<Pokedex />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </main>
  );
}
