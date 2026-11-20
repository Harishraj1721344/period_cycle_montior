/* Medicine & Period Monitor
 * Plain HTML + JS front end. Data is kept on this device and, when a Google Apps Script
 * web app URL is set (Settings tab), mirrored to a Google Sheet / Google Drive (backend/Code.gs).
 */
(() => {
'use strict';

/* ===================================================================
 * Constants & tiny helpers
 * ================================================================= */
const KEY = 'medmon.v1';
const NOTIFIED_KEY = 'medmon.notified';
const MISSED_AFTER_MIN = 180;          // not marked within 3 h of its time = missed
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PRESETS = { Morning: '08:00', Afternoon: '14:00', Evening: '18:00', Night: '21:00', Daily: '09:00' };
const TYPE_ICON = { Tablet: 'pill', Capsule: 'pill', Tonic: 'bottle', Syrup: 'bottle', Injection: 'syringe', Drops: 'drop', Other: 'plus' };
// part of the day a dose falls in: [name, icon, ends before this minute of the day]
const PARTS = [['Late night', 'moon', 300], ['Morning', 'sunrise', 720], ['Afternoon', 'sun', 960], ['Evening', 'sunset', 1200], ['Night', 'moon', 1441]];
const ICONS = {
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  bottle: '<path d="M9 2.5h6v3H9z"/><path d="M9 5.5v2.2a3.5 3.5 0 0 0-1.5 2.9V19a2.5 2.5 0 0 0 2.5 2.5h4a2.5 2.5 0 0 0 2.5-2.5v-8.4A3.5 3.5 0 0 0 15 7.7V5.5"/><path d="M7.5 13h9"/>',
  syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>',
  drop: '<path d="M12 2.7l5.66 5.65a8 8 0 1 1-11.32 0z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  repeat: '<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunrise: '<path d="M12 2v8M4.9 10.9l1.4 1.4M2 18h2M20 18h2M19.1 10.9l-1.4 1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
  sunset: '<path d="M12 10V2M4.9 10.9l1.4 1.4M2 18h2M20 18h2M19.1 10.9l-1.4 1.4M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'
};
const ico = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.plus}</svg>`;
const STATUS_LABEL = { taken: 'Taken', skipped: 'Skipped', missed: 'Missed', due: 'Due now', upcoming: 'Upcoming' };
const FLOWS = ['Spotting', 'Light', 'Medium', 'Heavy'];
const FLOW_LEVEL = { Spotting: 1, Light: 2, Medium: 3, Heavy: 4 };
const MOODS = ['Happy', 'Calm', 'Okay', 'Low', 'Irritable', 'Anxious', 'Tired'];
const SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Back pain', 'Nausea', 'Fatigue', 'Tender breasts', 'Acne', 'Cravings', 'Dizziness'];
const PAD_TYPES = ['Regular', 'Large', 'Overnight'];
const flc = f => 'fl-' + String(f || 'x')[0].toLowerCase();
const CATEGORIES = ['Lab report', 'Prescription', 'Scan / X-ray', 'Discharge summary', 'Bill / Receipt', 'Other'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);   // b - a
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const fmtDate = (s, o) => parseYmd(s).toLocaleDateString('en-IN', o || { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const fmtShort = s => fmtDate(s, { day: '2-digit', month: 'short', year: 'numeric' });
const fmtClock = iso => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/* ===================================================================
 * State (saved in localStorage)
 * ================================================================= */
const defaults = () => ({
  medicines: [], logs: {}, periods: [], days: {}, files: [], queue: [], lastPull: 0,
  auth: null,                                   // { token, expires, user } after sign-in
  settings: { url: '', person: 'Me', sheetUrl: '' },
  ui: { person: '*', tab: 'today', medSort: 'status', docSort: 'new', logSort: 'new', perSort: 'new', recSort: 'new' }
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw), b = defaults();
      return { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) }, ui: { ...b.ui, ...(d.ui || {}) } };
    }
  } catch (e) { console.warn('load failed', e); }
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not save in this browser (storage full or blocked)', 'err'); }
  scheduleNativeSoon();
}

// transient UI state
const ui = {
  date: todayStr(), lastToday: todayStr(), calMonth: todayStr().slice(0, 7),
  rep: { from: addDays(todayStr(), -6), to: todayStr(), med: '' },
  docCat: '', docSearch: '', medFilter: '', perView: 'cal', perSel: '', rec: { from: todayStr().slice(0, 8) + '01', to: todayStr(), year: '' },
  editingMed: null, editingPeriod: null, editingDoc: null, pendingFiles: [], mail: null,
  upload: {}   // fileId -> 'uploading' | 'error'
};

/* ===================================================================
 * Model helpers
 * ================================================================= */
// The Web app URL comes from config.js (set once, same for web / Windows / Android); Settings is the fallback.
const CFG = window.MEDMON_CONFIG || {};
const backendUrl = () => String(CFG.WEB_APP_URL || S.settings.url || '').trim();
const configured = () => !!backendUrl();
const authed = () => !!(S.auth && S.auth.token && S.auth.expires > Date.now());
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
let locked = false;                              // true while the sign-in screen is showing
// A login from the Users tab is tied to one person: it sees and saves only that person's records
// (the backend enforces this; here it only keeps the screens tidy). The owner's login sees everyone.
const lockedPerson = () => authed() && !S.auth.admin && S.auth.person ? S.auth.person : '';
// The app always opens on this person only; there is no "Everyone" list. Records saved under another
// name (for example "Me") stay hidden until they are moved here (Settings > Move records to another name).
const PRIMARY_PERSON = 'Nithya';
const tiedPerson = () => {
  if (!authed() || lockedPerson()) return '';
  return persons().find(p => p.toLowerCase() === PRIMARY_PERSON.toLowerCase()) || PRIMARY_PERSON;
};
const defaultPerson = () => lockedPerson() || (S.ui.person !== '*' ? S.ui.person : persons().length === 1 ? persons()[0] : (S.settings.person || 'Me'));
const periodPerson = defaultPerson;
const personOk = p => S.ui.person === '*' || p === S.ui.person;
const safeLink = u => /^https:\/\//.test(u || '') ? u : '';          // never open javascript: or other odd links

function persons() {
  if (lockedPerson()) return [lockedPerson()];
  const set = new Set();
  S.medicines.forEach(m => m.person && set.add(m.person));
  S.periods.forEach(p => p.person && set.add(p.person));
  Object.values(S.days).forEach(d => d.person && set.add(d.person));
  S.files.forEach(f => f.person && set.add(f.person));
  if (!set.size) set.add(S.settings.person || 'Me');
  return [...set].sort((a, b) => a.localeCompare(b));
}

const medEnd = m => m.noEnd ? null : addDays(m.startDate, m.days - 1);

/* ----- repeat patterns -----
 *   daily            every day
 *   every:3          every 3 days (counted from the start date)
 *   weekly:1,4       chosen weekdays (0 = Sunday … 6 = Saturday)
 *   monthday:15      once a month on that date (short months use their last day)
 *   nth:2:0          once a month on the Nth weekday: 2nd Sunday  (N = 1..4, or -1 = last)
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' };
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

function parseRepeat(s) {
  const [k, a, b] = String(s || 'daily').split(':');
  if (k === 'every') { const n = parseInt(a, 10); if (n >= 2 && n <= 90) return { kind: 'every', n }; }
  else if (k === 'weekly') {
    const days = [...new Set((a || '').split(',').map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
    if (days.length) return { kind: 'weekly', days };
  }
  else if (k === 'monthday') { const d = parseInt(a, 10); if (d >= 1 && d <= 31) return { kind: 'monthday', d }; }
  else if (k === 'nth') {
    const n = parseInt(a, 10), w = parseInt(b, 10);
    if ([1, 2, 3, 4, -1].includes(n) && w >= 0 && w <= 6) return { kind: 'nth', n, w };
  }
  return { kind: 'daily' };
}
function repeatToStr(r) {
  return r.kind === 'every' ? `every:${r.n}` : r.kind === 'weekly' ? `weekly:${r.days.join(',')}`
    : r.kind === 'monthday' ? `monthday:${r.d}` : r.kind === 'nth' ? `nth:${r.n}:${r.w}` : 'daily';
}
const isDaily = m => parseRepeat(m.repeat).kind === 'daily';
const isDailyKind = k => k === 'daily' || k === 'every';

function repeatText(m) {
  const r = parseRepeat(m.repeat);
  if (r.kind === 'every') return `Every ${r.n} days`;
  if (r.kind === 'weekly') return r.days.length === 7 ? 'Every day' : 'Every ' + r.days.map(d => WEEKDAYS[d].slice(0, 3)).join(', ');
  if (r.kind === 'monthday') return `Monthly on the ${ordinal(r.d)}`;
  if (r.kind === 'nth') return `${ORD[r.n][0].toUpperCase() + ORD[r.n].slice(1)} ${WEEKDAYS[r.w]} of every month`;
  return 'Every day';
}

/** Is this medicine due on that date (ignores the time of day)? */
function occursOn(m, date) {
  if (date < m.startDate || (!m.noEnd && date > medEnd(m))) return false;
  const r = parseRepeat(m.repeat);
  if (r.kind === 'daily') return true;
  if (r.kind === 'every') return diffDays(m.startDate, date) % r.n === 0;
  const d = parseYmd(date), dow = d.getDay(), dom = d.getDate(), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (r.kind === 'weekly') return r.days.includes(dow);
  if (r.kind === 'monthday') return dom === Math.min(r.d, dim);
  if (dow !== r.w) return false;                                   // nth weekday of the month
  return r.n === -1 ? dom + 7 > dim : Math.ceil(dom / 7) === r.n;
}

function nextOccurrence(m, from) {
  const end = medEnd(m);
  for (let i = 0; i < 400; i++) {
    const d = addDays(from, i);
    if (end && d > end) return null;
    if (occursOn(m, d)) return d;
  }
  return null;
}

function dosesOn(date, person) {
  const out = [];
  for (const m of S.medicines) {
    if (person && person !== '*' && m.person !== person) continue;
    if (!occursOn(m, date)) continue;
    const dayNo = diffDays(m.startDate, date) + 1;
    for (const t of m.times) out.push({ key: `${m.id}|${date}|${t.time}`, med: m, date, time: t.time, label: t.label, dayNo });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

const partOf = t => PARTS.find(p => toMin(t) < p[2]);

/** A whole day in one word – the mark under each date in the week strip. */
function dayState(date, person) {
  const s = dosesOn(date, person).map(statusOf), n = k => s.filter(x => x === k).length;
  if (!s.length) return { cls: 'none', text: 'no medicines' };
  const text = `${n('taken')} of ${s.length} taken`;
  if (n('missed')) return { cls: 'bad', text: `${text}, ${n('missed')} missed` };
  if (n('due')) return { cls: 'warn', text: `${text}, ${n('due')} due now` };
  if (n('upcoming')) return { cls: 'soon', text: `${text}, ${n('upcoming')} still to come` };
  return { cls: 'ok', text };
}

function statusOf(d) {
  const l = S.logs[d.key];
  if (l) return l.status;
  const today = todayStr();
  if (d.date > today) return 'upcoming';
  if (d.date < today) return 'missed';
  const diff = nowMin() - toMin(d.time);
  if (diff < 0) return 'upcoming';
  return diff <= MISSED_AFTER_MIN ? 'due' : 'missed';
}

function setDoseStatus(d, status) {
  if (status === null) {
    delete S.logs[d.key];
    enqueue({ op: 'delete', sheet: 'DoseLog', id: d.key });
  } else {
    const row = {
      id: d.key, medId: d.med.id, person: d.med.person, medicine: d.med.name, date: d.date,
      slot: d.label, time: d.time, status, takenAt: status === 'taken' ? new Date().toISOString() : ''
    };
    S.logs[d.key] = row;
    enqueue({ op: 'upsert', sheet: 'DoseLog', row });
  }
  save();
  renderActive();
}

function courseStats(m) {
  const today = todayStr(), end = medEnd(m), last = end && end < today ? end : today;
  let total = 0, taken = 0;
  for (let d = m.startDate, i = 0; d <= last && i < 1100; d = addDays(d, 1), i++) {
    if (!occursOn(m, d)) continue;
    for (const t of m.times) { total++; if (S.logs[`${m.id}|${d}|${t.time}`]?.status === 'taken') taken++; }
  }
  return { total, taken };
}

/* ----- periods ----- */
function periodStats(person) {
  const list = S.periods.filter(p => p.person === person).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const gaps = [];
  for (let i = 1; i < list.length; i++) gaps.push(diffDays(list[i - 1].startDate, list[i].startDate));
  const lens = list.filter(p => p.endDate).map(p => diffDays(p.startDate, p.endDate) + 1);
  const avgCycle = gaps.length ? Math.round(avg(gaps.slice(-6))) : null;
  const avgLen = lens.length ? Math.round(avg(lens.slice(-6))) : null;
  const cycleLen = avgCycle || 28, perLen = avgLen || 5;
  const last = list[list.length - 1] || null;
  return { list, gaps, avgCycle, avgLen, cycleLen, perLen, last, next: last ? addDays(last.startDate, cycleLen) : null };
}

function periodDaySets(person) {
  const ps = periodStats(person), actual = new Set(), pred = new Set(), today = todayStr();
  ps.list.forEach(p => {
    let end = p.endDate;
    if (!end) { const cap = addDays(p.startDate, 9); end = p.startDate <= today ? (today < cap ? today : cap) : p.startDate; }
    for (let d = p.startDate, i = 0; d <= end && i < 31; d = addDays(d, 1), i++) actual.add(d);
  });
  if (ps.last) {
    for (let k = 1; k <= 3; k++) {
      const s = addDays(ps.last.startDate, ps.cycleLen * k);
      for (let i = 0; i < ps.perLen; i++) { const d = addDays(s, i); if (!actual.has(d)) pred.add(d); }
    }
  }
  return { actual, pred };
}

/* ===================================================================
 * Row converters (app <-> Google Sheet)
 * ================================================================= */
const timesToStr = ts => ts.map(t => `${t.label}@${t.time}`).join('|');
function parseTimes(s) {
  return String(s || '').split('|').filter(Boolean).map(x => {
    const [label, time] = x.split('@');
    return { label: label || 'Dose', time: (time || '').trim() };
  }).filter(t => /^\d{1,2}:\d{2}$/.test(t.time)).map(t => ({ label: t.label, time: t.time.padStart(5, '0') }));
}
const medToRow = m => ({ id: m.id, person: m.person, name: m.name, type: m.type, dose: m.dose, startDate: m.startDate, days: m.days, noEnd: m.noEnd, times: timesToStr(m.times), food: m.food, notes: m.notes, createdAt: m.createdAt, repeat: m.repeat || 'daily' });
function rowToMed(r) {
  if (!r || !r.id || !isYmd(r.startDate)) return null;
  const times = parseTimes(r.times);
  if (!times.length) return null;
  return { id: String(r.id), person: r.person || 'Me', name: r.name || '', type: r.type || 'Tablet', dose: r.dose || '', startDate: r.startDate, days: parseInt(r.days, 10) || 1, noEnd: String(r.noEnd) === 'true', times, repeat: repeatToStr(parseRepeat(r.repeat)), food: r.food || 'Any time', notes: r.notes || '', createdAt: r.createdAt || '' };
}
const rowToLog = r => ({ id: r.id, medId: r.medId, person: r.person, medicine: r.medicine, date: r.date, slot: r.slot, time: r.time, status: r.status, takenAt: r.takenAt || '' });
const periodToRow = p => ({ id: p.id, person: p.person, startDate: p.startDate, endDate: p.endDate || '', flow: p.flow, pain: p.pain, notes: p.notes });
function rowToPeriod(r) {
  if (!r || !r.id || !isYmd(r.startDate)) return null;
  return { id: String(r.id), person: r.person || 'Me', startDate: r.startDate, endDate: isYmd(r.endDate) ? r.endDate : '', flow: r.flow || 'Medium', pain: parseInt(r.pain, 10) || 0, notes: r.notes || '' };
}
const dayKey = (p, d) => `${p}|${d}`;
const dayToRow = d => ({ id: d.id, person: d.person, date: d.date, flow: d.flow, pain: d.pain, mood: d.mood, symptoms: d.symptoms.join(','), notes: d.notes, pads: d.pads, padType: d.padType });
function rowToDay(r) {
  if (!r || !r.id || !isYmd(r.date)) return null;
  const person = r.person || 'Me';
  return { id: dayKey(person, r.date), person, date: r.date, flow: FLOWS.includes(r.flow) ? r.flow : '', pain: Math.min(10, Math.max(0, parseInt(r.pain, 10) || 0)),
    mood: r.mood || '', symptoms: String(r.symptoms || '').split(',').map(x => x.trim()).filter(Boolean), notes: r.notes || '',
    pads: Math.min(40, Math.max(0, parseInt(r.pads, 10) || 0)), padType: PAD_TYPES.includes(r.padType) ? r.padType : 'Regular' };
}
const fileToRow = f => ({ id: f.id, person: f.person, title: f.title, category: f.category, date: f.date, notes: f.notes, fileName: f.fileName, mime: f.mime, size: f.size, driveId: f.driveId || '', driveUrl: f.driveUrl || '', thumb: f.thumb || '', createdAt: f.createdAt });
function rowToFile(r) {
  if (!r || !r.id) return null;
  return { id: String(r.id), person: r.person || 'Me', title: r.title || r.fileName || 'Report', category: r.category || 'Other', date: isYmd(r.date) ? r.date : todayStr(), notes: r.notes || '', fileName: r.fileName || '', mime: r.mime || '', size: parseInt(r.size, 10) || 0, driveId: r.driveId || '', driveUrl: r.driveUrl || '', thumb: r.thumb || '', createdAt: r.createdAt || '' };
}

/* ===================================================================
 * Google Sheet / Drive sync
 * ================================================================= */
let syncState = 'ok', syncMsg = '', flushing = false, flushTimer = null;

function setSync(state, msg) { syncState = state; syncMsg = msg || ''; renderPill(); }
function renderPill() {
  const p = $('#syncPill'), q = S.queue.length;
  let cls = 'off', txt = 'Local only', tip = 'Not connected to Google. Click to open Settings.';
  if (configured()) {
    if (syncState === 'busy') { cls = 'busy'; txt = 'Syncing…'; tip = 'Talking to Google…'; }
    else if (syncState === 'err') { cls = 'err'; txt = 'Sync failed – retry'; tip = syncMsg || 'Click to try again'; }
    else if (q > 0) { cls = 'wait'; txt = `${q} waiting`; tip = 'Changes waiting to be sent. Click to sync now.'; }
    else { cls = 'ok'; txt = 'Synced'; tip = 'Saved in your Google Sheet. Click to sync now.'; }
  }
  p.className = 'pill ' + cls; p.textContent = txt; p.title = tip;
}

function enqueue(op) {
  const id = op.row ? op.row.id : op.id;
  S.queue = S.queue.filter(q => !(q.sheet === op.sheet && (q.row ? q.row.id : q.id) === id));
  S.queue.push(op);
  save(); renderPill();
  if (configured()) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 700); }
}

/** One POST to the Apps Script web app. A text/plain body = "simple request": the browser sends no CORS pre-flight. */
async function post(payload) {
  const url = backendUrl();
  if (!url) throw new Error('The Web app URL is not set (see config.js)');
  let res;
  try { res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' }); }
  catch (e) { throw new Error('Cannot reach Google (offline, or wrong URL)'); }
  if (!res.ok) throw new Error('Google answered HTTP ' + res.status);
  try { return await res.json(); }
  catch (e) { throw new Error('Unexpected reply – deploy the web app with access “Anyone”'); }
}

/** A call that needs a signed-in session. */
async function api(action, payload = {}) {
  const j = await post({ action, token: S.auth && S.auth.token, ...payload });
  if (!j.ok) {
    if (j.code === 'AUTH') lockApp('Your session ended. Please sign in again.');
    throw new Error(j.error || 'Server error');
  }
  return j;
}

async function flush() {
  if (flushing || !configured() || !authed()) return !S.queue.length;
  flushing = true;
  try {
    while (S.queue.length) {
      setSync('busy');
      const batch = S.queue.slice(0, 100);
      try { await api('bulk', { ops: batch }); }
      catch (e) {
        if (!/Unknown sheet: DayLog/.test(e.message)) throw e;      // the deployed Google script is older than this page
        S.queue = S.queue.filter(q => q.sheet !== 'DayLog'); S.settings.dayLogPending = true; save();
        if (!ui.oldDayLog) { ui.oldDayLog = true; toast('Daily log is kept on this device only until you update backend/Code.gs in Apps Script.', 'err'); }
        continue;
      }
      const sent = new Set(batch);
      S.queue = S.queue.filter(q => !sent.has(q));
      save();
    }
    setSync('ok');
    return true;
  } catch (e) { setSync('err', e.message); return false; }
  finally { flushing = false; }
}

function applyRemote(j) {
  const me = lockedPerson();
  if (me) ['medicines', 'logs', 'periods', 'days', 'files'].forEach(k => (j[k] || []).forEach(r => { r.person = me; }));
  S.medicines = (j.medicines || []).map(rowToMed).filter(Boolean);
  S.logs = {};
  (j.logs || []).forEach(r => { if (r.id) S.logs[r.id] = rowToLog(r); });
  S.periods = (j.periods || []).map(rowToPeriod).filter(Boolean);
  if (Array.isArray(j.days)) {                                    // an older backend sends none: keep what is on this device
    const mine = S.days; S.days = {};
    j.days.forEach(r => { const d = rowToDay(r); if (d) S.days[d.id] = d; });
    if (S.settings.dayLogPending) {                               // days saved while the backend could not store them
      Object.values(mine).forEach(d => { if (!S.days[d.id]) { S.days[d.id] = d; enqueue({ op: 'upsert', sheet: 'DayLog', row: dayToRow(d) }); } });
      S.settings.dayLogPending = false;
    }
  }
  const remote = (j.files || []).map(rowToFile).filter(Boolean);
  const ids = new Set(remote.map(f => f.id));
  S.files = remote.concat(S.files.filter(f => !f.driveId && !ids.has(f.id)));   // keep files still waiting to upload
}

async function pull() {
  if (!configured() || !authed()) return false;
  if (!(await flush())) return false;
  try {
    setSync('busy');
    applyRemote(await api('getAll'));
    S.lastPull = Date.now(); save();
    setSync('ok'); renderAll();
    return true;
  } catch (e) { setSync('err', e.message); return false; }
}

function queueAll() {
  S.medicines.forEach(m => enqueue({ op: 'upsert', sheet: 'Medicines', row: medToRow(m) }));
  Object.values(S.logs).forEach(l => enqueue({ op: 'upsert', sheet: 'DoseLog', row: l }));
  S.periods.forEach(p => enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(p) }));
  Object.values(S.days).forEach(d => enqueue({ op: 'upsert', sheet: 'DayLog', row: dayToRow(d) }));
  S.files.filter(f => f.driveId).forEach(f => enqueue({ op: 'upsert', sheet: 'Files', row: fileToRow(f) }));
}

async function syncNow() {
  if (!configured()) { showTab('settings'); return; }
  if (!authed()) { showLogin('Please sign in.'); return; }
  const ok = await pull();
  if (ok) { await uploadPending(); toast('Synced with Google Sheet'); } else toast('Sync failed: ' + syncMsg, 'err');
}

/* ===================================================================
 * Report files: blobs in IndexedDB, uploaded to Drive when connected
 * ================================================================= */
const mem = new Map();
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (this.db) return res(this.db);
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open('medmon-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('blobs', mode), req = fn(t.objectStore('blobs'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  },
  async put(id, blob) { try { await this.tx('readwrite', s => s.put(blob, id)); } catch (e) { mem.set(id, blob); } },
  async get(id) { try { return (await this.tx('readonly', s => s.get(id))) || mem.get(id) || null; } catch (e) { return mem.get(id) || null; } },
  async del(id) { mem.delete(id); try { await this.tx('readwrite', s => s.delete(id)); } catch (e) { /* ignore */ } },
  async clear() { mem.clear(); try { await this.tx('readwrite', s => s.clear()); } catch (e) { /* ignore */ } }
};

async function makeThumb(file) {
  if (!file.type.startsWith('image/')) return '';
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 180 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let q = 0.7, out = c.toDataURL('image/jpeg', q);
    while (out.length > 30000 && q > 0.2) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
    return out.length > 40000 ? '' : out;      // a Google Sheet cell holds max 50 000 characters
  } catch (e) { return ''; }
}

const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function uploadOne(f) {
  const blob = await idb.get(f.id);
  if (!blob) throw new Error('The file is not on this device any more');
  ui.upload[f.id] = 'uploading'; renderActive();
  try {
    const j = await api('uploadFile', { meta: fileToRow(f), data: await blobToBase64(blob) });
    f.driveId = j.driveId; f.driveUrl = j.driveUrl;
    delete ui.upload[f.id]; save();
  } catch (e) { ui.upload[f.id] = 'error'; throw e; }
}

let uploadingAll = false;
async function uploadPending() {
  if (!configured() || !authed() || uploadingAll) return;
  uploadingAll = true;
  let failed = 0, done = 0, lastErr = '';
  try {
    for (const f of S.files.filter(x => !x.driveId)) {
      try { await uploadOne(f); done++; } catch (e) { failed++; lastErr = e.message; }
    }
  } finally { uploadingAll = false; renderActive(); }
  if (done) toast(`${plural(done, 'report file')} saved to Google Drive`);
  if (failed) toast('Upload failed: ' + lastErr, 'err');
}

async function openDoc(id) {
  const f = S.files.find(x => x.id === id); if (!f) return;
  const blob = await idb.get(id);
  if (blob && !(isNative() && f.driveUrl)) {          // in the Android app a Drive link opens better than a local blob
    if ((blob.type || f.mime).startsWith('image/')) return showImage(f.title, blob);
    const url = URL.createObjectURL(blob);
    if (!window.open(url, '_blank')) toast('This file could not be opened in a new tab here', 'err');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } else if (safeLink(f.driveUrl)) window.open(safeLink(f.driveUrl), '_blank', 'noopener');
  else toast('This file is not available on this device', 'err');
}

let viewUrl = '';
function showImage(title, blob) {
  viewUrl = URL.createObjectURL(blob);
  $('#viewTitle').textContent = title;
  $('#viewImg').src = viewUrl; $('#viewImg').alt = title;
  $('#viewDialog').showModal();
}

async function downloadDoc(id) {
  const f = S.files.find(x => x.id === id); if (!f) return;
  const blob = await idb.get(id);
  if (!blob) { if (safeLink(f.driveUrl)) window.open(safeLink(f.driveUrl), '_blank', 'noopener'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = f.fileName || f.title;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ===================================================================
 * Login – the user name + password are checked by YOUR Google Apps Script,
 * so the data is only returned after a correct sign-in.
 * ================================================================= */
function showLogin(msg, isErr = true) {
  locked = true;
  $('#loginForm').hidden = false; $('#forgotForm').hidden = true;
  document.body.classList.add('locked');
  $('#loginScreen').hidden = false;
  const m = $('#loginMsg'); m.textContent = msg || ''; m.className = 'msg' + (isErr ? ' err' : '');
  $('#loginPass').value = '';
  setTimeout(() => ($('#loginUser').value ? $('#loginPass') : $('#loginUser')).focus(), 60);
}
function hideLogin() { locked = false; document.body.classList.remove('locked'); $('#loginScreen').hidden = true; }
function lockApp(msg) { S.auth = null; save(); showLogin(msg); }

async function doLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn'), m = $('#loginMsg');
  btn.disabled = true; m.className = 'msg'; m.textContent = 'Signing in…';
  try {
    const user = $('#loginUser').value.trim();
    const j = await post({ action: 'login', user, password: $('#loginPass').value });
    if (!j.ok) throw new Error(j.error || 'Sign-in failed');
    const who = j.user || user;
    if (S.settings.lastUser && S.settings.lastUser !== who) {           // a different person signs in on this device:
      const settings = S.settings;                                      // nothing of the previous one may stay or be uploaded
      S = { ...defaults(), settings };
      await idb.clear();
    }
    S.settings.lastUser = who;
    S.auth = { token: j.token, expires: j.expires, user: who, person: j.person || '', admin: j.role ? j.role === 'admin' : true };
    ui.mail = null;
    save();
    $('#loginPass').value = '';
    hideLogin();
    await startApp(true);
  } catch (er) { m.className = 'msg err'; m.textContent = er.message; }
  finally { btn.disabled = false; }
}

const oldBackendMsg = e => /Unknown action/.test(e.message) ? 'The Google backend is an older version. The owner must paste the new backend/Code.gs into Apps Script and deploy a new version.' : e.message;

function forgotView(on) {
  $('#loginForm').hidden = on; $('#forgotForm').hidden = !on;
  $('#fgStep1').hidden = false; $('#fgStep2').hidden = true; $('#fgMsg').textContent = ''; $('#fgMsg').className = 'msg';
  if (on) { $('#fgUser').value = $('#loginUser').value.trim(); setTimeout(() => $('#fgUser').focus(), 50); }
}
async function sendResetCode(e) {
  e.preventDefault();
  const m = $('#fgMsg'), btn = $('#fgSend'), user = $('#fgUser').value.trim();
  if (!user) return;
  btn.disabled = true; m.className = 'msg'; m.textContent = 'Sending…';
  try {
    const j = await post({ action: 'forgot', user });
    if (!j.ok) throw new Error(j.error || 'Could not send the code');
    m.className = 'msg good'; m.textContent = j.message;
    $('#fgStep1').hidden = true; $('#fgStep2').hidden = false; $('#fgCode').focus();
  } catch (er) { m.className = 'msg err'; m.textContent = oldBackendMsg(er); }
  finally { btn.disabled = false; }
}
async function resetPassword() {
  const m = $('#fgMsg'), user = $('#fgUser').value.trim(), pw = $('#fgPass').value;
  if (pw.length < 8) { m.className = 'msg err'; m.textContent = 'Choose a password of at least 8 characters.'; return; }
  $('#fgReset').disabled = true; m.className = 'msg'; m.textContent = 'Changing…';
  try {
    const j = await post({ action: 'resetPassword', user, code: $('#fgCode').value.trim(), newPassword: pw });
    if (!j.ok) throw new Error(j.error || 'Could not change the password');
    $('#fgPass').value = ''; $('#fgCode').value = '';
    $('#loginUser').value = user.includes('@') ? '' : user;
    showLogin(j.message, false);
  } catch (er) { m.className = 'msg err'; m.textContent = oldBackendMsg(er); }
  finally { $('#fgReset').disabled = false; }
}
async function changePassword(e) {
  e.preventDefault();
  const m = $('#pwMsg'), a = $('#pwNew').value;
  const say = (t, k = '') => { m.textContent = t; m.className = 'msg ' + k; };
  if (a !== $('#pwNew2').value) return say('The two new passwords are not the same.', 'err');
  say('Changing…');
  try { const j = await api('changePassword', { oldPassword: $('#pwOld').value, newPassword: a }); say(j.message || 'Password changed.', 'good'); $('#pwForm').reset(); }
  catch (er) { say(oldBackendMsg(er), 'err'); }
}

async function logout() {
  if (configured() && authed()) await flush();
  const n = S.queue.length;
  if (n && !(await ask(`${plural(n, 'change')} could not be saved to Google yet and will be lost. Sign out anyway?`, { title: 'Unsaved changes', ok: 'Sign out', danger: true }))) return;
  try { if (authed()) await api('logout'); } catch (e) { /* ignore */ }
  const LN = nativeNotif();
  if (LN) { try { const p = await LN.getPending(); if (p.notifications.length) await LN.cancel({ notifications: p.notifications.map(x => ({ id: x.id })) }); } catch (e) { /* ignore */ } }
  const settings = S.settings;
  S = { ...defaults(), settings };                 // nothing stays on this device; the Sheet keeps everything
  await idb.clear();
  save();
  showLogin('You are signed out. Your records stay safe in your Google Sheet.', false);
}

/** Runs after the page opens with a valid session, or right after a fresh sign-in. */
async function startApp(fresh) {
  renderHeader(); showTab(S.ui.tab || 'today'); tick();
  if (!configured()) return;
  if (fresh) await connectCore(); else await pull();
  uploadPending();
  scheduleNativeSoon();
}

/* ===================================================================
 * Toast, confirm, sound, notifications
 * ================================================================= */
/** In-page “are you sure?” – resolves true only when the confirm button is pressed. */
let askDone = null;                              // answers the question that is open now
function answer(yes) {
  const done = askDone; askDone = null;
  if ($('#askDialog').open) $('#askDialog').close();
  if (done) done(yes);
}
function ask(text, { title = 'Please confirm', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  if (askDone) answer(false);
  return new Promise(res => {
    $('#askTitle').textContent = title; $('#askText').textContent = text;
    $('#askYes').textContent = ok; $('#askNo').textContent = cancel;
    $('#askYes').className = 'btn ' + (danger ? 'danger solid' : 'primary');
    askDone = res;
    $('#askDialog').showModal();
  });
}
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'alarm' ? 9000 : 4000);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
  } catch (e) { /* sound not allowed yet */ }
}
/* Android app (Capacitor): real phone notifications are scheduled ahead, so they ring even when the app is closed. */
const nativeNotif = () => isNative() ? (window.Capacitor.Plugins || {}).LocalNotifications : null;

let nativeTimer = null;
function scheduleNativeSoon() {
  if (!nativeNotif() || locked) return;
  clearTimeout(nativeTimer);
  nativeTimer = setTimeout(scheduleNative, 2000);
}
async function scheduleNative() {
  const LN = nativeNotif();
  if (!LN || locked) return;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return;
    const pending = await LN.getPending();
    if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const list = [], now = Date.now(), t0 = todayStr(), many = persons().length > 1;
    for (let i = 0; i < 14 && list.length < 60; i++) {
      const date = addDays(t0, i);
      for (const d of dosesOn(date, '*')) {
        const at = new Date(`${date}T${d.time}:00`);
        if (at.getTime() <= now || S.logs[d.key] || list.length >= 60) continue;
        list.push({
          id: list.length + 1, title: '💊 Time for your medicine',
          body: `${d.med.name}${d.med.dose ? ' – ' + d.med.dose : ''} (${d.label}, ${fmtTime(d.time)})${many ? ' · ' + d.med.person : ''}`,
          schedule: { at, allowWhileIdle: true }
        });
      }
    }
    if (list.length) await LN.schedule({ notifications: list });
  } catch (e) { console.warn('phone reminders failed', e); }
}

async function notifyState() {
  const el = $('#notifyState'), LN = nativeNotif();
  if (LN) {
    try { el.textContent = (await LN.checkPermissions()).display === 'granted' ? 'On ✔ (phone notifications)' : 'Off'; } catch (e) { el.textContent = 'Off'; }
    return;
  }
  if (!('Notification' in window)) el.textContent = 'Not supported in this browser';
  else el.textContent = Notification.permission === 'granted' ? 'On ✔' : Notification.permission === 'denied' ? 'Blocked in browser settings' : 'Off';
}

let notified = {};
try { notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); } catch (e) { notified = {}; }

function checkReminders() {
  const today = todayStr();
  let due = 0;
  for (const d of dosesOn(today, '*')) {
    if (statusOf(d) !== 'due') continue;
    due++;
    if (!notified[d.key]) {
      notified[d.key] = today;
      const text = `${d.med.name}${d.med.dose ? ' – ' + d.med.dose : ''} (${d.label}, ${fmtTime(d.time)})${d.med.person ? ' · ' + d.med.person : ''}`;
      toast('💊 Time to take: ' + text, 'alarm'); beep();
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('💊 Time for your medicine', { body: text, tag: d.key }); } catch (e) { /* ignore */ }
      }
    }
  }
  Object.keys(notified).forEach(k => { if (notified[k] !== today) delete notified[k]; });
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified)); } catch (e) { /* ignore */ }
  document.title = (due ? `(${due}) ` : '') + 'Medicine & Period Monitor';
}

function tick() {
  if (locked) return;
  const t = todayStr();
  if (t !== ui.lastToday) { if (ui.date === ui.lastToday) ui.date = t; ui.lastToday = t; renderHeader(); }
  checkReminders();
  if (!document.hidden && S.ui.tab === 'today' && !$('dialog[open]')) renderToday();
}

/* ===================================================================
 * Rendering – header, tabs
 * ================================================================= */
function renderHeader() {
  $('#todayLabel').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const list = persons(), me = lockedPerson();
  if (me || (S.ui.person !== '*' && !list.includes(S.ui.person))) S.ui.person = '*';
  const sel = $('#personFilter');
  const tied = tiedPerson();
  const only = me || tied || (list.length === 1 ? list[0] : '');  // one person: show the name, nothing to choose
  if (only) S.ui.person = tied || '*';                            // tied: other names stay out of every screen
  sel.innerHTML = only ? `<option value="${esc(S.ui.person)}">${esc(only)}</option>` : `<option value="*">Everyone</option>` + list.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  sel.value = S.ui.person; sel.disabled = !!only;
  sel.parentElement.classList.toggle('static', !!only);          // just the name, no drop-down arrow
  ['#mPerson', '#pPerson', '#dPerson'].forEach(s => { $(s).readOnly = !!me; });
  $('#personList').innerHTML = list.map(p => `<option value="${esc(p)}">`).join('');
  renderPill();
}

function showTab(name) {
  S.ui.tab = name; save();
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tabpanel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  renderActive();
}

function gotoDay(date) {
  ui.date = date;
  if (S.ui.tab !== 'today') showTab('today'); else renderToday();
}

const groupHead = (label, count = '', icon = '') => `<h3 class="group-head">${icon ? ico(icon) : ''}<span>${esc(label)}</span><i></i>${count ? `<small>${esc(count)}</small>` : ''}</h3>`;

/** A sorted list with a heading each time the group name changes. */
function grouped(list, groupOf, itemHtml, noun) {
  let last = null;
  return list.map(x => {
    const g = groupOf(x), head = g && g !== last ? groupHead(g, plural(list.filter(y => groupOf(y) === g).length, noun)) : '';
    last = g;
    return head + itemHtml(x);
  }).join('');
}

/** Calendar leaf showing the date a record belongs to. */
function leaf(s) {
  const d = parseYmd(s);
  return `<div class="leaf" title="${fmtDate(s)}"><span>${d.toLocaleDateString('en-IN', { month: 'short' })}</span><b>${pad(d.getDate())}</b><small>${d.getFullYear()}</small></div>`;
}

function renderAll() { renderHeader(); renderActive(); }
function renderActive() {
  ({ today: renderToday, meds: renderMeds, periods: renderPeriods, reports: renderReports, docs: renderDocs, settings: renderSettings }[S.ui.tab] || renderToday)();
}

/* ===================================================================
 * Today
 * ================================================================= */
function renderToday() {
  const date = ui.date, today = todayStr(), person = S.ui.person;
  $('#dayTitle').textContent = date === today ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : date === addDays(today, 1) ? 'Tomorrow' : fmtDate(date, { weekday: 'long' });
  $('#daySub').textContent = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const pick = $('#dayPick');
  if (document.activeElement !== pick) pick.value = date;
  $('#dayToday').disabled = date === today;

  // the week around the chosen day, each date marked with how it went
  const weekStart = addDays(date, -parseYmd(date).getDay());
  $('#weekStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i), st = dayState(d, person);
    return `<button type="button" class="wk-day${d === date ? ' sel' : ''}${d === today ? ' today' : ''}" data-day="${d}" aria-pressed="${d === date}" aria-label="${fmtDate(d)}: ${st.text}" title="${st.text}">
      <span class="wk-dow">${fmtDate(d, { weekday: 'short' })}</span><span class="wk-num">${parseYmd(d).getDate()}</span><i class="wk-mark ${st.cls}"></i></button>`;
  }).join('');

  const rows = dosesOn(date, person).map(d => ({ d, s: statusOf(d) }));
  const cnt = k => rows.filter(r => r.s === k).length;
  const total = rows.length, taken = cnt('taken');

  if (!total) {
    $('#todaySummary').innerHTML = '';
    $('#doseList').innerHTML = `<div class="card empty"><div class="big">${ico('calendar')}</div>
      <p><b>No medicines scheduled for this day.</b></p>
      <p>Add a tablet or tonic with its days and timings (for example 5 days, morning &amp; night).</p>
      <div class="btn-row"><button class="btn primary" data-go="meds-add">${ico('plus')}Add medicine</button>
      ${S.medicines.length || S.periods.length ? '' : '<button class="btn ghost" data-go="sample">Try sample data</button>'}</div></div>`;
  } else {
    let next = '';
    if (date === today) {
      const n = rows.find(r => r.s === 'due') || rows.find(r => r.s === 'upcoming');
      if (n) {
        const mins = toMin(n.d.time) - nowMin();
        next = n.s === 'due'
          ? `Now: ${esc(n.d.med.name)} (${fmtTime(n.d.time)})`
          : `Next: ${esc(n.d.med.name)} at ${fmtTime(n.d.time)} (in ${mins >= 60 ? Math.floor(mins / 60) + ' h ' : ''}${mins % 60} min)`;
      } else next = 'All done for today';
    }
    const bits = [['due', 'due now'], ['upcoming', 'still to come'], ['missed', 'missed'], ['skipped', 'skipped']].map(([k, l]) => cnt(k) ? `<span class="badge ${k}">${cnt(k)} ${l}</span>` : '').join('');
    $('#todaySummary').innerHTML = `<div class="card summary">
      <div class="ring" style="--p:${Math.round(taken * 100 / total)}"><span>${taken}/${total}</span></div>
      <div class="summary-text"><strong>${taken} of ${plural(total, 'dose')} taken</strong>
      ${bits ? `<div class="tally">${bits}</div>` : '<div class="muted">Everything is on track</div>'}
      ${next ? `<div class="next-up">${next}</div>` : ''}</div></div>`;

    const showPerson = person === '*' && persons().length > 1;
    let part = null;
    $('#doseList').innerHTML = rows.map(({ d, s }) => {
      const m = d.med, log = S.logs[d.key], canMark = d.date <= today, p = partOf(d.time);
      let head = '';
      if (p !== part) {                                   // new part of the day -> heading
        part = p;
        const inPart = rows.filter(r => partOf(r.d.time) === p);
        head = groupHead(p[0], `${inPart.filter(r => r.s === 'taken').length} of ${inPart.length} taken`, p[1]);
      }
      const meta = [showPerson ? ico('user', 'sm') + esc(m.person) : '', isDaily(m) ? `Day ${d.dayNo}${m.noEnd ? '' : ' of ' + m.days}` : esc(repeatText(m)), m.food && m.food !== 'Any time' ? esc(m.food) : '', s === 'taken' && log?.takenAt ? 'taken at ' + fmtClock(log.takenAt) : ''].filter(Boolean).join(' · ');
      let actions = '';
      if (canMark) actions = (s === 'taken' || s === 'skipped')
        ? `<button data-act="undo" data-key="${esc(d.key)}">Undo</button>`
        : `<button data-act="taken" data-key="${esc(d.key)}">${ico('check')}Taken</button><button data-act="skipped" data-key="${esc(d.key)}">Skip</button>`;
      return `${head}<article class="dose ${s}">
        <div class="tile">${ico(TYPE_ICON[m.type] || 'pill')}</div>
        <div class="dose-time"><b>${fmtTime(d.time)}</b><span>${esc(d.label)}</span></div>
        <div class="dose-main">
          <div class="dose-name">${esc(m.name)}${m.dose ? ` <small>· ${esc(m.dose)}</small>` : ''}</div>
          <div class="dose-meta">${meta}</div>
          ${m.notes ? `<div class="dose-note">${esc(m.notes)}</div>` : ''}
        </div>
        <div class="dose-side"><span class="badge ${s}">${STATUS_LABEL[s]}</span><div class="dose-actions">${actions}</div></div>
      </article>`;
    }).join('');
  }
  $('#periodBanner').innerHTML = date === today ? comingUp() + periodBanner() : '';
}

/** Weekly / monthly medicines that are due in the next 2 weeks (they are not on today's list). */
function comingUp() {
  const today = todayStr(), tomorrow = addDays(today, 1), items = [];
  for (const m of S.medicines) {
    if (!personOk(m.person) || isDaily(m)) continue;
    const n = nextOccurrence(m, tomorrow);
    if (n && diffDays(today, n) <= 14) items.push({ m, n });
  }
  items.sort((a, b) => a.n.localeCompare(b.n));
  return items.slice(0, 4).map(({ m, n }) => {
    const left = diffDays(today, n);
    return `<div class="banner info">${ico('calendar')}<span><b>${esc(m.name)}</b>${m.dose ? ' (' + esc(m.dose) + ')' : ''} – ${fmtDate(n, { weekday: 'long', day: 'numeric', month: 'short' })} at ${fmtTime(m.times[0].time)} · ${left === 1 ? 'tomorrow' : 'in ' + left + ' days'}</span></div>`;
  }).join('');
}

function periodBanner() {
  if (!S.periods.length) return '';
  const person = periodPerson(), ps = periodStats(person), today = todayStr();
  if (!ps.last) return '';
  const ongoing = !ps.last.endDate && ps.last.startDate <= today && diffDays(ps.last.startDate, today) < 10;
  if (ongoing) return `<div class="banner">${ico('drop')}<span><b>${esc(person)}</b>: period is on – day ${diffDays(ps.last.startDate, today) + 1}.</span>
    <button class="btn small" data-act="endperiod" data-id="${esc(ps.last.id)}">Mark ended today</button></div>`;
  const left = diffDays(today, ps.next);
  if (left > 7 || left < -10) return '';
  const when = left > 0 ? `in ${plural(left, 'day')}` : left === 0 ? 'today' : `${plural(-left, 'day')} ago`;
  return `<div class="banner">${ico('drop')}<span><b>${esc(person)}</b>: next period expected <b>${fmtShort(ps.next)}</b> (${when}).</span>
    <button class="btn small" data-go="period-add">Log period start</button></div>`;
}

/* ===================================================================
 * Medicines
 * ================================================================= */
function medState(m) {
  const t = todayStr(), e = medEnd(m);
  return t < m.startDate ? 'upcoming' : e && t > e ? 'completed' : 'running';
}

const MED_GROUP = { running: 'Running now', upcoming: 'Starting later', completed: 'Finished' };

function renderMeds() {
  const mine = S.medicines.filter(m => personOk(m.person)), today = todayStr(), sort = S.ui.medSort;
  const count = k => mine.filter(m => medState(m) === k).length;
  $('#medFilter').innerHTML = [['', 'All', mine.length], ['running', 'Running', count('running')], ['upcoming', 'Upcoming', count('upcoming')], ['completed', 'Finished', count('completed')]]
    .map(([k, l, n]) => `<button type="button" class="${ui.medFilter === k ? 'on' : ''}" data-medfilter="${k}" aria-pressed="${ui.medFilter === k}">${l}<b>${n}</b></button>`).join('');
  $('#medSort').value = sort;

  const order = { running: 0, upcoming: 1, completed: 2 }, endKey = m => medEnd(m) || '9999-12-31';
  const cmp = {
    new: (a, b) => b.startDate.localeCompare(a.startDate),
    old: (a, b) => a.startDate.localeCompare(b.startDate),
    end: (a, b) => endKey(a).localeCompare(endKey(b)),
    name: () => 0
  }[sort] || ((a, b) => order[medState(a)] - order[medState(b)] || b.startDate.localeCompare(a.startDate));
  const list = mine.filter(m => !ui.medFilter || medState(m) === ui.medFilter).sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  if (!list.length) {
    $('#medList').innerHTML = `<div class="card empty"><div class="big">${ico('pill')}</div><p><b>${mine.length ? 'No medicines in this view.' : 'No medicines yet.'}</b></p><p>${mine.length ? 'Choose “All” to see every medicine.' : 'Tap “Add medicine” to create a tablet / tonic course.'}</p></div>`;
    return;
  }
  const month = s => fmtDate(s, { month: 'long', year: 'numeric' });
  const groupOf = m => sort === 'name' ? ''
    : sort === 'new' || sort === 'old' ? 'Started ' + month(m.startDate)
    : sort === 'end' ? (medEnd(m) ? (medEnd(m) < today ? 'Ended ' : 'Ends ') + month(medEnd(m)) : 'No end date')
    : MED_GROUP[medState(m)];
  $('#medList').innerHTML = grouped(list, groupOf, m => {
    const st = medState(m), cs = courseStats(m), e = medEnd(m);
    const dayNo = Math.max(0, Math.min(m.days, diffDays(m.startDate, today) + 1));
    const pct = m.noEnd ? 100 : Math.round(dayNo * 100 / m.days);
    const left = e ? diffDays(today, e) : null, daily = isDaily(m);
    const next = st === 'completed' ? null : nextOccurrence(m, today);
    const nextTxt = next ? 'next dose ' + fmtDate(next, { weekday: 'short', day: '2-digit', month: 'short' }) + (next === today ? ' (today)' : '') : 'no more doses';
    const info = st === 'upcoming' ? `Starts ${fmtShort(m.startDate)}`
      : st === 'completed' ? `Course finished ${fmtShort(e)}`
      : !daily ? `${repeatText(m)} · ${nextTxt}`
      : m.noEnd ? `Day ${dayNo} · every day, no end date`
      : `Day ${dayNo} of ${m.days} · ${left === 0 ? 'last day today' : plural(left, 'day') + ' left'}`;
    return `<article class="med ${st}">
      <div class="med-head">
        ${leaf(m.startDate)}
        <div class="med-title">
          <div class="med-name">${ico(TYPE_ICON[m.type] || 'pill')}${esc(m.name)} <span class="badge ${st}">${st === 'completed' ? 'Finished' : st[0].toUpperCase() + st.slice(1)}</span></div>
          <div class="muted">${ico('user', 'sm')}${esc(m.person)} · ${esc(m.type)}${m.dose ? ' · ' + esc(m.dose) : ''}${m.food !== 'Any time' ? ' · ' + esc(m.food) : ''}</div>
          <div class="muted">${fmtShort(m.startDate)} → ${e ? fmtShort(e) : 'ongoing'}${m.noEnd ? '' : ` (${plural(m.days, 'day')})`}</div>
        </div>
      </div>
      <div class="chips">${daily ? '' : `<span class="chip alt">${ico('repeat', 'sm')}${esc(repeatText(m))}</span>`}${m.times.map(t => `<span class="chip">${esc(t.label)} · ${fmtTime(t.time)}</span>`).join('')}</div>
      ${m.noEnd ? '' : `<div class="progress"><span style="width:${pct}%"></span></div>`}
      ${m.notes ? `<div class="dose-note">${esc(m.notes)}</div>` : ''}
      <div class="med-foot">
        <small>${info}${cs.total ? ` · taken ${cs.taken} of ${cs.total} doses so far` : ''}</small>
        <div class="med-actions">
          <button class="btn ghost" data-act="edit" data-id="${esc(m.id)}">Edit</button>
          ${st === 'running' && (m.noEnd || left > 0) ? `<button class="btn ghost" data-act="end" data-id="${esc(m.id)}">End today</button>` : ''}
          <button class="btn danger" data-act="del" data-id="${esc(m.id)}">Delete</button>
        </div>
      </div>
    </article>`;
  }, 'medicine');
}

/* ----- medicine form ----- */
function updateRepeatUI() {
  const k = $('#mRepeat').value, dailyish = isDailyKind(k);
  $$('#repOpts [data-rep]').forEach(el => { el.hidden = el.dataset.rep !== k; });
  $('#mDaysWrap').hidden = !dailyish; $('#mNoEndWrap').hidden = !dailyish; $('#mUntilWrap').hidden = dailyish;
}

function readRepeat() {
  const k = $('#mRepeat').value;
  if (k === 'every') {
    const n = parseInt($('#mEvery').value, 10);
    return n >= 2 && n <= 90 ? { str: `every:${n}` } : { err: '“Every … days” must be between 2 and 90.' };
  }
  if (k === 'weekly') {
    const ds = $$('#wkDays input:checked').map(i => i.value);
    return ds.length ? { str: `weekly:${ds.join(',')}` } : { err: 'Choose at least one day of the week.' };
  }
  if (k === 'monthday') {
    const d = parseInt($('#mMonthDay').value, 10);
    return d >= 1 && d <= 31 ? { str: `monthday:${d}` } : { err: 'Day of the month must be between 1 and 31.' };
  }
  if (k === 'nth') return { str: `nth:${$('#mNth').value}:${$('#mNthDay').value}` };
  return { str: 'daily' };
}
function addTimeRow(label = 'Morning', time = '08:00') {
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = `<input class="t-label" maxlength="20" value="${esc(label)}" aria-label="Name of timing" placeholder="Morning">
    <input class="t-time" type="time" value="${esc(time)}" required aria-label="Time">
    <button type="button" class="icon-btn t-del" aria-label="Remove time">${ico('x')}</button>`;
  $('#timeRows').appendChild(row);
}

function openMedDialog(id) {
  const m = id ? S.medicines.find(x => x.id === id) : null;
  ui.editingMed = m ? m.id : null;
  $('#medDialogTitle').textContent = m ? 'Edit medicine' : 'Add medicine';
  $('#mPerson').value = m ? m.person : defaultPerson();
  $('#mType').value = m ? m.type : 'Tablet';
  $('#mName').value = m ? m.name : '';
  $('#mDose').value = m ? m.dose : '1 tablet';
  $('#mFood').value = m ? m.food : 'After food';
  $('#mStart').value = m ? m.startDate : todayStr();
  $('#mDays').value = m ? m.days : 5;
  $('#mNoEnd').checked = m ? m.noEnd : false;
  $('#mDays').disabled = $('#mNoEnd').checked;
  const rp = parseRepeat(m ? m.repeat : 'daily');
  $('#mRepeat').value = rp.kind;
  $('#mEvery').value = rp.n || 2;
  $$('#wkDays input').forEach(i => { i.checked = rp.kind === 'weekly' && rp.days.includes(+i.value); });
  $('#mMonthDay').value = rp.d || 1;
  $('#mNth').value = rp.kind === 'nth' ? rp.n : 2;
  $('#mNthDay').value = rp.kind === 'nth' ? rp.w : 0;
  $('#mUntil').value = m && !isDailyKind(rp.kind) && !m.noEnd ? medEnd(m) : '';
  updateRepeatUI();
  $('#mNotes').value = m ? m.notes : '';
  $('#timeRows').innerHTML = '';
  (m ? m.times : [{ label: 'Morning', time: '08:00' }, { label: 'Night', time: '21:00' }]).forEach(t => addTimeRow(t.label, t.time));
  $('#medError').textContent = '';
  $('#medDialog').showModal();
}

function saveMed(e) {
  e.preventDefault();
  const err = t => { $('#medError').textContent = t; };
  const times = $$('.time-row').map(r => ({
    label: ($('.t-label', r).value.trim().replace(/[@|]/g, '') || 'Dose'),
    time: $('.t-time', r).value
  }));
  if (!times.length) return err('Add at least one timing (Morning, Night, or a custom time).');
  if (times.some(t => !t.time)) return err('Every timing needs a time.');
  if (new Set(times.map(t => t.time)).size !== times.length) return err('Two timings have the same time – change one.');
  const rep = readRepeat(); if (rep.err) return err(rep.err);
  const startDate = $('#mStart').value;
  if (!isYmd(startDate)) return err('Choose a start date.');
  let noEnd, days;
  if (isDailyKind(parseRepeat(rep.str).kind)) {
    noEnd = $('#mNoEnd').checked; days = parseInt($('#mDays').value, 10);
    if (noEnd && !(days >= 1)) days = 30;
    if (!noEnd && !(days >= 1 && days <= 365)) return err('Number of days must be between 1 and 365.');
  } else {
    const until = $('#mUntil').value;
    if (until && until < startDate) return err('The “Until” date cannot be before the start date.');
    noEnd = !until; days = until ? diffDays(startDate, until) + 1 : 365;
  }
  times.sort((a, b) => a.time.localeCompare(b.time));
  const old = S.medicines.find(x => x.id === ui.editingMed);
  const m = {
    id: old ? old.id : uid('m_'), person: $('#mPerson').value.trim() || 'Me', name: $('#mName').value.trim(),
    type: $('#mType').value, dose: $('#mDose').value.trim(), startDate, days, noEnd, repeat: rep.str,
    times, food: $('#mFood').value, notes: $('#mNotes').value.trim(), createdAt: old ? old.createdAt : new Date().toISOString()
  };
  if (!m.name) return err('Medicine name is required.');
  if (!isYmd(m.startDate)) return err('Choose a start date.');
  if (old) S.medicines[S.medicines.indexOf(old)] = m; else S.medicines.push(m);
  enqueue({ op: 'upsert', sheet: 'Medicines', row: medToRow(m) });
  $('#medDialog').close();
  renderAll(); toast(old ? 'Medicine updated' : 'Medicine added');
  checkReminders();
}

async function deleteMed(id) {
  const m = S.medicines.find(x => x.id === id); if (!m) return;
  if (!(await ask(`Delete “${m.name}” and all its dose history?`, { title: 'Delete medicine', ok: 'Delete', danger: true }))) return;
  S.medicines = S.medicines.filter(x => x.id !== id);
  Object.keys(S.logs).forEach(k => { if (S.logs[k].medId === id) delete S.logs[k]; });
  S.queue = S.queue.filter(q => !(q.sheet === 'DoseLog' && q.row && q.row.medId === id));
  enqueue({ op: 'delete', sheet: 'Medicines', id });   // backend also removes its DoseLog rows
  renderAll(); toast('Medicine deleted');
}

function endMedToday(id) {
  const m = S.medicines.find(x => x.id === id); if (!m) return;
  m.noEnd = false; m.days = Math.max(1, diffDays(m.startDate, todayStr()) + 1);
  enqueue({ op: 'upsert', sheet: 'Medicines', row: medToRow(m) });
  renderActive(); toast('Course ends today');
}

/* ===================================================================
 * Periods
 * ================================================================= */
/* ----- daily log: flow, pain, mood, symptoms, pads ----- */
const dayOf = (p, d) => S.days[dayKey(p, d)] || null;
function lastPadType(person) {
  let best = null;
  Object.values(S.days).forEach(d => { if (d.person === person && d.pads && (!best || d.date > best.date)) best = d; });
  return best ? best.padType : 'Regular';
}
const blankDay = (person, date) => ({ id: dayKey(person, date), person, date, flow: '', pain: 0, mood: '', symptoms: [], notes: '', pads: 0, padType: lastPadType(person) });

/** A day with a flow level belongs to a period: join the one it falls in, continue one that just ended, or start a new one. */
function syncPeriodFromDay(person, date, flow) {
  if (!flow) return;
  const list = S.periods.filter(p => p.person === person), up = p => enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(p) });
  if (list.some(p => p.startDate <= date && date <= (p.endDate || addDays(p.startDate, 9)))) return;
  const prev = list.find(p => p.endDate && addDays(p.endDate, 1) === date);
  if (prev) { prev.endDate = date; return up(prev); }
  const next = list.find(p => p.startDate === addDays(date, 1));
  if (next) { next.startDate = date; return up(next); }
  const p = { id: uid('p_'), person, startDate: date, endDate: '', flow, pain: 0, notes: '' };
  S.periods.push(p); up(p);
}

/** Saves one day. A day with nothing in it is removed. */
function storeDay(d) {
  const empty = !d.flow && !d.pain && !d.mood && !d.symptoms.length && !d.notes && !d.pads;
  if (empty) { if (S.days[d.id]) { delete S.days[d.id]; enqueue({ op: 'delete', sheet: 'DayLog', id: d.id }); } return; }
  S.days[d.id] = d;
  enqueue({ op: 'upsert', sheet: 'DayLog', row: dayToRow(d) });
  syncPeriodFromDay(d.person, d.date, d.flow);
}
function patchDay(person, date, patch) { storeDay({ ...(dayOf(person, date) || blankDay(person, date)), ...patch }); renderAll(); }
function quickFlow(flow) { const p = periodPerson(), t = todayStr(), d = dayOf(p, t); patchDay(p, t, { flow: d && d.flow === flow ? '' : flow }); }
function quickPads(n) { const p = periodPerson(), t = todayStr(), d = dayOf(p, t); patchDay(p, t, { pads: Math.min(40, Math.max(0, (d ? d.pads : 0) + n)) }); }

/* ----- the period tab ----- */
const selPeriod = ps => ps.list.find(p => p.id === ui.perSel) || ps.last;
function spanDays(p, today) {
  const cap = addDays(p.startDate, 9), end = p.endDate || (p.startDate <= today ? (today < cap ? today : cap) : p.startDate), out = [];
  for (let d = p.startDate, i = 0; d <= end && i < 31; d = addDays(d, 1), i++) out.push(d);
  return out;
}
const dShort = (s, o) => fmtDate(s, o || { day: 'numeric', month: 'short' });
const painWord = n => n === 0 ? 'None' : n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : n <= 8 ? 'Severe' : 'Worst';

function renderPeriods() {
  const person = periodPerson(), ps = periodStats(person), today = todayStr();
  $('#periodTitle').textContent = `Period tracker – ${person}`;
  renderCycleCard(ps, today);
  renderQuick(person, today);
  $$('#perView button').forEach(b => { const on = b.dataset.view === ui.perView; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('#perViewBody').innerHTML = ui.perView === 'tl' ? timelineHtml(person, ps, today) : ui.perView === 'trend' ? trendHtml(person, ps, today) : calendarHtml(person, ps, today);
  $('#padCard').innerHTML = padsHtml(person, ps, today);
  renderRecords(person);
  renderPeriodTable(ps);
}

function renderCycleCard(ps, today) {
  const last = ps.last, day = last && last.startDate <= today ? diffDays(last.startDate, today) + 1 : 0, len = ps.cycleLen;
  const ongoing = !!last && !last.endDate && day > 0 && day <= 10;
  const left = ps.next ? diffDays(today, ps.next) : null;
  const nextSub = left === null ? '' : left > 0 ? 'in ' + plural(left, 'day') : left === 0 ? 'today' : plural(-left, 'day') + ' late';
  const fact = (l, v, sub = '') => `<div class="fact"><div class="label">${l}</div><div class="value">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  $('#cycleCard').innerHTML = `<div class="cycle-top">
    <div class="cyc-ring" style="--p:${day ? Math.min(100, Math.round(day * 100 / len)) : 0}" role="img" aria-label="${day ? `Cycle day ${day} of about ${len}` : 'No cycle data yet'}"><div><b>${day || '–'}</b><small>${day ? 'cycle day' : 'no data'}</small></div></div>
    <div class="cycle-facts">
      ${fact('Period start', last ? dShort(last.startDate, { day: '2-digit', month: 'short', year: 'numeric' }) : '–')}
      ${fact('Period end', last ? (last.endDate ? dShort(last.endDate, { day: '2-digit', month: 'short', year: 'numeric' }) : ongoing ? 'Ongoing' : '–') : '–')}
      ${fact('Cycle length', (ps.avgCycle || len) + ' days', ps.avgCycle ? 'average of ' + plural(Math.min(6, ps.gaps.length), 'cycle') : 'default until 2 periods')}
      ${fact('Next period', ps.next ? dShort(ps.next, { day: '2-digit', month: 'short', year: 'numeric' }) : '–', nextSub)}
    </div></div>
    <p class="cycle-note">${!last ? 'Tap a flow level below to log your first period day.' : ongoing ? `<b>Period is on</b> – day ${day}. ${plural(len - day < 0 ? 0 : len - day, 'day')} left in this cycle.`
      : day ? `Cycle day <b>${day}</b> of about ${len}.` : 'Your period start date is in the future.'}</p>`;
}

