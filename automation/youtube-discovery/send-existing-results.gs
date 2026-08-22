// Survival Tabs — YouTube candidate importer
// Source of truth backup for Google Apps Script.
// Reads the existing "YouTube Discovery Rebuild" sheet and sends it to the
// Survival Influencer CRM staging endpoint without rerunning YouTube discovery.
//
// Required Script Property:
//   INGEST_SECRET
//
// Safe to rerun: the CRM endpoint deduplicates by channel_id.

const EXISTING_RESULTS_IMPORT = {
  SHEET_NAME: 'YouTube Discovery Rebuild',
  ENDPOINT: 'https://survivalproject.lovable.app/api/public/youtube-candidates',
  BATCH_SIZE: 450
};

function sendExistingResultsToCRM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet. Open this Apps Script from the 20 influencers Google Sheet.');

  const sheet = ss.getSheetByName(EXISTING_RESULTS_IMPORT.SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + EXISTING_RESULTS_IMPORT.SHEET_NAME);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) throw new Error('No candidate rows found in ' + EXISTING_RESULTS_IMPORT.SHEET_NAME);

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = values[0].map(v => String(v || '').trim());
  const index = buildHeaderIndex_(headers);

  requireHeader_(index, 'Channel ID');
  requireHeader_(index, 'Channel');
  requireHeader_(index, 'Subscribers');
  requireHeader_(index, 'YouTube URL');

  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const channelId = getByHeader_(row, index, 'Channel ID');
    if (!channelId || !String(channelId).trim()) continue;

    const email = cleanEmail_(getByHeader_(row, index, 'Email'));
    const lastUpload = String(getByHeader_(row, index, 'Last Upload') || '').trim();

    const notes = [
      valueNote_('Priority', getByHeader_(row, index, 'Priority')),
      valueNote_('Tier', getByHeader_(row, index, 'Final Tier')),
      valueNote_('Score', getByHeader_(row, index, 'Final Score')),
      valueNote_('Avg recent views', getByHeader_(row, index, 'Avg Recent Views')),
      valueNote_('Views/subs', getByHeader_(row, index, 'Views / Subs')),
      valueNote_('Screening', getByHeader_(row, index, 'Screening Status')),
      valueNote_('Screening reason', getByHeader_(row, index, 'Screening Reason')),
      valueNote_('Website', getByHeader_(row, index, 'Website')),
      valueNote_('Instagram', getByHeader_(row, index, 'Instagram')),
      valueNote_('TikTok', getByHeader_(row, index, 'TikTok')),
      valueNote_('Facebook', getByHeader_(row, index, 'Facebook')),
      valueNote_('Contact status', getByHeader_(row, index, 'Contact Status'))
    ].filter(Boolean).join(' | ');

    rows.push({
      channel_id: String(channelId).trim(),
      channel_url: stringOrNull_(getByHeader_(row, index, 'YouTube URL')),
      channel_title: stringOrNull_(getByHeader_(row, index, 'Channel')),
      subscriber_count: integerOrNull_(getByHeader_(row, index, 'Subscribers')),
      video_count: integerOrNull_(getByHeader_(row, index, 'Videos')),
      country: stringOrNull_(getByHeader_(row, index, 'Country')),
      description_email: email || null,
      business_email: email || null,
      topic_keyword: stringOrNull_(getByHeader_(row, index, 'Search Term')),
      last_upload_at: lastUpload ? normalizeDateForApi_(lastUpload) : null,
      source: 'apps_script_existing_sheet',
      notes: notes || null
    });
  }

  if (!rows.length) throw new Error('No rows with Channel ID were found. Nothing sent.');

  Logger.log('Prepared ' + rows.length + ' existing candidates from sheet.');

  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  let totalReceived = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalSuppressed = 0;

  for (let i = 0; i < rows.length; i += EXISTING_RESULTS_IMPORT.BATCH_SIZE) {
    const batch = rows.slice(i, i + EXISTING_RESULTS_IMPORT.BATCH_SIZE);
    const batchNumber = Math.floor(i / EXISTING_RESULTS_IMPORT.BATCH_SIZE) + 1;
    const batchId = 'existing-sheet-' + new Date().toISOString() + '-batch-' + batchNumber;

    Logger.log('Sending batch ' + batchNumber + ': ' + batch.length + ' rows');

    const response = UrlFetchApp.fetch(EXISTING_RESULTS_IMPORT.ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-ingest-secret': secret },
      payload: JSON.stringify({ batch_id: batchId, rows: batch }),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const text = response.getContentText();
    Logger.log('Batch ' + batchNumber + ' response: ' + code + ' ' + text);

    if (code < 200 || code >= 300) {
      throw new Error('CRM import stopped on batch ' + batchNumber + '. HTTP ' + code + ': ' + text);
    }

    let data = {};
    try { data = JSON.parse(text); } catch (e) {}

    totalReceived += Number(data.received || batch.length || 0);
    totalInserted += Number(data.inserted || 0);
    totalDuplicates += Number(data.skipped_duplicate || 0);
    totalSuppressed += Number(data.skipped_do_not_contact || 0);

    Utilities.sleep(500);
  }

  Logger.log('IMPORT COMPLETE');
  Logger.log('Prepared from sheet: ' + rows.length);
  Logger.log('Received by CRM: ' + totalReceived);
  Logger.log('Inserted: ' + totalInserted);
  Logger.log('Duplicates skipped: ' + totalDuplicates);
  Logger.log('Do-not-contact suppressed: ' + totalSuppressed);
}

function buildHeaderIndex_(headers) {
  const out = {};
  headers.forEach((h, i) => { if (h) out[h] = i; });
  return out;
}

function requireHeader_(index, name) {
  if (index[name] === undefined) throw new Error('Missing required column: ' + name);
}

function getByHeader_(row, index, name) {
  const i = index[name];
  return i === undefined ? '' : row[i];
}

function stringOrNull_(value) {
  const s = String(value || '').trim();
  return s ? s : null;
}

function integerOrNull_(value) {
  const s = String(value || '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function cleanEmail_(value) {
  const s = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function normalizeDateForApi_(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function valueNote_(label, value) {
  const s = String(value || '').trim();
  return s ? label + ': ' + s : '';
}
