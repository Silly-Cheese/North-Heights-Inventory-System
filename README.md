# North Heights Church of Christ — Inventory Management System

A private, mobile-friendly inventory application for North Heights Church of Christ, hosted on GitHub Pages with Firebase authentication, Firestore, Cloud Functions, and Storage.

## Phase 2

- Self-service registration with one-time authorization codes.
- Three roles: **owner** (full access + invitations), **inventory** (count/create/edit/delete/review), and **member** (read-only).
- **Owner bootstrap** creates both a Firebase Authentication user **and** its `authorizedUsers/{uid}` Firestore document. No manual user/document creation is necessary.
- Authorization codes are generated server-side, stored only as SHA-256 hashes, single-use, and expire after 7 days. Codes can optionally be tied to a specified email address.
- Room assignments, Quick Count (+/- 1, 5, 10), item photographs, independent room verification, live updates, and server-recorded activity.
- Separate Test / Official data namespaces. Test records can be permanently reset; official deletes go to recoverable Trash.
- CSV inventory export and printable views.

**Important:** Phase 2 requires deployment of Firestore Rules, Cloud Storage Rules **and Cloud Functions**. Pushing GitHub Pages only updates the website; it does not deploy the Firebase backend.

## Getting started

See **[Phase 2 Deployment and Owner Bootstrap](docs/PHASE-2-SETUP.md)**.

### Repository and project

- GitHub: https://github.com/Silly-Cheese/North-Heights-Inventory-System
- GitHub Pages site (once enabled): https://silly-cheese.github.io/North-Heights-Inventory-System/
- Firebase project: `nh-inventory-6f359`

### Requirements

- Node.js 22 (needed for the Cloud Functions deployment).
- Firebase CLI installed (`npm.cmd install -g firebase-tools` on Windows).
- Firebase project with billing enabled for Cloud Functions / Storage as required.
- Firebase Authentication Email/Password provider enabled.
- Firestore Database created.
- Firebase Storage bucket created (enable in Firebase Console).
- GitHub Pages branch `main` / `/(root)` configured.

### Permissions

| Feature | Owner | Inventory collaborator | Congregation member |
| --- | --- | --- | --- |
| View rooms and items | Yes | Yes | Yes |
| Add/edit/count items | Yes | Yes | No |
| Create/delete rooms | Yes | Yes | No |
| Assign rooms | Yes | Yes | No |
| Submit/verify rooms | Yes | Yes | No |
| Export and print | Yes | Yes | Yes |
| Create/revoke authorization codes | Yes | No | No |
| Disable user access | Yes | No | No |

### Testing and security notes

- **Never commit your owner bootstrap secret, service-account credentials, or authorization codes.** The Firebase web API key in `src/app.js` is a public client identifier and is not a backend credential.
- Bootstrap is an atomic one-time operation guarded by a high-entropy Firebase Functions secret. There is no first-user-wins privilege escalation.
- Only Firebase Admin SDK functions can grant roles or create/redeem invitations; users cannot edit their own role in Firestore.
- Photo **download URLs are token-bearing links**. Anyone who receives the URL can view that photo even without signing in. Only upload photos suitable for this model; do not share URLs publicly.
- Test and official workspaces have separate Firestore namespaces in the same Firebase project, **not** separate infrastructure projects. Consider a second staging project for future high-risk changes.
- Cloud Functions activity history is operational history, not a tamperproof/legal-grade audit.
- A room in the Official workspace can only be verified by a different collaborator from the submitter. Testing mode permits same-user verification.
- Firestore triggers automatically flag verified rooms for rechecking after item changes.
- Existing records from Phase 1 remain readable; new/edited records support the Phase 2 fields.

## Local site preview

This is a static site; there is no frontend build step:

```powershell
python -m http.server 8080
```

Open http://localhost:8080 and ensure `localhost` is in Firebase Authentication's Authorized domains if needed.

## Project layout

- `index.html` — authentication forms, bootstrap entry, app shell
- `src/app.js` — inventory, collaboration, enrollment, reporting and navigation
- `src/style.css` — base styling
- `src/phase2.css` — Phase 2 UI styling
- `firestore.rules` — role-based access, editable inventory, read-only audit entries
- `storage.rules` — authenticated photo access and upload limits
- `functions/index.js` — owner bootstrap, invitations, account controls, activity triggers
- `docs/PHASE-2-SETUP.md` — deployment and bootstrap steps

## Future roadmap

- More efficient photo handling and authenticated image streaming without tokenized URLs.
- PDF reports and archived immutable inventory snapshots.
- Item transfer workflow and disposition/approval tracking.
- QR room tags and offline counting with conflict resolution.
- Better cleanup and repair tools for very large test datasets.