function renderQuick(person, today) {
  const d = dayOf(person, today) || blankDay(person, today);
  $('#quickCard').innerHTML = `<div class="card-head"><h3>Today · ${dShort(today, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
      <button class="btn ghost small" data-act="dayopen" data-date="${today}">Mood, pain &amp; notes</button></div>
    <div class="flow-pick" role="group" aria-label="Flow today">${FLOWS.map(f => `<button type="button" class="flow-btn ${flc(f)} ${d.flow === f ? 'on' : ''}" data-act="flow" data-flow="${f}" aria-pressed="${d.flow === f}">${f}</button>`).join('')}</div>
    <div class="pad-row"><span>Pads used today</span>
      <div class="stepper"><button type="button" data-act="padminus" aria-label="One less">&minus;</button><b>${d.pads}</b><button type="button" data-act="padplus" aria-label="One more">+</button></div>
      <select id="quickPadType" aria-label="Pad type">${PAD_TYPES.map(t => `<option ${t === d.padType ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
}

function calendarHtml(person, ps, today) {
  const [y, mo] = ui.calMonth.split('-').map(Number);
  const sets = periodDaySets(person), first = new Date(y, mo - 1, 1).getDay(), dim = new Date(y, mo, 0).getDate();
  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('') + '<div class="cal-day blank"></div>'.repeat(first);
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${pad(mo)}-${pad(d)}`, e = dayOf(person, ds), future = ds > today;
    const cls = e && e.flow ? `has-flow ${flc(e.flow)}` : sets.actual.has(ds) ? 'period' : sets.pred.has(ds) ? 'pred' : '';
    const more = e && (e.pain || e.mood || e.symptoms.length || e.notes || e.pads);
    html += `<button type="button" class="cal-day ${cls} ${ds === today ? 'today' : ''}" data-act="dayopen" data-date="${ds}" ${future ? 'disabled' : ''} aria-label="${esc(dShort(ds, { weekday: 'long', day: 'numeric', month: 'long' }) + (e && e.flow ? ', ' + e.flow + ' flow' : ''))}">${d}${more ? '<i class="mark"></i>' : ''}</button>`;
  }
  return `<div class="cal-head"><button class="icon-btn" data-act="calprev" aria-label="Previous month">${ico('left')}</button>
      <strong>${new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
      <button class="icon-btn" data-act="calnext" aria-label="Next month">${ico('right')}</button></div>
    <div class="cal-grid">${html}</div>
    <div class="legend">${FLOWS.map(f => `<span><i class="dot ${flc(f)}"></i>${f}</span>`).join('')}<span><i class="dot pred"></i>Expected</span><span><i class="dot today"></i>Today</span></div>
    <p class="muted small">Tap a day to log flow, mood, pain, pads and notes. A small dot means that day has details.</p>`;
}

function perSelector(ps) {
  const sel = selPeriod(ps);
  return `<label class="sort">Period <select id="perSel">${ps.list.slice().reverse().map(p => `<option value="${esc(p.id)}" ${sel && p.id === sel.id ? 'selected' : ''}>${dShort(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}${p.endDate ? '' : ' (ongoing)'}</option>`).join('')}</select></label>`;
}

function timelineHtml(person, ps, today) {
  const p = selPeriod(ps);
  if (!p) return '<p class="muted">No period yet. Log a flow level for today to start the timeline.</p>';
  const rows = spanDays(p, today).map((date, i) => {
    const d = dayOf(person, date);
    return `<button type="button" class="tl-row" data-act="dayopen" data-date="${date}"><span class="tl-dot ${d && d.flow ? flc(d.flow) : 'none'}"></span>
      <span class="tl-day"><b>Day ${i + 1}</b><small>${dShort(date, { weekday: 'short', day: 'numeric', month: 'short' })}</small></span>
      <span class="tl-body">${d ? `${d.flow ? `<span class="flow-chip ${flc(d.flow)}">${d.flow}</span>` : ''}${d.pain ? `<span class="chip sm">Pain ${d.pain}/10</span>` : ''}${d.mood ? `<span class="chip sm">${esc(d.mood)}</span>` : ''}${d.pads ? `<span class="chip sm">${d.pads} pad${d.pads === 1 ? '' : 's'}</span>` : ''}${d.symptoms.map(x => `<span class="chip sm">${esc(x)}</span>`).join('')}${d.notes ? `<span class="tl-note">${esc(d.notes)}</span>` : ''}` : '<span class="muted">Tap to add</span>'}</span></button>`;
  }).join('');
  return `<div class="card-head">${perSelector(ps)}<span class="muted small">${plural(spanDays(p, today).length, 'day')}</span></div><div class="timeline">${rows}</div>`;
}

/** Column chart. items: { label, value, text?, cls?, tip } */
function barChart(items, max) {
  const step = items.length > 16 ? 2 : 1;
  return `<div class="bars" style="padding-bottom:22px">${items.map((it, i) => `<div class="bcol" title="${esc(it.tip)}"><span class="bval">${esc(it.text ?? (it.value || ''))}</span><span class="bbar ${it.cls || ''}" style="height:${Math.max(it.value ? 3 : 0, Math.round(it.value * 100 / max))}%"></span><span class="blab">${i % step === 0 ? esc(it.label) : ''}</span></div>`).join('')}</div>`;
}
function hBars(items) {
  const mx = Math.max(1, ...items.map(i => i.n));
  return `<div class="hbars">${items.map(i => `<div class="hrow"><span>${esc(i.label)}</span><span class="hbar"><i style="width:${i.n * 100 / mx}%"></i></span><b>${i.n}</b></div>`).join('')}</div>`;
}

function trendHtml(person, ps, today) {
  const p = selPeriod(ps);
  if (!p) return '<p class="muted">No period yet. Log a flow level for today to see the trend.</p>';
  const days = spanDays(p, today).map((date, i) => ({ date, i: i + 1, d: dayOf(person, date) }));
  const flow = days.map(x => ({ label: 'D' + x.i, value: x.d && x.d.flow ? FLOW_LEVEL[x.d.flow] : 0, text: x.d && x.d.flow ? x.d.flow[0] : '', cls: x.d && x.d.flow ? flc(x.d.flow) : '', tip: `Day ${x.i}, ${dShort(x.date)}: ${x.d && x.d.flow ? x.d.flow : 'no flow logged'}` }));
  const pain = days.map(x => ({ label: 'D' + x.i, value: x.d ? x.d.pain : 0, cls: 'pain', tip: `Day ${x.i}: pain ${x.d ? x.d.pain : 0}/10` }));
  const pads = days.map(x => ({ label: 'D' + x.i, value: x.d ? x.d.pads : 0, cls: 'pads', tip: `Day ${x.i}: ${x.d ? x.d.pads : 0} pads` }));
  return `<div class="card-head">${perSelector(ps)}</div>
    <div class="chart-grid">
      <div class="chart"><h4>Flow (S spotting · L light · M medium · H heavy)</h4>${barChart(flow, 4)}</div>
      <div class="chart"><h4>Pain level (0–10)</h4>${barChart(pain, 10)}</div>
      <div class="chart"><h4>Pads used per day</h4>${barChart(pads, Math.max(4, ...pads.map(x => x.value)))}</div>
    </div>`;
}

function padsHtml(person, ps, today) {
  const p = selPeriod(ps), t = dayOf(person, today);
  let total = 0, logged = 0, peak = 0; const byType = {};
  const span = p ? spanDays(p, today) : [];
  span.forEach(date => { const d = dayOf(person, date); if (d && d.pads) { total += d.pads; logged++; peak = Math.max(peak, d.pads); byType[d.padType] = (byType[d.padType] || 0) + d.pads; } });
  const stat = (l, v, sub = '') => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`;
  return `<div class="card-head"><h3>Pad usage</h3>${p ? `<span class="muted small">Period of ${dShort(p.startDate)}${p.endDate ? '' : ' (ongoing)'}</span>` : ''}</div>
    <div class="stat-grid">
      ${stat('Today', t ? t.pads : 0, 'pads')}
      ${stat('Period total', total, 'pads')}
      ${stat('Average per day', span.length && total ? (total / span.length).toFixed(1) : '–', span.length ? 'over ' + plural(span.length, 'day') : '')}
      ${stat('Busiest day', peak || '–', peak ? 'pads' : '')}
    </div>
    <p class="muted small">${Object.keys(byType).length ? PAD_TYPES.filter(k => byType[k]).map(k => `${byType[k]} ${k.toLowerCase()}`).join(' · ') : 'Use the + button above to count pads as you go.'}</p>`;
}

/* ----- daily records, filtered by month / year / dates ----- */
function renderRecords(person) {
  const r = ui.rec, years = new Set([todayStr().slice(0, 4)]);
  Object.values(S.days).forEach(d => d.person === person && years.add(d.date.slice(0, 4)));
  S.periods.forEach(p => p.person === person && years.add(p.startDate.slice(0, 4)));
  $('#rcYear').innerHTML = '<option value="">All years</option>' + [...years].sort().reverse().map(y => `<option>${y}</option>`).join('');
  $('#rcYear').value = r.year || '';
  $('#rcFrom').value = r.from; $('#rcTo').value = r.to;
  $('#rcMonth').value = !r.year && r.from.slice(0, 7) === r.to.slice(0, 7) ? r.from.slice(0, 7) : '';
  $('#rcSort').value = S.ui.recSort;
  const list = Object.values(S.days).filter(d => d.person === person && d.date >= r.from && d.date <= r.to)
    .sort((a, b) => S.ui.recSort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  $('#recList').innerHTML = list.length ? grouped(list, d => fmtDate(d.date, { month: 'long', year: 'numeric' }), d => {
    const meds = Object.values(S.logs).filter(l => l.person === d.person && l.date === d.date && l.status === 'taken');
    return `<article class="rec"><button type="button" class="rec-date" data-act="dayopen" data-date="${d.date}" aria-label="Edit ${esc(fmtShort(d.date))}"><b>${parseYmd(d.date).getDate()}</b><span>${fmtDate(d.date, { weekday: 'short' })}</span></button>
      <div class="rec-main"><div class="chips">${d.flow ? `<span class="flow-chip ${flc(d.flow)}">${d.flow}</span>` : ''}${d.pain ? `<span class="chip sm">Pain ${d.pain}/10 · ${painWord(d.pain)}</span>` : ''}${d.mood ? `<span class="chip sm">${esc(d.mood)}</span>` : ''}${d.pads ? `<span class="chip sm">${d.pads} ${esc(d.padType.toLowerCase())} pad${d.pads === 1 ? '' : 's'}</span>` : ''}</div>
      ${d.symptoms.length ? `<p class="rec-line">${d.symptoms.map(esc).join(' · ')}</p>` : ''}
      ${d.notes ? `<p class="rec-note">${esc(d.notes)}</p>` : ''}
      ${meds.length ? `<p class="rec-line muted">${ico('pill', 'sm')}${meds.map(l => esc(l.medicine) + (l.takenAt ? ' ' + fmtClock(l.takenAt) : '')).join(', ')}</p>` : ''}</div></article>`;
  }, 'day') : '<p class="muted">No daily records in these dates. Tap a day in the calendar to add one.</p>';
}

function renderPeriodTable(ps) {
  $('#perSort').value = S.ui.perSort;
  const rows = S.ui.perSort === 'old' ? ps.list.slice() : ps.list.slice().reverse();
  $('#periodTable').innerHTML = rows.length ? `<table><thead><tr><th>Start</th><th>End</th><th>Days</th><th>Cycle</th><th>Flow</th><th>Pain</th><th>Notes</th><th></th></tr></thead><tbody>` +
    rows.map(p => {
      const i = ps.list.indexOf(p), gap = i > 0 ? diffDays(ps.list[i - 1].startDate, p.startDate) : '';
      return `<tr><td>${fmtShort(p.startDate)}</td><td>${p.endDate ? fmtShort(p.endDate) : '<span class="badge due">ongoing</span>'}</td>
        <td>${p.endDate ? diffDays(p.startDate, p.endDate) + 1 : ''}</td><td>${gap ? gap + ' d' : ''}</td><td>${esc(p.flow)}</td><td>${p.pain}/5</td>
        <td>${esc(p.notes)}</td><td><button class="link-btn" data-act="pedit" data-id="${esc(p.id)}">Edit</button><button class="link-btn danger" data-act="pdel" data-id="${esc(p.id)}">Delete</button></td></tr>`;
    }).join('') + '</tbody></table>' : '<p class="muted">No periods logged yet.</p>';
}

/* ----- the day dialog ----- */
let dayDraft = null;
function openDayDialog(date) {
  if (!isYmd(date) || date > todayStr()) return;
  const person = periodPerson(), d0 = dayOf(person, date) || blankDay(person, date);
  dayDraft = { ...d0, symptoms: d0.symptoms.slice() };
  $('#dyNotes').value = dayDraft.notes;
  paintDay();
  const meds = Object.values(S.logs).filter(l => l.person === person && l.date === date && l.status === 'taken');
  $('#dyMeds').textContent = meds.length ? 'Medicines taken: ' + meds.map(l => l.medicine + (l.takenAt ? ' at ' + fmtClock(l.takenAt) : '')).join(', ') : 'No medicines marked as taken on this day.';
  $('#dayDialog').showModal();
}
function paintDay() {
  const d = dayDraft;
  const chips = (list, on, attr) => list.map(x => `<button type="button" class="chip ${on(x) ? 'on' : ''}" data-${attr}="${esc(x)}" aria-pressed="${on(x)}">${esc(x)}</button>`).join('');
  $('#dyTitle').textContent = dShort(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#dyFlow').innerHTML = FLOWS.map(f => `<button type="button" class="flow-btn ${flc(f)} ${d.flow === f ? 'on' : ''}" data-dflow="${f}" aria-pressed="${d.flow === f}">${f}</button>`).join('');
  $('#dyMood').innerHTML = chips(MOODS, x => d.mood === x, 'dmood');
  $('#dySymp').innerHTML = chips(SYMPTOMS, x => d.symptoms.includes(x), 'dsymp');
  $('#dyPain').value = d.pain; $('#dyPainOut').textContent = `${d.pain} / 10 · ${painWord(d.pain)}`;
  $('#dyPads').textContent = d.pads;
  $('#dyType').innerHTML = PAD_TYPES.map(t => `<option ${t === d.padType ? 'selected' : ''}>${t}</option>`).join('');
  $('#dyDel').hidden = !S.days[d.id];
}
function dayDialogClick(e) {
  const t = e.target.closest('[data-dflow],[data-dmood],[data-dsymp]'); if (!t || !dayDraft) return false;
  if (t.dataset.dflow) dayDraft.flow = dayDraft.flow === t.dataset.dflow ? '' : t.dataset.dflow;
  else if (t.dataset.dmood) dayDraft.mood = dayDraft.mood === t.dataset.dmood ? '' : t.dataset.dmood;
  else { const k = t.dataset.dsymp, i = dayDraft.symptoms.indexOf(k); if (i < 0) dayDraft.symptoms.push(k); else dayDraft.symptoms.splice(i, 1); }
  paintDay(); return true;
}
function saveDay(e) {
  e.preventDefault();
  storeDay({ ...dayDraft, notes: $('#dyNotes').value.trim().slice(0, 500) });
  $('#dayDialog').close(); renderAll(); toast('Day saved');
}
async function deleteDay() {
  if (!dayDraft || !(await ask('Delete everything logged for this day?', { title: 'Delete day', ok: 'Delete', danger: true }))) return;
  delete S.days[dayDraft.id]; enqueue({ op: 'delete', sheet: 'DayLog', id: dayDraft.id });
  $('#dayDialog').close(); renderAll();
}
function shiftMonth(n) { const [y, m] = ui.calMonth.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; renderPeriods(); }

function openPeriodDialog(id) {
  const p = id ? S.periods.find(x => x.id === id) : null;
  ui.editingPeriod = p ? p.id : null;
  $('#periodDialogTitle').textContent = p ? 'Edit period' : 'Log period';
  $('#pPerson').value = p ? p.person : periodPerson();
  $('#pStart').value = p ? p.startDate : todayStr();
  $('#pEnd').value = p ? p.endDate : '';
  $('#pFlow').value = p ? p.flow : 'Medium';
  $('#pPain').value = p ? p.pain : 0;
  $('#pNotes').value = p ? p.notes : '';
  $('#periodError').textContent = '';
  $('#periodDialog').showModal();
}

function savePeriod(e) {
  e.preventDefault();
  const start = $('#pStart').value, end = $('#pEnd').value;
  if (!isYmd(start)) { $('#periodError').textContent = 'Choose the start date.'; return; }
  if (end && end < start) { $('#periodError').textContent = 'End date cannot be before the start date.'; return; }
  const old = S.periods.find(x => x.id === ui.editingPeriod);
  const p = { id: old ? old.id : uid('p_'), person: $('#pPerson').value.trim() || 'Me', startDate: start, endDate: end, flow: $('#pFlow').value, pain: parseInt($('#pPain').value, 10) || 0, notes: $('#pNotes').value.trim() };
  if (old) S.periods[S.periods.indexOf(old)] = p; else S.periods.push(p);
  enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(p) });
  $('#periodDialog').close();
  ui.calMonth = start.slice(0, 7);
  renderAll(); toast('Period saved');
}

async function deletePeriod(id) {
  if (!(await ask('Delete this period entry?', { title: 'Delete period', ok: 'Delete', danger: true }))) return;
  S.periods = S.periods.filter(p => p.id !== id);
  enqueue({ op: 'delete', sheet: 'Periods', id });
  renderAll();
}

function endPeriodToday(id) {
  const p = S.periods.find(x => x.id === id); if (!p) return;
  p.endDate = todayStr();
  enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(p) });
  renderAll(); toast('Period marked as ended');
}

