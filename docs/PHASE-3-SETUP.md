# Phase 3 — Reporting, Disposition Approvals & Inventory Snapshots

North Heights Church of Christ — Inventory Management System

## What's included

This phase adds two new application sections: **Dispositions** and **Reports**. There is no new public registration; the Owner/Inventory/Member roles from Phase 2 remain in place.

### Dispositions

A collaborator opens **Dispositions** and selects **Propose** for an item. They can allocate any number of units (not exceeding the actual quantity) to:

- Retain / relocate
- Include with property
- Donate
- Sell separately
- Dispose

For instance, a quantity of 24 chairs may have 10 retained, 8 included with the building, and 6 donated. Any unassigned units stay clearly marked as **Unallocated**.

The proposal is *not* an approval. Only the **owner** sees **Approve** or **Reject**. Rejection requires a reason; approval accepts an optional note. The system preserves decision-history events when a proposal is resubmitted. Changing item quantity, room, or deletion state after approval marks that proposal **Needs review**. If a proposal is pending and the item changes, approval is denied until resubmission.

For the Official workspace, an approved disposition requires the item's room to be **Verified**. A second person should review room counts as in Phase 2.

> IMPORTANT: Approval in the app is an internal tracking record only. It does not replace required congregational approvals, legal authorization, or the written property sale contract. Do not move, donate, sell or dispose of items based solely on a status in the app.

### Reports

Open **Reports** and choose:

1. **Full inventory** — room, item, category, quantity, condition, notes and room status.
2. **Room inventory** — choose a room filter, then download or print a room-specific report.
3. **Condition summary** — number of item types and total units, grouped by condition.
4. **Disposition register** — proposed/approved status, quantities by disposition, unallocated count, reasons, reviewer UID.

Data source options are the **live inventory** or a completed dated **snapshot**. Export PDF, download a spreadsheet-friendly CSV or open the browser print dialog. The CSV exporter prefixes values that may otherwise be interpreted as spreadsheet formulas.

PDF report generation currently loads jsPDF from jsDelivr over HTTPS. An internet connection is needed the first time that module loads.

### Inventory snapshots

On Reports, click **Save snapshot**. Choose a name and either:

- **Draft**: a dated frozen copy of working inventory.
- **Final**: a dated frozen copy intended as the verified record.

Only the **owner** can save snapshots of the Official inventory. In Official mode, **Final** requires every active room to be Verified, with no outstanding proposed or stale dispositions. The Test workspace permits draft/final snapshots for experiments, and authorized inventory workers may delete Test snapshots.

A snapshot freezes the room, item, and disposition data at creation. It remains available to selected report types even after live records change. Official snapshots cannot be changed or deleted through normal client operations. It is not a cryptographic signature and a project administrator could still change the underlying database.

**Snapshot limits:** currently 250 rooms, 2,000 items, 2,000 decisions per snapshot. Incomplete snapshot builds remain marked Failed for diagnosis.

## Deployment: Windows PowerShell

### 1. Update local files

```powershell
cd North-Heights-Inventory-System
git pull origin main
```

If you have never cloned the repository:

```powershell
git clone https://github.com/Silly-Cheese/North-Heights-Inventory-System.git
cd North-Heights-Inventory-System
```

### 2. Install CLI and function dependencies

```powershell
npm.cmd install -g firebase-tools
firebase.cmd login
npm.cmd --prefix functions install
```

Use Node.js 22 for the Functions package configuration.

### 3. Deploy Firebase backend

```powershell
firebase.cmd deploy --only firestore:rules,storage,functions --project nh-inventory-6f359
```

If this is your first backend deployment, follow [Phase 2 setup](PHASE-2-SETUP.md) first. Enable the Email/Password sign-in provider, create Firestore and Storage, configure billing where needed, and set your private `NH_BOOTSTRAP_SECRET`.

The added Phase 3 callable functions are:

- `proposeDisposition`
- `reviewDisposition`
- `createInventorySnapshot`
- `deleteTestSnapshot`
- `resetTestWorkspace`

The already-established item-change trigger also flags approved dispositions needing re-review after certain item changes.

### 4. GitHub Pages

The static site is committed to the `main` branch. If GitHub Pages is configured for `main` and `/(root)`, the expected URL is:

https://silly-cheese.github.io/North-Heights-Inventory-System/

GitHub Pages does **not** deploy Firebase Functions or Security Rules. These remain separate deployment steps.

## Test checklist

Start in **TEST MODE**. Use a test account with owner privileges and a separate inventory collaborator account if available.

1. Create a room, add a grouping of 24 folding chairs, and mark the room ready for review.
2. Have a different inventory collaborator verify the room.
3. Open **Dispositions**. Propose 10 retained, 8 included with property, and 6 donated; confirm 0 unallocated.
4. Use the owner account to approve the proposal. Confirm the status shows **Approved** and the history includes the review.
5. Change chair count to 25. Confirm the approved decision becomes **Needs review** and the room needs fresh verification.
6. Re-propose allocations and verify again.
7. Create draft and final Test snapshots. Change live quantities afterward, then export reports from the historical snapshot and verify the earlier counts are retained.
8. Export a full inventory PDF and CSV, a filtered room PDF, a condition summary, and the property disposition register.
9. Try the application using a **read-only Member** account. It must be unable to propose, approve, edit, or delete.
10. Use **Reset test data** in Settings and type `RESET TEST` when prompted. Verify that rooms, items, photos, dispositions, events, and snapshots are removed from Test while Official data remains intact.

Before a real Final Official snapshot, verify all active rooms and resolve all proposed or stale dispositions. The owner must save the final record.

## Troubleshooting

- **Permission denied:** publish updated Firestore Rules and confirm the account's `authorizedUsers` record is active.
- **Function not found:** deploy Functions to the correct project and region (`us-central1`).
- **Approval rejected:** verify the room, confirm item quantity/location hasn't changed since proposal, then resubmit.
- **Final snapshot failed:** verify every active room and resolve proposed/Needs Review dispositions.
- **PDF doesn't download:** confirm the browser can access the jsPDF CDN and try again online.
- **Storage upload denied:** publish Storage Rules and check user role, image MIME type and file size.
- **Test data persists after resetting:** check Cloud Function logs; the reset requires the server-side function and is not performed by GitHub Pages alone.

## Preservation and privacy

Be thoughtful about whether sensitive congregation records or personal notes should be stored in item descriptions; authorized congregation Members can read and export the records. PDF/CSV downloads are local browser files, so share carefully. Never publish the private inventory data to a public GitHub repository. File photos obtained via Firebase download URLs may be opened by anyone possessing the URL.

All code has been written and statically checked, but **deployment and live browser/emulator validation are still required** before production use.
