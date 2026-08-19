/* ═══════════════════════════════════════════════════════════════════════
   thinking-app — regression tests

   Open test.html. Nothing here is installed, built or bundled: the page
   injects the real index.html markup, loads the real app.js beside it, and
   these tests call the real functions.

   Two rules for anything added here:

     1. No test may touch real saved data. Storage is faked for the run and
        every test resets state first.
     2. A generated item is checked against many samples, not one. The whole
        point of the generators is that the numbers change each time, so a
        single sample proves nothing.

   Add a test by putting it inside a group() below. Groups run in order.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
'use strict';

/* ── the little framework ─────────────────────────────────────────────── */

const groups = [];
let current = null;

function group(name, fn) {
  current = { name: name, cases: [] };
  groups.push(current);
  fn();
  current = null;
}

function test(name, fn) {
  current.cases.push({ name: name, fn: fn });
}

function skip(name, why) {
  current.cases.push({ name: name, skip: why || 'skipped' });
}

class Failed extends Error {}

function fail(msg) { throw new Failed(msg); }

const show = v => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch (e) { return String(v); }
};

function ok(v, msg) {
  if (!v) fail((msg || 'expected something truthy') + '\n  got: ' + show(v));
}
function notOk(v, msg) {
  if (v) fail((msg || 'expected something falsy') + '\n  got: ' + show(v));
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    fail((msg || 'values differ') + '\n  expected: ' + show(expected) + '\n  actual:   ' + show(actual));
  }
}
function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) fail((msg || 'structures differ') + '\n  expected: ' + b + '\n  actual:   ' + a);
}
function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) {
    fail((msg || 'not close enough') + '\n  expected: ' + expected + ' ±' + tol + '\n  actual:   ' + actual);
  }
}
function has(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) === -1) {
    fail((msg || 'missing substring') + '\n  looking for: ' + show(needle) + '\n  inside:      ' + show(String(haystack).slice(0, 300)));
  }
}
function lacks(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) !== -1) {
    fail((msg || 'unwanted substring') + '\n  should not contain: ' + show(needle) + '\n  inside: ' + show(String(haystack).slice(0, 300)));
  }
}
function isNum(v, msg) {
  if (typeof v !== 'number' || !isFinite(v)) fail((msg || 'expected a finite number') + '\n  got: ' + show(v));
}
function nonEmptyStr(v, msg) {
  if (typeof v !== 'string' || !v.trim()) fail((msg || 'expected a non-empty string') + '\n  got: ' + show(v));
}

/* ── isolation ────────────────────────────────────────────────────────── */

/* Storage is replaced with an in-memory stand-in for the whole run, so the
   tests can be opened on the live site without eating a real session. If the
   browser refuses the swap the run stops rather than risking your data. */
let storageMode = 'unknown';

function fakeStorage() {
  const mem = new Map();
  return {
    getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: k => { mem.delete(String(k)); },
    clear: () => mem.clear(),
    key: i => (Array.from(mem.keys())[i] !== undefined ? Array.from(mem.keys())[i] : null),
    get length() { return mem.size; }
  };
}

function installFakeStorage() {
  const fake = fakeStorage();
  const targets = [window, Object.getPrototypeOf(window)];
  for (const target of targets) {
    try {
      Object.defineProperty(target, 'localStorage', { value: fake, configurable: true, writable: true });
    } catch (e) { /* try the next one */ }
    const sentinel = 'thinking-app:__probe__';
    try {
      localStorage.setItem(sentinel, 'x');
      const stuck = fake.getItem(sentinel) === 'x';
      localStorage.removeItem(sentinel);
      if (stuck) return true;
    } catch (e) { /* try the next one */ }
  }
  return false;
}

/* A reload: everything held in memory goes, everything in storage stays.
   This is what the resume tests are actually testing against. */
function reload() {
  timer.stop();
  session.running = false;
  session.timeUp = false;
  session.type = null;
  session.planned = 0;
  session.startedAt = 0;
  session.transcript = [];
  session.scratch = {};
  session.drafts = {};
  currentView = 'home';
  state = blankState();
  load();                 // what boot() does before it tries to resume
}

/* Every test starts from a blank slate: no leftover state, no running
   session, no live timer ticking underneath, nothing left in storage. */
function reset() {
  localStorage.clear();
  reload();
}

/* Data loaded once and shared, so a run does not fetch the corpus 20 times. */
const data = {};

async function getJSON(path) {
  if (data[path]) return data[path];
  const res = await fetch(path + (window.__BUST || '?harness=1'));
  if (!res.ok) throw new Error(path + ': ' + res.status + ' ' + res.statusText);
  data[path] = await res.json();
  return data[path];
}

/* ═══════════════════════════════════════════════════════════════════════
   1.  THE HARNESS ITSELF
   ═══════════════════════════════════════════════════════════════════════ */

