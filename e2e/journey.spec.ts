import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

  // The edit survives a reload — and the reload never flashes the sign-in card while the
  // session is being checked. Holding /me open is what makes that observable rather than a race.
  await page.route('**/api/auth/me', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByText('Chargement de la session…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toHaveCount(0);
  // Let the held request finish before letting go: unrouting under it makes its own `continue()` throw
  // « Route is already handled », which ends the test as soon as anything runs past the delay.
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('.topbar')).toContainText('34 personnes', { timeout: 20_000 });
  await page.getByPlaceholder('Rechercher une personne…').fill('testine');
  await expect(page.getByRole('button', { name: /Testine/ })).toBeVisible();

  // A source written in her Documents tab: a text and a long link, shown short, saved and synced.
  await page.getByRole('button', { name: /Testine/ }).click();
  await page.getByRole('tab', { name: /Documents/ }).click();
  await page.getByRole('button', { name: '+ Ajouter une source' }).click();
  await page.getByLabel('Source', { exact: true }).fill('Acte de naissance');
  await page.getByLabel('Lien (facultatif)').fill('https://archives.example.org/ark:/12345/a1b2c3d4e5f6a7b8c9d0/daogrp/0/3E210_12');
  await page.getByRole('button', { name: 'Ajouter une source' }).click();
  await expect(page.locator('.source').filter({ hasText: 'Acte de naissance' })).toContainText('archives.example.org/…/3E210_12');
  await expect(page.locator('.sync-pill').first()).toHaveAttribute('title', 'À jour', { timeout: 15_000 });

  // The panel's « Imprimer » opens the print page on that person's sheet, which downloads as a PDF file
  // made in the browser: no print dialog, and one page of PDF per page on screen.
  await page.locator('.panel-actions').getByRole('button', { name: 'Imprimer' }).click();
  await expect(page.getByRole('radio', { name: 'Fiche individuelle' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.person-page').first()).toContainText('Testine');
  await expect(page.locator('.person-page').first()).toContainText('Marguerite');
  await expect(page.locator('.person-page').first()).toContainText('Acte de naissance');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('Testine-AUBRY-fiche.pdf');
  const pdf = readFileSync((await download.path())!, 'latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(await page.locator('.person-page').count());
  // The PDF is drawn from a copy of the pages laid out outside this screen, so no style of the screen's
  // may reach the sheet: a copy made the same way must compute, element by element, as the page on screen.
  const leaks = await page.evaluate(() => {
    const props = [
      'font-size',
      'font-family',
      'font-weight',
      'font-style',
      'letter-spacing',
      'line-height',
      'color',
      'margin-top',
      'padding-top',
    ];
    const found: string[] = [];
    for (const shown of document.querySelectorAll<HTMLElement>('.person-page')) {
      const holder = document.createElement('div');
      holder.className = 'ps-export';
      holder.style.width = `${shown.getBoundingClientRect().width}px`;
      const copy = shown.cloneNode(true) as HTMLElement;
      holder.append(copy);
      document.body.append(holder);
      const copied = [copy, ...copy.querySelectorAll('*')];
      [shown, ...shown.querySelectorAll('*')].forEach((el, i) => {
        const a = getComputedStyle(el);
        const b = getComputedStyle(copied[i]!);
        for (const p of props) if (a.getPropertyValue(p) !== b.getPropertyValue(p)) found.push(`${el.className}: ${p}`);
      });
      holder.remove();
    }
    return [...new Set(found)];
  });
  expect(leaks).toEqual([]);
  await page.getByRole('button', { name: /← Arbre/ }).click();
  await expect(page.locator('canvas.tree-canvas')).toBeVisible();

  // Complete the tree from a file researched elsewhere: the same family plus one child. The file
  // knows nothing of Testine, who must stay; only Jules is new, and the addition undoes like any edit.
  await page.keyboard.press('Escape');
  const researched = readFileSync(path.join(process.cwd(), 'fixtures/geneanet/input-fixture.ged'), 'utf8').replace(
    /0 TRLR\s*$/,
    '0 @I99@ INDI\n1 NAME Jules /FERRAND/\n1 SEX M\n1 BIRT\n2 DATE 2008\n1 FAMC @F11@\n0 TRLR\n',
  );
  await page.locator('.tree-name-btn').click();
  const [graftChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Compléter depuis un GEDCOM…' }).click(),
  ]);
  await graftChooser.setFiles({ name: 'recherches.ged', mimeType: 'text/plain', buffer: Buffer.from(researched) });
  const preview = page.getByRole('dialog', { name: 'Compléter l’arbre' });
  await expect(preview).toContainText('33 personnes du fichier reconnues dans l’arbre.');
  await expect(preview).toContainText('1 nouvelle personne');
  await expect(preview).toContainText('Jules FERRAND');
  // The canvas tools float above everything, so they step aside while a dialog is open.
  await expect(page.locator('.canvas-tools')).toBeHidden();
  await preview.getByRole('button', { name: 'Ajouter à l’arbre' }).click();
  await expect(page.locator('.topbar')).toContainText('35 personnes');
  await expect(page.locator('.sync-pill').first()).toHaveAttribute('title', 'À jour', { timeout: 15_000 });
  await page.locator('canvas.tree-canvas').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator('.topbar')).toContainText('34 personnes');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(page.locator('.topbar')).toContainText('35 personnes');
  await expect(page.locator('.sync-pill').first()).toHaveAttribute('title', 'À jour', { timeout: 15_000 });

  // On a phone: nothing scrolls sideways, the search is reachable from its button and its results can
  // be tapped, and undo is on screen. All three were broken — the app was 423 px wide on a 390 px
  // screen, the search field opened below the canvas with its results off the bottom of the page, and
  // undo, redo and the theme button were hidden outright.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const fits = async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(await fits()).toBe(true);
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await page.locator('.search-toggle').click();
  await page.getByPlaceholder('Rechercher une personne…').fill('marguerite');
  await page.locator('.search-results button').first().click();
  await expect(page.locator('.panel-name')).toContainText('Marguerite');
  expect(await fits()).toBe(true);
});
