/* Offline text, practice and progress helpers shared by the mobile learning flows. */
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
    const trie = buildTrie(cards.filter(card => !card.retiredAt)), byCard = new Map(), matched = new Set();
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
  function contextFor(study, card, preferredIndex = -1, rotation = 0) {
    if (!card) return null;
    const indexes = indexFor(study).byCard.get(card.id) || [];
    const offset = Math.max(0, Math.floor(Number(rotation) || 0));
    const candidates = indexes.includes(preferredIndex)
      ? [preferredIndex, ...indexes.filter(index => index !== preferredIndex)]
      : indexes.map((_, i) => indexes[(i + offset) % indexes.length]);
    // A repeated occurrence may be only the word itself. Try the next real sentence.
    const sources = candidates.map(index => ({ text: study?.transcript?.[index]?.en || '', index }));
    sources.push({ text: String(card.context || '').split(' · ')[0].trim(), index: -1 });
    const trie = buildTrie([card]);
    for (const source of sources) {
      const ranges = findMatches(source.text, trie);
      if (!source.text || !ranges.length) continue;
      let masked = '', cursor = 0;
      for (const range of ranges) { masked += source.text.slice(cursor, range.start) + '____'; cursor = range.end; }
      masked += source.text.slice(cursor);
      if (tokens(masked.replace(/____/g, '')).length) return { ...source, masked };
    }
    return null;
  }
  function normalizedAnswer(value) {
    return tokens(value).map(token => token.key).join(' ');
  }
  const DAY = 86400000;
  const validModes = new Set(['cards', 'write', 'listen']);
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const count = value => Math.max(0, Math.floor(finite(value)));
  function dayKey(now) {
    const date = new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''; }
  function normalizeProgress(card = {}) {
    const level = Math.max(0, Math.min(5, count(card.level)));
    const reviews = count(card.reviews), successDays = Math.min(reviews, count(card.successDays));
    return {
      // Keep the previous schedule when importing an existing phone library.
      level, dueAt: Math.max(0, finite(card.dueAt)), reviews,
      correct: Math.min(reviews, count(card.correct)),
      lastScheduledAt: Math.max(0, finite(card.lastScheduledAt)),
      lastSuccessfulDay: validDay(card.lastSuccessfulDay),
      lastFailureDay: validDay(card.lastFailureDay),
      lastAssistedDay: validDay(card.lastAssistedDay),
      successDays,
      stage: successDays >= 3 && level >= 4 ? 'strong' : reviews ? 'learning' : 'new',
      modeHistory: Array.isArray(card.modeHistory) ? card.modeHistory.filter(mode => validModes.has(mode)).slice(-8) : []
    };
  }
  function reviewSchedule(card = {}, rating, evidence = {}) {
    const prior = normalizeProgress(card), now = finite(evidence.now, Date.now()), today = dayKey(now);
    const failed = rating === 'again' || evidence.correct === false;
    const assisted = rating === 'hard' || evidence.assisted === true || evidence.retry === true;
    const history = validModes.has(evidence.mode) ? [...prior.modeHistory, evidence.mode].slice(-8) : prior.modeHistory;
    const result = {
      level: prior.level, days: 0, delay: 0,
      lastScheduledAt: now, lastSuccessfulDay: prior.lastSuccessfulDay,
      lastFailureDay: prior.lastFailureDay, lastAssistedDay: prior.lastAssistedDay,
      successDays: prior.successDays, stage: prior.stage, modeHistory: history
    };
    if (failed) {
      return { ...result, level: 0, days: 0, delay: 10 * 60000, successDays: 0, stage: 'learning', lastFailureDay: today };
    }
    if (assisted || prior.lastFailureDay === today || prior.lastAssistedDay === today) {
      // A revealed answer or an immediate retry is practice, not independent recall.
      return { ...result, level: Math.min(2, Math.max(1, prior.level)), days: 1, delay: DAY, stage: 'learning', lastAssistedDay: today };
    }
    if (prior.lastSuccessfulDay === today) {
      // Optional extra practice must not repeatedly move the next review farther away.
      const delay = prior.dueAt > now ? prior.dueAt - now : DAY;
      return { ...result, days: Math.max(1, Math.ceil(delay / DAY)), delay };
    }
    const successDays = prior.successDays + 1;
    const days = [1, 3, 7, 14, 30][Math.min(4, successDays - 1)];
    const level = Math.min(5, successDays + 1);
    return {
      ...result, level, days, delay: days * DAY, successDays,
      lastSuccessfulDay: today, stage: successDays >= 3 ? 'strong' : 'learning'
    };
  }
  function editDistance(a, b) {
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let beforePrevious = null;
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
        }
      }
      beforePrevious = previous.slice();
      previous.splice(0, previous.length, ...current);
    }
    return previous[b.length];
  }
  function assessAnswer(input, expected, alternatives = []) {
    const answer = normalizedAnswer(input), target = normalizedAnswer(expected);
    const variants = [target, ...(Array.isArray(alternatives) ? alternatives : []).filter(value => typeof value === 'string').map(normalizedAnswer)].filter(Boolean);
    const correct = !!answer && variants.includes(answer);
    // A spelling hint never silently changes a wrong answer into a successful recall.
    // Keep a strict limit for short words, where one letter often changes the meaning.
    const near = !correct && answer.length >= 4 && answer.length <= 240 && variants.some(value => {
      if (value.length < 4 || value.length > 240 || answer.split(' ').length !== value.split(' ').length) return false;
      const allowed = Math.max(answer.length, value.length) >= 12 ? 2 : 1;
      return Math.abs(answer.length - value.length) <= allowed && editDistance(answer, value) <= allowed;
    });
    return {
      correct, near, expected: String(expected || ''),
      feedback: correct ? 'You recalled it. Say the full sentence once.'
        : near ? 'Close — check the spelling and try once more.'
          : 'Try again, or use a hint. You are looking for the saved word.'
    };
  }
  function chooseMode(card, contextAvailable, listeningAvailable = true) {
    const progress = normalizeProgress(card);
    if (!progress.reviews) return 'cards';
    const modes = ['write', ...(listeningAvailable ? ['listen'] : []), 'cards'];
    // Writing can use the saved meaning when there is no suitable subtitle sentence.
    if (!contextAvailable && !String(card?.spanish || '').trim()) modes.splice(modes.indexOf('write'), 1);
    const recent = progress.modeHistory.slice(-3);
    return modes.reduce((best, mode) => {
      const last = recent.lastIndexOf(mode), bestLast = recent.lastIndexOf(best);
      return last < bestLast ? mode : best;
    }, modes[0]);
  }
  function buildBatch(studies, options = {}) {
    const now = finite(options.now, Date.now());
    const limit = Math.max(1, Math.min(50, Math.floor(finite(options.limit, 5))));
    const entries = (Array.isArray(studies) ? studies : []).filter(study => !options.studyId || study.id === options.studyId)
      .flatMap((study, studyOrder) => (study.cards || []).filter(card => !card.retiredAt).map((card, cardOrder) => ({
        studyId: study.id, cardId: card.id, card, progress: normalizeProgress(card), studyOrder, cardOrder
      })));
    const due = entries.filter(entry => !entry.progress.dueAt || entry.progress.dueAt <= now);
    const result = entry => ({ studyId: entry.studyId, cardId: entry.cardId, extra: !due.includes(entry) });
    const tie = (a, b) => a.studyOrder - b.studyOrder || a.cardOrder - b.cardOrder;
    if (!due.length) {
      if (!options.extra) return [];
      return entries.sort((a, b) => a.progress.dueAt - b.progress.dueAt || a.progress.level - b.progress.level || tie(a, b)).slice(0, limit).map(result);
    }
    const reviewed = due.filter(entry => entry.progress.reviews > 0);
    const fresh = due.filter(entry => !entry.progress.reviews);
    const urgency = entry => {
      const overdue = Math.max(0, now - (entry.progress.dueAt || now)) / DAY;
      return Math.log2(1 + overdue) + (5 - entry.progress.level) * 0.5 + (entry.card.lastRating === 'again' ? 2 : 0);
    };
    reviewed.sort((a, b) => urgency(b) - urgency(a) || a.progress.dueAt - b.progress.dueAt || tie(a, b));
    const selected = reviewed.slice(0, limit);
    const newLimit = reviewed.length ? Math.min(2, limit - selected.length) : limit;
    return selected.concat(fresh.slice(0, newLimit)).map(result);
  }
  function shuffled(values, random = Math.random) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  window.LinguaLoopLearning = { colors, tokens, buildTrie, findMatches, indexFor, colorIndex, contextFor, normalizedAnswer, normalizeProgress, reviewSchedule, assessAnswer, chooseMode, buildBatch, shuffled };
})();
