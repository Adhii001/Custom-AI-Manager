# Custom AI Manager

Use Node 24. Copy `.env.example` to `.env`, enter the platform root URL and provider admin key, then run `npm ci` and `npm run dev`. For production run `npm run build` and `npm start`. Behind an HTTPS reverse proxy set `APP_ORIGIN` to the public HTTPS origin. The production listener uses PORT (default 3000).

Any successfully authenticated platform user has full project access. Each session belongs to one Node server process and expires at JWT expiry, after eight hours, or on restart. Run a single instance for this implementation.

## Platform workflow

The TanStack server posts multipart form data to `/workflow.trigger/insertapikeydetails6af41a4d2edbf` with the platform session cookies and signed-in user's bearer JWT. Read the named fields directly: `id`, `object`, `name`, `value`, `redacted_value`, `created_at`, `revoked_at`, `last_used_at`, `metadata`, and `user_id`. Multipart values are text. Null timestamps are empty strings. The metadata field contains JSON and user_id is also available separately.

A successful HTTP trigger response opens the one-time key dialog, including when the response body is empty. It acknowledges workflow acceptance; storage completion depends on the workflow. An explicit rejection with `{"saved":false,"id":"<provider key ID>"}` triggers revocation. If the request times out, check the platform record by ID before creating a replacement.

After provider revocation succeeds, the server posts multipart fields `action=revoke` and `Key_id` to the same authenticated workflow. The insert workflow records issuance. The provider list supplies current revocation status. Usage shows the provider's returned columns or JSON for unrecognized response shapes.


The workflow maps the provider's `id` form field to the spreadsheet's `Key_id` column. Opening a key row sends multipart `action=getdetails` and `Key_id=<provider key ID>` to the authenticated workflow trigger. The dialog masks the value until the user selects Unhide key. Existing spreadsheet rows need a populated Key_id for lookup.

Signed-in users can read issuance metadata at `GET /api/saved-keys`. Its `data` array contains Name, Date_Created, Status and user_id.
