/**
 * Medicine & Period Monitor  -  Google Apps Script backend
 * ---------------------------------------------------------
 * - Stores all data in the Google Sheet this script is attached to
 *   (tabs: Medicines, DoseLog, Periods)  -> this is your "Excel sheet" back side.
 * - Sends reminder / report e-mails from your Gmail account.
 *
 * SETUP: see SETUP-GUIDE.md  (add APP_USER / APP_PASSWORD, run setup() once, then Deploy > Web app).
 */

// ===================== SETTINGS (edit these) =====================
// LOGIN: do NOT type your user name / password in this file (it may be public on GitHub).
// Add them in  Apps Script > Project Settings (gear icon) > Script properties:
//      APP_USER      = your user name
//      APP_PASSWORD  = your password
var SESSION_DAYS = 30;          // stay signed in on a device for this many days
var MAX_FAILS = 5;              // wrong passwords allowed ...
var LOCK_MIN = 15;              // ... then sign-in is blocked for this many minutes
var NOTIFY_EMAIL = '';          // e-mail to remind. Leave '' = your own Gmail (comma separate for many)
var APP_URL = '';               // optional: link to your hosted app page, shown inside e-mails
var REMIND_WINDOW_MIN = 20;     // send "dose due" mail within this many minutes after the dose time
var MISSED_AFTER_MIN = 180;     // dose is "missed" if not marked within this many minutes (same as the app)
// =================================================================

var SHEETS = {
  // repeat = daily | every:3 | weekly:1,4 | monthday:15 | nth:2:0  (2nd Sunday of every month)
  Medicines: ['id', 'person', 'name', 'type', 'dose', 'startDate', 'days', 'noEnd', 'times', 'food', 'notes', 'createdAt', 'repeat'],
  DoseLog:   ['id', 'medId', 'person', 'medicine', 'date', 'slot', 'time', 'status', 'takenAt'],
  Periods:   ['id', 'person', 'startDate', 'endDate', 'flow', 'pain', 'notes'],
  // uploaded report files (image / PDF). The file itself lives in Google Drive, this row is its record.
  Files:     ['id', 'person', 'title', 'category', 'date', 'notes', 'fileName', 'mime', 'size', 'driveId', 'driveUrl', 'thumb', 'createdAt']
};
var DRIVE_FOLDER = 'Medicine Monitor Reports';   // Drive folder where uploaded reports are saved
var MAX_FILE_MB = 25;

/* ---------------------------------------------------------------
 * Web app entry points
 * ------------------------------------------------------------- */
function doGet() {
  return ContentService.createTextOutput('Medicine & Period Monitor backend is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (req.action === 'login') out = login_(req);
      else {
        var ctx = checkToken_(req.token);             // every other call needs a valid sign-in
        out = req.action === 'logout' ? logout_(req) : handle_(req, ctx);
      }
    } finally { lock.releaseLock(); }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err), code: (err && err.code) || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** ctx = who is signed in: { user, person, admin }. Only the admin sees and changes every person's rows. */
function handle_(req, ctx) {
  switch (req.action) {
    case 'ping':
      return { ok: true, message: 'Connected', user: ctx.admin ? Session.getEffectiveUser().getEmail() : ctx.user };
    case 'getAll':
      return { ok: true, medicines: mine_('Medicines', ctx), logs: mine_('DoseLog', ctx), periods: mine_('Periods', ctx), files: mine_('Files', ctx) };
    case 'bulk':
      return applyOps_(req.ops || [], ctx);
    case 'uploadFile':
      return uploadFile_(req, ctx);
    case 'getMail':
      return { ok: true, mail: mailPrefs_(ctx) };
    case 'setMail':
      return setMail_(req, ctx);
    case 'testMail':
      return testMail_(ctx);
    default:
      throw new Error('Unknown action: ' + req.action);
  }
}

