import { expect, test } from "@playwright/test";

test("une partie solo de 10 manches se joue jusqu'au récapitulatif", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Sacha").fill("Mathéo");
  await page.getByRole("button", { name: "Jouer en solo" }).click();
  await page.getByRole("button", { name: "Lancer" }).click();

  for (let round = 1; round <= 10; round++) {
    await expect(page.getByText(`Manche ${round} / 10`)).toBeVisible();
    await page.getByRole("combobox").fill("pikachu");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.getByText(/Votre réponse|temps écoulé/).click();
  }

  await expect(page.getByRole("heading", { name: "Partie terminée" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(11); // en-tête + 10 manches
});

test("le défi du jour affiche son résultat au second passage", async ({ page }) => {
  await page.goto("/daily");
  for (let round = 1; round <= 10; round++) {
    await page.getByRole("combobox").fill("pikachu");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.getByText(/Votre réponse|temps écoulé/).click();
  }
  await expect(page.getByRole("button", { name: /Partager/ })).toBeVisible();

  // Ce test prouve la persistance au rechargement, pas l'expiration par date : ce dernier
  // cas (une entrée mémorisée datée d'hier relance une partie) est couvert par le test
  // unitaire Daily.test.tsx:62-66.
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Partager/ })).toBeVisible();
});
