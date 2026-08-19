# thinking-app

A daily practice tool for critical thinking, mental arithmetic, and reasoning
under uncertainty. Single user, static files, no build step, no framework, no
npm. Everything you produce stays in your browser.

---

## The core mechanic

Seven day types rotate evenly, one per week each:

```
argument → logic → steelman → math → causal → numbers → calibration → …
```

Three of them are writing you defend under pressure. Four are generated,
objectively scorable, and work with no network at all.

The rotation is driven by a **cycle index that only increments when a session is
completed**. Skipping a day does not skip a type. Abandoning a session leaves
the index where it was, so the type you missed is the type you get next time.

Because the index advances the moment a session completes, the queued type is
the *next* assignment rather than today's. The **today** tab accounts for this:
once anything has been completed on the current calendar day it shows that day's
work as done, names what is next, and offers to reopen what you wrote. Starting
another session anyway is still one tap away, and it counts.

Session length starts at **10:00**, gains **60 seconds every 6 completed
sessions**, and stops at **40:00**.

### The timer

The timer hides its numeric readout until the final 60 seconds. A thin arc fills
instead.

This is the point of the app, not an omission. Clock-watching is the enemy of
focus. Please do not "fix" it by adding a visible countdown.

**The limit is soft.** When the time runs out the arc completes and a line
appears saying so. Nothing closes, nothing is interrupted, and whatever you are
typing is left alone. You finish the thought you are in and close the session
yourself. Once the time has elapsed the session counts as completed however long
you carry on past it, and the extra time is recorded honestly in the session
length. Before the time is up the same button abandons instead.

### A session survives a reload

A session in progress is written to its own localStorage key
(`thinking-app:live`) on every meaningful change, including whatever is
half-typed in the box. Reload, pull-to-refresh, or iOS discarding the tab
under memory pressure all resume exactly where you were: same passage, same
question, same unfinished sentence, and a timer still measured from when you
actually started.

Before this, a refresh dropped you back to **today**, and because the passage
had already been marked as seen you were given a different one. Everything
written in that session was gone.

The saved session is cleared when the session closes or is abandoned, is
ignored if it is more than 12 hours old, and is discarded on import or erase.

### Review

Every session is kept, finished or not, and can be reopened from the **review**
tab. An argument session reopens as what it was: the passage, every question put
to you, and everything you wrote.

From there you can keep going with no clock running. *Press me further* sends the
passage and the whole thread back through the interrogation prompt and asks the
next question; your answers are appended to the same transcript. Without a key,
or if the call fails, it falls back to the bundled press bank, so the thread
never dead-ends.

Abandoning a session does not throw the writing away. It only means the session
does not count towards the rotation.

### What is measured

Two things, and only two: **session length over time** and **Brier calibration
score**. There are no streaks, no points, no badges, and nothing that celebrates
you for showing up. Showing up is the baseline, not an achievement.

---

## The seven days

### Argument

One passage from `data/corpus.json`, read at your own pace, then interrogated.

- 53 passages, 24 works, transcribed verbatim from Project Gutenberg.
- Passages do not repeat until the corpus is exhausted.
- With a key the session is a conversation: every answer gets a reply that
  engages with what you wrote, argues back, and then presses.
- **Every third argument day** pulls an entry from your position file:
  *"Here's what you wrote. This passage bears on it. Revise or defend."*

### Logic

Formal validity with the content stripped out. Six adaptive levels:

| Level | Content |
|-------|---------|
| 1 | modus ponens and tollens against affirming the consequent and denying the antecedent |
| 2 | contrapositive, converse and inverse |
| 3 | negating "all", "some" and "none" |
| 4 | categorical syllogisms |
| 5 | necessary against sufficient conditions |
| 6 | validity against soundness, and the Wason selection task |

Subject terms and predicates are drawn at random, so the same form never
arrives in the same clothes. Nothing here can be memorised, and none of it
touches the network. Difficulty adapts on the last 10 at the current level.

### Steelman

You are handed a proposition and asked to build the strongest case **for** it,
whatever you privately think. The lazy version of the argument is named up
front so you cannot give it.

- 40 contested propositions in `data/propositions.json`, across ethics,
  epistemology, politics, aesthetics and modern life.
- With a key it then tells you whether you built the strong case or the
  convenient one, supplies the version you missed, and presses.
- **Every third steelman day** turns your own position file against you: build
  the case that would defeat something you actually believe.

Every other day trains taking an argument apart. This is the only one that
trains putting one together, which is the harder half.

### Math

Mental arithmetic, eight adaptive levels, generated locally.

