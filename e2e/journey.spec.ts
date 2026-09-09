import { expect, test } from '@playwright/test';
import path from 'node:path';

const EMAIL = process.env.E2E_EMAIL ?? 'e2e@example.org';

test('sign in with the code, import a tree, add a child, undo and redo, reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByLabel('Adresse courriel').fill(EMAIL);
  await page.getByRole('button', { name: /Recevoir un lien|Renvoyer un courriel/ }).click();
  // Development: the code is echoed on the page instead of mailed.
  const echoed = await page
    .locator('.login-card')
    .getByText(/code \d{6}/)
    .textContent();
  const code = echoed!.match(/code (\d{6})/)![1]!;
  await page.getByLabel('Code à six chiffres reçu par courriel').fill(code);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // First sign-in: a family account is created.
  const create = page.getByRole('button', { name: 'Créer le compte' });
  if (
    await create
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await page.locator('form input').first().fill('Famille E2E');
    await create.click();
  }
  await expect(page.getByRole('button', { name: 'Importer un GEDCOM' })).toBeVisible();

  // Import the fixture.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importer un GEDCOM' }).click()]);
  await chooser.setFiles(path.join(process.cwd(), 'fixtures/geneanet/input-fixture.ged'));
  await expect(page.locator('canvas.tree-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.topbar')).toContainText('33 personnes');

  // Find Marguerite and add a child from her panel.
  await page.getByPlaceholder('Rechercher une personne…').fill('marguerite lenoir');
  await page.getByRole('button', { name: 'Marguerite LENOIR' }).first().click();
  await expect(page.locator('.panel-name')).toContainText('Marguerite LENOIR');
  // The tree recentres on the person picked (the canvas reports its focus).
  await expect(page.locator('canvas.tree-canvas')).toHaveAttribute('data-focus', 'I1');
  await page.getByRole('tab', { name: /Famille/ }).click();
  await page.getByRole('button', { name: '+ Enfant' }).first().click();
  await page.getByLabel('Prénom(s)').fill('Testine');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.topbar')).toContainText('34 personnes');
  await expect(page.locator('.sync-pill').first()).toHaveAttribute('title', 'À jour', { timeout: 15_000 });

  // Undo removes her, redo brings her back; both sync like any edit.
  await page.keyboard.press('Escape');
  await page.locator('canvas.tree-canvas').click({ position: { x: 20, y: 20 } });
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator('.topbar')).toContainText('33 personnes');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(page.locator('.topbar')).toContainText('34 personnes');
  await expect(page.locator('.sync-pill').first()).toHaveAttribute('title', 'À jour', { timeout: 15_000 });

  // The edit survives a reload.
  await page.reload();
  await expect(page.locator('.topbar')).toContainText('34 personnes', { timeout: 20_000 });
  await page.getByPlaceholder('Rechercher une personne…').fill('testine');
  await expect(page.getByRole('button', { name: /Testine/ })).toBeVisible();
});
