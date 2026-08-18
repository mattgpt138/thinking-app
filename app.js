/* ═══════════════════════════════════════════════════════════════════════
   thinking-app
   Vanilla JS, no build step, no dependencies.

   Structure
     1.  Interrogation prompts   (tune these)
     2.  Constants
     3.  State and storage
     4.  Small utilities
     5.  Routing
     6.  Anthropic client
     7.  Timer
     8.  Session controller
     9.  Argument day
    10.  Math day
    11.  Reasoning day
    12.  Positions
    13.  Metrics
    14.  Settings, export, import
    15.  Boot
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   1.  INTERROGATION PROMPTS  —  EDIT THESE

   The default behaviour of a language model in this position is flattery.
   It will tell you your reasoning is thoughtful and nuanced. That makes
   the whole exercise worthless. These prompts exist to fight that, and
   they are collected here so they are easy to tune.

   If responses start feeling agreeable, sharpen the prohibitions rather
   than adding more instructions about being "critical" — models comply
   with concrete bans far better than with adjectives.
   ═══════════════════════════════════════════════════════════════════════ */

const INTERROGATION_SYSTEM_PROMPT = `You are an interrogator. You are not a tutor, a coach, or a discussion partner. Your single job is to locate the weakest premise in the user's reasoning and press on it until it either holds or breaks.

HOW TO WORK

Read what the user wrote. Identify the load-bearing claim: the one that, if false, collapses the rest. It is usually unstated. Then construct the strongest objection to it that you can actually defend, and put that objection to them as a question they must answer.

Prefer, in this order:
1. An unstated premise the argument needs but never earns.
2. A counterexample that the argument's own principle fails to handle.
3. An equivocation: a word doing different work in two places.
4. A conclusion that does not follow even if every premise is granted.
5. Evidence the user would have to possess for the claim to be warranted, and plainly does not.

If the reasoning is genuinely sound, do not manufacture a fake objection. Say which step is sound and why, in one sentence, then attack the next-weakest step. There is always a next-weakest step.

HARD PROHIBITIONS

Never open by characterising the user's response. No "that's a sharp observation", "you've hit on something", "this is a thoughtful point", "good", "interesting", "fair enough", "I appreciate". Never grade the response. Never summarise back what they said before responding. Begin with the objection itself.

Never soften with hedges: "you might consider", "perhaps", "it could be argued", "one could say". State the objection directly.

Never offer more than one line of attack per turn. One pressure point, pressed hard, beats four raised gently.

Never resolve the difficulty for them. Do not answer your own question. End on the question.

Never comment on the exercise, the format, or your own role.

FORM

Under 120 words. Plain declarative sentences. End with a single direct question the user has to answer. No lists, no headings, no markdown formatting, no preamble.`;

const CHALLENGE_SYSTEM_PROMPT = `You are constructing the strongest available counterargument to a position the user holds. You are steelmanning the opposition, not moderating a debate.

Build the best case against their position. Use the strongest version of the opposing argument, not the version that is easiest to defeat. Where the opposing case rests on evidence, name the kind of evidence. Where it rests on a principle the user already accepts elsewhere, say which principle and show the inconsistency.

HARD PROHIBITIONS

Never praise the position or call it nuanced, thoughtful, or reasonable. Never open by restating it. Never present "both sides" or end with a conciliatory note about how reasonable people disagree. Never conclude that the truth lies somewhere in the middle. Your output contains the counterargument and nothing else.

If the position is genuinely well supported, say which specific claim is the strongest and then attack the weakest remaining one anyway.

FORM

Under 250 words. Prose, no lists, no headings, no markdown. Direct and declarative.`;

/* Used when there is no API key, or the call fails. The session must
   never stall on the network. */
const FALLBACK_PRESSES = [
  'Which premise in what you just wrote would you least like to be asked for evidence about? Give the evidence.',
  'State the strongest objection to your own answer. Then answer it, or concede.',
  'What would have to be true about the world for your answer to be wrong? Is it true?',
  'You used a word there that is doing more work than it can carry. Find it and define it precisely.',
  'Is that a claim about what is the case, or about what ought to be? If you slid between them, say where.',
  'Someone who disagrees with you is not stupid. Reconstruct their reasoning so that it sounds sensible. Now where exactly does it fail?',
  'What is the smallest change to the passage that would make your answer wrong?',
  'You have given a reason. Now give the reason for that reason. Keep going until you hit something you cannot justify.',
  'Does your answer generalise? Apply it to a case you care about and see whether you still accept it.',
  'What evidence, if you encountered it tomorrow, would change your mind about this? If none, say so plainly and explain why that is not a problem.'
];

/* ═══════════════════════════════════════════════════════════════════════
   2.  CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */

const STORE_KEY   = 'thinking-app:v1';
const TYPES       = ['argument', 'math', 'reasoning'];
const BASE_LENGTH = 600;    // seconds
const RAMP_EVERY  = 6;      // completed sessions per increment
const RAMP_STEP   = 60;     // seconds added per increment
const MAX_LENGTH  = 2400;   // seconds
const READOUT_AT  = 60;     // reveal the numeric readout at this many seconds left
const ARC_LENGTH  = 2 * Math.PI * 54;
const API_TIMEOUT = 25000;  // ms; a session never waits longer than this

const DEFAULT_MODEL = 'claude-sonnet-5';

const BLURB = {
  argument:  'Read one passage closely. Then answer for it. The questions are not comprehension checks; they are attempts to find where your reading gives way.',
  math:      'Arithmetic in your head. No paper, no calculator. The difficulty tracks you, so a run of errors is information, not failure.',
  reasoning: 'Estimation, calibration, and base rates. The point is not to be right. It is to know how right you are.'
};

const SUB_MODES = ['calibration', 'fermi', 'baserate'];

/* Median response time, in ms, that counts as "fast" for each level. */
const LEVEL_TARGET_MS = [0, 8000, 9000, 11000, 15000, 17000, 19000, 22000, 32000];

/* ═══════════════════════════════════════════════════════════════════════
   3.  STATE AND STORAGE
   ═══════════════════════════════════════════════════════════════════════ */

function blankState() {
  return {
    version: 1,
    created: Date.now(),
    cycleIndex: 0,
    completedSessions: 0,
    sessions: [],
    argument: { seen: [], days: 0 },
    math: { level: 3, history: [] },
    reasoning: { subIndex: 0, calibration: [], fermiSeen: [], baseRate: [] },
    positions: [],
    settings: { apiKey: '', model: DEFAULT_MODEL }
  };
}

let state = blankState();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('could not read saved state, starting fresh', e);
  }
}

/* Fill in anything a older or hand-edited file is missing, so an import
   never leaves the app in a half-built state. */
function migrate(s) {
  const base = blankState();
  const out = Object.assign(base, s);
  out.argument  = Object.assign(base.argument,  s.argument  || {});
  out.math      = Object.assign(base.math,      s.math      || {});
  out.reasoning = Object.assign(base.reasoning, s.reasoning || {});
  out.settings  = Object.assign(base.settings,  s.settings  || {});
  if (!Array.isArray(out.sessions)) out.sessions = [];
  if (!Array.isArray(out.positions)) out.positions = [];
  if (!Array.isArray(out.argument.seen)) out.argument.seen = [];
  if (!Array.isArray(out.math.history)) out.math.history = [];
  if (!Array.isArray(out.reasoning.calibration)) out.reasoning.calibration = [];
  if (!Array.isArray(out.reasoning.fermiSeen)) out.reasoning.fermiSeen = [];
  if (!Array.isArray(out.reasoning.baseRate)) out.reasoning.baseRate = [];
  return out;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 250);
}
function writeNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('could not save', e);
  }
}
window.addEventListener('pagehide', writeNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') writeNow();
});

