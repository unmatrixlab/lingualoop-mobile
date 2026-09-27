(() => {
  'use strict';

  const DB_NAME = 'lingualoop-mobile';
  const DB_VERSION = 1;
  const STORE_NAME = 'state';
  const STATE_KEY = 'library';
  const learning = window.LinguaLoopLearning;
  function readPreference(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function savePreference(key, value) { try { localStorage.setItem(key, value); } catch { /* Keep the current session preference. */ } }


  const state = {
    library: { version: 1, activeStudyId: '', studies: [] },
    view: 'today', practiceMode: 'cards', queue: [], index: 0, revealed: false,
    practiceRun: 0, practiceReturn: 'today', practiceRetries: {}, practiceAnswers: 0, practiceCorrect: 0,
    videoExpanded: readPreference('lingualoop.mobile.videoExpanded') !== 'false',
    wordSheetCardId: '', wordSheetCueIndex: -1, transcriptWordsOnly: false,
    pendingDeleteStudyId: '', pendingDeleteTimer: null, fullVideoStudyId: '',
    studyVideoGeneration: 0, studyVideoPlayer: null, studyVideoReady: false, studyVideoPlaying: false, studyVideoPoll: null, studyVideoClipEnd: 0,
    transcriptVideoActionId: 0, transcriptSeekTarget: null,
    transcriptSelectedIndex: -1, transcriptActiveIndex: -1, transcriptReadingIndex: -1,
    transcriptStudyId: '',
    transcriptLanguage: readPreference('lingualoop.mobile.transcriptLanguage') || 'both',
    transcriptSpeed: Number(readPreference('lingualoop.mobile.transcriptSpeed')) || .9,
    transcriptFollow: readPreference('lingualoop.mobile.transcriptFollow') !== 'false',
    transcriptSpeechActive: false, transcriptSpeechPaused: false, transcriptSpeechRunId: 0,
    transcriptSpeechIndex: -1, transcriptSpeechPart: 0
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    wordSheet: $('#wordSheet'), wordSheetTitle: $('#wordSheetTitle'), wordSheetMeaning: $('#wordSheetMeaning'), wordSheetContext: $('#wordSheetContext'), wordSheetSpeak: $('#wordSheetSpeak'), wordSheetPractice: $('#wordSheetPractice'),
    toggleVideo: $('#toggleStudyVideo'), cardContext: $('#cardContextButton'), practiceSummary: $('#practiceSummary'), practiceDone: $('#practiceDoneButton'),
    transcriptWords: $('#transcriptWordsButton'), transcriptVocabularyHint: $('#transcriptVocabularyHint'),
    dueCount: $('#dueCount'), todayDate: $('#todayDate'), todayMessage: $('#todayMessage'), retentionValue: $('#retentionValue'), progressOrbit: $('#progressOrbit'),
    statDue: $('#statDue'), statLearning: $('#statLearning'), statStrong: $('#statStrong'), cardsCount: $('#cardsCount'), writeCount: $('#writeCount'),
    activeStudyTitle: $('#activeStudyTitle'), activeStudySummary: $('#activeStudySummary'), studyCount: $('#studyCount'), studyList: $('#studyList'),
    startReview: $('#startReviewButton'), toast: $('#toast'), pasteTransfer: $('#pasteTransferButton'), manualTransferPanel: $('#manualTransferPanel'), manualTransferInput: $('#manualTransferInput'), importManualTransfer: $('#importManualTransferButton'),
    practiceModeLabel: $('#practiceModeLabel'), practiceProgress: $('#practiceProgress'), sessionTrackFill: $('#sessionTrackFill'), practiceStage: $('#practiceStage'), practiceEmpty: $('#practiceEmpty'),
    promptDirection: $('#promptDirection'), promptText: $('#promptText'), promptContext: $('#promptContext'), answerArea: $('#answerArea'), answerText: $('#answerText'), answerContext: $('#answerContext'),
    reveal: $('#revealButton'), ratingRow: $('#ratingRow'), speak: $('#speakButton'), answerSpeak: $('#answerSpeakButton'), writeForm: $('#writeForm'), writeAnswer: $('#writeAnswer'), writeFeedback: $('#writeFeedback'),
    clipButton: $('#clipButton'), clipPanel: $('#clipPanel'), clipFrame: $('#clipFrame'), clipTitle: $('#clipTitle'), closeClip: $('#closeClipButton'),
    studyVideoReady: $('#studyVideoReady'), studyVideoEmpty: $('#studyVideoEmpty'), studyVideoTitle: $('#studyVideoTitle'), studyVideoMeta: $('#studyVideoMeta'), studyVideoFrame: $('#studyVideoFrame'), restartStudyVideo: $('#restartStudyVideoButton'),
    transcriptPanel: $('#studyTranscriptPanel'), transcriptEmpty: $('#studyTranscriptEmpty'), transcriptList: $('#studyTranscriptList'), transcriptSummary: $('#studyTranscriptSummary'), transcriptPosition: $('#studyTranscriptPosition'), transcriptFollow: $('#studyTranscriptFollowButton'), transcriptRead: $('#studyTranscriptReadButton'), transcriptStop: $('#studyTranscriptStopButton'), transcriptSpeed: $('#studyTranscriptSpeed'), transcriptLanguages: $$('[data-transcript-language]')
  };

  function normalizeYouTubeMedia(value) {
    const id = String(value?.id || '').trim();
    if (value?.type !== 'youtube' || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) return null;
    return { type: 'youtube', id, name: String(value.name || 'YouTube video').trim().slice(0, 160) };
  }

  function normalizeClip(value) {
    const start = Number(value?.start);
    const end = Number(value?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const safeStart = Math.min(86399.95, Math.max(0, start));
    const safeEnd = Math.min(86400, Math.max(safeStart + .05, end));
    return safeEnd > safeStart ? { start: safeStart, end: safeEnd } : null;
  }

  function normalizeTranscript(value) {
    const source = Array.isArray(value) ? value : Array.isArray(value?.cues) ? value.cues : [];
    return source.slice(0, 24000).map((cue, index) => {
      const start = Number(cue?.start);
      const end = Number(cue?.end);
      const english = String(cue?.en || '').trim();
      const spanish = String(cue?.es || '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (!english && !spanish)) return null;
      return {
        id: String(cue?.id || `subtitle-${index + 1}`).slice(0, 120),
        start: Math.max(0, start), end: Math.max(start + .05, end),
        en: english.slice(0, 2400), es: spanish.slice(0, 2400),
        chain: Math.max(0, Math.round(Number(cue?.chain) || 0))
      };
    }).filter(Boolean).sort((left, right) => left.start - right.start || left.end - right.end);
  }

  function normalizeMobilePlayback(value, cues = []) {
    const time = Math.min(86400, Math.max(0, Number(value?.time) || 0));
    let selectedIndex = Math.round(Number(value?.selectedIndex));
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= cues.length) selectedIndex = -1;
    let selectedCueId = String(value?.selectedCueId || '').slice(0, 120);
    const idIndex = selectedCueId ? cues.findIndex(cue => cue.id === selectedCueId) : -1;
    if (idIndex >= 0) selectedIndex = idIndex;
    else if (selectedIndex >= 0) selectedCueId = cues[selectedIndex]?.id || '';
    else selectedCueId = '';
    return { time, selectedCueId, selectedIndex };
  }

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
      try {
        state.library = await new Promise((resolve, reject) => {
          const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(STATE_KEY);
          request.onsuccess = () => resolve(request.result || state.library);
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    } catch { /* Recover the most recent fallback below, even when IndexedDB returns. */ }
    let recovered = false;
    try {
      const fallback = JSON.parse(localStorage.getItem(DB_NAME));
      if (fallback && Array.isArray(fallback.studies)) { state.library = fallback; recovered = true; }
    } catch { /* The durable library is still available. */ }
    const migrated = normalizeLibrary();
    if (migrated || recovered) await saveLibrary();
  }

  let librarySaveQueue = Promise.resolve();
  function saveLibrary() {
    const snapshot = JSON.parse(JSON.stringify(state.library));
    // Serialize rapid ratings, imports and position saves in the order requested.
    librarySaveQueue = librarySaveQueue.then(async () => {
      try {
        const db = await openDb();
        try {
          await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
            transaction.oncomplete = resolve;
            transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Storage unavailable'));
          });
        } finally { db.close(); }
        try { localStorage.removeItem(DB_NAME); } catch { /* IndexedDB has committed. */ }
        return true;
      } catch {
        try { localStorage.setItem(DB_NAME, JSON.stringify(snapshot)); return true; }
        catch { showToast('Storage is full. Keep this page open; your latest progress is not saved yet.'); return false; }
      }
    });
    return librarySaveQueue;
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
      study.media = normalizeYouTubeMedia(study.media);
      study.transcript = normalizeTranscript(study.transcript);
      const previousPlayback = JSON.stringify(study.mobilePlayback || null);
      study.mobilePlayback = normalizeMobilePlayback(study.mobilePlayback, study.transcript);
      if (JSON.stringify(study.mobilePlayback) !== previousPlayback) changed = true;
      study.cards = Array.isArray(study.cards) ? study.cards : [];
      study.cards.forEach((card, index) => Object.assign(card, {
        id: card.id || `${study.id}-${index}`, english: String(card.english || ''), spanish: String(card.spanish || ''), context: String(card.context || ''),
        clip: normalizeClip(card.clip), colorIndex: learning.colorIndex(card),
        level: Number(card.level) || 0, dueAt: Number(card.dueAt) || 0, reviews: Number(card.reviews) || 0, correct: Number(card.correct) || 0
      }));
    });
    if (!state.library.studies.some(study => study.id === state.library.activeStudyId)) state.library.activeStudyId = state.library.studies[0]?.id || '';
    return changed;
  }

  const activeStudy = () => state.library.studies.find(study => study.id === state.library.activeStudyId) || null;
  const dueCards = (study = activeStudy()) => study ? study.cards.filter(card => !card.dueAt || card.dueAt <= Date.now()) : [];
  const allCards = () => state.library.studies.flatMap(study => study.cards.map(card => ({ ...card, studyId: study.id })));

  function showView(view, { transcriptIndex = -1 } = {}) {
    cancelTranscriptPositioning();
    if (els.wordSheet.open) els.wordSheet.close();
    if (view === 'practice' && !state.queue.length) startPractice(state.practiceMode);
    if (state.view === 'practice' && view !== 'practice') closeCardClip();
    if (state.view === 'video' && view !== 'video') { captureStudyVideoPosition(true); pauseStudyVideo(); stopTranscriptSpeech(); }
    stopSpeech();
    state.view = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.bottom-nav [data-view-target]').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === view));
    if (view === 'video') {
      const explicitCue = activeTranscript()[transcriptIndex];
      if (explicitCue) {
        rememberStudyPlayback({ time: explicitCue.start, selectedIndex: transcriptIndex });
        state.transcriptSelectedIndex = state.transcriptActiveIndex = transcriptIndex;
      }
      renderStudyVideo();
      if (explicitCue) {
        selectTranscriptCue(transcriptIndex, 'select');
        positionTranscriptViewport(transcriptIndex);
      } else restoreTranscriptViewport();
    } else scrollTo({ top: 0, behavior: 'smooth' });
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
    $('#dueUnit').textContent = due.length === 1 ? 'word' : 'words';
    els.todayMessage.textContent = due.length ? `${study?.name || 'Your study'} · recall, then return to the story.` : study ? 'You are caught up. Practice anything when you feel ready.' : 'Connect a study from LinguaLoop 3 to begin.';
    els.retentionValue.textContent = totalReviews ? `${retention}%` : '—';
    els.progressOrbit.style.setProperty('--progress', `${retention}%`);
    els.statDue.textContent = due.length;
    els.statLearning.textContent = cards.filter(card => card.level < 4).length;
    els.statStrong.textContent = cards.filter(card => card.level >= 4).length;
    els.cardsCount.textContent = cards.length;
    els.writeCount.textContent = cards.length;
    els.startReview.disabled = !cards.length;
    els.activeStudyTitle.textContent = study?.name || 'No study yet';
    els.activeStudySummary.innerHTML = study ? `<div class="study-swatch" style="background:${escapeHtml(study.color || '#76a8ff')}"></div><div><strong>${escapeHtml(study.name)}</strong><small>${cards.length} words · ${(study.transcript || []).length} subtitles · ${due.length} due</small></div><span>Manage →</span>` : '<div class="study-swatch"></div><div><strong>Connect LinguaLoop 3</strong><small>Load your first study from the computer.</small></div><span>Connect →</span>';
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
          <span class="study-list-copy"><strong>${escapeHtml(study.name)}</strong><small>${study.cards.length} words · ${(study.transcript || []).length} subtitles · ${dueCards(study).length} due</small></span>
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
    const previousLibrary = JSON.parse(JSON.stringify(state.library));
    captureStudyVideoPosition(false); stopSpeech(); destroyStudyVideo();
    state.library.studies = state.library.studies.filter(item => item.id !== studyId);
    if (state.library.activeStudyId === studyId) state.library.activeStudyId = state.library.studies[0]?.id || '';
    resetPractice();
    if (!await saveLibrary()) { state.library = previousLibrary; render(); return; }
    render();
    if (state.view === 'video') renderStudyVideo();
    showToast(`${study.name} removed from this phone`);
    if (!state.library.studies.length) showView('connect');
  }

  function resetPractice() {
    state.practiceRun += 1;
    state.queue = []; state.index = 0; state.practiceRetries = {};
    state.practiceReturn = 'today';
  }

  function startPractice(mode = 'cards', { cardIds = null, returnTo = 'today' } = {}) {
    closeCardClip(); stopSpeech();
    state.practiceRun += 1;
    state.practiceMode = mode === 'write' ? 'write' : 'cards';
    const study = activeStudy(), due = dueCards(study);
    const cards = cardIds ? (study?.cards || []).filter(card => cardIds.includes(card.id)) : due.length ? due : study?.cards || [];
    state.queue = learning.shuffled(cards.map(card => card.id));
    state.index = 0; state.revealed = false; state.practiceRetries = {};
    state.practiceAnswers = 0; state.practiceCorrect = 0; state.practiceReturn = returnTo;
    els.practiceModeLabel.textContent = state.practiceMode === 'write' ? 'WRITE IN ENGLISH' : 'CARDS';
    $('#practiceTitle').textContent = cardIds ? 'Practice this word' : 'Daily review';
    renderPracticeCard();
    // showView owns navigation, so it can pause/capture the video first.
  }

  function currentCard() {
    return activeStudy()?.cards.find(card => card.id === state.queue[state.index]) || null;
  }

  function renderPracticeCard() {
    const card = currentCard(), total = state.queue.length;
    els.practiceEmpty.hidden = Boolean(card); els.practiceStage.hidden = !card;
    els.practiceProgress.textContent = `${Math.min(state.index + 1, total)} / ${total}`;
    els.sessionTrackFill.style.width = total ? `${state.index / total * 100}%` : '100%';
    if (!card) {
      closeCardClip();
      els.practiceEmpty.querySelector('h2').textContent = state.practiceAnswers ? 'Session complete' : 'No words to review';
      els.practiceSummary.textContent = state.practiceAnswers
        ? `${state.practiceCorrect} of ${state.practiceAnswers} recalled · progress saved.`
        : 'Choose a study with vocabulary to start.';
      els.practiceDone.textContent = state.practiceReturn === 'video' ? 'Back to the transcript' : 'Back to Today';
      return;
    }
    closeCardClip(); stopSpeech(); state.revealed = false;
    const writing = state.practiceMode === 'write';
    els.practiceStage.classList.toggle('writing', writing);
    const context = learning.contextFor(activeStudy(), card, state.wordSheetCueIndex);
    els.promptDirection.textContent = writing ? (context ? 'COMPLETE THE ENGLISH' : 'SPANISH → ENGLISH') : 'ENGLISH → SPANISH';
    els.promptText.textContent = writing ? (context?.masked || card.spanish) : card.english;
    els.promptText.classList.toggle('sentence-prompt', writing && Boolean(context));
    els.promptContext.textContent = writing ? (context ? card.spanish : '') : (context?.text || card.context);
    els.answerText.textContent = writing ? card.english : card.spanish;
    els.answerContext.textContent = writing ? (context?.text || '') : '';
    els.answerSpeak.querySelector('span').textContent = writing ? 'English' : 'Spanish';
    els.answerSpeak.setAttribute('aria-label', writing ? 'Pronounce the English answer' : 'Pronounce the Spanish answer');
    els.cardContext.hidden = !(learning.indexFor(activeStudy()).byCard.get(card.id)?.length);
    els.answerArea.hidden = true; els.reveal.hidden = false; els.ratingRow.hidden = true;
    els.reveal.textContent = writing ? 'Show answer' : 'Reveal answer';
    els.writeForm.hidden = !writing; els.writeAnswer.value = '';
    els.writeAnswer.disabled = false; els.writeForm.querySelector('button').disabled = false;
    els.writeFeedback.textContent = ''; els.writeFeedback.className = '';
    els.clipButton.hidden = true;
    // Avoid opening the phone keyboard before the learner has read the sentence.
  }

  function revealAnswer() {
    if (!currentCard()) return;
    state.revealed = true; els.answerArea.hidden = false;
    els.reveal.hidden = true; els.ratingRow.hidden = false;
    if (state.practiceMode === 'write') {
      els.writeAnswer.blur();
      els.writeAnswer.disabled = true; els.writeForm.querySelector('button').disabled = true;
    }
    const card = currentCard();
    for (const rating of ['hard', 'good', 'easy']) {
      const days = learning.reviewSchedule(card, rating).days;
      els.ratingRow.querySelector(`[data-rating="${rating}"] small`).textContent = `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    els.ratingRow.querySelector('[data-rating="again"] small').textContent = (state.practiceRetries[card.id] || 0) < 2 ? 'In this session' : 'In 1 minute';
  }

  async function rateCard(rating) {
    const card = currentCard();
    if (!card || !state.revealed || state.ratingPending || !['again','hard','good','easy'].includes(rating)) return;
    const run = state.practiceRun;
    state.ratingPending = true;
    const previous = { ...card }, buttons = [...els.ratingRow.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const schedule = learning.reviewSchedule(card, rating);
      card.level = schedule.level;
      card.dueAt = Date.now() + schedule.delay; card.reviews += 1; card.correct += rating === 'again' ? 0 : 1; card.lastRating = rating;
      if (!await saveLibrary()) { Object.assign(card, previous); return; }
      if (run !== state.practiceRun) return;
      state.practiceAnswers += 1; state.practiceCorrect += rating === 'again' ? 0 : 1;
      if (rating === 'again' && (state.practiceRetries[card.id] || 0) < 2) {
        state.practiceRetries[card.id] = (state.practiceRetries[card.id] || 0) + 1;
        state.queue.splice(Math.min(state.queue.length, state.index + 3), 0, card.id);
      }
      state.index += 1; renderPracticeCard(); render();
    } finally {
      state.ratingPending = false; buttons.forEach(button => { button.disabled = false; });
    }
  }

  function checkWrittenAnswer(event) {
    event.preventDefault(); const card = currentCard(); if (!card || state.revealed) return;
    if (!els.writeAnswer.value.trim()) { els.writeFeedback.textContent = 'Try an English word, or tap Show answer.'; return; }
    const correct = learning.normalizedAnswer(els.writeAnswer.value) === learning.normalizedAnswer(card.english);
    els.writeFeedback.textContent = correct ? 'Correct — now say the full sentence.' : 'Compare, say it once, then choose Again.';
    els.writeFeedback.className = correct ? 'correct' : 'incorrect'; revealAnswer();
  }

  function openVocabularyWord(cardId, cueIndex) {
    const card = activeStudy()?.cards.find(item => item.id === cardId);
    if (!card) return;
    captureStudyVideoPosition(true); pauseStudyVideo(); stopSpeech();
    state.wordSheetCardId = cardId; state.wordSheetCueIndex = cueIndex;
    els.wordSheet.style.setProperty('--word-color', learning.colors[learning.colorIndex(card)]);
    els.wordSheetTitle.textContent = card.english; els.wordSheetMeaning.textContent = card.spanish;
    els.wordSheetContext.textContent = activeTranscript()[cueIndex]?.en || learning.contextFor(activeStudy(), card)?.text || '';
    if (!els.wordSheet.open) els.wordSheet.showModal();
  }

  function returnFromPractice() {
    const view = state.practiceReturn;
    showView(view, { transcriptIndex: view === 'video' ? state.wordSheetCueIndex : -1 });
  }

  function findCardInTranscript() {
    const card = currentCard();
    const context = learning.contextFor(activeStudy(), card, state.wordSheetCueIndex);
    const index = context?.index >= 0 ? context.index : learning.indexFor(activeStudy()).byCard.get(card?.id)?.[0];
    if (!Number.isInteger(index)) return;
    state.transcriptWordsOnly = false;
    showView('video', { transcriptIndex: index });
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $$('.practice-tool-button.speaking').forEach(button => { button.classList.remove('speaking'); button.setAttribute('aria-pressed', 'false'); });
    clearTranscriptSpeechState();
  }

  function speakText(text, language, button) {
    if (!text || !('speechSynthesis' in window)) { showToast('Speech is unavailable on this device'); return; }
    if (button?.classList.contains('speaking')) { stopSpeech(); return; }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = .9;
    const languagePrefix = language.toLowerCase().split('-')[0];
    const matchingVoice = speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith(languagePrefix));
    if (matchingVoice) utterance.voice = matchingVoice;
    const finish = () => { button?.classList.remove('speaking'); button?.setAttribute('aria-pressed', 'false'); };
    utterance.onstart = () => { button?.classList.add('speaking'); button?.setAttribute('aria-pressed', 'true'); };
    utterance.onend = finish;
    utterance.onerror = finish;
    speechSynthesis.speak(utterance);
  }

  function speakCurrent() {
    const card = currentCard();
    if (card) speakText(card.english, 'en-US', els.speak);
  }

  function speakCurrentAnswer() {
    const card = currentCard();
    if (card) speakText(state.practiceMode === 'write' ? card.english : card.spanish, state.practiceMode === 'write' ? 'en-US' : 'es-US', els.answerSpeak);
  }

  function currentCardClip() {
    const study = activeStudy();
    const clip = normalizeClip(currentCard()?.clip);
    return study?.media?.type === 'youtube' && clip ? clip : null;
  }

  function formatClipTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function closeCardClip() {
    if (!els.clipPanel) return;
    els.clipFrame.removeAttribute('src');
    els.clipPanel.hidden = true;
    els.clipButton?.setAttribute('aria-pressed', 'false');
  }

  function toggleCardClip() {
    if (!els.clipPanel.hidden) { closeCardClip(); return; }
    const study = activeStudy();
    const clip = currentCardClip();
    if (!study?.media || !clip) return;
    const start = Math.max(0, Math.floor(clip.start));
    const end = Math.max(start + 1, Math.ceil(clip.end));
    els.clipFrame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(study.media.id)}?autoplay=1&start=${start}&end=${end}&controls=1&playsinline=1&rel=0&cc_load_policy=0&iv_load_policy=3`;
    els.clipPanel.hidden = false;
    els.clipButton.setAttribute('aria-pressed', 'true');
  }

  let youtubeApiPromise = null;

  function ensureYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (youtubeApiPromise) return youtubeApiPromise;
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { previous?.(); } finally { resolve(window.YT); } };
      const existing = document.querySelector('script[data-lingualoop-youtube-api]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.lingualoopYoutubeApi = 'true';
        script.onerror = () => reject(new Error('YouTube player could not load'));
        document.head.append(script);
      }
      setTimeout(() => window.YT?.Player ? resolve(window.YT) : reject(new Error('YouTube player timed out')), 12000);
    }).catch(error => { youtubeApiPromise = null; throw error; });
    return youtubeApiPromise;
  }

  function studyVideoEmbedUrl(media, { start = 0, end = 0, autoplay = false } = {}) {
    if (!media?.id) return '';
    const params = new URLSearchParams({
      controls: '1', playsinline: '1', rel: '0', cc_load_policy: '0', iv_load_policy: '3',
      enablejsapi: '1', origin: location.origin
    });
    if (autoplay) params.set('autoplay', '1');
    if (Number(start) > 0) params.set('start', String(Math.max(0, Math.floor(Number(start)))));
    if (Number(end) > Number(start)) params.set('end', String(Math.max(1, Math.ceil(Number(end)))));
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(media.id)}?${params}`;
  }

  function recreateStudyVideoHost(media = null, options = {}) {
    const wrapper = $('.study-video-frame');
    if (!wrapper) return null;
    wrapper.replaceChildren();
    const host = document.createElement('iframe');
    host.id = 'studyVideoFrame';
    host.title = 'Complete YouTube study video';
    host.setAttribute('aria-label', 'Complete YouTube study video');
    host.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    host.setAttribute('allowfullscreen', '');
    if (media) host.src = studyVideoEmbedUrl(media, options);
    wrapper.append(host);
    els.studyVideoFrame = host;
    return host;
  }

  function stopStudyVideoPolling() {
    clearInterval(state.studyVideoPoll);
    state.studyVideoPoll = null;
  }

  function destroyStudyVideo() {
    state.studyVideoGeneration += 1;
    state.transcriptVideoActionId += 1;
    stopStudyVideoPolling();
    try { state.studyVideoPlayer?.destroy?.(); } catch { /* YouTube may already have removed the iframe. */ }
    state.studyVideoPlayer = null;
    state.studyVideoReady = false;
    state.studyVideoPlaying = false;
    state.studyVideoLoadPromise = null;
    state.studyVideoClipEnd = 0;
    state.transcriptSeekTarget = null;
    state.fullVideoStudyId = '';
    recreateStudyVideoHost();
  }

  function playbackForStudy(study = activeStudy()) {
    if (!study) return { time: 0, selectedCueId: '', selectedIndex: -1 };
    study.mobilePlayback = normalizeMobilePlayback(study.mobilePlayback, Array.isArray(study.transcript) ? study.transcript : []);
    return study.mobilePlayback;
  }

  function rememberStudyPlayback({ time, selectedIndex, persist = false } = {}) {
    const study = activeStudy();
    if (!study) return;
    const cues = activeTranscript();
    const playback = playbackForStudy(study);
    if (Number.isFinite(Number(time))) playback.time = Math.min(86400, Math.max(0, Number(time)));
    if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < cues.length) {
      playback.selectedIndex = selectedIndex;
      playback.selectedCueId = cues[selectedIndex]?.id || '';
    }
    if (persist) saveLibrary();
  }

  function currentStudyVideoTime() {
    if (state.transcriptSeekTarget !== null) return state.transcriptSeekTarget;
    if (state.studyVideoReady && state.studyVideoPlayer?.getCurrentTime) {
      try {
        const time = Number(state.studyVideoPlayer.getCurrentTime());
        if (Number.isFinite(time)) return Math.max(0, time);
      } catch { /* Use the remembered position. */ }
    }
    return playbackForStudy().time;
  }

  function captureStudyVideoPosition(persist = false) {
    rememberStudyPlayback({
      time: currentStudyVideoTime(),
      selectedIndex: state.transcriptSelectedIndex,
      persist
    });
  }

  function pauseStudyVideo() {
    stopStudyVideoPolling();
    state.studyVideoClipEnd = 0;
    state.studyVideoPlaying = false;
    if (state.studyVideoPlayer?.pauseVideo) {
      try { state.studyVideoPlayer.pauseVideo(); } catch { /* Player is optional. */ }
      return;
    }
    const study = activeStudy();
    const media = normalizeYouTubeMedia(study?.media);
    if (media && els.studyVideoFrame?.tagName === 'IFRAME') {
      const cues = activeTranscript();
      const index = state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptSelectedIndex;
      els.studyVideoFrame.src = studyVideoEmbedUrl(media, { start: cues[index]?.start || 0 });
    }
    updateTranscriptPosition();
  }

  function startStudyVideoPolling() {
    stopStudyVideoPolling();
    updateStudyVideoTime();
    state.studyVideoPoll = setInterval(updateStudyVideoTime, 200);
  }

  function loadStudyVideo(restart = false) {
    const study = activeStudy();
    const media = normalizeYouTubeMedia(study?.media);
    if (!media) { destroyStudyVideo(); return Promise.resolve(null); }
    if (state.fullVideoStudyId === study.id && state.studyVideoLoadPromise) {
      return state.studyVideoLoadPromise.then(player => {
        if (restart) {
          rememberStudyPlayback({ time: 0, selectedIndex: activeTranscript().length ? 0 : -1, persist: true });
          setTranscriptMarker('selected', activeTranscript().length ? 0 : -1);
          player?.seekTo(0, true);
          player?.playVideo();
        }
        return player;
      });
    }
    destroyStudyVideo();
    state.fullVideoStudyId = study.id;
    const expectedStudyId = study.id;
    const generation = state.studyVideoGeneration;
    const resumeAt = restart ? 0 : playbackForStudy(study).time;
    if (restart) rememberStudyPlayback({ time: 0, selectedIndex: activeTranscript().length ? 0 : -1, persist: true });
    const fallbackFrame = recreateStudyVideoHost(media, { start: resumeAt, autoplay: restart });
    state.studyVideoLoadPromise = ensureYouTubeApi().then(() => new Promise((resolve, reject) => {
      if (activeStudy()?.id !== expectedStudyId || generation !== state.studyVideoGeneration) { resolve(null); return; }
      const host = fallbackFrame?.isConnected ? fallbackFrame : els.studyVideoFrame;
      if (!host) { reject(new Error('Video container is unavailable')); return; }
      state.studyVideoPlayer = new YT.Player(host, {
        events: {
          onReady: event => {
            if (generation !== state.studyVideoGeneration) { event.target.destroy?.(); resolve(null); return; }
            state.studyVideoReady = true;
            if (resumeAt > 0 || restart) event.target.seekTo(resumeAt, true);
            if (restart) event.target.playVideo();
            resolve(event.target);
          },
          onStateChange: event => {
            if (generation !== state.studyVideoGeneration) return;
            if (event.data === window.YT?.PlayerState?.PLAYING) {
              state.studyVideoPlaying = true;
              stopTranscriptSpeech();
              startStudyVideoPolling();
            } else {
              state.studyVideoPlaying = false;
              stopStudyVideoPolling();
              updateStudyVideoTime();
              captureStudyVideoPosition(true);
            }
            updateTranscriptPosition();
          },
          onError: () => showToast('This YouTube video could not be played')
        }
      });
    })).catch(error => {
      if (generation !== state.studyVideoGeneration) return null;
      state.studyVideoLoadPromise = null;
      state.studyVideoReady = false;
      showToast('Video ready · live subtitle follow is temporarily unavailable');
      return null;
    });
    return state.studyVideoLoadPromise;
  }

  function activeTranscript() {
    return Array.isArray(activeStudy()?.transcript) ? activeStudy().transcript : [];
  }

  function transcriptCueIndexAt(time, cues = activeTranscript()) {
    let low = 0, high = cues.length - 1, candidate = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (cues[middle].start <= time + .04) { candidate = middle; low = middle + 1; } else high = middle - 1;
    }
    for (let index = candidate; index >= Math.max(0, candidate - 5); index -= 1) {
      if (time >= cues[index].start - .04 && time < cues[index].end + .04) return index;
    }
    return -1;
  }

  function transcriptCueRange(index, cues = activeTranscript()) {
    const cue = cues[index];
    if (!cue) return null;
    return { start: cue.start, end: cue.end };
  }

  function transcriptRow(index) {
    return els.transcriptList?.querySelector(`[data-transcript-index="${index}"]`);
  }

  function scrollTranscriptTo(index) {
    if (!state.transcriptFollow || index < 0) return;
    const row = transcriptRow(index);
    if (row && !row.hidden) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  let transcriptPositionFrame = 0;
  let transcriptPositionCleanup = () => {};
  function cancelTranscriptPositioning() {
    cancelAnimationFrame(transcriptPositionFrame);
    transcriptPositionFrame = 0;
    transcriptPositionCleanup();
    transcriptPositionCleanup = () => {};
  }

  function positionTranscriptViewport(index) {
    cancelTranscriptPositioning();
    const studyId = activeStudy()?.id;
    let frames = 0;
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    events.forEach(type => window.addEventListener(type, cancelTranscriptPositioning, { passive: true, once: true }));
    transcriptPositionCleanup = () => events.forEach(type => window.removeEventListener(type, cancelTranscriptPositioning));
    const align = () => {
      const row = transcriptRow(index);
      if (state.view !== 'video' || activeStudy()?.id !== studyId || !row || row.hidden) { cancelTranscriptPositioning(); return; }
      const rect = row.getBoundingClientRect();
      const top = window.visualViewport?.offsetTop || 0;
      const bottom = Math.min(top + (window.visualViewport?.height || innerHeight), $('.bottom-nav').getBoundingClientRect().top);
      const height = Math.max(100, bottom - top - 24);
      const delta = rect.top + Math.min(rect.height, height) / 2 - (top + bottom) / 2;
      // Jump directly: smooth scrolling measures lazy-rendered rows before their
      // real heights are known. Re-align briefly as layout/keyboard settles.
      if (Math.abs(delta) > 1) scrollTo({ top: Math.max(0, scrollY + delta), behavior: 'instant' });
      if (++frames < 30) transcriptPositionFrame = requestAnimationFrame(align);
      else cancelTranscriptPositioning();
    };
    transcriptPositionFrame = requestAnimationFrame(align);
  }

  function restoreTranscriptViewport() {
    if (state.view !== 'video') return;
    const index = state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptSelectedIndex;
    if (index < 0) { scrollTo({ top: 0, behavior: 'auto' }); return; }
    positionTranscriptViewport(index);
  }

  function updateTranscriptPosition() {
    const cues = activeTranscript();
    const index = state.transcriptReadingIndex >= 0 ? state.transcriptReadingIndex : state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptSelectedIndex;
    const interaction = state.transcriptSpeechActive
      ? 'Reading'
      : state.studyVideoPlaying
        ? 'Playing'
        : index === state.transcriptSelectedIndex
          ? 'Tap again to play'
          : '';
    els.transcriptPosition.textContent = index >= 0
      ? `Subtitle ${index + 1} of ${cues.length} · ${formatClipTime(cues[index]?.start)}${interaction ? ` · ${interaction}` : ''}`
      : `${cues.length} subtitles · choose a line`;
  }

  function setTranscriptMarker(kind, index, { scroll = true } = {}) {
    const property = kind === 'active' ? 'transcriptActiveIndex' : kind === 'reading' ? 'transcriptReadingIndex' : 'transcriptSelectedIndex';
    const previous = state[property];
    if (previous === index) { updateTranscriptPosition(); return; }
    transcriptRow(previous)?.classList.remove(kind);
    if (kind === 'selected') transcriptRow(previous)?.querySelector('button[data-transcript-select]')?.setAttribute('aria-pressed', 'false');
    state[property] = index;
    transcriptRow(index)?.classList.add(kind);
    if (kind === 'selected') transcriptRow(index)?.querySelector('button[data-transcript-select]')?.setAttribute('aria-pressed', 'true');
    if (kind === 'selected' && index >= 0) rememberStudyPlayback({ time: activeTranscript()[index]?.start, selectedIndex: index });
    updateTranscriptPosition();
    if (scroll && ((kind === 'active' && state.studyVideoPlaying) || kind === 'reading') && index >= 0) scrollTranscriptTo(index);
  }

  function updateStudyVideoTime() {
    const player = state.studyVideoPlayer;
    if (!state.studyVideoReady || !player?.getCurrentTime) return;
    let time = 0;
    try { time = Number(player.getCurrentTime()) || 0; } catch { return; }
    if (state.transcriptSeekTarget !== null) {
      // A pause notification can still report the position before seekTo.
      if (!state.studyVideoPlaying && Math.abs(time - state.transcriptSeekTarget) > .3) return;
      state.transcriptSeekTarget = null;
    }
    setTranscriptMarker('active', transcriptCueIndexAt(time));
    rememberStudyPlayback({ time, selectedIndex: state.transcriptSelectedIndex });
    if (state.studyVideoClipEnd && time >= state.studyVideoClipEnd - .04) {
      const end = state.studyVideoClipEnd;
      state.studyVideoClipEnd = 0;
      try { player.pauseVideo(); player.seekTo(end, true); } catch { /* Retain the last visible subtitle. */ }
      stopStudyVideoPolling();
    }
  }

  async function selectTranscriptCue(index, mode = 'select') {
    const cues = activeTranscript();
    const range = transcriptCueRange(index, cues);
    if (!range) return;
    let actionId = ++state.transcriptVideoActionId;
    const shouldPlay = mode === 'continuous' || mode === 'clip';
    stopTranscriptSpeech();
    setTranscriptMarker('selected', index);
    setTranscriptMarker('active', index, { scroll: false });
    rememberStudyPlayback({ time: range.start, selectedIndex: index, persist: true });
    const study = activeStudy();
    if (!normalizeYouTubeMedia(study?.media)) {
      if (shouldPlay) showToast('This transcript has no linked YouTube video');
      return;
    }
    const media = normalizeYouTubeMedia(study?.media);
    if (shouldPlay && !state.videoExpanded) { state.videoExpanded = true; renderStudyVideo(); }
    if (!shouldPlay && !state.videoExpanded && !state.studyVideoPlayer) return;
    const pendingPlayer = loadStudyVideo(false);
    state.transcriptSeekTarget = range.start;
    actionId = state.transcriptVideoActionId;
    const player = await pendingPlayer;
    if (actionId !== state.transcriptVideoActionId) return;
    if (!player) {
      if (els.studyVideoFrame?.tagName === 'IFRAME') {
        els.studyVideoFrame.src = studyVideoEmbedUrl(media, { start: range.start, end: mode === 'clip' ? range.end : 0, autoplay: shouldPlay });
        state.studyVideoPlaying = shouldPlay;
        updateTranscriptPosition();
      }
      return;
    }
    try {
      state.studyVideoClipEnd = 0;
      player.pauseVideo();
      player.seekTo(range.start, true);
      state.studyVideoClipEnd = mode === 'clip' ? range.end : 0;
      if (shouldPlay) player.playVideo();
    } catch { showToast('The video could not move to this subtitle'); }
  }

  function activateTranscriptCue(index) {
    if (state.studyVideoPlaying) {
      selectTranscriptCue(index, 'select');
      return;
    }
    selectTranscriptCue(index, state.transcriptSelectedIndex === index ? 'continuous' : 'select');
  }

  function clearTranscriptSpeechState() {
    state.transcriptSpeechRunId += 1;
    state.transcriptSpeechActive = false;
    state.transcriptSpeechPaused = false;
    state.transcriptSpeechIndex = -1;
    state.transcriptSpeechPart = 0;
    setTranscriptMarker('reading', -1);
    updateTranscriptSpeechControls();
  }

  function stopTranscriptSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    clearTranscriptSpeechState();
  }

  function transcriptSpeechParts(cue) {
    const mode = ['en', 'es', 'both'].includes(state.transcriptLanguage) ? state.transcriptLanguage : 'both';
    return [
      ...(mode !== 'es' && cue?.en ? [{ text: cue.en, language: 'en-US' }] : []),
      ...(mode !== 'en' && cue?.es ? [{ text: cue.es, language: 'es-US' }] : [])
    ];
  }

  function configuredUtterance(text, language) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = Math.max(.6, Math.min(1.25, Number(state.transcriptSpeed) || .9));
    const prefix = language.toLowerCase().split('-')[0];
    const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(prefix));
    if (voice) utterance.voice = voice;
    return utterance;
  }

  function speakTranscriptSequence(runId, index, partIndex = 0) {
    if (runId !== state.transcriptSpeechRunId || !state.transcriptSpeechActive) return;
    const cues = activeTranscript();
    let parts = [];
    // Skip missing translations and filtered lines without recursive calls.
    while (index < cues.length) {
      if (!state.transcriptWordsOnly || learning.indexFor(activeStudy()).cues[index]?.length) {
        parts = transcriptSpeechParts(cues[index]);
        if (partIndex < parts.length) break;
      }
      index += 1; partIndex = 0;
    }
    if (index >= cues.length) { stopTranscriptSpeech(); showToast('Transcript complete'); return; }
    state.transcriptSpeechIndex = index;
    state.transcriptSpeechPart = partIndex;
    setTranscriptMarker('reading', index);
    const utterance = configuredUtterance(parts[partIndex].text, parts[partIndex].language);
    const advance = () => {
      if (runId !== state.transcriptSpeechRunId || !state.transcriptSpeechActive) return;
      speakTranscriptSequence(runId, partIndex + 1 < parts.length ? index : index + 1, partIndex + 1 < parts.length ? partIndex + 1 : 0);
    };
    utterance.onend = advance;
    utterance.onerror = () => {
      if (runId !== state.transcriptSpeechRunId || !state.transcriptSpeechActive) return;
      stopTranscriptSpeech();
      showToast('Voice playback stopped. Try Read all again.');
    };
    speechSynthesis.speak(utterance);
  }

  function updateTranscriptSpeechControls() {
    if (!els.transcriptRead) return;
    els.transcriptRead.classList.toggle('active', state.transcriptSpeechActive);
    els.transcriptRead.querySelector('span').textContent = state.transcriptSpeechPaused ? 'Continue' : state.transcriptSpeechActive ? 'Pause' : 'Read all';
    els.transcriptStop.disabled = !state.transcriptSpeechActive;
  }

  function toggleTranscriptReading() {
    if (!('speechSynthesis' in window)) { showToast('Speech is unavailable on this device'); return; }
    if (state.transcriptSpeechActive) {
      if (state.transcriptSpeechPaused) { speechSynthesis.resume(); state.transcriptSpeechPaused = false; }
      else { speechSynthesis.pause(); state.transcriptSpeechPaused = true; }
      updateTranscriptSpeechControls();
      return;
    }
    const cues = activeTranscript();
    if (!cues.length) return;
    pauseStudyVideo();
    stopSpeech();
    state.transcriptSpeechActive = true;
    state.transcriptSpeechPaused = false;
    const start = Math.max(0, state.transcriptSelectedIndex >= 0 ? state.transcriptSelectedIndex : state.transcriptActiveIndex);
    const runId = ++state.transcriptSpeechRunId;
    updateTranscriptSpeechControls();
    speakTranscriptSequence(runId, start, 0);
  }

  function speakTranscriptCue(index) {
    const cue = activeTranscript()[index];
    const parts = transcriptSpeechParts(cue);
    if (!parts.length || !('speechSynthesis' in window)) { showToast('No text is available in the selected language'); return; }
    pauseStudyVideo();
    stopSpeech();
    const runId = state.transcriptSpeechRunId;
    setTranscriptMarker('reading', index);
    let part = 0;
    const next = () => {
      if (runId !== state.transcriptSpeechRunId) return;
      if (part >= parts.length) { setTranscriptMarker('reading', -1); return; }
      const utterance = configuredUtterance(parts[part].text, parts[part].language);
      part += 1;
      utterance.onend = next;
      utterance.onerror = next;
      speechSynthesis.speak(utterance);
    };
    next();
  }

  function highlightedSubtitle(text, matches = [], cueIndex) {
    let html = '', cursor = 0;
    for (const match of matches) {
      html += escapeHtml(text.slice(cursor, match.start));
      html += `<button type="button" class="vocabulary-word" style="--word-color:${learning.colors[learning.colorIndex(match.card)]}" data-vocabulary-word="${escapeHtml(match.card.id)}" data-word-cue="${cueIndex}" aria-label="Study ${escapeHtml(match.card.english)}">${escapeHtml(text.slice(match.start, match.end))}</button>`;
      cursor = match.end;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  function renderStudyTranscript() {
    const study = activeStudy();
    const cues = activeTranscript();
    const media = normalizeYouTubeMedia(study?.media);
    if (!['en', 'es', 'both'].includes(state.transcriptLanguage)) state.transcriptLanguage = 'both';
    els.transcriptPanel.hidden = !cues.length;
    els.transcriptEmpty.hidden = Boolean(cues.length);
    els.transcriptSummary.textContent = cues.length ? `${cues.length} SUBTITLES` : 'FULL STUDY';
    if (!cues.length) { els.transcriptList.replaceChildren(); return; }
    if (state.transcriptStudyId !== study.id) {
      state.transcriptStudyId = study.id;
      const playback = playbackForStudy(study);
      state.transcriptSelectedIndex = playback.selectedIndex;
      state.transcriptActiveIndex = transcriptCueIndexAt(playback.time, cues);
      state.transcriptReadingIndex = -1;
    }
    const vocabulary = learning.indexFor(study);
    els.transcriptWords.disabled = vocabulary.matched.size === 0;
    if (!vocabulary.matched.size) state.transcriptWordsOnly = false;
    els.transcriptWords.textContent = `My words · ${vocabulary.matched.size}`;
    els.transcriptWords.setAttribute('aria-pressed', String(state.transcriptWordsOnly));
    els.transcriptVocabularyHint.textContent = vocabulary.matched.size ? 'Tap a marked word' : 'Your saved words appear here';
    els.transcriptList.innerHTML = cues.map((cue, index) => `<article class="transcript-cue${index === state.transcriptSelectedIndex ? ' selected' : ''}${index === state.transcriptActiveIndex ? ' active' : ''}${index === state.transcriptReadingIndex ? ' reading' : ''}" data-transcript-index="${index}" ${state.transcriptWordsOnly && !vocabulary.cues[index]?.length ? 'hidden' : ''} data-language="${escapeHtml(state.transcriptLanguage)}">
      <div class="transcript-cue-main" data-transcript-tap="${index}"><button class="transcript-time" type="button" data-transcript-select="${index}" aria-pressed="${index === state.transcriptSelectedIndex}" aria-label="Select subtitle ${index + 1} at ${escapeHtml(formatClipTime(cue.start))}. Tap again to play.">${escapeHtml(formatClipTime(cue.start))}</button><span class="transcript-cue-copy"><strong lang="en">${highlightedSubtitle(cue.en, vocabulary.cues[index], index)}</strong><small lang="es">${escapeHtml(cue.es)}</small></span></div>
      <span class="transcript-cue-tools"><button type="button" data-transcript-speak="${index}" aria-label="Speak subtitle ${index + 1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></button><button type="button" data-transcript-clip="${index}" aria-label="Play linked video for subtitle ${index + 1}" ${media ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg></button></span>
    </article>`).join('');
    els.transcriptLanguages.forEach(button => button.classList.toggle('active', button.dataset.transcriptLanguage === state.transcriptLanguage));
    els.transcriptSpeed.value = String(state.transcriptSpeed);
    els.transcriptFollow.classList.toggle('active', state.transcriptFollow);
    els.transcriptFollow.setAttribute('aria-pressed', String(state.transcriptFollow));
    updateTranscriptPosition();
    updateTranscriptSpeechControls();
  }

  function renderStudyVideo() {
    if (!els.studyVideoReady) return;
    const study = activeStudy();
    const media = normalizeYouTubeMedia(study?.media);
    els.studyVideoReady.hidden = !media || !state.videoExpanded;
    els.toggleVideo.hidden = !media;
    els.toggleVideo.textContent = state.videoExpanded ? 'Hide video' : 'Show video';
    els.toggleVideo.setAttribute('aria-expanded', String(state.videoExpanded));
    els.studyVideoEmpty.hidden = Boolean(media) || activeTranscript().length > 0;
    if (!media) destroyStudyVideo();
    else {
      els.studyVideoTitle.textContent = study.name || 'Study video';
      els.studyVideoMeta.textContent = `${media.name || 'YouTube video'} · ${(study.transcript || []).length} subtitles`;
      if (state.videoExpanded) loadStudyVideo(false);
    }
    renderStudyTranscript();
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
    incoming.cards = Array.isArray(incoming?.cards) ? incoming.cards : [];
    incoming.transcript = normalizeTranscript(incoming?.transcript);
    const existing = state.library.studies.find(study => study.id === incoming.id);
    if (!existing) return incoming;
    incoming.mobilePlayback = normalizeMobilePlayback(existing.mobilePlayback, incoming.transcript);
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

  function validatedIncomingStudy(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 180) throw new Error('Invalid study identity');
    if (raw.cards !== undefined && !Array.isArray(raw.cards)) throw new Error('Invalid vocabulary');
    if (raw.transcript !== undefined && !Array.isArray(raw.transcript) && !Array.isArray(raw.transcript?.cues)) throw new Error('Invalid transcript');
    const transcript = normalizeTranscript(raw.transcript);
    const cards = raw.cards || [], ids = new Set();
    if (!cards.length && !transcript.length) throw new Error('This study contains no vocabulary or subtitles');
    if (cards.length > 6000 || (Array.isArray(raw.transcript) && raw.transcript.length > 24000)) throw new Error('Study exceeds the transfer limit');
    for (const card of cards) {
      if (!card || typeof card.id !== 'string' || !card.id || ids.has(card.id) || typeof card.english !== 'string' || typeof card.spanish !== 'string') throw new Error('Invalid or duplicate vocabulary card');
      ids.add(card.id);
    }
    return { ...raw, name: String(raw.name || 'Untitled study').slice(0, 120),
      color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#76a8ff',
      cards: cards.map(card => ({ ...card })), transcript };
  }

  async function importPackValue(value) {
    const pack = await decodePackValue(value);
    const rawStudies = Array.isArray(pack?.studies) ? pack.studies : pack?.study ? [pack.study] : [];
    if (!rawStudies.length || rawStudies.length > 40) throw new Error('Invalid study pack');
    // Validate the entire pack before replacing any existing study.
    const studies = rawStudies.map(validatedIncomingStudy);
    if (new Set(studies.map(study => study.id)).size !== studies.length) throw new Error('Duplicate studies in pack');
    captureStudyVideoPosition(false);
    const previous = JSON.parse(JSON.stringify(state.library));
    destroyStudyVideo(); stopSpeech(); resetPractice();
    for (const rawIncoming of studies) {
      const incoming = mergeIncomingStudy(rawIncoming);
      const index = state.library.studies.findIndex(study => study.id === incoming.id);
      if (index >= 0) state.library.studies[index] = incoming; else state.library.studies.push(incoming);
    }
    state.transcriptStudyId = ''; state.transcriptWordsOnly = false;
    state.library.activeStudyId = studies[0].id;
    normalizeLibrary();
    if (!await saveLibrary()) {
      state.library = previous; render();
      throw new Error('This study could not be saved. Keep the transfer and try again.');
    }
    render(); showView('today');
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
    const word = event.target.closest('[data-vocabulary-word]'); if (word) { openVocabularyWord(word.dataset.vocabularyWord, Number(word.dataset.wordCue)); return; }
    const transcriptSpeak = event.target.closest('[data-transcript-speak]'); if (transcriptSpeak) { speakTranscriptCue(Number(transcriptSpeak.dataset.transcriptSpeak)); return; }
    const transcriptClip = event.target.closest('[data-transcript-clip]'); if (transcriptClip) { selectTranscriptCue(Number(transcriptClip.dataset.transcriptClip), 'clip'); return; }
    const transcriptSelect = event.target.closest('[data-transcript-select], [data-transcript-tap]'); if (transcriptSelect) { activateTranscriptCue(Number(transcriptSelect.dataset.transcriptSelect ?? transcriptSelect.dataset.transcriptTap)); return; }
    const transcriptLanguage = event.target.closest('[data-transcript-language]'); if (transcriptLanguage) {
      state.transcriptLanguage = transcriptLanguage.dataset.transcriptLanguage;
      savePreference('lingualoop.mobile.transcriptLanguage', state.transcriptLanguage);
      stopTranscriptSpeech();
      els.transcriptLanguages.forEach(button => button.classList.toggle('active', button === transcriptLanguage));
      $$('.transcript-cue', els.transcriptList).forEach(row => { row.dataset.language = state.transcriptLanguage; });
      return;
    }
    const deleteButton = event.target.closest('[data-study-delete]'); if (deleteButton) { requestStudyDelete(deleteButton.dataset.studyDelete); return; }
    const viewButton = event.target.closest('[data-view-target]'); if (viewButton) showView(viewButton.dataset.viewTarget);
    const practiceButton = event.target.closest('[data-practice-mode]'); if (practiceButton) { startPractice(practiceButton.dataset.practiceMode); showView('practice'); }
    const studyButton = event.target.closest('[data-study-open]'); if (studyButton) { clearPendingStudyDelete(); stopTranscriptSpeech(); captureStudyVideoPosition(true); destroyStudyVideo(); resetPractice(); state.transcriptWordsOnly = false; state.library.activeStudyId = studyButton.dataset.studyOpen; state.transcriptStudyId = ''; saveLibrary(); render(); if (state.view === 'video') { renderStudyVideo(); requestAnimationFrame(restoreTranscriptViewport); } showToast(`${activeStudy()?.name || 'Study'} is now active`); }
    const rating = event.target.closest('[data-rating]'); if (rating) rateCard(rating.dataset.rating);
  });
  els.toggleVideo.addEventListener('click', () => {
    captureStudyVideoPosition(true); pauseStudyVideo();
    state.videoExpanded = !state.videoExpanded;
    savePreference('lingualoop.mobile.videoExpanded', String(state.videoExpanded));
    renderStudyVideo();
  });
  $('#practiceBackButton').addEventListener('click', returnFromPractice);
  els.practiceDone.addEventListener('click', returnFromPractice);
  els.cardContext.addEventListener('click', findCardInTranscript);
  $('#wordSheetClose').addEventListener('click', () => els.wordSheet.close());
  els.wordSheet.addEventListener('click', event => { if (event.target === els.wordSheet && event.clientY < els.wordSheet.getBoundingClientRect().top) els.wordSheet.close(); });
  els.wordSheet.addEventListener('close', stopSpeech);
  els.wordSheetSpeak.addEventListener('click', () => speakText(els.wordSheetTitle.textContent, 'en-US', els.wordSheetSpeak));
  els.wordSheetPractice.addEventListener('click', () => {
    const id = state.wordSheetCardId; els.wordSheet.close();
    startPractice('write', { cardIds: [id], returnTo: 'video' }); showView('practice');
  });
  els.transcriptWords.addEventListener('click', () => {
    stopTranscriptSpeech(); state.transcriptWordsOnly = !state.transcriptWordsOnly;
    renderStudyTranscript();
  });
  els.activeStudySummary.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showView(els.activeStudySummary.dataset.viewTarget); } });
  els.startReview.addEventListener('click', () => { startPractice('cards'); showView('practice'); });
  els.reveal.addEventListener('click', revealAnswer);
  els.speak.addEventListener('click', speakCurrent);
  els.answerSpeak.addEventListener('click', speakCurrentAnswer);
  els.clipButton.addEventListener('click', toggleCardClip);
  els.closeClip.addEventListener('click', closeCardClip);
  els.restartStudyVideo.addEventListener('click', () => loadStudyVideo(true));
  els.transcriptRead.addEventListener('click', toggleTranscriptReading);
  els.transcriptStop.addEventListener('click', stopTranscriptSpeech);
  els.transcriptFollow.addEventListener('click', () => {
    state.transcriptFollow = !state.transcriptFollow;
    savePreference('lingualoop.mobile.transcriptFollow', String(state.transcriptFollow));
    els.transcriptFollow.classList.toggle('active', state.transcriptFollow);
    els.transcriptFollow.setAttribute('aria-pressed', String(state.transcriptFollow));
    if (state.transcriptFollow) scrollTranscriptTo(state.transcriptReadingIndex >= 0 ? state.transcriptReadingIndex : state.transcriptActiveIndex);
  });
  els.transcriptSpeed.addEventListener('change', () => {
    state.transcriptSpeed = Math.max(.6, Math.min(1.25, Number(els.transcriptSpeed.value) || .9));
    savePreference('lingualoop.mobile.transcriptSpeed', String(state.transcriptSpeed));
    if (state.transcriptSpeechActive) { stopTranscriptSpeech(); showToast('Voice speed updated · tap Read all to continue'); }
  });
  els.writeForm.addEventListener('submit', checkWrittenAnswer);
  els.pasteTransfer.addEventListener('click', pasteTransferFromClipboard);
  els.importManualTransfer.addEventListener('click', importManualTransfer);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') captureStudyVideoPosition(true); });
  addEventListener('pagehide', () => captureStudyVideoPosition(true));
  (async () => {
    await loadLibrary(); await importPackFromHash(); render(); showView('today');
    if ('serviceWorker' in navigator) {
      const registerOfflineShell = () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {});
      // IndexedDB/import may finish after load; do not miss offline installation.
      if (document.readyState === 'complete') registerOfflineShell();
      else addEventListener('load', registerOfflineShell, { once: true });
    }
  })();
})();
