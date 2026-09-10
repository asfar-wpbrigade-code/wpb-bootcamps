/**
 * The public status list endpoint.
 *
 * `auth: false`, and it has to be: this is the URL named by
 * `credentialStatus.statusListCredential` in every credential we issue, and
 * the whole point of it is that a verifier who has never heard of us - an
 * employer, a university, another wallet - can fetch it and check a
 * revocation without an account here. It exposes one bitstring and no names.
 *
 * Kept separate from the content type's own `/revocation-lists` routes, which
 * are the authenticated CRUD surface for managing lists. This one is a fixed,
 * read-only projection of a single row, and its path is embedded in
 * credentials in the wild - it must not move with the CRUD routes.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/status-lists/:id',
      handler: 'revocation-list.statusListCredential',
      config: {
        auth: false,
      },
    },
  ],
}
