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
- Private same-Wi-Fi QR transfer from LinguaLoop 3
- Compressed `#packz=` payload import with legacy `#pack=` compatibility

## Study pack format

LinguaLoop 3 creates a short-lived local QR route. The phone receives the selected studies directly from the computer and opens this PWA with a DEFLATE-compressed Base64URL payload in the URL fragment. GitHub Pages never receives the fragment or the vocabulary.

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
