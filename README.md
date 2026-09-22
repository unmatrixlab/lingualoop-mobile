# LinguaLoop Mobile

An installable, offline vocabulary companion for LinguaLoop 3.

## Privacy

GitHub Pages hosts only the application shell. Imported study packs and review progress are stored locally in the browser with IndexedDB. The published repository contains no personal LinguaLoop projects or vocabulary.

## Current scope

- Daily due queue
- Recall cards with four review ratings
- Written recall
- Multiple studies stored locally
- Full-row study switching and protected on-device deletion
- Offline PWA support
- Private same-Wi-Fi QR and clipboard transfer from LinguaLoop 3
- Compressed `#packz=` payload import with legacy `#pack=` compatibility

## Study pack format

LinguaLoop 3 creates a short-lived local QR route. Scanning it in the iPhone Camera opens a local handoff page in Safari. The user copies the compressed transfer, returns to the installed Home Screen app and taps **Paste study**. This explicit handoff is required because iOS keeps Safari storage separate from an installed Home Screen web app. GitHub Pages never receives the vocabulary; the transfer stays between the computer, clipboard and installed app.

Direct `#packz=` URL import remains supported for browsers and platforms that keep the web app in the same storage context.

The decoded study pack uses this structure:

```json
{
  "version": 1,
  "studies": [{
    "id": "stable-project-id",
    "name": "Study name",
    "color": "#76a8ff",
    "cards": [{
      "id": "stable-card-id",
      "english": "Target phrase",
      "spanish": "Translation",
      "context": "Optional context",
      "level": 0,
      "dueAt": 0,
      "reviews": 0,
      "correct": 0
    }]
  }]
}
```
