// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintPage } from './PrintPage';
import { sheetPdf } from '@/app/screens/sheetPdf';
import { mediaStore } from '@/store';
import { parseGedcom } from '@/gedcom/parse';
import { displayName, writtenSource, type Tree } from '@/gedcom/model';
import { DEFAULT_LAYOUT } from '@/tree/layout';
import { initialEditor } from '@/app/state/editorState';
import { WorkspaceProvider, type Workspace } from '@/app/state/Workspace';
import { UiProvider } from '@/app/ui/UiContext';

// The PDF itself is painted from real layout, which happy-dom has none of: here it only has to be asked for.
vi.mock('@/app/screens/sheetPdf', () => ({ sheetPdf: vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' })) }));
// Portraits are read from the device's media store, which holds only what a test puts in it.
const stored = vi.hoisted(() => new Map<string, Blob>());
vi.mock('@/store', () => ({ mediaStore: { get: vi.fn(async (id: string) => stored.get(id)) } }));

/**
 * The print screen's wiring: that the options reach the drawing and that the
 * line under them tells the truth about what the sheet holds. The geometry
 * itself is tested in src/print; what can only break here is a control that
 * changes nothing, or a count that contradicts the chart beside it.
 */

// A path from the project root: under happy-dom `import.meta.url` is not a file URL.
const tree = parseGedcom(readFileSync('fixtures/geneanet/input-fixture.ged', 'utf8'));
const léa = Object.values(tree.individuals).find((i) => displayName(i) === 'Léa FERRAND')!;
const noop = () => undefined;

function workspace(t: Tree, selectedId: string): Workspace {
  return {
    tree: t,
    displayTree: t,
    source: { id: 'T1', name: 'Famille', role: 'owner' },
    readOnly: false,
    sync: { status: 'synced', pending: 0 },
    engineRef: createRef(),
    canvasRef: createRef(),
    setCanvas: noop,
    editor: { ...initialEditor, selectedId },
    dispatch: noop,
    layout: null,
    layoutOpts: DEFAULT_LAYOUT,
    effectiveFocus: selectedId,
    count: Object.keys(t.individuals).length,
    hiddenCount: 0,
    kinship: null,
    lit: undefined,
    startKinship: noop,
    reportNotes: [],
    dismissNote: noop,
    commit: () => true,
    undo: noop,
    redo: noop,
    canUndo: false,
    canRedo: false,
    focusOn: noop,
    select: noop,
    startDraft: noop,
    cancelDraft: noop,
    saveDraft: noop,
    addOptions: () => [],
    confirmDeleteDocument: async () => true,
  };
}

function renderPage(selectedId = léa.id, route?: Parameters<typeof PrintPage>[0]['route'], t: Tree = tree) {
  return render(
    <UiProvider>
      <WorkspaceProvider value={workspace(t, selectedId)}>
        <PrintPage navigate={noop} route={route} />
      </WorkspaceProvider>
    </UiProvider>,
  );
}

const sheet = () => document.querySelector('.print-sheet')!.innerHTML;

afterEach(cleanup);

describe('the printable charts screen', () => {
  it('draws the person selected on the canvas, and says what the sheet holds', () => {
    renderPage();
    expect(sheet()).toContain('FERRAND');
    // Five generations of Léa's ancestry are drawn, and the line owns up to the two it leaves out.
    expect(screen.getByText(/11 personnes sur 33/)).toBeTruthy();
    expect(screen.getByText(/7 générations connues/)).toBeTruthy();
  });

  it('follows the subject picked here rather than the one on the canvas', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Rechercher une personne…'), { target: { value: 'jeanne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jeanne MARCHAL' }));
    expect(screen.getByText('Jeanne MARCHAL')).toBeTruthy();
    expect(screen.getByText(/3 générations connues/)).toBeTruthy();
  });

  it('redraws when the shape changes, and turns the sheet with it', () => {
    renderPage();
    const half = sheet();
    expect(half).not.toContain('<circle');
    fireEvent.change(screen.getByLabelText('Forme'), { target: { value: '360' } });
    expect(sheet()).toContain('<circle');
    // A half fan lies across the page; anything rounder stands up it.
    expect((screen.getByLabelText('Orientation') as HTMLSelectElement).value).toBe('portrait');
  });

  it('says so when the paper takes fewer generations than were asked for', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Générations'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Tableau d’ascendance' }));
    expect(screen.getByText(/Cette feuille en tient/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'a3' } });
    expect(screen.queryByText(/Cette feuille en tient/)).toBeNull();
  });

  it('drops the dashed placeholders when the missing ancestors are turned off', () => {
    renderPage();
    expect(sheet()).toContain('stroke-dasharray');
    fireEvent.click(screen.getByLabelText('Montrer les ancêtres manquants'));
    expect(sheet()).not.toContain('stroke-dasharray');
  });

  it('draws the whole tree on several sheets, and stops asking who is at the centre', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Arbre entier' }));
    // Everybody, not one line of ancestors — and the sheets are numbered so they can be laid out.
    expect(screen.getByText(/33 personnes sur 33/)).toBeTruthy();
    expect(screen.getByText(/2 feuilles/)).toBeTruthy();
    expect(document.querySelectorAll('.print-sheet')).toHaveLength(2);
    expect(screen.queryByText(/Personne au centre/)).toBeNull();
    // On one sheet instead: still everybody, on a single page.
    fireEvent.change(screen.getByLabelText('Taille'), { target: { value: 'one' } });
    expect(document.querySelectorAll('.print-sheet')).toHaveLength(1);
    expect(screen.getByText(/33 personnes sur 33/)).toBeTruthy();
  });

  it('opens on a person’s sheet when it is reached from their panel', () => {
    const marguerite = Object.values(tree.individuals).find((i) => i.names[0]?.given === 'Marguerite')!;
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: marguerite.id });
    expect(screen.getByRole('radio', { name: 'Fiche individuelle' }).getAttribute('aria-checked')).toBe('true');
    const page = document.querySelector('.person-page')!;
    expect(page.textContent).toContain('Marguerite');
    expect(page.textContent).toContain('Frères et sœurs');
    expect(page.textContent).toContain('demi-frère par le père');
    // A sheet of text is upright and sent as a PDF: no orientation to choose and no PNG.
    expect(screen.queryByLabelText('Orientation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer en PNG' })).toBeNull();
    expect(screen.getByText(/16 personnes · 6 événements/)).toBeTruthy();
  });

  it('downloads the sheet as a PDF instead of opening the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => 'blob:sheet');
    URL.revokeObjectURL = vi.fn();
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: 'I1' });
    expect(screen.queryByRole('button', { name: 'Imprimer ou enregistrer en PDF' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    // The pages on screen are what the PDF is made from, on the paper chosen.
    const [pages, paper, meta] = vi.mocked(sheetPdf).mock.calls[0]!;
    expect(pages.map((p) => p.className)).toEqual(['print-sheet portrait person-page']);
    expect(paper).toEqual({ w: 210, h: 297 });
    expect(meta).toEqual({ title: 'Fiche individuelle · Marguerite LENOIR', lang: 'fr' });
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('Marguerite-LENOIR-fiche.pdf');
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
    click.mockRestore();
  });

  it('offers the photo only when there is one to show, and leaves it off the sheet when unticked', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:portrait');
    URL.revokeObjectURL = vi.fn();
    // Henri's file names a picture this device does not hold: there is nothing to offer.
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: 'I2' });
    await waitFor(() => expect(vi.mocked(mediaStore.get)).toHaveBeenCalledWith('O1'));
    expect(screen.queryByLabelText('Photo')).toBeNull();
    expect(document.querySelector('.person-page img')).toBeNull();
    cleanup();

    stored.set('O1', new Blob(['jpeg'], { type: 'image/jpeg' }));
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: 'I2' });
    const photo = (await screen.findByLabelText('Photo')) as HTMLInputElement;
    expect(photo.checked).toBe(true);
    expect(document.querySelector('.person-page .ps-portrait img')!.getAttribute('src')).toBe('blob:portrait');
    // Unticked, the pages the PDF is made from are laid out as if there were no portrait.
    fireEvent.click(photo);
    expect(document.querySelector('.person-page img')).toBeNull();
    expect(document.querySelector('.person-page .ps-id')!.className).toBe('ps-id');
    fireEvent.click(photo);
    expect(document.querySelector('.person-page .ps-portrait img')).not.toBeNull();
    stored.clear();
  });

  it('holds the living back only when discretion is ticked', () => {
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: 'I1' });
    const page = () => document.querySelector('.person-page')!.textContent!;
    expect(page()).toContain('Né le 30 mai 1944');
    expect(screen.getByText(/proches vivants/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Discrétion pour les vivants'));
    expect(page()).not.toContain('Né le 30 mai 1944');
    expect(page()).toContain('Né en 1944');
    expect(screen.getByText(/proches vivants, année de naissance seule/)).toBeTruthy();
  });

  it('prints a written source among the sources, and drops the sources when not asked for', () => {
    const t = parseGedcom(readFileSync('fixtures/geneanet/input-fixture.ged', 'utf8'));
    t.individuals.I1!.citations.push(writtenSource('Acte de mariage 1974', 'https://example.org/acte'));
    renderPage(léa.id, { name: 'print', id: 'T1', sheet: true, person: 'I1' }, t);
    const page = () => document.querySelector('.person-page')!.textContent!;
    expect(screen.queryByLabelText('Pistes de recherche')).toBeNull();
    expect(page()).toContain('Acte de mariage 1974 — https://example.org/acte');
    expect(page()).toContain('Livret de famille');
    fireEvent.click(screen.getByLabelText('Sources'));
    expect(page()).not.toContain('Livret de famille');
    expect(page()).not.toContain('Acte de mariage 1974');
  });
});