| Level | Content |
|-------|---------|
| 1 | 2-digit addition and subtraction |
| 2 | 2-digit × 1-digit |
| 3 | percentages of round numbers |
| 4 | 2-digit × 2-digit |
| 5 | fraction to decimal, division with remainder |
| 6 | 3-digit × 1-digit, percent change |
| 7 | squares, harder 2-digit products |
| 8 | successive percentages, weighted averages |

Above 85% accurate *and* fast enough moves you up; below 60% moves you down.

### Causal

Generated scenarios in five families: confounding, selection effects, reverse
causation, regression to the mean, and Simpson's paradox with numbers that
actually work out. Each has a scorable multiple choice and a written follow-up
with a reference answer that stays shut until you commit.

### Numbers

Quantities as they arrive in the wild, drawn from three pools:

- **Statistical literacy** — relative against absolute risk, percentages
  against percentage points, missing denominators, mean against median under
  skew, P(A|B) confused with P(B|A), and the law of small numbers.
- **Base rates** — diagnostic screening, the cab problem, two production
  lines, description-fits-a-group. Randomised numbers every time.
- **Fermi estimation** — 17 prompts with full reference decompositions and an
  accepted order-of-magnitude band.

### Calibration

A statement, true or false, and how sure you are.

- **395 statements**, split 52/48 true to false, across eight categories.
- Drawn least-recently-seen first, so the gap between repeats is as long as
  the bank allows. The number still unseen is shown on the day.
- Scored with Brier (see below).

### Where the confidence rating appears

On calibration, logic and causal days. All three feed **one** calibration
curve, tagged by source, so the record screen shows both the combined figure
and how it breaks down. Knowing you are overconfident about syllogisms is
worth more than knowing it about trivia, which is why it is attached to the
reasoning as well as the recall.

```
p     = the probability you assigned to the answer you gave
brier = (p − outcome)²        outcome is 1 if you were right, else 0
```

Lower is better. 0.25 is what you score by saying 50% to everything. Points
below the diagonal on the curve mean overconfidence at that level.

## Position file

A separate view where you write down what you actually believe, in your own
words. Every entry keeps its **full revision history with timestamps**; nothing
is ever overwritten.

With an API key, *Challenge this* generates the strongest available
counterargument and files it against the position.

---

## Anthropic API integration

Entirely optional. Set an API key and a model string under **settings**. The key
is kept in this browser's `localStorage` and sent only to `api.anthropic.com`.
Browser calls include the `anthropic-dangerous-direct-browser-access: true`
header.

The default model is `claude-sonnet-5`, at roughly 3p per argument day. Only
argument days ever call the API. `claude-haiku-4-5` costs about a third as much
and presses more softly; `claude-opus-5` costs more and presses hardest.

**Nothing blocks on the network.** Every API call has a 25-second timeout and
every call site falls back to bundled content on failure. A session with no key,
no signal, or a dead API is still a complete session.

### The interrogation prompt

The default behaviour of a language model asked to critique your reasoning is
flattery, and flattery makes the whole exercise worthless. Two system prompts
exist to fight it:

Both are at the **top of `app.js`**, in a clearly marked block, deliberately
placed there so they are easy to find and tune.

There are three: `INTERROGATION_SYSTEM_PROMPT` for argument days,
`STEELMAN_SYSTEM_PROMPT` for steelman days, and `CHALLENGE_SYSTEM_PROMPT` for
*Challenge this* on positions.

`INTERROGATION_SYSTEM_PROMPT` requires three things of every reply, in order:

1. **Engage** — say what your answer commits you to, naming the actual move you
   made. A sentence that would fit any answer is a wasted sentence.
2. **Counter** — give the strongest argument against the position you just took,
   stated as an argument with its reasoning, not as a hint.
3. **Press** — one question that follows from that counter-argument.

The prohibitions do the anti-flattery work: no praise, no grading the answer, no
hedging, no splitting the difference, no repeating a question. The distinction
that matters is between **engaging with a point and complimenting it**. An
earlier version of this prompt banned both, and the result was a machine that
asked disconnected questions and never argued back. If replies drift agreeable
again, sharpen the prohibitions rather than the adjectives.

---

### Token budgets and reasoning

The model reasons before it answers, and that reasoning is billed against
`max_tokens` like any other output. Budgets sized for a model that did not
reason spent the whole allowance on the reasoning: the reply came back cut off
mid-sentence, or with no text at all, and the session silently fell back to the
bundled questions.

Two constants at the top of `app.js` control this:

- `REPLY_TOKENS` (3000) — the budget for every conversational call. Big enough
  that the reasoning and the reply both fit.
- `REASONING_EFFORT` (`low`) — how hard the model thinks before replying. Low
  keeps a press to about seven seconds and still lands on the weak point.
  Raise it to `medium` or `high` to trade a few seconds for a harder look.

`API_TIMEOUT` is 40 seconds, which leaves headroom: a press takes roughly eight
seconds early in a session and grows with the length of the transcript.

