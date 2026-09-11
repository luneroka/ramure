// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrintPage } from './PrintPage';
import { parseGedcom } from '@/gedcom/parse';
import { displayName, type Tree } from '@/gedcom/model';
import { DEFAULT_LAYOUT } from '@/tree/layout';
import { initialEditor } from '@/app/state/editorState';
import { WorkspaceProvider, type Workspace } from '@/app/state/Workspace';
import { UiProvider } from '@/app/ui/UiContext';

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

function renderPage(selectedId = léa.id) {
  return render(
    <UiProvider>
      <WorkspaceProvider value={workspace(tree, selectedId)}>
        <PrintPage navigate={noop} />
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
});
