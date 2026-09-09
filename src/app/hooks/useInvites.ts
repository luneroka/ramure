/** Sign-in links and family invitations arrive in the fragment; both are consumed here. */

import { useEffect, useState } from 'react';
import { t, type Lang } from '../../i18n';
import { api, ApiError } from '../../sync/api';
import type { Auth } from '../useAuth';

export const INVITE_KEY = 'ramure.invite';

export function useInvites(auth: Auth, lang: Lang, toast: (m: string) => void) {
  const [pendingInvite, setPendingInvite] = useState<{ token: string; accountName: string; email: string | null } | null>(null);
  useEffect(() => {
    // Tokens arrive in the fragment (#signin=…, #invite=…): never sent to the server, stripped as soon as read.
    // Consumed on load and whenever the fragment changes, so a link opened into an already open tab works too.
    const consumeFragment = () => {
      const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
      const signinToken = frag.get('signin');
      const inviteToken = frag.get('invite');
      if (!signinToken && !inviteToken) return;
      window.history.replaceState(null, '', location.pathname + '#/');
      if (signinToken) {
        auth
          .verifyLink(signinToken)
          .then(() => toast(t(lang, 'signedIn')))
          .catch((err) => toast(t(lang, err instanceof ApiError && err.status === 403 ? 'signinOtherDevice' : 'signinExpired')));
      }
      if (inviteToken) sessionStorage.setItem(INVITE_KEY, inviteToken);
    };
    consumeFragment();
    window.addEventListener('hashchange', consumeFragment);
    const token = sessionStorage.getItem(INVITE_KEY);
    if (token) {
      api
        .inviteInfo(token)
        .then((info) => setPendingInvite({ token, accountName: info.accountName, email: info.email }))
        .catch(() => {
          sessionStorage.removeItem(INVITE_KEY);
          window.setTimeout(() => toast(t(lang, 'inviteInvalid')), 0);
        });
    }
    return () => window.removeEventListener('hashchange', consumeFragment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { pendingInvite, setPendingInvite };
}
