/**
 * What every screen needs and nobody should have to thread through props:
 * the language, the theme, a toast, and the modal question. The provider
 * also renders the toast and the modal so they exist behind the sign-in
 * gate as well as in the app.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, detectLang, loadTheme, saveLang, type Lang, type ThemeChoice } from '../../i18n';
import { Modal, type AskSpec, type Pending } from '../Modal';

export interface Ui {
  lang: Lang;
  setLang(lang: Lang): void;
  theme: ThemeChoice;
  setTheme(theme: ThemeChoice): void;
  /** What is on screen once « Auto » is resolved against the system. */
  effectiveTheme: 'light' | 'dark';
  /** The bar button flips between light and dark from what is displayed; « Auto » lives in Paramètres. */
  cycleTheme(): void;
  toast(message: string): void;
  /** Ask through the modal. Resolves with the text (or 'ok'), null when cancelled. */
  ask(spec: AskSpec): Promise<string | null>;
}

const UiCtx = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const effectiveTheme: 'light' | 'dark' = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

  const [notice, setNotice] = useState<string | null>(null);
  const toast = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3200);
  }, []);

  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback(
    (spec: AskSpec) =>
      new Promise<string | null>((resolve) =>
        setPending({
          spec,
          resolve: (v) => {
            setPending(null);
            resolve(v);
          },
        }),
      ),
    [],
  );

  const value = useMemo<Ui>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        saveLang(l);
      },
      theme,
      setTheme,
      effectiveTheme,
      cycleTheme: () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark'),
      toast,
      ask,
    }),
    [lang, theme, effectiveTheme, toast, ask],
  );

  return (
    <UiCtx.Provider value={value}>
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <Modal pending={pending} lang={lang} />
    </UiCtx.Provider>
  );
}

export function useUi(): Ui {
  const ui = useContext(UiCtx);
  if (!ui) throw new Error('useUi outside UiProvider');
  return ui;
}
