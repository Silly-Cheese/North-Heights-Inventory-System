# First-time rules setup (no Cloud Functions or Google Cloud IAM commands).
# This script generates a local Firestore rules file with the OWNER email,
# rather than asking you to manually create Firebase Authentication or user documents.
$ErrorActionPreference = "Stop"
$project = "nh-inventory-6f359"
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root "firestore.rules"
$output = Join-Path $root "firestore.local.rules"
if (!(Test-Path $template)) { throw "Run from a clone containing firestore.rules." }
$email = (Read-Host "Enter the OWNER email you personally control").Trim().ToLowerInvariant()
if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or $email.Contains("'")) {
  throw "That is not a valid owner email address."
}
$content = Get-Content -LiteralPath $template -Raw -Encoding UTF8
if (!$content.Contains("__OWNER_EMAIL__")) {
  throw "Template missing owner email placeholder. Download a fresh repository copy."
}
$content = $content.Replace("__OWNER_EMAIL__", $email)
[System.IO.File]::WriteAllText($output, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "Local rules created at: $output"
Write-Host "Owner email: $email"
Write-Host "Do not commit firestore.local.rules to GitHub."
Write-Host ""
Write-Host "Next:"
Write-Host "  firebase.cmd login"
Write-Host "  firebase.cmd deploy --only firestore:rules,storage --project $project"