function samePerson_(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

/** Rows of a tab that the signed-in user may see. */
function mine_(name, ctx) {
  var rows = readAll_(name);
  return ctx.admin ? rows : rows.filter(function (r) { return samePerson_(r.person, ctx.person); });
}

/* ---------------------------------------------------------------
 * Login (user name + password) and sessions
 * The credentials live in Script properties (APP_USER / APP_PASSWORD), never in this file.
 * ------------------------------------------------------------- */
function authError_(msg) {
  var e = new Error(msg || 'Please sign in again');
  e.code = 'AUTH';
  return e;
}

function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

/** Compares two strings through their hashes, so the time taken does not leak how many characters matched. */
function safeEqual_(a, b) {
  var x = hash_(a), y = hash_(b), r = x.length ^ y.length;
  for (var i = 0; i < x.length && i < y.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}

/* ----- other people's logins: the "Users" tab of the Sheet -----
 *   user | person | email | password | passHash
 * Type a user name, the person name their records are saved under, their e-mail and a password.
 * At the next sign-in (or when you run saveUsers) the password is replaced by a salted hash,
 * so no password stays readable in the Sheet. A user sees only the rows of their own person. */
var USER_COLS = ['user', 'person', 'email', 'password', 'passHash'];

function usersSheet_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Users');
  if (!sh) {
    sh = ss.insertSheet('Users');
    sh.getRange(1, 1, 1, USER_COLS.length).setValues([USER_COLS])
      .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), USER_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function slowHash_(salt, pass) {
  var h = salt + ':' + pass;
  for (var i = 0; i < 300; i++) h = hash_(salt + h);        // many rounds: guessing a stolen hash is slow
  return h;
}

function users_() {
  var sh = usersSheet_(), last = sh.getLastRow(), out = [];
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, USER_COLS.length).getValues().forEach(function (r, i) {
    var user = String(r[0]).trim(), plain = String(r[3]), ph = String(r[4]);
    if (!user) return;
    if (plain) {                                             // new / changed password -> keep only its hash
      var salt = Utilities.getUuid();
      ph = salt + '$' + slowHash_(salt, plain);
      sh.getRange(i + 2, 4, 1, 2).setValues([['', ph]]);
    }
    out.push({ user: user, person: String(r[1]).trim() || user, email: String(r[2]).trim(), passHash: ph });
  });
  return out;
}

/** Run from the editor after typing passwords in the Users tab, to hash them straight away. */
function saveUsers() { users_(); }

function sessions_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('sessions') || '{}'); } catch (e) { s = {}; }
  var now = Date.now();
  Object.keys(s).forEach(function (k) { if ((typeof s[k] === 'number' ? s[k] : s[k].e) < now) delete s[k]; });
  return s;
}
function saveSessions_(s) { PropertiesService.getScriptProperties().setProperty('sessions', JSON.stringify(s)); }

function login_(req) {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty('APP_USER'), pass = props.getProperty('APP_PASSWORD');
  if (!user || !pass) {
    throw new Error('Login is not set up yet. In Apps Script open Project Settings > Script properties and add APP_USER and APP_PASSWORD.');
  }
  var name = String(req.user || '').trim().toLowerCase().slice(0, 100), given = String(req.password || '').slice(0, 200);
  var cache = CacheService.getScriptCache();
  var failKey = 'fails_' + hash_(name).slice(0, 24);        // counted per user name, so one person cannot lock out the others
  var fails = parseInt(cache.get(failKey) || '0', 10), allFails = parseInt(cache.get('fails_all') || '0', 10);
  if (fails >= MAX_FAILS || allFails >= MAX_FAILS * 6) throw new Error('Too many wrong attempts. Please wait ' + LOCK_MIN + ' minutes and try again.');

  var who = null;
  if (safeEqual_(name, user.trim().toLowerCase())) {        // the owner (admin): sees every person
    if (safeEqual_(given, pass)) who = { user: user.trim(), person: '', role: 'admin' };
  } else {                                                  // someone from the Users tab: sees only their own person
    var u = users_().filter(function (x) { return x.user.toLowerCase() === name; })[0];
    var parts = String(u && u.passHash ? u.passHash : 'none$none').split('$');
    if (safeEqual_(slowHash_(parts[0], given), parts[1] || '') && u && u.passHash) who = { user: u.user, person: u.person, role: 'user' };
  }
  if (!who) {
    cache.put(failKey, String(fails + 1), LOCK_MIN * 60);
    cache.put('fails_all', String(allFails + 1), LOCK_MIN * 60);
    Utilities.sleep(1000);                                  // slows down guessing
    throw new Error('Wrong user name or password');
  }
  cache.remove(failKey);

  var token = Utilities.getUuid() + Utilities.getUuid();    // random, only its hash is stored
  var expires = Date.now() + SESSION_DAYS * 86400000;
  var s = sessions_(), keys = Object.keys(s), exp = function (k) { return typeof s[k] === 'number' ? s[k] : s[k].e; };
  if (keys.length >= 60) { keys.sort(function (a, b) { return exp(a) - exp(b); }); delete s[keys[0]]; }   // keep 60 newest
  s[hash_(token)] = { e: expires, u: who.user, r: who.role };
  saveSessions_(s);
  return { ok: true, token: token, expires: expires, user: who.user, person: who.person, role: who.role };
}

