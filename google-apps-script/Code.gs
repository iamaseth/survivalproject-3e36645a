// Google Apps Script: bound to the master Google Sheet.
// Deploy as a web app: Execute as "User accessing the web app"; access limited to your organization/team.
// Spreadsheet must be explicitly shared with each team member as Editor.
// Do not deploy as "Anyone" executing as owner: that would expose private influencer records.
const SPREADSHEET_ID = '1aJf5jrG2Y-ewd0kJypLOoss6VuSFnmyDMwCs3_wErdM';
const TAB = 'survival-tabs-influencer-master';
const STATUS = 'Status';
const STATUSES = ['Needs Review','After First Review','Approved','Rejected','Assigned','Contacted','AI Excluded'];
function sheet_() {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB);
  if (!sh) throw new Error('Master tab missing');
  return sh;
}
function setupStatusColumn() {
  const sh = sheet_();
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  let col = headers.indexOf(STATUS)+1;
  if (!col) { col = sh.getLastColumn()+1; sh.getRange(1,col).setValue(STATUS); }
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES,true).build();
  sh.getRange(2,col,Math.max(1,sh.getMaxRows()-1),1).setDataValidation(rule);
}
function rows_() {
  const values = sheet_().getDataRange().getValues();
  const headers = values.shift().map(String);
  const id = headers.indexOf('Creator ID'), status = headers.indexOf(STATUS);
  if (id<0 || status<0) throw new Error('Run setupStatusColumn first');
  return values.filter(r=>r[id]).map(r=>({
    id:String(r[id]), name:String(r[headers.indexOf('Creator')]||''),
    tiktok:String(r[headers.indexOf('TikTok URL')]||''),
    email:String(r[headers.indexOf('Email')]||''),
    draft:String(r[headers.indexOf('Draft DM - Do Not Send')]||r[headers.indexOf('Personalized DM')]||''),
    sentEvidence: Boolean(r[headers.indexOf('Contacted Date')]) || String(r[headers.indexOf('Outreach Stage')]||'').toLowerCase()==='contacted',
    screening:String(r[headers.indexOf('New Screening Decision')]||''),
    status:String(r[status]||'Needs Review')
  }));
}
function listCreators() { return rows_(); }
function changeStatus(id,next) {
  if (!STATUSES.includes(next)) throw new Error('Invalid status');
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh=sheet_(), values=sh.getDataRange().getValues(), headers=values[0].map(String);
    const idCol=headers.indexOf('Creator ID'), statusCol=headers.indexOf(STATUS);
    if (idCol<0||statusCol<0) throw new Error('Missing columns');
    const matching=[];
    for(let i=1;i<values.length;i++) if(String(values[i][idCol])===String(id)) matching.push(i+1);
    if(matching.length!==1) throw new Error('Creator ID missing or duplicated');
    sh.getRange(matching[0],statusCol+1).setValue(next);
    return {ok:true};
  } finally { lock.releaseLock(); }
}
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Review')
    .setTitle('Survival Tabs Influencer Review')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