/* ===================================================================
 * Reports (adherence) + CSV / print
 * ================================================================= */
function buildReport() {
  const { from, to, med } = ui.rep, rows = [];
  for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) {
    for (const dose of dosesOn(d, S.ui.person)) {
      if (med && dose.med.id !== med) continue;
      rows.push({ dose, status: statusOf(dose), log: S.logs[dose.key] });
    }
  }
  return rows;
}

function renderReports() {
  $('#rFrom').value = ui.rep.from; $('#rTo').value = ui.rep.to;
  const meds = S.medicines.filter(m => personOk(m.person));
  if (ui.rep.med && !meds.some(m => m.id === ui.rep.med)) ui.rep.med = '';
  $('#rMed').innerHTML = `<option value="">All medicines</option>` + meds.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.person)})</option>`).join('');
  $('#rMed').value = ui.rep.med;
  const sheet = $('#openSheetBtn');
  sheet.hidden = !safeLink(S.settings.sheetUrl) || !!lockedPerson(); sheet.href = safeLink(S.settings.sheetUrl) || '#';

  const rows = buildReport(), c = k => rows.filter(r => r.status === k).length;
  const taken = c('taken'), skipped = c('skipped'), missed = c('missed'), due = c('due'), counted = taken + skipped + missed;
  const pct = counted ? Math.round(taken * 100 / counted) : null;
  $('#repHeading').innerHTML = `<h2>Medicine report – ${S.ui.person === '*' ? 'Everyone' : esc(S.ui.person)}</h2><p>${fmtShort(ui.rep.from)} to ${fmtShort(ui.rep.to)} · printed ${new Date().toLocaleString('en-IN')}</p>`;
  $('#repSummary').innerHTML = `
    <div class="stat ${pct === null ? '' : pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'bad'}"><div class="label">Adherence</div><div class="value">${pct === null ? '–' : pct + '%'}</div><div class="sub">taken ÷ (taken + skipped + missed)</div></div>
    <div class="stat ok"><div class="label">Taken</div><div class="value">${taken}</div></div>
    <div class="stat bad"><div class="label">Missed</div><div class="value">${missed}</div></div>
    <div class="stat"><div class="label">Skipped</div><div class="value">${skipped}</div></div>
    <div class="stat"><div class="label">Pending / upcoming</div><div class="value">${due + c('upcoming')}</div></div>`;

  // by medicine
  const by = new Map();
  rows.forEach(r => {
    const m = r.dose.med, o = by.get(m.id) || { m, taken: 0, skipped: 0, missed: 0, total: 0 };
    if (r.status in o) { o[r.status]++; o.total++; }
    by.set(m.id, o);
  });
  $('#repByMed').innerHTML = by.size ? `<table><thead><tr><th>Medicine</th><th>Person</th><th>Taken</th><th>Skipped</th><th>Missed</th><th>Adherence</th></tr></thead><tbody>` +
    [...by.values()].map(o => { const p = o.total ? Math.round(o.taken * 100 / o.total) : 0; return `<tr><td><b>${esc(o.m.name)}</b></td><td>${esc(o.m.person)}</td><td>${o.taken}</td><td>${o.skipped}</td><td>${o.missed}</td><td><span class="bar"><span style="width:${p}%"></span></span>${o.total ? p + '%' : '–'}</td></tr>`; }).join('') + '</tbody></table>'
    : '<p class="muted">No doses scheduled in this period.</p>';

  // what happened on each day of the range
  const days = [], perDay = new Map();
  for (let d = ui.rep.from, i = 0; d <= ui.rep.to && i < 400; d = addDays(d, 1), i++) { days.push(d); perDay.set(d, { taken: 0, skipped: 0, missed: 0, pending: 0, rows: [] }); }
  rows.forEach(r => { const o = perDay.get(r.dose.date); o[r.status in o ? r.status : 'pending']++; o.rows.push(r); });
  const KINDS = [['taken', 'taken'], ['skipped', 'skipped'], ['missed', 'missed'], ['pending', 'not yet due']];

  // one bar per day
  const max = Math.max(1, ...days.map(d => perDay.get(d).rows.length)), step = days.length > 31 ? 7 : days.length > 16 ? 2 : 1;
  $('#repDays').innerHTML = !rows.length ? '<p class="muted">No doses scheduled in these dates.</p>'
    : days.length > 62 ? '<p class="muted">Choose 62 days or fewer to see one bar per day.</p>'
    : `<div class="days">${days.map((d, i) => {
        const o = perDay.get(d), n = o.rows.length;
        const tip = `${fmtDate(d)}: ${n ? KINDS.filter(([k]) => o[k]).map(([k, l]) => `${o[k]} ${l}`).join(', ') : 'nothing planned'}`;
        return `<button type="button" class="dcol" data-day="${d}" title="${tip}" aria-label="${tip}">
          <span class="dbar"><span class="dstack" style="height:${n * 100 / max}%">${KINDS.map(([k]) => o[k] ? `<i class="${k}" style="flex-grow:${o[k]}"></i>` : '').join('')}</span></span>
          <span class="dlab">${i % step === 0 ? parseYmd(d).getDate() : '&nbsp;'}</span></button>`;
      }).join('')}</div>
      <div class="days-ends"><span>${fmtShort(days[0])}</span><span>${fmtShort(days[days.length - 1])}</span></div>
      <div class="legend">${KINDS.map(([k, l]) => `<span><i class="dot ${k}"></i>${l[0].toUpperCase() + l.slice(1)}</span>`).join('')}</div>
      <p class="muted no-print">Bar height is the number of doses planned that day (tallest bar = ${plural(max, 'dose')}). Tap a bar to open that day.</p>`;

  // detail, one block per date
  const shown = (S.ui.logSort === 'old' ? days : days.slice().reverse()).filter(d => perDay.get(d).rows.length);
  $('#logSort').value = S.ui.logSort;
  $('#repDetail').innerHTML = shown.length ? `<table><thead><tr><th>Time</th><th>Medicine</th><th>Dose</th><th>Slot</th><th>Person</th><th>Status</th><th>Marked at</th></tr></thead><tbody>` +
    shown.map(d => {
      const o = perDay.get(d);
      return `<tr class="day-row"><th colspan="7"><button type="button" class="link-btn" data-day="${d}" title="Open this day">${fmtDate(d)}</button><span>${o.taken} of ${o.rows.length} taken${o.missed ? ` · ${o.missed} missed` : ''}${o.skipped ? ` · ${o.skipped} skipped` : ''}</span></th></tr>` +
        o.rows.map(r => `<tr><td>${fmtTime(r.dose.time)}</td><td>${esc(r.dose.med.name)}</td><td>${esc(r.dose.med.dose)}</td><td>${esc(r.dose.label)}</td><td>${esc(r.dose.med.person)}</td><td><span class="badge ${r.status}">${STATUS_LABEL[r.status]}</span></td><td>${r.log?.status === 'taken' ? fmtClock(r.log.takenAt) : ''}</td></tr>`).join('');
    }).join('') + '</tbody></table>'
    : '<p class="muted">Nothing to show.</p>';

  renderAnalytics();

  // periods in the range
  const person = periodPerson(), ps = periodStats(person);
  const inRange = ps.list.filter(p => p.startDate >= ui.rep.from && p.startDate <= ui.rep.to);
  $('#repPeriods').innerHTML = ps.list.length
    ? `<p><b>${esc(person)}</b>: average cycle ${ps.avgCycle ? ps.avgCycle + ' days' : 'not enough data'}, average length ${ps.avgLen ? ps.avgLen + ' days' : 'not enough data'}, next expected <b>${fmtShort(ps.next)}</b>.</p>` +
      (inRange.length ? `<table><thead><tr><th>Start</th><th>End</th><th>Days</th><th>Flow</th><th>Pain</th><th>Notes</th></tr></thead><tbody>${inRange.map(p => `<tr><td>${fmtShort(p.startDate)}</td><td>${p.endDate ? fmtShort(p.endDate) : 'ongoing'}</td><td>${p.endDate ? diffDays(p.startDate, p.endDate) + 1 : ''}</td><td>${esc(p.flow)}</td><td>${p.pain}/5</td><td>${esc(p.notes)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No periods started in the selected dates.</p>')
    : '<p class="muted">No period data.</p>';
}

function renderAnalytics() {
  const person = periodPerson(), ps = periodStats(person), today = todayStr(), lbl = d => dShort(d);
  const own = Object.values(S.days).filter(d => d.person === person);
  if (!ps.list.length && !own.length) { $('#repAnalytics').innerHTML = '<p class="muted">Nothing logged yet for ' + esc(person) + '. Log periods and daily entries in the Periods tab.</p>'; return; }
  // per period figures
  const per = ps.list.map(p => { const days = spanDays(p, today).map(date => dayOf(person, date)).filter(Boolean); return { p, days, pads: days.reduce((a, d) => a + d.pads, 0), pain: days.filter(d => d.pain).map(d => d.pain) }; });
  const padDays = per.reduce((a, x) => a + spanDays(x.p, today).length, 0), padTotal = per.reduce((a, x) => a + x.pads, 0);
  const stat = (l, v, sub = '') => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`;
  // cycle lengths (days between starts)
  const off = ps.gaps.length - Math.min(12, ps.gaps.length);
  const cyc = ps.gaps.slice(-12).map((g, k) => ({ label: lbl(ps.list[off + k].startDate), value: g, cls: 'cyc', tip: `Cycle from ${fmtShort(ps.list[off + k].startDate)}: ${g} days` }));
  const dur = per.filter(x => x.p.endDate).slice(-12).map(x => ({ label: lbl(x.p.startDate), value: diffDays(x.p.startDate, x.p.endDate) + 1, tip: `Period of ${fmtShort(x.p.startDate)}: ${diffDays(x.p.startDate, x.p.endDate) + 1} days` }));
  // average flow on day 1, 2, 3 ... of the period
  const byDay = {};
  per.forEach(x => spanDays(x.p, today).forEach((date, i) => { const d = dayOf(person, date); if (d && d.flow) (byDay[i + 1] = byDay[i + 1] || []).push(FLOW_LEVEL[d.flow]); }));
  const flowTrend = Object.keys(byDay).map(Number).sort((a, b) => a - b).slice(0, 10).map(i => { const v = avg(byDay[i]); return { label: 'D' + i, value: +v.toFixed(1), cls: flc(FLOWS[Math.min(3, Math.round(v) - 1)]), tip: `Day ${i}: average flow ${v.toFixed(1)} of 4 (${plural(byDay[i].length, 'entry')})` }; });
  const padsPer = per.slice(-12).filter(x => x.pads).map(x => ({ label: lbl(x.p.startDate), value: x.pads, cls: 'pads', tip: `Period of ${fmtShort(x.p.startDate)}: ${x.pads} pads` }));
  const painPer = per.slice(-12).filter(x => x.pain.length).map(x => ({ label: lbl(x.p.startDate), value: +avg(x.pain).toFixed(1), cls: 'pain', tip: `Period of ${fmtShort(x.p.startDate)}: average pain ${avg(x.pain).toFixed(1)}/10` }));
  // symptoms and moods in the chosen dates
  const inR = own.filter(d => d.date >= ui.rep.from && d.date <= ui.rep.to), count = {}, moods = {};
  inR.forEach(d => { d.symptoms.forEach(k => { count[k] = (count[k] || 0) + 1; }); if (d.mood) moods[d.mood] = (moods[d.mood] || 0) + 1; });
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, n]) => ({ label, n }));
  const chart = (title, html) => `<div class="chart"><h4>${title}</h4>${html}</div>`;
  const none = '<p class="muted small">Not enough data yet.</p>';
  $('#repAnalytics').innerHTML = `<div class="stat-grid">
      ${stat('Average cycle', ps.avgCycle ? ps.avgCycle + ' days' : '–', ps.avgCycle ? 'last ' + plural(Math.min(6, ps.gaps.length), 'cycle') : 'needs 2 periods')}
      ${stat('Average period', ps.avgLen ? ps.avgLen + ' days' : '–', ps.avgLen ? 'duration' : 'add an end date')}
      ${stat('Periods logged', ps.list.length)}
      ${stat('Pads per period day', padDays && padTotal ? (padTotal / padDays).toFixed(1) : '–', padTotal ? plural(padTotal, 'pad') + ' in total' : '')}
    </div>
    <div class="chart-grid">
      ${chart('Cycle length (days)', cyc.length ? barChart(cyc, Math.max(...cyc.map(x => x.value))) : none)}
      ${chart('Period duration (days)', dur.length ? barChart(dur, Math.max(...dur.map(x => x.value))) : none)}
      ${chart('Flow trend – average on each period day', flowTrend.length ? barChart(flowTrend, 4) : none)}
      ${chart('Pain trend – average per period (0–10)', painPer.length ? barChart(painPer, 10) : none)}
      ${chart('Pad usage per period', padsPer.length ? barChart(padsPer, Math.max(...padsPer.map(x => x.value))) : none)}
      ${chart(`Symptoms, ${fmtShort(ui.rep.from)} to ${fmtShort(ui.rep.to)}`, Object.keys(count).length ? hBars(top(count)) : none)}
      ${chart('Mood in the same dates', Object.keys(moods).length ? hBars(top(moods)) : none)}
    </div>`;
}

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
function downloadText(name, text, type = 'text/csv', bom = true) {
  const blob = new Blob([(bom ? '﻿' : '') + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csvDoses() {
  const head = ['Date', 'Time', 'Person', 'Medicine', 'Type', 'Dose', 'Slot', 'Food', 'Status', 'Marked at'];
  const lines = buildReport().sort((a, b) => a.dose.date.localeCompare(b.dose.date) || a.dose.time.localeCompare(b.dose.time)).map(r => [
    r.dose.date, r.dose.time, r.dose.med.person, r.dose.med.name, r.dose.med.type, r.dose.med.dose, r.dose.label, r.dose.med.food, STATUS_LABEL[r.status], r.log?.takenAt || ''
  ].map(csvCell).join(','));
  downloadText(`medicine-report_${ui.rep.from}_to_${ui.rep.to}.csv`, [head.map(csvCell).join(','), ...lines].join('\r\n'));
}
function csvDays() {
  const head = ['Date', 'Person', 'Flow', 'Pain (0-10)', 'Mood', 'Symptoms', 'Pads', 'Pad type', 'Notes'];
  const lines = Object.values(S.days).filter(d => personOk(d.person)).sort((a, b) => a.date.localeCompare(b.date)).map(d =>
    [d.date, d.person, d.flow, d.pain, d.mood, d.symptoms.join('; '), d.pads, d.padType, d.notes].map(csvCell).join(','));
  downloadText('daily-log.csv', [head.map(csvCell).join(','), ...lines].join('\r\n'));
}
function csvPeriods() {
  const head = ['Person', 'Start', 'End', 'Days', 'Flow', 'Pain (0-5)', 'Notes'];
  const lines = S.periods.filter(p => personOk(p.person)).sort((a, b) => a.startDate.localeCompare(b.startDate)).map(p => [
    p.person, p.startDate, p.endDate, p.endDate ? diffDays(p.startDate, p.endDate) + 1 : '', p.flow, p.pain, p.notes].map(csvCell).join(','));
  downloadText('period-report.csv', [head.map(csvCell).join(','), ...lines].join('\r\n'));
}

/* ===================================================================
 * Report files (image / PDF upload)
 * ================================================================= */
function renderDocs() {
  $('#docCat').innerHTML = `<option value="">All types</option>` + CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('');
  $('#docCat').value = ui.docCat;
  const q = ui.docSearch.trim().toLowerCase(), sort = S.ui.docSort;
  $('#docSort').value = sort;
  const newest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '');
  const list = S.files.filter(f => personOk(f.person) && (!ui.docCat || f.category === ui.docCat) &&
    (!q || [f.title, f.fileName, f.notes, f.category, f.person].join(' ').toLowerCase().includes(q)))
    .sort(sort === 'name' ? (a, b) => a.title.localeCompare(b.title) || newest(a, b) : sort === 'old' ? (a, b) => newest(b, a) : newest);
  if (!list.length) {
    $('#docList').innerHTML = `<div class="card empty" style="grid-column:1/-1"><div class="big">${ico('file')}</div><p><b>${S.files.length ? 'No report files match.' : 'No report files yet.'}</b></p>
      <p>Upload a lab report, prescription or scan as an image or PDF.</p><div class="btn-row"><button class="btn primary" data-go="doc-add">${ico('upload')}Upload report</button></div></div>`;
    return;
  }
  const showPerson = S.ui.person === '*' && persons().length > 1;
  const groupOf = f => sort === 'name' ? '' : fmtDate(f.date, { month: 'long', year: 'numeric' });
  $('#docList').innerHTML = grouped(list, groupOf, f => {
    const isPdf = f.mime === 'application/pdf' || /\.pdf$/i.test(f.fileName);
    const thumb = /^data:image\/(jpeg|png|webp);base64,/.test(f.thumb) ? `<img src="${esc(f.thumb)}" alt="">` : isPdf ? 'PDF' : ico('image');
    const up = ui.upload[f.id];
    const cloud = f.driveId ? `<span class="badge running">${ico('cloud', 'sm')}In Drive</span>`
      : up === 'uploading' ? '<span class="badge upcoming">Uploading…</span>'
      : up === 'error' ? '<span class="badge missed">Upload failed</span>'
      : configured() ? '<span class="badge due">Waiting</span>' : '<span class="badge skipped">This device</span>';
    return `<article class="doc">
      <button class="doc-thumb ${isPdf ? 'pdf' : ''}" data-act="dopen" data-id="${esc(f.id)}" title="Open">${thumb}<span class="doc-date">${fmtShort(f.date)}</span></button>
      <div class="doc-body">
        <div class="doc-title">${esc(f.title)}</div>
        <div class="doc-meta">${esc(f.category)}${showPerson ? ' · ' + ico('user', 'sm') + esc(f.person) : ''}</div>
        <div class="doc-meta">${esc(f.fileName)} · ${fmtSize(f.size)}</div>
        ${f.notes ? `<div class="dose-note">${esc(f.notes)}</div>` : ''}
      </div>
      <div class="doc-actions">
        <button class="link-btn" data-act="dopen" data-id="${esc(f.id)}">Open</button>
        <button class="link-btn" data-act="ddown" data-id="${esc(f.id)}">Download</button>
        <button class="link-btn" data-act="dedit" data-id="${esc(f.id)}">Edit</button>
        <button class="link-btn danger" data-act="ddel" data-id="${esc(f.id)}">Delete</button>
        <span class="doc-cloud">${cloud}${up === 'error' ? ` <button class="link-btn" data-act="dretry" data-id="${esc(f.id)}">Retry</button>` : ''}</span>
      </div>
    </article>`;
  }, 'file');
}

function setPendingFiles(files) {
  const ok = [], bad = [];
  [...files].forEach(f => {
    const isOk = f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isOk) bad.push(`${f.name}: only images or PDF`);
    else if (f.size > MAX_FILE_BYTES) bad.push(`${f.name}: bigger than 10 MB`);
    else ok.push(f);
  });
  ui.pendingFiles = ok;
  $('#dFileInfo').innerHTML = ok.map(f => `<div>${ico('check', 'sm')}${esc(f.name)} · ${fmtSize(f.size)}</div>`).join('') + bad.map(t => `<div class="bad">${ico('x', 'sm')}${esc(t)}</div>`).join('');
  if (ok.length === 1 && !$('#dTitle').value) $('#dTitle').placeholder = ok[0].name.replace(/\.[^.]+$/, '');
}

function openDocDialog(id) {
  const f = id ? S.files.find(x => x.id === id) : null;
  ui.editingDoc = f ? f.id : null; ui.pendingFiles = [];
  $('#docDialogTitle').textContent = f ? 'Edit report details' : 'Upload report';
  $('#dropZone').hidden = !!f;
  $('#docSaveBtn').textContent = f ? 'Save' : 'Upload';
  $('#dFile').value = ''; $('#dFileInfo').innerHTML = '';
  $('#dPerson').value = f ? f.person : defaultPerson();
  $('#dCategory').value = f ? f.category : 'Lab report';
  $('#dTitle').value = f ? f.title : ''; $('#dTitle').placeholder = 'e.g. Blood test – Nov 2026';
  $('#dDate').value = f ? f.date : todayStr();
  $('#dNotes').value = f ? f.notes : '';
  $('#docError').textContent = '';
  $('#docDialog').showModal();
}

async function saveDoc(e) {
  e.preventDefault();
  const err = t => { $('#docError').textContent = t; };
  const person = $('#dPerson').value.trim() || 'Me', category = $('#dCategory').value, date = $('#dDate').value, notes = $('#dNotes').value.trim(), title = $('#dTitle').value.trim();
  if (!isYmd(date)) return err('Choose the report date.');

  if (ui.editingDoc) {
    const f = S.files.find(x => x.id === ui.editingDoc); if (!f) return;
    Object.assign(f, { person, category, date, notes, title: title || f.title });
    if (f.driveId) enqueue({ op: 'upsert', sheet: 'Files', row: fileToRow(f) });
    save(); $('#docDialog').close(); renderAll(); toast('Details updated');
    return;
  }
  if (!ui.pendingFiles.length) return err('Choose at least one image or PDF file (max 10 MB each).');

  $('#docSaveBtn').disabled = true;
  try {
    const single = ui.pendingFiles.length === 1;
    for (const file of ui.pendingFiles) {
      const f = {
        id: uid('f_'), person, category, date, notes,
        title: single && title ? title : file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name, mime: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/octet-stream'),
        size: file.size, driveId: '', driveUrl: '', thumb: await makeThumb(file), createdAt: new Date().toISOString()
      };
      await idb.put(f.id, file);
      S.files.push(f);
    }
    save();
    $('#docDialog').close();
    S.ui.tab !== 'docs' ? showTab('docs') : renderAll();
    toast(`${plural(ui.pendingFiles.length, 'file')} added`);
    if (configured()) uploadPending(); else toast('Saved on this device. Connect Google in Settings to store in Drive.');
  } finally { $('#docSaveBtn').disabled = false; }
}

async function deleteDoc(id) {
  const f = S.files.find(x => x.id === id); if (!f) return;
  if (!(await ask(`Delete “${f.title}”?${f.driveId ? '\nIt will also be moved to the Bin in your Google Drive.' : ''}`, { title: 'Delete report file', ok: 'Delete', danger: true }))) return;
  S.files = S.files.filter(x => x.id !== id);
  await idb.del(id);
  if (f.driveId) enqueue({ op: 'delete', sheet: 'Files', id }); else save();
  renderAll(); toast('Report file deleted');
}

/* ===================================================================
 * Settings
 * ================================================================= */
function renderSettings() {
  $('#sUrl').value = CFG.WEB_APP_URL || S.settings.url;
  $('#urlWrap').hidden = !!CFG.WEB_APP_URL;
  $('#sSheet').value = S.settings.sheetUrl; $('#sPerson').value = S.settings.person;
  $('#accountCard').hidden = !configured();
  $('#pwForm').hidden = !(authed() && !S.auth.admin);
  $('#accountUser').textContent = S.auth ? S.auth.user + (lockedPerson() ? ` (${lockedPerson()})` : '') : '';
  $('#backendCard').hidden = !!lockedPerson();                 // only the owner connects the Sheet
  $('#sPersonWrap').hidden = !!lockedPerson();
  $('#moveWrap').hidden = !!lockedPerson();
  const tied = tiedPerson(), others = persons().filter(p => p !== tied);
  $('#mvFrom').innerHTML = (tied ? others : persons()).map(p => `<option>${esc(p)}</option>`).join('');
  if (tied && others.length) {                                   // records under another name are hidden from this login
    if (!$('#mvTo').value) $('#mvTo').value = tied;
    $('#mvMsg').textContent = `Records saved under “${others.join('”, “')}” are not shown for this login. Move them to “${tied}” to see them.`;
    $('#mvMsg').className = 'msg';
  }
  $('#moveWrap').hidden = !!lockedPerson() || (!!tied && !others.length);
  $('#mailCard').hidden = !(configured() && authed());
  if (configured() && authed()) loadMail();
  notifyState();
}

/** Puts every record of one person under another name (e.g. "Me" -> "Nithya"), here and in the Sheet. */
async function movePerson() {
  const from = $('#mvFrom').value, to = $('#mvTo').value.trim().replace(/\s+/g, ' ').slice(0, 40);
  const msg = (t, k = '') => { const el = $('#mvMsg'); el.textContent = t; el.className = 'msg ' + k; };
  if (!from || !to) return msg('Choose the name to move from and type the name to move to.', 'err');
  if (from === to) return msg('Both names are the same.', 'err');
  const exists = persons().includes(to);
  if (!(await ask(`${exists ? `Combine “${from}” into “${to}”` : `Rename “${from}” to “${to}”`}?\nAll medicines, dose history, periods and report files of “${from}” will be saved under “${to}”.`, { title: 'Move records', ok: exists ? 'Combine' : 'Rename' }))) return;
  let n = 0;
  S.medicines.forEach(m => { if (m.person === from) { m.person = to; n++; enqueue({ op: 'upsert', sheet: 'Medicines', row: medToRow(m) }); } });
  Object.values(S.logs).forEach(l => { if (l.person === from) { l.person = to; enqueue({ op: 'upsert', sheet: 'DoseLog', row: l }); } });
  S.periods.forEach(p => { if (p.person === from) { p.person = to; n++; enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(p) }); } });
  Object.values(S.days).filter(d => d.person === from).forEach(d => {
    delete S.days[d.id]; enqueue({ op: 'delete', sheet: 'DayLog', id: d.id });
    const id = dayKey(to, d.date);
    if (!S.days[id]) { S.days[id] = { ...d, id, person: to }; n++; enqueue({ op: 'upsert', sheet: 'DayLog', row: dayToRow(S.days[id]) }); }
  });
  S.files.forEach(f => { if (f.person === from) { f.person = to; n++; if (f.driveId) enqueue({ op: 'upsert', sheet: 'Files', row: fileToRow(f) }); } });
  if ((S.settings.person || 'Me') === from) S.settings.person = to;
  if (S.ui.person === from) S.ui.person = '*';
  save(); $('#mvTo').value = '';
  renderAll();
  msg(`${plural(n, 'record')} moved to “${to}” ✔`, 'good');
}