The connection test in Settings is the one call that turns reasoning off. It
only needs a 200 back.

---

## Local work with a key

`.env.local` holds the API key on this machine. It is gitignored, and so is the
`local-key.js` generated from it:

```sh
python3 make-local-key.py     # reads .env.local, writes local-key.js
```

`app.js` loads `local-key.js` only when the page is on localhost, so local work
does not need the key typed into Settings every time storage is cleared. Delete
the file to test the no-key path.

**None of this reaches the deployed app.** This is a static site served
publicly from GitHub Pages, so a key shipped with it would be a key published.
Each device gets its key by being typed into Settings once, where it lives in
that device's own storage.

---

## Your data

Everything lives in `localStorage` under the key `thinking-app:v1`. Nothing is
synced anywhere.

- **Export JSON** writes the whole state to a dated file.
- **Import** validates and replaces it. Missing fields are repaired rather than
  rejected, so a hand-edited file will still load.

---

## Corpus schema

`data/corpus.json` is an array of passage objects. To add a passage, append one:

```json
{
  "id": "ol-harm",
  "author": "John Stuart Mill",
  "work": "On Liberty",
  "year": 1859,
  "source_url": "https://www.gutenberg.org/ebooks/34901",
  "text": "The object of this Essay is to assert one very simple principle…",
  "questions": [
    "Mill says power may be used over an unwilling person only to prevent harm to others. Name a case where you accept coercion that this rule forbids.",
    "Where exactly does 'harm to others' stop expanding?"
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique. Used to track which passages you have seen, so never reuse or renumber one. |
| `author` | string | Shown above the passage. |
| `work` | string | Shown above the passage. Note the translator here for translated works. |
| `year` | number | Publication year of *this text or translation*. |
| `source_url` | string | Linked under the passage. |
| `text` | string | The passage. Paragraphs separated by a blank line (`\n\n`). `<em>` is the only markup permitted; everything else is escaped. |
| `questions` | string[] | Two or three, written by hand. |

### Rules for adding passages

1. **400–800 words.** Long enough to carry an argument, short enough to hold in
   your head.
2. **Self-contained and argumentatively load-bearing.** The passage must make a
   claim and support it. A vivid description is not a passage.
3. **Verbatim, or omit.** Never write a passage from memory or paraphrase.
   Transcribe exactly from the source.
4. **Pre-1930 publication only.** For translated works, use a **pre-1930
   translation** — modern translations carry their own copyright. Every
   translation shipped here (Marriott, Cole, Long, Jowett, Burnet, Moore) is out
   of copyright.
5. **Write the questions yourself.** They should try to break the reader's
   reading, not check comprehension. The bundled ones aim at unstated premises,
   overreaching principles, and conclusions that do not follow.

### What ships

53 passages, 400–787 words each, from 24 works by 24 authors, all transcribed
from Project Gutenberg: Mill (*On Liberty*, *Utilitarianism*), Hume, Thoreau
(*Civil Disobedience*, *Walden*), Douglass, Wollstonecraft, Epictetus, the
Federalist Papers, Adam Smith, William James (*Pragmatism*, *The Will to
Believe*), Darwin, Paine, Machiavelli, Du Bois, Veblen, Russell, Locke,
Rousseau, Emerson, More, Marx and Engels, and Plato.

Project Gutenberg's own header, footer, and footnote markers are stripped;
italic markup becomes `<em>`. The author's words are untouched.

## Reasoning data schema

`data/reasoning.json` holds two arrays.

```json
{
  "calibration": [
    {
      "id": "c-everest",
      "category": "geography",
      "statement": "The summit of Mount Everest is the point on Earth's surface farthest from the planet's centre.",
      "answer": false,
      "note": "Chimborazo in Ecuador is farther out, because the Earth bulges at the equator."
    }
  ],
  "fermi": [
    {
      "id": "f-tuners",
      "prompt": "How many piano tuners work in Chicago?",
      "unit": "tuners",
      "low": 30,
      "high": 600,
      "reference": ["Chicago metro population: about 9 million…", "…"],
      "answer": "About 80 to 200."
    }
  ]
}
```

395 calibration statements ship, **split 207 true to 188 false** so that
guessing one way cannot pay. Keep that balance when adding more, or the
calibration curve stops meaning anything. Every statement must be checkable:
one wrong "fact" both teaches you something false and corrupts the score. `low` and `high` on a Fermi prompt
bound the accepted order-of-magnitude band.

---

## Running it

It is static files. Open `index.html` through any web server:

```sh
python3 -m http.server 8000
```

`file://` will not work — service workers and `fetch` of the data files both
need a real origin.

### Deploying to GitHub Pages