/* ═══════════════════════════════════════════════════════════════════════
   4.  SMALL UTILITIES
   ═══════════════════════════════════════════════════════════════════════ */

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const randInt  = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick     = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function stamp(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
         ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function setText(el, s) { if (el) el.textContent = s; }

/* Passage text is authored by us and may contain <em>. Everything else
   that reaches innerHTML goes through here first. */
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Allow only <em> in corpus text; strip anything else. */
function passageHTML(text) {
  return escapeHTML(text)
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>')
    .split(/\n{2,}/)
    .map(p => '<p>' + p.replace(/\n/g, ' ') + '</p>')
    .join('');
}

function sessionLength() {
  return Math.min(MAX_LENGTH, BASE_LENGTH + RAMP_STEP * Math.floor(state.completedSessions / RAMP_EVERY));
}

function todayType() {
  return TYPES[state.cycleIndex % TYPES.length];
}

function hasKey() {
  return Boolean(state.settings.apiKey && state.settings.apiKey.trim());
}

/* ═══════════════════════════════════════════════════════════════════════
   5.  ROUTING
   ═══════════════════════════════════════════════════════════════════════ */

const VIEWS = ['home', 'session', 'end', 'positions', 'metrics', 'settings'];
let currentView = 'home';

function go(view) {
  if (currentView === 'session' && view !== 'session' && session.running) {
    if (!confirm('A session is running. Leaving abandons it. Continue?')) return;
    abandonSession();
  }
  currentView = view;
  VIEWS.forEach(v => { $('#view-' + v).hidden = (v !== view); });
  $$('.tab').forEach(t => {
    const on = t.dataset.goto === view;
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  $('#topbar').hidden = (view === 'session');
  window.scrollTo(0, 0);

  if (view === 'home')      renderHome();
  if (view === 'positions') renderPositions();
  if (view === 'metrics')   renderMetrics();
  if (view === 'settings')  renderSettings();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-goto]');
  if (el) { e.preventDefault(); go(el.dataset.goto); }
});

/* ═══════════════════════════════════════════════════════════════════════
   6.  ANTHROPIC CLIENT

   Every call site must handle rejection by falling back to bundled
   content. Nothing in a session is allowed to depend on the network.
   ═══════════════════════════════════════════════════════════════════════ */

async function callClaude(system, messages, maxTokens) {
  if (!hasKey()) throw new Error('no key');

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), API_TIMEOUT);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': state.settings.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: (state.settings.model || DEFAULT_MODEL).trim(),
        max_tokens: maxTokens || 400,
        system: system,
        messages: messages
      })
    });

    if (!res.ok) {
      let detail = res.status + ' ' + res.statusText;
      try {
        const err = await res.json();
        if (err && err.error && err.error.message) detail = err.error.message;
      } catch (_) { /* body was not JSON */ }
      throw new Error(detail);
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('empty response');
    return text;

  } finally {
    clearTimeout(timeout);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   7.  TIMER

   The numeric readout stays hidden until the final minute. A thin arc
   fills instead. This is the point of the app, not an oversight.
   ═══════════════════════════════════════════════════════════════════════ */

const timer = {
  total: 0,
  endAt: 0,
  handle: null,
  announced: false,

  start(seconds, onEnd) {
    this.total = seconds;
    this.endAt = Date.now() + seconds * 1000;
    this.onEnd = onEnd;
    this.announced = false;
    $('#timer').classList.remove('final');
    $('#timer-readout').hidden = true;
    $('#arc-fill').style.strokeDashoffset = ARC_LENGTH;
    clearInterval(this.handle);
    this.handle = setInterval(() => this.tick(), 250);
    this.tick();
  },

  remaining() {
    return Math.max(0, (this.endAt - Date.now()) / 1000);
  },

  tick() {
    const left = this.remaining();
    const done = clamp(1 - left / this.total, 0, 1);
    $('#arc-fill').style.strokeDashoffset = String(ARC_LENGTH * (1 - done));

    if (left <= READOUT_AT) {
      const readout = $('#timer-readout');
      readout.hidden = false;
      readout.textContent = String(Math.ceil(left));
      $('#timer').classList.add('final');
      if (!this.announced) {
        this.announced = true;
        setText($('#timer-sr'), 'One minute remaining.');
      }
    }

    if (left <= 0) {
      this.stop();
      if (this.onEnd) this.onEnd();
    }
  },

  stop() {
    clearInterval(this.handle);
    this.handle = null;
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   8.  SESSION CONTROLLER
   ═══════════════════════════════════════════════════════════════════════ */

let corpus = null;
let reasoningData = null;

const session = {
  running: false,
  type: null,
  planned: 0,
  startedAt: 0,
  transcript: [],
  scratch: {}
};

async function beginSession() {
  const type = todayType();
  session.running = true;
  session.type = type;
  session.planned = sessionLength();
  session.startedAt = Date.now();
  session.transcript = [];
  session.scratch = {};

  setText($('#timer-label'), type);
  $('#stage-argument').hidden  = type !== 'argument';
  $('#stage-math').hidden      = type !== 'math';
  $('#stage-reasoning').hidden = type !== 'reasoning';

  go('session');
  timer.start(session.planned, endSession);

  if (type === 'argument')  await startArgument();
  if (type === 'math')      startMath();
  if (type === 'reasoning') await startReasoning();
}

function endSession() {
  if (!session.running) return;
  timer.stop();
  session.running = false;

  const elapsed = Math.round((Date.now() - session.startedAt) / 1000);
  const record = {
    ts: session.startedAt,
    type: session.type,
    plannedS: session.planned,
    actualS: elapsed,
    completed: true
  };

  if (session.type === 'argument') {
    record.passageId = session.scratch.passage ? session.scratch.passage.id : null;
    record.transcript = session.transcript;
    state.argument.days += 1;
  }
  if (session.type === 'math') {
    record.attempted = session.scratch.attempted || 0;
    record.correct = session.scratch.correct || 0;
    record.endLevel = state.math.level;
  }
  if (session.type === 'reasoning') {
    record.subMode = session.scratch.subMode;
    record.items = session.scratch.items || 0;
    state.reasoning.subIndex = (state.reasoning.subIndex + 1) % SUB_MODES.length;
  }

  state.sessions.push(record);
  state.completedSessions += 1;
  state.cycleIndex += 1;
  writeNow();

  showEnd(record);
}

function abandonSession() {
  if (!session.running) return;
  timer.stop();
  session.running = false;
  state.sessions.push({
    ts: session.startedAt,
    type: session.type,
    plannedS: session.planned,
    actualS: Math.round((Date.now() - session.startedAt) / 1000),
    completed: false
  });
  writeNow();
}

function showEnd(record) {
  setText($('#end-type'), record.type);
  const rows = [['time held', mmss(record.actualS)]];

  if (record.type === 'math') {
    const pct = record.attempted ? Math.round(100 * record.correct / record.attempted) : 0;
    rows.push(['problems', String(record.attempted)]);
    rows.push(['correct', record.correct + ' (' + pct + '%)']);
    rows.push(['level', String(record.endLevel)]);
  }
  if (record.type === 'reasoning') {
    rows.push(['mode', record.subMode]);
    rows.push(['items', String(record.items)]);
  }
  if (record.type === 'argument') {
    rows.push(['responses', String((record.transcript || []).filter(t => t.answer).length)]);
  }
  rows.push(['next up', TYPES[state.cycleIndex % TYPES.length]]);

  $('#end-stats').innerHTML = rows
    .map(([k, v]) => '<div><dt>' + escapeHTML(k) + '</dt><dd>' + escapeHTML(v) + '</dd></div>')
    .join('');

  go('end');
}

$('#btn-abandon').addEventListener('click', () => {
  if (!confirm('Abandon this session? It will not count, and the rotation will not advance.')) return;
  abandonSession();
  go('home');
});

$('#btn-begin').addEventListener('click', () => { beginSession(); });

/* ═══════════════════════════════════════════════════════════════════════
   9.  ARGUMENT DAY
   ═══════════════════════════════════════════════════════════════════════ */

async function loadCorpus() {
  if (corpus) return corpus;
  const res = await fetch('data/corpus.json');
  corpus = await res.json();
  return corpus;
}

function nextPassage() {
  let unseen = corpus.filter(p => !state.argument.seen.includes(p.id));
  if (unseen.length === 0) {
    // corpus exhausted; start the rotation again
    state.argument.seen = [];
    unseen = corpus.slice();
  }
  return pick(unseen);
}

async function startArgument() {
  try {
    await loadCorpus();
  } catch (e) {
    setText($('#arg-attrib'), 'The corpus could not be loaded.');
    $('#arg-passage').innerHTML = '<p>Check your connection once, so the passages can be cached for offline use.</p>';
    return;
  }

  const p = nextPassage();
  session.scratch.passage = p;
  state.argument.seen.push(p.id);
  save();

  setText($('#arg-attrib'), p.author + ' — ' + p.work + ', ' + p.year);
  $('#arg-passage').innerHTML = passageHTML(p.text);
  $('#arg-source').href = p.source_url;

  // Build the question queue: bundled questions, then the position
  // challenge on every third argument day.
  const queue = p.questions.map(q => ({ kind: 'bundled', text: q }));

  const isThirdDay = (state.argument.days + 1) % 3 === 0;
  const position = pickPositionForChallenge();
  if (isThirdDay && position) {
    const latest = position.revisions[position.revisions.length - 1];
    queue.push({
      kind: 'position',
      positionId: position.id,
      text: 'Here is what you wrote, under the title "' + position.title + '":\n\n“' +
            latest.text.trim() + '”\n\nThis passage bears on it. Revise or defend.'
    });
  }

  session.scratch.queue = queue;
  session.scratch.index = 0;
  session.scratch.presses = 0;

  $('#arg-read').hidden = false;
  $('#arg-work').hidden = true;
}

function pickPositionForChallenge() {
  if (!state.positions.length) return null;
  // Prefer the position challenged least recently.
  const sorted = state.positions.slice().sort((a, b) => (a.lastChallenged || 0) - (b.lastChallenged || 0));
  return sorted[0];
}

$('#btn-arg-done-reading').addEventListener('click', () => {
  $('#arg-read').hidden = true;
  $('#arg-work').hidden = false;
  showArgQuestion();
});

$('#btn-arg-reread').addEventListener('click', () => {
  $('#arg-read').hidden = false;
  $('#arg-work').hidden = true;
});

function showArgQuestion() {
  const q = session.scratch.queue[session.scratch.index];
  if (!q) { queueFallbackPress(); return showArgQuestion(); }

  const label = q.kind === 'bundled'  ? 'question ' + (session.scratch.index + 1)
              : q.kind === 'position' ? 'your own position'
              : q.kind === 'live'     ? 'interrogation'
              :                         'press further';

  setText($('#arg-progress'), label);
  $('#arg-question').textContent = q.text;
  const ta = $('#arg-answer');
  ta.value = '';
  ta.disabled = false;
  $('#btn-arg-submit').disabled = false;
  setText($('#arg-status'), '');
  ta.focus();
}

function queueFallbackPress() {
  const used = session.scratch.presses || 0;
  session.scratch.presses = used + 1;
  session.scratch.queue.push({
    kind: 'press',
    text: FALLBACK_PRESSES[used % FALLBACK_PRESSES.length]
  });
}

$('#btn-arg-submit').addEventListener('click', async () => {
  const q = session.scratch.queue[session.scratch.index];
  const ta = $('#arg-answer');
  const answer = ta.value.trim();

  if (!answer) { setText($('#arg-status'), 'Write something first. A blank is not an answer.'); return; }

  let notice = '';

  session.transcript.push({ kind: q.kind, question: q.text, answer: answer, ts: Date.now() });

  if (q.kind === 'position') {
    const pos = state.positions.find(p => p.id === q.positionId);
    if (pos) {
      pos.lastChallenged = Date.now();
      pos.revisions.push({ ts: Date.now(), text: answer, origin: 'argument-day' });
    }
  }
  save();

  session.scratch.index += 1;

  // With a key, press the answer live before moving on.
  if (hasKey() && q.kind !== 'live') {
    $('#btn-arg-submit').disabled = true;
    ta.disabled = true;
    setText($('#arg-status'), 'Interrogating…');
    try {
      const passage = session.scratch.passage;
      const press = await callClaude(
        INTERROGATION_SYSTEM_PROMPT,
        [{
          role: 'user',
          content:
            'PASSAGE (' + passage.author + ', ' + passage.work + ', ' + passage.year + '):\n\n' +
            passage.text.replace(/<\/?em>/g, '') +
            '\n\nQUESTION PUT TO ME:\n' + q.text +
            '\n\nMY RESPONSE:\n' + answer +
            '\n\nFind the weakest premise in my response and press it.'
        }],
        400
      );
      session.scratch.queue.splice(session.scratch.index, 0, { kind: 'live', text: press });
    } catch (err) {
      console.warn('interrogation unavailable, falling back', err);
      notice = 'No live interrogation right now. Continuing on the bundled questions.';
      queueFallbackPress();
    }
  }

  if (!session.scratch.queue[session.scratch.index]) queueFallbackPress();
  showArgQuestion();
  if (notice) setText($('#arg-status'), notice);   // set after render, which clears it
});

/* ═══════════════════════════════════════════════════════════════════════
   10.  MATH DAY

   Everything here is generated locally. This day works with no network
   at all, which is why it is the safest thing to have on the rotation.
   ═══════════════════════════════════════════════════════════════════════ */

/* Each generator returns { q, a } where a is the canonical answer string. */
const MATH_LEVELS = {

  1: () => {                                   // 2-digit addition and subtraction
    const a = randInt(11, 99), b = randInt(11, 99);
    if (Math.random() < 0.5) return { q: a + ' + ' + b, a: String(a + b) };
    const [hi, lo] = a >= b ? [a, b] : [b, a];
    return { q: hi + ' − ' + lo, a: String(hi - lo) };
  },

  2: () => {                                   // 2-digit by 1-digit multiplication
    const a = randInt(12, 99), b = randInt(3, 9);
    return { q: a + ' × ' + b, a: String(a * b) };
  },

  3: () => {                                   // percentages of round numbers
    const pct = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90]);
    const base = pick([40, 60, 80, 120, 140, 160, 200, 240, 300, 360, 400, 500, 600, 800]);
    return { q: pct + '% of ' + base, a: String(base * pct / 100) };
  },

  4: () => {                                   // 2-digit by 2-digit multiplication
    const a = randInt(12, 49), b = randInt(11, 39);
    return { q: a + ' × ' + b, a: String(a * b) };
  },

  5: () => {                                   // fraction to decimal, division with remainder
    if (Math.random() < 0.5) {
      const f = pick([[1,8],[3,8],[5,8],[7,8],[1,4],[3,4],[1,5],[2,5],[3,5],[4,5],[1,20],[3,20],[7,20],[1,16],[5,16]]);
      const val = f[0] / f[1];
      return { q: f[0] + '/' + f[1] + ' as a decimal', a: String(Number(val.toFixed(6))) };
    }
    const d = randInt(6, 19), qt = randInt(4, 40), r = randInt(1, d - 1);
    return { q: (d * qt + r) + ' ÷ ' + d + '  (give it as "q r r")', a: qt + ' r ' + r };
  },

  6: () => {                                   // 3-digit by 1-digit, and percent change
    if (Math.random() < 0.5) {
      const a = randInt(112, 989), b = randInt(3, 9);
      return { q: a + ' × ' + b, a: String(a * b) };
    }
    const from = pick([20, 25, 40, 50, 60, 80, 120, 150, 200, 250, 400, 500]);
    const step = pick([0.1, 0.15, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75]);
    const up = Math.random() < 0.5;
    const to = Math.round(from * (up ? 1 + step : 1 - step));
    const change = Math.round(1000 * (to - from) / from) / 10;
    return { q: 'from ' + from + ' to ' + to + ': percent change', a: String(change) };
  },

  7: () => {                                   // squares and harder 2-digit products
    if (Math.random() < 0.45) {
      const n = randInt(13, 49);
      return { q: n + '²', a: String(n * n) };
    }
    const a = randInt(41, 99), b = randInt(41, 99);
    return { q: a + ' × ' + b, a: String(a * b) };
  },

  8: () => {                                   // compound, multi-step
    const roll = Math.random();

    if (roll < 0.34) {                         // successive percentage change
      const base = pick([200, 240, 300, 400, 500, 600, 800, 1200]);
      const up = pick([10, 20, 25, 50]);
      const down = pick([10, 20, 25, 50]);
      const val = base * (1 + up / 100) * (1 - down / 100);
      return {
        q: base + ', up ' + up + '%, then down ' + down + '%',
        a: String(Number(val.toFixed(2)))
      };
    }

    if (roll < 0.67) {                         // weighted average
      const n1 = randInt(2, 9), n2 = randInt(2, 9);
      const v1 = pick([10, 20, 30, 40, 50, 60]), v2 = pick([10, 20, 30, 40, 50, 60]);
      const avg = (n1 * v1 + n2 * v2) / (n1 + n2);
      return {
        q: n1 + ' items at ' + v1 + ' and ' + n2 + ' at ' + v2 + ': the average',
        a: String(Number(avg.toFixed(3)))
      };
    }

    const a = randInt(12, 40), b = randInt(11, 25), c = randInt(11, 99);
    return { q: a + ' × ' + b + ' + ' + c, a: String(a * b + c) };
  }
};

/* Answer comparison. Tolerant about form, strict about value. */
function mathMatches(given, expected) {
  const norm = s => String(s).trim().toLowerCase().replace(/[,\s]+/g, ' ').trim();
  let g = norm(given), e = norm(expected);
  if (!g) return false;

  // remainder form: accept "7 r 3", "7r3", "7 remainder 3"
  const remainder = /^(-?\d+)\s*(?:r|rem|remainder)\s*(\d+)$/;
  const mg = g.match(remainder), me = e.match(remainder);
  if (me) return Boolean(mg) && mg[1] === me[1] && mg[2] === me[2];
  if (mg) return false;

  g = g.replace(/[%\s]/g, '');
  e = e.replace(/[%\s]/g, '');
  const gn = Number(g), en = Number(e);
  if (!isFinite(gn) || !isFinite(en)) return g === e;
  return Math.abs(gn - en) < 1e-6;
}

function startMath() {
  session.scratch.attempted = 0;
  session.scratch.correct = 0;
  nextMathProblem();
}

function nextMathProblem() {
  const level = clamp(state.math.level, 1, 8);
  const item = MATH_LEVELS[level]();
  session.scratch.current = item;
  session.scratch.shownAt = Date.now();

  setText($('#math-meta'), 'level ' + level);
  setText($('#math-problem'), item.q);
  const input = $('#math-answer');
  input.value = '';
  input.focus();
  updateMathTally();
}

function updateMathTally() {
  const a = session.scratch.attempted, c = session.scratch.correct;
  setText($('#math-tally'), a ? c + ' of ' + a + ' this session' : '');
}

$('#math-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!session.running) return;

  const item = session.scratch.current;
  const given = $('#math-answer').value;
  if (!given.trim()) return;

  const ms = Date.now() - session.scratch.shownAt;
  const ok = mathMatches(given, item.a);

  session.scratch.attempted += 1;
  if (ok) session.scratch.correct += 1;

  state.math.history.push({ ts: Date.now(), level: state.math.level, correct: ok, ms: ms });
  if (state.math.history.length > 2000) state.math.history = state.math.history.slice(-2000);

  const v = $('#math-verdict');
  v.className = 'verdict ' + (ok ? 'right' : 'wrong');
  v.textContent = ok ? 'correct · ' + (ms / 1000).toFixed(1) + 's'
                     : 'no — ' + item.a + ' · ' + (ms / 1000).toFixed(1) + 's';

  adaptLevel();
  save();
  nextMathProblem();
});