/* ----- Settings > Mail: where this login's reminder and missed-tablet mails go ----- */
function mailMsg(text, kind = '') { const el = $('#mailMsg'); el.textContent = text; el.className = 'msg ' + kind; }
function showMail(m) {
  ui.mail = m;
  if (document.activeElement !== $('#sMail')) $('#sMail').value = m.email || '';
  $('#sMailDue').checked = m.due !== false; $('#sMailMissed').checked = m.missed !== false;
}
// the deployed Apps Script is older than this page: it does not know the mail actions yet
const oldBackend = e => /Unknown action/.test(e.message) ? 'Your Google backend is an older version. Paste the new backend/Code.gs into Apps Script, then Deploy > Manage deployments > Edit > New version.' : '';
async function loadMail() {
  if (ui.mail) return showMail(ui.mail);
  try { showMail((await api('getMail')).mail || {}); }
  catch (e) { mailMsg(oldBackend(e) || 'Could not load mail settings: ' + e.message, 'err'); }
}
async function saveMail(thenTest) {
  const mail = { email: $('#sMail').value.trim(), due: $('#sMailDue').checked, missed: $('#sMailMissed').checked };
  mailMsg('Saving…');
  try {
    showMail((await api('setMail', { mail })).mail);
    if (!thenTest) return mailMsg('Saved ✔', 'good');
    const t = await api('testMail');
    mailMsg(`Test mail sent to ${t.to} ✔`, 'good');
  } catch (e) { mailMsg(oldBackend(e) || e.message, 'err'); }
}
function readSettings() {
  if (!CFG.WEB_APP_URL) S.settings.url = $('#sUrl').value.trim();
  S.settings.sheetUrl = $('#sSheet').value.trim(); S.settings.person = $('#sPerson').value.trim() || 'Me';
  save();
}
function connMsg(text, kind = '') { const el = $('#connMsg'); el.textContent = text; el.className = 'msg ' + kind; }

