/** Strings in French and English. French is the default for a French-speaking first user. */

export type Lang = 'fr' | 'en';

const strings = {
  appName: { fr: 'Ramure', en: 'Ramure' },
  tagline: { fr: 'Votre généalogie, sur une seule toile.', en: 'Your family history, on one canvas.' },
  openFile: { fr: 'Importer un GEDCOM', en: 'Import a GEDCOM' },
  openShort: { fr: 'Importer', en: 'Import' },
  loadSample: { fr: 'Arbre d’exemple', en: 'Sample tree' },
  export: { fr: 'Exporter en GEDCOM', en: 'Export as GEDCOM' },
  unlinkedPeople: { fr: 'personne(s) non rattachée(s) à aucune famille', en: 'person(s) not linked to any family' },
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
  dropHint: {
    fr: 'Ouvrez un fichier GEDCOM exporté de Geneanet, Gramps, webtrees ou n’importe quel logiciel, ou glissez-le ici. Tout reste sur votre appareil.',
    en: 'Open a GEDCOM exported from Geneanet, Gramps, webtrees or any software, or drop it here. Everything stays on your device.',
  },
  hint: {
    fr: 'Glissez pour déplacer, pincez ou molette pour zoomer, touchez une personne pour recentrer.',
    en: 'Drag to pan, pinch or scroll to zoom, tap a person to re-centre.',
  },
  moreAbove: {
    fr: 'Des ancêtres au-delà de la limite ne sont pas affichés. Touchez un ancêtre pour continuer.',
    en: 'Ancestors beyond the limit are not shown. Tap an ancestor to continue.',
  },
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
  confirmDelete: {
    fr: 'Supprimer définitivement cette personne de l’arbre ? Ses liens familiaux seront retirés. Une version de l’arbre est conservée juste avant, et l’action reste annulable avec le bouton Annuler.',
    en: 'Remove this person from the tree? Their family links are removed. A version of the tree is kept just before, and the action can be undone with the Undo button.',
  },
  addFather: { fr: '+ Père', en: '+ Father' },
  addMother: { fr: '+ Mère', en: '+ Mother' },
  addPartner: { fr: '+ Conjoint·e', en: '+ Partner' },
  addChild: { fr: '+ Enfant', en: '+ Child' },
  addSibling: { fr: '+ Frère / sœur', en: '+ Sibling' },
  linkPartner: { fr: 'Lier un·e conjoint·e existant·e', en: 'Link an existing partner' },
  linkChild: { fr: 'Lier un enfant existant', en: 'Link an existing child' },
  unlink: { fr: 'Retirer de la famille', en: 'Remove from family' },
  merge: { fr: 'Fusionner avec un doublon…', en: 'Merge with a duplicate…' },
  mergeHint: {
    fr: 'La personne choisie sera fusionnée dans celle-ci, puis supprimée.',
    en: 'The chosen person is merged into this one, then removed.',
  },
  undo: { fr: 'Annuler', en: 'Undo' },
  redo: { fr: 'Rétablir', en: 'Redo' },
  newTree: { fr: 'Nouvel arbre', en: 'New tree' },
  newTreeConfirm: {
    fr: 'Commencer un nouvel arbre ? L’arbre actuel reste dans les sauvegardes.',
    en: 'Start a new tree? The current one stays in the snapshots.',
  },
  snapshots: { fr: 'Sauvegardes', en: 'Snapshots' },
  snapshotsHint: {
    fr: 'Copies automatiques conservées sur cet appareil. Restaurer remplace l’arbre affiché (annulable).',
    en: 'Automatic copies kept on this device. Restoring replaces the shown tree (undoable).',
  },
  noSnapshots: { fr: 'Aucune sauvegarde pour l’instant.', en: 'No snapshots yet.' },
  restore: { fr: 'Restaurer', en: 'Restore' },
  menu: { fr: 'Menu', en: 'Menu' },
  view: { fr: 'Vue', en: 'View' },
  viewAll: { fr: 'Vue d’ensemble', en: 'Overview' },
  viewHourglass: { fr: 'Sablier', en: 'Hourglass' },
  showAll: { fr: 'Vue d’ensemble', en: 'Overview' },
  shown: { fr: 'affichées', en: 'shown' },
  addRelative: { fr: 'Ajouter un proche', en: 'Add a relative' },
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
  dateHint: {
    fr: 'ex. 12/03/1952, mars 1952, vers 1860, entre 1880 et 1885',
    en: 'e.g. 12/03/1952, March 1952, about 1860, between 1880 and 1885',
  },
  dateUnreadable: { fr: 'Date non comprise, conservée telle quelle', en: 'Date not understood, kept as typed' },
  dateFreeText: { fr: 'Saisie libre', en: 'Free text' },
  dateGuided: { fr: 'Saisie guidée', en: 'Guided' },
  dateKind: { fr: 'Précision', en: 'Precision' },
  dateNotGuidable: {
    fr: 'Cette date (calendrier républicain ou texte) ne peut être saisie qu’en texte libre.',
    en: 'This date (Republican calendar or free text) can only be edited as text.',
  },
  placeHint: { fr: 'Commune, département, pays…', en: 'Town, region, country…' },
  placeFromTree: { fr: 'arbre', en: 'tree' },
  portrait: { fr: 'Portrait', en: 'Portrait' },
  choosePhoto: { fr: 'Choisir une photo', en: 'Choose a photo' },
  changePhoto: { fr: 'Changer la photo', en: 'Change the photo' },
  removePhoto: { fr: 'Retirer la photo', en: 'Remove the photo' },
  photoHint: {
    fr: 'Stockée sur cet appareil, réduite à 640 px. Un cadrage portrait rend le mieux dans le médaillon.',
    en: 'Kept on this device, downsized to 640 px. A portrait crop looks best in the medallion.',
  },
  addEvent: { fr: '+ Événement', en: '+ Event' },
  privatePerson: { fr: 'Personne privée (masquée dans les partages)', en: 'Private person (hidden when shared)' },
  editUnion: { fr: 'Modifier l’union', en: 'Edit union' },
  unionType: { fr: 'Type d’union', en: 'Union type' },
  married: { fr: 'Mariage', en: 'Marriage' },
  civil: { fr: 'PACS / union civile', en: 'Civil union' },
  unknownUnion: { fr: 'Non précisé', en: 'Unspecified' },
  chooseFamily: {
    fr: 'Cette personne a plusieurs unions : ajoutez l’enfant depuis l’union voulue dans le panneau.',
    en: 'This person has several unions: add the child from the right union in the panel.',
  },
  pickPerson: { fr: 'Choisir une personne…', en: 'Pick a person…' },
  noMatch: { fr: 'Aucun résultat', en: 'No match' },
  hasFather: { fr: 'Père déjà renseigné', en: 'Father already set' },
  hasMother: { fr: 'Mère déjà renseignée', en: 'Mother already set' },
  newPersonName: { fr: 'Nouvelle personne', en: 'New person' },
  draftHint: {
    fr: 'Cette personne n’est ajoutée à l’arbre qu’à l’enregistrement. Annuler ne laisse aucune trace.',
    en: 'This person joins the tree only when you save. Cancel leaves no trace.',
  },
  startHint: {
    fr: 'Commencez par vous, puis ajoutez vos parents depuis la fiche.',
    en: 'Start with yourself, then add your parents from the card.',
  },
  saved: { fr: 'Enregistré', en: 'Saved' },
  newTreeName: { fr: 'nouvel-arbre.ged', en: 'new-tree.ged' },
  other: { fr: 'Autre', en: 'Other' },
  library: { fr: 'Accueil', en: 'Home' },
  cloudTrees: { fr: 'Arbres partagés', en: 'Shared trees' },
  deviceTree: { fr: 'Arbre sur cet appareil', en: 'Tree on this device' },
  onThisDevice: { fr: 'sur cet appareil uniquement', en: 'on this device only' },
  noDeviceTree: { fr: 'Aucun arbre sur cet appareil pour l’instant.', en: 'No tree on this device yet.' },
  noCloudTrees: {
    fr: 'Aucun arbre partagé pour l’instant. Mettez en ligne l’arbre de cet appareil, ou ouvrez un lien d’invitation.',
    en: 'No shared tree yet. Upload the tree on this device, or open an invite link.',
  },
  uploadLocal: { fr: 'Mettre cet arbre en ligne', en: 'Upload this tree' },
  uploading: { fr: 'Mise en ligne…', en: 'Uploading…' },
  uploaded: { fr: 'Arbre en ligne. Vous pouvez maintenant le partager.', en: 'Tree is online. You can share it now.' },
  apiUnavailable: {
    fr: 'Le service en ligne est injoignable. Les arbres de cet appareil restent utilisables.',
    en: 'The online service is unreachable. Trees on this device still work.',
  },
  signinHint: {
    fr: 'Pas de mot de passe : un lien de connexion vous est envoyé par courriel.',
    en: 'No password: a sign-in link is emailed to you.',
  },
  email: { fr: 'Adresse courriel', en: 'Email address' },
  sendLink: { fr: 'Recevoir un lien', en: 'Send me a link' },
  linkSent: { fr: 'Lien envoyé à', en: 'Link sent to' },
  linkSentHint: {
    fr: 'Ouvrez-le depuis cet appareil, il est valable 15 minutes.',
    en: 'Open it from this device; it is valid for 15 minutes.',
  },
  devLink: { fr: 'Lien de développement (aucun courriel envoyé)', en: 'Development link (no email sent)' },
  otherEmail: { fr: 'Autre adresse', en: 'Other address' },
  signinFailed: { fr: 'Envoi impossible. Vérifiez l’adresse.', en: 'Could not send. Check the address.' },
  signinThrottled: {
    fr: 'Trop de demandes pour cette adresse. Réessayez dans un quart d’heure.',
    en: 'Too many requests for this address. Try again in fifteen minutes.',
  },
  signedIn: { fr: 'Connecté·e', en: 'Signed in' },
  signinExpired: {
    fr: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    en: 'This link has expired or was already used. Ask for a new one.',
  },
  signOut: { fr: 'Se déconnecter', en: 'Sign out' },
  share: { fr: 'Partager', en: 'Share' },
  members: { fr: 'Membres', en: 'Members' },
  you: { fr: 'vous', en: 'you' },
  roleOwner: { fr: 'Administrateur', en: 'Administrator' },
  roleEditor: { fr: 'Éditeur', en: 'Editor' },
  roleViewer: { fr: 'Lecteur', en: 'Viewer' },
  removeMember: { fr: 'Retirer', en: 'Remove' },
  inviteLink: { fr: 'Lien d’invitation', en: 'Invite link' },
  inviteRole: { fr: 'Rôle donné par le lien', en: 'Role given by the link' },
  viewerHint: {
    fr: 'Un lecteur consulte les arbres sans pouvoir les modifier.',
    en: 'A viewer can look at the trees but not change them.',
  },
  adminsOnly: { fr: 'Réservé aux administrateurs', en: 'Administrators only' },
  inviteHint: {
    fr: 'Toute personne avec ce lien rejoint l’arbre avec le rôle choisi, après connexion. Valable 30 jours, révocable.',
    en: 'Anyone with this link joins the tree with the chosen role, after signing in. Valid 30 days, revocable.',
  },
  createLink: { fr: 'Créer un lien', en: 'Create a link' },
  copy: { fr: 'Copier', en: 'Copy' },
  copied: { fr: 'Lien copié', en: 'Link copied' },
  activeLink: { fr: 'Lien actif', en: 'Active link' },
  until: { fr: 'jusqu’au', en: 'until' },
  revoke: { fr: 'Révoquer', en: 'Revoke' },
  leaveTree: { fr: 'Quitter cet arbre', en: 'Leave this tree' },
  leaveConfirm: {
    fr: 'Quitter cet arbre ? Vous n’y aurez plus accès sans nouvelle invitation.',
    en: 'Leave this tree? You will need a new invite to come back.',
  },
  inviteFor: { fr: 'Invitation à rejoindre', en: 'Invitation to join' },
  inviteJoining: { fr: 'Ouverture…', en: 'Opening…' },
  inviteSignIn: { fr: 'Connectez-vous pour la rejoindre.', en: 'Sign in to join it.' },
  inviteInvalid: { fr: 'Ce lien d’invitation n’est plus valable.', en: 'This invite link is no longer valid.' },
  deleteTree: { fr: 'Supprimer l’arbre', en: 'Delete tree' },
  deleteTreeConfirm: {
    fr: 'Supprimer définitivement cet arbre partagé pour tous ses membres ? Exportez-le d’abord si besoin.',
    en: 'Permanently delete this shared tree for every member? Export it first if needed.',
  },
  syncSynced: { fr: 'À jour', en: 'Up to date' },
  syncPending: { fr: 'modification(s) en attente', en: 'change(s) pending' },
  syncSyncing: { fr: 'Synchronisation…', en: 'Syncing…' },
  syncOffline: { fr: 'Hors ligne : vos modifications seront envoyées plus tard', en: 'Offline: your changes will be sent later' },
  syncError: { fr: 'Synchronisation impossible', en: 'Sync failed' },
  syncReadonly: { fr: 'Lecture seule', en: 'Read only' },
  remoteChanges: { fr: 'Modifications reçues d’un autre membre', en: 'Changes received from another member' },
  droppedChanges: {
    fr: 'modification(s) abandonnée(s) : un autre membre a modifié la même chose entre-temps',
    en: 'change(s) dropped: another member changed the same thing meanwhile',
  },
  readOnlyHint: { fr: 'Vous consultez cet arbre en lecture seule.', en: 'You are viewing this tree read only.' },
  account: { fr: 'Compte', en: 'Account' },
  accountName: { fr: 'Nom du compte', en: 'Account name' },
  defaultAccountName: { fr: 'Ma famille', en: 'My family' },
  createAccountTitle: { fr: 'Créez votre compte famille', en: 'Create your family account' },
  createAccountHint: {
    fr: 'Un compte regroupe vos arbres et les personnes qui y travaillent. Chacun se connecte avec sa propre adresse.',
    en: 'An account holds your trees and the people who work on them. Everyone signs in with their own address.',
  },
  createAccount: { fr: 'Créer le compte', en: 'Create the account' },
  orInvite: {
    fr: 'Vous avez reçu un lien d’invitation ? Ouvrez-le simplement, votre compte y sera rattaché.',
    en: 'Got an invite link? Just open it and you will join that account.',
  },
  accountMembers: { fr: 'Membres du compte', en: 'Account members' },
  membersHint: {
    fr: 'Chaque membre voit et modifie tous les arbres du compte. Les propriétaires gèrent les membres.',
    en: 'Every member sees and edits all the trees of the account. Owners manage members.',
  },
  memberCount: { fr: 'membre', en: 'member' },
  membersCount: { fr: 'membres', en: 'members' },
  roleMember: { fr: 'Membre', en: 'Member' },
  rename: { fr: 'Renommer', en: 'Rename' },
  accountInviteHint: {
    fr: 'Envoyez ce lien à un proche : après connexion avec son adresse, il rejoint ce compte et voit les mêmes arbres. Valable 30 jours, révocable.',
    en: 'Send this link to a relative: after signing in with their own address they join this account and see the same trees. Valid 30 days, revocable.',
  },
  leaveAccount: { fr: 'Quitter ce compte', en: 'Leave this account' },
  leaveAccountConfirm: {
    fr: 'Quitter ce compte ? Vous n’aurez plus accès à ses arbres sans nouvelle invitation.',
    en: 'Leave this account? You will need a new invite to come back.',
  },
  lastOwner: { fr: 'Un compte doit garder au moins un administrateur.', en: 'An account needs at least one administrator.' },
  lastOwnerLeave: {
    fr: 'Vous êtes le seul administrateur : nommez-en un autre avant de quitter le compte.',
    en: 'You are the only administrator: appoint another one before leaving the account.',
  },
  trees: { fr: 'Arbres', en: 'Trees' },
  noTreesYet: {
    fr: 'Aucun arbre pour l’instant. Importez un GEDCOM ou commencez un nouvel arbre.',
    en: 'No tree yet. Import a GEDCOM or start a new tree.',
  },
  dropHintCloud: {
    fr: 'Vous pouvez aussi glisser un fichier GEDCOM ici. Les arbres sont enregistrés en ligne et restent consultables hors connexion sur cet appareil.',
    en: 'You can also drop a GEDCOM file here. Trees are saved online and stay available offline on this device.',
  },
  creatingTree: { fr: 'Création de l’arbre…', en: 'Creating the tree…' },
  treeName: { fr: 'Nom de l’arbre', en: 'Tree name' },
  renameTree: { fr: 'Renommer l’arbre', en: 'Rename tree' },
  occupation: { fr: 'Profession', en: 'Occupation' },
  with: { fr: 'avec', en: 'with' },
  family: { fr: 'Famille', en: 'Family' },
  identity: { fr: 'Identité', en: 'Identity' },
  lifeEvents: { fr: 'Parcours', en: 'Life' },
  settings: { fr: 'Paramètres', en: 'Settings' },
  profile: { fr: 'Profil', en: 'Profile' },
  preferences: { fr: 'Préférences', en: 'Preferences' },
  displayName: { fr: 'Nom affiché', en: 'Display name' },
  displayNameHint: { fr: 'Comment les autres membres vous voient', en: 'How other members see you' },
  defaultView: { fr: 'Vue à l’ouverture d’un arbre', en: 'View when opening a tree' },
  switchTree: { fr: 'Changer d’arbre', en: 'Switch tree' },
  thisTree: { fr: 'Cet arbre', en: 'This tree' },
  versionHistory: { fr: 'Historique des versions', en: 'Version history' },
  exportShort: { fr: 'Exporter', en: 'Export' },
  searchShort: { fr: 'Rechercher', en: 'Search' },
  openTree: { fr: 'Ouvrir', en: 'Open' },
  confirm: { fr: 'Confirmer', en: 'Confirm' },
  create: { fr: 'Créer', en: 'Create' },
  typeToConfirm: { fr: 'Pour confirmer, tapez', en: 'To confirm, type' },
  deleteTreeTitle: { fr: 'Supprimer cet arbre ?', en: 'Delete this tree?' },
  deleteTreeMessage: {
    fr: 'Cette action est définitive pour tous les membres du compte. Exportez l’arbre en GEDCOM avant si vous voulez en garder une copie.',
    en: 'This is permanent for every member of the account. Export the tree as GEDCOM first if you want a copy.',
  },
  treeDeleted: { fr: 'Arbre supprimé', en: 'Tree deleted' },
  treeCreated: { fr: 'Arbre créé', en: 'Tree created' },
  treeRenamed: { fr: 'Arbre renommé', en: 'Tree renamed' },
  personDeleted: { fr: 'Personne supprimée', en: 'Person deleted' },
  linked: { fr: 'Lien ajouté', en: 'Linked' },
  unlinked: { fr: 'Lien retiré', en: 'Unlinked' },
  merged: { fr: 'Doublons fusionnés', en: 'Duplicates merged' },
  photoSaved: { fr: 'Photo enregistrée', en: 'Photo saved' },
  versionSaved: { fr: 'Version enregistrée', en: 'Version saved' },
  versionRestored: { fr: 'Version restaurée', en: 'Version restored' },
  saveVersion: { fr: 'Enregistrer une version', en: 'Save a version' },
  versionLabel: { fr: 'Nom de la version', en: 'Version name' },
  versionLabelHint: { fr: 'ex. Avant la fusion des Guérin', en: 'e.g. Before merging the Guérins' },
  restoreTitle: { fr: 'Restaurer cette version ?', en: 'Restore this version?' },
  restoreMessage: {
    fr: 'L’arbre reviendra à cet état pour tous les membres. L’état actuel est conservé dans l’historique et l’opération est annulable.',
    en: 'The tree returns to this state for every member. The current state stays in the history and the action can be undone.',
  },
  automaticVersion: { fr: 'Version automatique', en: 'Automatic version' },
  versionN: { fr: 'version n°', en: 'version' },
  by: { fr: 'par', en: 'by' },
  memberRemoved: { fr: 'Membre retiré', en: 'Member removed' },
  roleChanged: { fr: 'Rôle modifié', en: 'Role changed' },
  linkRevoked: { fr: 'Lien révoqué', en: 'Link revoked' },
  linkCreated: { fr: 'Lien créé', en: 'Link created' },
  leaveAccountTitle: { fr: 'Quitter ce compte ?', en: 'Leave this account?' },
  removeMemberTitle: { fr: 'Retirer ce membre ?', en: 'Remove this member?' },
  removeMemberMessage: {
    fr: 'Cette personne n’aura plus accès aux arbres du compte. Un nouveau lien d’invitation permettra de la réinviter.',
    en: 'This person loses access to the account’s trees. A new invite link can bring them back.',
  },
  deletePersonTitle: { fr: 'Supprimer cette personne ?', en: 'Delete this person?' },
  age: { fr: 'Âge', en: 'Age' },
  address: { fr: 'Adresse', en: 'Address' },
  event: {
    fr: {
      birth: 'Naissance',
      baptism: 'Baptême',
      death: 'Décès',
      burial: 'Inhumation',
      cremation: 'Crémation',
      adoption: 'Adoption',
      marriage: 'Mariage',
      divorce: 'Divorce',
      engagement: 'Fiançailles',
      'marriage-banns': 'Bans',
      annulment: 'Annulation',
      separation: 'Séparation',
      occupation: 'Profession',
      residence: 'Résidence',
      census: 'Recensement',
      education: 'Études',
      religion: 'Religion',
      retirement: 'Retraite',
      emigration: 'Émigration',
      immigration: 'Immigration',
      naturalization: 'Naturalisation',
      probate: 'Succession',
      will: 'Testament',
      graduation: 'Diplôme',
      confirmation: 'Confirmation',
      'first-communion': 'Première communion',
      title: 'Titre',
      description: 'Description',
      custom: 'Événement',
    },
    en: {
      birth: 'Birth',
      baptism: 'Baptism',
      death: 'Death',
      burial: 'Burial',
      cremation: 'Cremation',
      adoption: 'Adoption',
      marriage: 'Marriage',
      divorce: 'Divorce',
      engagement: 'Engagement',
      'marriage-banns': 'Banns',
      annulment: 'Annulment',
      separation: 'Separation',
      occupation: 'Occupation',
      residence: 'Residence',
      census: 'Census',
      education: 'Education',
      religion: 'Religion',
      retirement: 'Retirement',
      emigration: 'Emigration',
      immigration: 'Immigration',
      naturalization: 'Naturalization',
      probate: 'Probate',
      will: 'Will',
      graduation: 'Graduation',
      confirmation: 'Confirmation',
      'first-communion': 'First communion',
      title: 'Title',
      description: 'Description',
      custom: 'Event',
    },
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
  } catch {
    /* storage unavailable */
  }
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem('ramure.lang', lang);
  } catch {
    /* ignore */
  }
}