/* Rolling window of the last 10 attempts at the current level. */
function adaptLevel() {
  const window = state.math.history.filter(h => h.level === state.math.level).slice(-10);
  if (window.length < 10) return;

  const accuracy = window.filter(h => h.correct).length / window.length;
  const times = window.map(h => h.ms).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const fast = median <= LEVEL_TARGET_MS[state.math.level];

  if (accuracy > 0.85 && fast && state.math.level < 8) {
    state.math.level += 1;
    flashMath('level ' + state.math.level);
  } else if (accuracy < 0.60 && state.math.level > 1) {
    state.math.level -= 1;
    flashMath('level ' + state.math.level);
  }
}

function flashMath(msg) {
  setText($('#math-meta'), msg);
}

/* ═══════════════════════════════════════════════════════════════════════
   11.  REASONING DAY
   ═══════════════════════════════════════════════════════════════════════ */

async function loadReasoning() {
  if (reasoningData) return reasoningData;
  const res = await fetch('data/reasoning.json');
  reasoningData = await res.json();
  return reasoningData;
}

async function startReasoning() {
  const mode = SUB_MODES[state.reasoning.subIndex % SUB_MODES.length];
  session.scratch.subMode = mode;
  session.scratch.items = 0;

  $('#cal-block').hidden   = mode !== 'calibration';
  $('#fermi-block').hidden = mode !== 'fermi';
  $('#base-block').hidden  = mode !== 'baserate';

  if (mode === 'baserate') { nextBaseRate(); return; }

  try {
    await loadReasoning();
  } catch (e) {
    $('#cal-block').hidden = true;
    $('#fermi-block').hidden = true;
    $('#base-block').hidden = false;
    session.scratch.subMode = 'baserate';
    nextBaseRate();
    return;
  }

  if (mode === 'calibration') nextCalibration();
  if (mode === 'fermi')       nextFermi();
}

