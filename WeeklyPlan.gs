/*
==================================================================
Legend Subs Training Tracker — WeeklyPlan.gs
Pre-filled weekly plans: the tracker drafts each store's plan
Wednesday night, the manager finishes it in the Weekly Plan tab and
sends it. Friday noon, anyone who hasn't sent gets a reminder.

Add this as a NEW script file next to Code.gs. It uses these from
Code.gs: SH, rows_(), ss_(), auth_(), canSee_(), setting_().
Run installPlanTriggers() once from the editor to turn on the
Wednesday drafts and Friday reminders.
==================================================================
*/

const PLAN_SHEET = 'Plans';
const PLAN_HEADERS = ['Week', 'Store #', 'Status', 'Data', 'Updated by', 'Updated at', 'Sent at'];
const PLAN = {
  STALL_DAYS: 14,          // no check-offs in this many days = stalled
  STALL_MIN_TENURE: 21,    // only flag stalls after 3 weeks on the job
  P1_TARGET_DAY: 30,       // Phase 1 should be done by this day
  P1_BEHIND_DAY: 20,       // after this day, Phase 1 under P1_BEHIND_PCT is high priority
  P1_BEHIND_PCT: 75,
  P3_CLOSE_PCT: 75,        // Phase 3 at or above this = "close, finish and certify"
  P3_NOT_STARTED_DAYS: 60, // Phase 1 done but Phase 3 not started after this many days
  NEW_HIRE_DAYS: 30,
  POF_DAYS: 30,            // suggest a POF if none recorded in this many days
  NEXT_TASKS: 4,           // how many open tasks to list per person
  ACTIVE_TENURE: 90,       // hired within this many days = in training
  ACTIVE_CHECK_DAYS: 30,   // or had a check-off within this many days
  SUGGEST_MAX: 6           // how many people Auto-suggest adds at a time
};
const PLAN_DAY = 864e5;

/* ---------------- Small helpers (self-contained) ---------------- */

function planTz_() { return Session.getScriptTimeZone() || 'America/New_York'; }
function planYmd_(d) { return Utilities.formatDate(d, planTz_(), 'yyyy-MM-dd'); }
function planDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function planDays_(from, to) { return from ? Math.floor((to - from) / PLAN_DAY) : null; }
function planBool_(v) { return v === true || /^(true|yes|y|1|x)$/i.test(String(v).trim()); }
function planKey_(l, s, t) { return [l, s, t].map(x => String(x).trim().toLowerCase()).join('|'); }
function planEsc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function planSetting_(k) { try { return String(setting_(k) || '').trim(); } catch (e) { return ''; } }

/* The plan is for the coming Monday (on a Monday, that same day). */
function planWeekStart_(now) {
  const d = new Date(now || new Date());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (8 - d.getDay()) % 7);
  return planYmd_(d);
}
function planWeekLabel_(week) {
  return Utilities.formatDate(planDate_(week), planTz_(), 'MMMM d');
}

/* ---------------- Plans sheet ---------------- */