export type ThemeChoice = 'auto' | 'light' | 'dark';

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem('ramure.theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    localStorage.setItem('ramure.theme', choice);
  } catch {
    /* ignore */
  }
}

/** Strings whose French form depends on the person's sex. Unknown sex keeps the inclusive form. */
const gendered = {
  born: { fr: { M: 'né', F: 'née', U: 'né·e' }, en: { M: 'b.', F: 'b.', U: 'b.' } },
  died: { fr: { M: 'décédé', F: 'décédée', U: 'décédé·e' }, en: { M: 'd.', F: 'd.', U: 'd.' } },
  living: { fr: { M: 'Vivant', F: 'Vivante', U: 'Vivant·e' }, en: { M: 'Living', F: 'Living', U: 'Living' } },
  adopted: { fr: { M: 'adopté', F: 'adoptée', U: 'adopté·e' }, en: { M: 'adopted', F: 'adopted', U: 'adopted' } },
  unknownPerson: { fr: { M: 'Inconnu', F: 'Inconnue', U: 'Inconnu·e' }, en: { M: 'Unknown', F: 'Unknown', U: 'Unknown' } },
  /** Label for adding a partner: gendered by the partner that will be created, i.e. the opposite of the person. */
  addPartner: { fr: { M: '+ Conjointe', F: '+ Conjoint', U: '+ Conjoint·e' }, en: { M: '+ Partner', F: '+ Partner', U: '+ Partner' } },
} as const;

export type GenderedKey = keyof typeof gendered;

export function tg(lang: Lang, key: GenderedKey, sex: 'M' | 'F' | 'U'): string {
  return gendered[key][lang][sex];
}

/** "77 ans" / "~77 ans" in French, "77" / "~77" on cards and "aged 77" in text for English. */
export function formatAge(lang: Lang, age: { years: number; approx: boolean }, style: 'card' | 'text' = 'text'): string {
  const n = (age.approx ? '~' : '') + age.years;
  if (lang === 'fr') return `${n} an${age.years > 1 ? 's' : ''}`;
  return style === 'card' ? n : `aged ${n}`;
}