/* ── calibration ─────────────────────────────────────────────────────── */

function nextCalibration() {
  const seen = state.reasoning.calibration.map(c => c.id);
  let pool = reasoningData.calibration.filter(c => !seen.includes(c.id));
  if (!pool.length) pool = reasoningData.calibration;

  const item = pick(pool);
  session.scratch.calItem = item;
  session.scratch.calSaid = null;

  setText($('#cal-meta'), 'calibration · item ' + (session.scratch.items + 1));
  $('#cal-statement').textContent = item.statement;
  $('#cal-conf').hidden = true;
  $('#cal-reveal').hidden = true;
  $$('#cal-block .btn-choice').forEach(b => { b.disabled = false; });
  buildConfGrid();
}

function buildConfGrid() {
  const grid = $('#cal-confgrid');
  grid.innerHTML = '';
  [50, 60, 70, 80, 90, 95].forEach(c => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = c + '%';
    b.addEventListener('click', () => resolveCalibration(c));
    grid.appendChild(b);
  });
}

$$('#cal-block .btn-choice').forEach(btn => {
  btn.addEventListener('click', () => {
    session.scratch.calSaid = btn.dataset.tf === 'true';
    $$('#cal-block .btn-choice').forEach(b => { b.disabled = true; });
    $('#cal-conf').hidden = false;
    const first = $('#cal-confgrid button');
    if (first) first.focus();
  });
});