async function connect() {
  readSettings(); renderHeader();
  if (!configured()) { connMsg('Saved. Working on this device only.', 'good'); return; }
  if (!authed()) { showLogin('Sign in to connect.'); return; }
  await connectCore();
}

async function connectCore() {
  connMsg('Connecting…');
  try {
    const ping = await api('ping');
    const all = await api('getAll');
    const remote = (all.medicines?.length || 0) + (all.logs?.length || 0) + (all.periods?.length || 0) + (all.days?.length || 0) + (all.files?.length || 0);
    const local = S.medicines.length + Object.keys(S.logs).length + S.periods.length + Object.keys(S.days).length + S.files.length;
    if (remote && local && !(await ask('The Google Sheet already has data and this device also has data.\n\n“Use the Sheet” replaces what is on this device.\n“Keep this device” uploads it into the Sheet (merged by ID).', { title: 'Two sets of records', ok: 'Use the Sheet', cancel: 'Keep this device' }))) {
      queueAll(); await flush(); await pull();
    } else if (remote) {
      applyRemote(all); save();
    } else if (local) {
      queueAll(); await flush();
    }
    renderAll();
    connMsg(`Connected${ping.user ? ' as ' + ping.user : ''} ✔  ${remote ? 'Data loaded from the Sheet.' : local ? 'This device’s data was uploaded.' : ''}`, 'good');
    uploadPending();
  } catch (e) { setSync('err', e.message); connMsg('Could not connect: ' + e.message, 'err'); }
}

