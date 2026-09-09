/**
 * Every expected error the API can answer with, as a stable code.
 *
 * The code is the contract; the English message beside it is a fallback for
 * logs and for anyone reading the API directly. The browser translates by
 * code and never by prose or by bare status — the sign-in path alone answers
 * 403 for three unrelated reasons, so status is not enough to tell a person
 * what went wrong.
 *
 * Adding an error means adding a code here first. Codes are permanent once
 * shipped: a released browser may be matching on one.
 */

export const ERROR_MESSAGES = {
  // ---------- Authentication and the closed door ----------
  sign_in_required: 'sign in required',
  invitation_required: 'invitation required',
  administrator_only: 'administrator only',
  cross_site_request: 'cross-site request',
  /** The link or code was issued to a different browser than the one using it. */
  other_device: 'other device',
  link_expired: 'link expired',
  code_expired: 'code expired',
  wrong_code: 'wrong code',
  bad_code: 'bad code',
  bad_token: 'bad token',
  too_many_requests: 'too many requests, try again later',
  too_many_attempts: 'too many attempts, try again later',

  // ---------- Accounts, membership and invitations ----------
  account_not_found: 'account not found',
  account_required: 'account required',
  not_allowed: 'not allowed',
  bad_role: 'bad role',
  account_needs_an_owner: 'an account needs at least one owner',
  last_owner_cannot_leave: 'the last owner cannot leave',
  cannot_delete_yourself: 'cannot delete yourself',
  already_a_user: 'already a user',
  already_a_member: 'already a member',
  invite_not_valid: 'invite not valid',
  invite_for_another_address: 'invite for another address',
  no_request: 'no request',

  // ---------- Trees, ops and snapshots ----------
  tree_not_found: 'tree not found',
  tree_too_large: 'tree too large',
  name_required: 'name required',
  no_ops: 'no ops',
  too_many_ops: 'too many ops',
  bad_op: 'bad op',
  op_too_deep: 'op nested too deeply',
  bad_op_id: 'bad op id',
  bad_base_version: 'bad base version',
  /** The push was built on an older version; the answer carries the ops it is missing. */
  stale_base: 'stale base',
  restore_is_for_owners: 'restoring a version is for administrators',
  bulk_removal_is_for_owners: 'removing that many records at once is for administrators',
  snapshot_not_found: 'snapshot not found',

  // ---------- Media ----------
  media_not_found: 'media not found',
  media_already_stored: 'media already stored',
  media_id_in_use: 'media id in use',
  file_too_large: 'file too large',
  account_storage_full: 'this account has no room left for files',
  unsupported_media_type: 'images (JPEG, PNG, WebP, GIF, HEIC) and PDFs only',
  no_copy: 'no copy',

  // ---------- Request shape ----------
  bad_id: 'bad id',
  invalid_email: 'invalid email',
  message_required: 'message required',
  body_too_large: 'body too large',
  malformed_json: 'malformed JSON',
  expected_json_object: 'expected a JSON object',

  // ---------- Server and downstream ----------
  mail_not_configured: 'mail not configured',
  mail_delivery_failed: 'mail delivery failed',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
