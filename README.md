# LinguaLoop Mobile

An installable, offline vocabulary companion for LinguaLoop 3.

## Privacy

GitHub Pages hosts only the application shell. Imported study packs and review progress are stored locally in the browser with IndexedDB. The published repository contains no personal LinguaLoop projects or vocabulary.

## Current scope

- Daily due queue
- Recall cards with four review ratings
- Written recall
- Multiple studies stored locally
- Offline PWA support
- Incoming `#pack=` payload support for the future LinguaLoop 3 QR transfer

## Study pack format

The first protocol version accepts a Base64URL-encoded JSON object in the URL fragment:

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
