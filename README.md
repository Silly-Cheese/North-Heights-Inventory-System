# North Heights Church of Christ — Inventory System

Private inventory system for North Heights Church of Christ. **Hosting: GitHub Pages. Backend: Firebase Authentication, Firestore, Firebase Storage. NO Cloud Functions.**

### Phase 4
- Owner bootstrap via email verification and Firestore security rules; no manual Auth user or per-user Firestore document required.
- One-use authorization codes for Inventory Collaborators and read-only Members; codes expire in about seven days.
- Rooms, items, quantity adjustments, photos, assignments, verification, Trash and Test workspace.
- PDF/CSV exports, disposition proposals and owner approvals, dated inventory snapshots.
- Printable room QR labels.
- Sync Center for queued offline count adjustments with compare-and-review conflict detection.
- Responsive mobile layout, item table windowing, cached room counts, installable app shell.

**[Current setup and testing guide](docs/PHASE-4-SETUP.md)**

**Important:** Before using Owner setup, you must generate `firestore.local.rules` with the email you control, by running `powershell.exe -ExecutionPolicy Bypass -File .\scripts\configure-owner.ps1`, then deploy **only** Firestore and Storage rules.

```powershell
git pull origin main
powershell.exe -ExecutionPolicy Bypass -File .\scripts\configure-owner.ps1
firebase.cmd login
firebase.cmd deploy --only firestore:rules,storage --project nh-inventory-6f359
```

Do not deploy Functions; no IAM/service-agent changes or Google Cloud Console are needed. Firebase itself remains Google-operated.

The site is designed for: https://silly-cheese.github.io/North-Heights-Inventory-System/

**Security notes:** GitHub Pages is public static hosting, but application data is private in Firestore/Storage with restrictive rules. Email verification is required for membership. Owner registration works only with your preconfigured owner email. Test and Official spaces use the same Firebase project but different namespaces. Client-generated snapshots and activity history are operational records, not legally immutable audit evidence.

**Known limitations:** A fully offline cold start is not guaranteed because SDK and PDF/QR resources can be loaded from CDNs. Offline *count adjustments* can be queued after the app loads. Photos use token-bearing download links. Deleting test data is best effort across multiple batches and could leave orphaned photos from older records.

Old Phase 2 and Phase 3 deployment guides have been superseded by [Phase 4 setup](docs/PHASE-4-SETUP.md).
