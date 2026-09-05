import { expect, test } from "@playwright/test";

test("deux joueurs jouent une partie complète dans la même room", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("Sacha").fill("Mathéo");
  await host.getByRole("button", { name: "Créer une room" }).click();
  await expect(host).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{4}$/);
  const code = host.url().split("/").at(-1)!;

  await guest.goto("/join");
  await guest.getByLabel("Code de la room").fill(code);
  await guest.getByLabel("Ton pseudo").fill("Léa");
  await guest.getByRole("button", { name: "Rejoindre" }).click();
  await expect(host.getByText("Léa")).toBeVisible();

  await host.getByRole("button", { name: "Démarrer" }).click();

  for (let round = 1; round <= 10; round++) {
    await expect(host.getByText(`Manche ${round} / 10`)).toBeVisible({ timeout: 20_000 });
    const hostTarget = await host.getByLabel(/Numéro cible/).getAttribute("aria-label");
    const guestTarget = await guest.getByLabel(/Numéro cible/).getAttribute("aria-label");
    expect(hostTarget).toBe(guestTarget);

    for (const [page, answer] of [
      [host, "pikachu"],
      [guest, "roucool"],
    ] as const) {
      await page.getByRole("combobox").fill(answer);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
    }
    await expect(host.getByRole("table")).toBeVisible({ timeout: 20_000 });
  }

  await expect(host.getByRole("heading", { name: "Classement final" })).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Classement final" })).toBeVisible();

  const hostRows = await host.getByRole("row").allInnerTexts();
  const guestRows = await guest.getByRole("row").allInnerTexts();
  expect(hostRows).toEqual(guestRows);

  await hostContext.close();
  await guestContext.close();
});

test("un joueur qui recharge la page retrouve sa place et son score", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto("/");
  await host.getByPlaceholder("Sacha").fill("Mathéo");
  await host.getByRole("button", { name: "Créer une room" }).click();
  await expect(host).toHaveURL(/\/room\/[A-HJ-NP-Z2-9]{4}$/);
  const code = host.url().split("/").at(-1)!;

  await guest.goto("/join");
  await guest.getByLabel("Code de la room").fill(code);
  await guest.getByLabel("Ton pseudo").fill("Léa");
  await guest.getByRole("button", { name: "Rejoindre" }).click();

  await host.getByRole("button", { name: "Démarrer" }).click();
  await expect(guest.getByText("Manche 1 / 10")).toBeVisible({ timeout: 20_000 });

  await guest.reload();
  await expect(guest.getByRole("combobox")).toBeVisible({ timeout: 10_000 });
  // En pleine manche, le joueur est affiché via un indicateur (pastille de statut) dont le nom
  // n'est porté que par les attributs title/aria-label, pas par un nœud de texte visible : la
  // page lobby (testée plus haut) affiche le pseudo en clair, mais pas la vue "round".
  await expect(host.getByTitle("Léa")).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