/** Returns who the token belongs to, or throws. A user removed from the Users tab is signed out at once. */
function checkToken_(token) {
  var v = token ? sessions_()[hash_(token)] : null;
  if (!v) throw authError_();
  if (typeof v === 'number' || v.r === 'admin') return { user: (v && v.u) || 'admin', person: '', admin: true };   // number = session from the older version
  var u = users_().filter(function (x) { return x.user === v.u; })[0];
  if (!u || !u.passHash) throw authError_();
  return { user: u.user, person: u.person, admin: false };
}

function logout_(req) {
  var s = sessions_();
  delete s[hash_(req.token)];
  saveSessions_(s);
  return { ok: true };
}

/** Run from the editor if you locked yourself out with wrong passwords. */
function unlockLogin() {
  var cache = CacheService.getScriptCache(), names = [PropertiesService.getScriptProperties().getProperty('APP_USER') || ''];
  users_().forEach(function (u) { names.push(u.user); });
  cache.removeAll(['fails_all'].concat(names.map(function (n) { return 'fails_' + hash_(n.trim().toLowerCase()).slice(0, 24); })));
}

/** Run from the editor to sign out every phone / PC (e.g. after a lost phone). Also change APP_PASSWORD. */
function signOutEverywhere() { PropertiesService.getScriptProperties().deleteProperty('sessions'); }

/* ---------------------------------------------------------------
 * Sheet helpers
 * ------------------------------------------------------------- */
function sheet_(name) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  var headers = SHEETS[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // plain-text format so Google Sheets never turns dates/times into other values
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < headers.length) {
    // sheet created by an older version of this script: add the new column(s)
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  }
  return sh;
}

function norm_(v, header) {
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    if (header === 'time') return Utilities.formatDate(v, tz, 'HH:mm');
    if (header === 'takenAt' || header === 'createdAt') return v.toISOString();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v);
}

function readAll_(name) {
  var sh = sheet_(name), headers = SHEETS[name], last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  vals.forEach(function (r) {
    if (r[0] === '' || r[0] === null) return;
    var o = {};
    headers.forEach(function (h, i) { o[h] = norm_(r[i], h); });
    out.push(o);
  });
  return out;
}

function load_(name) {
  var sh = sheet_(name), last = sh.getLastRow(), index = {}, owner = {}, pc = SHEETS[name].indexOf('person');
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, pc + 1).getValues();          // id … person
    for (var i = 0; i < vals.length; i++) if (vals[i][0] !== '') { index[String(vals[i][0])] = i + 2; owner[String(vals[i][0])] = String(vals[i][pc]); }
  }
  var next = Math.max(last, 1) + 1;
  return { sh: sh, index: index, owner: owner, next: next, firstPending: next, pending: [], cols: SHEETS[name].length };
}

/** One cell value as safe text: no formulas, no over-long text, only real Drive links and picture thumbnails. */
function clean_(sheet, header, v) {
  var s = v === undefined || v === null ? '' : String(v);
  if (header === 'thumb') return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s) && s.length <= 45000 ? s : '';
  if (header === 'driveUrl') return /^https:\/\/(drive|docs)\.google\.com\//.test(s) ? s.slice(0, 500) : '';
  s = s.slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;                               // leading ' = plain text, never a formula
}

function flushPending_(t) {
  if (!t.pending.length) return;
  var need = t.firstPending + t.pending.length - 1 - t.sh.getMaxRows();
  if (need > 0) t.sh.insertRowsAfter(t.sh.getMaxRows(), need);
  t.sh.getRange(t.firstPending, 1, t.pending.length, t.cols).setValues(t.pending);
  t.firstPending += t.pending.length;
  t.pending = [];
}

