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
    sessionMode: 'cards', practiceInitialCount: 0, practiceResults: {}, evidence: null,
    reviewScope: readPreference('lingualoop.mobile.reviewScope') === 'all' ? 'all' : 'current',
    reviewMode: ['cards','write','listen'].includes(readPreference('lingualoop.mobile.reviewMode')) ? readPreference('lingualoop.mobile.reviewMode') : 'cards',
    reviewSize: [5, 8, 10].includes(Number(readPreference('lingualoop.mobile.reviewSize'))) ? Number(readPreference('lingualoop.mobile.reviewSize')) : 5,
    retireTarget: null, retireUndo: null, inlinePractice: null,
    videoExpanded: readPreference('lingualoop.mobile.videoExpanded') !== 'false',
    wordSheetCardId: '', wordSheetCueIndex: -1, transcriptWordsOnly: false,
    pendingDeleteStudyId: '', pendingDeleteTimer: null, fullVideoStudyId: '',
    studyVideoGeneration: 0, studyVideoPlayer: null, studyVideoReady: false, studyVideoPlaying: false, studyVideoPoll: null, studyVideoClipEnd: 0,
    transcriptVideoActionId: 0, transcriptSeekTarget: null,
    transcriptSelectedIndex: -1, transcriptActiveIndex: -1, transcriptReadingIndex: -1,
    transcriptStudyId: '', transcriptMarkerIndex: -1, transcriptBrowseIndex: -1,
    transcriptFollowSuspended: false,
    transcriptLanguage: readPreference('lingualoop.mobile.transcriptLanguage') || 'both',
    transcriptSpeed: Number(readPreference('lingualoop.mobile.transcriptSpeed')) || .9,
    transcriptFollow: readPreference('lingualoop.mobile.transcriptFollow') !== 'false',
    transcriptSpeechActive: false, transcriptSpeechPaused: false, transcriptSpeechRunId: 0,
    transcriptSpeechIndex: -1, transcriptSpeechPart: 0
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    transcriptDock: $('#transcriptDock'), transcriptNavigation: $('#transcriptNavigation'),
    transcriptControls: $('#transcriptControls'), transcriptLastSelection: $('#transcriptLastSelection'),
    transcriptBrowsePosition: $('#transcriptBrowsePosition'), transcriptNavigator: $('#transcriptNavigator'), 
    transcriptJumpForm: $('#transcriptJumpForm'), transcriptJumpInput: $('#transcriptJumpInput'), 
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
      study.cards.forEach((card, index) => Object.assign(card, learning.normalizeProgress(card), {
        id: card.id || `${study.id}-${index}`, english: String(card.english || ''), spanish: String(card.spanish || ''), context: String(card.context || ''),
        clip: normalizeClip(card.clip), colorIndex: learning.colorIndex(card),
        level: Number(card.level) || 0, dueAt: Number(card.dueAt) || 0, reviews: Number(card.reviews) || 0, correct: Number(card.correct) || 0
      }));
    });
    if (!state.library.studies.some(study => study.id === state.library.activeStudyId)) state.library.activeStudyId = state.library.studies[0]?.id || '';
    return changed;
  }

  const activeStudy = () => state.library.studies.find(study => study.id === state.library.activeStudyId) || null;
  const dueCards = (study = activeStudy()) => study ? study.cards.filter(card => !card.retiredAt && (!card.dueAt || card.dueAt <= Date.now())) : [];
  const allCards = () => state.library.studies.flatMap(study => study.cards.map(card => ({ ...card, studyId: study.id })));

  function showView(view, { transcriptIndex = -1 } = {}) {
    cancelTranscriptPositioning();
    closeTranscriptJump();
    if (state.view !== view) {
      state.transcriptFollowSuspended = false;
    }
    if (els.wordSheet.open) els.wordSheet.close();
    if (view === 'practice' && !state.queue.length) startPractice(state.practiceMode);
    if (state.view === 'practice' && view !== 'practice') closeCardClip();
    if (state.view === 'video' && view !== 'video') { captureStudyVideoPosition(true); pauseStudyVideo(); stopTranscriptSpeech(); }
    stopSpeech();
    state.view = view;
    document.body.dataset.view = view;
    updateAppViewport();
    if (view === 'today' || view === 'studies') render();
    if (view === 'practice') restorePracticePresentation();
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.bottom-nav [data-view-target]').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === view));
    if (view === 'video') {
      const explicitCue = activeTranscript()[transcriptIndex];
      if (explicitCue) {
        rememberStudyPlayback({ time: explicitCue.start, selectedIndex: transcriptIndex });
        state.transcriptSelectedIndex = state.transcriptActiveIndex = state.transcriptMarkerIndex = transcriptIndex;
      }
      renderStudyVideo();
      if (explicitCue) {
        selectTranscriptCue(transcriptIndex, 'select');
        positionTranscriptViewport(transcriptIndex);
      } else restoreTranscriptViewport();
    } else scrollTo({ top: 0, behavior: 'smooth' });
  }

  function availableCards(study = activeStudy()) { return (study?.cards || []).filter(card => !card.retiredAt); }
  function scopedStudies() { return state.reviewScope === 'current' ? [activeStudy()].filter(Boolean) : state.library.studies; }
  function nextBatch(extra = false) {
    return learning.buildBatch(scopedStudies(), { limit: state.reviewSize, extra });
  }
  function render() {
    if (state.index < state.queue.length && !currentCard()) { state.evidence = null; renderPracticeCard(); snapshotSession(); }
    const study = activeStudy(), cards = scopedStudies().flatMap(item => availableCards(item));
    const due = scopedStudies().flatMap(item => dueCards(item));
    const resume = currentCard();
    els.todayDate.textContent = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date());
    els.todayDate.dateTime = new Date().toLocaleDateString('en-CA');
    els.dueCount.textContent = due.length;
    $('#dueUnit').textContent = due.length === 1 ? 'word' : 'words';
    els.todayMessage.textContent = !study ? 'Add a study to begin.' : !cards.length ? 'All learned. Read on, or restore words in Studies.' : !due.length ? 'Caught up · extra practice is available.' : state.reviewScope === 'all' ? `Across ${state.library.studies.length} ${state.library.studies.length === 1 ? 'study' : 'studies'}` : 'From this study';
    const independent = cards.reduce((sum, card) => sum + (Number(card.independentRecalls) || 0), 0);
    const attempts = cards.reduce((sum, card) => sum + (Number(card.recallAttempts) || 0), 0);
    els.retentionValue.textContent = attempts ? `${independent} / ${attempts}` : '—';
    els.progressOrbit.style.setProperty('--progress', `${attempts ? independent / attempts * 100 : 0}%`);
    els.statDue.textContent = due.length;
    els.statLearning.textContent = cards.filter(card => card.stage !== 'strong').length;
    els.statStrong.textContent = cards.filter(card => card.stage === 'strong').length;
    els.cardsCount.textContent = cards.length; els.writeCount.textContent = cards.length;
    els.startReview.disabled = !cards.length;
    $('#resumePracticeButton').disabled = !resume;
    if (!resume) $('#resumePracticeButton span').textContent = 'No unfinished session';
    if (resume) $('#resumePracticeButton span').textContent = `Continue · ${Math.min(state.index + 1, state.practiceInitialCount)} / ${state.practiceInitialCount}`;
    const batchSize = nextBatch(!due.length).length;
    els.startReview.querySelector('span').textContent = `${resume ? 'Start new' : 'Start'} ${{ cards: 'cards', write: 'writing', listen: 'listening' }[state.reviewMode]} · ${batchSize} ${batchSize === 1 ? 'word' : 'words'}`;
    $('#sessionStatus').textContent = attempts ? `${independent} / ${attempts} recalled without help` : '';
    $$('[data-review-scope]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reviewScope === state.reviewScope)));
    $$('[data-review-size]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.reviewSize) === state.reviewSize)));
    $$('[data-practice-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.practiceMode === state.reviewMode)));
    $('#practiceModeHint').textContent = { adaptive: 'Recall, write and listen in one session.', cards: 'Recall the meaning, then reveal it.', write: 'Complete a sentence or write the English.', listen: 'Hear the word, then write it in English.' }[state.reviewMode];
    $('#continueReadingButton').disabled = !study || !(study.transcript?.length || study.media);
    $('#continueReadingLabel').textContent = study ? `This study · ${formatClipTime(study.mobilePlayback?.time || 0)}` : 'Add a study first';
    els.activeStudyTitle.textContent = study?.name || 'No study yet';
    els.activeStudySummary.innerHTML = study ? `<div class="study-swatch" style="background:${escapeHtml(study.color || '#76a8ff')}"></div><div><strong>${escapeHtml(study.name)}</strong><small>${availableCards(study).length} words · ${(study.transcript || []).length} subtitles</small></div><span>Change →</span>` : '<div class="study-swatch"></div><div><strong>Connect LinguaLoop 3</strong><small>Load your first study from the computer.</small></div><span>Connect →</span>';
    els.activeStudySummary.dataset.viewTarget = study ? 'studies' : 'connect';
    els.activeStudySummary.tabIndex = 0; els.activeStudySummary.setAttribute('role', 'button');
    els.activeStudySummary.setAttribute('aria-label', study ? `Manage studies. ${study.name} is active.` : 'Connect your first LinguaLoop study');
    els.activeStudySummary.classList.add('interactive');
    renderStudies(); renderRetiredWords();
  }

  function renderStudies() {
    const studies = state.library.studies;
    els.studyCount.textContent = `${studies.length} ${studies.length === 1 ? 'study' : 'studies'}`;
    els.studyList.innerHTML = studies.length ? studies.map(study => {
      const active = study.id === state.library.activeStudyId;
      const confirming = study.id === state.pendingDeleteStudyId;
      const studyColor = /^#[0-9a-f]{6}$/i.test(study.color) ? study.color : '#76a8ff';
      return `<article class="${active ? 'active' : ''}${confirming ? ' confirming-delete' : ''}" data-study-id="${escapeHtml(study.id)}" style="--study-color:${studyColor}">
        <button class="study-select-button" type="button" data-study-open="${escapeHtml(study.id)}" aria-pressed="${active}" aria-label="${active ? 'Active study' : 'Use'} ${escapeHtml(study.name)}">
          <span class="study-swatch" style="background:var(--study-color)"></span>
          <span class="study-list-copy"><strong>${escapeHtml(study.name)}</strong><small>${availableCards(study).length} words · ${(study.transcript || []).length} subtitles · ${dueCards(study).length} due</small></span>
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
    snapshotSession(); loadPracticeSession(); snapshotSession();
    if (!await saveLibrary()) { state.library = previousLibrary; loadPracticeSession(); render(); return; }
    render();
    if (state.view === 'video') renderStudyVideo();
    showToast(`${study.name} removed from this phone`);
    if (!state.library.studies.length) showView('connect');
  }

  function resetPractice() {
    state.practiceRun += 1; state.queue = []; state.index = 0;
    state.practiceRetries = {}; state.practiceResults = {}; state.evidence = null;
    state.practiceReturn = 'today'; state.practiceInitialCount = 0;
    delete state.library.practiceSession;
  }
  function entryKey(entry) { return JSON.stringify([entry.studyId, entry.cardId]); }
  function currentEntry() { return state.queue[state.index]; }
  function studyForEntry(entry = currentEntry()) { return state.library.studies.find(study => study.id === entry?.studyId); }
  function cardForEntry(entry) { return studyForEntry(entry)?.cards.find(card => card.id === entry?.cardId && !card.retiredAt); }
  function currentCard() { return cardForEntry(currentEntry()); }
  function snapshotSession() {
    if (!state.queue.length) return;
    state.library.practiceSession = {
      version: 2, queue: state.queue, index: state.index, mode: state.sessionMode,
      total: state.practiceInitialCount, results: state.practiceResults, retries: state.practiceRetries,
      returnTo: state.practiceReturn, returnCue: state.wordSheetCueIndex,
      evidence: state.evidence, input: state.evidence ? els.writeAnswer.value : '', updatedAt: Date.now()
    };
  }
  function persistSession() { snapshotSession(); return saveLibrary(); }
  function loadPracticeSession() {
    const saved = state.library.practiceSession;
    if (saved?.version !== 2 || !Array.isArray(saved.queue) || saved.queue.length > 100) return;
    const index = Math.max(0, Math.min(saved.queue.length, Number(saved.index) || 0));
    const before = saved.queue.slice(0, index).filter(cardForEntry);
    const remaining = saved.queue.slice(index).filter(cardForEntry);
    state.queue = before.concat(remaining); state.index = before.length;
    state.sessionMode = ['adaptive','cards','write','listen'].includes(saved.mode) ? saved.mode : 'adaptive';
    state.practiceInitialCount = Math.max(1, Number(saved.total) || new Set(state.queue.map(entryKey)).size);
    state.practiceResults = saved.results && typeof saved.results === 'object' ? saved.results : {};
    state.practiceRetries = saved.retries && typeof saved.retries === 'object' ? saved.retries : {};
    state.practiceReturn = saved.returnTo === 'video' ? 'video' : 'today';
    if (state.practiceReturn === 'video') state.wordSheetCueIndex = Number(saved.returnCue) || 0;
    state.evidence = remaining[0] === saved.queue[index] ? saved.evidence : null;
    if (currentCard()) { const keepDraft = Boolean(state.evidence); renderPracticeCard(keepDraft); els.writeAnswer.value = keepDraft ? String(saved.input || '') : ''; }
  }
  function startPractice(mode = 'cards', { cardIds = null, returnTo = 'today', extra = false } = {}) {
    closeCardClip(); stopSpeech(); resetPractice();
    state.sessionMode = ['cards','write','listen'].includes(mode) ? mode : state.reviewMode;
    state.queue = cardIds ? availableCards().filter(card => cardIds.includes(card.id)).map(card => ({ studyId: activeStudy().id, cardId: card.id, extra: true })) : nextBatch(extra);
    if (!state.queue.length && !cardIds) state.queue = nextBatch(true);
    state.practiceInitialCount = state.queue.length; state.practiceReturn = returnTo;
    state.queue.forEach(entry => {
      const card = cardForEntry(entry), context = learning.contextFor(studyForEntry(entry), card, cardIds ? state.wordSheetCueIndex : -1, Number(card.contextRotation) || 0);
      entry.mode = state.sessionMode;
      if (entry.mode === 'listen' && !('speechSynthesis' in window)) entry.mode = 'write';
      entry.contextIndex = context?.index ?? -1;
    });
    renderPracticeCard(); persistSession();
  }
  function practiceContext() {
    const entry = currentEntry();
    return learning.contextFor(studyForEntry(entry), currentCard(), entry?.contextIndex ?? -1);
  }
  function renderPracticeCard(restore = false) {
    // Retired or removed cards never hold up a previously saved session.
    while (state.index < state.queue.length && !currentCard()) state.index += 1;
    const card = currentCard(), entry = currentEntry();
    els.practiceEmpty.hidden = Boolean(card); els.practiceStage.hidden = !card;
    const completed = Object.keys(state.practiceResults).length;
    els.practiceProgress.textContent = entry?.retry ? 'Another look' : `${Math.min(completed + (card ? 1 : 0), state.practiceInitialCount)} / ${state.practiceInitialCount}`;
    els.sessionTrackFill.style.width = state.practiceInitialCount ? `${Math.min(100, completed / state.practiceInitialCount * 100)}%` : '100%';
    if (!card) {
      closeCardClip(); stopSpeech();
      const results = Object.values(state.practiceResults).filter(result => !result.removed), recalled = results.filter(result => result.independent).length;
      els.practiceEmpty.querySelector('h2').textContent = results.length ? 'A good place to pause' : 'No words to review';
      els.practiceSummary.textContent = results.length ? `${recalled} recalled without help · ${results.length - recalled} to revisit. Your progress is saved.` : 'Read a little, or restore a learned word in Studies.';
      els.practiceDone.textContent = state.practiceReturn === 'video' ? 'Continue reading' : 'Back to practice';
      $('#practiceContinueButton').disabled = !scopedStudies().some(study => availableCards(study).length);
      $('#practiceContinueButton').textContent = nextBatch().length ? `Continue · ${nextBatch().length} words` : 'Optional extra practice';
      return;
    }
    stopSpeech(); closeCardClip(); state.practiceMode = entry.mode || 'cards';
    if (!restore || !state.evidence) state.evidence = { assisted: Boolean(entry.retry), firstCorrect: null, wrongAttempts: 0, hintStep: 0, revealed: false, flipped: false, checked: false, hint: '', feedback: '', feedbackClass: '' };
    const writing = state.practiceMode !== 'cards', listening = state.practiceMode === 'listen', context = practiceContext();
    els.practiceModeLabel.textContent = listening ? 'HEAR & WRITE' : writing ? 'RECALL IN ENGLISH' : 'FLIP & REMEMBER';
    $('#practiceTitle').textContent = entry.retry ? 'One more look' : listening ? 'Listen' : writing ? 'Write' : 'Cards';
    $('#practiceStudyName').textContent = studyForEntry(entry)?.name || '';
    els.practiceStage.classList.toggle('writing', writing);
    els.promptDirection.textContent = listening ? 'LISTEN' : writing ? (context ? 'FILL THE GAP' : 'SPANISH') : 'ENGLISH';
    $('#answerLanguage').textContent = writing ? 'ENGLISH' : 'SPANISH';
    $('#answerOriginal').textContent = writing ? card.spanish : card.english;
    els.promptText.textContent = listening ? 'Listen, then type the word' : writing ? (context?.masked || card.spanish) : card.english;
    els.promptText.classList.toggle('sentence-prompt', writing && Boolean(context));
    els.promptContext.textContent = listening ? 'Tap Listen as often as you need.' : writing ? (context ? 'Complete the gap. Use a hint whenever you need one.' : '') : (context?.text || card.context);
    els.answerText.textContent = writing ? card.english : card.spanish;
    els.answerContext.textContent = writing ? (context?.text || '') : (context?.index >= 0 ? studyForEntry(entry)?.transcript[context.index]?.es || '' : '');
    els.answerSpeak.querySelector('span').textContent = 'Listen';
    els.answerSpeak.setAttribute('aria-label', writing ? 'Pronounce the English answer' : 'Pronounce the Spanish answer');
    els.speak.querySelector('span').textContent = 'Listen';
    els.speak.setAttribute('aria-label', listening ? 'Listen to the word to recall' : 'Pronounce the English word');
    els.cardContext.disabled = !(learning.indexFor(studyForEntry(entry)).byCard.get(card.id)?.length);
    els.writeForm.hidden = !writing; if (!restore) els.writeAnswer.value = '';
    els.clipButton.hidden = true;
    $$('.prompt-scroll, .answer-scroll').forEach(area => { area.scrollTop = 0; });
    const rotor = $('#cardRotor'); rotor.classList.add('no-motion');
    restorePracticePresentation();
    void rotor.offsetWidth; requestAnimationFrame(() => rotor.classList.remove('no-motion'));
  }
  function restorePracticePresentation() {
    if (!currentCard() || !state.evidence) return;
    const evidence = state.evidence, writing = state.practiceMode !== 'cards';
    state.revealed = evidence.revealed;
    $('#answerContent').hidden = !evidence.revealed;
    els.answerSpeak.disabled = !evidence.revealed;
    els.reveal.hidden = !writing; els.reveal.disabled = state.ratingPending;
    const flipped = evidence.revealed && evidence.flipped !== false;
    $('#cardRotor').classList.toggle('flipped', flipped);
    $('#cardFront').inert = flipped; $('#cardFront').setAttribute('aria-hidden', String(flipped));
    els.answerArea.inert = !flipped; els.answerArea.setAttribute('aria-hidden', String(!flipped));
    els.reveal.textContent = !evidence.revealed ? 'Show answer' : flipped ? 'See question' : 'See answer';
    els.ratingRow.hidden = writing;
    els.ratingRow.querySelectorAll('button').forEach(button => { button.disabled = !evidence.revealed || state.ratingPending; });
    els.ratingRow.querySelector('[data-rating=again] small').textContent = state.queue.slice(state.index + 1).some(item => entryKey(item) !== entryKey(currentEntry())) && !currentEntry()?.retry ? 'One more look' : 'Soon';
    $('#practiceNextButton').hidden = !writing;
    $('#practiceNextButton').disabled = !evidence.revealed || state.ratingPending;
    $('#practiceRetryButton').hidden = true;
    $('#practiceRetryButton').disabled = evidence.revealed || !evidence.wrongAttempts;
    $('#practiceHintButton').disabled = evidence.revealed;
    $('#practiceHintText').textContent = evidence.hint || ''; $('#practiceHintText').title = evidence.hint || '';
    els.writeForm.hidden = !writing;
    els.writeAnswer.disabled = evidence.revealed;
    els.writeForm.querySelector('button').disabled = evidence.revealed;
    els.writeFeedback.textContent = evidence.feedback || (writing ? 'Write your answer, then check.' : evidence.revealed ? 'Did you remember it?' : 'Think of the meaning, then flip the card.'); els.writeFeedback.className = evidence.feedbackClass || '';
    if (evidence.spelling) {
      const { before, middle, after } = evidence.spelling;
      const detail = document.createElement('span'); detail.className = 'spelling-detail';
      detail.append(document.createTextNode(' Check: ' + before));
      const mark = document.createElement('mark'); mark.textContent = middle || '▯'; detail.append(mark, document.createTextNode(after));
      els.writeFeedback.append(detail);
    }
    // Keep a requested hint readable when the keyboard hides the card footer.
    if (evidence.hint && !evidence.revealed) {
      const feedback = document.createElement('span');
      feedback.className = evidence.feedback ? 'practice-feedback-copy' : 'practice-feedback-copy default-feedback';
      feedback.append(...els.writeFeedback.childNodes);
      const hint = document.createElement('span');
      hint.className = 'compact-practice-hint'; hint.textContent = evidence.hint;
      els.writeFeedback.append(feedback, hint);
    }
    if (evidence.revealed && !writing) {
      const schedule = learning.reviewSchedule(currentCard(), 'good', { assisted: evidence.assisted, correct: true, retry: Boolean(currentEntry()?.retry), mode: state.practiceMode });
      els.ratingRow.querySelector('[data-rating="good"] small').textContent = schedule.days < 1 ? 'Soon' : `${schedule.days} ${schedule.days === 1 ? 'day' : 'days'}`;
    }
  }
  function flipPracticeCard() {
    if (!currentCard() || !state.evidence || state.ratingPending) return;
    const moveFocus = Boolean(document.activeElement?.closest('#recallCard'));
    if (!state.evidence.revealed) revealAnswer(true);
    else { state.evidence.flipped = state.evidence.flipped === false; restorePracticePresentation(); persistSession(); }
    const faceButton = state.evidence.flipped === false ? $('#cardFrontFlip') : $('#cardBackFlip');
    if (moveFocus) faceButton.focus({ preventScroll: true });
  }

  function revealAnswer(manual = true) {
    if (!currentCard() || !state.evidence) return;
    const evidence = state.evidence;
    if (manual && state.practiceMode !== 'cards') {
      evidence.assisted = true; if (evidence.firstCorrect === null) evidence.firstCorrect = false;
      evidence.feedback = 'Say it once. We will come back to it.'; evidence.feedbackClass = 'assisted';
    }
    evidence.revealed = true; evidence.flipped = true; els.writeAnswer.blur(); restorePracticePresentation(); persistSession();
  }
  function showPracticeHint() {
    const card = currentCard(), evidence = state.evidence;
    if (!card || evidence.revealed) return;
    evidence.assisted = true; evidence.hintStep += 1;
    if (state.practiceMode === 'cards') evidence.hint = `Meaning starts with: ${[...card.spanish][0] || ''}…`;
    else evidence.hint = evidence.hintStep === 1 ? `Meaning: ${card.spanish}` : `Starts with: ${[...card.english].slice(0, Math.min(2, [...card.english].length - 1)).join('')}…`;
    restorePracticePresentation(); persistSession();
  }
  function checkWrittenAnswer(event) {
    event.preventDefault(); const card = currentCard(), evidence = state.evidence;
    if (!card || evidence.revealed) return;
    if (!els.writeAnswer.value.trim()) { evidence.feedback = 'Try a word, or ask for a hint.'; restorePracticePresentation(); return; }
    const result = learning.assessAnswer(els.writeAnswer.value, card.english, card.alternatives || []);
    if (evidence.firstCorrect === null) evidence.firstCorrect = result.correct;
    evidence.checked = true; delete evidence.spelling;
    if (result.correct) {
      evidence.feedback = evidence.assisted || evidence.wrongAttempts ? 'You got it with a little help. Say the full sentence.' : 'You remembered it. Now say the full sentence.';
      evidence.feedbackClass = 'correct'; revealAnswer(false);
    } else {
      evidence.wrongAttempts += 1;
      if (result.near) {
        const typed = [...els.writeAnswer.value.trim()], target = [...card.english];
        let left = 0, right = 0;
        while (left < typed.length && left < target.length && typed[left].toLowerCase() === target[left].toLowerCase()) left++;
        while (right < typed.length - left && right < target.length - left && typed[typed.length-1-right].toLowerCase() === target[target.length-1-right].toLowerCase()) right++;
        evidence.spelling = { before: typed.slice(0,left).join(''), middle: typed.slice(left,typed.length-right).join(''), after: right ? typed.slice(-right).join('') : '' };
      }
      evidence.feedback = result.near ? 'Nearly there. Check the spelling and try once more.' : 'Not quite yet. Try again, ask for a hint, or see the answer.';
      evidence.feedbackClass = 'incorrect'; restorePracticePresentation(); persistSession();
    }
  }
  async function rateCard(rating) {
    const card = currentCard(), entry = currentEntry(), evidence = state.evidence;
    if (!card || !evidence?.revealed || state.ratingPending || !['again','hard','good','easy'].includes(rating)) return;
    const run = state.practiceRun, key = entryKey(entry);
    state.ratingPending = true;
    const previousCard = { ...card }, previousSession = JSON.parse(JSON.stringify({ queue: state.queue, index: state.index, results: state.practiceResults, retries: state.practiceRetries }));
    $$('.rating-row button, #practiceNextButton').forEach(button => { button.disabled = true; });
    try {
      const correct = state.practiceMode === 'cards' ? rating !== 'again' : evidence.firstCorrect === true;
      const assisted = evidence.assisted || rating === 'hard' || evidence.wrongAttempts > 0;
      const independent = correct && !assisted && !entry.retry;
      const schedule = learning.reviewSchedule(card, correct ? (assisted ? 'hard' : rating) : 'again', { correct, assisted, retry: Boolean(entry.retry), mode: state.practiceMode });
      Object.assign(card, schedule); delete card.days; delete card.delay;
      card.dueAt = Date.now() + schedule.delay; card.reviews += 1;
      card.correct += independent ? 1 : 0; card.lastRating = rating;
      if (!entry.retry) {
        card.recallAttempts = (Number(card.recallAttempts) || 0) + 1;
        card.independentRecalls = (Number(card.independentRecalls) || 0) + (independent ? 1 : 0);
        card.assistedRecalls = (Number(card.assistedRecalls) || 0) + (assisted ? 1 : 0);
        card.contextRotation = (Number(card.contextRotation) || 0) + 1;
        state.practiceResults[key] = { independent };
      }
      if (!independent && !entry.retry) {
        // A separate final pass keeps the original goal fixed; never repeat a word immediately.
        const otherRemaining = state.queue.slice(state.index + 1).some(item => entryKey(item) !== key);
        if (otherRemaining) state.queue.push({ ...entry, retry: true });
      }
      state.index += 1; state.evidence = null; snapshotSession();
      if (!await saveLibrary()) {
        Object.keys(card).forEach(field => { if (!(field in previousCard)) delete card[field]; }); Object.assign(card, previousCard);
        state.queue = previousSession.queue; state.index = previousSession.index; state.practiceResults = previousSession.results; state.practiceRetries = previousSession.retries; state.evidence = evidence; snapshotSession();
        return;
      }
      if (run !== state.practiceRun) return;
      renderPracticeCard(); snapshotSession(); await saveLibrary(); render();
    } finally { state.ratingPending = false; restorePracticePresentation(); }
  }

  function openVocabularyWord(cardId, cueIndex) {
    const card = activeStudy()?.cards.find(item => item.id === cardId);
    if (!card) return;
    captureStudyVideoPosition(true); pauseStudyVideo(); stopSpeech();
    state.wordSheetCardId = cardId; state.wordSheetCueIndex = cueIndex;
    state.inlinePractice = null;
    els.wordSheet.dataset.situation = 'lookup';
    els.wordSheet.setAttribute('aria-labelledby', 'wordSheetTitle'); els.wordSheet.removeAttribute('aria-label');
    $('#wordPracticePanel').hidden = true; els.wordSheetPractice.hidden = false;
    els.wordSheetTitle.hidden = false; els.wordSheetMeaning.hidden = false; els.wordSheetContext.hidden = false;
    els.wordSheetSpeak.hidden = false;
    $('#wordRetireButton').disabled = Boolean(card.retiredAt);
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
    const study = studyForEntry(), context = practiceContext();
    const index = context?.index >= 0 ? context.index : learning.indexFor(study).byCard.get(card?.id)?.[0];
    if (!Number.isInteger(index)) return;
    if (state.evidence && !state.evidence.revealed) { state.evidence.assisted = true; persistSession(); }
    if (study && study.id !== state.library.activeStudyId) {
      captureStudyVideoPosition(false); destroyStudyVideo(); state.library.activeStudyId = study.id; state.transcriptStudyId = '';
    }
    state.transcriptWordsOnly = false; saveLibrary();
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
    const entryAtSpeechStart = currentEntry();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = .9;
    const languagePrefix = language.toLowerCase().split('-')[0];
    const matchingVoice = speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith(languagePrefix));
    if (matchingVoice) utterance.voice = matchingVoice;
    const finish = () => { button?.classList.remove('speaking'); button?.setAttribute('aria-pressed', 'false'); };
    utterance.onstart = () => { button?.classList.add('speaking'); button?.setAttribute('aria-pressed', 'true'); };
    utterance.onend = finish;
    utterance.onerror = event => {
      finish();
      if (['interrupted', 'canceled'].includes(event.error)) return;
      if (button === els.speak && state.view === 'practice' && state.practiceMode === 'listen' && currentEntry() === entryAtSpeechStart && !state.evidence?.revealed) {
        entryAtSpeechStart.mode = 'write'; renderPracticeCard(true); persistSession();
        showToast('Voice is unavailable. You can practice this word in writing.');
      } else showToast('Voice is unavailable. Your study is still here.');
    };
    speechSynthesis.speak(utterance);
  }

  function speakCurrent() {
    const card = currentCard();
    if (card) {
      if (state.practiceMode === 'write' && state.evidence && !state.evidence.revealed) { state.evidence.assisted = true; persistSession(); }
      speakText(card.english, 'en-US', els.speak);
    }
  }

  function speakCurrentAnswer() {
    const card = currentCard();
    if (card) speakText(state.practiceMode !== 'cards' ? card.english : card.spanish, state.practiceMode !== 'cards' ? 'en-US' : 'es-US', els.answerSpeak);
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
    if (state.transcriptStudyId !== activeStudy()?.id) { if (persist) saveLibrary(); return; }
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

  function updateTranscriptFollowButton() {
    const following = state.transcriptFollow && !state.transcriptFollowSuspended;
    els.transcriptFollow.classList.toggle('active', following);
    els.transcriptFollow.classList.toggle('suspended', state.transcriptFollow && state.transcriptFollowSuspended);
    els.transcriptFollow.setAttribute('aria-pressed', String(following));
    els.transcriptFollow.title = following ? 'Following playback · tap to stop following' : 'Return to playback and follow the subtitles';
    els.transcriptFollow.setAttribute('aria-label', following ? 'Follow playback' : 'Resume following playback');
  }

  function suspendTranscriptFollow() {
    if (state.view !== 'video') return;
    state.transcriptFollowSuspended = true;
    cancelTranscriptPositioning();
    updateTranscriptFollowButton();
  }

  function transcriptViewportBounds() {
    const rect = els.transcriptPanel.getBoundingClientRect();
    return { top: rect.top + 8, bottom: rect.bottom - 8 };
  }

  function scrollTranscriptTo(index) {
    if (!state.transcriptFollow || state.transcriptFollowSuspended || index < 0) return;
    const row = transcriptRow(index);
    if (!row || row.hidden) return;
    const bounds = transcriptViewportBounds(), rect = row.getBoundingClientRect();
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) positionTranscriptViewport(index);
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
    const target = transcriptRow(index);
    if (!target || target.hidden) return;
    target.classList.add('positioning');
    const studyId = activeStudy()?.id;
    let frames = 0;
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    events.forEach(type => window.addEventListener(type, cancelTranscriptPositioning, { passive: true, once: true }));
    transcriptPositionCleanup = () => {
      events.forEach(type => window.removeEventListener(type, cancelTranscriptPositioning));
      target.classList.remove('positioning');
    };
    const align = () => {
      const row = transcriptRow(index);
      if (state.view !== 'video' || activeStudy()?.id !== studyId || !row || row.hidden) { cancelTranscriptPositioning(); return; }
      const rect = row.getBoundingClientRect();
      const { top, bottom } = transcriptViewportBounds();
      const height = Math.max(60, bottom - top - 16);
      const delta = rect.height > height ? rect.top - top - 8 : rect.top + rect.height / 2 - (top + bottom) / 2;
      // Lazy rows settle after an initial jump; measure the actual visible row.
      if (Math.abs(delta) > 1) els.transcriptPanel.scrollTo({ top: Math.max(0, els.transcriptPanel.scrollTop + delta), behavior: 'instant' });
      if (++frames < 30) transcriptPositionFrame = requestAnimationFrame(align);
      else { cancelTranscriptPositioning(); scheduleTranscriptViewportUpdate(); }
    };
    transcriptPositionFrame = requestAnimationFrame(align);
    setTranscriptBrowseIndex(index);
  }

  function restoreTranscriptViewport() {
    if (state.view !== 'video') return;
    const index = state.transcriptMarkerIndex;
    if (index <= 0) { els.transcriptPanel.scrollTop = 0; return; }
    positionTranscriptViewport(index);
  }

  function setTranscriptBrowseIndex(index) {
    const cues = activeTranscript();
    if (!cues.length) return;
    state.transcriptBrowseIndex = Math.max(0, Math.min(cues.length - 1, index));
    const number = state.transcriptBrowseIndex + 1;
    els.transcriptBrowsePosition.textContent = `/ ${cues.length}`;
    if (document.activeElement !== els.transcriptJumpInput) els.transcriptJumpInput.value = number;
    if (document.activeElement !== els.transcriptNavigator) els.transcriptNavigator.value = number;
    els.transcriptNavigator.setAttribute('aria-valuetext', `Subtitle ${number} of ${cues.length}, ${formatClipTime(cues[number - 1].start)}`);
  }

  let transcriptVisibleRows = [];
  let transcriptViewportFrame = 0;
  function scheduleTranscriptViewportUpdate() {
    if (state.view !== 'video' || transcriptViewportFrame) return;
    transcriptViewportFrame = requestAnimationFrame(() => {
      transcriptViewportFrame = 0;
      if (state.view !== 'video' || !transcriptVisibleRows.length) return;
      if (transcriptPositionFrame) return;
      const bounds = transcriptViewportBounds();
      const center = (bounds.top + bounds.bottom) / 2;
      let low = 0, high = transcriptVisibleRows.length - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (transcriptVisibleRows[middle].getBoundingClientRect().bottom < center) low = middle + 1;
        else high = middle;
      }
      setTranscriptBrowseIndex(Number(transcriptVisibleRows[low].dataset.transcriptIndex));
    });
  }

  function closeTranscriptJump() {
    // The subtitle jump field stays visible. Only release the keyboard.
    els.transcriptJumpInput.blur();
  }

  function browseTranscript(index) {
    if (!Number.isInteger(index) || !activeTranscript()[index]) return;
    suspendTranscriptFollow();
    if (transcriptRow(index)?.hidden) {
      state.transcriptWordsOnly = false;
      renderStudyTranscript();
    }
    positionTranscriptViewport(index);
  }

  function updateTranscriptPosition() {
    const cues = activeTranscript();
    const index = state.transcriptMarkerIndex;
    const interaction = state.transcriptReadingIndex >= 0
      ? (state.transcriptSpeechPaused ? 'Paused' : 'Reading')
      : state.studyVideoPlaying ? 'Playing' : index === state.transcriptSelectedIndex ? 'Tap again to play' : '';
    els.transcriptPosition.textContent = index >= 0
      ? `Subtitle ${index + 1} of ${cues.length} · ${formatClipTime(cues[index]?.start)}${interaction ? ` · ${interaction}` : ''}`
      : `${cues.length} subtitles · choose a line`;
    els.transcriptLastSelection.disabled = state.transcriptSelectedIndex < 0;
    els.transcriptLastSelection.title = state.transcriptSelectedIndex < 0 ? 'Select a subtitle first' : `Return to subtitle ${state.transcriptSelectedIndex + 1} without moving the video`;
  }

  function setTranscriptMarker(kind, index, { scroll = true } = {}) {
    const property = kind === 'active' ? 'transcriptActiveIndex' : kind === 'reading' ? 'transcriptReadingIndex' : 'transcriptSelectedIndex';
    const previous = state[property];
    if (kind === 'selected') transcriptRow(previous)?.querySelector('button[data-transcript-select]')?.setAttribute('aria-pressed', 'false');
    state[property] = index;
    if (index >= 0 && index !== state.transcriptMarkerIndex) {
      transcriptRow(state.transcriptMarkerIndex)?.classList.remove('active');
      transcriptRow(state.transcriptMarkerIndex)?.removeAttribute('aria-current');
      state.transcriptMarkerIndex = index;
      transcriptRow(index)?.classList.add('active');
      transcriptRow(index)?.setAttribute('aria-current', 'true');
    }
    if (kind === 'selected' && index >= 0) {
      transcriptRow(index)?.querySelector('button[data-transcript-select]')?.setAttribute('aria-pressed', 'true');
      rememberStudyPlayback({ time: activeTranscript()[index]?.start, selectedIndex: index });
    }
    updateTranscriptPosition();
    if (scroll && previous !== index && ((kind === 'active' && state.studyVideoPlaying) || kind === 'reading') && index >= 0) scrollTranscriptTo(index);
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
    state.transcriptFollowSuspended = false;
    updateTranscriptFollowButton();
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
    const entryAtSpeechStart = currentEntry();
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
      updateTranscriptPosition();
      return;
    }
    const cues = activeTranscript();
    if (!cues.length) return;
    pauseStudyVideo();
    stopSpeech();
    state.transcriptSpeechActive = true;
    state.transcriptSpeechPaused = false;
    state.transcriptFollowSuspended = false;
    updateTranscriptFollowButton();
    const start = Math.max(0, state.transcriptMarkerIndex);
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
    els.transcriptNavigation.hidden = !cues.length;
    els.transcriptDock.hidden = !cues.length && !media;
    els.transcriptDock.querySelector('.study-video-info').hidden = !media;
    els.transcriptControls.querySelector('.transcript-reader').hidden = !cues.length;
    els.transcriptControls.querySelector('.transcript-focus').hidden = !cues.length;
    els.transcriptEmpty.hidden = Boolean(cues.length);
    els.transcriptSummary.textContent = cues.length ? `${cues.length} SUBTITLES` : 'FULL STUDY';
    if (!cues.length) { transcriptVisibleRows = []; els.transcriptList.replaceChildren(); return; }
    if (state.transcriptStudyId !== study.id) {
      state.transcriptStudyId = study.id;
      const playback = playbackForStudy(study);
      state.transcriptSelectedIndex = playback.selectedIndex;
      state.transcriptActiveIndex = transcriptCueIndexAt(playback.time, cues);
      state.transcriptReadingIndex = -1;
      state.transcriptMarkerIndex = state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptSelectedIndex;
      state.transcriptFollowSuspended = false;
    }
    const vocabulary = learning.indexFor(study);
    els.transcriptWords.disabled = vocabulary.matched.size === 0;
    if (!vocabulary.matched.size) state.transcriptWordsOnly = false;
    els.transcriptWords.textContent = `My words · ${vocabulary.matched.size}`;
    els.transcriptWords.setAttribute('aria-pressed', String(state.transcriptWordsOnly));
    els.transcriptVocabularyHint.textContent = vocabulary.matched.size ? 'Tap a marked word' : 'Your saved words appear here';
    els.transcriptList.innerHTML = cues.map((cue, index) => `<article class="transcript-cue${index === state.transcriptMarkerIndex ? ' active' : ''}" data-transcript-index="${index}" ${index === state.transcriptMarkerIndex ? 'aria-current="true"' : ''} ${state.transcriptWordsOnly && !vocabulary.cues[index]?.length ? 'hidden' : ''} data-language="${escapeHtml(state.transcriptLanguage)}">
      <div class="transcript-cue-main" data-transcript-tap="${index}"><button class="transcript-time" type="button" data-transcript-select="${index}" aria-pressed="${index === state.transcriptSelectedIndex}" aria-label="Select subtitle ${index + 1} at ${escapeHtml(formatClipTime(cue.start))}. Tap again to play.">${escapeHtml(formatClipTime(cue.start))}</button><span class="transcript-cue-copy"><strong lang="en">${highlightedSubtitle(cue.en, vocabulary.cues[index], index)}</strong><small lang="es">${escapeHtml(cue.es)}</small></span></div>
      <span class="transcript-cue-tools"><button type="button" data-transcript-speak="${index}" aria-label="Speak subtitle ${index + 1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg></button><button type="button" data-transcript-clip="${index}" aria-label="Play linked video for subtitle ${index + 1}" ${media ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg></button></span>
    </article>`).join('');
    els.transcriptLanguages.forEach(button => button.classList.toggle('active', button.dataset.transcriptLanguage === state.transcriptLanguage));
    els.transcriptSpeed.value = String(state.transcriptSpeed);
    $('#transcriptSpeedButton').textContent = `${Number(state.transcriptSpeed).toFixed(2)}×`;
    transcriptVisibleRows = [...els.transcriptList.children].filter(row => !row.hidden);
    els.transcriptNavigator.max = els.transcriptJumpInput.max = String(cues.length);
    els.transcriptNavigator.disabled = cues.length < 2;
    setTranscriptBrowseIndex(Math.max(0, state.transcriptMarkerIndex));
    updateTranscriptFollowButton();
    scheduleTranscriptViewportUpdate();
    updateTranscriptPosition();
    updateTranscriptSpeechControls();
  }

  function renderStudyVideo() {
    if (!els.studyVideoReady) return;
    const study = activeStudy();
    const media = normalizeYouTubeMedia(study?.media);
    els.studyVideoReady.hidden = !media || !state.videoExpanded;
    $('#videoSurface').hidden = !media;
    $('#videoPlaceholder').hidden = Boolean(media && state.videoExpanded);
    els.toggleVideo.disabled = !media;
    els.toggleVideo.setAttribute('aria-pressed', String(Boolean(media && state.videoExpanded)));
    els.toggleVideo.setAttribute('aria-label', state.videoExpanded ? 'Switch to reading without video' : 'Show the study video');
    els.studyVideoEmpty.hidden = true;
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

  function renderRetiredWords() {
    const words = state.library.studies.flatMap(study => study.cards.filter(card => card.retiredAt).map(card => ({ study, card })));
    $('#retiredWordsToggle').textContent = `Learned · ${words.length}`;
    $('#retiredWordsList').innerHTML = words.length ? words.map(({ study, card }) => `<article class="retired-word"><div><strong>${escapeHtml(card.english)}</strong><small>${escapeHtml(study.name)}</small></div><button type="button" class="text-button" data-restore-study="${escapeHtml(study.id)}" data-restore-word="${escapeHtml(card.id)}">Restore</button></article>`).join('') : '<p class="muted">Words you remove as learned will stay here, ready to restore.</p>';
  }
  function requestRetireWord(study, card) {
    if (!study || !card || state.ratingPending) return;
    state.retireTarget = { studyId: study.id, cardId: card.id };
    $('#retireWordName').textContent = card.english;
    $('#retireWordDialog').showModal();
  }
  async function confirmRetireWord() {
    const target = state.retireTarget, study = studyForEntry(target), card = study?.cards.find(item => item.id === target?.cardId);
    if (!card || state.retiring) return;
    state.retiring = true; $('#confirmRetireWordButton').disabled = true;
    const previous = Number(card.retiredAt) || 0;
    try {
      const wasCurrent = currentEntry() && entryKey(currentEntry()) === entryKey(target);
      card.retiredAt = Date.now();
      if (!await saveLibrary()) { card.retiredAt = previous; return; }
      state.retireUndo = { ...target, english: card.english };
      study.cards = [...study.cards];
      $('#retireWordDialog').close();
      if (els.wordSheet.open) els.wordSheet.close();
      $('#wordUndoText').textContent = `${card.english} removed from practice`;
      $('#wordUndo').hidden = false;
      clearTimeout(state.undoTimer); state.undoTimer = setTimeout(() => { $('#wordUndo').hidden = true; }, 12000);
      if (state.queue.some(entry => entryKey(entry) === entryKey(target))) state.practiceResults[entryKey(target)] = { removed: true };
      if (wasCurrent && !currentCard()) { state.evidence = null; renderPracticeCard(); }
      await persistSession();
      render(); if (state.view === 'video') { renderStudyTranscript(); restoreTranscriptViewport(); }
    } finally { state.retiring = false; $('#confirmRetireWordButton').disabled = false; }
  }
  async function restoreRetiredWord(studyId, cardId) {
    const study = state.library.studies.find(item => item.id === studyId), card = study?.cards.find(item => item.id === cardId);
    if (!card || !card.retiredAt) return;
    const previous = { retiredAt: card.retiredAt, dueAt: card.dueAt };
    card.retiredAt = 0; card.dueAt = 0;
    if (!await saveLibrary()) { Object.assign(card, previous); return; }
    study.cards = [...study.cards]; render();
    if (state.view === 'video') renderStudyTranscript();
    if (state.retireUndo?.studyId === studyId && state.retireUndo.cardId === cardId) { state.retireUndo = null; $('#wordUndo').hidden = true; }
    showToast(`${card.english} restored to practice`);
  }
  function startInlinePractice() {
    const study = activeStudy(), card = study?.cards.find(item => item.id === state.wordSheetCardId && !item.retiredAt);
    if (!card) return;
    stopSpeech();
    const context = learning.contextFor(study, card, state.wordSheetCueIndex);
    // The word was already visible in the lookup: this is guided practice, not an independent test.
    state.inlinePractice = { studyId: study.id, cardId: card.id, answered: false, revealed: false };
    els.wordSheet.dataset.situation = 'practice';
    els.wordSheet.setAttribute('aria-label', 'Practice the word in context');
    els.wordSheet.removeAttribute('aria-labelledby');
    els.wordSheetTitle.hidden = true; els.wordSheetMeaning.hidden = true; els.wordSheetContext.hidden = true; els.wordSheetSpeak.hidden = true;
    els.wordSheetPractice.hidden = true; $('#wordPracticePanel').hidden = false;
    $('#wordPracticePrompt').textContent = context?.masked || card.spanish;
    $('#wordPracticeAnswer').value = ''; $('#wordPracticeAnswer').disabled = false;
    $('#wordPracticeForm').querySelector('[type="submit"]').disabled = false;
    $('#wordPracticeFeedback').textContent = 'A quick practice, then back to your reading.';
    $('#wordPracticeDone').textContent = 'Continue reading';
    $('#wordPracticeHint').disabled = false; $('#wordPracticeReveal').disabled = false;
    $('#wordPracticeAnswer').focus({ preventScroll: true });
  }
  async function finishInlinePractice(revealed = false) {
    const session = state.inlinePractice, study = studyForEntry(session), card = study?.cards.find(item => item.id === session?.cardId && !item.retiredAt);
    if (!card || session.answered || session.pending) return;
    const input = $('#wordPracticeAnswer').value;
    if (!revealed && !input.trim()) { $('#wordPracticeFeedback').textContent = 'Try the word, or ask for a hint.'; return; }
    const result = learning.assessAnswer(input, card.english, card.alternatives || []);
    if (!revealed && !result.correct) { $('#wordPracticeFeedback').textContent = result.near ? 'Almost. Check the spelling, then try again.' : 'Try again, use a hint, or reveal the word.'; return; }
    session.pending = true; const previous = { ...card };
    const schedule = learning.reviewSchedule(card, 'hard', { correct: !revealed, assisted: true, retry: true, mode: 'write' });
    Object.assign(card, schedule); delete card.days; delete card.delay;
    card.dueAt = Date.now() + schedule.delay;
    if (!await saveLibrary()) { Object.keys(card).forEach(key => { if (!(key in previous)) delete card[key]; }); Object.assign(card, previous); session.pending = false; return; }
    session.answered = true; session.pending = false;
    if (state.inlinePractice !== session || !els.wordSheet.open) return;
    $('#wordPracticeFeedback').textContent = `${card.english} · ${card.spanish}. ${revealed ? 'Say it once; you will revisit it soon.' : 'You got it. You will revisit it in a later session.'}`;
    $('#wordPracticeAnswer').disabled = true; $('#wordPracticeForm').querySelector('[type="submit"]').disabled = true;
    $('#wordPracticeHint').disabled = true; $('#wordPracticeReveal').disabled = true; $('#wordPracticeAnswer').blur(); render();
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
      if (!previous) return card;
      const progress = learning.normalizeProgress(previous);
      return { ...card, ...progress, lastRating: String(previous.lastRating || ''),
        retiredAt: Number(previous.retiredAt) || 0,
        recallAttempts: Number(previous.recallAttempts) || 0,
        independentRecalls: Number(previous.independentRecalls) || 0,
        assistedRecalls: Number(previous.assistedRecalls) || 0,
        contextRotation: Number(previous.contextRotation) || 0 };
    });
    // Keep removal records even when a later desktop transfer omits those words.
    const incomingIds = new Set(incoming.cards.map(card => card.id));
    for (const card of previousCards.values()) if (card.retiredAt && !incomingIds.has(card.id)) incoming.cards.push({ ...card });
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
    snapshotSession(); destroyStudyVideo(); stopSpeech();
    for (const rawIncoming of studies) {
      const incoming = mergeIncomingStudy(rawIncoming);
      const index = state.library.studies.findIndex(study => study.id === incoming.id);
      if (index >= 0) state.library.studies[index] = incoming; else state.library.studies.push(incoming);
    }
    state.transcriptStudyId = ''; state.transcriptWordsOnly = false;
    state.library.activeStudyId = studies[0].id;
    normalizeLibrary(); loadPracticeSession(); snapshotSession();
    if (!await saveLibrary()) {
      state.library = previous; loadPracticeSession(); render();
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
      els.manualTransferPanel.hidden = false;
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
      els.manualTransferPanel.hidden = false;
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
    const restoreWord = event.target.closest('[data-restore-word]'); if (restoreWord) { restoreRetiredWord(restoreWord.dataset.restoreStudy, restoreWord.dataset.restoreWord); return; }
    const deleteButton = event.target.closest('[data-study-delete]'); if (deleteButton) { requestStudyDelete(deleteButton.dataset.studyDelete); return; }
    const viewButton = event.target.closest('[data-view-target]'); if (viewButton) showView(viewButton.dataset.viewTarget);
    const practiceButton = event.target.closest('[data-practice-mode]'); if (practiceButton) { state.reviewMode = practiceButton.dataset.practiceMode; savePreference('lingualoop.mobile.reviewMode', state.reviewMode); render(); }
    const scopeButton = event.target.closest('[data-review-scope]'); if (scopeButton) { state.reviewScope = scopeButton.dataset.reviewScope; savePreference('lingualoop.mobile.reviewScope', state.reviewScope); render(); }
    const sizeButton = event.target.closest('[data-review-size]'); if (sizeButton) { state.reviewSize = Number(sizeButton.dataset.reviewSize); savePreference('lingualoop.mobile.reviewSize', state.reviewSize); render(); }
    const studyButton = event.target.closest('[data-study-open]'); if (studyButton) { clearPendingStudyDelete(); stopTranscriptSpeech(); captureStudyVideoPosition(true); destroyStudyVideo(); snapshotSession(); state.transcriptWordsOnly = false; state.library.activeStudyId = studyButton.dataset.studyOpen; state.transcriptStudyId = ''; saveLibrary(); render(); if (state.view === 'video') { renderStudyVideo(); requestAnimationFrame(restoreTranscriptViewport); } showToast(`${activeStudy()?.name || 'Study'} is now active`); }
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
  els.wordSheetPractice.addEventListener('click', startInlinePractice);
  els.transcriptWords.addEventListener('click', () => {
    stopTranscriptSpeech(); state.transcriptWordsOnly = !state.transcriptWordsOnly;
    renderStudyTranscript();
  });
  els.activeStudySummary.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showView(els.activeStudySummary.dataset.viewTarget); } });
  els.startReview.addEventListener('click', () => { startPractice(state.reviewMode); showView('practice'); });
  $('#resumePracticeButton').addEventListener('click', () => { if (currentCard()) showView('practice'); });
  $('#continueReadingButton').addEventListener('click', () => showView('video'));
  $('#practiceContinueButton').addEventListener('click', () => { startPractice(state.sessionMode); showView('practice'); });
  $('#practiceHintButton').addEventListener('click', showPracticeHint);
  $('#practiceNextButton').addEventListener('click', () => rateCard('good'));
  $('#practiceRetryButton').addEventListener('click', () => { els.writeAnswer.focus({ preventScroll: true }); els.writeAnswer.select(); });
  $('#practiceRetireButton').addEventListener('click', () => requestRetireWord(studyForEntry(), currentCard()));
  $('#wordRetireButton').addEventListener('click', () => requestRetireWord(activeStudy(), activeStudy()?.cards.find(card => card.id === state.wordSheetCardId)));
  $('#confirmRetireWordButton').addEventListener('click', confirmRetireWord);
  $('#cancelRetireWordButton').addEventListener('click', () => $('#retireWordDialog').close());
  $('#wordUndoButton').addEventListener('click', () => { if (state.retireUndo) restoreRetiredWord(state.retireUndo.studyId, state.retireUndo.cardId); });
  function selectLibraryCollection(learned) {
    els.studyList.hidden = learned; $('#retiredWordsPanel').hidden = !learned;
    $('#retiredWordsToggle').setAttribute('aria-pressed', String(learned));
    $('#libraryStudiesButton').setAttribute('aria-pressed', String(!learned));
    $('.library-content').scrollTop = 0;
  }
  $('#retiredWordsToggle').addEventListener('click', () => selectLibraryCollection(true));
  $('#libraryStudiesButton').addEventListener('click', () => selectLibraryCollection(false));
  $('#wordPracticeForm').addEventListener('submit', event => { event.preventDefault(); finishInlinePractice(false); });
  $('#wordPracticeReveal').addEventListener('click', () => finishInlinePractice(true));
  $('#wordPracticeHint').addEventListener('click', () => { const card = cardForEntry(state.inlinePractice); if (card) $('#wordPracticeFeedback').textContent = `Meaning: ${card.spanish} · starts with ${[...card.english][0]}…`; });
  $('#wordPracticeDone').addEventListener('click', () => { els.wordSheet.close(); $('#wordPracticeAnswer').blur(); });
  let draftTimer;
  els.writeAnswer.addEventListener('input', () => { snapshotSession(); clearTimeout(draftTimer); draftTimer = setTimeout(persistSession, 300); });
  els.reveal.addEventListener('click', flipPracticeCard);
  // Native buttons support keyboard use; dragging/scrolling text must not flip.
  for (const button of [$('#cardFrontFlip'), $('#cardBackFlip')]) {
    let gesture = null;
    button.addEventListener('pointerdown', event => { gesture = { x: event.clientX, y: event.clientY, moved: false }; });
    button.addEventListener('pointermove', event => { if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.moved = true; });
    button.addEventListener('pointercancel', () => { if (gesture) gesture.moved = true; });
    button.addEventListener('click', event => { const moved = gesture?.moved; gesture = null; if ((event.detail && moved) || window.getSelection()?.toString()) return; flipPracticeCard(); });
  }
  els.speak.addEventListener('click', speakCurrent);
  els.answerSpeak.addEventListener('click', speakCurrentAnswer);
  els.clipButton.addEventListener('click', toggleCardClip);
  els.closeClip.addEventListener('click', closeCardClip);
  els.restartStudyVideo.addEventListener('click', () => loadStudyVideo(true));
  els.transcriptRead.addEventListener('click', toggleTranscriptReading);
  els.transcriptStop.addEventListener('click', stopTranscriptSpeech);
  els.transcriptFollow.addEventListener('click', () => {
    state.transcriptFollow = state.transcriptFollowSuspended || !state.transcriptFollow;
    state.transcriptFollowSuspended = false;
    savePreference('lingualoop.mobile.transcriptFollow', String(state.transcriptFollow));
    updateTranscriptFollowButton();
    if (state.transcriptFollow) {
      const index = state.transcriptReadingIndex >= 0 ? state.transcriptReadingIndex : state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptMarkerIndex;
      if (transcriptRow(index)?.hidden) { state.transcriptWordsOnly = false; renderStudyTranscript(); }
      positionTranscriptViewport(index);
    } else cancelTranscriptPositioning();
  });
  els.transcriptLastSelection.addEventListener('click', () => browseTranscript(state.transcriptSelectedIndex));
  els.transcriptNavigator.addEventListener('input', () => browseTranscript(Number(els.transcriptNavigator.value) - 1));
  els.transcriptNavigator.addEventListener('blur', scheduleTranscriptViewportUpdate);
  els.transcriptJumpInput.addEventListener('focus', suspendTranscriptFollow);
  els.transcriptJumpForm.addEventListener('submit', event => {
    event.preventDefault();
    const index = Number(els.transcriptJumpInput.value) - 1;
    if (!Number.isInteger(index) || !activeTranscript()[index]) return;
    closeTranscriptJump();
    els.transcriptJumpInput.blur();
    browseTranscript(index);
  });
  els.transcriptJumpForm.addEventListener('keydown', event => { if (event.key === 'Escape') closeTranscriptJump(); });
  els.transcriptPanel.addEventListener('scroll', scheduleTranscriptViewportUpdate, { passive: true });
  addEventListener('scroll', scheduleTranscriptViewportUpdate, { passive: true });
  addEventListener('resize', scheduleTranscriptViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleTranscriptViewportUpdate, { passive: true });
  addEventListener('wheel', event => {
    if (!els.transcriptDock.contains(event.target) && !els.wordSheet.open && event.deltaY) suspendTranscriptFollow();
  }, { passive: true });
  let transcriptTouchY = null;
  addEventListener('touchstart', event => {
    transcriptTouchY = state.view === 'video' && !els.transcriptDock.contains(event.target) && !els.wordSheet.open ? event.touches[0]?.clientY : null;
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (transcriptTouchY !== null && Math.abs((event.touches[0]?.clientY ?? transcriptTouchY) - transcriptTouchY) > 8) suspendTranscriptFollow();
  }, { passive: true });
  addEventListener('touchend', () => { transcriptTouchY = null; }, { passive: true });
  addEventListener('keydown', event => {
    if (!event.target.closest('input, select, textarea, button, dialog') && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) suspendTranscriptFollow();
  });
  $('#transcriptSpeedButton').addEventListener('click', () => {
    const speeds = [.75, .9, 1, 1.1];
    els.transcriptSpeed.value = String(speeds[(speeds.indexOf(state.transcriptSpeed) + 1) % speeds.length]);
    els.transcriptSpeed.dispatchEvent(new Event('change'));
    $('#transcriptSpeedButton').textContent = `${state.transcriptSpeed.toFixed(2)}×`;
  });
  els.transcriptSpeed.addEventListener('change', () => {
    state.transcriptSpeed = Math.max(.6, Math.min(1.25, Number(els.transcriptSpeed.value) || .9));
    savePreference('lingualoop.mobile.transcriptSpeed', String(state.transcriptSpeed));
    if (state.transcriptSpeechActive) { stopTranscriptSpeech(); showToast('Voice speed updated · tap Read all to continue'); }
  });
  els.writeForm.addEventListener('submit', checkWrittenAnswer);
  els.pasteTransfer.addEventListener('click', pasteTransferFromClipboard);
  els.importManualTransfer.addEventListener('click', importManualTransfer);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { snapshotSession(); captureStudyVideoPosition(true); saveLibrary(); } });
  addEventListener('pagehide', () => { snapshotSession(); captureStudyVideoPosition(true); saveLibrary(); });
  function updateAppViewport() {
    const viewport = window.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > .05) return;
    const height = Math.round(viewport?.height || innerHeight);
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    document.body.classList.toggle('keyboard-open', Boolean(viewport && innerHeight - height > 120));
    document.body.classList.toggle('compact-viewport', height < 460 && innerWidth < 600);
  }
  window.visualViewport?.addEventListener('resize', updateAppViewport);
  addEventListener('resize', updateAppViewport);
  updateAppViewport();
  (async () => {
    await loadLibrary(); await importPackFromHash(); loadPracticeSession(); render(); showView('today');
    if ('serviceWorker' in navigator) {
      const registerOfflineShell = () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {});
      // IndexedDB/import may finish after load; do not miss offline installation.
      if (document.readyState === 'complete') registerOfflineShell();
      else addEventListener('load', registerOfflineShell, { once: true });
    }
  })();
})();
