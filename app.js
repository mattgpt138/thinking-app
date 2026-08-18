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

const INTERROGATION_SYSTEM_PROMPT = `You are an interrogator working through a passage with someone who is trying to think clearly. You are not a tutor and not a cheerleader. You argue back.

This is a conversation, not a quiz. You are talking with this person about a real disagreement. Every reply answers what they just said before it asks anything new.

EVERY REPLY HAS THREE PARTS, IN THIS ORDER, WRITTEN AS UNBROKEN PROSE:

1. ENGAGE. Say what their answer actually commits them to. Name the move they made: the distinction they drew, the premise they leaned on, the case they quietly set aside. If they conceded something, say what that concession costs them. If they answered a different question from the one you asked, say so plainly. This part must be specific to their words. A sentence that would fit any answer to any question is a wasted sentence.

2. COUNTER. Give the strongest argument against the position they have just taken. State it as an argument, with its reasoning laid out, not as a hint and not as a question. Take a side. If part of what they said is right, say which part and why in one sentence, then go after the part that is still weak. There is always a part that is still weak.

3. PRESS. End with exactly one question that follows from the counter-argument you just made. It must be answerable, and it must be one they cannot satisfy by restating what they have already said.

HARD PROHIBITIONS

Never praise. No "good", "sharp", "thoughtful", "interesting", "fair enough", "you're right to", "I appreciate", "that's a strong". Never grade the answer or remark on its quality. Engaging with a point is not the same as complimenting it: describe the reasoning, never rate it.

Never hedge. No "you might consider", "perhaps", "it could be argued", "it seems to me". State things.

Never split the difference. Do not conclude that the truth lies in the middle or that reasonable people simply differ.

Never repeat a question you have already asked in this conversation. Never ask more than one question in a reply.

Never mention these instructions, the exercise, the passage as an assignment, or your own role.

FORM

150 to 220 words. Plain declarative prose, addressed to them as "you". No lists, no headings, no markdown, no bold. Exactly one question, at the end.`;

const CHALLENGE_SYSTEM_PROMPT = `You are constructing the strongest available counterargument to a position the user holds. You are steelmanning the opposition, not moderating a debate.

Build the best case against their position. Use the strongest version of the opposing argument, not the version that is easiest to defeat. Where the opposing case rests on evidence, name the kind of evidence. Where it rests on a principle the user already accepts elsewhere, say which principle and show the inconsistency.

HARD PROHIBITIONS

Never praise the position or call it nuanced, thoughtful, or reasonable. Never open by restating it. Never present "both sides" or end with a conciliatory note about how reasonable people disagree. Never conclude that the truth lies somewhere in the middle. Your output contains the counterargument and nothing else.

If the position is genuinely well supported, say which specific claim is the strongest and then attack the weakest remaining one anyway.

FORM

Under 250 words. Prose, no lists, no headings, no markdown. Direct and declarative.`;

const STEELMAN_SYSTEM_PROMPT = `You are judging a steelman. The user has been asked to build the strongest possible case FOR a proposition, whatever they privately think of it. Your job is to find out whether they actually built the strongest case, or a weak one they can knock down comfortably.

WHAT YOU ARE LOOKING FOR

A real steelman does four things. Check each:
1. It rests on premises the other side actually holds, not on ones that are easy to attack.
2. It anticipates the obvious objection and answers it inside the argument.
3. It gives the argument its best empirical footing, naming the evidence a serious defender would cite.
4. It would be recognised by an intelligent defender of the position as their own view.

A weak steelman fails by: arguing from a caricature, choosing the version convenient to refute, conceding the strongest ground before starting, hedging so much it commits to nothing, or slipping into arguing against the proposition halfway through.

EVERY REPLY HAS THREE PARTS, AS UNBROKEN PROSE:

1. DIAGNOSE. Say which of those four the case does and does not do, pointing at what they actually wrote. If they built a caricature, name the caricature. If they conceded ground a real defender would hold, name the ground.

2. SUPPLY. Give the stronger version of the argument they did not make. This is the substance of your reply. Make it genuinely strong: the argument a thoughtful defender would actually give, with its reasoning laid out. If their case was already strong, say which move was the strong one and then supply the further move they stopped short of.

3. PRESS. End with exactly one question that makes them either strengthen the case further or say plainly what still defeats it.

HARD PROHIBITIONS

Never praise. No "good", "strong effort", "you've captured", "nicely put", "I appreciate". Never grade the attempt or score it out of anything. Describe what the argument does; never rate it.

Never reveal or argue your own view of the proposition. You are testing the construction, not the conclusion.

Never let them off with "of course, opponents would say". Building the case means committing to it.

Never hedge, never split the difference, never write a list, never use markdown or headings.

FORM

180 to 260 words. Plain declarative prose, second person. Exactly one question, at the end.`;

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

const STEELMAN_FALLBACK_PRESSES = [
  'Name the single strongest objection to the case you just built. Now answer it from inside the case, not from outside it.',
  'Would someone who actually holds this position recognise your version as theirs? Point to the sentence they would refuse.',
  'You have argued from principle. Now give the case its best empirical footing: what evidence would a serious defender cite?',
  'Where did you concede ground that a real defender would have held? Take it back and rebuild that part.',
  'Strip out every hedge you wrote. What is left, stated flatly? If it is weaker than you thought, say so.',
  'What is the best version of this argument that does NOT rely on the premise you leaned on hardest?',
  'You are meant to be building, not judging. Find the sentence where you slipped into arguing against it, and replace it.',
  'Give the argument a case it handles well that you did not mention. Then give it the case it handles worst.'
];

const STORE_KEY   = 'thinking-app:v1';
const TYPES       = ['argument', 'logic', 'steelman', 'math', 'causal', 'numbers', 'calibration'];
const BASE_LENGTH = 600;    // seconds
const RAMP_EVERY  = 6;      // completed sessions per increment
const RAMP_STEP   = 60;     // seconds added per increment
const MAX_LENGTH  = 2400;   // seconds
const READOUT_AT  = 60;     // reveal the numeric readout at this many seconds left
const ARC_LENGTH  = 2 * Math.PI * 54;
const API_TIMEOUT = 25000;  // ms; a session never waits longer than this

const DEFAULT_MODEL = 'claude-sonnet-5';

const BLURB = {
  argument:    'Read one passage closely. Then answer for it. The questions are not comprehension checks; they are attempts to find where your reading gives way.',
  logic:       'Formal validity, stripped of content. Does the conclusion follow? Generated fresh each time, so none of it can be memorised.',
  steelman:    'Build the strongest case for a position, whatever you privately think of it. Then find out whether you built the strong version or the convenient one.',
  math:        'Arithmetic in your head. No paper, no calculator. The difficulty tracks you, so a run of errors is information, not failure.',
  causal:      'Correlation, confounding, selection, and what would actually settle it. Every scenario is generated, so the numbers are never the same twice.',
  numbers:     'Quantities in the wild: risk, denominators, averages, base rates, and estimation from nothing.',
  calibration: 'A statement, true or false, and how sure you are. The point is not to be right. It is to know how right you are.'
};

const CONF_LEVELS = [50, 60, 70, 80, 90, 95];

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
    logic: { level: 2, history: [] },
    causal: { history: [] },
    numbers: { history: [], fermiSeen: [] },
    steelman: { seen: [], days: 0 },
    // One calibration log fed by three sources: the trivia bank, the logic
    // drills and the causal problems. Entries carry `source` so the record
    // screen can show the combined curve and break it down.
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
  out.logic     = Object.assign(base.logic,     s.logic     || {});
  out.causal    = Object.assign(base.causal,    s.causal    || {});
  out.numbers   = Object.assign(base.numbers,   s.numbers   || {});
  out.steelman  = Object.assign(base.steelman,  s.steelman  || {});
  out.reasoning = Object.assign(base.reasoning, s.reasoning || {});
  out.settings  = Object.assign(base.settings,  s.settings  || {});
  if (!Array.isArray(out.sessions)) out.sessions = [];
  if (!Array.isArray(out.positions)) out.positions = [];
  if (!Array.isArray(out.argument.seen)) out.argument.seen = [];
  if (!Array.isArray(out.math.history)) out.math.history = [];
  if (!Array.isArray(out.logic.history)) out.logic.history = [];
  if (!Array.isArray(out.causal.history)) out.causal.history = [];
  if (!Array.isArray(out.numbers.history)) out.numbers.history = [];
  if (!Array.isArray(out.numbers.fermiSeen)) out.numbers.fermiSeen = [];
  if (!Array.isArray(out.steelman.seen)) out.steelman.seen = [];
  if (!Array.isArray(out.reasoning.calibration)) out.reasoning.calibration = [];
  if (!Array.isArray(out.reasoning.fermiSeen)) out.reasoning.fermiSeen = [];
  if (!Array.isArray(out.reasoning.baseRate)) out.reasoning.baseRate = [];

  // Older files kept Fermi progress under reasoning; it now lives on numbers day.
  if (out.reasoning.fermiSeen.length && !out.numbers.fermiSeen.length) {
    out.numbers.fermiSeen = out.reasoning.fermiSeen.slice();
  }
  // Calibration entries written before sources existed came from the trivia bank.
  out.reasoning.calibration.forEach(c => { if (!c.source) c.source = 'trivia'; });
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
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