async function addSample() {
  const p = S.settings.person || 'Me', t = todayStr(), now = new Date().toISOString();
  const mk = o => ({ id: uid('m_'), person: p, type: 'Tablet', dose: '', food: 'Any time', notes: '', createdAt: now, repeat: 'daily', ...o });
  const meds = [
    mk({ name: 'Paracetamol 500 mg', dose: '1 tablet', startDate: addDays(t, -2), days: 5, noEnd: false, times: [{ label: 'Morning', time: '08:00' }, { label: 'Night', time: '21:00' }], food: 'After food', notes: 'Stop when fever is gone' }),
    mk({ name: 'Iron tonic', type: 'Tonic', dose: '10 ml', startDate: addDays(t, -2), days: 30, noEnd: true, times: [{ label: 'Daily', time: '09:00' }], food: 'After food' }),
    mk({ name: 'Vitamin D tonic', type: 'Tonic', dose: '1 sachet', startDate: addDays(t, -60), days: 365, noEnd: true, repeat: 'nth:2:0', times: [{ label: 'Monthly', time: '09:00' }], food: 'After food', notes: 'Second Sunday of every month' })
  ];
  meds.forEach(m => { S.medicines.push(m); enqueue({ op: 'upsert', sheet: 'Medicines', row: medToRow(m) }); });
  [-70, -42, -14].forEach(off => {
    const s = addDays(t, off), pr = { id: uid('p_'), person: p, startDate: s, endDate: addDays(s, 4), flow: 'Medium', pain: 2, notes: '' };
    S.periods.push(pr); enqueue({ op: 'upsert', sheet: 'Periods', row: periodToRow(pr) });
    const flows = ['Spotting', 'Medium', 'Heavy', 'Heavy', 'Light'], pains = [2, 5, 7, 6, 3], moods = ['Tired', 'Irritable', 'Low', 'Okay', 'Calm'], pads = [1, 3, 5, 4, 2];
    const symp = [['Fatigue'], ['Cramps', 'Back pain'], ['Cramps', 'Headache', 'Bloating'], ['Cramps'], []];
    flows.forEach((f, i) => storeDay({ ...blankDay(p, addDays(s, i)), flow: f, pain: pains[i], mood: moods[i], symptoms: symp[i], pads: pads[i], padType: i === 3 ? 'Overnight' : i === 2 ? 'Large' : 'Regular', notes: i === 2 ? 'Rest day, heat pad helped' : '' }));
  });
  let i = 0;
  [addDays(t, -2), addDays(t, -1)].forEach(date => dosesOn(date, p).forEach(d => {
    i++;
    if (i % 5 === 3) return;                                   // left un-marked -> shows as Missed
    const status = i % 7 === 4 ? 'skipped' : 'taken';
    const row = { id: d.key, medId: d.med.id, person: p, medicine: d.med.name, date, slot: d.label, time: d.time, status, takenAt: status === 'taken' ? new Date(`${date}T${d.time}:00`).toISOString() : '' };
    S.logs[d.key] = row; enqueue({ op: 'upsert', sheet: 'DoseLog', row });
  }));
  save(); renderAll(); toast('Sample data added');
}

