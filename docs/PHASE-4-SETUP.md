# North Heights Inventory — Phase 4 (no Cloud Functions)

This version works with **GitHub Pages**, **Firebase Authentication**, **Firestore**, and **Firebase Storage**. It does not deploy Firebase Cloud Functions and does not require Google Cloud IAM or `gcloud` commands. Firebase services are still Google-operated services; this means no separate **Cloud Functions deployment**, not complete independence from Google infrastructure.

## Fixes
- Removed calls to `getSetupStatus` and all other Cloud Functions.
- Removed the Firebase Functions entry from `firebase.json`.
- Replaced account bootstrap with a verified owner email, restricted by Firestore Security Rules.
- Replaced one-time authorization-code redemption with a two-document atomic Firestore write.
- Replaced disposition proposals/approvals, snapshot creation, and test reset with client-side Firestore transactions and strict rule checks.
- Replaced Phase 4 offline sync with Firestore transaction-based reconciliation.
- Improved narrow/split-screen login layout.

## First-time setup (Windows PowerShell)

1. Clone or update:

```powershell
git clone https://github.com/Silly-Cheese/North-Heights-Inventory-System.git
cd North-Heights-Inventory-System
```

Already cloned:

```powershell
git pull origin main
```

2. Enable **Firebase Authentication > Sign-in method > Email/Password**. Under **Authentication > Settings > Authorized domains**, authorize `silly-cheese.github.io`. Set up a Firestore Database and Storage bucket in `nh-inventory-6f359` if needed.

3. Install CLI, then generate a **local** rules file for your owner email:

```powershell
npm.cmd install -g firebase-tools
powershell.exe -ExecutionPolicy Bypass -File .\scripts\configure-owner.ps1
firebase.cmd login
firebase.cmd deploy --only firestore:rules,storage --project nh-inventory-6f359
```

Do not run `firebase.cmd deploy --only functions` or `firebase.cmd functions:secrets:set`. Neither is needed.

`configure-owner.ps1` prompts for your **real email address** and writes an ignored `firestore.local.rules`. Your email is not automatically uploaded to GitHub. Always run this script at least once before deploying Firestore rules. The **owner email is the authorization secret's trust anchor**: it must match the verified email on your Authentication account. The owner email is not a password and must remain controlled by you.

4. In **GitHub > Settings > Pages**, configure **Deploy from a branch**, `main`, `/(root)`.

5. Open https://silly-cheese.github.io/North-Heights-Inventory-System/ (after Pages publishes), choose **Owner setup**, enter the same email and create your password. Firebase sends an email verification. Click the link, then return to the owner form and submit again. The app automatically writes your `authorizedUsers/{uid}` document and a one-time bootstrap marker atomically.

**No manual Firebase Auth creation or manual member document is needed.**

If the owner account already exists from a prior version, use normal Sign in. If you created an Auth account but not its Firestore authorization, use Owner setup with the same signed-in email (after verifying it).

## Invite the inventory collaborator

Sign in as owner → **Settings > Authorization codes** → choose **Inventory collaborator**. You may restrict the code to their email (recommended). The 20-character code is only shown once, expires after about seven days, and can only be redeemed once. The recipient uses **Have a code?**, verifies their email, and submits the form again to finalize registration. For ordinary congregation members, select **Member (read-only)**.

Account registration is secured by an atomic Firestore batch and Security Rules `getAfter()` checks. Codes are stored by SHA-256 hash; only owners may list invitations. An invitation code is not a password substitute; Firebase Authentication and email verification are still required.

## Phase 4 features

### QR room labels
Open Rooms → **Print QR labels** to print all rooms or open one room → **QR label**. Scanning the QR code opens that room after the user signs in. QR generation uses an external library, so generating labels requires internet.

### Safer offline counts
The **Sync Center** shows local adjustments that have not yet been written to Firestore. With the application already open, you can queue counting adjustments while offline. When reconnected, each adjustment is checked in an idempotent Firestore transaction. If the server count changed, the adjustment is marked **Conflict** for manual review and will not overwrite the other member's count. The user can apply the adjustment to a reviewed server count or discard it.

Enable **Trusted device storage** on a personal device if you want pending adjustments to survive a page refresh. Data is stored in browser IndexedDB; anyone with access to that browser profile may be able to inspect it. Do not enable this on shared church computers. Local queue storage is separate from Firestore cache, and it is not end-to-end encryption.

**Limitations:** This is *not* a full offline application. Firebase SDKs and QR/PDF CDN imports may still need a network connection for a fresh, cold start. Offline counts work only after the application and inventory data have already loaded. Item additions, photographs, decisions, and reports are still online-oriented.

### Performance and mobile
- 80-item initial table window with Show More to avoid very long inventory tables.
- Cached per-room item totals instead of recalculating for every card.
- Consolidated rendering on inventory snapshots and faster latest-activity queries.
- Mobile bottom navigation and Sync status indicator.
- Installable manifest and limited public static asset cache (no private inventory caching in the service worker).

## Testing checklist

1. **Login** in an ordinary browser and a narrow split-screen browser.
2. **Owner bootstrap** from a verified owner email (only once).
3. **Inventory invite** with a second verified account; attempt a reused code (must fail).
4. **Read-only Member** account must be denied room/item edits.
5. **Room QR** scan should prompt sign-in and navigate to the correct room.
6. **Two-device counts**: open the same item on both devices; adjust one, then synchronize the older local count. It must show a conflict.
7. **Disconnect internet after loading**: queue +5, reconnect, review Sync Center and confirm a single application.
8. **Delete/restore** an official room and item; test reset must not affect official data.
9. **Approvals/snapshots/reports** should work without a Functions endpoint.
10. **Print labels and reports** on both desktop and mobile.

## Safety and limitations

Firestore Security Rules are the security boundary; do not publish permissive `allow read, write: if true` rules. Do not commit credentials. Firebase Storage photo URLs may contain access tokens that can be shared outside the app.

Without trusted server Functions, recorded activity and snapshots are *operational records*, not tamperproof legal audit logs. Browser-created snapshots may change if data changes during a multi-batch capture, even though the completed snapshot contents cannot be edited by normal app users. Verify reports before relying on them for the building sale.

A previously deployed Cloud Function could still exist in Firebase, even though this version never calls it. If one exists, it requires separate administrative cleanup; do not delete a function without confirming that no other deployed application uses it.

### Problems?
- **Cannot claim owner**: make sure the email exactly matches the one entered into `configure-owner.ps1`, is email-verified, and that updated rules are deployed.
- **Permission denied on invitations**: confirm both users have verified emails and the new rules are deployed.
- **Rules deploy fails**: inspect the precise Firebase CLI error and verify `firestore.local.rules` was generated.
- **Browser still calls cloudfunctions.net**: force refresh (Ctrl+Shift+R), clear the old service worker/cache if needed, and verify your Pages site points to current `main`.
- **CORS warning**: only earlier cached builds used Functions; current version does not call them.