/* Full stamp, for the one place a time of day is worth showing. */
function stampLong(ts) {
  const d = new Date(ts);
  return stamp(ts) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

const VIEWS = ['home', 'session', 'end', 'review', 'detail', 'positions', 'metrics', 'settings'];
let currentView = 'home';

function go(view) {
  if (currentView === 'session' && view !== 'session' && session.running) {
    if (session.timeUp) {
      endSession();               // the time was served; navigating away closes it properly
      if (view === 'end') return; // endSession already routed there
    } else {
      if (!confirm('A session is running. Leaving abandons it. Anything you have written is kept. Continue?')) return;
      abandonSession();
    }
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
  if (view === 'review')    renderReview();
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

/* Build a real alternating conversation from a transcript, rather than
   flattening it into one block of text. The model sees its own previous
   replies as its own turns, which is what makes the exchange read as a
   conversation instead of a series of unrelated questions. */
function threadMessages(passage, transcript) {
  const msgs = [];
  const t = transcript || [];

  const attrib0 = passage
    ? passage.author + ', ' + passage.work + ', ' + passage.year
    : 'the passage';
  const body0 = passage && passage.text
    ? passage.text.replace(/<\/?em>/g, '')
    : '(passage text unavailable)';

  // Nothing written yet: open the interrogation on the passage itself.
  if (!t.length) {
    return [{
      role: 'user',
      content: 'PASSAGE (' + attrib0 + '):\n\n' + body0 +
               '\n\nI have read this and have not committed to anything yet. Put the hardest question in it to me. ' +
               'For this opening turn only, skip the engage and counter steps and give the question alone, ' +
               'with one sentence saying what makes that the load-bearing point.'
    }];
  }

  const attrib = passage
    ? passage.author + ', ' + passage.work + ', ' + passage.year
    : 'the passage';
  const body = passage && passage.text
    ? passage.text.replace(/<\/?em>/g, '')
    : '(passage text unavailable)';

  // The opening turn carries the passage and the first question, which came
  // from the bundled set rather than from the model.
  msgs.push({
    role: 'user',
    content: 'We are working through this passage.\n\nPASSAGE (' + attrib + '):\n\n' + body +
             '\n\nTHE QUESTION PUT TO ME:\n' + transcript[0].question +
             '\n\nMY ANSWER:\n' + transcript[0].answer
  });

  for (let i = 1; i < transcript.length; i++) {
    msgs.push({ role: 'assistant', content: transcript[i].question });
    msgs.push({ role: 'user', content: transcript[i].answer });
  }
  return msgs;
}

/* ═══════════════════════════════════════════════════════════════════════
   7.  TIMER

   The numeric readout stays hidden until the final minute. A thin arc
   fills instead. This is the point of the app, not an oversight.

   The limit is SOFT. When time runs out the arc completes and the app says
   so once, quietly. It does not close the session, interrupt you, or touch
   what you are typing. You finish the thought you are in, then close the
   session yourself. Once the time has elapsed the session counts as
   completed, however long you carry on writing past it.
   ═══════════════════════════════════════════════════════════════════════ */

const timer = {
  total: 0,
  endAt: 0,
  handle: null,
  announced: false,
  elapsed: false,

  start(seconds, onElapsed) {
    this.total = seconds;
    this.endAt = Date.now() + seconds * 1000;
    this.onElapsed = onElapsed;
    this.announced = false;
    this.elapsed = false;
    $('#timer').classList.remove('final', 'elapsed');
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

    if (left <= READOUT_AT && !this.elapsed) {
      const readout = $('#timer-readout');
      readout.hidden = false;
      readout.textContent = String(Math.ceil(left));
      $('#timer').classList.add('final');
      if (!this.announced) {
        this.announced = true;
        setText($('#timer-sr'), 'One minute remaining.');
      }
    }

    if (left <= 0 && !this.elapsed) {
      this.elapsed = true;
      this.stop();                        // the arc is full; nothing left to count
      $('#timer').classList.remove('final');
      $('#timer').classList.add('elapsed');
      $('#timer-readout').hidden = true;
      setText($('#timer-label'), 'time');
      setText($('#timer-sr'), 'Time is up. Finish what you are writing, then close the session.');
      if (this.onElapsed) this.onElapsed();
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
  timeUp: false,
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
  const DRILL_DAYS = ['logic', 'causal', 'numbers', 'calibration'];
  $('#stage-argument').hidden = type !== 'argument';
  $('#stage-math').hidden     = type !== 'math';
  $('#stage-steelman').hidden = type !== 'steelman';
  $('#stage-drill').hidden    = DRILL_DAYS.indexOf(type) === -1;

  session.timeUp = false;
  $('#time-up-note').hidden = true;
  updateFootButton();

  go('session');
  timer.start(session.planned, onTimeElapsed);

  if (type === 'argument') await startArgument();
  else if (type === 'math') startMath();
  else if (type === 'steelman') await startSteelman();
  else await startDrill(type);
}

/* Time is up. Change nothing the user is touching: no modal, no focus
   change, no clearing of the box they are typing in. Just mark the session
   as complete-able and swap the foot button. */
function onTimeElapsed() {
  session.timeUp = true;
  $('#time-up-note').hidden = false;
  updateFootButton();
}

function updateFootButton() {
  const btn = $('#btn-close');
  if (session.timeUp) {
    btn.textContent = 'Close session';
    btn.className = 'btn btn-primary';
  } else {
    btn.textContent = 'Abandon session';
    btn.className = 'btn btn-ghost btn-small';
  }
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
    const p = session.scratch.passage;
    record.passageId = p ? p.id : null;
    // Snapshot the attribution so a review still reads correctly even if the
    // corpus is edited later and the id no longer resolves.
    if (p) record.passage = { id: p.id, author: p.author, work: p.work, year: p.year, source_url: p.source_url };
    record.transcript = session.transcript;
    state.argument.days += 1;
  }
  if (session.type === 'math') {
    record.attempted = session.scratch.attempted || 0;
    record.correct = session.scratch.correct || 0;
    record.endLevel = state.math.level;
  }
  if (session.type === 'steelman') {
    record.proposition = session.scratch.prop ? session.scratch.prop.proposition : null;
    record.transcript = session.transcript;
    state.steelman.days += 1;
  }
  if (['logic', 'causal', 'numbers', 'calibration'].indexOf(session.type) !== -1) {
    record.attempted = session.scratch.items || 0;
    record.correct = session.scratch.correct || 0;
    if (session.type === 'logic') record.endLevel = state.logic.level;
    if (session.transcript.length) record.transcript = session.transcript;
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

  const record = {
    ts: session.startedAt,
    type: session.type,
    plannedS: session.planned,
    actualS: Math.round((Date.now() - session.startedAt) / 1000),
    completed: false
  };

  // An abandoned session still keeps whatever was written. It does not count
  // towards the rotation, but the work is never thrown away.
  if (session.type === 'argument') {
    const p = session.scratch.passage;
    record.passageId = p ? p.id : null;
    if (p) record.passage = { id: p.id, author: p.author, work: p.work, year: p.year, source_url: p.source_url };
    record.transcript = session.transcript;
  }
  if (session.type === 'math' || ['logic','causal','numbers','calibration'].indexOf(session.type) !== -1) {
    record.attempted = session.scratch.attempted || session.scratch.items || 0;
    record.correct = session.scratch.correct || 0;
    if (session.type === 'math') record.endLevel = state.math.level;
    if (session.type === 'logic') record.endLevel = state.logic.level;
  }
  if (session.type === 'steelman') {
    record.proposition = session.scratch.prop ? session.scratch.prop.proposition : null;
  }
  if (session.transcript.length) record.transcript = session.transcript;

  state.sessions.push(record);
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
  if (['logic','causal','numbers','calibration'].indexOf(record.type) !== -1) {
    const pct = record.attempted ? Math.round(100 * record.correct / record.attempted) : 0;
    rows.push(['answered', String(record.attempted || 0)]);
    rows.push(['correct', (record.correct || 0) + ' (' + pct + '%)']);
    if (record.endLevel) rows.push(['level', String(record.endLevel)]);
  }
  if (record.type === 'argument' || record.type === 'steelman') {
    rows.push(['responses', String((record.transcript || []).filter(t => t.answer).length)]);
  }
  rows.push(['next up', TYPES[state.cycleIndex % TYPES.length]]);

  $('#end-stats').innerHTML = rows
    .map(([k, v]) => '<div><dt>' + escapeHTML(k) + '</dt><dd>' + escapeHTML(v) + '</dd></div>')
    .join('');

  // Offer the way back into what was just written, at the one moment it is
  // most obviously wanted.
  const btn = $('#btn-end-review');
  btn.hidden = !(record.transcript && record.transcript.length);
  btn.onclick = () => openSessionDetail(record.ts);

  go('end');
}

/* One button, two meanings. Before the time is up it abandons; after, it
   closes a session that has already earned its place in the rotation. */
$('#btn-close').addEventListener('click', () => {
  if (session.timeUp) { endSession(); return; }
  if (!confirm('Abandon this session? It will not count and the rotation will not advance. Anything you have written is kept.')) return;
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

  // The bundled questions are the opening move and the safety net. With a
  // key, the conversation itself carries the session; these are what it
  // falls back to when the network is not there.
  session.scratch.pool = p.questions.map((q, i) => ({ kind: 'bundled', text: q, n: i + 1 }));
  session.scratch.poolAt = 0;
  session.scratch.presses = 0;

  const isThirdDay = (state.argument.days + 1) % 3 === 0;
  const position = pickPositionForChallenge();
  session.scratch.pendingPosition = null;
  if (isThirdDay && position) {
    const latest = position.revisions[position.revisions.length - 1];
    session.scratch.pendingPosition = {
      kind: 'position',
      positionId: position.id,
      text: 'Here is what you wrote, under the title "' + position.title + '":\n\n“' +
            latest.text.trim() + '”\n\nThis passage bears on it. Revise or defend.'
    };
  }

  session.scratch.current = session.scratch.pool[0] || null;
  session.scratch.poolAt = 1;

  $('#arg-read').hidden = false;
  $('#arg-work').hidden = true;
}

/* Next item from the bundled pool, then from the generic press bank. */
function nextOfflineItem() {
  if (session.scratch.poolAt < session.scratch.pool.length) {
    return session.scratch.pool[session.scratch.poolAt++];
  }
  const used = session.scratch.presses || 0;
  session.scratch.presses = used + 1;
  return { kind: 'press', text: FALLBACK_PRESSES[used % FALLBACK_PRESSES.length] };
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
  const q = session.scratch.current;
  if (!q) { session.scratch.current = nextOfflineItem(); return showArgQuestion(); }

  const label = q.kind === 'bundled'  ? 'question ' + (q.n || 1)
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

$('#btn-arg-submit').addEventListener('click', async () => {
  const q = session.scratch.current;
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

  let next = null;

  // The position challenge takes priority once one exchange has happened, so
  // it is never crowded out by a conversation that could run all session.
  if (session.scratch.pendingPosition && session.transcript.length >= 2) {
    next = session.scratch.pendingPosition;
    session.scratch.pendingPosition = null;
  }

  // Otherwise carry the conversation on. Every answer gets answered: this is
  // a dialogue, not a list of questions read out in order.
  if (!next && hasKey()) {
    $('#btn-arg-submit').disabled = true;
    ta.disabled = true;
    setText($('#arg-status'), 'Reading what you wrote…');
    try {
      next = {
        kind: 'live',
        text: await callClaude(
          INTERROGATION_SYSTEM_PROMPT,
          threadMessages(session.scratch.passage, session.transcript),
          700
        )
      };
    } catch (err) {
      console.warn('interrogation unavailable, falling back', err);
      notice = 'No live interrogation right now. Falling back to the bundled questions.';
    }
  }

  if (!next) next = nextOfflineItem();

  session.scratch.current = next;
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
   10b.  LOGIC DAY

   Formal validity with the content stripped out. Everything is generated
   from random subject terms, so the same form never arrives wearing the
   same clothes twice. All of it is objectively scorable and none of it
   touches the network.

   Every generator returns a drill item:
     { prompt, kind:'choice', options:[…], answer:<index>, explain, label }
   ═══════════════════════════════════════════════════════════════════════ */

/* Content pools. Deliberately mundane: the point is that the content must
   not help you. Where a syllogism could be judged by plausibility rather
   than by form, the exercise has failed. */
const LOGIC_NOUNS = [
  ['gardeners', 'a gardener'], ['cyclists', 'a cyclist'], ['bakers', 'a baker'],
  ['sailors', 'a sailor'], ['archivists', 'an archivist'], ['welders', 'a welder'],
  ['botanists', 'a botanist'], ['printers', 'a printer'], ['glaziers', 'a glazier'],
  ['surveyors', 'a surveyor'], ['tanners', 'a tanner'], ['coopers', 'a cooper'],
  ['chandlers', 'a chandler'], ['drovers', 'a drover'], ['weavers', 'a weaver']
];
/* Each predicate carries both forms: third-person singular for "it/someone
   ...", and the base form for "all X ...", "they ...", and negations. Getting
   this wrong would make the drills read as errors rather than as logic. */
const LOGIC_PROPS = [
  ['keeps a logbook', 'keep a logbook'],
  ['owns a barometer', 'own a barometer'],
  ['works before dawn', 'work before dawn'],
  ['belongs to the guild', 'belong to the guild'],
  ['carries a whistle', 'carry a whistle'],
  ['reads the tide tables', 'read the tide tables'],
  ['wears a leather apron', 'wear a leather apron'],
  ['pays the levy', 'pay the levy'],
  ['holds a river licence', 'hold a river licence'],
  ['attends the winter meeting', 'attend the winter meeting'],
  ['keeps bees', 'keep bees'],
  ['signs the register', 'sign the register']
];
const LOGIC_THINGS = [
  'the Kestrel', 'the Marlow', 'the Thornbury', 'the Ashgrove', 'the Petrel',
  'the Redwing', 'the Halyard', 'the Corbel'
];

function pickPair(arr) {
  const a = randInt(0, arr.length - 1);
  let b = randInt(0, arr.length - 1);
  while (b === a) b = randInt(0, arr.length - 1);
  return [arr[a], arr[b]];
}

const LOGIC_LEVELS = {

  /* 1 — the four conditional forms. Two valid, two not. */
  1: () => {
    const [p, q] = pickPair(LOGIC_PROPS);
    const name = pick(LOGIC_THINGS);
    const forms = [
      { second: 'It ' + p[0] + '.',              concl: 'It ' + q[0] + '.',              valid: true,
        why: 'Modus ponens. Affirming the antecedent gives you the consequent.' },
      { second: 'It does not ' + q[1] + '.',     concl: 'It does not ' + p[1] + '.',     valid: true,
        why: 'Modus tollens. Denying the consequent denies the antecedent.' },
      { second: 'It ' + q[0] + '.',              concl: 'It ' + p[0] + '.',              valid: false,
        why: 'Affirming the consequent. Something other than the antecedent could make it ' + q[0] + '.' },
      { second: 'It does not ' + p[1] + '.',     concl: 'It does not ' + q[1] + '.',     valid: false,
        why: 'Denying the antecedent. The rule says nothing about what happens when the antecedent fails.' }
    ];
    const f = pick(forms);
    return {
      label: 'conditional',
      prompt: 'Take these as given, whatever you think of them.\n\n' +
              'If ' + name + ' ' + p[0] + ', then it ' + q[0] + '.\n' + f.second +
              '\n\nTherefore: ' + f.concl + '\n\nDoes the conclusion follow?',
      kind: 'choice',
      options: ['It follows', 'It does not follow'],
      answer: f.valid ? 0 : 1,
      explain: f.why
    };
  },

  /* 2 — which statement is equivalent to a conditional. */
  2: () => {
    const [p, q] = pickPair(LOGIC_PROPS);
    const plural = pick(LOGIC_NOUNS)[0];
    const opts = [
      { t: 'Every one of the ' + plural + ' who does not ' + q[1] + ' does not ' + p[1] + '.', ok: true,
        why: 'The contrapositive, which is always equivalent to the original.' },
      { t: 'Every one of the ' + plural + ' who ' + q[0] + ' also ' + p[0] + '.', ok: false,
        why: 'The converse. It swaps the two halves, which is not equivalent.' },
      { t: 'Every one of the ' + plural + ' who does not ' + p[1] + ' does not ' + q[1] + '.', ok: false,
        why: 'The inverse. It negates both halves without swapping them, which is not equivalent either.' }
    ];
    const shuffled = opts.slice().sort(() => Math.random() - 0.5);
    return {
      label: 'equivalence',
      prompt: 'Every one of the ' + plural + ' who ' + p[0] + ' also ' + q[0] + '.' +
              '\n\nWhich of these says the same thing?',
      kind: 'choice',
      options: shuffled.map(o => o.t),
      answer: shuffled.findIndex(o => o.ok),
      explain: shuffled.map((o, i) => (i + 1) + '. ' + o.why).join(' ')
    };
  },

  /* 3 — negating a quantified statement. */
  3: () => {
    const plural = pick(LOGIC_NOUNS)[0];
    const p = pick(LOGIC_PROPS);
    const cases = [
      { claim: 'All ' + plural + ' ' + p[1] + '.',
        right: 'At least one of the ' + plural + ' does not ' + p[1] + '.',
        wrong: ['No ' + plural + ' ' + p[1] + '.', 'Most ' + plural + ' do not ' + p[1] + '.'],
        why: 'The negation of "all" is "at least one is not", not "none". A single exception is enough to break it.' },
      { claim: 'No ' + plural + ' ' + p[1] + '.',
        right: 'At least one of the ' + plural + ' ' + p[0] + '.',
        wrong: ['All ' + plural + ' ' + p[1] + '.', 'Most ' + plural + ' ' + p[1] + '.'],
        why: 'The negation of "none" is "at least one does", not "all do".' },
      { claim: 'Some ' + plural + ' ' + p[1] + '.',
        right: 'No ' + plural + ' ' + p[1] + '.',
        wrong: ['Some ' + plural + ' do not ' + p[1] + '.', 'All ' + plural + ' ' + p[1] + '.'],
        why: '"Some do" and "some do not" can be true at the same time, so neither negates the other. Only "none" contradicts "some".' }
    ];
    const c = pick(cases);
    const opts = [c.right, c.wrong[0], c.wrong[1]].sort(() => Math.random() - 0.5);
    return {
      label: 'quantifiers',
      prompt: c.claim + '\n\nWhich statement is its exact negation?',
      kind: 'choice',
      options: opts,
      answer: opts.indexOf(c.right),
      explain: c.why
    };
  },

  /* 4 — categorical syllogisms, valid and invalid. */
  4: () => {
    const A = pick(LOGIC_NOUNS)[0], B = pick(LOGIC_NOUNS)[0], C = pick(LOGIC_NOUNS)[0];
    if (A === B || B === C || A === C) return LOGIC_LEVELS[4]();
    const forms = [
      { p1: 'All ' + A + ' are ' + B + '.', p2: 'All ' + B + ' are ' + C + '.',
        c: 'All ' + A + ' are ' + C + '.', valid: true,
        why: 'Valid. The chain runs the right way through the middle term ' + B + '.' },
      { p1: 'All ' + A + ' are ' + B + '.', p2: 'Some ' + C + ' are ' + A + '.',
        c: 'Some ' + C + ' are ' + B + '.', valid: true,
        why: 'Valid. The ' + C + ' picked out are ' + A + ', and every one of those is inside ' + B + '.' },
      { p1: 'All ' + A + ' are ' + B + '.', p2: 'All ' + C + ' are ' + B + '.',
        c: 'All ' + A + ' are ' + C + '.', valid: false,
        why: 'Invalid. The middle term ' + B + ' is undistributed: both groups sit inside it without having to touch each other.' },
      { p1: 'All ' + A + ' are ' + B + '.', p2: 'Some ' + B + ' are ' + C + '.',
        c: 'Some ' + A + ' are ' + C + '.', valid: false,
        why: 'Invalid. The part of ' + B + ' that overlaps ' + C + ' need not be the part containing ' + A + '.' },
      { p1: 'No ' + A + ' are ' + B + '.', p2: 'All ' + C + ' are ' + B + '.',
        c: 'No ' + A + ' are ' + C + '.', valid: true,
        why: 'Valid. ' + C + ' lies wholly inside ' + B + ', and ' + B + ' is wholly outside ' + A + '.' },
      { p1: 'Some ' + A + ' are ' + B + '.', p2: 'Some ' + B + ' are ' + C + '.',
        c: 'Some ' + A + ' are ' + C + '.', valid: false,
        why: 'Invalid. Two separate overlaps with ' + B + ' need not be the same overlap, so nothing links ' + A + ' to ' + C + '.' }
    ];
    const f = pick(forms);
    return {
      label: 'syllogism',
      prompt: 'Take the premises as given.\n\n' + f.p1 + '\n' + f.p2 +
              '\n\nTherefore: ' + f.c + '\n\nIs the argument valid?',
      kind: 'choice',
      options: ['Valid', 'Invalid'],
      answer: f.valid ? 0 : 1,
      explain: f.why
    };
  },

  /* 5 — necessary, sufficient, both, neither. */
  5: () => {
    const [p, q] = pickPair(LOGIC_PROPS);
    const cases = [
      { text: 'If someone ' + p[0] + ', then they ' + q[1] + '.', answer: 1,
        why: 'The conditional says ' + p[0] + ' guarantees it, which makes it sufficient. It is not necessary: someone could ' + q[1] + ' by another route entirely.' },
      { text: 'Someone ' + q[0] + ' only if they ' + p[1] + '.', answer: 0,
        why: '"Only if" states a requirement. Without it there is no ' + q[0] + ', so it is necessary. It is not sufficient: it may not be enough on its own.' },
      { text: 'Someone ' + q[0] + ' if and only if they ' + p[1] + '.', answer: 2,
        why: '"If and only if" runs in both directions, so the condition is necessary and sufficient at once.' },
      { text: 'Some who ' + p[1] + ' also ' + q[1] + ', and some do not.', answer: 3,
        why: 'It neither guarantees the second nor is required for it. The two are merely correlated.' }
    ];
    const c = pick(cases);
    return {
      label: 'conditions',
      prompt: c.text + '\n\nIn that statement, "' + p[1] + '" is which kind of condition for "' + q[1] + '"?',
      kind: 'choice',
      options: ['Necessary but not sufficient', 'Sufficient but not necessary', 'Both', 'Neither'],
      answer: c.answer,
      explain: c.why
    };
  },

  /* 6 — validity against truth, and the selection task. */
  6: () => {
    if (Math.random() < 0.5) {
      const [p, q] = pickPair(LOGIC_PROPS);
      const plural = pick(LOGIC_NOUNS)[0];
      return {
        label: 'validity and truth',
        prompt: 'Consider this argument.\n\nAll ' + plural + ' ' + p[1] + '.\nEveryone who ' + p[0] + ' also ' + q[0] +
                '.\nTherefore all ' + plural + ' ' + q[1] + '.\n\n' +
                'Suppose the first premise is in fact false. What follows about the argument?',
        kind: 'choice',
        options: [
          'It is still valid, but not sound',
          'It is now invalid',
          'It is both invalid and unsound',
          'Nothing can be said either way'
        ],
        answer: 0,
        explain: 'Validity is a property of form: if the premises were true, the conclusion would have to be. A false premise leaves the form untouched. It costs the argument its soundness, not its validity.'
      };
    }
    const [p, q] = pickPair(LOGIC_PROPS);
    return {
      label: 'selection task',
      prompt: 'A rule is claimed: every member who ' + p[0] + ' also ' + q[0] + '.\n\n' +
              'Four member cards are face up, showing one fact each:\n' +
              'A: ' + p[0] + '\nB: does not ' + p[1] + '\nC: ' + q[0] + '\nD: does not ' + q[1] + '\n\n' +
              'Which cards must you turn over to test the rule?',
      kind: 'choice',
      options: ['A and C', 'A and D', 'A, C and D', 'All four'],
      answer: 1,
      explain: 'Only a member who ' + p[0] + ' but does not ' + q[1] + ' can break the rule, so you must check A and D. ' +
               'C cannot break it: the rule never says who else may ' + q[1] + '. B cannot break it either, for the same reason.'
    };
  }
};

/* How fast counts as fast, per logic level, in milliseconds. */
const LOGIC_TARGET_MS = [0, 14000, 18000, 20000, 26000, 28000, 40000];

/* ═══════════════════════════════════════════════════════════════════════
   11b.  CAUSAL DAY

   Every scenario is generated with fresh domains and fresh numbers, so
   nothing can be recognised from last time. Each problem has a scorable
   multiple choice and a written follow-up with a reference answer.
   ═══════════════════════════════════════════════════════════════════════ */

const CAUSAL_TEMPLATES = [

  /* Confounding: a third variable driving both. */
  function confound() {
    const sets = [
      { x: 'towns with more libraries', y: 'higher rates of heart disease', z: 'population age',
        note: 'Older towns have both more established libraries and older residents.' },
      { x: 'children who own more books', y: 'better exam results', z: 'household income and parental education',
        note: 'Both the books and the results follow from the household.' },
      { x: 'people who take vitamin supplements', y: 'longer life expectancy', z: 'general health-consciousness',
        note: 'Supplement takers also exercise more, smoke less and see doctors sooner.' },
      { x: 'firms that use management consultants', y: 'faster revenue growth', z: 'firm size and existing profitability',
        note: 'Only firms already doing well can afford consultants.' },
      { x: 'neighbourhoods with more fire engines attending', y: 'greater fire damage', z: 'the size of the fire',
        note: 'Big fires draw more engines and cause more damage.' }
    ];
    const s = pick(sets);
    const r = randInt(35, 72) / 100;
    return {
      label: 'confounding',
      prompt: 'A study of ' + fmt(randInt(120, 900)) + ' cases reports that ' + s.x +
              ' show ' + s.y + ', with a correlation of ' + r.toFixed(2) + '. The authors suggest the first causes the second.\n\n' +
              'What is the most likely explanation?',
      kind: 'choice',
      options: [
        'A third factor drives both',
        'The first genuinely causes the second',
        'The correlation is too weak to mean anything',
        'The sample is too small to say'
      ],
      answer: 0,
      explain: 'A correlation of ' + r.toFixed(2) + ' at that sample size is real, so neither "too weak" nor "too small" is the problem. ' + s.note,
      followup: {
        prompt: 'Name the third factor you would test first, and say how you would check whether it accounts for the whole effect.',
        reference: 'A reasonable answer names ' + s.z + '. ' + s.note +
                   ' To test it, measure the third factor and see whether the association survives once you compare like with like, either by stratifying or by adjusting for it. If the effect vanishes inside each stratum, the third factor was doing the work.'
      }
    };
  },

  /* Selection: the sample decides the answer. */
  function selection() {
    const sets = [
      { setup: 'A university finds that among its own students, admissions test scores barely predict final results, and concludes the test is worthless.',
        flaw: 'Only students who scored well enough were admitted, so the range of scores is truncated.',
        fix: 'Look at the full applicant pool, including those rejected, or use a period when the threshold was lower.' },
      { setup: 'A survey of people leaving a gym at 6am finds that 94 percent say early exercise is easy to sustain.',
        flaw: 'Everyone who found it unsustainable stopped coming and is not there to be surveyed.',
        fix: 'Sample from everyone who ever joined, not from those currently attending.' },
      { setup: 'An analysis of successful startups finds that almost all of them pivoted at least once, and concludes that pivoting causes success.',
        flaw: 'Failed startups also pivoted, often more, and are absent from the sample.',
        fix: 'Include the failures. Compare pivot rates between survivors and the dead.' },
      { setup: 'A hospital reports that patients treated with a new procedure have worse survival than those given standard care.',
        flaw: 'The sickest patients were selected for the new procedure precisely because standard care was failing them.',
        fix: 'Randomise assignment, or at minimum compare patients matched on severity at the point of decision.' },
      { setup: 'A newspaper finds that among people it interviewed who had used a therapy for over a year, satisfaction was 91 percent.',
        flaw: 'Those who found it useless stopped within weeks and never reached a year.',
        fix: 'Follow everyone from the point they started, and count the dropouts.' }
    ];
    const s = pick(sets);
    return {
      label: 'selection effects',
      prompt: s.setup + '\n\nWhat is wrong with the inference?',
      kind: 'choice',
      options: [
        'The sample was selected in a way that determines the result',
        'The sample is too small',
        'The result is real but the effect size is overstated',
        'Nothing; the inference is sound'
      ],
      answer: 0,
      explain: s.flaw,
      followup: {
        prompt: 'Describe the study you would run instead, and say what result would change your mind.',
        reference: s.fix + ' You should also be able to name in advance what result would make you accept the original claim, otherwise the objection is unfalsifiable too.'
      }
    };
  },

  /* Reverse causation. */
  function reverse() {
    const sets = [
      { a: 'poor sleep', b: 'symptoms of depression', why: 'Depression disrupts sleep at least as reliably as poor sleep worsens mood; the arrow runs both ways and probably loops.' },
      { a: 'low exercise', b: 'chronic joint pain', why: 'Pain reduces exercise directly, so the association may be entirely the reverse of the one proposed.' },
      { a: 'fewer close friendships', b: 'lower self-reported wellbeing', why: 'Low wellbeing withdraws people from company, so the causal arrow plausibly runs from wellbeing to friendship.' },
      { a: 'reading fewer books', b: 'weaker vocabulary', why: 'A weak vocabulary makes reading effortful and unpleasant, which reduces reading.' },
      { a: 'lower company morale', b: 'falling productivity', why: 'Falling productivity brings pressure, layoffs and blame, which destroys morale.' }
    ];
    const s = pick(sets);
    return {
      label: 'direction',
      prompt: 'A study reports that ' + s.a + ' is associated with ' + s.b +
              ', and the write-up treats the first as the cause.\n\nWhich objection has the most force here?',
      kind: 'choice',
      options: [
        'The causal arrow may point the other way',
        'The association is probably chance',
        'The effect is real but small',
        'The measurement is unreliable'
      ],
      answer: 0,
      explain: s.why,
      followup: {
        prompt: 'What evidence would distinguish the two directions? Be specific about timing.',
        reference: 'Direction is settled by order in time or by intervention. Either follow people who have neither condition and see which appears first, or intervene on one and watch the other. ' + s.why
      }
    };
  },

  /* Regression to the mean dressed as a working intervention. */
  function regression() {
    const sets = [
      { thing: 'schools', metric: 'exam results', act: 'a new inspection regime' },
      { thing: 'factories', metric: 'accident rates', act: 'a safety training day' },
      { thing: 'clinics', metric: 'waiting times', act: 'a management shake-up' },
      { thing: 'sales regions', metric: 'quarterly revenue', act: 'an intensive coaching programme' }
    ];
    const s = pick(sets);
    const n = randInt(20, 60);
    const drop = randInt(12, 34);
    return {
      label: 'regression to the mean',
      prompt: 'The ' + n + ' ' + s.thing + ' with the worst ' + s.metric + ' last year were given ' + s.act +
              '. This year their ' + s.metric + ' improved by ' + drop + ' percent on average, while the rest changed little. ' +
              'The programme is declared a success.\n\nWhat is the strongest reason to doubt it?',
      kind: 'choice',
      options: [
        'Groups picked for being extreme tend to move back towards average anyway',
        'A single year is too short to show an effect',
        'The comparison group was not large enough',
        'The improvement is too small to matter'
      ],
      answer: 0,
      explain: 'Selecting the worst performers guarantees you have selected for bad luck as well as genuine weakness. The bad luck does not repeat, so the group improves whatever you do. This is regression to the mean, and it is why the same design keeps appearing to prove things.',
      followup: {
        prompt: 'How would you design this so the result would mean something?',
        reference: 'Randomise which of the worst performers receive the programme and which do not, then compare the two. Both regress equally, so any difference between them is the effect. Failing that, use a matched comparison group selected the same way but left untreated.'
      }
    };
  },

  /* Simpson's paradox, with numbers that actually work. */
  function simpson() {
    // Build a case where B wins in both strata but loses overall.
    const easyA = randInt(80, 95), easyB = randInt(60, 75);
    const hardA = randInt(30, 45), hardB = randInt(15, 28);
    const aEasy = randInt(80, 120), aHard = randInt(600, 900);
    const bEasy = randInt(600, 900), bHard = randInt(80, 120);

    const aTot = Math.round((aEasy * easyA + aHard * hardA) / (aEasy + aHard));
    const bTot = Math.round((bEasy * easyB + bHard * hardB) / (bEasy + bHard));

    return {
      label: "Simpson's paradox",
      prompt: 'Two surgeons are compared.\n\n' +
              'On straightforward cases: Surgeon A succeeds ' + easyA + '% of the time (' + fmt(aEasy) + ' cases), Surgeon B ' + easyB + '% (' + fmt(bEasy) + ' cases).\n' +
              'On difficult cases: Surgeon A succeeds ' + hardA + '% (' + fmt(aHard) + ' cases), Surgeon B ' + hardB + '% (' + fmt(bHard) + ' cases).\n\n' +
              'Overall, Surgeon A succeeds about ' + aTot + '% of the time and Surgeon B about ' + bTot + '%.\n\n' +
              'Who would you rather operate on you?',
      kind: 'choice',
      options: [
        'Surgeon A, who is better in both categories',
        'Surgeon B, who has the better overall record',
        'Neither; the figures are contradictory',
        'It cannot be determined from this'
      ],
      answer: 0,
      explain: 'A is better on easy cases and better on hard cases, yet has the worse overall rate, because A takes mostly hard cases and B takes mostly easy ones. The overall figure measures case mix, not skill. When a variable affects both the grouping and the outcome, the aggregate can reverse every subgroup.',
      followup: {
        prompt: 'What would you need to know about your own case before this comparison helps you?',
        reference: 'Which category you fall into. If your case is difficult, the relevant numbers are ' + hardA + '% against ' + hardB + '%, and the overall figures are worse than useless. Aggregate rates are only informative when the case mix matches yours.'
      }
    };
  }
];

/* ═══════════════════════════════════════════════════════════════════════
   11c.  NUMBERS DAY

   Quantities as they actually arrive: as risks, denominators, averages and
   headlines. Generated, so the figures are never the same twice. Base-rate
   problems and Fermi estimation live here too.
   ═══════════════════════════════════════════════════════════════════════ */

const STAT_TEMPLATES = [

  /* Relative risk sounds enormous; absolute risk is what matters. */
  function relativeRisk() {
    const base = pick([1, 2, 3, 4, 5]);
    const mult = pick([2, 3, 4]);
    const per = pick([10000, 100000]);
    const after = base * mult;
    const conditions = ['a rare blood clot', 'a particular bowel cancer', 'a specific liver injury', 'an unusual heart rhythm'];
    const cond = pick(conditions);
    const absolute = (after - base) / per * 100;
    return {
      label: 'relative and absolute risk',
      prompt: 'A headline reports that a drug "' + (mult === 2 ? 'doubles' : mult === 3 ? 'triples' : 'quadruples') +
              ' the risk" of ' + cond + '.\n\nIn the trial, the rate went from ' + base + ' in ' + fmt(per) +
              ' to ' + after + ' in ' + fmt(per) + '.\n\nHow many additional cases does that mean per ' + fmt(per) + ' people treated?',
      kind: 'number',
      answer: after - base,
      tolerance: 0.001,
      explain: 'The relative risk really did rise by a factor of ' + mult + '. The absolute increase is ' + after + ' minus ' + base +
               ' = ' + (after - base) + ' extra cases per ' + fmt(per) + ', which is ' + absolute.toFixed(3) +
               ' percent of those treated. Both numbers are true. The relative one is chosen because it is larger.',
      followup: {
        prompt: 'You are offered this drug. What else do you need to know before the risk figure means anything?',
        reference: 'The benefit, in the same absolute units. A rise of ' + (after - base) + ' per ' + fmt(per) +
                   ' may be trivial against a large benefit or unacceptable against a small one. You also need the baseline risk for someone like you rather than for the trial average, and the time period over which the risk accrues.'
      }
    };
  },

  /* Percentage against percentage point. */
  function percentagePoints() {
    const from = pick([2, 4, 5, 8, 10, 12, 20, 25]);
    const to = from + pick([1, 2, 3, 4, 5]);
    const rel = Math.round(1000 * (to - from) / from) / 10;
    return {
      label: 'points and percentages',
      prompt: 'Support for a proposal rose from ' + from + '% to ' + to + '%.\n\n' +
              'By how many percent did support rise? Give the percentage change, not the change in points.',
      kind: 'number',
      answer: rel,
      tolerance: 0.15,
      explain: 'It rose by ' + (to - from) + ' percentage points, which is a ' + rel +
               ' percent increase. A campaign will report whichever of the two sounds larger. They are not interchangeable, and swapping them is one of the commonest ways a true number misleads.'
    };
  },

  /* Denominator neglect. */
  function denominator() {
    const sets = [
      { claim: 'most road accidents happen within a few miles of home', wrong: 'driving near home is unusually dangerous',
        why: 'Almost all driving happens near home. The denominator, not the risk, produces the pattern.' },
      { claim: 'the majority of people who drown in swimming pools can swim', wrong: 'swimming ability offers no protection',
        why: 'Almost everyone who enters a pool can swim, so they dominate every category of pool event.' },
      { claim: 'more injuries occur on the ground floor of buildings than on the top floor', wrong: 'ground floors are more dangerous',
        why: 'Far more people-hours are spent on ground floors.' },
      { claim: 'most cyber-attacks succeed against organisations that run antivirus software', wrong: 'antivirus software is useless',
        why: 'Nearly every organisation runs it, so nearly every victim will have had it.' }
    ];
    const s = pick(sets);
    return {
      label: 'denominators',
      prompt: 'It is true that ' + s.claim + '. Someone concludes that ' + s.wrong + '.\n\nWhat has gone wrong?',
      kind: 'choice',
      options: [
        'The comparison lacks a denominator',
        'The underlying statistic is false',
        'The sample was not random',
        'The effect is real but small'
      ],
      answer: 0,
      explain: s.why + ' The figure counts events without dividing by exposure. Rates need a denominator; raw counts tell you where people are, not where the danger is.'
    };
  },

  /* Mean against median under skew. */
  function skew() {
    const small = [randInt(18, 26), randInt(19, 27), randInt(20, 28), randInt(21, 30), randInt(22, 31),
                   randInt(23, 32), randInt(24, 33), randInt(25, 34), randInt(26, 36)];
    const whale = randInt(300, 900);
    const all = small.concat([whale]).sort((a, b) => a - b);
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const median = (all[4] + all[5]) / 2;
    return {
      label: 'mean and median',
      prompt: 'Ten graduates report their salaries, in thousands:\n\n' + all.join(', ') +
              '\n\nA prospectus quotes the average as ' + mean.toFixed(1) +
              '.\n\nWhat is the median?',
      kind: 'number',
      answer: median,
      tolerance: 0.6,
      explain: 'The median is ' + median.toFixed(1) + ' against a mean of ' + mean.toFixed(1) +
               '. One graduate earning ' + whale + ' pulls the mean far above what a typical graduate gets. With skewed data the mean answers "what is the total divided by the count", which is rarely the question anyone is asking.'
    };
  },

  /* Confusing P(A|B) with P(B|A). */
  function conditionalDirection() {
    const sets = [
      { a: 'people who commit fraud', b: 'people who avoid eye contact', pAB: randInt(70, 90) },
      { a: 'people with a rare autoimmune disease', b: 'people reporting fatigue', pAB: randInt(75, 95) },
      { a: 'failing engines', b: 'engines showing a particular vibration', pAB: randInt(80, 95) }
    ];
    const s = pick(sets);
    return {
      label: 'which way round',
      prompt: 'It is established that ' + s.pAB + '% of ' + s.a + ' are also ' + s.b +
              '.\n\nA detector flags anyone who is ' + s.b + '. What does the ' + s.pAB + '% figure tell you about how many of those flagged actually belong to the first group?',
      kind: 'choice',
      options: [
        'Nothing on its own, without knowing how common each group is',
        'About ' + s.pAB + '% of them will',
        'Fewer than ' + s.pAB + '% but the figure sets an upper bound',
        'At least ' + s.pAB + '% of them will'
      ],
      answer: 0,
      explain: 'The figure given is the probability of the second given the first. What you need is the reverse, and the two are related only through the base rates. If the first group is rare and the second common, almost everyone flagged will be a false positive however high that percentage goes.'
    };
  },

  /* Small samples produce extreme averages. */
  function smallSamples() {
    const bigN = pick([400, 600, 900]);
    const smallN = pick([12, 18, 25]);
    return {
      label: 'sample size',
      prompt: 'A country reviews cancer rates by district. The districts with the highest rates are almost all rural and small. ' +
              'A commentator concludes that rural life carries the risk.\n\n' +
              'Someone then checks the districts with the LOWEST rates and finds they are also almost all rural and small.\n\n' +
              'What explains this?',
      kind: 'choice',
      options: [
        'Small samples produce extreme rates in both directions',
        'Rural areas have genuinely more variable health',
        'The data has been recorded inconsistently',
        'There are two separate rural effects cancelling out'
      ],
      answer: 0,
      explain: 'A district of ' + smallN + ' thousand people will show wilder rates than one of ' + bigN +
               ' thousand for the same underlying risk, simply because fewer cases mean more sampling noise. Ranking by rate without weighting by population sorts largely by population size. The tails of any such league table are small units.'
    };
  }
];

/* ═══════════════════════════════════════════════════════════════════════
   11.  THE DRILL STAGE

   Logic, causal, numbers and calibration all share one interface, because
   they are all the same shape underneath: a prompt, an answer that can be
   scored, how sure you were, and then the explanation.

   A drill item looks like this:
     {
       label,                        shown above the prompt
       prompt,
       kind: 'choice'|'number'|'text',
       options: [...],               choice only
       answer,                       index, number, or {low,high} for Fermi
       tolerance,                    number only
       explain,                      string or array of steps
       followup: {prompt, reference} written answer with no score
       confidence: false             set to skip the confidence step
     }
   ═══════════════════════════════════════════════════════════════════════ */

async function loadReasoning() {
  if (reasoningData) return reasoningData;
  const res = await fetch('data/reasoning.json');
  reasoningData = await res.json();
  return reasoningData;
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

/* Number formatting shared by the causal, numbers and base-rate generators. */
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

/* ── item sources, one per day type ──────────────────────────────────── */

function logicItem() {
  const level = clamp(state.logic.level, 1, 6);
  const item = LOGIC_LEVELS[level]();
  item.label = 'level ' + level + ' · ' + item.label;
  item.level = level;
  return item;
}

function causalItem() {
  return pick(CAUSAL_TEMPLATES)();
}

/* Numbers day draws from three pools so a session covers real ground:
   statistical literacy, base rates, and estimation. */
function numbersItem() {
  const roll = Math.random();

  if (roll < 0.45) return pick(STAT_TEMPLATES)();

  if (roll < 0.75) {
    const b = pick(BASE_RATE_TEMPLATES)();
    return {
      label: 'base rates',
      prompt: b.prompt + '\n\nGive your answer as a percentage.',
      kind: 'number',
      answer: b.answer,
      tolerance: Math.max(2, b.answer * 0.05),
      unit: '%',
      explain: b.steps
    };
  }

  // Fermi, if the prompts loaded
  if (!reasoningData || !reasoningData.fermi || !reasoningData.fermi.length) {
    return pick(STAT_TEMPLATES)();
  }
  let pool = reasoningData.fermi.filter(f => !state.numbers.fermiSeen.includes(f.id));
  if (!pool.length) { state.numbers.fermiSeen = []; pool = reasoningData.fermi; }
  const f = pick(pool);
  state.numbers.fermiSeen.push(f.id);
  return {
    label: 'estimation — no lookups',
    prompt: f.prompt + '\n\nDecompose it in the box, then commit to a figure in ' + f.unit + '.',
    kind: 'number',
    band: { low: f.low, high: f.high },
    unit: f.unit,
    answer: Math.sqrt(f.low * f.high),
    confidence: false,
    workspace: 'One step per line. Multiply at the end.',
    explain: f.reference.concat([f.answer])
  };
}

function calibrationItem() {
  const bank = (reasoningData && reasoningData.calibration) || [];
  if (!bank.length) return null;

  // Least-recently-seen, so the gap between repeats is as long as the bank allows.
  const lastSeen = {};
  state.reasoning.calibration.forEach(c => { lastSeen[c.id] = c.ts; });
  const unseen = bank.filter(b => !(b.id in lastSeen));
  const item = unseen.length
    ? pick(unseen)
    : bank.slice().sort((a, b) => lastSeen[a.id] - lastSeen[b.id])[0];

  return {
    label: 'calibration · ' + item.category,
    prompt: item.statement,
    kind: 'choice',
    options: ['True', 'False'],
    answer: item.answer ? 0 : 1,
    explain: item.note,
    id: item.id,
    remaining: unseen.length
  };
}

const DRILL_SOURCE = {
  logic: logicItem,
  causal: causalItem,
  numbers: numbersItem,
  calibration: calibrationItem
};

/* ── the drill controller ────────────────────────────────────────────── */

async function startDrill(mode) {
  session.scratch.mode = mode;
  session.scratch.items = 0;
  session.scratch.correct = 0;

  if (mode === 'calibration' || mode === 'numbers') {
    try { await loadReasoning(); } catch (e) { /* generators still work offline */ }
  }
  nextDrill();
}

function nextDrill() {
  const item = DRILL_SOURCE[session.scratch.mode]();
  if (!item) { setText($('#drill-prompt'), 'Nothing available offline for this day.'); return; }

  session.scratch.item = item;
  session.scratch.shownAt = Date.now();
  session.scratch.picked = null;

  setText($('#drill-label'), item.label + ' · ' + (session.scratch.items + 1));
  $('#drill-prompt').textContent = item.prompt;

  // answer input
  const opts = $('#drill-options');
  opts.innerHTML = '';
  opts.hidden = item.kind !== 'choice';
  $('#drill-entry').hidden = item.kind === 'choice';
  $('#drill-workspace').hidden = !item.workspace;
  if (item.workspace) {
    $('#drill-work').value = '';
    $('#drill-work').placeholder = item.workspace;
  }

  if (item.kind === 'choice') {
    item.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.className = 'btn btn-option';
      b.textContent = text;
      b.addEventListener('click', () => chooseDrill(i));
      opts.appendChild(b);
    });
  } else {
    const inp = $('#drill-number');
    inp.value = '';
    inp.placeholder = item.unit ? 'your figure in ' + item.unit : 'your answer';
  }

  $('#drill-conf').hidden = true;
  $('#drill-reveal').hidden = true;
  $('#drill-followup').hidden = true;
  setText($('#drill-remaining'), item.remaining !== undefined
    ? item.remaining + ' unseen statements left in the bank' : '');
}

function chooseDrill(i) {
  session.scratch.picked = i;
  $$('#drill-options .btn-option').forEach((b, j) => {
    b.disabled = true;
    if (j === i) b.classList.add('chosen');
  });
  askConfidenceOrResolve();
}

$('#drill-entry').addEventListener('submit', e => {
  e.preventDefault();
  const item = session.scratch.item;
  const v = parseMagnitude($('#drill-number').value);
  if (!isFinite(v)) { $('#drill-number').focus(); return; }
  session.scratch.picked = v;
  $('#drill-number').disabled = true;
  $('#drill-entry-submit').disabled = true;
  askConfidenceOrResolve();
});

function askConfidenceOrResolve() {
  const item = session.scratch.item;
  if (item.confidence === false) { resolveDrill(null); return; }

  const grid = $('#drill-confgrid');
  grid.innerHTML = '';
  CONF_LEVELS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = c + '%';
    b.addEventListener('click', () => resolveDrill(c));
    grid.appendChild(b);
  });
  $('#drill-conf').hidden = false;
  const first = grid.querySelector('button');
  if (first) first.focus();
}

function drillIsCorrect(item, picked) {
  if (item.kind === 'choice') return picked === item.answer;
  if (item.band) return picked >= item.band.low && picked <= item.band.high;
  return Math.abs(picked - item.answer) <= (item.tolerance || 0.001);
}

function resolveDrill(confidence) {
  const item = session.scratch.item;
  const mode = session.scratch.mode;
  const picked = session.scratch.picked;
  const ms = Date.now() - session.scratch.shownAt;
  const right = drillIsCorrect(item, picked);

  session.scratch.items += 1;
  if (right) session.scratch.correct += 1;

  const log = { ts: Date.now(), correct: right, ms: ms };
  if (mode === 'logic') { log.level = item.level; state.logic.history.push(log); adaptLogicLevel(); }
  if (mode === 'causal') state.causal.history.push(log);
  if (mode === 'numbers') state.numbers.history.push(log);

  // Confidence goes into the one shared calibration log, tagged by source.
  if (confidence !== null) {
    // p is the stated probability that the answer given is the right one
    const p = confidence / 100;
    const brier = Math.pow(p - (right ? 1 : 0), 2);
    state.reasoning.calibration.push({
      ts: Date.now(), id: item.id || (mode + ':' + session.scratch.items),
      source: mode === 'calibration' ? 'trivia' : mode,
      said: item.kind === 'choice' ? picked === 0 : null,
      conf: confidence, answer: item.answer, correct: right, brier: brier
    });
  }
  save();

  const v = $('#drill-verdict');
  v.className = 'verdict ' + (right ? 'right' : 'wrong');
  let line = right ? 'Correct' : 'Wrong';
  if (item.kind === 'choice') {
    if (!right) line += ' — the answer is "' + item.options[item.answer] + '"';
  } else if (item.band) {
    line = right
      ? 'Inside the accepted band. You gave ' + picked.toExponential(2) + '.'
      : 'Outside the band. You gave ' + picked.toExponential(2) + '; the band is ' +
        item.band.low.toExponential(1) + ' to ' + item.band.high.toExponential(1) + ' ' + (item.unit || '') + '.';
  } else {
    if (!right) line += ' — the answer is ' + item.answer + (item.unit || '');
  }
  if (confidence !== null) {
    const brier = state.reasoning.calibration[state.reasoning.calibration.length - 1].brier;
    line += ' · you said ' + confidence + '% · Brier ' + brier.toFixed(3);
  }
  v.textContent = line;

  const ex = $('#drill-explain');
  if (Array.isArray(item.explain)) {
    ex.innerHTML = '<ol class="steps">' + item.explain.map(s => '<li>' + escapeHTML(s) + '</li>').join('') + '</ol>';
  } else {
    ex.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = item.explain;
    ex.appendChild(p);
  }

  if (item.followup) {
    $('#drill-followup').hidden = false;
    $('#drill-followup-prompt').textContent = item.followup.prompt;
    $('#drill-followup-answer').value = '';
    $('#drill-followup-answer').disabled = false;
    $('#drill-reference').hidden = true;
    $('#btn-drill-reference').hidden = false;
    $('#btn-drill-reference').disabled = false;
  }

  $('#drill-conf').hidden = true;
  $('#drill-reveal').hidden = false;
  $('#btn-drill-next').focus();
}

/* The written follow-up is never scored. Committing to an answer before
   seeing the reference is the whole exercise, so the reference stays shut
   until you ask for it. */
$('#btn-drill-reference').addEventListener('click', () => {
  const item = session.scratch.item;
  const written = $('#drill-followup-answer').value.trim();
  if (!written) {
    setText($('#drill-followup-status'), 'Write your answer first. Reading the reference before committing teaches you nothing.');
    return;
  }
  setText($('#drill-followup-status'), '');
  session.transcript.push({
    kind: 'followup', question: item.followup.prompt, answer: written, ts: Date.now()
  });
  save();
  $('#drill-reference').textContent = item.followup.reference;
  $('#drill-reference').hidden = false;
  $('#btn-drill-reference').disabled = true;
  $('#drill-followup-answer').disabled = true;
});

$('#btn-drill-next').addEventListener('click', () => {
  if (!session.running) return;
  $('#drill-number').disabled = false;
  $('#drill-entry-submit').disabled = false;
  setText($('#drill-followup-status'), '');
  nextDrill();
});

/* Logic is the only drill day with levels. Same rolling-window rule as
   arithmetic: accurate and quick moves you up, a bad run moves you down. */
function adaptLogicLevel() {
  const window = state.logic.history.filter(h => h.level === state.logic.level).slice(-10);
  if (window.length < 10) return;
  const accuracy = window.filter(h => h.correct).length / window.length;
  const times = window.map(h => h.ms).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  if (accuracy > 0.85 && median <= LOGIC_TARGET_MS[state.logic.level] && state.logic.level < 6) {
    state.logic.level += 1;
  } else if (accuracy < 0.60 && state.logic.level > 1) {
    state.logic.level -= 1;
  }
}
/* ═══════════════════════════════════════════════════════════════════════
   11d.  STEELMAN DAY

   You are handed a proposition and asked to build the strongest case FOR
   it, whatever you privately think. Then it tells you whether you built
   the strong version or the convenient one.

   Every other day in the rotation trains taking an argument apart. This
   is the only one that trains putting one together, which is the harder
   half and the one people skip.
   ═══════════════════════════════════════════════════════════════════════ */

let propositions = null;

async function loadPropositions() {
  if (propositions) return propositions;
  const res = await fetch('data/propositions.json');
  propositions = await res.json();
  return propositions;
}

function nextProposition() {
  let unseen = propositions.filter(p => !state.steelman.seen.includes(p.id));
  if (!unseen.length) { state.steelman.seen = []; unseen = propositions.slice(); }
  return pick(unseen);
}

async function startSteelman() {
  try {
    await loadPropositions();
  } catch (e) {
    setText($('#steel-domain'), 'The propositions could not be loaded.');
    $('#steel-proposition').textContent = 'Go online once so they can be cached.';
    return;
  }

  // Every third steelman day turns your own position file against you: you
  // build the best case AGAINST something you actually believe.
  const ownTurn = (state.steelman.days + 1) % 3 === 0 && state.positions.length > 0;
  let item;

  if (ownTurn) {
    const pos = state.positions.slice()
      .sort((a, b) => (a.lastChallenged || 0) - (b.lastChallenged || 0))[0];
    const latest = pos.revisions[pos.revisions.length - 1];
    item = {
      id: 'own:' + pos.id,
      own: true,
      positionId: pos.id,
      domain: 'your own position',
      proposition: latest.text.trim(),
      cheap: 'Conceding a small qualification and calling it a concession. You are building the case that defeats your position, not trimming it.'
    };
  } else {
    item = nextProposition();
    state.steelman.seen.push(item.id);
  }

  session.scratch.prop = item;
  session.scratch.turn = 0;
  save();

  setText($('#steel-domain'), item.own
    ? 'you wrote this — now argue against it'
    : item.domain);
  $('#steel-proposition').textContent = item.own
    ? item.proposition
    : item.proposition;
  setText($('#steel-task'), item.own
    ? 'Build the strongest case against this. Not a qualification, not a partial retreat: the argument that would actually defeat it.'
    : 'Build the strongest case FOR this, whatever you think of it. Not the version you could knock down: the one you would have trouble answering.');
  setText($('#steel-cheap'), 'Do not give me this version: ' + item.cheap);

  $('#steel-build').hidden = false;
  $('#steel-answer').value = '';
  $('#steel-answer').disabled = false;
  $('#btn-steel-submit').disabled = false;
  setText($('#steel-status'), '');
  $('#steel-reply').hidden = true;
}

$('#btn-steel-submit').addEventListener('click', async () => {
  const item = session.scratch.prop;
  const ta = $('#steel-answer');
  const written = ta.value.trim();

  if (written.length < 40) {
    setText($('#steel-status'), 'A case needs building. Give it more than that.');
    return;
  }

  const asked = session.scratch.turn === 0
    ? (item.own ? 'Build the strongest case against this position.' : 'Build the strongest case for this proposition.')
    : $('#steel-reply-text').textContent;

  session.transcript.push({ kind: 'steelman', question: asked, answer: written, ts: Date.now() });
  session.scratch.turn += 1;

  if (item.own) {
    const pos = state.positions.find(p => p.id === item.positionId);
    if (pos) pos.lastChallenged = Date.now();
  }
  save();

  let reply = '';
  if (hasKey()) {
    ta.disabled = true;
    $('#btn-steel-submit').disabled = true;
    setText($('#steel-status'), 'Testing the construction…');
    try {
      const msgs = [{
        role: 'user',
        content: 'THE PROPOSITION I WAS ASKED TO BUILD A CASE FOR:\n' + item.proposition +
                 '\n\nI was warned not to give this lazy version: ' + item.cheap +
                 '\n\nMY CASE:\n' + written
      }];
      for (let i = 1; i < session.transcript.length; i++) {
        if (session.transcript[i].kind !== 'steelman') continue;
        msgs.push({ role: 'assistant', content: session.transcript[i].question });
        msgs.push({ role: 'user', content: session.transcript[i].answer });
      }
      reply = await callClaude(STEELMAN_SYSTEM_PROMPT, msgs, 800);
      setText($('#steel-status'), '');
    } catch (err) {
      console.warn('steelman evaluation unavailable', err);
      setText($('#steel-status'), 'No live evaluation right now. Falling back to a written press.');
    }
  }

  if (!reply) {
    const used = session.scratch.turn - 1;
    reply = STEELMAN_FALLBACK_PRESSES[used % STEELMAN_FALLBACK_PRESSES.length];
  }

  $('#steel-reply-text').textContent = reply;
  $('#steel-reply').hidden = false;
  ta.value = '';
  ta.disabled = false;
  $('#btn-steel-submit').disabled = false;
  $('#btn-steel-submit').textContent = 'Rebuild and submit';
  ta.focus();
});

/* ═══════════════════════════════════════════════════════════════════════
   11b.  REVIEW

   Every session is kept, completed or not, and can be reopened. An argument
   session reopens as the thing it was: the passage, every question, and
   everything you wrote. From there you can keep going with no clock on it.
   ═══════════════════════════════════════════════════════════════════════ */

const KIND_LABEL = {
  bundled: 'question',
  live: 'interrogation',
  press: 'press further',
  position: 'your own position',
  followup: 'in your own words',
  steelman: 'the case you built'
};

function renderReview() {
  const host = $('#review-list');
  host.innerHTML = '';

  if (!state.sessions.length) {
    host.innerHTML = '<div class="plate plate-quiet"><p class="fineprint">' +
      'Nothing yet. Every session you run is kept here, finished or not.</p></div>';
    return;
  }

  state.sessions.slice().reverse().forEach(s => {
    const row = document.createElement('button');
    row.className = 'reviewrow';
    row.type = 'button';

    let detail;
    const written = (s.transcript || []).filter(t => t.answer).length;
    if (s.type === 'argument') {
      const who = s.passage ? s.passage.author : 'passage';
      detail = who + ' · ' + written + ' response' + (written === 1 ? '' : 's');
    } else if (s.type === 'steelman') {
      detail = (s.proposition || 'a proposition').slice(0, 60) +
               (s.proposition && s.proposition.length > 60 ? '…' : '');
    } else {
      detail = (s.correct || 0) + ' of ' + (s.attempted || s.items || 0) + ' correct';
      if (s.endLevel) detail += ' · level ' + s.endLevel;
      if (written) detail += ' · ' + written + ' written';
    }

    row.innerHTML =
      '<span class="reviewrow-top"><span class="reviewrow-type"></span>' +
      '<span class="reviewrow-time"></span></span>' +
      '<span class="reviewrow-detail"></span>';
    row.querySelector('.reviewrow-type').textContent = s.type + (s.completed ? '' : ' · unfinished');
    row.querySelector('.reviewrow-time').textContent = mmss(s.actualS);
    row.querySelector('.reviewrow-detail').textContent = stamp(s.ts) + ' — ' + detail;

    row.addEventListener('click', () => openSessionDetail(s.ts));
    host.appendChild(row);
  });
}

let openSessionTs = null;

async function openSessionDetail(ts) {
  const s = state.sessions.find(x => x.ts === ts);
  if (!s) return;
  openSessionTs = ts;

  setText($('#detail-type'), s.type + (s.completed ? '' : ' · unfinished'));
  setText($('#detail-when'), stampLong(s.ts) + ' · ' + mmss(s.actualS) + ' held');

  const isArg = s.type === 'argument';
  $('#detail-passage-plate').hidden = !isArg;
  // Only argument sessions can be carried on: they are the only ones with a
  // passage to keep arguing about.
  $('#detail-continue').hidden = !isArg;

  const rows = [];
  if (s.attempted || s.items) {
    const n = s.attempted || s.items;
    const pct = n ? Math.round(100 * (s.correct || 0) / n) : 0;
    rows.push(['answered', String(n)], ['correct', (s.correct || 0) + ' (' + pct + '%)']);
    if (s.endLevel) rows.push(['level at close', String(s.endLevel)]);
  }
  if (s.type === 'steelman' && s.proposition) {
    rows.push(['proposition', s.proposition.length > 70 ? s.proposition.slice(0, 70) + '…' : s.proposition]);
  }
  $('#detail-stats').innerHTML = rows
    .map(([k, v]) => '<div><dt>' + escapeHTML(k) + '</dt><dd>' + escapeHTML(v) + '</dd></div>').join('');
  $('#detail-stats').hidden = rows.length === 0;

  if (isArg) {
    const attrib = s.passage
      ? s.passage.author + ' — ' + s.passage.work + ', ' + s.passage.year
      : 'passage unavailable';
    setText($('#detail-attrib'), attrib);
    $('#detail-source').href = (s.passage && s.passage.source_url) || '#';
    $('#detail-source').hidden = !(s.passage && s.passage.source_url);

    // Resolve the passage text from the corpus by id
    let text = '';
    try {
      await loadCorpus();
      const p = corpus.find(x => x.id === s.passageId);
      if (p) text = p.text;
    } catch (e) { /* offline and uncached; the transcript still reads fine */ }
    $('#detail-passage').innerHTML = text
      ? passageHTML(text)
      : '<p class="chart-empty">The passage text is not available offline. Your responses are below.</p>';
  }

  $('#detail-pending').hidden = true;
  $('#detail-answer').value = '';
  setText($('#detail-status'), '');
  $('#detail-status').className = 'status';
  $('#btn-detail-press').disabled = false;
  $('#btn-detail-press').textContent = (s.transcript || []).length ? 'Press me further' : 'Start an interrogation';

  renderTranscript(s);
  go('detail');
}

function renderTranscript(s) {
  const host = $('#detail-transcript');
  host.innerHTML = '';
  const t = s.transcript || [];

  if (!t.length) {
    if (s.type === 'argument') {
      host.innerHTML = '<div class="plate plate-quiet"><p class="fineprint">' +
        'Nothing was submitted in this session.</p></div>';
    }
    return;
  }

  t.forEach((entry, i) => {
    if (!entry.answer) return;
    const block = document.createElement('div');
    block.className = 'plate exchange';
    block.innerHTML =
      '<p class="overline"></p>' +
      '<blockquote class="prompt"></blockquote>' +
      '<div class="answer"></div>';
    block.querySelector('.overline').textContent =
      (KIND_LABEL[entry.kind] || entry.kind) + ' · ' + (i + 1);
    block.querySelector('.prompt').textContent = entry.question;
    block.querySelector('.answer').textContent = entry.answer;
    host.appendChild(block);
  });
}

/* Continue an old session with no clock on it. Answers are appended to the
   same transcript, so the thread stays whole. */
$('#btn-detail-press').addEventListener('click', async () => {
  const s = state.sessions.find(x => x.ts === openSessionTs);
  if (!s) return;

  const answer = $('#detail-answer').value.trim();
  const status = $('#detail-status');
  const pending = $('#detail-pending');
  const question = pending.hidden ? null : $('#detail-question').textContent;

  if (question) {
    if (!answer) { status.className = 'status err'; status.textContent = 'Write something first.'; return; }
    s.transcript = s.transcript || [];
    s.transcript.push({ kind: 'followup', question: question, answer: answer, ts: Date.now() });
    writeNow();
    renderTranscript(s);
    $('#detail-answer').value = '';
    pending.hidden = true;
  }

  status.className = 'status';
  status.textContent = hasKey() ? 'Interrogating…' : 'Choosing a press…';
  $('#btn-detail-press').disabled = true;

  let next = null;
  if (hasKey()) {
    try {
      // Rebuild the passage so the model argues from the text, not a summary
      let passage = s.passage ? Object.assign({}, s.passage) : null;
      try {
        await loadCorpus();
        const p = corpus.find(x => x.id === s.passageId);
        if (p) passage = Object.assign({}, passage || {}, { author: p.author, work: p.work, year: p.year, text: p.text });
      } catch (e) { /* offline; the thread alone still gives it plenty */ }

      next = await callClaude(
        INTERROGATION_SYSTEM_PROMPT,
        threadMessages(passage, s.transcript),
        700
      );
      status.textContent = '';
    } catch (err) {
      status.className = 'status err';
      status.textContent = 'Could not reach the API: ' + err.message + '. Using a bundled press.';
    }
  }

  if (!next) {
    const used = (s.transcript || []).filter(x => x.kind === 'press' || x.kind === 'followup').length;
    next = FALLBACK_PRESSES[used % FALLBACK_PRESSES.length];
    if (!hasKey()) status.textContent = '';
  }

  $('#detail-question').textContent = next;
  pending.hidden = false;
  $('#btn-detail-press').disabled = false;
  $('#btn-detail-press').textContent = 'Submit and press further';
  $('#detail-answer').focus();
});

$('#btn-detail-back').addEventListener('click', () => go('review'));

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

  const W = 320, H = 140, padL = 34, padR = 10, padT = 12, padB = 22;
  const vals = done.map(s => s.actualS / 60);
  const maxV = Math.max.apply(null, vals.concat([10]));
  const top = Math.ceil(maxV / 5) * 5;                       // round the scale to 5 minutes
  const x = i => padL + (W - padL - padR) * (done.length === 1 ? 0.5 : i / (done.length - 1));
  const y = v => padT + (H - padT - padB) * (1 - v / top);

  const path = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const dots = vals.map((v, i) =>
    '<circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2"/>').join('');

  // Gridlines carry the labels, so nothing sits on top of an axis.
  let grid = '';
  [0, top / 2, top].forEach(v => {
    grid += '<line class="grid" x1="' + padL + '" y1="' + y(v).toFixed(1) +
            '" x2="' + (W - padR) + '" y2="' + y(v).toFixed(1) + '"/>' +
            '<text class="tick tick-y" x="' + (padL - 6) + '" y="' + (y(v) + 3).toFixed(1) + '">' +
            Math.round(v) + 'm</text>';
  });

  const inner = grid +
    '<line class="axis" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '"/>' +
    '<path class="series" d="' + path + '"/>' + dots +
    '<text class="tick" x="' + padL + '" y="' + (H - padB + 15) + '">oldest</text>' +
    '<text class="tick tick-end" x="' + (W - padR) + '" y="' + (H - padB + 15) + '">latest</text>';

  host.innerHTML = svgWrap(inner, W, H);
  setText($('#metrics-length-note'),
    done.length + ' completed sessions. Current length ' + mmss(sessionLength()) +
    '; the cap is ' + mmss(MAX_LENGTH) + '.');
}

function renderCalibration() {
  const cal = state.reasoning.calibration;

  if (!cal.length) {
    setText($('#brier-score'), '—');
    setText($('#brier-sources'), '');
    $('#chart-calibration').innerHTML = '<p class="chart-empty">No calibration answers yet.</p>';
    $('#cal-table').innerHTML = '';
    return;
  }

  const meanBrier = cal.reduce((a, c) => a + c.brier, 0) / cal.length;
  setText($('#brier-score'), meanBrier.toFixed(3));

  const bySource = {};
  cal.forEach(c => { (bySource[c.source || 'trivia'] = bySource[c.source || 'trivia'] || []).push(c); });
  setText($('#brier-sources'), Object.keys(bySource).sort().map(k => {
    const rows = bySource[k];
    const m = rows.reduce((a, c) => a + c.brier, 0) / rows.length;
    return k + ' ' + m.toFixed(3) + ' (' + rows.length + ')';
  }).join('  ·  '));

  const buckets = CONF_LEVELS.map(L => {
    const rows = cal.filter(c => c.conf === L);
    return { conf: L, n: rows.length, hit: rows.length ? rows.filter(c => c.correct).length / rows.length : null };
  });

  const W = 320, H = 250, padL = 38, padR = 12, padT = 12, padB = 40;
  // x spans the confidence levels you can state. y spans the full range,
  // because how often you were actually right can be anything at all.
  const px = p => padL + (W - padL - padR) * ((p - 50) / 50);
  const py = p => (H - padB) - (H - padT - padB) * (p / 100);

  let inner = '';
  [0, 25, 50, 75, 100].forEach(v => {
    inner += '<line class="grid" x1="' + padL + '" y1="' + py(v).toFixed(1) +
             '" x2="' + (W - padR) + '" y2="' + py(v).toFixed(1) + '"/>' +
             '<text class="tick tick-y" x="' + (padL - 6) + '" y="' + (py(v) + 3).toFixed(1) + '">' + v + '</text>';
  });
  [50, 60, 70, 80, 90, 100].forEach(v => {
    inner += '<text class="tick tick-mid" x="' + px(v).toFixed(1) + '" y="' + (H - padB + 14) + '">' + v + '</text>';
  });

  inner += '<line class="axis" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '"/>' +
           '<line class="ideal" x1="' + px(50) + '" y1="' + py(50) + '" x2="' + px(100) + '" y2="' + py(100) + '"/>' +
           '<text class="tick tick-mid axis-label" x="' + ((padL + W - padR) / 2) + '" y="' + (H - 6) + '">how sure you said you were</text>' +
           '<text class="tick axis-label" transform="rotate(-90 10 ' + ((padT + H - padB) / 2) + ')" x="10" y="' + ((padT + H - padB) / 2) + '">% actually right</text>';

  const plotted = buckets.filter(b => b.n > 0);
  if (plotted.length > 1) {
    inner += '<path class="series" d="' +
      plotted.map((b, i) => (i ? 'L' : 'M') + px(b.conf).toFixed(1) + ' ' + py(b.hit * 100).toFixed(1)).join(' ') +
      '"/>';
  }
  plotted.forEach(b => {
    inner += '<circle class="dot" cx="' + px(b.conf).toFixed(1) + '" cy="' + py(b.hit * 100).toFixed(1) + '" r="3"/>';
  });

  $('#chart-calibration').innerHTML = svgWrap(inner, W, H);

  $('#cal-table').innerHTML =
    '<thead><tr><th>said</th><th>n</th><th>right</th><th>gap</th></tr></thead><tbody>' +
    buckets.map(b => {
      if (!b.n) return '<tr class="empty"><td>' + b.conf + '%</td><td>0</td><td>&mdash;</td><td>&mdash;</td></tr>';
      const hit = b.hit * 100;
      const gap = hit - b.conf;
      const cls = gap < -10 ? ' class="over"' : '';
      return '<tr' + cls + '><td>' + b.conf + '%</td><td>' + b.n + '</td><td>' + hit.toFixed(0) + '%</td><td>' +
             (gap > 0 ? '+' : '') + gap.toFixed(0) + '</td></tr>';
    }).join('') + '</tbody>';
}

function renderMathStats() {
  const sources = [
    ['arithmetic', state.math.history, state.math.level],
    ['logic', state.logic.history, state.logic.level],
    ['causal', state.causal.history, null],
    ['numbers', state.numbers.history, null]
  ];

  let html = '<div class="daygrid">' +
    '<div class="dg-type">day</div><div class="dg-num">answered</div><div class="dg-num">last 50</div>';

  sources.forEach(([name, hist, level]) => {
    const label = name + (level ? ' (level ' + level + ')' : '');
    if (!hist.length) {
      html += '<div class="dg-type">' + escapeHTML(label) + '</div>' +
              '<div class="dg-num">0</div><div class="dg-num">&mdash;</div>';
      return;
    }
    const recent = hist.slice(-50);
    const acc = Math.round(100 * recent.filter(r => r.correct).length / recent.length);
    html += '<div class="dg-type">' + escapeHTML(label) + '</div>' +
            '<div class="dg-num">' + hist.length + '</div>' +
            '<div class="dg-num">' + acc + '%</div>';
  });
  html += '</div>';

  const seen = new Set(state.reasoning.calibration.filter(c => c.source === 'trivia').map(c => c.id)).size;
  const total = (reasoningData && reasoningData.calibration) ? reasoningData.calibration.length : 395;
  html += '<p class="fineprint">Calibration bank: ' + (total - seen) + ' of ' + total +
          ' statements still unseen. Statements are drawn least-recently-seen first.</p>';

  $('#math-stats').innerHTML = html;
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

/* The cycle advances the moment a session completes, so the queued type is
   the NEXT assignment, not today's. Once something has been completed today,
   the home view says so and names today's work, rather than showing tomorrow
   as though it were due now. */
function sameCalendarDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() &&
         x.getMonth() === y.getMonth() &&
         x.getDate() === y.getDate();
}

function completedToday() {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.completed) return sameCalendarDay(s.ts, Date.now()) ? s : null;
  }
  return null;
}

function renderHome() {
  const done = completedToday();
  const next = todayType();

  $('#btn-review-today').hidden = !done;
  $('#btn-begin').className = done ? 'btn' : 'btn btn-primary';
  $('#btn-begin').textContent = done ? 'Begin another anyway' : 'Begin';

  if (done) {
    setText($('#home-cycle'), 'today · complete');
    setText($('#home-type'), done.type);
    setText($('#home-blurb'),
      'Today\'s work is done. ' + next.charAt(0).toUpperCase() + next.slice(1) +
      ' is next, whenever you come back to it.');
    $('#btn-review-today').onclick = () => openSessionDetail(done.ts);
  } else {
    setText($('#home-cycle'), 'cycle ' + (state.cycleIndex + 1));
    setText($('#home-type'), next);
    setText($('#home-blurb'), BLURB[next]);
  }

  setText($('#home-duration'), mmss(sessionLength()));
  setText($('#home-completed'), String(state.completedSessions));

  const toRamp = RAMP_EVERY - (state.completedSessions % RAMP_EVERY);
  setText($('#home-ramp'),
    sessionLength() >= MAX_LENGTH ? 'at the cap' : toRamp + ' session' + (toRamp === 1 ? '' : 's'));

  // Relabel the spec sheet so it describes what is actually on screen
  $('#label-duration').textContent = done ? 'held today' : 'duration';
  $('#home-duration').textContent = done ? mmss(done.actualS) : mmss(sessionLength());
  $('#label-ramp').textContent = done ? 'next up' : 'next ramp';
  if (done) setText($('#home-ramp'), next);

  if (done) {
    setText($('#home-note'), 'Come back tomorrow, or start another now. Another session counts and moves the rotation on.');
    renderHomeLog();
    return;
  }

  const type = next;
  const notes = [];
  if (type === 'argument') {
    if ((state.argument.days + 1) % 3 === 0 && state.positions.length) {
      notes.push('One of your own positions comes back today.');
    }
    notes.push(hasKey() ? 'Live interrogation is on.' : 'No API key: bundled questions only.');
  }
  if (type === 'math')  notes.push('Starting at level ' + state.math.level + '. No network needed.');
  if (type === 'logic') notes.push('Starting at level ' + state.logic.level + ' of 6. No network needed.');
  if (type === 'causal' || type === 'numbers') notes.push('Generated fresh. No network needed.');
  if (type === 'calibration') {
    const seen = new Set(state.reasoning.calibration.filter(c => c.source === 'trivia').map(c => c.id)).size;
    const total = (reasoningData && reasoningData.calibration) ? reasoningData.calibration.length : 395;
    notes.push((total - seen) + ' of ' + total + ' statements still unseen.');
  }
  if (type === 'steelman') {
    if ((state.steelman.days + 1) % 3 === 0 && state.positions.length) {
      notes.push('Today you argue against one of your own positions.');
    }
    notes.push(hasKey() ? 'Live evaluation is on.' : 'No API key: written presses only.');
  }
  setText($('#home-note'), notes.join(' '));
  renderHomeLog();
}

function renderHomeLog() {
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

  // The service worker is skipped on localhost. Offline caching is the point
  // in production, but during local work it serves yesterday's files and you
  // spend an afternoon debugging code the browser is not running.
  const isLocal = ['localhost', '127.0.0.1', '::1'].indexOf(location.hostname) !== -1;
  if ('serviceWorker' in navigator && !isLocal) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('sw registration failed', err));
    });
  } else if (isLocal && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister()))
      .catch(() => {});
  }
}

boot();
