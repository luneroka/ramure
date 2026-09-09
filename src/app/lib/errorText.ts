/**
 * One place that turns an error into something a person can read.
 *
 * Before this existed, screens guessed from the HTTP status — `err.status ===
 * 403 ? 'other device' : 'expired'` — but the sign-in path answers 403 for
 * three unrelated reasons, so two of the three said the wrong thing. One site
 * compared the English prose directly, which also meant English could reach a
 * French screen.
 *
 * Both error families now carry a stable code, and only the codes a person can
 * act on are translated. Anything else is a bug, and says so plainly rather
 * than leaking an internal message.
 */

import { t, type Lang, type StringKey } from '@/i18n';
import { ApiError } from '@/sync/api';
import { EditError } from '@/tree/edit';

/** API codes worth explaining. Everything absent here is a bug or a detail nobody can act on. */
const API_TEXT: Record<string, StringKey> = {
  sign_in_required: 'errSignInRequired',
  invitation_required: 'errInvitationRequired',
  administrator_only: 'errAdministratorOnly',
  other_device: 'signinOtherDevice',
  link_expired: 'signinExpired',
  code_expired: 'signinExpired',
  wrong_code: 'errWrongCode',
  bad_code: 'errWrongCode',
  too_many_requests: 'errTooManyRequests',
  too_many_attempts: 'errTooManyAttempts',
  not_allowed: 'errNotAllowed',
  account_needs_an_owner: 'errAccountNeedsAnOwner',
  last_owner_cannot_leave: 'errLastOwnerCannotLeave',
  already_a_user: 'alreadyUser',
  already_a_member: 'inviteAlreadyMember',
  invite_not_valid: 'inviteInvalid',
  invite_for_another_address: 'inviteOtherAddress',
  tree_not_found: 'errTreeNotFound',
  tree_too_large: 'errTreeTooLarge',
  name_required: 'errNameRequired',
  restore_is_for_owners: 'errRestoreIsForOwners',
  bulk_removal_is_for_owners: 'errBulkRemovalIsForOwners',
  file_too_large: 'errFileTooLarge',
  account_storage_full: 'errAccountStorageFull',
  unsupported_media_type: 'errUnsupportedMediaType',
  media_not_found: 'errMediaNotFound',
  invalid_email: 'errInvalidEmail',
  mail_not_configured: 'errMailNotSent',
  mail_delivery_failed: 'errMailNotSent',
};

/** Edit refusals a person caused and can undo. The rest mean the caller passed something impossible. */
const EDIT_TEXT: Record<string, StringKey> = {
  choose_a_family: 'chooseFamily',
  already_has_a_father: 'errAlreadyHasAFather',
  already_has_a_mother: 'errAlreadyHasAMother',
  cannot_be_own_child: 'errCannotBeOwnChild',
  same_person: 'errSamePerson',
};

/**
 * What to show for this error, in this language.
 *
 * An unrecognised code falls back to « Erreur inattendue » on purpose: a code
 * nobody translated is either new or a bug, and both are better shown as a
 * generic failure than as English prose in the middle of a French screen.
 */
export function errorText(lang: Lang, err: unknown): string {
  if (err instanceof ApiError) {
    const key = err.code ? API_TEXT[err.code] : undefined;
    return t(lang, key ?? 'syncError');
  }
  if (err instanceof EditError) {
    return t(lang, EDIT_TEXT[err.code] ?? 'unexpectedError');
  }
  return t(lang, 'unexpectedError');
}

/** True when this error is exactly one code — for the few places that branch rather than just report. */
export function isApiCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}
