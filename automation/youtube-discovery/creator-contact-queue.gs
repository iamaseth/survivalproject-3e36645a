// Survival Tabs — creator contact queue report
// Add this as a separate Google Apps Script file in the existing influencer Sheet project.
// Required Script Property: INGEST_SECRET
//
// READ-ONLY:
// - ZERO YouTube API calls
// - ZERO YouTube search quota
// - ZERO CRM writes
// - never Keeps, Skips, deletes, promotes, or sends outreach

const CREATOR_CONTACT_QUEUE_ENDPOINT =
  'https://survivalproject.lovable.app/api/public/creator-contact-queue';

function runCreatorContactQueueReport() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Missing Script Property: INGEST_SECRET');

  Logger.log('CREATOR CONTACT QUEUE REPORT START');
  Logger.log('YouTube API calls: 0');
  Logger.log('CRM writes: 0');

  const response = UrlFetchApp.fetch(CREATOR_CONTACT_QUEUE_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': secret },
    payload: JSON.stringify({ action: 'creator_contact_queue_report', limit: 2000 }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  Logger.log('Response: ' + code + ' ' + text);
  if (code < 200 || code >= 300) {
    throw new Error('Contact queue report failed safely. HTTP ' + code + ': ' + text);
  }

  const data = JSON.parse(text);
  Logger.log('CREATOR CONTACT QUEUE REPORT COMPLETE');
  Logger.log('Classified creators examined: ' + Number(data.examined || 0));
  Logger.log('Already contactable: ' + Number(data.already_contactable || 0));
  Logger.log('Public-link research queue: ' + Number(data.public_link_research || 0));
  Logger.log('External research queue: ' + Number(data.external_research || 0));
  Logger.log('Recommended now: ' + Number(data.recommended_now || 0));
  Logger.log('YouTube API calls: ' + Number(data.youtube_api_calls || 0));
  Logger.log('CRM writes: ' + Number(data.crm_writes || 0));
}