/* ===================================================================
 * Events
 * ================================================================= */
function go(what) {
  if (what === 'meds-add') { showTab('meds'); openMedDialog(); }
  else if (what === 'period-add') { showTab('periods'); openPeriodDialog(); }
  else if (what === 'doc-add') openDocDialog();
  else if (what === 'sample') addSample();
}

function bind() {
  $$('[data-ico]').forEach(el => { el.innerHTML = ico(el.dataset.ico); });
  $('#askYes').onclick = () => answer(true);
  $('#askNo').onclick = () => answer(false);
  $('#askDialog').addEventListener('close', () => { if (!$('#askDialog').open) answer(false); });   // closed with the Esc key
  $('#viewDialog').addEventListener('close', () => { URL.revokeObjectURL(viewUrl); $('#viewImg').removeAttribute('src'); });
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#personFilter').addEventListener('change', e => { S.ui.person = e.target.value; save(); renderActive(); });
  $('#syncPill').addEventListener('click', syncNow);

  // sign-in / sign-out
  $('#loginForm').addEventListener('submit', doLogin);
  $('#showPass').addEventListener('change', e => { $('#loginPass').type = e.target.checked ? 'text' : 'password'; });
  $('#logoutBtn').onclick = logout;
  $('#forgotLink').onclick = () => forgotView(true);
  $('#fgBack').onclick = () => forgotView(false);
  $('#forgotForm').addEventListener('submit', sendResetCode);
  $('#fgReset').onclick = resetPassword;
  $('#pwForm').addEventListener('submit', changePassword);

  // global delegation for data-go / data-act / data-close
  document.addEventListener('click', e => {
    const goBtn = e.target.closest('[data-go]'); if (goBtn) return go(goBtn.dataset.go);
    const close = e.target.closest('[data-close]'); if (close) return close.closest('dialog').close();
    if (dayDialogClick(e)) return;
    const dayBtn = e.target.closest('[data-day]'); if (dayBtn) return gotoDay(dayBtn.dataset.day);
    const mf = e.target.closest('[data-medfilter]'); if (mf) { ui.medFilter = mf.dataset.medfilter; return renderMeds(); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { act, id, key } = b.dataset;
    if (act === 'taken' || act === 'skipped' || act === 'undo') {
      const d = dosesOn(ui.date, '*').find(x => x.key === key); if (d) setDoseStatus(d, act === 'undo' ? null : act);
    }
    else if (act === 'edit') openMedDialog(id);
    else if (act === 'del') deleteMed(id);
    else if (act === 'end') endMedToday(id);
    else if (act === 'pedit') openPeriodDialog(id);
    else if (act === 'pdel') deletePeriod(id);
    else if (act === 'endperiod') endPeriodToday(id);
    else if (act === 'dayopen') openDayDialog(b.dataset.date);
    else if (act === 'flow') quickFlow(b.dataset.flow);
    else if (act === 'padplus') quickPads(1);
    else if (act === 'padminus') quickPads(-1);
    else if (act === 'calprev') shiftMonth(-1);
    else if (act === 'calnext') shiftMonth(1);
    else if (act === 'perview') { ui.perView = b.dataset.view; renderPeriods(); }
    else if (act === 'dopen') openDoc(id);
    else if (act === 'ddown') downloadDoc(id);
    else if (act === 'dedit') openDocDialog(id);
    else if (act === 'ddel') deleteDoc(id);
    else if (act === 'dretry') { const f = S.files.find(x => x.id === id); if (f) uploadOne(f).then(() => { renderActive(); toast('Saved to Google Drive'); }).catch(er => { renderActive(); toast('Upload failed: ' + er.message, 'err'); }); }
  });

  // today
  $('#dayPrev').onclick = () => { ui.date = addDays(ui.date, -1); renderToday(); };
  $('#dayNext').onclick = () => { ui.date = addDays(ui.date, 1); renderToday(); };
  $('#dayToday').onclick = () => { ui.date = todayStr(); renderToday(); };
  $('#dayPick').addEventListener('change', e => { if (isYmd(e.target.value)) gotoDay(e.target.value); });

  // sort order of each list (remembered on this device)
  [['#medSort', 'medSort'], ['#perSort', 'perSort'], ['#logSort', 'logSort'], ['#docSort', 'docSort']].forEach(([sel, key]) =>
    $(sel).addEventListener('change', e => { S.ui[key] = e.target.value; save(); renderActive(); }));

  // medicine form
  $('#addMedBtn').onclick = () => openMedDialog();
  $('#medForm').addEventListener('submit', saveMed);
  $('#mNoEnd').addEventListener('change', e => { $('#mDays').disabled = e.target.checked; });
  $('#mRepeat').addEventListener('change', updateRepeatUI);
  $('#timeRows').addEventListener('click', e => { const d = e.target.closest('.t-del'); if (d) d.closest('.time-row').remove(); });
  $$('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.preset; addTimeRow(k === 'Daily' && $('#mRepeat').value !== 'daily' ? 'Dose' : k, PRESETS[k]);
  }));

  // periods and the daily log
  $('#logDayBtn').onclick = () => openDayDialog(todayStr());
  $('#dayForm').addEventListener('submit', saveDay);
  $('#dyDel').onclick = deleteDay;
  $('#dyNotes').addEventListener('input', e => { if (dayDraft) dayDraft.notes = e.target.value; });
  $('#dyPain').addEventListener('input', e => { dayDraft.pain = +e.target.value; $('#dyPainOut').textContent = `${dayDraft.pain} / 10 · ${painWord(dayDraft.pain)}`; });
  $('#dyPlus').onclick = () => { dayDraft.pads = Math.min(40, dayDraft.pads + 1); $('#dyPads').textContent = dayDraft.pads; };
  $('#dyMinus').onclick = () => { dayDraft.pads = Math.max(0, dayDraft.pads - 1); $('#dyPads').textContent = dayDraft.pads; };
  $('#dyType').addEventListener('change', e => { dayDraft.padType = e.target.value; });
  document.addEventListener('change', e => {
    if (e.target.id === 'quickPadType') { const p = periodPerson(), t = todayStr(), d = dayOf(p, t); if (d) patchDay(p, t, { padType: e.target.value }); else patchDay(p, t, { padType: e.target.value, pads: 0 }); }
    else if (e.target.id === 'perSel') { ui.perSel = e.target.value; renderPeriods(); }
  });
  const rc = () => renderPeriods();
  $('#rcMonth').addEventListener('change', e => { const v = e.target.value; if (!v) return; const [y, m] = v.split('-').map(Number); ui.rec = { from: `${v}-01`, to: `${v}-${pad(new Date(y, m, 0).getDate())}`, year: '' }; rc(); });
  $('#rcYear').addEventListener('change', e => { const y = e.target.value; ui.rec = y ? { from: `${y}-01-01`, to: `${y}-12-31`, year: y } : { from: '2000-01-01', to: todayStr(), year: '' }; rc(); });
  ['#rcFrom', '#rcTo'].forEach(sel => $(sel).addEventListener('change', () => { const f = $('#rcFrom').value || ui.rec.from, t = $('#rcTo').value || ui.rec.to; ui.rec = { from: f, to: t < f ? f : t, year: '' }; rc(); }));
  $('#rcSort').addEventListener('change', e => { S.ui.recSort = e.target.value; save(); rc(); });
  $('#addPeriodBtn').onclick = () => openPeriodDialog();
  $('#periodForm').addEventListener('submit', savePeriod);

  // reports
  const rep = () => { ui.rep.from = $('#rFrom').value || ui.rep.from; ui.rep.to = $('#rTo').value || ui.rep.to; ui.rep.med = $('#rMed').value; if (ui.rep.from > ui.rep.to) ui.rep.to = ui.rep.from; renderReports(); };
  ['#rFrom', '#rTo', '#rMed'].forEach(s => $(s).addEventListener('change', rep));
  $$('[data-range]').forEach(b => b.addEventListener('click', () => {
    const t = todayStr(), r = b.dataset.range;
    ui.rep.to = t;
    ui.rep.from = r === 'today' ? t : r === 'month' ? t.slice(0, 8) + '01' : addDays(t, -(parseInt(r, 10) - 1));
    renderReports();
  }));
  $('#csvDosesBtn').onclick = csvDoses; $('#csvPeriodsBtn').onclick = csvPeriods; $('#csvDaysBtn').onclick = csvDays;
  $('#printBtn').onclick = () => window.print();

  // report files
  $('#addDocBtn').onclick = () => openDocDialog();
  $('#docForm').addEventListener('submit', saveDoc);
  const dz = $('#dropZone'), fi = $('#dFile');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', () => setPendingFiles(fi.files));
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => setPendingFiles(e.dataTransfer.files));
  $('#docCat').addEventListener('change', e => { ui.docCat = e.target.value; renderDocs(); });
  $('#docSearch').addEventListener('input', e => { ui.docSearch = e.target.value; renderDocs(); });

  // settings
  $('#saveConnBtn').onclick = connect;
  $('#syncNowBtn').onclick = async () => { readSettings(); await syncNow(); connMsg(syncState === 'ok' ? 'Synced ✔' : 'Sync failed: ' + syncMsg, syncState === 'ok' ? 'good' : 'err'); };
  $('#pushAllBtn').onclick = async () => {
    readSettings(); if (!configured()) return connMsg('Enter the Web app URL first.', 'err');
    queueAll(); const ok = await flush(); await uploadPending();
    connMsg(ok ? 'Uploaded everything from this device to the Sheet ✔' : 'Failed: ' + syncMsg, ok ? 'good' : 'err');
  };
  $('#pullAllBtn').onclick = async () => {
    readSettings(); if (!configured()) return connMsg('Enter the Web app URL first.', 'err');
    if (!(await ask('Replace the data on this device with the data in the Google Sheet?', { title: 'Download from the Sheet', ok: 'Replace' }))) return;
    const ok = await pull(); connMsg(ok ? 'Downloaded from the Sheet ✔' : 'Failed: ' + syncMsg, ok ? 'good' : 'err');
  };
  $('#sPerson').addEventListener('change', () => { readSettings(); renderHeader(); });
  $('#mvBtn').onclick = movePerson;
  $('#mailForm').addEventListener('submit', e => { e.preventDefault(); saveMail(false); });
  $('#mailTestBtn').onclick = () => saveMail(true);
  $('#notifyBtn').onclick = async () => {
    const LN = nativeNotif();
    if (LN) { try { await LN.requestPermissions(); } catch (e) { /* ignore */ } await scheduleNative(); notifyState(); return toast('Phone reminders are set for the next 14 days'); }
    if (!('Notification' in window)) return toast('This browser does not support pop-up reminders', 'err');
    await Notification.requestPermission(); notifyState(); beep();
  };
  $('#sampleBtn').onclick = () => addSample();
  $('#exportBtn').onclick = () => downloadText(`medicine-monitor-backup_${todayStr()}.json`, JSON.stringify({ medicines: S.medicines, logs: S.logs, periods: S.periods, days: S.days, files: S.files }, null, 2), 'application/json', false);
  $('#importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.medicines)) throw new Error('not a backup file');
      if (!(await ask('Replace the data on this device with this backup?', { title: 'Restore backup', ok: 'Replace' }))) return;
      S.medicines = d.medicines; S.logs = d.logs || {}; S.periods = d.periods || []; S.days = d.days || {}; S.files = (d.files || []).filter(f => f.driveId);
      save(); renderAll(); toast('Backup restored');
      if (configured()) { queueAll(); flush(); }
    } catch (er) { toast('Could not read the backup: ' + er.message, 'err'); }
  });
  $('#clearBtn').onclick = async () => {
    if (!(await ask('Clear all medicines, history, periods and files on THIS device?\n(The Google Sheet is not changed.)', { title: 'Clear this device', ok: 'Clear', danger: true }))) return;
    S.medicines = []; S.logs = {}; S.periods = []; S.days = {}; S.files = []; S.queue = [];
    await idb.clear(); save(); renderAll(); toast('This device is cleared');
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || locked) return;
    if (configured() && Date.now() - S.lastPull > 60000) pull();
    tick();
  });
  window.addEventListener('online', () => { if (configured() && !locked) { flush(); uploadPending(); } });
}

/* ===================================================================
 * Start
 * ================================================================= */
bind();
setInterval(tick, 20000);
if (configured() && !authed()) showLogin(S.auth ? 'Your session ended. Please sign in again.' : '', false);   // not signed in -> only the login screen
else startApp(false);

// Installable web app (works offline for the screens). Not needed inside the Android / Windows apps.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !isNative()) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
}

})();
