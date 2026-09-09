/** Thin client for the Worker API. Same origin, cookie session. */

import type { OpEnvelope } from '../tree/ops';
import type { Incoming } from './rebase';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, raw?: BodyInit, contentType?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(path, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? res.statusText), data);
  return data as T;
}

export type Role = 'owner' | 'editor' | 'viewer';

export interface StorageReport {
  bytes: number;
  files: number;
  trees: Array<{ id: string; name: string; files: number; bytes: number }>;
}

export interface Me {
  id: string;
  email: string;
  name: string | null;
}

export interface TreeSummary {
  id: string;
  name: string;
  version: number;
  people: number;
  updated_at: number;
  role: Role;
}

export type AccountRole = 'owner' | 'member' | 'viewer';

export interface Account {
  id: string;
  name: string;
  role: AccountRole;
  members: number;
  trees: number;
}

export interface AccountMember {
  id: string;
  email: string;
  name: string | null;
  role: AccountRole;
  added_at: number;
}

export const api = {
  me: () => call<{ user: Me | null }>('GET', '/api/auth/me'),
  requestLink: (email: string) => call<{ ok: true; link?: string; code?: string }>('POST', '/api/auth/request', { email }),
  verifyCode: (email: string, code: string) => call<{ ok: true }>('POST', '/api/auth/code', { email, code }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  rename: (name: string) => call<{ user: Me }>('PATCH', '/api/auth/me', { name }),

  accounts: () => call<{ accounts: Account[] }>('GET', '/api/accounts'),
  createAccount: (name: string) => call<{ id: string; name: string; role: 'owner' }>('POST', '/api/accounts', { name }),
  renameAccount: (id: string, name: string) => call<{ ok: true }>('PATCH', `/api/accounts/${id}`, { name }),
  accountMembers: (id: string) => call<{ members: AccountMember[] }>('GET', `/api/accounts/${id}/members`),
  accountStorage: (id: string) => call<StorageReport>('GET', `/api/accounts/${id}/storage`),
  setAccountRole: (id: string, userId: string, role: AccountRole) =>
    call<{ ok: true }>('PATCH', `/api/accounts/${id}/members/${userId}`, { role }),
  removeAccountMember: (id: string, userId: string) => call<{ ok: true }>('DELETE', `/api/accounts/${id}/members/${userId}`),
  createAccountInvite: (id: string, role: 'member' | 'viewer' = 'member') =>
    call<{ link: string; expiresAt: number; role: AccountRole }>('POST', `/api/accounts/${id}/invites`, { role }),
  listAccountInvites: (id: string) =>
    call<{ invites: Array<{ id: string; createdAt: number; expiresAt: number; role: AccountRole }> }>('GET', `/api/accounts/${id}/invites`),
  revokeAccountInvite: (id: string, inviteId: string) => call<{ ok: true }>('DELETE', `/api/accounts/${id}/invites/${inviteId}`),
  inviteInfo: (token: string) =>
    call<{ accountId: string; accountName: string; role: AccountRole }>('GET', `/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    call<{ accountId: string; role: 'owner' | 'member' }>('POST', `/api/invites/${encodeURIComponent(token)}/accept`, {}),

  listTrees: (accountId: string) => call<{ trees: TreeSummary[] }>('GET', `/api/trees?account=${encodeURIComponent(accountId)}`),
  createTree: (accountId: string, name: string, gedcom: string) =>
    call<{ id: string; name: string; version: number; role: Role }>('POST', '/api/trees', { accountId, name, gedcom }),
  getTree: (id: string) =>
    call<{ id: string; name: string; version: number; doc: string; people: number; role: Role; updatedAt: number }>(
      'GET',
      `/api/trees/${id}`,
    ),
  renameTree: (id: string, name: string) => call<{ ok: true }>('PATCH', `/api/trees/${id}`, { name }),
  deleteTree: (id: string) => call<{ ok: true }>('DELETE', `/api/trees/${id}`),

  pull: (id: string, since: number) => call<{ version: number; ops: Incoming[] }>('GET', `/api/trees/${id}/ops?since=${since}`),
  push: (id: string, baseVersion: number, ops: OpEnvelope[]) =>
    call<{ version: number; applied: string[]; rejected: Array<{ id: string; reason: string }> }>('POST', `/api/trees/${id}/ops`, {
      baseVersion,
      ops,
    }),

  listSnapshots: (id: string) =>
    call<{ snapshots: Array<{ id: string; version: number; created_at: number; label: string | null; by: string | null }> }>(
      'GET',
      `/api/trees/${id}/snapshots`,
    ),
  saveSnapshot: (id: string, label: string) =>
    call<{ id: string; version: number; created_at: number; label: string | null }>('POST', `/api/trees/${id}/snapshots`, { label }),
  getSnapshot: (id: string, sid: string) =>
    call<{ doc: string; version: number; created_at: number }>('GET', `/api/trees/${id}/snapshots/${sid}`),

  putMedia: (treeId: string, mediaId: string, blob: Blob) =>
    call<{ ok: true }>('PUT', `/api/trees/${treeId}/media/${mediaId}`, undefined, blob, blob.type || 'image/jpeg'),
  getMedia: async (treeId: string, mediaId: string): Promise<Blob | undefined> => {
    const res = await fetch(`/api/trees/${treeId}/media/${mediaId}`, { credentials: 'same-origin' });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return res.blob();
  },
  deleteMedia: (treeId: string, mediaId: string) => call<{ ok: true }>('DELETE', `/api/trees/${treeId}/media/${mediaId}`),
};