function resolveCalibration(confidence) {
  const item = session.scratch.calItem;
  const said = session.scratch.calSaid;

  // p is the user's stated probability that the statement is TRUE
  const p = said ? confidence / 100 : 1 - confidence / 100;
  const actual = item.answer ? 1 : 0;
  const brier = Math.pow(p - actual, 2);
  const right = (said === item.answer);

  state.reasoning.calibration.push({
    ts: Date.now(), id: item.id, said: said, conf: confidence,
    answer: item.answer, correct: right, brier: brier
  });
  session.scratch.items += 1;
  save();

  const v = $('#cal-verdict');
  v.className = 'verdict ' + (right ? 'right' : 'wrong');
  v.textContent = (right ? 'Correct' : 'Wrong') +
                  ' · the statement is ' + (item.answer ? 'true' : 'false') +
                  ' · Brier ' + brier.toFixed(3);
  setText($('#cal-note'), item.note);
  $('#cal-conf').hidden = true;
  $('#cal-reveal').hidden = false;
  $('#btn-cal-next').focus();
}

$('#btn-cal-next').addEventListener('click', () => { if (session.running) nextCalibration(); });

/* ── fermi ───────────────────────────────────────────────────────────── */

function nextFermi() {
  let pool = reasoningData.fermi.filter(f => !state.reasoning.fermiSeen.includes(f.id));
  if (!pool.length) { state.reasoning.fermiSeen = []; pool = reasoningData.fermi; }

  const item = pick(pool);
  session.scratch.fermiItem = item;

  $('#fermi-prompt').textContent = item.prompt;
  $('#fermi-decomp').value = '';
  $('#fermi-number').value = '';
  $('#fermi-number').placeholder = 'your figure in ' + item.unit;
  $('#fermi-work').hidden = false;
  $('#fermi-reveal').hidden = true;
  $('#fermi-decomp').focus();
}