group('harness', () => {
  test('real storage is not in use', () => {
    eq(storageMode, 'faked', 'the run must not be able to write over saved sessions');
  });

  test('the app markup is present', () => {
    ok(document.getElementById('view-home'), 'index.html body was injected');
    ok(document.getElementById('math-form'), 'forms app.js binds to exist');
    ok(document.getElementById('drill-entry'), 'the drill form exists');
  });

  test('app.js did not boot itself', () => {
    eq(window.THINKING_APP_TEST, true);
    eq(state.completedSessions, 0, 'a booted app would have loaded saved state');
  });

  test('every view named in VIEWS has a section', () => {
    VIEWS.forEach(v => ok(document.getElementById('view-' + v), 'missing #view-' + v));
  });

  test('every field the drafts watcher wants exists', () => {
    DRAFT_FIELDS.forEach(id => ok(document.getElementById(id), 'missing #' + id));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2.  DATA FILES

   These are the only things a session cannot generate for itself, so a
   malformed entry is the one content error that can end a session early.
   ═══════════════════════════════════════════════════════════════════════ */

group('data: corpus', () => {
  test('loads and is a non-empty array', async () => {
    const c = await getJSON('data/corpus.json');
    ok(Array.isArray(c), 'corpus is an array');
    ok(c.length > 0, 'corpus has passages');
  });

  test('every passage has the fields a session reads', async () => {
    const c = await getJSON('data/corpus.json');
    c.forEach((p, i) => {
      const at = 'passage ' + i + ' (' + (p && p.id) + '): ';
      nonEmptyStr(p.id, at + 'id');
      nonEmptyStr(p.author, at + 'author');
      nonEmptyStr(p.work, at + 'work');
      nonEmptyStr(String(p.year), at + 'year');
      nonEmptyStr(p.text, at + 'text');
      nonEmptyStr(p.source_url, at + 'source_url');
      ok(Array.isArray(p.questions) && p.questions.length >= 1, at + 'needs at least one question');
      p.questions.forEach((q, j) => nonEmptyStr(q, at + 'question ' + j));
    });
  });

  test('ids are unique', async () => {
    const c = await getJSON('data/corpus.json');
    const seen = new Set();
    c.forEach(p => {
      ok(!seen.has(p.id), 'duplicate passage id: ' + p.id);
      seen.add(p.id);
    });
  });

  test('source urls are absolute http(s)', async () => {
    const c = await getJSON('data/corpus.json');
    c.forEach(p => ok(/^https?:\/\/\S+$/.test(p.source_url), p.id + ' has a bad source_url: ' + p.source_url));
  });

  test('passage markup survives the sanitiser intact', async () => {
    const c = await getJSON('data/corpus.json');
    c.forEach(p => {
      const opens = (p.text.match(/<em>/g) || []).length;
      const closes = (p.text.match(/<\/em>/g) || []).length;
      eq(opens, closes, p.id + ' has unbalanced <em> tags');
      // Anything other than <em> would be stripped and read as literal text.
      const tags = (p.text.match(/<\/?[a-z][^>]*>/gi) || []).filter(t => !/^<\/?em>$/.test(t));
      deepEq(tags, [], p.id + ' contains tags the renderer will strip');
      const html = passageHTML(p.text);
      has(html, '<p>', p.id + ' renders at least one paragraph');
    });
  });
});

group('data: reasoning', () => {
  test('has a calibration bank and a fermi bank', async () => {
    const r = await getJSON('data/reasoning.json');
    ok(Array.isArray(r.calibration) && r.calibration.length > 0, 'calibration bank');
    ok(Array.isArray(r.fermi) && r.fermi.length > 0, 'fermi bank');
  });

  test('every calibration item is well formed', async () => {
    const r = await getJSON('data/reasoning.json');
    r.calibration.forEach((c, i) => {
      const at = 'calibration ' + i + ' (' + (c && c.id) + '): ';
      nonEmptyStr(c.id, at + 'id');
      nonEmptyStr(c.category, at + 'category');
      nonEmptyStr(c.statement, at + 'statement');
      nonEmptyStr(c.note, at + 'note');
      eq(typeof c.answer, 'boolean', at + 'answer must be true or false');
    });
  });

  test('calibration ids are unique', async () => {
    const r = await getJSON('data/reasoning.json');
    const seen = new Set();
    r.calibration.forEach(c => {
      ok(!seen.has(c.id), 'duplicate calibration id: ' + c.id);
      seen.add(c.id);
    });
  });

  test('calibration statements are unique', async () => {
    const r = await getJSON('data/reasoning.json');
    const seen = new Map();
    r.calibration.forEach(c => {
      const k = c.statement.trim().toLowerCase();
      ok(!seen.has(k), 'the same statement appears twice: ' + seen.get(k) + ' and ' + c.id);
      seen.set(k, c.id);
    });
  });

  test('the true/false split stays near even', async () => {
    const r = await getJSON('data/reasoning.json');
    const trues = r.calibration.filter(c => c.answer).length;
    const frac = trues / r.calibration.length;
    ok(frac >= 0.4 && frac <= 0.6,
      'a lopsided bank teaches answering "true" rather than judging: ' +
      trues + ' of ' + r.calibration.length + ' (' + (frac * 100).toFixed(1) + '% true)');
  });

  test('every fermi item is well formed', async () => {
    const r = await getJSON('data/reasoning.json');
    r.fermi.forEach((f, i) => {
      const at = 'fermi ' + i + ' (' + (f && f.id) + '): ';
      nonEmptyStr(f.id, at + 'id');
      nonEmptyStr(f.prompt, at + 'prompt');
      nonEmptyStr(f.unit, at + 'unit');
      isNum(f.low, at + 'low');
      isNum(f.high, at + 'high');
      ok(f.low > 0, at + 'low must be positive; the answer is a geometric mean');
      ok(f.high > f.low, at + 'high must exceed low');
      ok(Array.isArray(f.reference) && f.reference.length >= 1, at + 'needs reference steps');
      f.reference.forEach((s, j) => nonEmptyStr(s, at + 'reference step ' + j));
      nonEmptyStr(String(f.answer), at + 'answer');
    });
  });

  test('fermi ids are unique', async () => {
    const r = await getJSON('data/reasoning.json');
    const seen = new Set();
    r.fermi.forEach(f => {
      ok(!seen.has(f.id), 'duplicate fermi id: ' + f.id);
      seen.add(f.id);
    });
  });
});

group('data: propositions', () => {
  test('every proposition is well formed', async () => {
    const p = await getJSON('data/propositions.json');
    ok(Array.isArray(p) && p.length > 0, 'propositions is a non-empty array');
    p.forEach((x, i) => {
      const at = 'proposition ' + i + ' (' + (x && x.id) + '): ';
      nonEmptyStr(x.id, at + 'id');
      nonEmptyStr(x.domain, at + 'domain');
      nonEmptyStr(x.proposition, at + 'proposition');
      nonEmptyStr(x.cheap, at + 'cheap');
    });
  });

  test('ids are unique', async () => {
    const p = await getJSON('data/propositions.json');
    const seen = new Set();
    p.forEach(x => {
      ok(!seen.has(x.id), 'duplicate proposition id: ' + x.id);
      seen.add(x.id);
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3.  TEXT HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

group('text helpers', () => {
  test('mmss pads and floors', () => {
    eq(mmss(0), '00:00');
    eq(mmss(9), '00:09');
    eq(mmss(61), '01:01');
    eq(mmss(599), '09:59');
    eq(mmss(600), '10:00');
    eq(mmss(3599), '59:59');
    eq(mmss(3600), '60:00');
  });

  test('mmss never shows a negative clock', () => {
    eq(mmss(-1), '00:00');
    eq(mmss(-9999), '00:00');
  });

  test('mmss rounds rather than truncates', () => {
    eq(mmss(59.6), '01:00');
    eq(mmss(59.4), '00:59');
  });

  test('escapeHTML neutralises every dangerous character', () => {
    eq(escapeHTML('<b>'), '&lt;b&gt;');
    eq(escapeHTML('a & b'), 'a &amp; b');
    eq(escapeHTML('"q"'), '&quot;q&quot;');
    eq(escapeHTML("it's"), 'it&#39;s');
    eq(escapeHTML('<img src=x onerror=alert(1)>'),
       '&lt;img src=x onerror=alert(1)&gt;');
  });

  test('passageHTML keeps em and drops everything else', () => {
    const out = passageHTML('a <em>stressed</em> word');
    has(out, '<em>stressed</em>');
    const bad = passageHTML('safe <script>alert(1)</script>');
    lacks(bad, '<script>', 'script tags must not survive');
    has(bad, '&lt;script&gt;');
  });

  test('passageHTML splits on blank lines and joins single ones', () => {
    eq(passageHTML('one\n\ntwo'), '<p>one</p><p>two</p>');
    eq(passageHTML('one\ntwo'), '<p>one two</p>');
    eq(passageHTML('one\n\n\n\ntwo'), '<p>one</p><p>two</p>');
  });

  test('passageHTML wraps even a single line', () => {
    eq(passageHTML('alone'), '<p>alone</p>');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4.  NUMBER HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

group('number helpers', () => {
  test('clamp holds the bounds', () => {
    eq(clamp(5, 1, 8), 5);
    eq(clamp(0, 1, 8), 1);
    eq(clamp(99, 1, 8), 8);
    eq(clamp(1, 1, 8), 1);
    eq(clamp(8, 1, 8), 8);
  });

  test('randInt stays inside its range and reaches both ends', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(1, 4);
      ok(v >= 1 && v <= 4, 'randInt escaped its range: ' + v);
      eq(v, Math.floor(v), 'randInt returned a fraction: ' + v);
      seen.add(v);
    }
    eq(seen.size, 4, 'randInt(1,4) should be able to return all four values');
  });

  test('pick never returns undefined for a non-empty array', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 500; i++) ok(arr.indexOf(pick(arr)) !== -1);
  });

  test('parseMagnitude reads the forms a person types', () => {
    eq(parseMagnitude('800000'), 800000);
    eq(parseMagnitude('800,000'), 800000);
    eq(parseMagnitude(' 800000 '), 800000);
    eq(parseMagnitude('8e5'), 800000);
    eq(parseMagnitude('8x10^5'), 800000);
    eq(parseMagnitude('8 x 10^5'), 800000);
    eq(parseMagnitude('8*10^5'), 800000);
    eq(parseMagnitude('8x105'), 800000, 'the caret is optional');
    eq(parseMagnitude('1.5e-3'), 0.0015);
    eq(parseMagnitude('-42'), -42);
    eq(parseMagnitude('3.5'), 3.5);
  });

  test('parseMagnitude rejects what is not a number', () => {
    ok(isNaN(parseMagnitude('')), 'empty');
    ok(isNaN(parseMagnitude('   ')), 'whitespace');
    ok(isNaN(parseMagnitude('lots')), 'words');
    ok(isNaN(parseMagnitude('?')), 'punctuation');
  });

  test('fmt groups thousands and rounds to two places', () => {
    eq(fmt(1000), '1,000');
    eq(fmt(1234567), '1,234,567');
    eq(fmt(999), '999');
    eq(fmt(1234.5678), '1,234.57');
  });

  test('pctStr shows one decimal place at most', () => {
    eq(pctStr(12.34), '12.3%');
    eq(pctStr(50), '50%');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5.  ANSWER MATCHING

   Wrongly marking a correct answer wrong is the worst bug this app can
   have: it feeds the level adapter and the calibration curve both.
   ═══════════════════════════════════════════════════════════════════════ */

group('math answer matching', () => {
  test('accepts the plain right answer', () => {
    ok(mathMatches('42', '42'));
    ok(mathMatches(' 42 ', '42'));
    ok(mathMatches('42', 42));
  });

  test('is tolerant about formatting', () => {
    ok(mathMatches('1,024', '1024'), 'thousands separators');
    ok(mathMatches('25%', '25'), 'a trailing percent sign');
    ok(mathMatches('1 024', '1024'), 'a space as a separator');
    ok(mathMatches('0.125', '0.125'));
    ok(mathMatches('.125', '0.125'), 'a leading dot');
  });

  test('is strict about value', () => {
    notOk(mathMatches('41', '42'));
    notOk(mathMatches('', '42'), 'blank is never right');
    notOk(mathMatches('   ', '42'));
    notOk(mathMatches('forty two', '42'));
    notOk(mathMatches('0.124', '0.125'));
  });

  test('handles the remainder form every way it is written', () => {
    ok(mathMatches('7 r 3', '7 r 3'));
    ok(mathMatches('7r3', '7 r 3'));
    ok(mathMatches('7 R 3', '7 r 3'));
    ok(mathMatches('7 remainder 3', '7 r 3'));
    ok(mathMatches('7 rem 3', '7 r 3'));
  });

  test('rejects a wrong remainder', () => {
    notOk(mathMatches('7 r 4', '7 r 3'), 'wrong remainder');
    notOk(mathMatches('8 r 3', '7 r 3'), 'wrong quotient');
    notOk(mathMatches('7', '7 r 3'), 'the remainder is part of the answer');
  });

  test('does not accept a remainder for a plain answer', () => {
    notOk(mathMatches('7 r 3', '7'), 'a remainder answer to a plain question is wrong');
  });

  test('tolerates floating point dust', () => {
    ok(mathMatches('0.30000000000000004', '0.3'));
    notOk(mathMatches('0.31', '0.3'));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   6.  ROTATION AND SESSION LENGTH
   ═══════════════════════════════════════════════════════════════════════ */

group('rotation and length', () => {
  test('the rotation names seven distinct days', () => {
    eq(TYPES.length, 7);
    eq(new Set(TYPES).size, 7, 'no day appears twice');
  });

  test('every day type has a blurb', () => {
    TYPES.forEach(t => nonEmptyStr(BLURB[t], 'no blurb for ' + t));
    deepEq(Object.keys(BLURB).sort(), TYPES.slice().sort(), 'BLURB and TYPES have drifted apart');
  });

  test('every day type is either a stage or a drill', () => {
    const stages = ['argument', 'math', 'steelman'];
    TYPES.forEach(t => {
      const handled = stages.indexOf(t) !== -1 || Object.prototype.hasOwnProperty.call(DRILL_SOURCE, t);
      ok(handled, t + ' day would start with nothing to do');
    });
  });

  test('todayType walks the rotation and wraps', () => {
    reset();
    for (let i = 0; i < 21; i++) {
      state.cycleIndex = i;
      eq(todayType(), TYPES[i % 7], 'cycle ' + i);
    }
  });

  test('the rotation survives a very large cycle count', () => {
    reset();
    state.cycleIndex = 700000;
    eq(todayType(), TYPES[700000 % 7]);
  });

  test('sessions start at the base length', () => {
    reset();
    eq(sessionLength(), BASE_LENGTH);
  });

  test('length ramps one step every six completed sessions', () => {
    reset();
    state.completedSessions = 5;
    eq(sessionLength(), BASE_LENGTH, 'no ramp before the sixth');
    state.completedSessions = 6;
    eq(sessionLength(), BASE_LENGTH + RAMP_STEP);
    state.completedSessions = 11;
    eq(sessionLength(), BASE_LENGTH + RAMP_STEP);
    state.completedSessions = 12;
    eq(sessionLength(), BASE_LENGTH + 2 * RAMP_STEP);
  });

  test('length stops at the ceiling', () => {
    reset();
    state.completedSessions = 100000;
    eq(sessionLength(), MAX_LENGTH);
    // and the ceiling is reachable, not theoretical
    state.completedSessions = RAMP_EVERY * ((MAX_LENGTH - BASE_LENGTH) / RAMP_STEP);
    eq(sessionLength(), MAX_LENGTH);
  });

  test('hasKey only counts a key with something in it', () => {
    reset();
    notOk(hasKey(), 'blank');
    state.settings.apiKey = '   ';
    notOk(hasKey(), 'whitespace is not a key');
    state.settings.apiKey = 'sk-ant-xxx';
    ok(hasKey());
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   7.  STATE AND MIGRATION

   migrate() is what stands between an imported or half-written file and a
   crash on the next session.
   ═══════════════════════════════════════════════════════════════════════ */

group('state migration', () => {
  test('a blank state has every branch the app reads', () => {
    const s = blankState();
    ['argument', 'math', 'logic', 'causal', 'numbers', 'steelman', 'reasoning', 'settings']
      .forEach(k => ok(s[k] && typeof s[k] === 'object', 'missing branch: ' + k));
    ok(Array.isArray(s.sessions));
    ok(Array.isArray(s.positions));
    eq(s.settings.model, DEFAULT_MODEL);
  });

  test('an empty object migrates to a usable state', () => {
    const s = migrate({});
    deepEq(Object.keys(s).sort(), Object.keys(blankState()).sort());
    eq(s.math.level, blankState().math.level);
    eq(s.logic.level, blankState().logic.level);
    eq(s.settings.model, DEFAULT_MODEL);
  });

  test('missing arrays are rebuilt', () => {
    const s = migrate({ sessions: null, positions: 'nope', argument: {}, math: {}, logic: {} });
    ok(Array.isArray(s.sessions));
    ok(Array.isArray(s.positions));
    ok(Array.isArray(s.argument.seen));
    ok(Array.isArray(s.math.history));
    ok(Array.isArray(s.logic.history));
    ok(Array.isArray(s.reasoning.calibration));
  });

  test('real data is carried through untouched', () => {
    const s = migrate({
      completedSessions: 9,
      cycleIndex: 4,
      sessions: [{ ts: 1, type: 'math', completed: true }],
      positions: [{ id: 'p1', title: 't', revisions: [] }],
      math: { level: 7, history: [{ ts: 1, level: 7, correct: true, ms: 900 }] }
    });
    eq(s.completedSessions, 9);
    eq(s.cycleIndex, 4);
    eq(s.sessions.length, 1);
    eq(s.positions.length, 1);
    eq(s.math.level, 7);
    eq(s.math.history.length, 1);
  });

  test('a branch missing a scalar gets the default back', () => {
    // An older export, or a hand-edited file, can carry the arrays but not
    // the numbers beside them. Losing math.level means MATH_LEVELS[undefined]
    // on the next arithmetic day.
    const s = migrate({ math: { history: [] }, logic: { history: [] }, argument: { seen: [] }, settings: { apiKey: 'k' } });
    eq(s.math.level, blankState().math.level, 'math.level fell through');
    eq(s.logic.level, blankState().logic.level, 'logic.level fell through');
    eq(s.argument.days, 0, 'argument.days fell through');
    eq(s.settings.model, DEFAULT_MODEL, 'settings.model fell through');
  });

  test('a file saved before levels were stamped still adapts', () => {
    const s = migrate({ math: { level: 5, history: [{ ts: 1, level: 5, correct: true, ms: 900 }] } });
    eq(s.math.levelSince, 0, 'no stamp means nothing is discounted, which is the old behaviour');
    eq(s.math.level, 5, 'and the level itself is kept');
  });

  test('legacy fermi progress moves to numbers day', () => {
    const s = migrate({ reasoning: { fermiSeen: ['f-tuners', 'f-hairs'] } });
    deepEq(s.numbers.fermiSeen, ['f-tuners', 'f-hairs']);
  });

  test('legacy fermi progress does not overwrite current progress', () => {
    const s = migrate({
      reasoning: { fermiSeen: ['old'] },
      numbers: { fermiSeen: ['current'] }
    });
    deepEq(s.numbers.fermiSeen, ['current']);
  });

  test('calibration entries written before sources are tagged trivia', () => {
    const s = migrate({ reasoning: { calibration: [{ ts: 1, conf: 70, correct: true }] } });
    eq(s.reasoning.calibration[0].source, 'trivia');
  });

  test('an existing source is left alone', () => {
    const s = migrate({ reasoning: { calibration: [{ ts: 1, conf: 70, correct: true, source: 'logic' }] } });
    eq(s.reasoning.calibration[0].source, 'logic');
  });

  test('a saved state round-trips through storage', () => {
    reset();
    state.completedSessions = 3;
    state.cycleIndex = 5;
    state.math.level = 6;
    state.reasoning.calibration.push({ ts: 1, conf: 80, correct: false, brier: 0.64, source: 'trivia' });
    writeNow();
    state = blankState();
    load();
    eq(state.completedSessions, 3);
    eq(state.cycleIndex, 5);
    eq(state.math.level, 6);
    eq(state.reasoning.calibration.length, 1);
  });

  test('unreadable saved data does not stop the app', () => {
    reset();
    localStorage.setItem(STORE_KEY, '{not json');
    load();
    eq(state.completedSessions, 0, 'falls back to a blank state instead of throwing');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   8.  A SESSION SURVIVING A RELOAD

   This is the Phase 7 work. It is the feature most likely to break
   silently, because the failure only shows up after a refresh.
   ═══════════════════════════════════════════════════════════════════════ */

group('live session resume', () => {

  function startFakeSession(type, opts) {
    const o = opts || {};
    session.running = true;
    session.type = type;
    session.planned = o.planned || 600;
    session.startedAt = o.startedAt || (Date.now() - 30000);
    session.timeUp = !!o.timeUp;
    session.transcript = o.transcript || [];
    session.scratch = o.scratch || {};
    session.drafts = o.drafts || {};
  }

  test('nothing saved means nothing to resume', () => {
    reset();
    notOk(restoreLive(), 'restoreLive should decline');
  });

  test('a session in progress is written to its own key', () => {
    reset();
    startFakeSession('math');
    writeLive();
    const raw = localStorage.getItem(LIVE_KEY);
    ok(raw, 'the live key was written');
    const live = JSON.parse(raw);
    eq(live.type, 'math');
    eq(live.planned, 600);
    isNum(live.startedAt);
  });

  test('nothing is written when no session is running', () => {
    reset();
    session.running = false;
    session.type = 'math';
    writeLive();
    eq(localStorage.getItem(LIVE_KEY), null);
  });

  test('a math session comes back whole', () => {
    reset();
    const started = Date.now() - 120000;
    startFakeSession('math', {
      planned: 900,
      startedAt: started,
      scratch: { attempted: 4, correct: 3 }
    });
    writeLive();

    reload();   // the reload
    ok(restoreLive(), 'restoreLive should take it');
    eq(session.running, true);
    eq(session.type, 'math');
    eq(session.planned, 900);
    eq(session.startedAt, started, 'the clock keeps its original start');
    eq(session.scratch.attempted, 4);
    eq(session.scratch.correct, 3);
    timer.stop();
  });

  test('the timer resumes from the original start, not from zero', () => {
    reset();
    startFakeSession('math', { planned: 600, startedAt: Date.now() - 200000 });
    writeLive();
    reload();
    restoreLive();
    const left = timer.remaining();
    near(left, 400, 5, 'about 400 seconds should be left of a 600 second session');
    eq(timer.total, 600, 'the arc must still show the whole session');
    timer.stop();
  });

  test('half-typed text is kept', () => {
    reset();
    startFakeSession('argument', {
      scratch: { phase: 'work', current: { kind: 'bundled', text: 'q', n: 1 } },
      drafts: { 'arg-answer': 'I was midway through a senten' }
    });
    writeLive();
    reload();
    restoreLive();
    eq(draftFor('arg-answer'), 'I was midway through a senten');
    eq(document.getElementById('arg-answer').value, 'I was midway through a senten',
      'the box itself is refilled, not just the record of it');
    timer.stop();
  });

  test('typing in a box is captured as it is typed', () => {
    reset();
    watchDrafts();
    startFakeSession('argument');
    const box = document.getElementById('arg-answer');
    box.value = 'half a thought';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    eq(draftFor('arg-answer'), 'half a thought', 'nothing is waiting for a submit');
    writeLive();
    deepEq(JSON.parse(localStorage.getItem(LIVE_KEY)).drafts['arg-answer'], 'half a thought');
  });

  test('the transcript is kept', () => {
    reset();
    startFakeSession('argument', {
      transcript: [
        { kind: 'bundled', question: 'q1', answer: 'a1', ts: 1 },
        { kind: 'live', question: 'q2', answer: 'a2', ts: 2 }
      ],
      scratch: { phase: 'read' }
    });
    writeLive();
    reload();
    restoreLive();
    eq(session.transcript.length, 2);
    eq(session.transcript[1].answer, 'a2');
    timer.stop();
  });

  test('the reading phase comes back as reading', () => {
    reset();
    startFakeSession('argument', { scratch: { phase: 'read', passage: null } });
    writeLive();
    reload();
    restoreLive();
    eq(document.getElementById('arg-read').hidden, false, 'still on the passage');
    eq(document.getElementById('arg-work').hidden, true);
    timer.stop();
  });

  test('the writing phase comes back as writing', () => {
    reset();
    startFakeSession('argument', {
      scratch: { phase: 'work', current: { kind: 'bundled', text: 'the question', n: 1 } }
    });
    writeLive();
    reload();
    restoreLive();
    eq(document.getElementById('arg-work').hidden, false, 'back in the box');
    eq(document.getElementById('arg-read').hidden, true);
    eq(document.getElementById('arg-question').textContent, 'the question');
    timer.stop();
  });

  test('a session whose time was already up stays up', () => {
    reset();
    startFakeSession('math', { timeUp: true, startedAt: Date.now() - 700000, planned: 600 });
    writeLive();
    reload();
    restoreLive();
    eq(session.timeUp, true);
    eq(document.getElementById('time-up-note').hidden, false);
    eq(document.getElementById('btn-close').textContent, 'Close session');
    timer.stop();
  });

  test('the right stage is shown and the others are hidden', async () => {
    const cases = {
      argument: 'stage-argument',
      math: 'stage-math',
      steelman: 'stage-steelman',
      logic: 'stage-drill',
      causal: 'stage-drill',
      numbers: 'stage-drill',
      calibration: 'stage-drill'
    };
    const all = ['stage-argument', 'stage-math', 'stage-steelman', 'stage-drill'];
    for (const type of Object.keys(cases)) {
      reset();
      startFakeSession(type, { scratch: { phase: 'read', mode: type, items: 0, correct: 0 } });
      writeLive();
      reload();
      restoreLive();
      all.forEach(id => {
        const shouldShow = id === cases[type];
        eq(document.getElementById(id).hidden, !shouldShow, type + ' day: #' + id);
      });
      await session.resuming;
      timer.stop();
    }
  });

  test('a drill day resumes even if the saved record lost its mode', async () => {
    reset();
    startFakeSession('logic', { scratch: { phase: 'read' } });
    writeLive();
    reload();
    ok(restoreLive(), 'a missing mode must not cost the session');
    await session.resuming;
    eq(session.scratch.mode, 'logic', 'the day type stands in for it');
    nonEmptyStr(document.getElementById('drill-prompt').textContent, 'a question was put up');
  });

  test('a calibration day resumed before its bank has loaded still asks something', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = null;                       // exactly the state after a reload
    try {
      startFakeSession('calibration', { scratch: { phase: 'read', mode: 'calibration', items: 0, correct: 0 } });
      writeLive();
      reload();
      ok(restoreLive());
      await session.resuming;
      const prompt = document.getElementById('drill-prompt').textContent;
      nonEmptyStr(prompt, 'the day opened on nothing');
      notOk(/nothing available/i.test(prompt),
        'the bank has to be fetched on the way in, as startDrill does');
      eq(document.getElementById('drill-options').hidden, false, 'True and False are offered');
    } finally {
      reasoningData = saved;
    }
  });

  test('a stale session is dropped rather than resumed', () => {
    reset();
    startFakeSession('math', { startedAt: Date.now() - LIVE_MAX_AGE - 60000 });
    writeLive();
    reload();
    notOk(restoreLive(), 'anything older than the cutoff is not resumable');
    eq(localStorage.getItem(LIVE_KEY), null, 'and it is cleared out');
  });

  test('a session just inside the cutoff still resumes', () => {
    reset();
    startFakeSession('math', { startedAt: Date.now() - LIVE_MAX_AGE + 60000 });
    writeLive();
    reload();
    ok(restoreLive());
    timer.stop();
  });

  test('corrupt live data falls back to a normal start', () => {
    reset();
    localStorage.setItem(LIVE_KEY, '{{{ not json');
    notOk(restoreLive(), 'must not throw on the way into the app');
  });

  test('a live record missing its type is ignored', () => {
    reset();
    localStorage.setItem(LIVE_KEY, JSON.stringify({ v: 1, startedAt: Date.now(), planned: 600 }));
    notOk(restoreLive());
  });

  test('a live record missing its start time is ignored', () => {
    reset();
    localStorage.setItem(LIVE_KEY, JSON.stringify({ v: 1, type: 'math', planned: 600 }));
    notOk(restoreLive());
  });

  test('clearLive removes it', () => {
    reset();
    startFakeSession('math');
    writeLive();
    ok(localStorage.getItem(LIVE_KEY));
    clearLive();
    eq(localStorage.getItem(LIVE_KEY), null);
  });

  test('closing a session clears the live record and banks it', () => {
    reset();
    startFakeSession('math', { scratch: { attempted: 5, correct: 4 } });
    writeLive();
    endSession();
    eq(localStorage.getItem(LIVE_KEY), null, 'nothing left to resume');
    eq(state.sessions.length, 1);
    eq(state.sessions[0].completed, true);
    eq(state.sessions[0].attempted, 5);
    eq(state.sessions[0].correct, 4);
    eq(state.completedSessions, 1);
    eq(state.cycleIndex, 1, 'the rotation moves on');
  });

  test('abandoning a session does not advance the rotation', () => {
    reset();
    startFakeSession('math');
    writeLive();
    abandonSession();
    eq(state.completedSessions, 0, 'an abandoned session is not a completed one');
    eq(state.cycleIndex, 0, 'the same day comes round again');
    eq(localStorage.getItem(LIVE_KEY), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   9.  GENERATORS

   Everything generated has to hold its shape across many samples, because
   a template that breaks one time in fifty breaks in the middle of a
   session and there is no way to get the question back.
   ═══════════════════════════════════════════════════════════════════════ */

const SAMPLES = 200;

/* Re-derive the answer from the question wherever the question is written
   plainly enough to parse. This is what catches a generator whose printed
   sum and stated answer have drifted apart. */
function checkArithmetic(item) {
  const q = item.q;
  let m;
  if ((m = q.match(/^(\d+) \+ (\d+)$/)))       eq(Number(item.a), Number(m[1]) + Number(m[2]), 'addition: ' + q);
  else if ((m = q.match(/^(\d+) − (\d+)$/)))   eq(Number(item.a), Number(m[1]) - Number(m[2]), 'subtraction: ' + q);
  else if ((m = q.match(/^(\d+) × (\d+)$/)))   eq(Number(item.a), Number(m[1]) * Number(m[2]), 'product: ' + q);
  else if ((m = q.match(/^(\d+)% of (\d+)$/))) eq(Number(item.a), Number(m[2]) * Number(m[1]) / 100, 'percentage: ' + q);
  else if ((m = q.match(/^(\d+)²$/)))          eq(Number(item.a), Number(m[1]) * Number(m[1]), 'square: ' + q);
  else if ((m = q.match(/^(\d+) × (\d+) \+ (\d+)$/)))
    eq(Number(item.a), Number(m[1]) * Number(m[2]) + Number(m[3]), 'compound: ' + q);
  else if ((m = q.match(/^(\d+) ÷ (\d+)/))) {
    const parts = String(item.a).match(/^(\d+) r (\d+)$/);
    ok(parts, 'division should answer in remainder form: ' + q + ' -> ' + item.a);
    eq(Number(m[1]), Number(m[2]) * Number(parts[1]) + Number(parts[2]), 'division: ' + q);
    ok(Number(parts[2]) < Number(m[2]), 'the remainder must be smaller than the divisor: ' + item.a);
  }
}

group('generators: arithmetic', () => {
  test('every level produces a question and an answer', () => {
    reset();
    Object.keys(MATH_LEVELS).forEach(level => {
      for (let i = 0; i < SAMPLES; i++) {
        const item = MATH_LEVELS[level]();
        nonEmptyStr(item.q, 'level ' + level + ' question');
        nonEmptyStr(item.a, 'level ' + level + ' answer');
      }
    });
  });

  test('every answer is accepted by the matcher that will grade it', () => {
    reset();
    Object.keys(MATH_LEVELS).forEach(level => {
      for (let i = 0; i < SAMPLES; i++) {
        const item = MATH_LEVELS[level]();
        ok(mathMatches(item.a, item.a),
          'level ' + level + ' would mark its own answer wrong: ' + item.q + ' -> ' + item.a);
      }
    });
  });

  test('the stated answer actually solves the stated question', () => {
    reset();
    Object.keys(MATH_LEVELS).forEach(level => {
      for (let i = 0; i < SAMPLES; i++) checkArithmetic(MATH_LEVELS[level]());
    });
  });

  test('no answer is written in exponential notation', () => {
    reset();
    Object.keys(MATH_LEVELS).forEach(level => {
      for (let i = 0; i < SAMPLES; i++) {
        const item = MATH_LEVELS[level]();
        lacks(item.a.toLowerCase(), 'e+', 'level ' + level + ' printed an unreadable answer: ' + item.a);
      }
    });
  });

  test('there is a target time for every level', () => {
    Object.keys(MATH_LEVELS).forEach(level => {
      isNum(LEVEL_TARGET_MS[level], 'no target time for math level ' + level);
      ok(LEVEL_TARGET_MS[level] > 0, 'level ' + level + ' has a zero target');
    });
  });
});

/* Every drill day hands the same shape to the same controller, so one
   checker covers logic, causal and numbers. */
function checkDrillItem(item, where) {
  ok(item && typeof item === 'object', where + ' returned nothing');
  nonEmptyStr(item.prompt, where + ' prompt');
  nonEmptyStr(item.label, where + ' label');
  ok(item.kind === 'choice' || item.kind === 'number', where + ' has an unknown kind: ' + item.kind);

  if (item.kind === 'choice') {
    ok(Array.isArray(item.options) && item.options.length >= 2, where + ' needs at least two options');
    item.options.forEach((o, i) => nonEmptyStr(o, where + ' option ' + i));
    eq(new Set(item.options).size, item.options.length, where + ' repeats an option: ' + JSON.stringify(item.options));
    eq(typeof item.answer, 'number', where + ' answer must be an index');
    ok(item.answer >= 0 && item.answer < item.options.length, where + ' answer index is out of range');
  } else {
    if (item.band) {
      isNum(item.band.low, where + ' band low');
      isNum(item.band.high, where + ' band high');
      ok(item.band.high > item.band.low, where + ' band is inverted');
      isNum(item.answer, where + ' band items still need a central answer');
      ok(item.answer >= item.band.low && item.answer <= item.band.high,
        where + ' central answer sits outside its own band');
    } else {
      isNum(item.answer, where + ' numeric answer');
      isNum(item.tolerance, where + ' numeric items need a tolerance');
      ok(item.tolerance >= 0, where + ' negative tolerance');
    }
  }

  const explainOk = Array.isArray(item.explain)
    ? item.explain.length > 0 && item.explain.every(s => typeof s === 'string' && s.trim())
    : typeof item.explain === 'string' && item.explain.trim().length > 0;
  ok(explainOk, where + ' has no usable explanation');

  if (item.followup) {
    nonEmptyStr(item.followup.prompt, where + ' followup prompt');
    nonEmptyStr(item.followup.reference, where + ' followup reference');
  }

  // Whatever it is, the grader must agree the right answer is right.
  const right = item.kind === 'choice' ? item.answer
              : item.band ? Math.sqrt(item.band.low * item.band.high)
              : item.answer;
  ok(drillIsCorrect(item, right), where + ' would mark its own answer wrong');
}

group('generators: logic', () => {
  test('every level holds its shape', () => {
    reset();
    for (let level = 1; level <= 6; level++) {
      state.logic.level = level;
      for (let i = 0; i < SAMPLES; i++) checkDrillItem(logicItem(), 'logic level ' + level);
    }
  });

  test('the level is recorded on the item so the adapter can read it', () => {
    reset();
    for (let level = 1; level <= 6; level++) {
      state.logic.level = level;
      for (let i = 0; i < 20; i++) {
        const item = logicItem();
        eq(item.level, level, 'logic item did not carry its level');
        has(item.label, 'level ' + level);
      }
    }
  });

  test('an out-of-range stored level is clamped rather than crashing', () => {
    reset();
    state.logic.level = 99;
    checkDrillItem(logicItem(), 'logic level 99');
    state.logic.level = 0;
    checkDrillItem(logicItem(), 'logic level 0');
  });

  test('there is a target time for every level', () => {
    for (let level = 1; level <= 6; level++) {
      isNum(LOGIC_TARGET_MS[level], 'no target time for logic level ' + level);
      ok(LOGIC_TARGET_MS[level] > 0, 'logic level ' + level + ' has a zero target');
    }
  });
});

group('generators: causal', () => {
  test('every template holds its shape', () => {
    reset();
    CAUSAL_TEMPLATES.forEach((tpl, i) => {
      for (let n = 0; n < SAMPLES; n++) checkDrillItem(tpl(), 'causal template ' + i + ' (' + tpl.name + ')');
    });
  });

  test('causalItem only ever returns a real template', () => {
    reset();
    for (let i = 0; i < SAMPLES; i++) checkDrillItem(causalItem(), 'causalItem');
  });
});

group('generators: numbers', () => {
  test('every statistics template holds its shape', () => {
    reset();
    STAT_TEMPLATES.forEach((tpl, i) => {
      for (let n = 0; n < SAMPLES; n++) checkDrillItem(tpl(), 'stat template ' + i + ' (' + tpl.name + ')');
    });
  });

  test('every base-rate template gives a percentage and its working', () => {
    reset();
    BASE_RATE_TEMPLATES.forEach((tpl, i) => {
      for (let n = 0; n < SAMPLES; n++) {
        const b = tpl();
        const where = 'base rate template ' + i + ' (' + tpl.name + ')';
        nonEmptyStr(b.prompt, where + ' prompt');
        isNum(b.answer, where + ' answer');
        ok(b.answer >= 0 && b.answer <= 100, where + ' answer is not a percentage: ' + b.answer);
        ok(Array.isArray(b.steps) && b.steps.length > 0, where + ' has no working');
        b.steps.forEach((s, j) => nonEmptyStr(s, where + ' step ' + j));
      }
    });
  });

  test('numbersItem holds its shape across all three pools', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = await getJSON('data/reasoning.json');
    try {
      for (let i = 0; i < 400; i++) checkDrillItem(numbersItem(), 'numbersItem');
    } finally {
      reasoningData = saved;
    }
  });

  test('numbers day still works before the reasoning file arrives', () => {
    reset();
    const saved = reasoningData;
    reasoningData = null;
    try {
      for (let i = 0; i < SAMPLES; i++) checkDrillItem(numbersItem(), 'numbersItem with no data');
    } finally {
      reasoningData = saved;
    }
  });

  test('a fermi item is answered against its band, not a point value', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = await getJSON('data/reasoning.json');
    try {
      let found = null;
      for (let i = 0; i < 500 && !found; i++) {
        const item = numbersItem();
        if (item.band) found = item;
      }
      ok(found, 'no fermi item appeared in 500 draws');
      eq(found.confidence, false, 'estimation is not scored for confidence');
      ok(drillIsCorrect(found, found.band.low), 'the bottom of the band counts');
      ok(drillIsCorrect(found, found.band.high), 'the top of the band counts');
      notOk(drillIsCorrect(found, found.band.low / 10), 'an order of magnitude out is wrong');
      notOk(drillIsCorrect(found, found.band.high * 10), 'an order of magnitude out is wrong');
    } finally {
      reasoningData = saved;
    }
  });

  test('fermi prompts are not repeated until the bank is used up', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = await getJSON('data/reasoning.json');
    try {
      const bank = reasoningData.fermi.length;
      const seen = [];
      // Draw only fermi items by exhausting the pool through the tracker.
      for (let i = 0; i < bank; i++) {
        const pool = reasoningData.fermi.filter(f => !state.numbers.fermiSeen.includes(f.id));
        ok(pool.length > 0, 'the pool emptied early at draw ' + i);
        seen.push(pool[0].id);
        state.numbers.fermiSeen.push(pool[0].id);
      }
      eq(new Set(seen).size, bank, 'every fermi prompt should appear once before any repeats');
    } finally {
      reasoningData = saved;
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   10.  SCORING
   ═══════════════════════════════════════════════════════════════════════ */

group('scoring', () => {
  test('a multiple choice answer is right only on the right index', () => {
    const item = { kind: 'choice', options: ['a', 'b', 'c'], answer: 1 };
    notOk(drillIsCorrect(item, 0));
    ok(drillIsCorrect(item, 1));
    notOk(drillIsCorrect(item, 2));
  });

  test('a numeric answer is right inside its tolerance', () => {
    const item = { kind: 'number', answer: 12.5, tolerance: 0.5 };
    ok(drillIsCorrect(item, 12.5));
    ok(drillIsCorrect(item, 12.0), 'the bottom of the tolerance counts');
    ok(drillIsCorrect(item, 13.0), 'the top of the tolerance counts');
    notOk(drillIsCorrect(item, 11.9));
    notOk(drillIsCorrect(item, 13.1));
  });

  test('an estimate is right anywhere inside its band', () => {
    const item = { kind: 'number', band: { low: 30, high: 600 } };
    ok(drillIsCorrect(item, 30));
    ok(drillIsCorrect(item, 100));
    ok(drillIsCorrect(item, 600));
    notOk(drillIsCorrect(item, 29));
    notOk(drillIsCorrect(item, 601));
  });

  function runDrill(item, mode, picked, confidence) {
    reset();
    session.running = true;
    session.type = mode;
    session.scratch = { item: item, mode: mode, picked: picked, shownAt: Date.now() - 5000, items: 0, correct: 0 };
    resolveDrill(confidence);
  }

  test('a confident right answer scores a small Brier', () => {
    runDrill({ kind: 'choice', options: ['True', 'False'], answer: 0, explain: 'x', id: 'c-1' }, 'calibration', 0, 90);
    const log = state.reasoning.calibration[0];
    ok(log, 'the answer was logged');
    eq(log.correct, true);
    eq(log.conf, 90);
    near(log.brier, 0.01, 1e-9, '(0.9 - 1)^2');
    eq(log.source, 'trivia', 'the trivia bank is the trivia source');
    eq(log.id, 'c-1');
  });

  test('a confident wrong answer scores a large Brier', () => {
    runDrill({ kind: 'choice', options: ['True', 'False'], answer: 1, explain: 'x', id: 'c-2' }, 'calibration', 0, 90);
    const log = state.reasoning.calibration[0];
    eq(log.correct, false);
    near(log.brier, 0.81, 1e-9, '(0.9 - 0)^2');
  });

  test('an even guess scores the same either way', () => {
    runDrill({ kind: 'choice', options: ['True', 'False'], answer: 0, explain: 'x', id: 'a' }, 'calibration', 0, 50);
    const right = state.reasoning.calibration[0].brier;
    runDrill({ kind: 'choice', options: ['True', 'False'], answer: 1, explain: 'x', id: 'b' }, 'calibration', 0, 50);
    const wrong = state.reasoning.calibration[0].brier;
    near(right, 0.25, 1e-9);
    near(wrong, 0.25, 1e-9);
  });

  test('confidence from a logic drill is tagged as logic', () => {
    runDrill({ kind: 'choice', options: ['Valid', 'Invalid'], answer: 0, explain: 'x', level: 2 }, 'logic', 0, 70);
    eq(state.reasoning.calibration[0].source, 'logic');
    eq(state.logic.history.length, 1, 'and it also lands in the logic history');
    eq(state.logic.history[0].level, 2);
  });

  test('an estimate with no confidence question logs no calibration', () => {
    runDrill({ kind: 'number', band: { low: 10, high: 100 }, explain: ['x'], confidence: false }, 'numbers', 50, null);
    eq(state.reasoning.calibration.length, 0, 'nothing to score without a stated confidence');
    eq(state.numbers.history.length, 1, 'but the attempt is still counted');
    eq(state.numbers.history[0].correct, true);
  });

  test('the running tally moves with the answer', () => {
    runDrill({ kind: 'choice', options: ['a', 'b'], answer: 0, explain: 'x' }, 'causal', 0, 80);
    eq(session.scratch.items, 1);
    eq(session.scratch.correct, 1);
    runDrill({ kind: 'choice', options: ['a', 'b'], answer: 0, explain: 'x' }, 'causal', 1, 80);
    eq(session.scratch.items, 1);
    eq(session.scratch.correct, 0, 'a wrong answer counts as attempted, not correct');
  });

  test('every offered confidence level is above an even guess', () => {
    CONF_LEVELS.forEach(c => ok(c >= 50 && c <= 99, 'odd confidence level offered: ' + c));
    eq(CONF_LEVELS[0], 50, 'the lowest option is the coin flip');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   11.  WHAT COMES NEXT

   Passage, proposition and calibration choice all follow the same rule:
   nothing repeats until the pool is used up.
   ═══════════════════════════════════════════════════════════════════════ */

group('choosing what comes next', () => {
  test('a passage is never repeated until the corpus is used up', async () => {
    reset();
    const saved = corpus;
    corpus = await getJSON('data/corpus.json');
    try {
      const seen = [];
      for (let i = 0; i < corpus.length; i++) {
        const p = nextPassage();
        seen.push(p.id);
        state.argument.seen.push(p.id);
      }
      eq(new Set(seen).size, corpus.length, 'the corpus should be exhausted before anything repeats');
    } finally {
      corpus = saved;
    }
  });

  test('the corpus starts over once it is used up', async () => {
    reset();
    const saved = corpus;
    corpus = await getJSON('data/corpus.json');
    try {
      state.argument.seen = corpus.map(p => p.id);
      const p = nextPassage();
      ok(p && p.id, 'a passage is still handed back');
      eq(state.argument.seen.length, 0, 'the seen list is cleared for the new round');
    } finally {
      corpus = saved;
    }
  });

  test('a proposition is never repeated until the set is used up', async () => {
    reset();
    const saved = propositions;
    propositions = await getJSON('data/propositions.json');
    try {
      const seen = [];
      for (let i = 0; i < propositions.length; i++) {
        const p = nextProposition();
        seen.push(p.id);
        state.steelman.seen.push(p.id);
      }
      eq(new Set(seen).size, propositions.length);
    } finally {
      propositions = saved;
    }
  });

  test('calibration prefers something never seen', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = { calibration: [
      { id: 'a', category: 'x', statement: 'A', answer: true,  note: 'n' },
      { id: 'b', category: 'x', statement: 'B', answer: false, note: 'n' },
      { id: 'c', category: 'x', statement: 'C', answer: true,  note: 'n' }
    ] };
    try {
      state.reasoning.calibration = [
        { id: 'a', ts: 1000 },
        { id: 'b', ts: 2000 }
      ];
      for (let i = 0; i < 50; i++) eq(calibrationItem().id, 'c', 'only c has never been asked');
    } finally {
      reasoningData = saved;
    }
  });

  test('once everything is seen it goes back to the oldest', async () => {
    reset();
    const saved = reasoningData;
    reasoningData = { calibration: [
      { id: 'a', category: 'x', statement: 'A', answer: true,  note: 'n' },
      { id: 'b', category: 'x', statement: 'B', answer: false, note: 'n' },
      { id: 'c', category: 'x', statement: 'C', answer: true,  note: 'n' }
    ] };
    try {
      state.reasoning.calibration = [
        { id: 'a', ts: 3000 },
        { id: 'b', ts: 1000 },
        { id: 'c', ts: 2000 }
      ];
      eq(calibrationItem().id, 'b', 'b was asked longest ago');
    } finally {
      reasoningData = saved;
    }
  });

  test('true maps to the first option and false to the second', async () => {
    reset();
    const saved = reasoningData;
    try {
      reasoningData = { calibration: [{ id: 't', category: 'x', statement: 'S', answer: true, note: 'n' }] };
      let item = calibrationItem();
      deepEq(item.options, ['True', 'False']);
      eq(item.answer, 0, 'a true statement is answered True');
      eq(item.options[item.answer], 'True');

      reasoningData = { calibration: [{ id: 'f', category: 'x', statement: 'S', answer: false, note: 'n' }] };
      item = calibrationItem();
      eq(item.answer, 1, 'a false statement is answered False');
      eq(item.options[item.answer], 'False');
    } finally {
      reasoningData = saved;
    }
  });

  test('calibration day copes with an empty bank', () => {
    reset();
    const saved = reasoningData;
    reasoningData = { calibration: [] };
    try {
      eq(calibrationItem(), null, 'no item rather than a crash');
    } finally {
      reasoningData = saved;
    }
  });

  test('the real bank lasts a long time before repeating', async () => {
    reset();
    const r = await getJSON('data/reasoning.json');
    // One calibration day a week, roughly a dozen items a session.
    const weeks = r.calibration.length / 12;
    ok(weeks >= 20, 'the bank cycles after about ' + weeks.toFixed(0) +
      ' weekly sessions; grow it before it starts repeating');
  });

  test('the position challenged longest ago comes up first', () => {
    reset();
    eq(pickPositionForChallenge(), null, 'nothing to challenge yet');
    state.positions = [
      { id: 'p1', title: 'one', lastChallenged: 5000, revisions: [{ ts: 1, text: 'a' }] },
      { id: 'p2', title: 'two', lastChallenged: 1000, revisions: [{ ts: 1, text: 'b' }] },
      { id: 'p3', title: 'three', revisions: [{ ts: 1, text: 'c' }] }
    ];
    eq(pickPositionForChallenge().id, 'p3', 'one never challenged goes first');
    state.positions[2].lastChallenged = 9000;
    eq(pickPositionForChallenge().id, 'p2');
  });

  test('the fallback press bank cycles rather than running out', () => {
    reset();
    session.scratch = { pool: [], poolAt: 0, presses: 0 };
    const texts = [];
    for (let i = 0; i < FALLBACK_PRESSES.length * 2; i++) {
      const item = nextOfflineItem();
      eq(item.kind, 'press');
      nonEmptyStr(item.text);
      texts.push(item.text);
    }
    eq(new Set(texts).size, FALLBACK_PRESSES.length, 'it cycles through the whole bank');
  });

  test('a press is still found if the passage never arrived', () => {
    // On a slow connection the reader can press on before the corpus lands.
    // That used to throw, and the session was left with nothing to ask.
    reset();
    session.scratch = {};
    const item = nextOfflineItem();
    ok(item, 'something must come back');
    eq(item.kind, 'press');
    nonEmptyStr(item.text);
  });

  test('reading cannot be finished before there is a question behind it', async () => {
    reset();
    const savedCorpus = corpus;
    const btn = document.getElementById('btn-arg-done-reading');
    btn.disabled = false;
    try {
      corpus = await getJSON('data/corpus.json');
      session.running = true;
      session.type = 'argument';
      session.scratch = {};
      // What beginSession does before it waits for the passage.
      btn.disabled = true;
      eq(btn.disabled, true, 'the button is shut while the passage is on its way');
      await startArgument();
      eq(btn.disabled, false, 'and open again once the questions are there');
      ok(session.scratch.pool.length >= 1, 'with a pool behind it');
    } finally {
      corpus = savedCorpus;
      session.running = false;
      btn.disabled = false;
    }
  });

  test('the bundled questions are used before the generic presses', () => {
    reset();
    session.scratch = {
      pool: [{ kind: 'bundled', text: 'q1', n: 1 }, { kind: 'bundled', text: 'q2', n: 2 }],
      poolAt: 0,
      presses: 0
    };
    eq(nextOfflineItem().text, 'q1');
    eq(nextOfflineItem().text, 'q2');
    eq(nextOfflineItem().kind, 'press', 'only then does it fall back');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   12.  THE CONVERSATION SENT TO THE MODEL

   A malformed thread is rejected by the API, and the session silently
   drops back to the bundled questions when that happens.
   ═══════════════════════════════════════════════════════════════════════ */

group('interrogation thread', () => {
  const passage = { id: 'x', author: 'A', work: 'W', year: '1900', text: 'Some <em>text</em> here.' };

  test('an empty transcript opens on the passage', () => {
    const msgs = threadMessages(passage, []);
    eq(msgs.length, 1);
    eq(msgs[0].role, 'user');
    has(msgs[0].content, 'Some text here.', 'the em tags are stripped for the model');
    lacks(msgs[0].content, '<em>');
  });

  test('roles alternate user, assistant, user', () => {
    const transcript = [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' },
      { question: 'q3', answer: 'a3' }
    ];
    const msgs = threadMessages(passage, transcript);
    eq(msgs[0].role, 'user', 'a thread must open on a user turn');
    for (let i = 1; i < msgs.length; i++) {
      ok(msgs[i].role !== msgs[i - 1].role, 'two turns in a row from ' + msgs[i].role);
    }
    eq(msgs[msgs.length - 1].role, 'user', 'the model is always asked to speak next');
  });

  test('the first exchange is folded into the opening turn', () => {
    const msgs = threadMessages(passage, [{ question: 'q1', answer: 'a1' }]);
    eq(msgs.length, 1);
    has(msgs[0].content, 'q1');
    has(msgs[0].content, 'a1');
    has(msgs[0].content, 'Some text here.');
  });

  test('later exchanges become real turns', () => {
    const msgs = threadMessages(passage, [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' }
    ]);
    eq(msgs.length, 3);
    eq(msgs[1].role, 'assistant');
    eq(msgs[1].content, 'q2', 'the model sees its own question as its own turn');
    eq(msgs[2].content, 'a2');
  });

  test('no turn is ever empty', () => {
    const msgs = threadMessages(passage, [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' }
    ]);
    msgs.forEach((m, i) => nonEmptyStr(m.content, 'turn ' + i + ' is empty and would be rejected'));
  });

  test('a missing passage does not produce a broken thread', () => {
    const msgs = threadMessages(null, [{ question: 'q1', answer: 'a1' }]);
    eq(msgs.length, 1);
    nonEmptyStr(msgs[0].content);
    has(msgs[0].content, 'passage text unavailable');
  });

  test('every conversational call leaves room for the model to reason', async () => {
    // The model reasons before it answers and that reasoning comes out of
    // max_tokens. Budgets sized for a model that did not reason produced a
    // reply cut off mid-sentence, or no reply at all, and the session quietly
    // dropped back to the bundled questions.
    ok(REPLY_TOKENS >= 2000, 'the shared budget is too small to hold reasoning and a reply');

    const src = await (await fetch('app.js' + (window.__BUST || '?harness=1'))).text();
    // Each call site, taken as the 300 characters after the opening bracket.
    const sites = [];
    let at = src.indexOf('callClaude(');
    while (at !== -1) {
      if (src.slice(0, at).slice(-9) !== 'function ') sites.push(src.substr(at, 300));
      at = src.indexOf('callClaude(', at + 1);
    }
    ok(sites.length >= 4, 'expected several call sites, found ' + sites.length);

    sites.forEach((site, i) => {
      const usesShared = site.indexOf('REPLY_TOKENS') !== -1;
      const noReasoning = site.indexOf('disabled') !== -1;
      ok(usesShared || noReasoning,
        'call site ' + i + ' sets its own small budget without turning reasoning off:\n' +
        site.slice(0, 160));
    });
  });

  test('the request asks for a reasoning depth', async () => {
    const src = await (await fetch('app.js' + (window.__BUST || '?harness=1'))).text();
    has(src, 'output_config', 'no effort setting is sent, so it runs at the default depth');
    ok(['low', 'medium', 'high', 'xhigh', 'max'].indexOf(REASONING_EFFORT) !== -1,
      'REASONING_EFFORT is not one the API accepts: ' + REASONING_EFFORT);
  });

  test('a session never waits longer than the timeout allows', () => {
    ok(API_TIMEOUT >= 30000,
      'reasoning takes longer than a plain reply; the old 25s left no headroom');
  });

  test('the interrogation prompt still tells the model to argue back', () => {
    // The whole point of the day. If this text is ever softened the sessions
    // go agreeable and nothing else in the app will notice.
    const p = INTERROGATION_SYSTEM_PROMPT.toLowerCase();
    ok(p.indexOf('argue back') !== -1 || p.indexOf('not a cheerleader') !== -1,
      'the prompt no longer tells the model to push');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   13.  ROUTING
   ═══════════════════════════════════════════════════════════════════════ */

group('routing', () => {
  test('each view shows itself and hides the others', () => {
    reset();
    VIEWS.forEach(target => {
      go(target);
      VIEWS.forEach(v => {
        eq(document.getElementById('view-' + v).hidden, v !== target,
          'going to ' + target + ' left #view-' + v + ' wrong');
      });
    });
    go('home');
  });

  test('the top bar hides only during a session', () => {
    reset();
    go('home');
    eq(document.getElementById('topbar').hidden, false);
    go('session');
    eq(document.getElementById('topbar').hidden, true);
    go('home');
    eq(document.getElementById('topbar').hidden, false);
  });

  test('the current tab is marked for a screen reader', () => {
    reset();
    go('review');
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const marked = tabs.filter(t => t.getAttribute('aria-current') === 'page');
    eq(marked.length, 1, 'exactly one tab should be current');
    eq(marked[0].dataset.goto, 'review');
    go('home');
  });

  test('every tab points at a real view', () => {
    Array.from(document.querySelectorAll('[data-goto]')).forEach(el => {
      ok(VIEWS.indexOf(el.dataset.goto) !== -1,
        'a control points at a view that does not exist: ' + el.dataset.goto);
    });
  });

  test('the render functions survive an empty state', () => {
    reset();
    // Every one of these runs on first launch, before anything exists.
    ['home', 'review', 'positions', 'metrics', 'settings'].forEach(v => go(v));
    go('home');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   14.  DIFFICULTY ADAPTATION
   ═══════════════════════════════════════════════════════════════════════ */

group('difficulty adaptation', () => {

  /* `at` is an offset from now, in milliseconds, so a test can put one run
     of answers before a level change and another after it. Negative is the
     past. Attempts have to carry real timestamps: the adapter uses them to
     tell this level's evidence from the last level's. */
  function fill(branch, level, correctCount, ms, n, at) {
    const total = n === undefined ? 10 : n;
    const base = Date.now() + (at === undefined ? -60000 : at);
    for (let i = 0; i < total; i++) {
      branch.history.push({ ts: base + i, level: level, correct: i < correctCount, ms: ms });
    }
  }

  const fillMath  = (l, c, ms, n, at) => fill(state.math,  l, c, ms, n, at);
  const fillLogic = (l, c, ms, n, at) => fill(state.logic, l, c, ms, n, at);

  test('nothing moves before ten attempts at the level', () => {
    reset();
    state.math.level = 3;
    fillMath(3, 9, 100, 9);
    adaptLevel();
    eq(state.math.level, 3, 'nine perfect answers is not yet enough evidence');
  });

  test('accurate and quick moves up', () => {
    reset();
    state.math.level = 3;
    fillMath(3, 10, 100);
    adaptLevel();
    eq(state.math.level, 4);
  });

  test('accurate but slow stays put', () => {
    reset();
    state.math.level = 3;
    fillMath(3, 10, LEVEL_TARGET_MS[3] + 5000);
    adaptLevel();
    eq(state.math.level, 3, 'getting there eventually is not the same as knowing it');
  });

  test('a bad run moves down', () => {
    reset();
    state.math.level = 5;
    fillMath(5, 5, 100);
    adaptLevel();
    eq(state.math.level, 4);
  });

  test('the top and bottom levels hold', () => {
    reset();
    state.math.level = 8;
    fillMath(8, 10, 100);
    adaptLevel();
    eq(state.math.level, 8, 'there is no level 9');

    reset();
    state.math.level = 1;
    fillMath(1, 0, 100000);
    adaptLevel();
    eq(state.math.level, 1, 'there is no level 0');
  });

  test('only attempts at the current level count', () => {
    reset();
    state.math.level = 3;
    fillMath(1, 10, 100);       // ten easy wins at level 1
    fillMath(3, 3, 100, 3);     // only three at level 3
    adaptLevel();
    eq(state.math.level, 3, 'wins at another level must not promote you here');
  });

  test('a demotion is not undone by the old run at that level', () => {
    // Answer ten quickly and correctly at level 3 and get promoted, then
    // answer ten badly at level 4 and get demoted. The ten good answers at
    // level 3 are still the newest ten there, so without a cut-off the next
    // call reads them again and promotes straight back, over and over.
    reset();
    state.math.level = 3;
    fillMath(3, 10, 100, 10, -60000);
    adaptLevel();
    eq(state.math.level, 4, 'promoted');
    fillMath(4, 2, 100, 10, 1000);
    adaptLevel();
    eq(state.math.level, 3, 'demoted');
    adaptLevel();
    eq(state.math.level, 3, 'the demotion should hold until there is new evidence at level 3');
  });

  test('a promotion is not repeated off the same run of answers', () => {
    reset();
    state.math.level = 3;
    fillMath(3, 10, 100);
    adaptLevel();
    eq(state.math.level, 4);
    adaptLevel();
    eq(state.math.level, 4, 'one good run should buy one level, not two');
  });

  test('a level change is stamped so the next window starts there', () => {
    reset();
    state.math.level = 3;
    eq(state.math.levelSince, 0, 'a new state has no level history to discount');
    fillMath(3, 10, 100);
    adaptLevel();
    ok(state.math.levelSince > 0, 'the move was stamped');
    near(state.math.levelSince, Date.now(), 5000);
  });

  test('answers given before the level changed no longer count', () => {
    reset();
    state.math.level = 4;
    state.math.levelSince = Date.now();
    fillMath(4, 10, 100, 10, -60000);   // ten wins, but from before the change
    adaptLevel();
    eq(state.math.level, 4, 'that run belonged to the level you were on before');
  });

  test('logic keeps its own stamp', () => {
    reset();
    state.logic.level = 2;
    fillLogic(2, 10, 100, 10, -60000);
    adaptLogicLevel();
    eq(state.logic.level, 3, 'promoted');
    fillLogic(3, 2, 100, 10, 1000);
    adaptLogicLevel();
    eq(state.logic.level, 2, 'demoted');
    adaptLogicLevel();
    eq(state.logic.level, 2, 'and it holds');
  });

  test('logic levels move on the same rule', () => {
    reset();
    state.logic.level = 2;
    fillLogic(2, 10, 100);
    adaptLogicLevel();
    eq(state.logic.level, 3);

    reset();
    state.logic.level = 3;
    fillLogic(3, 5, 100);
    adaptLogicLevel();
    eq(state.logic.level, 2);
  });

  test('logic stops at level six', () => {
    reset();
    state.logic.level = 6;
    fillLogic(6, 10, 100);
    adaptLogicLevel();
    eq(state.logic.level, 6);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   15.  THE DAY BOUNDARY
   ═══════════════════════════════════════════════════════════════════════ */

group('the day boundary', () => {
  test('same calendar day ignores the time of day', () => {
    const morning = new Date(2026, 7, 18, 6, 0, 0).getTime();
    const night   = new Date(2026, 7, 18, 23, 59, 0).getTime();
    ok(sameCalendarDay(morning, night));
  });

  test('one minute past midnight is a new day', () => {
    const before = new Date(2026, 7, 18, 23, 59, 0).getTime();
    const after  = new Date(2026, 7, 19, 0, 1, 0).getTime();
    notOk(sameCalendarDay(before, after));
  });

  test('the same date in a different year is not the same day', () => {
    notOk(sameCalendarDay(new Date(2025, 7, 18).getTime(), new Date(2026, 7, 18).getTime()));
  });

  test('a session finished today is found', () => {
    reset();
    state.sessions = [{ ts: Date.now() - 3600000, type: 'math', completed: true }];
    ok(completedToday());
  });

  test('a session finished yesterday is not', () => {
    reset();
    state.sessions = [{ ts: Date.now() - 30 * 3600000, type: 'math', completed: true }];
    eq(completedToday(), null);
  });

  test('an abandoned session on its own does not count as done', () => {
    reset();
    state.sessions = [{ ts: Date.now() - 3600000, type: 'logic', completed: false }];
    eq(completedToday(), null, 'starting and walking away is not finishing');
  });

  test('a finished session still counts after a later abandoned one', () => {
    reset();
    state.sessions = [
      { ts: Date.now() - 7200000, type: 'math', completed: true },
      { ts: Date.now() - 3600000, type: 'logic', completed: false }
    ];
    const done = completedToday();
    ok(done, 'today was already done; starting a second one and quitting does not undo it');
    eq(done.type, 'math');
  });

  test('yesterday finished and today abandoned still reads as not done', () => {
    reset();
    state.sessions = [
      { ts: Date.now() - 30 * 3600000, type: 'math', completed: true },
      { ts: Date.now() - 3600000, type: 'logic', completed: false }
    ];
    eq(completedToday(), null);
  });

  test('no sessions at all is handled', () => {
    reset();
    state.sessions = [];
    eq(completedToday(), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   16.  THE OFFLINE SHELL
   ═══════════════════════════════════════════════════════════════════════ */

group('offline shell', () => {
  test('the service worker caches every file the app needs', async () => {
    const res = await fetch('sw.js' + (window.__BUST || '?harness=1'));
    ok(res.ok, 'sw.js is served');
    const src = await res.text();
    ['index.html', 'style.css', 'app.js', 'data/corpus.json',
     'data/reasoning.json', 'data/propositions.json', 'manifest.webmanifest']
      .forEach(f => has(src, f, 'sw.js does not cache ' + f + ', so it breaks offline'));
  });

  test('the cache version is stamped', async () => {
    const res = await fetch('sw.js' + (window.__BUST || '?harness=1'));
    const src = await res.text();
    ok(/thinking-app-v\d+/.test(src), 'sw.js has no versioned cache name to bump');
  });

  test('the service worker never caches a secret', async () => {
    const res = await fetch('sw.js' + (window.__BUST || '?harness=1'));
    const src = await res.text();
    // This is a static site. Anything the shell caches is something the shell
    // ships, and shipping a key would publish it.
    ['local-key.js', '.env', 'secret', 'apiKey', 'sk-ant']
      .forEach(bad => lacks(src, bad, 'sw.js refers to ' + bad));
  });

  test('nothing the app serves carries a key', async () => {
    for (const file of ['index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'sw.js']) {
      const res = await fetch(file + (window.__BUST || '?harness=1'));
      const src = await res.text();
      lacks(src, 'sk-ant-api', file + ' has an API key written into it');
    }
  });

  test('the local key file is only ever reached on localhost', async () => {
    const res = await fetch('app.js' + (window.__BUST || '?harness=1'));
    const src = await res.text();
    has(src, 'local-key.js', 'the local key path exists');
    // The guard and the load must live in the same function, or a deployed
    // build would go looking for a file that only exists on this machine.
    const fn = src.slice(src.indexOf('function loadLocalKey'), src.indexOf('function boot('));
    has(fn, 'isLocalhost()', 'loadLocalKey does not check where it is running');
    ok(fn.indexOf('isLocalhost()') < fn.indexOf("'local-key.js'"),
      'the check must come before the load');
  });

  test('the manifest is valid json with the fields an install needs', async () => {
    const m = await getJSON('manifest.webmanifest');
    nonEmptyStr(m.name);
    nonEmptyStr(m.start_url);
    ok(Array.isArray(m.icons) && m.icons.length > 0, 'an install needs icons');
    m.icons.forEach((i, n) => {
      nonEmptyStr(i.src, 'icon ' + n + ' src');
      nonEmptyStr(i.sizes, 'icon ' + n + ' sizes');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   THE RUNNER
   ═══════════════════════════════════════════════════════════════════════ */

window.__runTests = async function (ui) {
  storageMode = installFakeStorage() ? 'faked' : 'real';

  if (storageMode !== 'faked') {
    ui.summary.className = 'bad';
    ui.summary.textContent = 'stopped: this browser would not let the tests fake storage, and running them would overwrite real sessions.';
    return;
  }

  const filter = (ui.filter || '').toLowerCase();
  const chosen = filter ? groups.filter(g => g.name.toLowerCase().indexOf(filter) !== -1) : groups;

  let passed = 0, failed = 0, skipped = 0;
  const started = Date.now();

  if (filter) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'filtered to groups matching "' + filter + '" — ' + chosen.length + ' of ' + groups.length;
    ui.note.appendChild(p);
  }

  for (const g of chosen) {
    const box = document.createElement('section');
    box.className = 'group';
    const h = document.createElement('h2');
    h.textContent = g.name;
    const count = document.createElement('span');
    count.className = 'count';
    h.appendChild(count);
    box.appendChild(h);
    ui.results.appendChild(box);

    let gp = 0, gf = 0;

    for (const c of g.cases) {
      const row = document.createElement('div');
      row.className = 'case';
      row.textContent = c.name;
      box.appendChild(row);

      if (c.skip) {
        row.className = 'case skip';
        row.textContent = c.name + ' — ' + c.skip;
        skipped++;
        continue;
      }

      try {
        reset();
        await c.fn();
        row.className = 'case pass';
        passed++; gp++;
      } catch (err) {
        row.className = 'case fail';
        const pre = document.createElement('pre');
        pre.textContent = (err instanceof Failed) ? err.message : ((err && err.stack) || String(err));
        row.appendChild(pre);
        failed++; gf++;
      } finally {
        try { timer.stop(); } catch (e) { /* nothing to stop */ }
      }

      // Let the page paint, so a long run shows progress instead of freezing.
      if ((passed + failed) % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    count.textContent = gf ? gp + ' passed, ' + gf + ' failed' : gp + ' passed';
    ui.summary.textContent = passed + ' passed, ' + failed + ' failed — running…';
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  ui.summary.className = failed ? 'bad' : 'ok';
  ui.summary.textContent =
    (failed ? failed + ' FAILED, ' : 'all green — ') +
    passed + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') +
    ' in ' + secs + 's';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const total = passed + failed || 1;
  bar.innerHTML = '<i class="p" style="width:' + (100 * passed / total) + '%"></i>' +
                  '<i class="f" style="width:' + (100 * failed / total) + '%"></i>';
  ui.summary.appendChild(bar);

  // Read by anything driving the page from outside.
  window.__testResults = { passed: passed, failed: failed, skipped: skipped, seconds: Number(secs) };
  document.title = (failed ? failed + ' failed' : 'all green') + ' — thinking-app tests';
};

})();