/** ctx = the signed-in user. Left out (calls from inside this script) = no restriction. */
function applyOps_(ops, ctx) {
  var cache = {}, admin = !ctx || ctx.admin;
  function get(name) {
    if (!SHEETS[name]) throw new Error('Unknown sheet: ' + name);
    if (!cache[name]) cache[name] = load_(name);
    return cache[name];
  }
  function flushAll() { Object.keys(cache).forEach(function (k) { flushPending_(cache[k]); }); }

  ops.forEach(function (op) {
    var t = get(op.sheet);
    if (op.op === 'upsert') {
      var row = op.row;
      if (!row || !row.id) return;
      var r = t.index[row.id];
      if (!admin) {
        if (t.owner[row.id] !== undefined && !samePerson_(t.owner[row.id], ctx.person)) return;   // somebody else's row
        row.person = ctx.person;                                                                  // always saved under their own name
        if (op.sheet === 'Files') {                           // the Drive link is set by uploadFile only, never by the user
          if (!r || r >= t.firstPending) return;
          var link = t.sh.getRange(r, SHEETS.Files.indexOf('driveId') + 1, 1, 2).getValues()[0];
          row.driveId = link[0]; row.driveUrl = link[1];
        }
      }
      t.owner[row.id] = String(row.person || '');
      var values = SHEETS[op.sheet].map(function (h) { return clean_(op.sheet, h, row[h]); });
      if (r && r >= t.firstPending) {
        t.pending[r - t.firstPending] = values;                 // same batch, replace
      } else if (r) {
        t.sh.getRange(r, 1, 1, values.length).setValues([values]); // update existing row
      } else {
        t.index[row.id] = t.next++;                              // new row, buffered
        t.pending.push(values);
      }
    } else if (op.op === 'delete') {
      if (!admin && !(t.owner[op.id] !== undefined && samePerson_(t.owner[op.id], ctx.person))) return;   // not theirs
      flushAll();
      var r2 = t.index[op.id];
      if (r2 && op.sheet === 'Files') trashDriveFile_(t.sh.getRange(r2, SHEETS.Files.indexOf('driveId') + 1).getValue());
      if (r2) t.sh.deleteRow(r2);
      if (op.sheet === 'Medicines') deleteLogsOfMed_(String(op.id));
      cache = {}; // row numbers moved
    }
  });
  flushAll();
  return { ok: true, applied: ops.length };
}

function deleteLogsOfMed_(medId) {
  var sh = sheet_('DoseLog'), last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 2, last - 1, 1).getValues(); // column B = medId
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === medId) sh.deleteRow(i + 2);
  }
}

/* ---------------------------------------------------------------
 * Report files (image / PDF)  ->  saved in Google Drive
 * ------------------------------------------------------------- */
function folder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function trashDriveFile_(driveId) {
  if (!driveId) return;
  try { DriveApp.getFileById(String(driveId)).setTrashed(true); } catch (e) { /* already gone */ }
}

function uploadFile_(req, ctx) {
  var meta = req.meta || {};
  if (!meta.id || !req.data) throw new Error('Missing file data');
  if (!ctx.admin) meta.person = ctx.person;

  // a retry of an upload that already worked must not create a second Drive file
  var already = readAll_('Files').filter(function (f) { return f.id === String(meta.id); })[0];
  if (already && !ctx.admin && !samePerson_(already.person, ctx.person)) throw new Error('This file belongs to someone else');
  if (already && already.driveId) return { ok: true, driveId: already.driveId, driveUrl: already.driveUrl };

  var mime = String(meta.mime || '');
  if (!/^image\/[a-z0-9.+-]+$/i.test(mime) && mime !== 'application/pdf') throw new Error('Only images or PDF files can be uploaded');
  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_FILE_MB * 1024 * 1024) throw new Error('File too large (max ' + MAX_FILE_MB + ' MB)');
  var blob = Utilities.newBlob(bytes, mime, String(meta.fileName || meta.title || 'report').slice(0, 200));
  var file = folder_().createFile(blob);
  file.setDescription((meta.title || '') + ' | ' + (meta.person || '') + ' | ' + (meta.category || ''));

  meta.driveId = file.getId();
  meta.driveUrl = file.getUrl();
  applyOps_([{ op: 'upsert', sheet: 'Files', row: meta }]);
  return { ok: true, driveId: meta.driveId, driveUrl: meta.driveUrl };
}

