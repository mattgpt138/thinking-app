# thinking-app

A daily practice tool for critical thinking, mental arithmetic, and reasoning
under uncertainty. Single user, static files, no build step, no framework, no
npm. Everything you produce stays in your browser.

---

## The core mechanic

Three day types rotate evenly:

```
argument → math → reasoning → argument → …
```

The rotation is driven by a **cycle index that only increments when a session is
completed**. Skipping a day does not skip a type. Abandoning a session leaves
the index where it was, so the type you missed is the type you get next time.

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

## The three days

### Argument

One passage from `data/corpus.json`, read at your own pace, followed by
interrogation questions one at a time with a box to write in.

- Passages are tracked as seen and will not repeat until the corpus is
  exhausted, at which point the rotation starts again.
- Two or three hand-written questions ship with every passage.
- With an API key set, each answer you give is pressed further by a live
  adversarial follow-up. Without a key, a rotating bank of generic presses is
  used instead.
- **Every third argument day** pulls one entry out of your position file:
  *"Here's what you wrote. This passage bears on it. Revise or defend."* Your
  answer is stored as a new revision of that position.

### Math

Locally generated, no network involved. Eight difficulty levels:

| Level | Content |
|-------|---------|
| 1 | 2-digit addition and subtraction |
| 2 | 2-digit × 1-digit |
| 3 | percentages of round numbers |
| 4 | 2-digit × 2-digit |
| 5 | fraction to decimal, division with remainder |
| 6 | 3-digit × 1-digit, percent change |
| 7 | squares, harder 2-digit products |
| 8 | compound multi-step: successive percentages, weighted averages |

Difficulty adapts on a rolling window of the last 10 problems **at the current
level**: above 85% accurate *and* fast enough moves you up; below 60% moves you
down. Time per problem is recorded.

Division-with-remainder answers accept `7 r 3`, `7r3`, or `7 remainder 3`.

### Reasoning

Rotates through three sub-modes, advancing one step per completed reasoning day.

**Calibration.** A binary factual statement. Pick True or False, then a
confidence level from 50 / 60 / 70 / 80 / 90 / 95%. Scored with Brier:

```
p     = confidence      if you answered True
        1 − confidence  if you answered False
brier = (p − actual)²        where actual is 1 if the statement is true, else 0
```

Lower is better. 0.25 is what you score by saying 50% to everything. The record
view plots your hit rate against your stated confidence; points below the
diagonal mean overconfidence at that level.

**Fermi.** An estimation prompt with no lookups allowed. You write a
decomposition and commit to a figure, then a reference decomposition and the
accepted order-of-magnitude band are revealed. Figures may be entered as
`800000`, `800,000`, `8e5`, or `8 x 10^5`.

**Base rate.** Conditional-probability problems generated fresh with randomised
numbers, so nothing can be memorised. Four templates: diagnostic screening, the
cab identification problem, two production lines, and a description-fits-a-group
problem. Answers are graded within 2 percentage points or 5% relative,
whichever is looser, and a full worked solution follows.

---

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

- `INTERROGATION_SYSTEM_PROMPT` — used during argument days
- `CHALLENGE_SYSTEM_PROMPT` — used by *Challenge this* on positions

Both are at the **top of `app.js`**, in a clearly marked block, deliberately
placed there so they are easy to find and tune. They work by banning specific
behaviours (opening praise, hedging, summarising your answer back, resolving the
difficulty for you) rather than by asking for adjectives like "critical". If
responses start feeling agreeable again, sharpen the prohibitions.

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

70 calibration statements ship, **split exactly 35 true / 35 false** so that
guessing one way cannot pay. Keep that balance when adding more, or the
calibration curve stops meaning anything. `low` and `high` on a Fermi prompt
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

## Files

```
index.html              markup for every view
style.css               the whole design
app.js                  everything else; prompts are at the top
data/corpus.json        53 passages
data/reasoning.json     70 calibration statements, 17 Fermi prompts
manifest.webmanifest    PWA metadata
sw.js                   offline caching
icons/                  app icons
```

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

Mobile-first and portrait. Keyboard focus is always visible, and
`prefers-reduced-motion` is respected.
