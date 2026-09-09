/** Strings in French and English. French is the default for a French-speaking first user. */

export type Lang = 'fr' | 'en';

const strings = {
  appName: { fr: 'Ramure', en: 'Ramure' },
  tagline: { fr: 'Votre généalogie, sur une seule toile.', en: 'Your family history, on one canvas.' },
  openFile: { fr: 'Importer un GEDCOM', en: 'Import a GEDCOM' },
  export: { fr: 'Exporter en GEDCOM', en: 'Export as GEDCOM' },
  search: { fr: 'Rechercher une personne…', en: 'Find a person…' },
  fit: { fr: 'Tout voir', en: 'Fit' },
  recentre: { fr: 'Recentrer', en: 'Re-centre' },
  zoomIn: { fr: 'Zoom avant', en: 'Zoom in' },
  zoomOut: { fr: 'Zoom arrière', en: 'Zoom out' },
  peopleCount: { fr: '{n} personne|{n} personnes', en: '{n} person|{n} people' },
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
  importReport: { fr: 'Vérifications', en: 'Checks' },
  checksPendingCount: { fr: '{n} vérification|{n} vérifications', en: '{n} check|{n} checks' },
  reportHint: { fr: 'mis à jour en direct', en: 'updated live' },
  reportEmpty: { fr: 'Rien à signaler.', en: 'Nothing to report.' },
  dismiss: { fr: 'Ignorer', en: 'Dismiss' },
  fix: { fr: 'Corriger', en: 'Fix' },
  dismissHint: { fr: 'Ne plus afficher cette remarque sur cet appareil', en: 'Stop showing this note on this device' },
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
  shownOf: { fr: '{n} / {total} affichées', en: '{n} / {total} shown' },
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
  addEvent: { fr: 'Événement', en: 'Event' },
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
  newPersonName: { fr: 'Nouvelle personne', en: 'New person' },
  draftHint: {
    fr: 'Cette personne n’est ajoutée à l’arbre qu’à l’enregistrement. Annuler ne laisse aucune trace.',
    en: 'This person joins the tree only when you save. Cancel leaves no trace.',
  },
  saved: { fr: 'Enregistré', en: 'Saved' },
  newTreeName: { fr: 'nouvel-arbre.ged', en: 'new-tree.ged' },
  other: { fr: 'Autre', en: 'Other' },
  library: { fr: 'Accueil', en: 'Home' },
  crashTitle: { fr: "Quelque chose s'est cassé", en: 'Something broke' },
  crashHint: {
    fr: 'Vos modifications sont conservées sur cet appareil et seront envoyées à la prochaine synchronisation.',
    en: 'Your edits are kept on this device and will be sent at the next sync.',
  },
  retry: { fr: 'Réessayer', en: 'Try again' },
  reloadPage: { fr: 'Recharger la page', en: 'Reload the page' },
  unexpectedError: { fr: 'Erreur inattendue', en: 'Unexpected error' },
  apiUnavailable: {
    fr: 'Le service en ligne est injoignable. Les arbres de cet appareil restent utilisables.',
    en: 'The online service is unreachable. Trees on this device still work.',
  },
  signinTitle: { fr: 'Connexion', en: 'Sign in' },
  signinSub: { fr: 'Ramure est réservé aux familles invitées.', en: 'Ramure is for invited families.' },
  noAccessYet: { fr: 'Pas encore d’accès ?', en: 'No access yet?' },
  requestAccess: { fr: 'Demander un accès', en: 'Request access' },
  requestAccessHint: {
    fr: 'Laissez votre adresse et un mot sur qui vous êtes. Le responsable de Ramure décide et vous recevez une invitation par courriel.',
    en: 'Leave your address and a word about who you are. The person running Ramure decides and you receive an invitation by email.',
  },
  requestMessage: { fr: 'Qui êtes-vous ? (facultatif)', en: 'Who are you? (optional)' },
  sendRequest: { fr: 'Envoyer la demande', en: 'Send the request' },
  requestSent: {
    fr: 'Demande envoyée. Vous recevrez une invitation si elle est acceptée.',
    en: 'Request sent. You will receive an invitation if it is accepted.',
  },
  accessRequests: { fr: 'Demandes d’accès', en: 'Access requests' },
  inviteThis: { fr: 'Inviter', en: 'Invite' },
  signinHint: {
    fr: 'Pas de mot de passe : un lien de connexion vous est envoyé par courriel.',
    en: 'No password: a sign-in link is emailed to you.',
  },
  email: { fr: 'Adresse courriel', en: 'Email address' },
  sendLink: { fr: 'Recevoir un lien', en: 'Send me a link' },
  linkSent: { fr: 'Lien envoyé à', en: 'Link sent to' },
  linkSentHint: {
    fr: 'Saisissez le code reçu ci-dessous, ou ouvrez le lien du courriel depuis cet appareil. Valable 15 minutes.',
    en: 'Type the code you received below, or open the link from this device. Valid for 15 minutes.',
  },
  devLink: { fr: 'Lien de développement (aucun courriel envoyé)', en: 'Development link (no email sent)' },
  codeLabel: { fr: 'Code à six chiffres reçu par courriel', en: 'Six-digit code from the email' },
  sendAgain: { fr: 'Renvoyer un courriel', en: 'Send another email' },
  codeSubmit: { fr: 'Se connecter', en: 'Sign in' },
  codeHint: {
    fr: 'Le courriel contient un code à six chiffres et un lien : tapez le code ici, ou ouvrez le lien.',
    en: 'The email carries a six-digit code and a link: type the code here, or open the link.',
  },
  codeWrong: { fr: 'Code incorrect ou expiré. Demandez un nouveau courriel.', en: 'Wrong or expired code. Request a new email.' },
  signinFailed: { fr: 'Envoi impossible. Vérifiez l’adresse.', en: 'Could not send. Check the address.' },
  treeTooLarge: {
    fr: 'Ce fichier dépasse 1,5 Mo, la taille maximale d’un arbre pour l’instant. Réduisez-le (notes, médias) avant l’import.',
    en: 'This file is over 1.5 MB, the largest a tree can be for now. Trim it (notes, media) before importing.',
  },
  signinOtherDevice: {
    fr: 'Ce lien a été demandé depuis un autre appareil. Sur celui-ci, demandez un code et saisissez-le, ou ouvrez le lien là où vous l’avez demandé.',
    en: 'This link was requested from another device. Request a code here and type it, or open the link where you asked for it.',
  },
  signinInviteOnly: {
    fr: 'Ramure fonctionne sur invitation. Utilisez l’adresse qui a reçu l’invitation, ou demandez-en une.',
    en: 'Ramure is invitation only. Use the address that received the invitation, or ask for one.',
  },
  administration: { fr: 'Administration', en: 'Administration' },
  adminHint: {
    fr: 'Qui peut entrer, qui demande à partir, et ce que pèse chaque compte famille.',
    en: 'Who may come in, who asked to leave, and what each family account weighs.',
  },
  appInvites: { fr: 'Invitations', en: 'Invitations' },
  appInviteHint: {
    fr: 'La personne reçoit un courriel et peut se connecter avec cette adresse pendant sept jours. Sans invitation, personne n’entre.',
    en: 'The person receives an email and may sign in with that address for seven days. Without an invitation, nobody gets in.',
  },
  sendInvite: { fr: 'Inviter', en: 'Invite' },
  inviteSentTo: { fr: 'Invitation envoyée à', en: 'Invitation sent to' },
  alreadyUser: { fr: 'Cette adresse a déjà accès à Ramure.', en: 'This address already has access.' },
  expires: { fr: 'expire le', en: 'expires' },
  revoke: { fr: 'Révoquer', en: 'Revoke' },
  deletionRequests: { fr: 'Demandes de suppression', en: 'Deletion requests' },
  approveDeletion: { fr: 'Supprimer cet utilisateur', en: 'Delete this user' },
  approveDeletionMessage: {
    fr: 'Ses accès, et les comptes famille dont cette personne est la seule administratrice, avec leurs arbres et fichiers, seront supprimés. Tapez l’adresse pour confirmer :',
    en: 'Their access, and any family account they are the sole administrator of, with its trees and files, will be deleted. Type the address to confirm:',
  },
  approve: { fr: 'Approuver', en: 'Approve' },
  decline: { fr: 'Refuser', en: 'Decline' },
  userDeleted: { fr: 'Utilisateur supprimé', en: 'User deleted' },
  users: { fr: 'Utilisateurs', en: 'Users' },
  adminTag: { fr: 'admin', en: 'admin' },
  accountOne: { fr: 'compte', en: 'account' },
  accountMany: { fr: 'comptes', en: 'accounts' },
  familyAccounts: { fr: 'Comptes famille', en: 'Family accounts' },
  memberOne: { fr: 'membre', en: 'member' },
  memberMany: { fr: 'membres', en: 'members' },
  treeOne: { fr: 'arbre', en: 'tree' },
  treeMany: { fr: 'arbres', en: 'trees' },
  deleteMyAccount: { fr: 'Supprimer mon compte', en: 'Delete my account' },
  deleteMyAccountHint: {
    fr: 'La suppression est traitée par l’administrateur de Ramure. Vous pouvez laisser un mot, et annuler tant qu’elle n’est pas approuvée.',
    en: 'Deletion is handled by the Ramure administrator. You may leave a note, and cancel until it is approved.',
  },
  requestDeletion: { fr: 'Demander la suppression', en: 'Request deletion' },
  deletionNote: { fr: 'Un mot pour l’administrateur (facultatif)', en: 'A note for the administrator (optional)' },
  deletionPending: { fr: 'Demande envoyée le', en: 'Request sent on' },
  cancelDeletion: { fr: 'Annuler la demande', en: 'Cancel the request' },
  deletionRequested: { fr: 'Demande envoyée', en: 'Request sent' },
  deletionCancelled: { fr: 'Demande annulée', en: 'Request cancelled' },
  accountInviteRule: {
    fr: 'La personne doit déjà avoir accès à Ramure (invitation de l’administrateur).',
    en: 'The person must already have access to Ramure (an invitation from the administrator).',
  },
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
  roleViewer: { fr: 'Lecteur', en: 'Viewer' },
  removeMember: { fr: 'Retirer', en: 'Remove' },
  inviteLink: { fr: 'Lien d’invitation', en: 'Invite link' },
  inviteRole: { fr: 'Rôle donné par le lien', en: 'Role given by the link' },
  viewerHint: {
    fr: 'Un lecteur consulte les arbres sans pouvoir les modifier.',
    en: 'A viewer can look at the trees but not change them.',
  },
  adminsOnly: { fr: 'Réservé aux administrateurs', en: 'Administrators only' },
  createLink: { fr: 'Créer un lien', en: 'Create a link' },
  copy: { fr: 'Copier', en: 'Copy' },
  copied: { fr: 'Lien copié', en: 'Link copied' },
  activeLink: { fr: 'Lien actif', en: 'Active link' },
  until: { fr: 'jusqu’au', en: 'until' },
  inviteFor: { fr: 'Invitation à rejoindre', en: 'Invitation to join' },
  inviteSignIn: { fr: 'Connectez-vous pour la rejoindre.', en: 'Sign in to join it.' },
  inviteInvalid: { fr: 'Ce lien d’invitation n’est plus valable.', en: 'This invite link is no longer valid.' },
  deleteTree: { fr: 'Supprimer l’arbre', en: 'Delete tree' },
  syncSynced: { fr: 'À jour', en: 'Up to date' },
  syncPendingCount: { fr: '{n} modification en attente|{n} modifications en attente', en: '{n} change pending|{n} changes pending' },
  syncSyncing: { fr: 'Synchronisation…', en: 'Syncing…' },
  syncOffline: { fr: 'Hors ligne : vos modifications seront envoyées plus tard', en: 'Offline: your changes will be sent later' },
  syncError: { fr: 'Synchronisation impossible', en: 'Sync failed' },
  syncSignedOut: { fr: 'Session expirée : reconnectez-vous', en: 'Session expired: sign in again' },
  syncForbidden: { fr: 'Modifications refusées par le serveur', en: 'Changes refused by the server' },
  syncGone: { fr: 'Arbre supprimé sur le serveur', en: 'Tree deleted on the server' },
  syncStorage: { fr: 'Stockage local indisponible : modifications non conservées', en: 'Local storage unavailable: edits not kept' },
  syncLocked: { fr: 'Ouvert dans un autre onglet (lecture seule ici)', en: 'Open in another tab (read-only here)' },
  overwroteChanges: {
    fr: 'Votre enregistrement a remplacé une modification récente d’un autre membre sur',
    en: 'Your save replaced a recent change by another member on',
  },
  reloadFromServer: { fr: 'Recharger depuis le serveur', en: 'Reload from the server' },
  reloaded: { fr: 'Arbre rechargé depuis le serveur', en: 'Tree reloaded from the server' },
  treeGone: { fr: 'Cet arbre a été supprimé par un autre membre.', en: 'This tree was deleted by another member.' },
  syncReadonly: { fr: 'Lecture seule', en: 'Read only' },
  remoteChanges: { fr: 'Modifications reçues d’un autre membre', en: 'Changes received from another member' },
  droppedChangesCount: {
    fr: '{n} modification abandonnée : un autre membre a modifié la même chose entre-temps|{n} modifications abandonnées : un autre membre a modifié la même chose entre-temps',
    en: '{n} change dropped: another member changed the same thing meanwhile|{n} changes dropped: another member changed the same thing meanwhile',
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
  tabFiche: { fr: 'Fiche', en: 'Profile' },
  tabFamille: { fr: 'Famille', en: 'Family' },
  tabDocuments: { fr: 'Documents', en: 'Documents' },
  tabRecherches: { fr: 'Recherches', en: 'Research' },
  noLeadsYet: {
    fr: 'Aucune piste pour l’instant. Notez ici ce qui reste à vérifier : un acte à retrouver, un cousin à contacter.',
    en: 'No leads yet. Note what is left to check here: a record to find, a cousin to contact.',
  },
  noDocumentsYet: { fr: 'Aucun document pour l’instant.', en: 'No documents yet.' },
  documents: { fr: 'Documents', en: 'Documents' },
  addDocument: { fr: 'Ajouter un document', en: 'Add a document' },
  docKind: { fr: 'Type', en: 'Type' },
  docKindBirth: { fr: 'Acte de naissance', en: 'Birth record' },
  docKindMarriage: { fr: 'Acte de mariage', en: 'Marriage record' },
  docKindDeath: { fr: 'Acte de décès', en: 'Death record' },
  docKindPhoto: { fr: 'Photo', en: 'Photo' },
  docKindOther: { fr: 'Autre document', en: 'Other document' },
  docTitle: { fr: 'Titre', en: 'Title' },
  docDate: { fr: 'Date du document', en: 'Document date' },
  docHint: { fr: 'Image ou PDF, 10 Mo au plus.', en: 'Image or PDF, up to 10 MB.' },
  fileTooBig: { fr: 'Fichier trop lourd : 10 Mo au plus.', en: 'File too large: 10 MB at most.' },
  fileUnsupported: { fr: 'Seuls les images et les PDF sont acceptés.', en: 'Only images and PDFs are accepted.' },
  documentAdded: { fr: 'Document ajouté', en: 'Document added' },
  documentDeleted: { fr: 'Document supprimé', en: 'Document deleted' },
  deleteDocument: { fr: 'Supprimer le document', en: 'Delete the document' },
  deleteDocumentMessage: {
    fr: 'Le fichier sera supprimé du stockage pour tous les membres du compte.',
    en: 'The file will be removed from storage for every member of the account.',
  },
  open: { fr: 'Ouvrir', en: 'Open' },
  missingFile: { fr: 'Fichier introuvable', en: 'File not found' },
  draftNoDocuments: {
    fr: 'Enregistrez d’abord la personne pour lui joindre des documents.',
    en: 'Save the person first to attach documents.',
  },
  leads: { fr: 'Pistes', en: 'Leads' },
  addLead: { fr: 'Ajouter une piste', en: 'Add a lead' },
  leadTitle: { fr: 'Piste', en: 'Lead' },
  leadTitlePlaceholder: { fr: 'Retrouver l’acte de mariage à Conty', en: 'Find the marriage record in Conty' },
  leadUrl: { fr: 'Adresse (facultatif)', en: 'Address (optional)' },
  leadNote: { fr: 'Note (facultatif)', en: 'Note (optional)' },
  leadDone: { fr: 'Fait', en: 'Done' },
  leadReopen: { fr: 'Rouvrir', en: 'Reopen' },
  externalSearch: { fr: 'Recherches externes', en: 'External searches' },
  launchSearch: { fr: 'Lancer toutes les recherches', en: 'Run all the searches' },
  popupBlocked: {
    fr: 'Le navigateur a bloqué certains onglets : ouvrez les liens un par un.',
    en: 'The browser blocked some tabs: open the links one by one.',
  },
  noNameNoSearch: { fr: 'Donnez un nom à cette personne pour lancer des recherches.', en: 'Give this person a name to search.' },
  resources: { fr: 'Ressources', en: 'Resources' },
  resourcesHint: {
    fr: 'Les liens et les documents utiles à tout l’arbre : sites d’archives, livret de famille, cartes, notes de recherche.',
    en: 'Links and documents useful to the whole tree: archive sites, family booklet, maps, research notes.',
  },
  resourceLinks: { fr: 'Liens', en: 'Links' },
  noResourceLinks: { fr: 'Aucun lien pour l’instant.', en: 'No links yet.' },
  noTreeDocuments: { fr: 'Aucun document pour l’instant.', en: 'No documents yet.' },
  backToTree: { fr: 'Arbre', en: 'Tree' },
  addResource: { fr: 'Ajouter', en: 'Add' },
  resourceTitle: { fr: 'Nom', en: 'Name' },
  resourceUrl: { fr: 'Adresse', en: 'Address' },
  resourceSaved: { fr: 'Ressources enregistrées', en: 'Resources saved' },
  storage: { fr: 'Stockage', en: 'Storage' },
  storageUsed: { fr: 'utilisés', en: 'used' },
  files: { fr: 'fichiers', en: 'files' },
  file: { fr: 'fichier', en: 'file' },
  unsure: { fr: 'À vérifier', en: 'To check' },
  kinshipSwap: { fr: 'Inverser', en: 'Swap' },
  modeTree: { fr: 'Arbre', en: 'Tree' },
  modeTimeline: { fr: 'Frise', en: 'Timeline' },
  modeMap: { fr: 'Carte', en: 'Map' },
  marriageShort: { fr: 'Mariage', en: 'Marriage' },
  undated: { fr: 'Sans date', en: 'Undated' },
  fitYears: { fr: 'Toutes les années', en: 'All years' },
  placeMissing: { fr: 'lieu sans coordonnées', en: 'place without coordinates' },
  placesMissing: { fr: 'lieux sans coordonnées', en: 'places without coordinates' },
  locatePlaces: { fr: 'Localiser les lieux', en: 'Locate the places' },
  geocoding: { fr: 'Localisation…', en: 'Locating…' },
  geocodeFound: { fr: 'trouvés', en: 'found' },
  geocodeNone: { fr: 'Aucun lieu n’a pu être localisé.', en: 'No place could be located.' },
  placesLocatedCount: { fr: '{n} lieu localisé|{n} lieux localisés', en: '{n} place located|{n} places located' },
  noPlaces: { fr: 'Aucun lieu dans cet arbre pour l’instant.', en: 'No places in this tree yet.' },
  kinshipArmed: { fr: 'Cliquez sur une autre personne pour voir son lien avec', en: 'Click another person to see their link with' },
  unsureLabel: { fr: 'Informations à vérifier', en: 'Information to check' },
  unsureHint: {
    fr: 'La personne apparaît en pointillé sur la toile, avec un « ? », jusqu’à ce que vous décochiez.',
    en: 'The person shows dashed on the canvas, with a “?”, until you untick this.',
  },
  sectionIdentity: { fr: 'Identité', en: 'Identity' },
  sectionTracking: { fr: 'Suivi', en: 'Tracking' },
  editPerson: { fr: 'Modifier la fiche', en: 'Edit the profile' },
  newPersonTitle: { fr: 'Nouvelle personne', en: 'New person' },
  storageHint: {
    fr: 'Portraits et documents de tous les arbres du compte.',
    en: 'Portraits and documents across the account’s trees.',
  },
  collapseHalf: { fr: 'Replier', en: 'Collapse' },
  expandHalf: { fr: 'Déplier', en: 'Expand' },
  resizeHint: { fr: 'Glisser pour redimensionner, double-clic pour rétablir', en: 'Drag to resize, double-click to reset' },
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
  linkCreated: { fr: 'Lien créé', en: 'Link created' },
  leaveAccountTitle: { fr: 'Quitter ce compte ?', en: 'Leave this account?' },
  removeMemberTitle: { fr: 'Retirer ce membre ?', en: 'Remove this member?' },
  removeMemberMessage: {
    fr: 'Cette personne n’aura plus accès aux arbres du compte. Un nouveau lien d’invitation permettra de la réinviter.',
    en: 'This person loses access to the account’s trees. A new invite link can bring them back.',
  },
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

export type StringKey = Exclude<keyof typeof strings, 'event'>;

/** The whole table, for tests that check every key has both languages. */
export const stringTable = Object.fromEntries(
  Object.entries(strings as Record<string, { fr: unknown; en: unknown }>).filter(([, v]) => typeof v.fr === 'string'),
) as Record<string, { fr: string; en: string }>;

export function t(lang: Lang, key: StringKey): string {
  return strings[key][lang];
}

/** A string with `{name}` placeholders filled in. */
export function tf(lang: Lang, key: StringKey, vars: Record<string, string | number>): string {
  return fill(strings[key][lang], vars);
}

/**
 * A counted string: the entry holds the singular and the plural separated by `|`, with `{n}` for the count.
 * French treats 0 as singular (« 0 personne »), English as plural.
 */
export function tn(lang: Lang, key: StringKey, n: number, vars: Record<string, string | number> = {}): string {
  const forms = strings[key][lang].split('|');
  const one = lang === 'fr' ? n <= 1 : n === 1;
  return fill((one ? forms[0] : forms[forms.length - 1]) ?? '', { n, ...vars });
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
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
  // French unless the person chose otherwise in Paramètres.
  return 'fr';
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