/* ---------------------------------------------------------------
 * ONE-TIME SETUP  - run this once from the Apps Script editor
 * ------------------------------------------------------------- */
function setup() {
  Object.keys(SHEETS).forEach(function (n) {
    var sh = sheet_(n);
    // keep dates / times as plain text, also in a sheet that was imported from the sample .xlsx
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[n].length).setNumberFormat('@');
  });
  folder_();   // creates the Drive folder for uploaded reports (also asks Drive permission)
  usersSheet_();   // tab where you add other people's logins

  var ss = SpreadsheetApp.getActive();
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // remove old triggers of this project, then create fresh ones
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('morningDigest').timeBased().everyDays(1).atHour(7).create();       // daily plan ~7 AM
  ScriptApp.newTrigger('dueDoseReminder').timeBased().everyMinutes(15).create();           // "take it now" mails
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();

  MailApp.sendEmail(recipient_(), 'Medicine Monitor is ready',
    'Setup finished. Daily plan (7 AM), dose reminders and missed-dose mails (checked every 15 min) and the weekly report (Monday 8 AM) are ON.');

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_USER') || !props.getProperty('APP_PASSWORD')) {
    throw new Error('Setup finished, BUT sign-in is not ready: add APP_USER and APP_PASSWORD in Project Settings > Script properties, then deploy.');
  }
}

/* ---------------------------------------------------------------
 * Dose calculation (same rules as the web app)
 * ------------------------------------------------------------- */
function tz_() { return Session.getScriptTimeZone(); }
function fmt_(d, f) { return Utilities.formatDate(d, tz_(), f); }
function toMin_(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
function addDays_(s, n) {
  var p = s.split('-');
  return Utilities.formatDate(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)), 'UTC', 'yyyy-MM-dd');
}
function diffDays_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}
function parseTimes_(str) {
  return String(str || '').split('|').filter(String).map(function (x) {
    var p = x.split('@');
    return { label: p[0], time: p[1] };
  }).filter(function (t) { return t.time; });
}
/* ----- mail settings (Settings > Mail in the app), kept in Script properties -----
 * { "*": {email, due, missed},  "<user name>": {email, due, missed} }     "*" = the owner (admin)  */
function mailStore_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('mail') || '{}'); } catch (e) { return {}; }
}
function mailKey_(ctx) { return ctx.admin ? '*' : ctx.user.toLowerCase(); }

/** Mail settings of one login, with defaults: owner -> own Gmail, user -> e-mail typed in the Users tab. */
function mailPrefs_(ctx, store) {
  var p = (store || mailStore_())[mailKey_(ctx)] || {}, fallback = '';
  if (ctx.admin) fallback = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  else users_().forEach(function (u) { if (u.user === ctx.user) fallback = u.email; });
  return { email: p.email || fallback, due: p.due !== false, missed: p.missed !== false };
}

function setMail_(req, ctx) {
  var m = req.mail || {};
  var list = String(m.email || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (list.length > 3) throw new Error('At most 3 e-mail addresses');
  list.forEach(function (a) { if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(a) || a.length > 120) throw new Error('This is not a valid e-mail address: ' + a); });
  var store = mailStore_();
  store[mailKey_(ctx)] = { email: list.join(','), due: m.due !== false, missed: m.missed !== false };
  PropertiesService.getScriptProperties().setProperty('mail', JSON.stringify(store));
  return { ok: true, mail: mailPrefs_(ctx, store) };
}

function testMail_(ctx) {
  var cache = CacheService.getScriptCache(), key = 'test_' + hash_(mailKey_(ctx)).slice(0, 24);
  if (cache.get(key)) throw new Error('A test mail was just sent. Please wait a minute.');
  var to = mailPrefs_(ctx).email;
  if (!to) throw new Error('Save an e-mail address first');
  cache.put(key, '1', 60);
  MailApp.sendEmail({ to: to, subject: 'Medicine Monitor test mail', name: 'Medicine Monitor',
    htmlBody: '<p>This address will get the tablet reminders and the “you missed a tablet” mails.</p>' });
  return { ok: true, to: to };
}

function recipient_() { return mailPrefs_({ admin: true }).email; }
function send_(subject, html) {
  MailApp.sendEmail({ to: recipient_(), subject: subject, htmlBody: html, name: 'Medicine Monitor' });
}