/* Accepts 800000, 800,000, 8e5, "8 x 10^5", "8*10^5". */
function parseMagnitude(raw) {
  let s = String(raw).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  if (!s) return NaN;
  const sci = s.match(/^(-?[\d.]+)(?:x|\*)?10\^?(-?\d+)$/);
  if (sci) return Number(sci[1]) * Math.pow(10, Number(sci[2]));
  s = s.replace(/[^0-9.e+-]/g, '');
  if (!/\d/.test(s)) return NaN;          // nothing numeric survived
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

$('#btn-fermi-submit').addEventListener('click', () => {
  const item = session.scratch.fermiItem;
  const value = parseMagnitude($('#fermi-number').value);

  if (!isFinite(value) || value <= 0) {
    $('#fermi-number').focus();
    return;
  }

  const inRange = value >= item.low && value <= item.high;
  const ordersOff = Math.abs(Math.log10(value) - Math.log10(Math.sqrt(item.low * item.high)));

  state.reasoning.fermiSeen.push(item.id);
  session.scratch.items += 1;
  save();

  const v = $('#fermi-verdict');
  v.className = 'verdict ' + (inRange ? 'right' : 'wrong');
  v.textContent = inRange
    ? 'Inside the accepted range. You gave ' + value.toExponential(2) + '.'
    : 'Outside the range by about ' + ordersOff.toFixed(1) + ' orders of magnitude. You gave ' +
      value.toExponential(2) + '; the accepted band is ' +
      item.low.toExponential(1) + ' to ' + item.high.toExponential(1) + ' ' + item.unit + '.';

  $('#fermi-steps').innerHTML = item.reference
    .map(s => '<li>' + escapeHTML(s) + '</li>').join('');
  setText($('#fermi-answer'), item.answer);

  $('#fermi-work').hidden = true;
  $('#fermi-reveal').hidden = false;
  $('#btn-fermi-next').focus();
});

$('#btn-fermi-next').addEventListener('click', () => { if (session.running) nextFermi(); });

/* ── base rates ──────────────────────────────────────────────────────── */

const fmt = n => {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const pctStr = n => (Math.round(n * 10) / 10) + '%';

/* Four templates. Numbers are drawn fresh every time, so nothing here
   can be memorised. */
const BASE_RATE_TEMPLATES = [

  function screening() {
    const conditions = ['a rare liver disorder', 'early-stage retinal degeneration',
                        'a genetic clotting defect', 'silent thyroid dysfunction'];
    const prevPct = pick([0.1, 0.2, 0.5, 1, 2, 4]);
    const sens = randInt(88, 99);
    const spec = randInt(85, 98);
    const N = 100000;

    const ill = N * prevPct / 100;
    const tp = ill * sens / 100;
    const well = N - ill;
    const fp = well * (100 - spec) / 100;
    const answer = 100 * tp / (tp + fp);

    return {
      prompt: 'In a large population, ' + prevPct + '% of people have ' + pick(conditions) +
              '. A screening test detects the condition in ' + sens +
              '% of people who have it, and correctly returns a negative result for ' + spec +
              '% of people who do not.\n\nA randomly selected person tests positive. What is the probability that they actually have the condition?',
      answer: answer,
      steps: [
        'Take ' + fmt(N) + ' people. ' + prevPct + '% have it, so ' + fmt(ill) + ' are ill and ' + fmt(well) + ' are well.',
        'True positives: ' + fmt(ill) + ' × ' + sens + '% = ' + fmt(tp) + '.',
        'False positives: ' + fmt(well) + ' × ' + (100 - spec) + '% = ' + fmt(fp) + '.',
        'Total positives: ' + fmt(tp) + ' + ' + fmt(fp) + ' = ' + fmt(tp + fp) + '.',
        'Probability of illness given a positive result: ' + fmt(tp) + ' / ' + fmt(tp + fp) + ' = ' + pctStr(answer) + '.',
        'The false positives come from a much larger group, which is why the answer is lower than the test accuracy suggests.'
      ]
    };
  },

  function cabs() {
    const cityName = pick(['Ardwick', 'Selby', 'Norhaven', 'Castleton', 'Redmoor']);
    const minorityPct = pick([10, 15, 20, 25, 30]);
    const accuracy = randInt(70, 90);
    const colours = pick([['blue', 'green'], ['blue', 'black'], ['white', 'yellow']]);
    const [minor, major] = colours;

    const N = 1000;
    const minorCabs = N * minorityPct / 100;
    const majorCabs = N - minorCabs;
    const trueId = minorCabs * accuracy / 100;
    const falseId = majorCabs * (100 - accuracy) / 100;
    const answer = 100 * trueId / (trueId + falseId);

    return {
      prompt: 'In ' + cityName + ', ' + minorityPct + '% of taxis are ' + minor + ' and the rest are ' + major +
              '. A taxi was involved in a hit-and-run at night. A witness identified it as ' + minor +
              '. Under the same conditions, this witness correctly identifies a cab’s colour ' + accuracy +
              '% of the time.\n\nWhat is the probability that the cab really was ' + minor + '?',
      answer: answer,
      steps: [
        'Take ' + fmt(N) + ' cabs: ' + fmt(minorCabs) + ' ' + minor + ', ' + fmt(majorCabs) + ' ' + major + '.',
        'Of the ' + minor + ' cabs, the witness calls ' + accuracy + '% correctly: ' + fmt(trueId) + '.',
        'Of the ' + major + ' cabs, the witness wrongly says ' + minor + ' ' + (100 - accuracy) + '% of the time: ' + fmt(falseId) + '.',
        'Total "' + minor + '" identifications: ' + fmt(trueId + falseId) + '.',
        'Probability it truly was ' + minor + ': ' + fmt(trueId) + ' / ' + fmt(trueId + falseId) + ' = ' + pctStr(answer) + '.',
        'The witness accuracy feels decisive, but the base rate of ' + minorityPct + '% is doing most of the work.'
      ]
    };
  },

  function factories() {
    const aShare = pick([20, 25, 30, 40, 60, 70, 75, 80]);
    const bShare = 100 - aShare;
    const aDefect = pick([1, 2, 3, 4, 5]);
    const bDefect = pick([6, 8, 10, 12, 15]);
    const N = 10000;

    const aUnits = N * aShare / 100, bUnits = N * bShare / 100;
    const aBad = aUnits * aDefect / 100, bBad = bUnits * bDefect / 100;
    const answer = 100 * aBad / (aBad + bBad);

    return {
      prompt: 'A factory runs two machines. Machine A produces ' + aShare + '% of all units and ' + aDefect +
              '% of its output is defective. Machine B produces the remaining ' + bShare + '% and ' + bDefect +
              '% of its output is defective.\n\nA unit is pulled from the warehouse and found to be defective. What is the probability it came from Machine A?',
      answer: answer,
      steps: [
        'Take ' + fmt(N) + ' units: ' + fmt(aUnits) + ' from A, ' + fmt(bUnits) + ' from B.',
        'Defective from A: ' + fmt(aUnits) + ' × ' + aDefect + '% = ' + fmt(aBad) + '.',
        'Defective from B: ' + fmt(bUnits) + ' × ' + bDefect + '% = ' + fmt(bBad) + '.',
        'Total defective: ' + fmt(aBad + bBad) + '.',
        'Probability it came from A: ' + fmt(aBad) + ' / ' + fmt(aBad + bBad) + ' = ' + pctStr(answer) + '.'
      ]
    };
  },

  function description() {
    const groups = pick([
      ['engineers', 'lawyers', 'enjoys solving puzzles alone at weekends'],
      ['librarians', 'sales representatives', 'is quiet, tidy, and dislikes crowds'],
      ['nurses', 'accountants', 'is patient and works well under pressure'],
      ['farmers', 'software developers', 'wakes early and prefers being outdoors']
    ]);
    const [gA, gB, trait] = groups;

    const nA = pick([30, 50, 100, 150, 200]);
    const nB = pick([500, 700, 850, 900]);
    const rateA = randInt(60, 90);
    const rateB = randInt(10, 35);

    const matchA = nA * rateA / 100;
    const matchB = nB * rateB / 100;
    const answer = 100 * matchA / (matchA + matchB);

    return {
      prompt: 'A study sampled ' + fmt(nA) + ' ' + gA + ' and ' + fmt(nB) + ' ' + gB +
              '. Of the ' + gA + ', ' + rateA + '% fit the description "' + trait + '". Of the ' + gB + ', ' + rateB + '% fit it.\n\n' +
              'One person is drawn at random from the whole sample and fits the description. What is the probability they are one of the ' + gA + '?',
      answer: answer,
      steps: [
        gA + ' fitting: ' + fmt(nA) + ' × ' + rateA + '% = ' + fmt(matchA) + '.',
        gB + ' fitting: ' + fmt(nB) + ' × ' + rateB + '% = ' + fmt(matchB) + '.',
        'Total fitting the description: ' + fmt(matchA + matchB) + '.',
        'Probability of being ' + gA.slice(0, -1) + ': ' + fmt(matchA) + ' / ' + fmt(matchA + matchB) + ' = ' + pctStr(answer) + '.',
        'The description is much more typical of ' + gA + ', but there are ' + Math.round(nB / nA) + ' times as many ' + gB + '.'
      ]
    };
  }
];

function nextBaseRate() {
  const item = pick(BASE_RATE_TEMPLATES)();
  session.scratch.baseItem = item;

  $('#base-prompt').textContent = item.prompt;
  $('#base-answer').value = '';
  $('#base-form').hidden = false;
  $('#base-reveal').hidden = true;
  $('#base-answer').focus();
}

$('#base-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!session.running) return;

  const item = session.scratch.baseItem;
  const given = parseMagnitude($('#base-answer').value);
  if (!isFinite(given)) return;

  // Generous but not meaningless: 2 percentage points, or 5% relative.
  const tolerance = Math.max(2, item.answer * 0.05);
  const ok = Math.abs(given - item.answer) <= tolerance;

  state.reasoning.baseRate.push({ ts: Date.now(), correct: ok, given: given, answer: item.answer });
  session.scratch.items += 1;
  save();

  const v = $('#base-verdict');
  v.className = 'verdict ' + (ok ? 'right' : 'wrong');
  v.textContent = ok ? 'Within tolerance. The answer is ' + pctStr(item.answer) + '.'
                     : 'You said ' + pctStr(given) + '. The answer is ' + pctStr(item.answer) + '.';

  $('#base-steps').innerHTML = item.steps.map(s => '<li>' + escapeHTML(s) + '</li>').join('');
  $('#base-form').hidden = true;
  $('#base-reveal').hidden = false;
  $('#btn-base-next').focus();
});

$('#btn-base-next').addEventListener('click', () => { if (session.running) nextBaseRate(); });

/* ═══════════════════════════════════════════════════════════════════════
   12.  POSITIONS
   ═══════════════════════════════════════════════════════════════════════ */

let editingPositionId = null;

$('#btn-pos-new').addEventListener('click', () => openPositionEditor(null));
$('#btn-pos-cancel').addEventListener('click', closePositionEditor);

function openPositionEditor(id) {
  editingPositionId = id;
  const editor = $('#pos-editor');
  editor.hidden = false;
  setText($('#pos-status'), '');

  if (id) {
    const p = state.positions.find(x => x.id === id);
    $('#pos-title').value = p.title;
    $('#pos-text').value = p.revisions[p.revisions.length - 1].text;
  } else {
    $('#pos-title').value = '';
    $('#pos-text').value = '';
  }
  $('#pos-title').focus();
  editor.scrollIntoView({ block: 'nearest' });
}

function closePositionEditor() {
  $('#pos-editor').hidden = true;
  editingPositionId = null;
}

$('#btn-pos-save').addEventListener('click', () => {
  const title = $('#pos-title').value.trim();
  const text = $('#pos-text').value.trim();

  if (!title || !text) { setText($('#pos-status'), 'Both a title and a position are needed.'); return; }

  if (editingPositionId) {
    const p = state.positions.find(x => x.id === editingPositionId);
    p.title = title;
    const last = p.revisions[p.revisions.length - 1];
    if (last.text !== text) p.revisions.push({ ts: Date.now(), text: text, origin: 'edit' });
  } else {
    state.positions.push({
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title,
      created: Date.now(),
      lastChallenged: 0,
      revisions: [{ ts: Date.now(), text: text, origin: 'original' }],
      challenges: []
    });
  }

  writeNow();
  closePositionEditor();
  renderPositions();
});

function renderPositions() {
  const list = $('#pos-list');
  list.innerHTML = '';

  if (!state.positions.length) {
    list.innerHTML = '<div class="plate plate-quiet"><p class="fineprint">' +
      'Nothing here yet. Every third argument day pulls one of these back out and makes you defend it, so it is worth writing one.' +
      '</p></div>';
    return;
  }

  state.positions
    .slice()
    .sort((a, b) => b.revisions[b.revisions.length - 1].ts - a.revisions[a.revisions.length - 1].ts)
    .forEach(p => list.appendChild(positionCard(p)));
}

function positionCard(p) {
  const latest = p.revisions[p.revisions.length - 1];
  const card = document.createElement('div');
  card.className = 'plate pos-card';

  const revWord = p.revisions.length === 1 ? 'original only' : (p.revisions.length - 1) + ' revision' + (p.revisions.length > 2 ? 's' : '');

  card.innerHTML =
    '<h3 class="pos-title"></h3>' +
    '<p class="pos-meta">' + escapeHTML(stamp(latest.ts)) + ' · ' + escapeHTML(revWord) + '</p>' +
    '<div class="pos-body"></div>' +
    '<div class="row">' +
      '<button class="btn btn-small" data-act="revise">Revise</button>' +
      '<button class="btn btn-small" data-act="challenge">Challenge this</button>' +
      '<button class="btn btn-small btn-danger" data-act="delete">Delete</button>' +
    '</div>' +
    '<p class="status" data-role="status" role="status" aria-live="polite"></p>' +
    '<div data-role="challenges"></div>';

  card.querySelector('.pos-title').textContent = p.title;
  card.querySelector('.pos-body').textContent = latest.text;

  if (p.revisions.length > 1) {
    const det = document.createElement('details');
    det.className = 'history';
    const sum = document.createElement('summary');
    sum.textContent = 'revision history';
    det.appendChild(sum);
    p.revisions.slice().reverse().forEach((r, i) => {
      const entry = document.createElement('div');
      entry.className = 'history-entry';
      const st = document.createElement('span');
      st.className = 'history-stamp';
      st.textContent = stamp(r.ts) + ' · ' + (r.origin || 'edit') +
                       (i === 0 ? ' · current' : '');
      entry.appendChild(st);
      entry.appendChild(document.createTextNode(r.text));
      det.appendChild(entry);
    });
    card.appendChild(det);
  }

  const chal = card.querySelector('[data-role="challenges"]');
  (p.challenges || []).slice().reverse().forEach(c => {
    const box = document.createElement('div');
    box.className = 'challenge';
    const st = document.createElement('span');
    st.className = 'history-stamp';
    st.textContent = 'counterargument · ' + stamp(c.ts);
    box.appendChild(st);
    box.appendChild(document.createTextNode(c.text));
    chal.appendChild(box);
  });

  card.querySelector('[data-act="revise"]').addEventListener('click', () => openPositionEditor(p.id));
  card.querySelector('[data-act="delete"]').addEventListener('click', () => {
    if (!confirm('Delete "' + p.title + '" and all its revisions?')) return;
    state.positions = state.positions.filter(x => x.id !== p.id);
    writeNow();
    renderPositions();
  });

  const chalBtn = card.querySelector('[data-act="challenge"]');
  const status = card.querySelector('[data-role="status"]');

  chalBtn.addEventListener('click', async () => {
    if (!hasKey()) {
      status.className = 'status err';
      status.textContent = 'This one needs an API key. Add it under settings.';
      return;
    }
    chalBtn.disabled = true;
    status.className = 'status';
    status.textContent = 'Building the counterargument…';
    try {
      const text = await callClaude(
        CHALLENGE_SYSTEM_PROMPT,
        [{ role: 'user', content: 'MY POSITION, titled "' + p.title + '":\n\n' + latest.text +
                                  '\n\nMake the strongest case against it.' }],
        700
      );
      p.challenges = p.challenges || [];
      p.challenges.push({ ts: Date.now(), text: text, againstRevision: p.revisions.length - 1 });
      p.lastChallenged = Date.now();
      writeNow();
      renderPositions();
    } catch (err) {
      status.className = 'status err';
      status.textContent = 'Could not reach the API: ' + err.message;
      chalBtn.disabled = false;
    }
  });

  return card;
}

/* ═══════════════════════════════════════════════════════════════════════
   13.  METRICS

   Only two things are surfaced: how long you can hold a session, and how
   well calibrated you are. No streaks, no totals to protect.
   ═══════════════════════════════════════════════════════════════════════ */

function renderMetrics() {
  renderLengthChart();
  renderCalibration();
  renderMathStats();
}

function svgWrap(inner, w, h) {
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img">' + inner + '</svg>';
}

function renderLengthChart() {
  const done = state.sessions.filter(s => s.completed);
  const host = $('#chart-length');

  if (done.length < 2) {
    host.innerHTML = '<p class="chart-empty">Two completed sessions will draw this.</p>';
    setText($('#metrics-length-note'), '');
    return;
  }

  const W = 300, H = 120, padL = 26, padB = 18, padT = 8, padR = 6;
  const vals = done.map(s => s.actualS / 60);
  const maxV = Math.max.apply(null, vals.concat([10]));
  const x = i => padL + (W - padL - padR) * (done.length === 1 ? 0.5 : i / (done.length - 1));
  const y = v => padT + (H - padT - padB) * (1 - v / maxV);

  const path = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const dots = vals.map((v, i) => '<circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="1.8"/>').join('');

  const inner =
    '<line class="axis" x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '"/>' +
    '<line class="axis" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '"/>' +
    '<text class="tick" x="2" y="' + (padT + 4) + '">' + Math.round(maxV) + 'm</text>' +
    '<text class="tick" x="2" y="' + (H - padB) + '">0</text>' +
    '<path class="series" d="' + path + '"/>' + dots;

  host.innerHTML = svgWrap(inner, W, H);
  setText($('#metrics-length-note'),
    done.length + ' completed sessions. Current length ' + mmss(sessionLength()) +
    '; the cap is ' + mmss(MAX_LENGTH) + '.');
}

function renderCalibration() {
  const cal = state.reasoning.calibration;

  if (!cal.length) {
    setText($('#brier-score'), '—');
    $('#chart-calibration').innerHTML = '<p class="chart-empty">No calibration answers yet.</p>';
    $('#cal-table').innerHTML = '';
    return;
  }

  const meanBrier = cal.reduce((a, c) => a + c.brier, 0) / cal.length;
  setText($('#brier-score'), meanBrier.toFixed(3));

  const levels = [50, 60, 70, 80, 90, 95];
  const buckets = levels.map(L => {
    const rows = cal.filter(c => c.conf === L);
    return { conf: L, n: rows.length, hit: rows.length ? rows.filter(c => c.correct).length / rows.length : null };
  });

  const W = 300, H = 200, pad = 30;
  const px = p => pad + (W - pad * 2) * ((p - 50) / 50);
  const py = p => (H - pad) - (H - pad * 2) * ((p - 50) / 50);

  let inner =
    '<line class="axis" x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '"/>' +
    '<line class="axis" x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '"/>' +
    '<line class="ideal" x1="' + px(50) + '" y1="' + py(50) + '" x2="' + px(100) + '" y2="' + py(100) + '"/>' +
    '<text class="tick" x="' + pad + '" y="' + (H - pad + 12) + '">50%</text>' +
    '<text class="tick" x="' + (W - pad - 14) + '" y="' + (H - pad + 12) + '">100%</text>' +
    '<text class="tick" x="4" y="' + (H - pad) + '">50%</text>' +
    '<text class="tick" x="4" y="' + (pad + 4) + '">100%</text>';

  const plotted = buckets.filter(b => b.n > 0);
  if (plotted.length > 1) {
    inner += '<path class="series" d="' +
      plotted.map((b, i) => (i ? 'L' : 'M') + px(b.conf).toFixed(1) + ' ' + py(b.hit * 100).toFixed(1)).join(' ') +
      '"/>';
  }
  plotted.forEach(b => {
    inner += '<circle class="dot" cx="' + px(b.conf).toFixed(1) + '" cy="' + py(b.hit * 100).toFixed(1) + '" r="2.5"/>';
  });

  $('#chart-calibration').innerHTML = svgWrap(inner, W, H);

  $('#cal-table').innerHTML =
    '<thead><tr><th>said</th><th>n</th><th>correct</th><th>gap</th></tr></thead><tbody>' +
    buckets.map(b => {
      if (!b.n) return '<tr><td>' + b.conf + '%</td><td>0</td><td>&mdash;</td><td>&mdash;</td></tr>';
      const hit = b.hit * 100;
      const gap = hit - b.conf;
      return '<tr><td>' + b.conf + '%</td><td>' + b.n + '</td><td>' + hit.toFixed(0) + '%</td><td>' +
             (gap > 0 ? '+' : '') + gap.toFixed(0) + '</td></tr>';
    }).join('') + '</tbody>';
}

function renderMathStats() {
  const h = state.math.history;
  const rows = [['current level', String(state.math.level)]];

  if (h.length) {
    const recent = h.slice(-50);
    const acc = Math.round(100 * recent.filter(r => r.correct).length / recent.length);
    const times = recent.map(r => r.ms).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] / 1000;
    rows.push(['problems answered', String(h.length)]);
    rows.push(['last 50 accuracy', acc + '%']);
    rows.push(['median time', median.toFixed(1) + 's']);
  } else {
    rows.push(['problems answered', '0']);
  }

  $('#math-stats').innerHTML = rows
    .map(([k, v]) => '<div><dt>' + escapeHTML(k) + '</dt><dd>' + escapeHTML(v) + '</dd></div>')
    .join('');
}

