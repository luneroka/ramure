/** The menu under a card's « + » handle: which relative to add. */

import { t } from '../../i18n';
import { useWorkspace } from '../session/Workspace';
import { useUi } from '../ui/UiContext';

export function AddRelativeMenu() {
  const { lang } = useUi();
  const w = useWorkspace();
  const menu = w.editor.addMenu;
  if (!menu || w.readOnly) return null;
  return (
    <>
      <div className="add-backdrop" onPointerDown={() => w.dispatch({ type: 'closeAddMenu' })} />
      <ul
        className="add-menu"
        role="menu"
        aria-label={t(lang, 'addRelative')}
        style={{ left: Math.min(menu.x + 8, window.innerWidth - 220), top: menu.y }}
      >
        {w.addOptions(menu.id).map((o) => (
          <li key={o.kind}>
            <button onClick={() => w.startDraft(o.kind, menu.id)}>{o.label}</button>
          </li>
        ))}
      </ul>
    </>
  );
}