/** Sends dose mails person by person: each person gets only their own doses at their own address,
 *  the owner gets a copy. kind = 'due' | 'missed' (each login can switch either off).
 *  build(list) -> { subject, html } */
function mailPeople_(doses, kind, build) {
  var store = mailStore_(), owner = mailPrefs_({ admin: true }, store), byPerson = {}, groups = {};
  users_().forEach(function (u) { byPerson[u.person.toLowerCase()] = mailPrefs_({ user: u.user, admin: false }, store); });
  doses.forEach(function (d) {
    var p = byPerson[String(d.person).trim().toLowerCase()];
    var to = p && p[kind] && p.email ? p.email : '';
    (groups[to] = groups[to] || []).push(d);
  });
  Object.keys(groups).forEach(function (to) {
    if (!to && !owner[kind]) return;                        // nobody wants this mail
    var m = build(groups[to]), msg = { to: to || owner.email, subject: m.subject, htmlBody: m.html, name: 'Medicine Monitor' };
    if (to && owner[kind] && owner.email && owner.email.toLowerCase().indexOf(to.toLowerCase()) < 0) msg.cc = owner.email;
    if (msg.to) MailApp.sendEmail(msg);
  });
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function time12_(t) {
  var p = t.split(':'), h = +p[0], ap = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + p[1] + ' ' + ap;
}

var WEEKDAYS_ = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var ORD_ = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '-1': 'last' };

/** repeat string -> {kind:'daily'|'every'|'weekly'|'monthday'|'nth', ...}  (same rules as app.js) */
function parseRepeat_(s) {
  var p = String(s || 'daily').split(':'), k = p[0];
  if (k === 'every') { var n = parseInt(p[1], 10); if (n >= 2 && n <= 90) return { kind: 'every', n: n }; }
  else if (k === 'weekly') {
    var days = String(p[1] || '').split(',').map(Number).filter(function (x) { return x >= 0 && x <= 6 && x % 1 === 0; });
    if (days.length) return { kind: 'weekly', days: days };
  }
  else if (k === 'monthday') { var d = parseInt(p[1], 10); if (d >= 1 && d <= 31) return { kind: 'monthday', d: d }; }
  else if (k === 'nth') {
    var nn = parseInt(p[1], 10), w = parseInt(p[2], 10);
    if ([1, 2, 3, 4, -1].indexOf(nn) >= 0 && w >= 0 && w <= 6) return { kind: 'nth', n: nn, w: w };
  }
  return { kind: 'daily' };
}

function repeatText_(m) {
  var r = parseRepeat_(m.repeat);
  if (r.kind === 'every') return 'Every ' + r.n + ' days';
  if (r.kind === 'weekly') return 'Every ' + r.days.map(function (d) { return WEEKDAYS_[d].slice(0, 3); }).join(', ');
  if (r.kind === 'monthday') return 'Monthly on day ' + r.d;
  if (r.kind === 'nth') return ORD_[r.n] + ' ' + WEEKDAYS_[r.w] + ' of every month';
  return 'Every day';
}

/** Is this medicine due on dateStr ('yyyy-MM-dd')?  Time of day is not considered. */
function occursOn_(m, dateStr) {
  var days = parseInt(m.days, 10) || 1;
  var end = m.noEnd === 'true' ? '9999-12-31' : addDays_(m.startDate, days - 1);
  if (dateStr < m.startDate || dateStr > end) return false;
  var r = parseRepeat_(m.repeat);
  if (r.kind === 'daily') return true;
  if (r.kind === 'every') return diffDays_(m.startDate, dateStr) % r.n === 0;
  var p = dateStr.split('-'), y = +p[0], mo = +p[1], dom = +p[2];
  var dow = new Date(Date.UTC(y, mo - 1, dom)).getUTCDay();
  var dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (r.kind === 'weekly') return r.days.indexOf(dow) >= 0;
  if (r.kind === 'monthday') return dom === Math.min(r.d, dim);
  if (dow !== r.w) return false;
  return r.n === -1 ? dom + 7 > dim : Math.ceil(dom / 7) === r.n;
}

