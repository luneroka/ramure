import { describe, expect, it } from 'vitest';
import { errorText, isApiCode } from './errorText';
import { ApiError } from '../sync/api';
import { EditError } from '../tree/edit';

const api = (status: number, code?: string) => new ApiError(status, 'english prose', code ? { code } : {});

describe('errorText', () => {
  it('tells apart the three different 403s the sign-in path answers with', () => {
    // The bug this pass fixes: status alone said "other device" for all of them.
    const other = errorText('fr', api(403, 'other_device'));
    const invitation = errorText('fr', api(403, 'invitation_required'));
    const admin = errorText('fr', api(403, 'administrator_only'));
    expect(new Set([other, invitation, admin]).size).toBe(3);
  });

  it('never lets the English message through to a French screen', () => {
    // An unknown code used to fall back to err.message, which is English.
    expect(errorText('fr', api(400, 'a_code_nobody_translated'))).not.toContain('english prose');
    expect(errorText('fr', api(500))).not.toContain('english prose');
    expect(errorText('fr', new Error('a raw internal failure'))).not.toContain('raw internal');
  });

  it('answers in the asked-for language', () => {
    expect(errorText('fr', api(403, 'administrator_only'))).toBe('Réservé à l’administrateur.');
    expect(errorText('en', api(403, 'administrator_only'))).toBe('Administrator only.');
  });

  it('maps both expiry codes onto the one thing a person can do about them', () => {
    expect(errorText('fr', api(400, 'link_expired'))).toBe(errorText('fr', api(400, 'code_expired')));
  });

  it('translates an edit refusal a person can act on', () => {
    expect(errorText('fr', new EditError('choose_a_family'))).toContain('unions');
    expect(errorText('fr', new EditError('already_has_a_mother'))).toContain('mère');
  });

  it('shows a bug as a generic failure rather than as an internal detail', () => {
    const text = errorText('fr', new EditError('unknown_person', 'I42'));
    expect(text).not.toContain('I42');
    expect(text).toBe('Erreur inattendue');
  });

  it('is not fooled by an error that merely looks like one of ours', () => {
    expect(errorText('fr', { code: 'administrator_only' })).toBe('Erreur inattendue');
    expect(errorText('fr', 'administrator_only')).toBe('Erreur inattendue');
    expect(errorText('fr', null)).toBe('Erreur inattendue');
  });
});

describe('isApiCode', () => {
  it('matches only a real ApiError carrying that code', () => {
    expect(isApiCode(api(409, 'already_a_member'), 'already_a_member')).toBe(true);
    expect(isApiCode(api(409, 'already_a_user'), 'already_a_member')).toBe(false);
    expect(isApiCode(new EditError('same_person'), 'same_person')).toBe(false);
  });
});