function planSheet_() {
  const ss = ss_();
  let s = ss.getSheetByName(PLAN_SHEET);
  if (!s) {
    s = ss.insertSheet(PLAN_SHEET);
    s.getRange(1, 1, 1, PLAN_HEADERS.length).setValues([PLAN_HEADERS]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function planFind_(week, storeId) {
  const s = planSheet_(), n = s.getLastRow();
  if (n < 2) return null;
  const vals = s.getRange(2, 1, n - 1, PLAN_HEADERS.length).getValues();
  for (let i = 0; i < vals.length; i++) {
    const w = vals[i][0] instanceof Date ? planYmd_(vals[i][0]) : String(vals[i][0]);
    if (w === week && String(vals[i][1]) === String(storeId)) {
      let data = null;
      try { data = JSON.parse(vals[i][3]); } catch (e) { data = null; }
      return { row: i + 2, status: String(vals[i][2] || 'Draft'), data: data, sentAt: vals[i][6] || '' };
    }
  }
  return null;
}

function planWrite_(week, storeId, status, data, who) {
  const s = planSheet_();
  const found = planFind_(week, storeId);
  const now = new Date();
  const row = [week, String(storeId), status, JSON.stringify(data), who || 'Tracker', now, status === 'Sent' ? now : (found && found.sentAt) || ''];
  if (found) s.getRange(found.row, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  s.getRange(2, 1, Math.max(s.getLastRow() - 1, 1), 1).setNumberFormat('@'); // keep week as text
}

/* ---------------- Store and people lookups ---------------- */

function planStores_() {
  return rows_(SH.STORES)
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({ id: String(r[0]).trim(), name: String(r[1]).trim(), market: String(r[2]).trim() }));
}
function planStore_(storeId) {
  return planStores_().filter(s => s.id === String(storeId))[0] || { id: String(storeId), name: '', market: '' };
}

/* Managers = active users assigned to this store specifically (not "All"). */
function planManagerEmails_(storeId) {
  return rows_(SH.USERS)
    .filter(r => r[1] && r[5] !== false && !/^(no|false|n)$/i.test(String(r[5])))
    .filter(r => {
      const list = String(r[3]).split(/[,;\s]+/).map(x => x.trim()).filter(String);
      return list.indexOf(String(storeId)) > -1 && !/^all$/i.test(String(r[3]).trim());
    })
    .map(r => String(r[1]).trim());
}

/* DM / leadership recipients come from the Settings tab:
   "Plan recipients North", "Plan recipients South" (comma-separated emails) and
   "Plan recipients All" (added to every store's plan, e.g. Matt and Crowley). */
const PLAN_DMS = { North: 'jake@legend-subs.com', South: 'adamstanneck24@gmail.com' };
const PLAN_ALWAYS = 'mgoyette74@gmail.com, crowley@legend-subs.com'; // Matt and Crowley

/* The store's DM. A "Plan recipients North/South" row in Settings overrides the default. */
function planDmEmails_(market) {
  const v = planSetting_('Plan recipients ' + market) || PLAN_DMS[market] || '';
  return v.split(',').map(x => x.trim()).filter(x => /@/.test(x));
}

/* Every plan goes to Matt, Crowley and that store's DM. */
function planRecipients_(store) {
  const list = planDmEmails_(store.market)
    .concat((planSetting_('Plan recipients All') || PLAN_ALWAYS).split(','))
    .map(x => x.trim()).filter(x => /@/.test(x));
  return list.filter((x, i) => list.map(y => y.toLowerCase()).indexOf(x.toLowerCase()) === i);
}

function planAppUrl_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }

/* ---------------- Build a draft from the tracker ---------------- */

function planBuild_(storeId, week) {
  const today = new Date();
  const store = planStore_(storeId);

  const tasks = rows_(SH.TASKS)
    .map(r => ({ level: String(r[0]).trim(), section: String(r[1]).trim(), task: String(r[2]).trim(), order: Number(r[3]) || 0 }))
    .filter(t => t.level && t.task)
    .sort((a, b) => a.order - b.order);
  const byLevel = {};
  tasks.forEach(t => (byLevel[t.level] = byLevel[t.level] || []).push(t));

  const done = {}, lastCheck = {};
  rows_(SH.PROG).forEach(r => {
    const id = String(r[0]);
    if (planBool_(r[4])) (done[id] = done[id] || {})[planKey_(r[1], r[2], r[3])] = true;
    const at = planDate_(r[6]);
    if (at && planBool_(r[4]) && (!lastCheck[id] || at > lastCheck[id])) lastCheck[id] = at;
  });

  const lastPof = {};
  rows_(SH.POF).forEach(r => {
    const id = String(r[1]), d = planDate_(r[3]);
    if (d && (!lastPof[id] || d > lastPof[id])) lastPof[id] = d;
  });

  const emps = rows_(SH.EMP).filter(r =>
    String(r[1]).trim() === String(storeId) && r[2] &&
    !/inactive|terminat|former|left|quit|separated/i.test(String(r[6])));

  const levelStat = (id, level) => {
    const list = byLevel[level] || [], mine = done[id] || {};
    const open = list.filter(t => !mine[planKey_(t.level, t.section, t.task)]);
    const total = list.length, d = total - open.length;
    return { total: total, done: d, pct: total ? Math.round(d / total * 100) : 0, open: open, complete: total > 0 && !open.length };
  };

  const people = [], mitCandidates = [], pofSuggest = [], untracked = [];
  let newHires = 0;

  emps.forEach(r => {
    const id = String(r[0]), name = String(r[2]).trim();
    const start = planDate_(r[4]);
    const tenure = planDays_(start, today);
    const mit = String(r[7]).trim();
    if (tenure != null && tenure <= PLAN.NEW_HIRE_DAYS) newHires++;

    const p1 = levelStat(id, 'Phase 1'), p3 = levelStat(id, 'Phase 3');
    const sinceCheck = lastCheck[id] ? planDays_(lastCheck[id], today) : null;
    const stalled = tenure != null && tenure >= PLAN.STALL_MIN_TENURE &&
      (sinceCheck == null || sinceCheck >= PLAN.STALL_DAYS);

    // Only people actively in training make the plan. Long-time staff with no recent
    // check-offs are counted separately so the plan doesn't fill up with them.
    const inTraining = /^enrolled$/i.test(mit) || (tenure != null && tenure <= PLAN.ACTIVE_TENURE) ||
      (sinceCheck != null && sinceCheck <= PLAN.ACTIVE_CHECK_DAYS);
    if (!inTraining && !(p1.complete && p3.complete)) { untracked.push(name); return; }
    // Never had a check-off and past the new-hire window: their checklist isn't being used yet.
    if (sinceCheck == null && !/^enrolled$/i.test(mit) && !(tenure != null && tenure <= PLAN.NEW_HIRE_DAYS)) { untracked.push(name); return; }

    let entry = null;

    if (/^enrolled$/i.test(mit)) {
      const m = levelStat(id, 'MIT');
      const sections = [];
      (byLevel['MIT'] || []).forEach(t => { if (sections.indexOf(t.section) < 0) sections.push(t.section); });
      const cur = m.open.length ? m.open[0].section : '';
      const secTasks = m.open.filter(t => t.section === cur);
      entry = {
        level: 'MIT',
        detail: m.complete ? 'All sections done' : 'Section ' + (sections.indexOf(cur) + 1) + ' of ' + sections.length + (cur ? ' · ' + cur : ''),
        next: secTasks.slice(0, PLAN.NEXT_TASKS).map(t => t.task),
        priority: stalled ? 'High' : 'Low',
        reason: stalled ? 'No MIT check-offs in ' + (sinceCheck == null ? 'a while' : sinceCheck + ' days') : ''
      };
    } else if (!p1.complete) {
      let priority = 'Mid', reason = 'Target: Phase 1 done by day ' + PLAN.P1_TARGET_DAY;
      if (stalled) { priority = 'High'; reason = 'No check-offs in ' + (sinceCheck == null ? 'a while' : sinceCheck + ' days'); }
      else if (tenure != null && tenure > PLAN.P1_BEHIND_DAY && p1.pct < PLAN.P1_BEHIND_PCT) {
        priority = 'High'; reason = 'Day ' + tenure + ' and only ' + p1.pct + '% through Phase 1';
      }
      entry = {
        level: 'Phase 1',
        detail: (tenure != null ? 'Day ' + tenure + ' · ' : '') + p1.pct + '%',
        next: p1.open.slice(0, PLAN.NEXT_TASKS).map(t => t.task),
        priority: priority, reason: reason
      };
    } else if (!p3.complete && p3.total) {
      if (p3.done > 0) {
        let priority = 'Low', reason = '';
        if (stalled) { priority = 'High'; reason = 'No check-offs in ' + (sinceCheck == null ? 'a while' : sinceCheck + ' days'); }
        else if (p3.pct >= PLAN.P3_CLOSE_PCT) { priority = 'Mid'; reason = p3.open.length + ' task' + (p3.open.length === 1 ? '' : 's') + ' from certifying'; }
        entry = { level: 'Phase 3', detail: p3.pct + '% · ' + p3.open.length + ' left', next: p3.open.slice(0, PLAN.NEXT_TASKS).map(t => t.task), priority: priority, reason: reason };
      } else if (tenure != null && tenure > PLAN.P3_NOT_STARTED_DAYS) {
        entry = { level: 'Phase 3', detail: 'Not started · day ' + tenure, next: p3.open.slice(0, PLAN.NEXT_TASKS).map(t => t.task), priority: 'Mid', reason: 'Phase 1 done, Phase 3 not started after ' + PLAN.P3_NOT_STARTED_DAYS + ' days' };
      }
    } else if (p3.complete && !/^graduated$/i.test(mit)) {
      mitCandidates.push(name);
    }

    if (entry) {
      entry.id = id; entry.name = name;
      entry.notes = entry.next.join(', ');
      entry.trainer = '';
      people.push(entry);
      const pd = lastPof[id] ? planDays_(lastPof[id], today) : null;
      if ((entry.level === 'Phase 1' || entry.level === 'Phase 3') && (pd == null || pd > PLAN.POF_DAYS)) pofSuggest.push(name);
    }
  });

  const rank = { High: 0, Mid: 1, Low: 2 };
  people.sort((a, b) => rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name));

  return {
    week: week, storeId: String(storeId), storeName: store.name, market: store.market,
    people: people,
    mitCandidates: mitCandidates,
    untracked: untracked,
    roster: emps.map(r => ({ id: String(r[0]), name: String(r[2]).trim(), position: String(r[5]).trim() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    staffing: { roster: emps.length, newHires: newHires, need: '', out: '', detail: '' },
    joining: '',
    pofs: pofSuggest.map(n => n + ' — ').join('\n'),
    grassroots: '', hiring: '', needs: '', other: '',
    builtAt: new Date().toISOString()
  };
}

/* Rebuild training rows from the tracker but keep what the manager typed. */
function planMerge_(fresh, saved) {
  if (!saved) return fresh;
  const old = {};
  (saved.people || []).forEach(p => { old[p.id || p.name] = p; });
  fresh.people = fresh.people.filter(p => old[p.id] || old[p.name]); // refresh only updates people already in the plan
  fresh.people.forEach(p => {
    const o = old[p.id];
    if (o) { p.trainer = o.trainer || ''; if (o.notesEdited) { p.notes = o.notes; p.notesEdited = true; } p.priority = o.priority || ''; p.priorityEdited = !!o.priorityEdited; }
  });
  (saved.people || []).filter(p => p.manual).forEach(p => fresh.people.push(p));
  ['joining', 'pofs', 'grassroots', 'hiring', 'needs', 'other'].forEach(k => { if (saved[k]) fresh[k] = saved[k]; });
  ['need', 'out', 'detail'].forEach(k => { if (saved.staffing && saved.staffing[k]) fresh.staffing[k] = saved.staffing[k]; });
  if (fresh.hiring) { fresh.joining = [fresh.joining, fresh.hiring].filter(Boolean).join('\n'); fresh.hiring = ''; }
  return fresh;
}

/* A new week's plan starts blank; Auto-suggest fills in the training people and POFs. */
function planBlank_(storeId, week) { const d = planBuild_(storeId, week); d.people = []; d.pofs = ''; return d; }

/* ---------------- Calls from the Weekly Plan tab ---------------- */

function planUser_(token, storeId) {
  const u = auth_(token);
  if (!u) throw new Error('Your session expired. Log in again.');
  if (storeId != null) canSee_(u, storeId); // throws if the user can't see this store
  return u;
}
function planWho_(u) { return (u && (u.name || u.email)) || 'Manager'; }

function planGet(token, storeId, week) {
  planUser_(token, storeId);
  week = week || planWeekStart_();
  const found = planFind_(week, storeId);
  const data = found && found.data ? found.data : planBlank_(storeId, week);
  return {
    week: week, weekLabel: planWeekLabel_(week),
    status: found ? found.status : 'New',
    sentAt: found && found.sentAt ? String(found.sentAt) : '',
    data: data,
    due: 'Thursday 10pm'
  };
}

function planSave(token, storeId, week, data) {
  const u = planUser_(token, storeId);
  const found = planFind_(week, storeId);
  const status = found && found.status === 'Sent' ? 'Sent' : 'Draft';
  planWrite_(week, storeId, status, data, planWho_(u));
  return { ok: true, status: status };
}

function planRefresh(token, storeId, week, data) {
  planUser_(token, storeId);
  return planMerge_(planBuild_(storeId, week), data);
}

function planPreview(token, storeId, week, data) {
  planUser_(token, storeId);
  return planEmailHtml_(data, planWho_(auth_(token)));
}

function planSend(token, storeId, week, data) {
  const u = planUser_(token, storeId);
  const missing = (data.people || []).filter(p => !String(p.trainer || '').trim()).map(p => p.name);
  if (missing.length) throw new Error('Add a trainer for: ' + missing.join(', '));

  const store = planStore_(storeId);
  const to = planRecipients_(store);
  if (!to.length) throw new Error('No recipients set. Add "Plan recipients ' + store.market + '" to the Settings tab.');
  const me = u.email ? String(u.email) : '';

  MailApp.sendEmail({
    to: to.join(','),
    cc: me,
    replyTo: me || undefined,
    name: planWho_(u) + ' (via Training Tracker)',
    subject: 'Weekly Plan ' + store.id + ' | ' + store.name + ' | Week of ' + planWeekLabel_(week),
    htmlBody: planEmailHtml_(data, planWho_(u))
  });
  planWrite_(week, storeId, 'Sent', data, planWho_(u));
  return { ok: true, status: 'Sent', to: to };
}

/* ---------------- Auto-suggest ---------------- */

/* Ranks everyone on the store's roster by how much they need training focus right now.
   Works even when few check-offs are recorded: it falls back on tenure and position. */
function planSuggestions_(storeId) {
  const today = new Date();
  const tasks = rows_(SH.TASKS)
    .map(r => ({ level: String(r[0]).trim(), section: String(r[1]).trim(), task: String(r[2]).trim(), order: Number(r[3]) || 0 }))
    .filter(t => t.level && t.task).sort((a, b) => a.order - b.order);
  const byLevel = {};
  tasks.forEach(t => (byLevel[t.level] = byLevel[t.level] || []).push(t));
  const done = {}, lastCheck = {};
  rows_(SH.PROG).forEach(r => {
    const id = String(r[0]);
    if (!planBool_(r[4])) return;
    (done[id] = done[id] || {})[planKey_(r[1], r[2], r[3])] = true;
    const at = planDate_(r[6]);
    if (at && (!lastCheck[id] || at > lastCheck[id])) lastCheck[id] = at;
  });
  const stat = (id, level) => {
    const list = byLevel[level] || [], mine = done[id] || {};
    const open = list.filter(t => !mine[planKey_(t.level, t.section, t.task)]);
    const d = list.length - open.length;
    return { done: d, pct: list.length ? Math.round(d / list.length * 100) : 0, open: open, complete: list.length > 0 && !open.length };
  };
  const out = [];
  rows_(SH.EMP).filter(r => String(r[1]).trim() === String(storeId) && r[2] &&
    !/inactive|terminat|former|left|quit|separated/i.test(String(r[6]))).forEach(r => {
    const id = String(r[0]), name = String(r[2]).trim(), position = String(r[5]).trim(), mit = String(r[7]).trim();
    if (/^(enrolled|graduated)$/i.test(mit)) return;
    const tenure = planDays_(planDate_(r[4]), today);
    const since = lastCheck[id] ? planDays_(lastCheck[id], today) : null;
    const leader = /shift/i.test(position);
    const p1 = stat(id, 'Phase 1'), p3 = stat(id, 'Phase 3');
    const dayTxt = tenure != null ? 'Day ' + tenure + ' · ' : '';
    let s = null;
    if (!p1.complete && (p1.done > 0 || tenure == null || tenure <= PLAN.ACTIVE_TENURE)) {
      const late = tenure != null && tenure > PLAN.P1_TARGET_DAY;
      s = { level: 'Phase 1', score: 100 + (p1.done > 0 ? 15 : 0) + (late ? 10 : 0) - Math.min(tenure || 0, 90) / 3,
        priority: late || (since != null && since >= PLAN.STALL_DAYS) ? 'High' : 'Mid',
        detail: dayTxt + p1.pct + '%', reason: late ? 'Past day ' + PLAN.P1_TARGET_DAY + ', Phase 1 not finished' : 'New hire, finish Phase 1 by day ' + PLAN.P1_TARGET_DAY,
        next: p1.open };
    } else if (!p1.complete && leader) {
      s = { level: 'Phase 3', score: 75, priority: 'Mid', detail: dayTxt + 'Shift leader',
        reason: 'Shift leader with no training recorded. Confirm Phase 1 and start Phase 3', next: p3.open };
    } else if (!p1.complete) {
      s = { level: 'Phase 1', score: 30 + Math.min(tenure || 0, 365) / 365 * 10, priority: 'Low', detail: dayTxt + p1.pct + '%',
        reason: 'No Phase 1 check-offs recorded. Run a POF and sign off what they already know', next: p1.open };
    } else if (!p3.complete && !leader && p3.done === 0) {
      return; // finished Phase 1 but not put into Phase 3 yet
    } else if (!p3.complete) {
      s = { level: 'Phase 3', score: leader ? 85 : 60 + (p3.done > 0 ? 10 : 0), priority: leader ? 'Mid' : 'Low', detail: dayTxt + p3.pct + '%',
        reason: leader ? 'Shift leader, Phase 3 not finished' : 'Phase 1 done, ready for Phase 3', next: p3.open };
    } else {
      s = { level: 'MIT', score: 50, priority: 'Low', detail: 'Phase 3 certified', reason: 'MIT candidate. Talk to them about enrolling', next: [] };
    }
    s.id = id; s.name = name; s.suggested = true; s.trainer = '';
    s.next = s.next.slice(0, PLAN.NEXT_TASKS).map(t => t.task);
    s.notes = s.next.join(', ');
    out.push(s);
  });
  return out.sort((a, b) => b.score - a.score);
}

/* Button in the Weekly plan tab: adds the top suggestions that aren't already in the plan. */
function planSuggest(token, storeId, week, data) {
  planUser_(token, storeId);
  const have = ((data && data.people) || []).map(p => String(p.id));
  const names = ((data && data.people) || []).map(p => String(p.name).toLowerCase());
  const people = planSuggestions_(storeId)
    .filter(s => have.indexOf(s.id) < 0 && names.indexOf(s.name.toLowerCase()) < 0)
    .slice(0, PLAN.SUGGEST_MAX);
  return { people: people, pofs: (data && String(data.pofs || '').trim()) ? '' : planBuild_(storeId, week).pofs };
}

/* Admin / DM view: every store this user can see, with its plan status for the week. */
function planStatusAll(token, week) {
  const u = planUser_(token, null);
  week = week || planWeekStart_();
  const mine = (u.stores || []).map(String);
  const rows = planStores_().filter(s => mine.indexOf(clean_(s.id)) > -1).map(s => {
    const found = planFind_(week, s.id);
    const d = found && found.data ? found.data : planBlank_(s.id, week);
    const people = d.people || [];
    return {
      id: s.id, name: s.name, market: s.market,
      status: found ? found.status : 'Not started',
      sentAt: found && found.sentAt ? String(found.sentAt) : '',
      people: people.length,
      high: people.filter(p => p.priority === 'High').length,
      trainersLeft: people.filter(p => !String(p.trainer || '').trim()).length,
      untracked: (d.untracked || []).length
    };
  });
  return { week: week, weekLabel: planWeekLabel_(week), stores: rows };
}

/* ---------------- Email in the store weekly-plan layout ---------------- */

function planEmailHtml_(d, who) {
  const navy = '#173c63', red = '#d92732';
  const h2 = t => '<h2 style="font-size:17px;color:' + navy + ';border-bottom:2px solid ' + red + ';padding-bottom:7px;margin:25px 0 12px">' + t + '</h2>';
  const tag = p => {
    if (!p) return '';
    const c = p === 'High' ? ['#fcebeb', '#a32d2d'] : p === 'Mid' ? ['#faeeda', '#854f0b'] : ['#f1f4f8', '#64748b'];
    return '<span style="display:inline-block;font-size:11px;padding:1px 8px;border-radius:4px;background:' + c[0] + ';color:' + c[1] + '">' + p + '</span>';
  };
  const table = list => !list.length ? '<p style="font-size:14px;color:#64748b">—</p>' :
    '<table role="presentation" style="font-size:14px;width:100%;border-collapse:collapse;background:#f7f9fc">' +
    list.map(p =>
      '<tr><td style="padding:12px;border-bottom:1px solid #e1e5eb;vertical-align:top;width:30%"><strong>' + planEsc_(p.name) + '</strong><br>' +
      '<span style="color:#64748b">' + planEsc_(p.level) + (p.detail ? ' · ' + planEsc_(p.detail) : '') + '</span><br>' + tag(p.priority) + '</td>' +
      '<td style="padding:12px;border-bottom:1px solid #e1e5eb"><strong>Trainer:</strong> ' + planEsc_(p.trainer || '—') +
      '<br><strong>Plan notes:</strong> ' + planEsc_(p.notes || '—') +
      (p.reason ? '<br><span style="color:#64748b">' + planEsc_(p.reason) + '</span>' : '') + '</td></tr>').join('') +
    '</table>';
  const lines = s => {
    const items = String(s || '').split('\n').map(x => x.trim()).filter(String);
    return items.length ? '<ul style="font-size:14px;margin:8px 0;padding-left:22px">' + items.map(x => '<li style="margin-bottom:5px">' + planEsc_(x) + '</li>').join('') + '</ul>' : '<p style="font-size:14px">—</p>';
  };
  const people = d.people || [];
  const by = l => people.filter(p => p.level === l);
  const focus = ['High', 'Mid', 'Low'].map(pr => {
    const names = people.filter(p => p.priority === pr).map(p => p.name);
    return '<td style="padding:10px;vertical-align:top;width:33%;border:1px solid #e1e5eb">' + tag(pr) +
      '<div style="font-size:13px;margin-top:4px">' + (names.length ? planEsc_(names.join(', ')) : '—') + '</div></td>';
  }).join('');
  const st = d.staffing || {};

  return '<div style="margin:0;background:#f1f4f8"><div style="max-width:720px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#253247;line-height:1.6">' +
    '<div style="background:' + navy + ';color:#fff;padding:26px 30px;border-bottom:5px solid ' + red + '">' +
    '<div style="font-size:12px;letter-spacing:1.5px">JERSEY MIKE’S · ' + planEsc_(String(d.storeName || '').toUpperCase()) + ' · ' + planEsc_(d.storeId) + '</div>' +
    '<h1 style="font-size:27px;margin:8px 0 3px">Weekly Plan</h1><div style="font-size:16px">Week of ' + planEsc_(planWeekLabel_(d.week)) + '</div></div>' +
    '<div style="padding:8px 30px 28px">' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px"><tr>' + focus + '</tr></table>' +
    h2('1. Phase 1') + table(by('Phase 1')) +
    h2('2. Phase 3') + table(by('Phase 3')) +
    h2('3. MIT') + table(by('MIT')) +
    ((d.mitCandidates || []).length ? '<p style="font-size:13px;color:#64748b">Finished Phase 3, could be enrolled in MIT: ' + planEsc_(d.mitCandidates.join(', ')) + '</p>' : '') +
    ((d.untracked || []).length ? '<p style="font-size:13px;color:#64748b">' + d.untracked.length + ' longer-tenured employees have no recent check-offs in the tracker. Updating their checklists will bring them into future plans.</p>' : '') +
    h2('4. Staffing') + '<p style="font-size:14px"><strong>Current # of employees:</strong> ' + planEsc_(st.roster) +
    '<br><strong>New hires (last 30 days):</strong> ' + planEsc_(st.newHires) +
    '<br><strong>How many we need:</strong> ' + planEsc_(st.need || '0') +
    '<br><strong>On their way out:</strong> ' + planEsc_(st.out || '0') +
    (st.detail ? '<br><strong>Detailed staffing need:</strong> ' + planEsc_(st.detail) : '') + '</p>' +
    h2('5. New Hire Onboarding') + lines([d.joining, d.hiring].filter(Boolean).join('\n')) +
    h2('6. Grassroots, Catering, Fundraisers') + lines(d.grassroots) +
    h2('7. POFs') + lines(d.pofs) +
    h2('8. Facilities Maintenance') + lines(d.needs) +
    h2('9. Other') + lines(d.other) +
    '<div style="font-size:14px;border-top:1px solid #d9e0e9;margin-top:28px;padding-top:18px"><strong style="color:' + navy + '">' + planEsc_(who) + '</strong><br>' +
    '<span style="color:#64748b">Sent from the Legend Subs Training Tracker</span></div>' +
    '</div></div></div>';
}

/* ---------------- Scheduled jobs ---------------- */

/* Wednesday night: create a draft for every store and tell each manager it's ready. */
function planCreateDrafts() {
  const week = planWeekStart_();
  const url = planAppUrl_();
  planStores_().forEach(store => {
    try {
      if (!planFind_(week, store.id)) planWrite_(week, store.id, 'Draft', planBlank_(store.id, week), 'Tracker');
      const mgrs = planManagerEmails_(store.id);
      if (!mgrs.length) return;
      MailApp.sendEmail({
        to: mgrs.join(','),
        name: 'Legend Subs Training Tracker',
        subject: 'Your weekly plan draft is ready: ' + store.name + ', week of ' + planWeekLabel_(week),
        htmlBody: '<p>Your plan for the week of ' + planEsc_(planWeekLabel_(week)) + ' is ready.</p>' +
          '<p>Open the <strong>Weekly plan</strong> tab, hit <strong>Auto-suggest training plan</strong> to fill in who needs training, add trainers and the rest, then hit Send. It’s due Thursday at 10pm.</p>' +
          (url ? '<p><a href="' + url + '">Open the Training Tracker</a></p>' : '')
      });
    } catch (e) { console.error('Plan draft failed for ' + store.id + ': ' + e); }
  });
}

/* Friday noon: remind managers who haven't sent, and let the DM know. */
function planReminders() {
  const week = planWeekStart_(new Date(Date.now() - 4 * PLAN_DAY)); // Friday → the coming Monday's plan
  const url = planAppUrl_();
  planStores_().forEach(store => {
    const found = planFind_(week, store.id);
    if (found && found.status === 'Sent') return;
    const mgrs = planManagerEmails_(store.id);
    const dms = planDmEmails_(store.market);
    if (!mgrs.length && !dms.length) return;
    MailApp.sendEmail({
      to: (mgrs.length ? mgrs : dms).join(','),
      cc: mgrs.length ? dms.join(',') : '',
      name: 'Legend Subs Training Tracker',
      subject: 'Reminder: weekly plan not sent yet — ' + store.name,
      htmlBody: '<p>The weekly plan for ' + planEsc_(store.name) + ' (week of ' + planEsc_(planWeekLabel_(week)) + ') hasn’t been sent yet.</p>' +
        (url ? '<p><a href="' + url + '">Open the Weekly plan tab</a></p>' : '')
    });
  });
}

/* Run once from the editor. Safe to run again; it replaces its own triggers. */
function installPlanTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['planCreateDrafts', 'planReminders'].indexOf(t.getHandlerFunction()) > -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('planCreateDrafts').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(20).create();
  ScriptApp.newTrigger('planReminders').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(12).create();
  planSheet_();
  planEnsureSettings_();
}

/* Adds the recipient rows to the Settings tab if they aren't there yet (never overwrites). */
function planEnsureSettings_() {
  const s = ss_().getSheetByName(SH.SET);
  if (!s) return;
  const defaults = [
    ['Plan recipients North', PLAN_DMS.North],
    ['Plan recipients South', PLAN_DMS.South],
    ['Plan recipients All', PLAN_ALWAYS]
  ];
  const n = s.getLastRow();
  const have = n > 1 ? s.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  defaults.filter(d => have.indexOf(d[0]) < 0).forEach(d => s.appendRow(d));
  try { bump_(); } catch (e) {}
}

/* Handy for testing: builds this week's draft for one store and logs it. */
function testPlanDraft() {
  planStores_().forEach(s => {
    const d = planBuild_(s.id, planWeekStart_());
    const c = p => d.people.filter(x => x.priority === p).length;
    console.log(s.name + ' ' + s.id + ': ' + d.people.length + ' in plan (High ' + c('High') + ', Mid ' + c('Mid') + ', Low ' + c('Low') + '), roster ' + d.staffing.roster + ', not tracked ' + d.untracked.length + ', MIT candidates ' + d.mitCandidates.length);
    const sg = planSuggestions_(s.id).filter(x => d.people.map(p => p.id).indexOf(x.id) < 0).slice(0, PLAN.SUGGEST_MAX);
    console.log('   suggest: ' + sg.map(x => x.priority + ' ' + x.level + ' (' + x.reason + ')').join(' | ') + '\n   recipients: ' + planRecipients_(s).join(', '));
  });
}
