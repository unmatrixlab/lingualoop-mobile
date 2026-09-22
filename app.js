(() => {
  'use strict';

  const DB_NAME = 'lingualoop-mobile';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  const STATE_KEY = 'library';
  const DAY = 86400000;

  const state = {
    library: { version: 1, activeStudyId: '', studies: [] },
    view: 'today', practiceMode: 'cards', queue: [], index: 0, revealed: false,
    pendingDeleteStudyId: '', pendingDeleteTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    dueCount: $('#dueCount'), todayDate: $('#todayDate'), todayMessage: $('#todayMessage'), retentionValue: $('#retentionValue'), progressOrbit: $('#progressOrbit'),
    statDue: $('#statDue'), statLearning: $('#statLearning'), statStrong: $('#statStrong'), cardsCount: $('#cardsCount'), writeCount: $('#writeCount'),
    activeStudyTitle: $('#activeStudyTitle'), activeStudySummary: $('#activeStudySummary'), studyCount: $('#studyCount'), studyList: $('#studyList'),
    startReview: $('#startReviewButton'), toast: $('#toast'), pasteTransfer: $('#pasteTransferButton'), manualTransferPanel: $('#manualTransferPanel'), manualTransferInput: $('#manualTransferInput'), importManualTransfer: $('#importManualTransferButton'),
    practiceModeLabel: $('#practiceModeLabel'), practiceProgress: $('#practiceProgress'), sessionTrackFill: $('#sessionTrackFill'), practiceStage: $('#practiceStage'), practiceEmpty: $('#practiceEmpty'),
    promptDirection: $('#promptDirection'), promptText: $('#promptText'), promptContext: $('#promptContext'), answerArea: $('#answerArea'), answerText: $('#answerText'), answerContext: $('#answerContext'),
    reveal: $('#revealButton'), ratingRow: $('#ratingRow'), speak: $('#speakButton'), writeForm: $('#writeForm'), writeAnswer: $('#writeAnswer'), writeFeedback: $('#writeFeedback')
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadLibrary() {
    try {
      const db = await openDb();
      state.library = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve(request.result || state.library);
        request.onerror = () => reject(request.error);
      });
      db.close();
    } catch {
      try { state.library = JSON.parse(localStorage.getItem(DB_NAME)) || state.library; } catch { /* keep empty */ }
    }
    const migrated = normalizeLibrary();
    if (migrated) await saveLibrary();
  }

  async function saveLibrary() {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(state.library, STATE_KEY);
        request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      });
      db.close();
    } catch { localStorage.setItem(DB_NAME, JSON.stringify(state.library)); }
  }

  function normalizeLibrary() {
    let changed = false;
    if (!state.library || !Array.isArray(state.library.studies)) state.library = { version: 1, activeStudyId: '', studies: [] };
    const withoutDemo = state.library.studies.filter(study => study?.id !== 'demo-coffee-shop');
    if (withoutDemo.length !== state.library.studies.length) {
      state.library.studies = withoutDemo;
      changed = true;
    }
    state.library.studies.forEach(study => {
      study.cards = Array.isArray(study.cards) ? study.cards : [];
      study.cards.forEach((card, index) => Object.assign(card, {
        id: card.id || `${study.id}-${index}`, english: String(card.english || ''), spanish: String(card.spanish || ''), context: String(card.context || ''),
        level: Number(card.level) || 0, dueAt: Number(card.dueAt) || 0, reviews: Number(card.reviews) || 0, correct: Number(card.correct) || 0
      }));
    });
    if (!state.library.studies.some(study => study.id === state.library.activeStudyId)) state.library.activeStudyId = state.library.studies[0]?.id || '';
    return changed;
  }

  const activeStudy = () => state.library.studies.find(study => study.id === state.library.activeStudyId) || null;
  const dueCards = (study = activeStudy()) => study ? study.cards.filter(card => !card.dueAt || card.dueAt <= Date.now()) : [];
  const allCards = () => state.library.studies.flatMap(study => study.cards.map(card => ({ ...card, studyId: study.id })));

  function showView(view) {
    if (view === 'practice' && !state.queue.length) startPractice(state.practiceMode);
    state.view = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.bottom-nav [data-view-target]').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === view));
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    const study = activeStudy();
    const cards = study?.cards || [];
    const due = dueCards(study);
    const reviewed = cards.filter(card => card.reviews > 0);
    const correct = reviewed.reduce((sum, card) => sum + card.correct, 0);
    const totalReviews = reviewed.reduce((sum, card) => sum + card.reviews, 0);
    const retention = totalReviews ? Math.round(correct / totalReviews * 100) : 0;
    els.todayDate.textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date()).toUpperCase();
    els.dueCount.textContent = due.length;
    els.todayMessage.textContent = due.length ? 'A short session keeps every word within reach.' : study ? 'You are caught up. Practice anything when you feel ready.' : 'Connect a study from LinguaLoop 3 to begin.';
    els.retentionValue.textContent = `${retention}%`;
    els.progressOrbit.style.setProperty('--progress', `${retention}%`);
    els.statDue.textContent = due.length;
    els.statLearning.textContent = cards.filter(card => card.level > 0 && card.level < 4).length;
    els.statStrong.textContent = cards.filter(card => card.level >= 4).length;
    els.cardsCount.textContent = cards.length;
    els.writeCount.textContent = cards.length;
    els.startReview.disabled = !cards.length;
    els.activeStudyTitle.textContent = study?.name || 'No study yet';
    els.activeStudySummary.innerHTML = study ? `<div class="study-swatch" style="background:${escapeHtml(study.color || '#76a8ff')}"></div><div><strong>${escapeHtml(study.name)}</strong><small>${cards.length} words · ${due.length} due now</small></div><span>Manage →</span>` : '<div class="study-swatch"></div><div><strong>Connect LinguaLoop 3</strong><small>Load your first study from the computer.</small></div><span>Connect →</span>';
    els.activeStudySummary.dataset.viewTarget = study ? 'studies' : 'connect';
    els.activeStudySummary.tabIndex = 0;
    els.activeStudySummary.setAttribute('role', 'button');
    els.activeStudySummary.setAttribute('aria-label', study ? `Manage studies. ${study.name} is active.` : 'Connect your first LinguaLoop study');
    els.activeStudySummary.classList.add('interactive');
    renderStudies();
  }

  function renderStudies() {
    const studies = state.library.studies;
    els.studyCount.textContent = `${studies.length} ${studies.length === 1 ? 'study' : 'studies'}`;
    els.studyList.innerHTML = studies.length ? studies.map(study => {
      const active = study.id === state.library.activeStudyId;
      const confirming = study.id === state.pendingDeleteStudyId;
      return `<article class="${active ? 'active' : ''}${confirming ? ' confirming-delete' : ''}" data-study-id="${escapeHtml(study.id)}">
        <button class="study-select-button" type="button" data-study-open="${escapeHtml(study.id)}" aria-pressed="${active}" aria-label="${active ? 'Active study' : 'Use'} ${escapeHtml(study.name)}">
          <span class="study-swatch" style="background:${escapeHtml(study.color || '#76a8ff')}"></span>
          <span class="study-list-copy"><strong>${escapeHtml(study.name)}</strong><small>${study.cards.length} words · ${dueCards(study).length} due</small></span>
          <span class="study-active-state">${active ? 'ACTIVE' : 'USE'}</span>
        </button>
        <button class="study-delete-button" type="button" data-study-delete="${escapeHtml(study.id)}" aria-label="${confirming ? 'Confirm deleting' : 'Delete'} ${escapeHtml(study.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          <span>${confirming ? 'DELETE?' : ''}</span>
        </button>
      </article>`;
    }).join('') : '<article class="empty-library"><strong>Your library is empty</strong>Open Studies in LinguaLoop 3 and choose Send to phone.</article>';
  }

  function clearPendingStudyDelete(renderList = false) {
    clearTimeout(state.pendingDeleteTimer);
    state.pendingDeleteTimer = null;
    if (!state.pendingDeleteStudyId) return;
    state.pendingDeleteStudyId = '';
    if (renderList) renderStudies();
  }

  async function requestStudyDelete(studyId) {
    const study = state.library.studies.find(item => item.id === studyId);
    if (!study) return;
    if (state.pendingDeleteStudyId !== studyId) {
      clearPendingStudyDelete();
      state.pendingDeleteStudyId = studyId;
      state.pendingDeleteTimer = setTimeout(() => clearPendingStudyDelete(true), 4000);
      renderStudies();
      showToast(`Tap Delete again to remove ${study.name}`);
      return;
    }
    clearPendingStudyDelete();
    state.library.studies = state.library.studies.filter(item => item.id !== studyId);
    if (state.library.activeStudyId === studyId) state.library.activeStudyId = state.library.studies[0]?.id || '';
    state.queue = [];
    state.index = 0;
    await saveLibrary();
    render();
    showToast(`${study.name} removed from this phone`);
    if (!state.library.studies.length) showView('connect');
  }

  function startPractice(mode = 'cards') {
    state.practiceMode = mode;
    const study = activeStudy();
    const due = dueCards(study);
    state.queue = (due.length ? due : study?.cards || []).map(card => card.id).sort(() => Math.random() - .5);
    state.index = 0; state.revealed = false;
    els.practiceModeLabel.textContent = mode === 'write' ? 'WRITE' : 'CARDS';
    els.writeForm.hidden = mode !== 'write';
    renderPracticeCard();
    state.view = 'practice';
  }

  function currentCard() {
    const study = activeStudy();
    return study?.cards.find(card => card.id === state.queue[state.index]) || null;
  }

  function renderPracticeCard() {
    const card = currentCard();
    const total = state.queue.length;
    els.practiceEmpty.hidden = Boolean(card);
    els.practiceStage.hidden = !card;
    els.practiceProgress.textContent = `${Math.min(state.index + 1, total)} / ${total}`;
    els.sessionTrackFill.style.width = total ? `${state.index / total * 100}%` : '100%';
    if (!card) return;
    state.revealed = false;
    els.promptDirection.textContent = 'ENGLISH → SPANISH';
    els.promptText.textContent = card.english;
    els.promptContext.textContent = card.context;
    els.answerText.textContent = card.spanish;
    els.answerContext.textContent = card.context;
    els.answerArea.hidden = true;
    els.reveal.hidden = state.practiceMode === 'write';
    els.ratingRow.hidden = true;
    els.writeForm.hidden = state.practiceMode !== 'write';
    els.writeAnswer.value = '';
    els.writeFeedback.textContent = '';
    els.writeFeedback.className = '';
    if (state.practiceMode === 'write') setTimeout(() => els.writeAnswer.focus(), 100);
  }

  function revealAnswer() {
    if (!currentCard()) return;
    state.revealed = true;
    els.answerArea.hidden = false;
    els.reveal.hidden = true;
    els.ratingRow.hidden = false;
  }

  async function rateCard(rating) {
    const card = currentCard(); if (!card) return;
    const schedule = { again: [0, 60000], hard: [1, DAY], good: [3, DAY * 3], easy: [5, DAY * 7] }[rating] || [1, DAY];
    card.level = rating === 'again' ? Math.max(0, card.level - 1) : Math.max(card.level, schedule[0]);
    card.dueAt = Date.now() + schedule[1]; card.reviews += 1; card.correct += rating === 'again' ? 0 : 1; card.lastRating = rating;
    await saveLibrary();
    state.index += 1; renderPracticeCard(); render();
    if (state.index >= state.queue.length) showToast('Session complete');
  }

  function normalizeAnswer(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); }
  function checkWrittenAnswer(event) {
    event.preventDefault(); const card = currentCard(); if (!card) return;
    const correct = normalizeAnswer(els.writeAnswer.value) === normalizeAnswer(card.spanish);
    els.writeFeedback.textContent = correct ? 'Correct — nicely remembered.' : 'Not quite. Compare your answer below.';
    els.writeFeedback.className = correct ? 'correct' : 'incorrect'; revealAnswer();
  }

  function speakCurrent() {
    const card = currentCard(); if (!card || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(card.english); utterance.lang = 'en-US'; utterance.rate = .9; speechSynthesis.speak(utterance);
  }

  function base64UrlBytes(value) {
    const encoded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function normalizedTransferFragment(value) {
    let text = String(value || '').trim();
    if (text.startsWith('LINGUALOOP:')) text = text.slice(11).trim();
    const hashIndex = text.indexOf('#pack');
    if (hashIndex >= 0) text = text.slice(hashIndex);
    if (text.startsWith('packz=')) text = `#${text}`;
    if (text.startsWith('pack=')) text = `#${text}`;
    return text;
  }

  async function decodePackValue(value) {
    const fragment = normalizedTransferFragment(value);
    if (fragment.startsWith('#packz=')) {
      if (typeof DecompressionStream !== 'function') throw new Error('Compressed study packs are not supported by this browser');
      const bytes = base64UrlBytes(fragment.slice(7));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return JSON.parse(await new Response(stream).text());
    }
    if (fragment.startsWith('#pack=')) {
      return JSON.parse(new TextDecoder().decode(base64UrlBytes(fragment.slice(6))));
    }
    throw new Error('Not a LinguaLoop transfer');
  }

  function mergeIncomingStudy(incoming) {
    const existing = state.library.studies.find(study => study.id === incoming.id);
    if (!existing) return incoming;
    const previousCards = new Map((existing.cards || []).map(card => [card.id, card]));
    incoming.cards = incoming.cards.map(card => {
      const previous = previousCards.get(card.id);
      if (!previous || Number(previous.reviews) <= 0) return card;
      return {
        ...card,
        level: Number(previous.level) || 0,
        dueAt: Number(previous.dueAt) || 0,
        reviews: Number(previous.reviews) || 0,
        correct: Number(previous.correct) || 0,
        lastRating: String(previous.lastRating || '')
      };
    });
    return incoming;
  }

  async function importPackValue(value) {
    const pack = await decodePackValue(value);
    const studies = Array.isArray(pack.studies) ? pack.studies : pack.study ? [pack.study] : [];
    if (!studies.length) throw new Error('Empty pack');
    studies.forEach(rawIncoming => {
      const incoming = mergeIncomingStudy(rawIncoming);
      const index = state.library.studies.findIndex(study => study.id === incoming.id);
      if (index >= 0) state.library.studies[index] = incoming; else state.library.studies.push(incoming);
    });
    state.library.activeStudyId = studies[0].id;
    normalizeLibrary();
    await saveLibrary();
    render();
    showView('today');
    showToast(studies.length === 1 ? `${studies[0].name} received` : `${studies.length} studies received`);
  }

  async function importPackFromHash() {
    if (!location.hash.startsWith('#pack=') && !location.hash.startsWith('#packz=')) return;
    try {
      await importPackValue(location.hash);
    } catch {
      showToast('This study pack could not be read');
    } finally {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function revealManualTransfer() {
    els.manualTransferPanel.hidden = false;
    requestAnimationFrame(() => els.manualTransferInput.focus());
  }

  async function pasteTransferFromClipboard() {
    const original = els.pasteTransfer.textContent;
    els.pasteTransfer.disabled = true;
    els.pasteTransfer.textContent = 'Reading…';
    try {
      if (!navigator.clipboard?.readText) throw new Error('Clipboard reading unavailable');
      const value = await Promise.race([
        navigator.clipboard.readText(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard reading timed out')), 3000))
      ]);
      await importPackValue(value);
      els.manualTransferPanel.hidden = true;
      els.manualTransferInput.value = '';
    } catch {
      revealManualTransfer();
      showToast('Paste the copied transfer below');
    } finally {
      els.pasteTransfer.disabled = false;
      els.pasteTransfer.textContent = original;
    }
  }

  async function importManualTransfer() {
    try {
      await importPackValue(els.manualTransferInput.value);
      els.manualTransferPanel.hidden = true;
      els.manualTransferInput.value = '';
    } catch {
      showToast('This is not a valid LinguaLoop transfer');
      els.manualTransferInput.focus();
    }
  }

  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }
  let toastTimer = null;
  function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200); }

  document.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-study-delete]'); if (deleteButton) { requestStudyDelete(deleteButton.dataset.studyDelete); return; }
    const viewButton = event.target.closest('[data-view-target]'); if (viewButton) showView(viewButton.dataset.viewTarget);
    const practiceButton = event.target.closest('[data-practice-mode]'); if (practiceButton) { startPractice(practiceButton.dataset.practiceMode); showView('practice'); }
    const studyButton = event.target.closest('[data-study-open]'); if (studyButton) { clearPendingStudyDelete(); state.library.activeStudyId = studyButton.dataset.studyOpen; saveLibrary(); render(); showToast(`${activeStudy()?.name || 'Study'} is now active`); }
    const rating = event.target.closest('[data-rating]'); if (rating) rateCard(rating.dataset.rating);
  });
  els.activeStudySummary.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showView(els.activeStudySummary.dataset.viewTarget); } });
  els.startReview.addEventListener('click', () => { startPractice('cards'); showView('practice'); });
  els.reveal.addEventListener('click', revealAnswer);
  els.speak.addEventListener('click', speakCurrent);
  els.writeForm.addEventListener('submit', checkWrittenAnswer);
  els.pasteTransfer.addEventListener('click', pasteTransferFromClipboard);
  els.importManualTransfer.addEventListener('click', importManualTransfer);
  (async () => {
    await loadLibrary(); await importPackFromHash(); render(); showView('today');
    if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {}));
  })();
})();
