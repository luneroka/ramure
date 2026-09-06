/** Strings in French and English. French is the default for a French-speaking first user. */

export type Lang = 'fr' | 'en';

const strings = {
  appName: { fr: 'Ramure', en: 'Ramure' },
  tagline: { fr: 'Tout l’arbre, sur une seule toile.', en: 'The whole tree, on one canvas.' },
  openFile: { fr: 'Ouvrir un GEDCOM', en: 'Open a GEDCOM' },
  openShort: { fr: 'Ouvrir', en: 'Open' },
  loadSample: { fr: 'Arbre d’exemple', en: 'Sample tree' },
  export: { fr: 'Exporter', en: 'Export' },
  search: { fr: 'Rechercher une personne…', en: 'Find a person…' },
  fit: { fr: 'Tout voir', en: 'Fit' },
  recentre: { fr: 'Recentrer', en: 'Re-centre' },
  zoomIn: { fr: 'Zoom avant', en: 'Zoom in' },
  zoomOut: { fr: 'Zoom arrière', en: 'Zoom out' },
  people: { fr: 'personnes', en: 'people' },
  onCanvas: { fr: 'sur la toile', en: 'on canvas' },
  fullCards: { fr: 'fiches', en: 'cards' },
  namesOnly: { fr: 'noms', en: 'names' },
  dots: { fr: 'points', en: 'dots' },
  close: { fr: 'Fermer', en: 'Close' },
  focusOn: { fr: 'Centrer l’arbre ici', en: 'Centre the tree here' },
  parents: { fr: 'Parents', en: 'Parents' },
  partners: { fr: 'Unions', en: 'Partners' },
  children: { fr: 'Enfants', en: 'Children' },
  siblings: { fr: 'Frères et sœurs', en: 'Siblings' },
  events: { fr: 'Événements', en: 'Events' },
  notes: { fr: 'Notes', en: 'Notes' },
  sources: { fr: 'Sources', en: 'Sources' },
  living: { fr: 'Vivant·e', en: 'Living' },
  private: { fr: 'Privé', en: 'Private' },
  adopted: { fr: 'adopté·e', en: 'adopted' },
  unmarried: { fr: 'union libre', en: 'unmarried' },
  unknownPerson: { fr: 'Inconnu·e', en: 'Unknown' },
  importReport: { fr: 'Rapport d’import', en: 'Import report' },
  importedFrom: { fr: 'Importé depuis', en: 'Imported from' },
  noTree: { fr: 'Aucun arbre chargé.', en: 'No tree loaded.' },
  dropHint: { fr: 'Ouvrez un fichier GEDCOM exporté de Geneanet, Gramps, webtrees ou n’importe quel logiciel, ou glissez-le ici. Tout reste sur votre appareil.', en: 'Open a GEDCOM exported from Geneanet, Gramps, webtrees or any software, or drop it here. Everything stays on your device.' },
  hint: { fr: 'Glissez pour déplacer, pincez ou molette pour zoomer, touchez une personne pour recentrer.', en: 'Drag to pan, pinch or scroll to zoom, tap a person to re-centre.' },
  moreAbove: { fr: 'Des ancêtres au-delà de la limite ne sont pas affichés. Touchez un ancêtre pour continuer.', en: 'Ancestors beyond the limit are not shown. Tap an ancestor to continue.' },
  moreBelow: { fr: 'Des descendants au-delà de la limite ne sont pas affichés.', en: 'Descendants beyond the limit are not shown.' },
  born: { fr: 'né·e', en: 'b.' },
  died: { fr: 'décédé·e', en: 'd.' },
  language: { fr: 'Langue', en: 'Language' },
  theme: { fr: 'Thème', en: 'Theme' },
  themeAuto: { fr: 'Auto', en: 'Auto' },
  themeLight: { fr: 'Clair', en: 'Light' },
  themeDark: { fr: 'Sombre', en: 'Dark' },
  cause: { fr: 'Cause', en: 'Cause' },
  age: { fr: 'Âge', en: 'Age' },
  address: { fr: 'Adresse', en: 'Address' },
  event: {
    fr: { birth: 'Naissance', baptism: 'Baptême', death: 'Décès', burial: 'Inhumation', cremation: 'Crémation', adoption: 'Adoption', marriage: 'Mariage', divorce: 'Divorce', engagement: 'Fiançailles', 'marriage-banns': 'Bans', annulment: 'Annulation', separation: 'Séparation', occupation: 'Profession', residence: 'Résidence', census: 'Recensement', education: 'Études', religion: 'Religion', retirement: 'Retraite', emigration: 'Émigration', immigration: 'Immigration', naturalization: 'Naturalisation', probate: 'Succession', will: 'Testament', graduation: 'Diplôme', confirmation: 'Confirmation', 'first-communion': 'Première communion', title: 'Titre', description: 'Description', custom: 'Événement' },
    en: { birth: 'Birth', baptism: 'Baptism', death: 'Death', burial: 'Burial', cremation: 'Cremation', adoption: 'Adoption', marriage: 'Marriage', divorce: 'Divorce', engagement: 'Engagement', 'marriage-banns': 'Banns', annulment: 'Annulment', separation: 'Separation', occupation: 'Occupation', residence: 'Residence', census: 'Census', education: 'Education', religion: 'Religion', retirement: 'Retirement', emigration: 'Emigration', immigration: 'Immigration', naturalization: 'Naturalization', probate: 'Probate', will: 'Will', graduation: 'Graduation', confirmation: 'Confirmation', 'first-communion': 'First communion', title: 'Title', description: 'Description', custom: 'Event' },
  },
} as const;

type StringKey = Exclude<keyof typeof strings, 'event'>;

export function t(lang: Lang, key: StringKey): string {
  return strings[key][lang];
}

export function eventLabel(lang: Lang, type: string, customType?: string): string {
  if (type === 'custom' && customType) return customType;
  const table = strings.event[lang] as Record<string, string>;
  return table[type] ?? type;
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('ramure.lang');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function saveLang(lang: Lang): void {
  try { localStorage.setItem('ramure.lang', lang); } catch { /* ignore */ }
}

export type ThemeChoice = 'auto' | 'light' | 'dark';

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem('ramure.theme');
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'auto';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try { localStorage.setItem('ramure.theme', choice); } catch { /* ignore */ }
}
