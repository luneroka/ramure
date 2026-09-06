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
  edit: { fr: 'Modifier', en: 'Edit' },
  save: { fr: 'Enregistrer', en: 'Save' },
  cancel: { fr: 'Annuler', en: 'Cancel' },
  delete: { fr: 'Supprimer', en: 'Delete' },
  deletePerson: { fr: 'Supprimer cette personne', en: 'Delete this person' },
  confirmDelete: { fr: 'Supprimer définitivement cette personne de l’arbre ? Ses liens familiaux seront retirés. Annulable avec ↶.', en: 'Remove this person from the tree? Their family links are removed. Undo with ↶.' },
  addFather: { fr: '+ Père', en: '+ Father' },
  addMother: { fr: '+ Mère', en: '+ Mother' },
  addPartner: { fr: '+ Conjoint·e', en: '+ Partner' },
  addChild: { fr: '+ Enfant', en: '+ Child' },
  addSibling: { fr: '+ Frère / sœur', en: '+ Sibling' },
  linkPartner: { fr: 'Lier un·e conjoint·e existant·e', en: 'Link an existing partner' },
  linkChild: { fr: 'Lier un enfant existant', en: 'Link an existing child' },
  unlink: { fr: 'Retirer de la famille', en: 'Remove from family' },
  merge: { fr: 'Fusionner avec un doublon…', en: 'Merge with a duplicate…' },
  mergeHint: { fr: 'La personne choisie sera fusionnée dans celle-ci, puis supprimée.', en: 'The chosen person is merged into this one, then removed.' },
  undo: { fr: 'Annuler', en: 'Undo' },
  redo: { fr: 'Rétablir', en: 'Redo' },
  newTree: { fr: 'Nouvel arbre', en: 'New tree' },
  newTreeConfirm: { fr: 'Commencer un nouvel arbre ? L’arbre actuel reste dans les sauvegardes.', en: 'Start a new tree? The current one stays in the snapshots.' },
  snapshots: { fr: 'Sauvegardes', en: 'Snapshots' },
  snapshotsHint: { fr: 'Copies automatiques conservées sur cet appareil. Restaurer remplace l’arbre affiché (annulable).', en: 'Automatic copies kept on this device. Restoring replaces the shown tree (undoable).' },
  noSnapshots: { fr: 'Aucune sauvegarde pour l’instant.', en: 'No snapshots yet.' },
  restore: { fr: 'Restaurer', en: 'Restore' },
  menu: { fr: 'Menu', en: 'Menu' },
  view: { fr: 'Vue', en: 'View' },
  viewHourglass: { fr: 'Sablier', en: 'Hourglass' },
  viewAncestors: { fr: 'Ancêtres', en: 'Ancestors' },
  viewDescendants: { fr: 'Descendants', en: 'Descendants' },
  givenName: { fr: 'Prénom(s)', en: 'Given name(s)' },
  surname: { fr: 'Nom', en: 'Surname' },
  sex: { fr: 'Sexe', en: 'Sex' },
  male: { fr: 'Homme', en: 'Male' },
  female: { fr: 'Femme', en: 'Female' },
  unknownSex: { fr: 'Inconnu', en: 'Unknown' },
  nickname: { fr: 'Surnom', en: 'Nickname' },
  eventType: { fr: 'Type', en: 'Type' },
  date: { fr: 'Date', en: 'Date' },
  place: { fr: 'Lieu', en: 'Place' },
  description: { fr: 'Description', en: 'Description' },
  dateHint: { fr: 'ex. 12/03/1952, mars 1952, vers 1860, entre 1880 et 1885', en: 'e.g. 12/03/1952, March 1952, about 1860, between 1880 and 1885' },
  dateUnreadable: { fr: 'Date non comprise, conservée telle quelle', en: 'Date not understood, kept as typed' },
  addEvent: { fr: '+ Événement', en: '+ Event' },
  privatePerson: { fr: 'Personne privée (masquée dans les partages)', en: 'Private person (hidden when shared)' },
  editUnion: { fr: 'Modifier l’union', en: 'Edit union' },
  unionType: { fr: 'Type d’union', en: 'Union type' },
  married: { fr: 'Mariage', en: 'Marriage' },
  civil: { fr: 'PACS / union civile', en: 'Civil union' },
  unknownUnion: { fr: 'Non précisé', en: 'Unspecified' },
  chooseFamily: { fr: 'Cette personne a plusieurs unions : ajoutez l’enfant depuis l’union voulue dans le panneau.', en: 'This person has several unions: add the child from the right union in the panel.' },
  pickPerson: { fr: 'Choisir une personne…', en: 'Pick a person…' },
  noMatch: { fr: 'Aucun résultat', en: 'No match' },
  hasFather: { fr: 'Père déjà renseigné', en: 'Father already set' },
  hasMother: { fr: 'Mère déjà renseignée', en: 'Mother already set' },
  newPersonName: { fr: 'Nouvelle personne', en: 'New person' },
  startHint: { fr: 'Commencez par vous, puis ajoutez vos parents depuis la fiche.', en: 'Start with yourself, then add your parents from the card.' },
  saved: { fr: 'Enregistré', en: 'Saved' },
  newTreeName: { fr: 'nouvel-arbre.ged', en: 'new-tree.ged' },
  other: { fr: 'Autre', en: 'Other' },
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