function dosesFor_(meds, dateStr) {
  var out = [];
  meds.forEach(function (m) {
    var days = parseInt(m.days, 10) || 1;
    if (!occursOn_(m, dateStr)) return;
    var daily = parseRepeat_(m.repeat).kind === 'daily';
    parseTimes_(m.times).forEach(function (t) {
      out.push({
        key: m.id + '|' + dateStr + '|' + t.time, medId: m.id, person: m.person, name: m.name,
        type: m.type, dose: m.dose, food: m.food, label: t.label, time: t.time, date: dateStr,
        dayNo: diffDays_(m.startDate, dateStr) + 1, days: days, noEnd: m.noEnd === 'true',
        daily: daily, repeatText: repeatText_(m)
      });
    });
  });
  out.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
  return out;
}

function logIndex_() {
  var idx = {};
  readAll_('DoseLog').forEach(function (l) { idx[l.id] = l.status; });
  return idx;
}

/* ---------------------------------------------------------------
 * E-mail jobs (time-driven triggers created by setup())
 * ------------------------------------------------------------- */
/** Runs every 15 minutes: "take it now" mails, then "you missed it" mails. */
function dueDoseReminder() {
  var meds = readAll_('Medicines'), logs = logIndex_();
  takeNowMail_(meds, logs);
  missedMail_(meds, logs);
}

function doseList_(list) {
  return '<ul>' + list.map(function (d) {
    return '<li><b>' + esc_(d.name) + '</b>' + (d.dose ? ' – ' + esc_(d.dose) : '') +
      ' &nbsp;(' + esc_(d.label) + ', ' + time12_(d.time) + ')' +
      (d.person ? ' &nbsp;<i>' + esc_(d.person) + '</i>' : '') +
      (d.food && d.food !== 'Any time' ? ' &nbsp;· ' + esc_(d.food) : '') + '</li>';
  }).join('') + '</ul>' + (APP_URL ? '<p><a href="' + APP_URL + '">Open the app and mark as taken</a></p>' : '');
}
function names_(list) { return list.map(function (d) { return d.name; }).join(', '); }

function takeNowMail_(meds, logs) {
  var now = new Date(), today = fmt_(now, 'yyyy-MM-dd'), nowMin = toMin_(fmt_(now, 'HH:mm'));
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('sent') || '{}');

  var due = dosesFor_(meds, today).filter(function (d) {
    var m = toMin_(d.time);
    return m <= nowMin && nowMin - m <= REMIND_WINDOW_MIN && !logs[d.key] && !sent[d.key];
  });
  if (!due.length) return;

  mailPeople_(due, 'due', function (list) {
    return { subject: '💊 Take now: ' + names_(list), html: '<h3>💊 Time to take your medicine</h3>' + doseList_(list) };
  });

  var keep = {};
  Object.keys(sent).forEach(function (k) { if (sent[k] === today) keep[k] = today; });
  due.forEach(function (d) { keep[d.key] = today; });
  props.setProperty('sent', JSON.stringify(keep));
}

/** A dose still not marked MISSED_AFTER_MIN minutes after its time -> one "you missed it" mail. */
function missedMail_(meds, logs) {
  var now = new Date(), today = fmt_(now, 'yyyy-MM-dd'), yesterday = addDays_(today, -1), nowMin = toMin_(fmt_(now, 'HH:mm'));
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('missedSent') || '{}');

  // yesterday is checked too: a 10 PM dose becomes "missed" after midnight
  var missed = dosesFor_(meds, yesterday).concat(dosesFor_(meds, today)).filter(function (d) {
    var late = (d.date === today ? 0 : 1440) + nowMin - toMin_(d.time);
    return late >= MISSED_AFTER_MIN && late <= MISSED_AFTER_MIN + 120 && !logs[d.key] && !sent[d.key];
  });
  if (!missed.length) return;

  mailPeople_(missed, 'missed', function (list) {
    return {
      subject: '⚠️ Missed: ' + names_(list),
      html: '<h3>You missed your medicine</h3><p>Nothing was marked for:</p>' + doseList_(list) +
        '<p>If you did take it, open the app and mark it as taken. If not, follow your doctor’s advice about a missed dose.</p>'
    };
  });

  var keep = {};
  Object.keys(sent).forEach(function (k) { if (sent[k] >= yesterday) keep[k] = sent[k]; });
  missed.forEach(function (d) { keep[d.key] = today; });
  props.setProperty('missedSent', JSON.stringify(keep));
}

