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
    pendingDeleteStudyId: '', pendingDeleteTimer: null, fullVideoStudyId: '',
    studyVideoPlayer: null, studyVideoReady: false, studyVideoPlaying: false, studyVideoPoll: null, studyVideoClipEnd: 0,
    transcriptVideoActionId: 0,
    transcriptSelectedIndex: -1, transcriptActiveIndex: -1, transcriptReadingIndex: -1,
    transcriptStudyId: '',
    transcriptLanguage: localStorage.getItem('lingualoop.mobile.transcriptLanguage') || 'both',
    transcriptSpeed: Number(localStorage.getItem('lingualoop.mobile.transcriptSpeed')) || .9,
    transcriptFollow: localStorage.getItem('lingualoop.mobile.transcriptFollow') !== 'false',
    transcriptSpeechActive: false, transcriptSpeechPaused: false, transcriptSpeechRunId: 0,
    transcriptSpeechIndex: -1, transcriptSpeechPart: 0
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
    return source.slice(0, 12000).map((cue, index) => {
      const start = Number(cue?.start);
      const end = Number(cue?.end);
      const english = String(cue?.en || '').trim();
      const spanish = String(cue?.es || '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (!english && !spanish)) return null;
      return {
        id: String(cue?.id || `subtitle-${index + 1}`).slice(0, 120),
        start: Math.max(0, start), end: Math.max(start + .05, end),
        en: english.slice(0, 1800), es: spanish.slice(0, 1800),
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
      study.media = normalizeYouTubeMedia(study.media);
      study.transcript = normalizeTranscript(study.transcript);
      const previousPlayback = JSON.stringify(study.mobilePlayback || null);
      study.mobilePlayback = normalizeMobilePlayback(study.mobilePlayback, study.transcript);
      if (JSON.stringify(study.mobilePlayback) !== previousPlayback) changed = true;
      study.cards = Array.isArray(study.cards) ? study.cards : [];
      study.cards.forEach((card, index) => Object.assign(card, {
        id: card.id || `${study.id}-${index}`, english: String(card.english || ''), spanish: String(card.spanish || ''), context: String(card.context || ''),
        clip: normalizeClip(card.clip),
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
    if (state.view === 'practice' && view !== 'practice') closeCardClip();
    if (state.view === 'video' && view !== 'video') { captureStudyVideoPosition(true); pauseStudyVideo(); stopTranscriptSpeech(); }
    stopSpeech();
    state.view = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.bottom-nav [data-view-target]').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === view));
    if (view === 'video') {
      renderStudyVideo();
      requestAnimationFrame(restoreTranscriptViewport);
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
    state.library.studies = state.library.studies.filter(item => item.id !== studyId);
    if (state.library.activeStudyId === studyId) state.library.activeStudyId = state.library.studies[0]?.id || '';
    state.queue = [];
    state.index = 0;
    await saveLibrary();
    render();
    if (state.view === 'video') renderStudyVideo();
    showToast(`${study.name} removed from this phone`);
    if (!state.library.studies.length) showView('connect');
  }

  function startPractice(mode = 'cards') {
    closeCardClip();
    stopSpeech();
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
    if (!card) { closeCardClip(); return; }
    closeCardClip();
    stopSpeech();
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
    const clip = currentCardClip();
    els.clipButton.hidden = !clip;
    els.clipButton.setAttribute('aria-pressed', 'false');
    if (clip) els.clipTitle.textContent = `${activeStudy()?.name || 'Current study'} · ${formatClipTime(clip.start)}–${formatClipTime(clip.end)}`;
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
    if (card) speakText(card.spanish, 'es-US', els.answerSpeak);
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
    stopStudyVideoPolling();
    try { state.studyVideoPlayer?.destroy?.(); } catch { /* YouTube may already have removed the iframe. */ }
    state.studyVideoPlayer = null;
    state.studyVideoReady = false;
    state.studyVideoPlaying = false;
    state.studyVideoLoadPromise = null;
    state.studyVideoClipEnd = 0;
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
          player.seekTo(0, true);
          player.playVideo();
        }
        return player;
      });
    }
    destroyStudyVideo();
    state.fullVideoStudyId = study.id;
    const expectedStudyId = study.id;
    const resumeAt = restart ? 0 : playbackForStudy(study).time;
    if (restart) rememberStudyPlayback({ time: 0, selectedIndex: activeTranscript().length ? 0 : -1, persist: true });
    const fallbackFrame = recreateStudyVideoHost(media, { start: resumeAt, autoplay: restart });
    state.studyVideoLoadPromise = ensureYouTubeApi().then(() => new Promise((resolve, reject) => {
      if (activeStudy()?.id !== expectedStudyId) { resolve(null); return; }
      const host = fallbackFrame?.isConnected ? fallbackFrame : els.studyVideoFrame;
      if (!host) { reject(new Error('Video container is unavailable')); return; }
      state.studyVideoPlayer = new YT.Player(host, {
        events: {
          onReady: event => {
            state.studyVideoReady = true;
            if (resumeAt > 0 || restart) event.target.seekTo(resumeAt, true);
            if (restart) event.target.playVideo();
            resolve(event.target);
          },
          onStateChange: event => {
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
    transcriptRow(index)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function restoreTranscriptViewport() {
    const index = state.transcriptActiveIndex >= 0 ? state.transcriptActiveIndex : state.transcriptSelectedIndex;
    if (index < 0) { scrollTo({ top: 0, behavior: 'auto' }); return; }
    transcriptRow(index)?.scrollIntoView({ behavior: 'auto', block: 'center' });
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

  function setTranscriptMarker(kind, index) {
    const property = kind === 'active' ? 'transcriptActiveIndex' : kind === 'reading' ? 'transcriptReadingIndex' : 'transcriptSelectedIndex';
    const previous = state[property];
    if (previous === index) { updateTranscriptPosition(); return; }
    transcriptRow(previous)?.classList.remove(kind);
    if (kind === 'selected') transcriptRow(previous)?.querySelector('[data-transcript-select]')?.setAttribute('aria-pressed', 'false');
    state[property] = index;
    transcriptRow(index)?.classList.add(kind);
    if (kind === 'selected') transcriptRow(index)?.querySelector('[data-transcript-select]')?.setAttribute('aria-pressed', 'true');
    if (kind === 'selected' && index >= 0) rememberStudyPlayback({ time: activeTranscript()[index]?.start, selectedIndex: index });
    updateTranscriptPosition();
    if ((kind === 'active' || kind === 'reading') && index >= 0) scrollTranscriptTo(index);
  }

  function updateStudyVideoTime() {
    const player = state.studyVideoPlayer;
    if (!state.studyVideoReady || !player?.getCurrentTime) return;
    let time = 0;
    try { time = Number(player.getCurrentTime()) || 0; } catch { return; }
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
    const actionId = ++state.transcriptVideoActionId;
    const shouldPlay = mode === 'continuous' || mode === 'clip';
    stopTranscriptSpeech();
    setTranscriptMarker('selected', index);
    rememberStudyPlayback({ time: range.start, selectedIndex: index, persist: true });
    const study = activeStudy();
    if (!normalizeYouTubeMedia(study?.media)) {
      if (shouldPlay) showToast('This transcript has no linked YouTube video');
      return;
    }
    const media = normalizeYouTubeMedia(study?.media);
    const player = await loadStudyVideo(false);
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
    if (index >= cues.length) { stopTranscriptSpeech(); showToast('Transcript complete'); return; }
    const parts = transcriptSpeechParts(cues[index]);
    if (!parts.length) { speakTranscriptSequence(runId, index + 1, 0); return; }
    if (partIndex >= parts.length) { speakTranscriptSequence(runId, index + 1, 0); return; }
    state.transcriptSpeechIndex = index;
    state.transcriptSpeechPart = partIndex;
    setTranscriptMarker('reading', index);
    const utterance = configuredUtterance(parts[partIndex].text, parts[partIndex].language);
    const advance = () => {
      if (runId !== state.transcriptSpeechRunId || !state.transcriptSpeechActive) return;
      speakTranscriptSequence(runId, partIndex + 1 < parts.length ? index : index + 1, partIndex + 1 < parts.length ? partIndex + 1 : 0);
    };
    utterance.onend = advance;
    utterance.onerror = advance;
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
    els.transcriptList.innerHTML = cues.map((cue, index) => `<article class="transcript-cue${index === state.transcriptSelectedIndex ? ' selected' : ''}${index === state.transcriptActiveIndex ? ' active' : ''}${index === state.transcriptReadingIndex ? ' reading' : ''}" data-transcript-index="${index}" data-language="${escapeHtml(state.transcriptLanguage)}">
      <button class="transcript-cue-main" type="button" data-transcript-select="${index}" aria-pressed="${index === state.transcriptSelectedIndex}" aria-label="Select subtitle ${index + 1} at ${escapeHtml(formatClipTime(cue.start))}. Tap the selected subtitle again to play continuously."><time>${escapeHtml(formatClipTime(cue.start))}</time><span class="transcript-cue-copy"><strong>${escapeHtml(cue.en)}</strong><small>${escapeHtml(cue.es)}</small></span></button>
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
    els.studyVideoReady.hidden = !media;
    els.studyVideoEmpty.hidden = Boolean(media);
    if (!media) destroyStudyVideo();
    else {
      els.studyVideoTitle.textContent = study.name || 'Study video';
      els.studyVideoMeta.textContent = `${media.name || 'YouTube video'} · ${(study.transcript || []).length} subtitles`;
      loadStudyVideo(false);
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
    const transcriptSpeak = event.target.closest('[data-transcript-speak]'); if (transcriptSpeak) { speakTranscriptCue(Number(transcriptSpeak.dataset.transcriptSpeak)); return; }
    const transcriptClip = event.target.closest('[data-transcript-clip]'); if (transcriptClip) { selectTranscriptCue(Number(transcriptClip.dataset.transcriptClip), 'clip'); return; }
    const transcriptSelect = event.target.closest('[data-transcript-select]'); if (transcriptSelect) { activateTranscriptCue(Number(transcriptSelect.dataset.transcriptSelect)); return; }
    const transcriptLanguage = event.target.closest('[data-transcript-language]'); if (transcriptLanguage) {
      state.transcriptLanguage = transcriptLanguage.dataset.transcriptLanguage;
      localStorage.setItem('lingualoop.mobile.transcriptLanguage', state.transcriptLanguage);
      stopTranscriptSpeech();
      els.transcriptLanguages.forEach(button => button.classList.toggle('active', button === transcriptLanguage));
      $$('.transcript-cue', els.transcriptList).forEach(row => { row.dataset.language = state.transcriptLanguage; });
      return;
    }
    const deleteButton = event.target.closest('[data-study-delete]'); if (deleteButton) { requestStudyDelete(deleteButton.dataset.studyDelete); return; }
    const viewButton = event.target.closest('[data-view-target]'); if (viewButton) showView(viewButton.dataset.viewTarget);
    const practiceButton = event.target.closest('[data-practice-mode]'); if (practiceButton) { startPractice(practiceButton.dataset.practiceMode); showView('practice'); }
    const studyButton = event.target.closest('[data-study-open]'); if (studyButton) { clearPendingStudyDelete(); stopTranscriptSpeech(); captureStudyVideoPosition(true); destroyStudyVideo(); state.library.activeStudyId = studyButton.dataset.studyOpen; state.transcriptStudyId = ''; saveLibrary(); render(); if (state.view === 'video') { renderStudyVideo(); requestAnimationFrame(restoreTranscriptViewport); } showToast(`${activeStudy()?.name || 'Study'} is now active`); }
    const rating = event.target.closest('[data-rating]'); if (rating) rateCard(rating.dataset.rating);
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
    localStorage.setItem('lingualoop.mobile.transcriptFollow', String(state.transcriptFollow));
    els.transcriptFollow.classList.toggle('active', state.transcriptFollow);
    els.transcriptFollow.setAttribute('aria-pressed', String(state.transcriptFollow));
    if (state.transcriptFollow) scrollTranscriptTo(state.transcriptReadingIndex >= 0 ? state.transcriptReadingIndex : state.transcriptActiveIndex);
  });
  els.transcriptSpeed.addEventListener('change', () => {
    state.transcriptSpeed = Math.max(.6, Math.min(1.25, Number(els.transcriptSpeed.value) || .9));
    localStorage.setItem('lingualoop.mobile.transcriptSpeed', String(state.transcriptSpeed));
    if (state.transcriptSpeechActive) { stopTranscriptSpeech(); showToast('Voice speed updated · tap Read all to continue'); }
  });
  els.writeForm.addEventListener('submit', checkWrittenAnswer);
  els.pasteTransfer.addEventListener('click', pasteTransferFromClipboard);
  els.importManualTransfer.addEventListener('click', importManualTransfer);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') captureStudyVideoPosition(true); });
  addEventListener('pagehide', () => captureStudyVideoPosition(true));
  (async () => {
    await loadLibrary(); await importPackFromHash(); render(); showView('today');
    if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {}));
  })();
})();
