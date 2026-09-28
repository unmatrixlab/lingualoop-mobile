# LinguaLoop Mobile

An installable, offline vocabulary companion for LinguaLoop 3.

## Privacy

GitHub Pages hosts only the application shell. Imported study packs and review progress are stored locally in the browser with IndexedDB. The published repository contains no personal LinguaLoop projects or vocabulary.

## Current scope

- Bounded daily sessions of 5, 8 or 10 words from the current study or all studies
- Evidence-aware spacing: same-day repeats and guided practice do not inflate mastery
- Three clear practice choices: Cards, Write and Listen
- Progressive meaning/spelling hints and a gentle retry before showing the answer
- A stable session goal with a final pass for difficult words when other words intervene
- Automatic session and written-draft recovery after reopening
- Learned words can be removed from phone practice with confirmation, Undo and permanent access to Restore in Studies
- Removals and phone progress survive updated desktop imports
- Full-screen layouts with neutral graphite/blue practice and library screens, solid study cards and fixed control positions
- Compact two-sided cards with a gentle flip, English on the front and Spanish on the back
- Two recall actions: Need practice and I knew it
- Always-visible, evenly sized session-setting buttons, stable feedback/control positions and pronunciation on each card face
- Study rows use a soft background tint matching their imported study color
- English and Spanish card pronunciation
- Complete bilingual transcripts with individual and continuous device-voice reading
- Full-video comprehension with active-subtitle following, direct seeking and individual subtitle clips; desktop chains do not affect phone playback
- Saved words and phrases highlighted throughout the English transcript using their vocabulary colors
- Tap a marked word for a full-screen view of its saved meaning and pronunciation, followed by guided practice; closing returns to the same passage
- Read-only view, English/Spanish/both display and a filter for lines containing saved words
- Multiple studies stored locally
- Full-row study switching and protected on-device deletion
- Offline reading and vocabulary practice after the app is installed; YouTube still requires a connection and device voices depend on the phone
- Private same-Wi-Fi QR and clipboard transfer from LinguaLoop 3
- Compressed `#packz=` payload import with legacy `#pack=` compatibility

## Study pack format

LinguaLoop 3 creates a short-lived local QR route. Scanning it in the iPhone Camera opens a local handoff page in Safari. The user copies the compressed transfer, returns to the installed Home Screen app and taps **Paste study**. This explicit handoff is required because iOS keeps Safari storage separate from an installed Home Screen web app. GitHub Pages never receives the vocabulary; the transfer stays between the computer, clipboard and installed app.

Direct `#packz=` URL import remains supported for browsers and platforms that keep the web app in the same storage context.

Sending an updated study replaces its content while preserving the review progress and playback position already stored on this phone. The phone remains a separate practice history; progress does not sync back to the computer. Optional `colorIndex` preserves an explicitly chosen desktop vocabulary color. Older packs remain compatible and receive stable default colors.

The decoded study pack uses this structure:

```json
{
  "version": 4,
  "studies": [{
    "id": "stable-project-id",
    "name": "Study name",
    "color": "#76a8ff",
    "media": {
      "type": "youtube",
      "id": "YouTube-video-id",
      "name": "Source video title"
    },
    "transcript": [{
      "id": "subtitle-1",
      "start": 42.2,
      "end": 45.1,
      "en": "Complete English subtitle.",
      "es": "Subtítulo completo en español.",
      "chain": 0
    }],
    "cards": [{
      "id": "stable-card-id",
      "english": "Target phrase",
      "spanish": "Translation",
      "context": "Optional context",
      "colorIndex": 4,
      "clip": { "start": 42.2, "end": 47.8 },
      "level": 0,
      "dueAt": 0,
      "reviews": 0,
      "correct": 0
    }]
  }]
}
```

## Learning and recovery

The screen is the main surface, with no nested decorative panels. Cards show one face at a time. Tap the card to reveal its answer, or tap again to turn back; reveal, hints and feedback do not move the card or action buttons. Listening controls are separate from the flip action. Long content scrolls within each face. The hidden face is also hidden from keyboard focus and assistive technology, and reduced-motion settings disable the flip animation. The reader keeps its video and navigation controls fixed while the transcript scrolls. Studies and Learned words are separate fixed tabs, and manual transfer is always available on Add study.

Practice home keeps Cards / Write / Listen, study source and session size visible together. Choose a mode, then Start; an unfinished session has a quiet Continue action. New sessions stay in the chosen mode. Older unfinished mixed sessions can still be completed without losing their progress. Read & listen remains directly available from the bottom navigation. A first independent recall schedules a review after one day; subsequent independent successful days can grow the interval to 3, 7, 14 and 30 days. Strong requires at least three successful days. Hints, errors, revealed answers and immediate retries do not create evidence of independent mastery. Statistics show first-attempt recall since this update, without reinterpreting old self-ratings as measured retention.

The phone stores its unfinished session, typed draft, evidence and progress in the existing local library. Importing the same study preserves these fields by stable study and word IDs. Removing a word as learned archives it locally rather than deleting desktop vocabulary; it disappears from phone practice and transcript vocabulary highlighting. Use Studies → Learned words → Restore to bring it back. Reimports preserve removal records even when a removed word is temporarily absent from the incoming pack.

Device speech is initiated by a tap. Voices depend on the phone; listening falls back to written practice if speech is unavailable. No remote AI or analytics service is required for learning. YouTube remains online-only.
