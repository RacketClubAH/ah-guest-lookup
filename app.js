
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";

const PDFJS_VERSION = "4.10.38";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "ahGuestLookupLocalV1";

let currentGuests = [];
let reportMeta = null;
let pendingImport = null;
let toastTimer = null;

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

function showNotice(message, type = "neutral") {
  const el = $("parseStatus");
  el.className = `notice notice-${type}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideNotice() {
  $("parseStatus").classList.add("hidden");
}

function formatDate(value) {
  if (!value) return "—";

  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(d.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// --------------------------------------------------
// LOCAL STORAGE
// --------------------------------------------------

function loadLocalData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");

    if (!saved || !Array.isArray(saved.guests)) return;

    currentGuests = saved.guests;
    reportMeta = saved.meta || null;

  } catch (error) {
    console.warn("Could not read locally stored guest list", error);
    currentGuests = [];
    reportMeta = null;
  }

  updateDashboard();
}

function saveLocalData(guests, meta) {
  const payload = { version: 1, guests, meta };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  } catch (error) {
    throw new Error(
      "The browser could not save the guest list. Check available browser storage or ask IT whether local site storage is blocked."
    );
  }

  currentGuests = guests;
  reportMeta = meta;

  updateDashboard();
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

function updateDashboard() {
  const hasGuests = currentGuests.length > 0;

  $("searchInput").disabled = !hasGuests;
  $("exportButton").disabled = !hasGuests;

  $("reportDateLabel").textContent =
    reportMeta?.reportDate ? formatDate(reportMeta.reportDate) : "Not imported";

  const importedText = reportMeta?.importedAt
    ? `Saved ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(reportMeta.importedAt))}`
    : "Import today's Rentals PDF to begin";

  $("reportCountLabel").textContent = hasGuests
    ? `${currentGuests.length} rooms · ${importedText}`
    : importedText;

  renderSearch();
}

function renderSearch() {
  const query = $("searchInput").value.trim().toLocaleLowerCase();
  const area = $("resultList");

  area.replaceChildren();

  if (!currentGuests.length) {
    $("emptyState").classList.remove("hidden");
    $("resultSummary").classList.add("hidden");
    return;
  }

  $("emptyState").classList.add("hidden");

  if (!query) {
    $("resultSummary").classList.remove("hidden");

    $("resultSummary").textContent =
      `${currentGuests.length} rooms in the latest imported report. Start typing to search.`;

    return;
  }

  const matches = currentGuests.filter(r =>
    String(r.guestName || "").toLocaleLowerCase().includes(query) ||
    String(r.room || "").toLocaleLowerCase().includes(query)
  ).sort((a, b) =>
    String(a.guestName).localeCompare(String(b.guestName))
  );

  $("resultSummary").classList.remove("hidden");

  $("resultSummary").textContent = matches.length
    ? `${matches.length} matching room${matches.length === 1 ? "" : "s"} · Listed in the latest Rentals report`
    : `No match for “${$("searchInput").value.trim()}” in the latest Rentals report`;

  if (!matches.length) {
    const card = document.createElement("div");

    card.className = "empty-state panel";

    card.innerHTML = `
      <div class="empty-icon">×</div>
      <h3>Not found in latest report</h3>
      <p>This name or room does not appear in the most recently imported Rentals list on this computer.</p>
    `;

    area.append(card);
    return;
  }

  for (const r of matches) {
    const card = document.createElement("article");

    card.className = "guest-card";

    card.innerHTML = `
      <div class="guest-main">
        <div class="guest-name">${escapeHtml(r.guestName)}</div>
        <div class="guest-meta">Listed in latest imported Rentals report</div>
      </div>

      <div class="guest-details">
        <div class="detail">
          <span>Room</span>
          <strong>${escapeHtml(r.room)}</strong>
        </div>

        <div class="detail">
          <span>Property</span>
          <strong>${escapeHtml(r.propertyType || "—")}</strong>
        </div>

        <div class="detail">
          <span>Arrival</span>
          <strong>${escapeHtml(formatDate(r.arrivalDate))}</strong>
        </div>

        <div class="detail">
          <span>Departure</span>
          <strong>${escapeHtml(formatDate(r.departureDate))}</strong>
        </div>
      </div>

      <span class="status-pill status-good">Listed in report</span>
    `;

    area.append(card);
  }
}

// --------------------------------------------------
// PROTEL PDF PARSER
// --------------------------------------------------

function groupItemsIntoLines(items) {
  const clean = items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      text: i.str.trim(),
      x: Number(i.transform?.[4] || 0),
      y: Number(i.transform?.[5] || 0)
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];

  for (const item of clean) {
    let line = lines.find(l => Math.abs(l.y - item.y) <= 1.8);

    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }

    line.items.push(item);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }

  return lines.sort((a, b) => b.y - a.y);
}

function isRoomCode(value) {
  return /^(?=.*\d)[A-Z0-9]{3,6}$/i.test(value);
}

const NON_NAME_TOKENS = new Set([
  "REP", "RR", "RB", "RF", "LV0", "VIP", "TERMS"
]);

function lineRoom(line) {
  return line.items.find(i => i.x < 55 && isRoomCode(i.text));
}

function guestTokens(line) {
  return line.items.filter(i =>
    i.x >= 140 &&
    i.x < 245 &&
    !NON_NAME_TOKENS.has(i.text.toUpperCase())
  );
}

function parseReportDate(allText) {
  const m = allText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  if (!m) return null;

  return new Date(Date.UTC(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1])
  ));
}

function inferArrivalDate(dayMonth, reportDate) {
  const [day, month] = dayMonth.split("/").map(Number);

  const candidates = [
    reportDate.getUTCFullYear() - 1,
    reportDate.getUTCFullYear(),
    reportDate.getUTCFullYear() + 1
  ]
    .map(y => new Date(Date.UTC(y, month - 1, day)))
    .filter(d => d <= reportDate);

  return candidates.sort((a, b) => b - a)[0] || null;
}

function inferDepartureDate(dayMonth, arrivalDate) {
  const [day, month] = dayMonth.split("/").map(Number);

  const candidates = [
    arrivalDate.getUTCFullYear() - 1,
    arrivalDate.getUTCFullYear(),
    arrivalDate.getUTCFullYear() + 1
  ]
    .map(y => new Date(Date.UTC(y, month - 1, day)))
    .filter(d => d >= arrivalDate);

  return candidates.sort((a, b) => a - b)[0] || null;
}

// --------------------------------------------------
// FOOTER TOTAL EXTRACTION - FIXED
// --------------------------------------------------

function extractTotalRooms(pages) {

  for (const lines of pages) {

    for (const line of lines) {

      const visualLineText = line.items
        .slice()
        .sort((a, b) => a.x - b.x)
        .map(item => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const totalMatch = visualLineText.match(
        /\bTotal\s+Rooms\s*:?\s*(\d+)\b/i
      );

      if (totalMatch) {
        return Number(totalMatch[1]);
      }
    }
  }

  return null;
}

// --------------------------------------------------
// MAIN PDF EXTRACTION
// --------------------------------------------------

async function parseProtelPdf(file) {

  const data = new Uint8Array(await file.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages = [];
  const allText = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {

    const page = await pdf.getPage(pageNo);

    const content = await page.getTextContent();

    allText.push(...content.items.map(i => i.str || ""));

    pages.push(groupItemsIntoLines(content.items));
  }

  const text = allText.join(" ");

  const reportDate = parseReportDate(text);

  // Read the footer based on its visual position.
  // This handles Protel's separated text fragments.
  let expectedTotal = extractTotalRooms(pages);

  // Fallback for different Protel PDF versions.
  if (expectedTotal === null) {

    const totalMatch = text.match(
      /\bTotal\s+Rooms\s*:?\s*(\d+)\b/i
    );

    if (totalMatch) {
      expectedTotal = Number(totalMatch[1]);
    }
  }

  if (!reportDate) {
    throw new Error(
      "I could not find the report date (dd/mm/yyyy). Make sure this is the Protel Inhouse Board List PDF."
    );
  }

  const rows = [];

  for (const lines of pages) {

    const roomLines = lines
      .map((line, index) => ({
        line,
        index,
        roomItem: lineRoom(line)
      }))
      .filter(x => x.roomItem);

    const pageRows = roomLines.map(entry => ({
      room: entry.roomItem.text.toUpperCase(),
      y: entry.line.y,
      sourceLine: entry.line,
      nameLines: [entry.line],
      propertyType: entry.line.items.find(i =>
        i.x >= 55 && i.x < 140
      )?.text || ""
    }));

    // Attach wrapped guest-name lines to their room.
    for (const line of lines) {

      if (lineRoom(line)) continue;

      const names = guestTokens(line);

      if (!names.length) continue;

      let best = null;

      for (const row of pageRows) {

        const distance = Math.abs(row.y - line.y);

        if (
          distance <= 10.5 &&
          (!best || distance < best.distance)
        ) {
          best = { row, distance };
        }
      }

      if (best) {
        best.row.nameLines.push(line);
      }
    }

    for (const row of pageRows) {

      const nameItems = row.nameLines
        .flatMap(line =>
          guestTokens(line).map(i => ({
            ...i,
            y: line.y
          }))
        )
        .sort((a, b) => b.y - a.y || a.x - b.x);

      const guestName = nameItems
        .map(i => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const dateItems = row.sourceLine.items
        .filter(i =>
          i.x >= 490 &&
          /^\d{1,2}\/\d{1,2}$/.test(i.text)
        )
        .sort((a, b) => a.x - b.x);

      const arrivalText = dateItems[0]?.text;
      const departureText = dateItems[1]?.text;

      const arrival = arrivalText
        ? inferArrivalDate(arrivalText, reportDate)
        : null;

      const departure = departureText && arrival
        ? inferDepartureDate(departureText, arrival)
        : null;

      rows.push({
        guestName,
        room: row.room,
        propertyType: row.propertyType,
        arrivalDate: arrival ? isoDate(arrival) : "",
        departureDate: departure ? isoDate(departure) : "",
        reportDate: isoDate(reportDate)
      });
    }
  }

  // ------------------------------------------------
  // VALIDATION
  // ------------------------------------------------

  const errors = [];

  if (expectedTotal !== null && rows.length !== expectedTotal) {
    errors.push(
      `The PDF says ${expectedTotal} total rooms, but ${rows.length} rows were extracted.`
    );
  }

  for (const r of rows) {

    if (
      !r.guestName ||
      !r.room ||
      !r.propertyType ||
      !r.arrivalDate ||
      !r.departureDate
    ) {
      errors.push(
        `Incomplete row: ${r.room || "unknown room"} (${r.guestName || "guest name missing"}).`
      );
    }
  }

  const rooms = rows.map(r => r.room);

  if (new Set(rooms).size !== rooms.length) {
    errors.push("Duplicate room codes were detected in the extracted rows.");
  }

  if (!rows.length) {
    errors.push(
      "No room rows were found. This may be a scanned PDF or a different report layout."
    );
  }

  return {
    rows,
    reportDate: isoDate(reportDate),
    expectedTotal,
    errors,
    pageCount: pdf.numPages
  };
}

// --------------------------------------------------
// IMPORT PREVIEW
// --------------------------------------------------

function renderPreview(result) {

  pendingImport = result;

  $("previewBlock").classList.remove("hidden");

  $("previewTitle").textContent =
    `Import preview · ${result.rows.length} rooms`;

  $("previewDetails").textContent =
    `Report date: ${formatDate(result.reportDate)} · ${result.pageCount} PDF page(s)`;

  const good =
    result.errors.length === 0 &&
    result.expectedTotal !== null &&
    result.expectedTotal === result.rows.length;

  $("validationPill").textContent =
    good ? "Ready to save" : "Check required";

  $("validationPill").className =
    `status-pill ${good ? "status-good" : "status-bad"}`;

  const messages = $("validationMessages");

  messages.replaceChildren();

  if (good) {

    messages.textContent =
      `Validation passed: the PDF total (${result.expectedTotal}) matches the extracted rows. Review the sample rows before saving.`;

  } else {

    for (const error of result.errors) {

      const p = document.createElement("div");

      p.className = "error-line";

      p.textContent = `• ${error}`;

      messages.append(p);
    }

    if (result.expectedTotal === null) {

      const p = document.createElement("div");

      p.className = "error-line";

      p.textContent =
        "• A Total Rooms value was not found. This version will not save a report unless the total can be verified.";

      messages.append(p);
    }
  }

  const body = $("previewRows");

  body.replaceChildren();

  for (const row of result.rows.slice(0, 12)) {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(row.guestName)}</td>
      <td>${escapeHtml(row.room)}</td>
      <td>${escapeHtml(row.propertyType)}</td>
      <td>${escapeHtml(formatDate(row.arrivalDate))}</td>
      <td>${escapeHtml(formatDate(row.departureDate))}</td>
    `;

    body.append(tr);
  }

  if (result.rows.length > 12) {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td colspan="5" class="small-muted">
        Showing the first 12 of ${result.rows.length} extracted rows.
      </td>
    `;

    body.append(tr);
  }

  $("publishButton").disabled = !good;
}

// --------------------------------------------------
// READ PDF
// --------------------------------------------------

async function readPdf() {

  const file = $("pdfInput").files?.[0];

  if (!file) return;

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showNotice("Please choose a PDF file.", "error");
    return;
  }

  $("parseButton").disabled = true;

  showNotice(
    "Reading the PDF in this browser. The file is not being uploaded…",
    "neutral"
  );

  try {

    const result = await parseProtelPdf(file);

    renderPreview(result);

    if (result.errors.length || result.expectedTotal === null) {

      showNotice(
        "The report did not pass validation. Do not save it until the extraction is corrected.",
        "error"
      );

    } else {

      showNotice(
        "PDF read successfully. Review the preview before saving.",
        "success"
      );
    }

  } catch (error) {

    console.error(error);

    showNotice(error.message || String(error), "error");

  } finally {

    $("parseButton").disabled =
      !$("pdfInput").files?.length;
  }
}

// --------------------------------------------------
// SAVE IMPORT
// --------------------------------------------------

function saveCurrentImport() {

  if (
    !pendingImport ||
    pendingImport.errors.length ||
    pendingImport.expectedTotal !== pendingImport.rows.length
  ) {
    return;
  }

  const previousDate = reportMeta?.reportDate;

  if (
    previousDate &&
    pendingImport.reportDate < previousDate
  ) {

    const proceed = confirm(
      `This PDF is older than the report already saved on this computer (${formatDate(previousDate)}). Replace the newer list with this older report?`
    );

    if (!proceed) return;
  }

  const yes = confirm(
    `Save ${pendingImport.rows.length} rooms from the ${formatDate(pendingImport.reportDate)} report on this computer?\n\nThis replaces the previous locally saved list. It does not update the other reception computer.`
  );

  if (!yes) return;

  const meta = {
    reportDate: pendingImport.reportDate,
    importedAt: new Date().toISOString(),
    sourceFileName: $("pdfInput").files?.[0]?.name || "Protel PDF",
    roomCount: pendingImport.rows.length
  };

  try {

    saveLocalData(pendingImport.rows, meta);

    pendingImport = null;

    $("previewBlock").classList.add("hidden");

    $("fileName").textContent = "No file selected";

    $("pdfInput").value = "";

    showNotice(
      `Saved ${meta.roomCount} guest-room records on this computer.`,
      "success"
    );

    showToast("Guest list saved on this computer.");

  } catch (error) {

    showNotice(error.message || String(error), "error");

    showToast("Could not save guest list.");
  }
}

// --------------------------------------------------
// EXPORT / IMPORT BETWEEN COMPUTERS
// --------------------------------------------------

function downloadJson() {

  if (!currentGuests.length || !reportMeta) return;

  const payload = {
    app: "Aphrodite Hills Guest Lookup",
    version: 1,
    meta: reportMeta,
    guests: currentGuests
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;

  a.download = `AH-guest-list-${reportMeta.reportDate}.json`;

  document.body.append(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);

  showToast("Guest data file downloaded. Keep it confidential.");
}

async function importJson(file) {

  let payload;

  try {
    payload = JSON.parse(await file.text());

  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (
    payload?.app !== "Aphrodite Hills Guest Lookup" ||
    payload?.version !== 1 ||
    !Array.isArray(payload.guests) ||
    !payload.meta?.reportDate
  ) {
    throw new Error(
      "This does not look like a guest data file exported by this application."
    );
  }

  if (
    !payload.guests.length ||
    payload.guests.length > 500
  ) {
    throw new Error(
      "The guest data file has an unexpected number of records."
    );
  }

  for (const r of payload.guests) {

    if (
      !r.guestName ||
      !r.room ||
      !r.arrivalDate ||
      !r.departureDate
    ) {
      throw new Error(
        "The guest data file contains incomplete records. Nothing was imported."
      );
    }
  }

  const older =
    reportMeta?.reportDate &&
    payload.meta.reportDate < reportMeta.reportDate;

  if (
    older &&
    !confirm(
      `This data file is older than the report currently stored here (${formatDate(reportMeta.reportDate)}). Import it anyway?`
    )
  ) {
    return;
  }

  if (
    !confirm(
      `Import ${payload.guests.length} guest-room records from ${formatDate(payload.meta.reportDate)}? This replaces the list on this computer.`
    )
  ) {
    return;
  }

  const meta = {
    ...payload.meta,
    importedAt: new Date().toISOString(),
    importedFromFile: file.name
  };

  saveLocalData(payload.guests, meta);

  showToast("Guest list imported on this computer.");
}

// --------------------------------------------------
// EVENT LISTENERS
// --------------------------------------------------

$("searchInput").addEventListener("input", renderSearch);

$("clearSearchButton").addEventListener("click", () => {

  $("searchInput").value = "";

  renderSearch();

  $("searchInput").focus();
});

$("pdfInput").addEventListener("change", () => {

  const file = $("pdfInput").files?.[0];

  $("fileName").textContent =
    file ? file.name : "No file selected";

  $("parseButton").disabled = !file;

  $("previewBlock").classList.add("hidden");

  pendingImport = null;

  hideNotice();
});

$("parseButton").addEventListener("click", readPdf);

$("publishButton").addEventListener("click", saveCurrentImport);

$("exportButton").addEventListener("click", downloadJson);

$("jsonInput").addEventListener("change", async () => {

  const file = $("jsonInput").files?.[0];

  if (!file) return;

  try {

    await importJson(file);

  } catch (error) {

    showToast(error.message || String(error));

  } finally {

    $("jsonInput").value = "";
  }
});

// Start application
loadLocalData();