/* ═══════════════════════════════════════════════════════════════════════
   14.  SETTINGS, EXPORT, IMPORT
   ═══════════════════════════════════════════════════════════════════════ */

function renderSettings() {
  $('#set-key').value = state.settings.apiKey || '';
  $('#set-model').value = state.settings.model || DEFAULT_MODEL;
  setText($('#set-status'), '');
  setText($('#data-status'), '');
}

$('#btn-set-save').addEventListener('click', () => {
  state.settings.apiKey = $('#set-key').value.trim();
  state.settings.model = $('#set-model').value.trim() || DEFAULT_MODEL;
  writeNow();
  const s = $('#set-status');
  s.className = 'status';
  s.textContent = state.settings.apiKey ? 'Saved. Live interrogation is on.' : 'Saved. Running on the bundled questions.';
});

$('#btn-set-test').addEventListener('click', async () => {
  const s = $('#set-status');
  state.settings.apiKey = $('#set-key').value.trim();
  state.settings.model = $('#set-model').value.trim() || DEFAULT_MODEL;
  writeNow();

  if (!hasKey()) { s.className = 'status err'; s.textContent = 'No key entered.'; return; }

  s.className = 'status';
  s.textContent = 'Testing…';
  try {
    await callClaude('Reply with the single word: ready.', [{ role: 'user', content: 'ping' }], 16);
    s.className = 'status';
    s.textContent = 'Connected using ' + state.settings.model + '.';
  } catch (err) {
    s.className = 'status err';
    s.textContent = 'Failed: ' + err.message;
  }
});

