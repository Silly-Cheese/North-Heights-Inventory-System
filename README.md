# North Heights Church of Christ — Inventory Management System

A private, mobile-friendly inventory application for North Heights Church of Christ.

**Hosting:** GitHub Pages. **Backend:** Firebase Authentication and Cloud Firestore.

## Initial setup
1. In Firebase Console, enable **Authentication > Sign-in method > Email/Password**. Create the two authorized accounts under **Authentication > Users** (do not enable public sign-up).
2. In **Firestore Database**, create the database and publish the rules in `firestore.rules`. Rules must be applied before the app can be used.
3. For each approved Firebase Authentication user, create a Firestore document `authorizedUsers/<USER_UID>` with fields `displayName` (string) and `role` (string: `admin` or `member`). Make one admin and the other member. Both can inventory and delete records.
4. In Firebase Authentication > Settings > Authorized domains, add `silly-cheese.github.io` if not already listed.
5. In this repository, choose **Settings > Pages > Build and deployment > Deploy from a branch**, select **main** and **/(root)**, then save.
6. The eventual URL will be https://silly-cheese.github.io/North-Heights-Inventory-System/ (after Pages publishes).

## Test vs official inventory
The app has two independent Firestore workspaces: `workspaces/test/` and `workspaces/official/`. The testing workspace permits permanent deletion and a reset button. The official workspace uses a recoverable Trash. Sample records exist **only** if you choose to generate them in Test mode.

These are separate **data namespaces inside one Firebase project**, not separate Firebase staging/production projects. If stricter infrastructure isolation becomes necessary, create a second Firebase project for staging.

## Access control and configuration
- The Firebase web configuration in `src/app.js` is a public browser configuration, **not** a substitute for database access rules. Do not commit service-account keys or other secrets.
- Only accounts whose UID is listed in Firestore's `authorizedUsers` collection may read or write rooms/items.
- GitHub Pages is public static hosting; never place private inventory information into the repository itself.
- Firebase Authentication authorized domains and Firestore rules must be configured manually in Firebase Console.
- For PowerShell CLI rule deployment: `npm.cmd install -g firebase-tools`, then `firebase.cmd login` and `firebase.cmd deploy --only firestore:rules --project nh-inventory-6f359`.

## Current functionality (Phase 1)
Private sign-in, two separate workspaces, room creation and editing, item creation and editing, quick quantity adjustments, category and condition fields, item search, room progress, PDF-ready printing and CSV exports, recoverable official Trash, permanent test deletion, test reset, and sample data.

## Roadmap
Photos and Storage rules, collaborative room assignment, independent verification, QR codes, advanced PDF reports, detailed disposition approvals, offline conflict handling and audit trail.

## Development
No build step or package install needed: the site uses native ES modules with the Firebase 13.1.0 CDN. For local testing, run a static HTTP server (`python -m http.server 8080`) and open http://localhost:8080. Avoid opening `index.html` using `file://`.
