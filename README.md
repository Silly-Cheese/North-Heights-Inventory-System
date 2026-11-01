# North Heights Church of Christ — Inventory Management System

Private inventory system for North Heights Church of Christ, hosted on GitHub Pages with Firebase Authentication, Firestore, Storage and Cloud Functions.

## Phase 3: reporting, property decisions and records

**Implemented in the repository (backend deployment and live testing still required):**

- **Reports**: PDF downloads, CSV exports, and print-friendly documents. Report modes: full inventory, room inventory, condition summary, and property disposition register. Use live data or a frozen snapshot.
- **Disposition proposals**: inventory workers can allocate quantities of a single item among retain/relocate, include with property, donate, sell separately and dispose. Partial allocations allowed; unallocated quantity is explicit.
- **Approvals**: only the owner approves or rejects proposed dispositions, with optional approval notes and mandatory rejection reasons. Prior review events remain recorded when a proposal is revised.
- **Automatic review warnings**: changing item count, location or deletion state after approval flags the disposition as needing review.
- **Snapshots**: server-generated dated frozen copies of rooms, items and property dispositions, with a draft/final designation. Official snapshots are owner-only. Final official snapshots require every active room verified and no unresolved disposition proposals. Original official snapshots cannot be changed or deleted through the app.
- **Test workspace reset**: wipes Test rooms, items, pictures, decisions, events and snapshots through an authenticated callable backend function. Official records remain untouched.
- **Mobile navigation**: additional Dispositions and Reports tabs.

### Phase 3 setup and walkthrough

**[Phase 3 deployment and testing guide](docs/PHASE-3-SETUP.md)**

### Previous setup

**[Phase 2 account bootstrap and invitation guide](docs/PHASE-2-SETUP.md)**

## Important access roles

| Permission | Owner | Inventory collaborator | Congregation member |
| --- | --- | --- | --- |
| View inventories/reports | Yes | Yes | Yes |
| Create/edit/count inventory | Yes | Yes | No |
| Propose item disposition | Yes | Yes | No |
| Approve or reject dispositions | Yes | No | No |
| Save official snapshots | Yes | No | No |
| Save/delete Test snapshots | Yes | Yes | No |
| Manage invitations and users | Yes | No | No |

## Security and preservation notes

- Property disposition is a **record of internal intent and approval**, not proof of ownership transfer or authorization under the building sale contract. Consult North Heights leadership before physically removing or disposing of any item.
- Client writes to `dispositions`, `dispositionEvents`, `snapshots` and snapshot `entries` are denied by Firestore Security Rules; these records can only be written by authorized Cloud Functions.
- Approval checks the item count and location at the moment of review; in the **Official** workspace the room must be verified.
- Official snapshots are frozen from ordinary app users, **not** legally immutable or tamperproof against Firebase project administrators. The system stores dated data copies, not cryptographically signed evidence.
- Photos use token-bearing download URLs, which may be opened by anyone who obtains a link. Avoid sharing photo URLs publicly.
- Report PDF downloads use the third-party jsPDF library loaded from a CDN. For full offline support, bundle a locally audited dependency in a future iteration.
- GitHub Pages deploys only the static frontend. Firebase Functions, Firestore Rules and Storage Rules must be deployed separately.
- `workspaces/test` and `workspaces/official` are separate data namespaces within one Firebase project, not fully separate Firebase environments.

## Deployment (Windows PowerShell)

Run from your local clone:

```powershell
git pull origin main
npm.cmd --prefix functions install
firebase.cmd login
firebase.cmd deploy --only firestore:rules,storage,functions --project nh-inventory-6f359
```

**First-time owner setup:** see the Phase 2 guide for enabling Email/Password Auth and configuring `NH_BOOTSTRAP_SECRET` through Firebase Secret Manager. Do not commit this private value.

## Architecture

- `index.html`: entry/authentication
- `src/app.js`: rooms, items, account management, collaboration, navigation
- `src/phase3.js`: reports, disposition workflows, snapshots, PDF/CSV/printing
- `src/style.css`, `src/phase2.css`, `src/phase3.css`: responsive styling
- `functions/index.js`: trusted account, disposition approval and snapshot APIs; update triggers
- `firestore.rules`: backend access control
- `storage.rules`: photo storage rules
- `docs/PHASE-2-SETUP.md`: bootstrap/invitations
- `docs/PHASE-3-SETUP.md`: Phase 3 deployment and walkthrough

### Further work (Phase 4)

QR room labels, offline count queue with clear conflict resolution, advanced bulk editing, performance improvements, security regression tests, signed final records, formal disposition execution logs, and full end-to-end testing with Firebase Emulator Suite.
