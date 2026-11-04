# North Heights Inventory — Report & Interface Refresh

## Redesigned records

The downloaded PDF now includes:

1. A North Heights Church of Christ letterhead and TEST/OFFICIAL workspace identification
2. Report title, data source, creation date, and a summary of rooms, item types and units
3. Columnar tables with wrapped text rather than repeated field-name paragraphs
4. Room group headings, consistent row shading, and repeated headers across pages
5. Page X of Y footers and an internal-record disclaimer
6. Prepared-by / Reviewed-by review fields (blank for authorized signers)

PDF orientation adapts to each report: full and disposition registers use landscape, focused single-room and condition reports use portrait. Notes are wrapped, including when they require continuation pages. CSV continues to export all existing fields; the PDF prioritizes legibility.

## App interface

The site now has a consistent visual theme, readable dashboard cards, clearer room and item tables, improved controls and modal forms, a responsive report-builder layout, better snapshot list, and mobile-specific spacing.

The visual redesign does **not** change Firebase rules or data. GitHub Pages deploys these static files from `main`; do not run a Firebase Functions deployment.

## Checks before relying on a report

- In **Test Mode**, create several rooms and items with both short and long notes.
- Export Full Inventory PDF, Room Inventory PDF, Condition Summary PDF and Disposition Register PDF.
- Verify that each report has its workspace and source clearly identified.
- Confirm that quantities, item names, conditions and notes match Firestore records.
- For a long inventory, verify that table headers reappear and pages are numbered correctly.
- Open the report in a PDF viewer and print a sample page.
- Check PDF readability on a small display and at normal print scale.
- Save a test snapshot, change the live count, and confirm that snapshot PDF reflects the older count.
- Compare CSV export with the PDF; the CSV is intentionally more detailed.
- Repeat the report preview on a phone or narrow browser window.

PDF rendering depends on the jsPDF package loaded over HTTPS. An internet connection is needed to fetch the library if it is not already in the browser cache.

**Important:** A working inventory report and its review signature lines are not automatic legal approval for selling, donating or disposing of congregation property.

## Implementation

- `src/report-pdf.js`: PDF layout and pagination
- `src/phase3.js`: report data, PDF export, browser printing, refreshed Reports/Snapshots screen
- `src/redesign.css`: shared desktop and mobile visual styling
- `tests/report-pdf.test.mjs`: deterministic mocked jsPDF pagination and data-preservation tests

Use `node --test tests/report-pdf.test.mjs` to run the new PDF-layout unit checks locally. An end-to-end browser test of live Firebase data and jsPDF export is still needed before relying on these records for the building sale.