Push the repository, then in **Settings → Pages** select the branch and the root
folder. Every path in the app is relative, so it works from a project subpath
such as `username.github.io/thinking-app/` with no configuration.

### Installing

Open it in a mobile browser and choose *Add to Home Screen*. It installs as a
standalone app and works offline: math days and reasoning days need no network
at all, and argument days use any passage already cached.

After changing a shell file or either data file, bump `CACHE_VERSION` in `sw.js`
so the old cache is discarded.

---

## Tests

Start a server as above and open `test.html`. It runs in the browser, needs no
install step and no build, and works on the phone as well as the laptop. The
summary line at the top is the whole result: green or a count of failures.

```sh
python3 -m http.server 8000
# then open http://localhost:8000/test.html
```

`?filter=live` runs only the groups whose name contains that word, which is
what you want while working on one area.

### How it works

The page fetches the real `index.html`, injects its body so that every
`$('#id')` in `app.js` resolves, then loads the real `app.js` beside it. There
is no second copy of the markup to keep in step, and nothing is stubbed except
storage.

`app.js` ends with `if (!window.THINKING_APP_TEST) boot();`, which is the only
line in the app that exists for the tests. The test page sets that flag before
loading it, so the app does not start a session underneath the run.

Storage is replaced with an in-memory stand-in for the whole run and every test
starts from a blank state, so opening `test.html` on the live site cannot eat a
session. If the browser refuses the swap the run stops rather than risk it.

Every request the harness makes carries `?harness=1`. The service worker matches
its shell cache with `ignoreSearch`, so a timestamp alone would not get past it,
and the tests would quietly run against yesterday's `app.js` and still come up
green.

### What is covered

- The three data files: schema, unique ids, balanced `<em>` tags, the
  true/false split in the calibration bank, Fermi bands the right way round.
- Text and number helpers, including every form the answer matcher accepts.
- The rotation, the session length ramp and its ceiling.
- `migrate()`, which is what stands between an imported file and a crash.
- A session surviving a reload: the passage, the phase, the transcript, the
  half-typed sentence, the clock measured from the original start, the stale
  cutoff, and corrupt data falling back to a normal start.
- Every generator, checked over 200 samples each: shape, option indexes in
  range, no repeated options, and for arithmetic the stated answer re-derived
  from the stated question.
- Scoring, including the Brier score, and which day a confidence rating is
  logged against.
- What comes next: no passage, proposition or calibration statement repeats
  until its pool is used up.
- The message thread sent to the API, which must alternate roles and never
  carry an empty turn.
- Routing, and that every render survives an empty state.
- Difficulty adaptation in both directions, including its bounds.
- The service worker's file list and the manifest.

### Adding a test

Put it inside a `group()` in `tests.js`. Two rules:

1. No test may touch real saved data. Storage is faked and `reset()` runs
   before every test; use `reload()` when the point is that memory is cleared
   but storage is not.
2. Anything generated is checked over many samples, not one. The whole point of
   the generators is that the numbers change each time.

---

## Files

```
index.html                markup for every view
style.css                 the whole design
app.js                    everything else; the prompts are at the top
data/corpus.json          53 passages
data/reasoning.json       395 calibration statements, 17 Fermi prompts
data/propositions.json    40 contested propositions for steelman day
manifest.webmanifest      PWA metadata
sw.js                     offline caching
test.html                 the test runner; open it in a browser
tests.js                  the tests themselves
make-local-key.py         writes local-key.js from .env.local (no secret in it)
icons/                    app icons
```

Logic, causal and numbers problems are generated in `app.js` rather than
stored, which is what makes them unmemorisable.

## Design notes

Deliberately non-stimulating. This app refuses to be exciting.

```
paper    #E2E5DE      ink       #1C211F      rule    #C3C9C0
raised   #EDEFE9      ink-soft  #4A534E      brass   #8A6E3C
                                             oxblood #6B4A4A
```

Two typefaces, and the split between them is the point: **Spectral** for
passages and questions, **IBM Plex Mono** for all chrome, labels, and the timer.
Chrome reads as instrument; content reads as book. Both fall back to system
fonts if Google Fonts is unreachable.

Mobile-first and portrait.

- Navigation sits at the **bottom** on phones, where a thumb reaches and
  where five labels cannot wrap; it returns to the top above 40rem. The old
  top row fit at 414px and broke at 390px, which is most phones.
- Every tap target is at least 44px.
- The timer rides in a sticky bar so the arc stays on screen while you scroll
  a passage several screens deep. It is the only sign that time is passing.
- Safe-area insets are respected at the top and under the home indicator.
- Keyboard focus is always visible, and `prefers-reduced-motion` is respected.
- The service worker does not register on localhost, so local edits are never
  masked by yesterday's cache.
