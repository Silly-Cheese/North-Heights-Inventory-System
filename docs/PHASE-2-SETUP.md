# Phase 2 — Deployment and Owner Bootstrap

**North Heights Church of Christ Inventory**

This guide configures the app so you can **create your own owner account**. The bootstrap operation automatically writes your Firebase Authentication user and your Firestore authorization document. You do **not** need to manually create either record.

## Step 1 — Prepare Firebase

In Firebase Console for project `nh-inventory-6f359`:

1. **Authentication → Sign-in method**: enable **Email/Password**. Do not enable anonymous sign-in.
2. **Authentication → Settings → Authorized domains**: add `silly-cheese.github.io`. Add `localhost` only if testing locally.
3. **Firestore Database**: create your Firestore database if it does not exist.
4. **Storage**: create the Storage bucket if you will use item photos.
5. Ensure the Firebase project has the billing configuration required for 2nd-generation Cloud Functions and Storage. Creating the project alone is not enough.

## Step 2 — Clone or update your repository (PowerShell)

```powershell
git clone https://github.com/Silly-Cheese/North-Heights-Inventory-System.git
cd North-Heights-Inventory-System
npm.cmd install -g firebase-tools
firebase.cmd login
firebase.cmd use nh-inventory-6f359
npm.cmd --prefix functions install
```

If the repository is already cloned, run `git pull origin main` from its directory instead of cloning again. If `firebase.cmd use` reports no selected project, the deploy commands below also specify the project explicitly.

## Step 3 — Generate the private owner bootstrap secret

Run the following in PowerShell to generate a strong random value locally:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
$rng.Dispose()
$secret
```

**Save this value privately in your password manager.** Never put it in GitHub or a public chat. Anyone with this secret can claim ownership before the initial bootstrap is completed.

Set the secret in Firebase:

```powershell
firebase.cmd functions:secrets:set NH_BOOTSTRAP_SECRET --project nh-inventory-6f359
```

When prompted for the value, paste your random secret. It must have at least 20 characters.

## Step 4 — Deploy Phase 2 backend

```powershell
firebase.cmd deploy --only firestore:rules,storage,functions --project nh-inventory-6f359
```

The first Cloud Functions deployment may ask you to enable required Google APIs and can incur usage charges. Approve the necessary APIs through your Firebase/GCP project if prompted. If Storage is not yet configured, initialize it in the Firebase Console before deploying its rules.

This publishes:
- Firestore access rules for owner, inventory collaborator and read-only member.
- Firebase Storage rules for inventory photographs.
- Callable Cloud Functions for owner setup, invitations and member revocation.
- Firestore background functions to record activity and require rechecking when verified inventory changes.

If you see **permission denied**, **API not enabled**, or **billing required**, resolve the specific Firebase Console deployment error before continuing. **Do not** use `allow read, write: if true` rules as a workaround.

## Step 5 — Enable GitHub Pages

In GitHub: **Repository → Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save.**

The intended address is:

https://silly-cheese.github.io/North-Heights-Inventory-System/

GitHub Pages will serve the website; Firebase still handles all protected backend operations.

## Step 6 — Bootstrap YOUR owner account

1. Open the website after the Cloud Functions deployment is successful.
2. Click **Owner setup**.
3. Enter your name, email and your chosen account password.
4. Paste the private bootstrap secret from Step 3.
5. Click **Initialize owner account**.

The app creates your Firebase Authentication account. The callable function then **automatically creates** Firestore `authorizedUsers/<your auth UID>` with:

```json
{
  "uid": "<your Firebase Auth UID>",
  "email": "<your email>",
  "displayName": "<your name>",
  "role": "owner",
  "active": true
}
```

The function also creates `system/bootstrap` as a permanent ownership marker. Both documents are written atomically in a transaction.

If setup fails after your Authentication user was created (for example, because the secret was entered incorrectly), do **not** create another Firebase Authentication user manually. Correct the secret and resubmit using the **same email**; the app reuses your signed-in account.

**Only the first successful bootstrap can create an owner.** Never delete the `system/bootstrap` record casually: it protects the application from being initialized a second time.

## Step 7 — Invite the other inventory worker

After signing in as owner:

1. Go to **Settings → Authorization codes**.
2. Choose **Inventory collaborator (edit/count/verify)**.
3. Optionally specify the person's exact email address to restrict who can redeem the code.
4. Click **Generate authorization code**.
5. Copy the displayed code and send it privately.

The recipient opens the website, chooses **Have a code?**, and enters a name, email, password, and authorization code. The system creates their Authentication account and the Firestore `authorizedUsers/<UID>` document automatically.

Codes are single-use, expire after seven days, and are not stored in plaintext. If you lose one, revoke it and create another.

## Step 8 — Invite congregation members

Repeat Step 7, but choose **Congregation member (read-only)**. These users can view the inventory and export reports but cannot change counts, edit/delete items, or issue authorization codes.

You can revoke pending codes or disable approved member access in Settings.

## Step 9 — Test before official inventory

1. Select **TEST MODE**.
2. In Settings, generate example rooms and items.
3. Try adding/editing/deleting rooms, using Quick Count, and uploading photographs.
4. Have the other inventory worker sign in from a separate browser/device.
5. Assign a room, submit it for review, and have the other worker verify it.
6. Change an item count after verification; confirm the room requires rechecking.
7. Check **Activity**, **Trash** (official-only), CSV exports and printing.
8. Reset TEST inventory once you finish.

Switch to **OFFICIAL** only when you are ready to record the congregation's actual property.

## Important limitations

- Test and official records share one Firebase project, but use separate `workspaces/test` and `workspaces/official` collections.
- Storage photo download URLs are shareable bearer-token links; do not distribute them. Access to the file itself through Firebase Storage rules is restricted, but anyone possessing a tokenized URL can view it.
- Cloud Functions must remain deployed for authorization, activity history and auto-reverification to work.
- Large permanent test deletes happen in batches, not one atomic all-or-nothing transaction.
- The one-time owner bootstrap cannot create an additional owner. Account recovery requires a project administrator.
- This guide describes the system committed to GitHub; deployment is a separate step and has **not** been performed automatically.
