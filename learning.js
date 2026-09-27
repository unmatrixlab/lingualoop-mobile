/* Pure text helpers shared by transcript highlighting and written recall. */
(() => {
  'use strict';
  const colors = ['#c8ff4a', '#69c7ff', '#ff8f82', '#c99cff', '#50e3c2', '#ffc66d'];
  const cache = new WeakMap();
  function tokens(text) {
    return [...String(text || '').matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(match => ({
      key: match[0].normalize('NFC').toLocaleLowerCase('en').replace(/’/g, "'"),
      start: match.index, end: match.index + match[0].length
    }));
  }
  function buildTrie(cards) {
    const root = new Map();
    for (const card of cards) {
      const parts = tokens(card.english);
      if (!parts.length) continue;
      let node = root;
      for (const part of parts) {
        if (!node.has(part.key)) node.set(part.key, new Map());
        node = node.get(part.key);
      }
      if (!node.card) node.card = card;
    }
    return root;
  }
  function findMatches(text, trie) {
    const parts = tokens(text), matches = [];
    for (let i = 0; i < parts.length; i++) {
      let node = trie, best = null;
      for (let j = i; j < parts.length; j++) {
        if (j > i && !/^[\s\-–—]+$/u.test(text.slice(parts[j - 1].end, parts[j].start))) break;
        node = node.get(parts[j].key);
        if (!node) break;
        if (node.card) best = { start: parts[i].start, end: parts[j].end, card: node.card, last: j };
      }
      if (best) { matches.push(best); i = best.last; }
    }
    return matches;
  }
  function indexFor(study) {
    if (!study) return { cues: [], byCard: new Map(), matched: new Set() };
    const prior = cache.get(study);
    if (prior?.cards === study.cards && prior?.transcript === study.transcript) return prior;
    const cards = study.cards || [], transcript = study.transcript || [];
    const trie = buildTrie(cards), byCard = new Map(), matched = new Set();
    const cues = transcript.map((cue, index) => {
      const matches = findMatches(cue.en, trie);
      for (const match of matches) {
        matched.add(match.card.id);
        if (!byCard.has(match.card.id)) byCard.set(match.card.id, []);
        const occurrences = byCard.get(match.card.id);
        if (occurrences[occurrences.length - 1] !== index) occurrences.push(index);
      }
      return matches;
    });
    const result = { cards, transcript, trie, cues, byCard, matched };
    cache.set(study, result);
    return result;
  }
  function colorIndex(card) {
    if (card.colorIndex !== null && card.colorIndex !== undefined && Number.isInteger(Number(card.colorIndex))) return Math.abs(Number(card.colorIndex)) % colors.length;
    return [...String(card.english || '')].reduce((sum, char) => sum + char.codePointAt(0), 0) % colors.length;
  }
  function contextFor(study, card, preferredIndex = -1) {
    if (!card) return null;
    const indexes = indexFor(study).byCard.get(card.id) || [];
    const index = indexes.includes(preferredIndex) ? preferredIndex : indexes[0];
    const text = study?.transcript?.[index]?.en || String(card.context || '').split(' · ')[0].trim();
    const ranges = findMatches(text, buildTrie([card]));
    if (!text || !ranges.length) return null;
    // A context must contain something beyond the answer itself.
    let masked = '', cursor = 0;
    for (const range of ranges) { masked += text.slice(cursor, range.start) + '____'; cursor = range.end; }
    masked += text.slice(cursor);
    if (!tokens(masked.replace(/____/g, '')).length) return null;
    return { text, masked, index: Number.isInteger(index) ? index : -1 };
  }
  function normalizedAnswer(value) {
    return tokens(value).map(token => token.key).join(' ');
  }
  function reviewSchedule(card, rating) {
    const level = Math.max(0, Math.min(5, Number(card.level) || 0));
    if (rating === 'again') return { level: 0, days: 0, delay: 60000 };
    if (rating === 'hard') return { level: Math.max(1, level - 1), days: 1, delay: 86400000 };
    const next = Math.min(5, Math.max(rating === 'easy' ? 3 : 2, level + (rating === 'easy' ? 2 : 1)));
    const days = [0, 1, 3, 7, 14, 30][next];
    return { level: next, days, delay: days * 86400000 };
  }
  function shuffled(values, random = Math.random) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  window.LinguaLoopLearning = { colors, tokens, buildTrie, findMatches, indexFor, colorIndex, contextFor, normalizedAnswer, reviewSchedule, shuffled };
})();
