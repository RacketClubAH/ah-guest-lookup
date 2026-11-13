# Aphrodite Hills Guest Lookup — Local Browser Edition

A simple static GitHub Pages application for the Racket Club reception team. It reads the text-based Protel HMS **Inhouse Board List** PDF inside the browser and saves the extracted guest list in that browser's local storage.

## Important limitation

This edition does **not** use SharePoint, Power Automate, a server or a cloud database. Each computer keeps its own copy in its browser. To use both reception computers, choose one of these simple routines:

- **Easiest:** upload the same morning Rentals PDF on each reception computer.
- **Transfer option:** on computer 1, choose **Download guest data file**. Move that JSON file using an approved company shared folder. On computer 2, choose **Import guest data file**.

The second computer will not update automatically when the first one imports a report.

## Publish on GitHub Pages

1. Download and extract the ZIP.
2. Create a GitHub repository called `ah-guest-lookup`.
3. Upload only `index.html`, `styles.css`, `app.js`, and `README.md` to the repository root. Do not upload real Rentals PDFs, guest data JSON files, screenshots with guest information, or the earlier sample workbook.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch `main` and folder `/(root)`, then save.
7. When GitHub provides the Pages URL, open it in Edge or Chrome on both reception computers.

GitHub Pages is static hosting. Confirm with hotel IT/management that GitHub Pages is approved for this internal reception tool before using it at work. The source files are publicly accessible if you use GitHub Free/public Pages. They contain no guest data.

## Daily use — each computer

1. Open the GitHub Pages website.
2. Choose the morning Protel PDF.
3. Click **Read PDF**.
4. Check the report date, extracted count and preview.
5. Only when validation says **Ready to save**, click **Save latest list here**.
6. Search for a guest by surname or room.
7. Repeat on the second computer, or transfer an exported JSON data file via an approved company location.

The browser storage is tied to the browser profile on that computer. It can be cleared by browser/site-data cleanup, so do not treat it as the official hotel record. A guest list exported to JSON contains personal information and must be protected like the original Rentals report.

## PDF handling and validation

- PDF.js reads the selected file in the browser; the app does not upload the PDF to GitHub or an app server.
- The parser is designed for the text-based Protel HMS Inhouse Board List sample supplied during development.
- It is not OCR. Scanned/image-only PDFs will not work.
- The app blocks saving if it cannot find the report's `Total Rooms` value, if the extracted count does not match, if required fields are missing, or if room codes repeat.
- Review the preview carefully before saving. The report's `Listed in report` status means the name appears in the most recent report imported on that computer; it does not prove physical presence at the resort.

## Troubleshooting

- **Blank page / module error:** the company network may be blocking jsDelivr. Ask IT to allow `cdn.jsdelivr.net` or host the pinned PDF.js library with the site after approval.
- **No rows / incorrect count:** check the PDF is the Protel Inhouse Board List and contains selectable text. Do not save an unvalidated report.
- **Report saved on one PC but not the other:** this is expected. Upload the PDF on the second PC or use the JSON export/import transfer.
- **List disappears:** check whether browser site data was cleared or a different browser profile was used.

## Privacy

Do not commit guest data or PDFs to GitHub. This app keeps data in browser local storage and reads the PDF locally. Use only on hotel-approved devices and networks, and obtain hotel approval before operational use.
