# API error convention

Every expected error the API answers with carries a **stable code**. The code
is the contract; the English message beside it is a fallback for logs and for
anyone reading the API directly.

```json
{ "code": "tree_too_large", "error": "tree too large", "maxBytes": 1500000 }
```

## Why codes, and not status

Status is not enough to tell a person what went wrong. The sign-in path alone
answers **403 for three unrelated reasons** — the link belongs to another
browser, the address has no invitation, the request came cross-site. Before
this convention the browser guessed from the status:

```ts
toast(t(lang, err.status === 403 ? 'signinOtherDevice' : 'signinExpired'));
```

— so two of the three said the wrong thing. One site went further and compared
the English prose (`err.message === 'choose a family'`), which also meant raw
English could appear on a French screen.

## Worker side

Add the code to [`worker/errorCodes.ts`](../worker/errorCodes.ts) first, then
throw it:

```ts
throw new HttpError(413, 'tree_too_large', { maxBytes: MAX_DOC_BYTES });
```

- `HttpError(status, code, extra?)` — the message is **derived** from the code,
  so a route cannot invent prose the browser has no way to translate.
- `ErrorCode` is a union of the registry's keys, so a typo is a compile error
  rather than a string nobody matches.
- `extra` carries safe, non-sensitive metadata a caller needs in order to react
  (`maxBytes`, the missing `ops` on a stale base). Never a secret, never a value
  from configuration.
- Keep the status meaningful: `400` malformed request · `401` not signed in ·
  `403` signed in but not allowed · `404` absent **or not visible to you** ·
  `409` conflicts with what is already there · `413` too large · `415`
  unsupported type · `429` rate-limited · `5xx` our fault.
- Anything genuinely unexpected should be a plain `Error`. Those become a 500
  and are logged; they are not part of the contract.

**Codes are permanent once shipped.** A browser that has not been reloaded is
still matching on the old one.

## Browser side

Never branch on `status` or on `message`. Ask
[`src/app/errorText.ts`](../src/app/errorText.ts):

```ts
toast(errorText(lang, err));
```

- `errorText` maps a code to an i18n key and returns translated text.
- Only codes a person can **act on** are translated. Anything else — a bug, or
  a detail nobody can do anything about — falls back to « Erreur inattendue »
  deliberately, rather than leaking an internal English message.
- Use `isApiCode(err, 'already_a_member')` for the few places that need to
  _branch_ rather than just report.

Adding a translation is two lines: a key in `src/i18n.ts` with `fr` and `en`,
and an entry in `API_TEXT` or `EDIT_TEXT`.

## Edit errors

The same rule applies inside the browser. `EditError` carries an
`EditErrorCode` from [`src/tree/edit.ts`](../src/tree/edit.ts), split into the
refusals a person caused and can undo (translated) and the ones that mean the
caller passed something impossible (a bug, shown generically). `detail` carries
the offending id for logs — it is never shown on its own.

## Testing

Assert on the **code**, never on the message:

```ts
expect(() => addChild(base, 'I2')).toThrow(expect.objectContaining({ code: 'choose_a_family' }));
```

A test that matches prose fails the next time someone rewords a message, which
teaches people to reword nothing.