$('#btn-export').addEventListener('click', () => {
  writeNow();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  a.href = url;
  a.download = 'thinking-app-' + iso + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const s = $('#data-status');
  s.className = 'status';
  s.textContent = 'Exported.';
});

$('#btn-import').addEventListener('click', () => $('#file-import').click());

$('#file-import').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  const s = $('#data-status');
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !('cycleIndex' in parsed)) {
      throw new Error('that does not look like a thinking-app export');
    }
    if (!confirm('Replace everything in this browser with the contents of this file?')) {
      e.target.value = '';
      return;
    }
    state = migrate(parsed);
    writeNow();
    s.className = 'status';
    s.textContent = 'Imported. ' + state.sessions.length + ' sessions, ' + state.positions.length + ' positions.';
    renderSettings();
  } catch (err) {
    s.className = 'status err';
    s.textContent = 'Import failed: ' + err.message;
  }
  e.target.value = '';
});

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Erase every session, position and setting in this browser?')) return;
  if (!confirm('Last check. This cannot be undone. Erase everything?')) return;
  localStorage.removeItem(STORE_KEY);
  state = blankState();
  writeNow();
  go('home');
});

/* ═══════════════════════════════════════════════════════════════════════
   15.  HOME AND BOOT
   ═══════════════════════════════════════════════════════════════════════ */

function renderHome() {
  const type = todayType();
  setText($('#home-cycle'), 'cycle ' + (state.cycleIndex + 1));
  setText($('#home-type'), type);
  setText($('#home-blurb'), BLURB[type]);
  setText($('#home-duration'), mmss(sessionLength()));
  setText($('#home-completed'), String(state.completedSessions));

  const toRamp = RAMP_EVERY - (state.completedSessions % RAMP_EVERY);
  setText($('#home-ramp'),
    sessionLength() >= MAX_LENGTH ? 'at the cap' : toRamp + ' session' + (toRamp === 1 ? '' : 's'));

  const notes = [];
  if (type === 'argument') {
    if ((state.argument.days + 1) % 3 === 0 && state.positions.length) {
      notes.push('One of your own positions comes back today.');
    }
    notes.push(hasKey() ? 'Live interrogation is on.' : 'No API key: bundled questions only.');
  }
  if (type === 'reasoning') {
    notes.push('Sub-mode: ' + SUB_MODES[state.reasoning.subIndex % SUB_MODES.length] + '.');
  }
  if (type === 'math') {
    notes.push('Starting at level ' + state.math.level + '. No network needed.');
  }
  setText($('#home-note'), notes.join(' '));

  const recent = state.sessions.slice(-8).reverse();
  $('#home-recent').hidden = recent.length === 0;
  $('#home-log').innerHTML = recent.map(s =>
    '<li><span>' + escapeHTML(stamp(s.ts)) + ' · ' + escapeHTML(s.type) + '</span>' +
    '<span>' + escapeHTML(s.completed ? mmss(s.actualS) : 'abandoned') + '</span></li>'
  ).join('');
}

/* Warm the caches so an offline argument day still has something to read. */
function prefetchData() {
  loadCorpus().catch(() => {});
  loadReasoning().catch(() => {});
}

function boot() {
  load();
  go('home');
  prefetchData();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('sw registration failed', err));
    });
  }
}

boot();
