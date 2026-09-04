import { Route, Routes } from "react-router-dom";

export function App() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] px-4 py-8">
      <Routes>
        <Route path="*" element={<p>Pokémon Find</p>} />
      </Routes>
    </main>
  );
}