function morningDigest() {
  var today = fmt_(new Date(), 'yyyy-MM-dd');
  var doses = dosesFor_(readAll_('Medicines'), today);
  var note = periodNote_(today);
  if (!doses.length && !note) return;

  var html = '<h2>Today\'s plan – ' + today + '</h2>';
  if (doses.length) {
    html += '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">' +
      '<tr style="background:#0f766e;color:#fff"><th>Time</th><th>Medicine</th><th>Dose</th><th>Person</th><th>Day / repeat</th></tr>' +
      doses.map(function (d) {
        return '<tr><td>' + time12_(d.time) + ' (' + esc_(d.label) + ')</td><td><b>' + esc_(d.name) + '</b></td><td>' +
          esc_(d.dose) + '</td><td>' + esc_(d.person) + '</td><td>' + (d.daily ? d.dayNo + (d.noEnd ? '' : ' / ' + d.days) : esc_(d.repeatText)) + '</td></tr>';
      }).join('') + '</table>';
  } else {
    html += '<p>No medicines scheduled today.</p>';
  }
  html += note;
  send_('Medicine plan for ' + today, html);
}

function weeklyReport() {
  var today = fmt_(new Date(), 'yyyy-MM-dd'), from = addDays_(today, -7), to = addDays_(today, -1);
  var meds = readAll_('Medicines'), logs = logIndex_();
  var stat = {}, tot = { taken: 0, skipped: 0, missed: 0 };
  for (var d = from; d <= to; d = addDays_(d, 1)) {
    dosesFor_(meds, d).forEach(function (x) {
      var s = logs[x.key] || 'missed';
      var k = x.person + ' – ' + x.name;
      if (!stat[k]) stat[k] = { taken: 0, skipped: 0, missed: 0 };
      stat[k][s]++; tot[s]++;
    });
  }
  var all = tot.taken + tot.skipped + tot.missed;
  var html = '<h2>Weekly medicine report (' + from + ' to ' + to + ')</h2>';
  if (!all) {
    html += '<p>No doses were scheduled last week.</p>';
  } else {
    html += '<p><b>Overall adherence: ' + Math.round(tot.taken * 100 / all) + '%</b> &nbsp; (taken ' + tot.taken +
      ', skipped ' + tot.skipped + ', missed ' + tot.missed + ')</p>' +
      '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">' +
      '<tr style="background:#0f766e;color:#fff"><th>Medicine</th><th>Taken</th><th>Skipped</th><th>Missed</th><th>%</th></tr>' +
      Object.keys(stat).map(function (k) {
        var s = stat[k], n = s.taken + s.skipped + s.missed;
        return '<tr><td>' + esc_(k) + '</td><td>' + s.taken + '</td><td>' + s.skipped + '</td><td>' + s.missed +
          '</td><td>' + Math.round(s.taken * 100 / n) + '%</td></tr>';
      }).join('') + '</table>';
  }
  html += periodNote_(today);
  send_('Weekly medicine report', html);
}

/** Small period prediction for e-mails (average of the last cycles, default 28 days). */
function periodNote_(today) {
  var byPerson = {};
  readAll_('Periods').forEach(function (p) { (byPerson[p.person] = byPerson[p.person] || []).push(p); });
  var lines = [];
  Object.keys(byPerson).forEach(function (person) {
    var list = byPerson[person].sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; });
    var gaps = [];
    for (var i = 1; i < list.length; i++) gaps.push(diffDays_(list[i - 1].startDate, list[i].startDate));
    gaps = gaps.slice(-6);
    var cycle = gaps.length ? Math.round(gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length) : 28;
    var next = addDays_(list[list.length - 1].startDate, cycle);
    var left = diffDays_(today, next);
    if (left >= 0 && left <= 3) lines.push('<li>' + esc_(person) + ': next period expected <b>' + next + '</b> (in ' + left + ' day' + (left === 1 ? '' : 's') + ')</li>');
    else if (left < 0 && left >= -7) lines.push('<li>' + esc_(person) + ': period was expected on ' + next + ' (' + (-left) + ' day(s) ago)</li>');
  });
  return lines.length ? '<h3>🩸 Period tracker</h3><ul>' + lines.join('') + '</ul>' : '';
}
