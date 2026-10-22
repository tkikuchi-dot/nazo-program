'use strict';

(() => {
  const SPEEDS = { slow: 800, normal: 450, fast: 170, faster: 70 };
  const SPEED_KEY = 'nazo-program:speed';
  const IDLE_MSG = 'プログラムを組み立てて「▶ 再生」を押してね。';
  const UPCOMING = [];
  const COMPACT_KEY = 'nazo-program:compact';
  const COMPACT_CHOSEN_KEY = 'nazo-program:compact-chosen';
  const SUB_LIBRARY_KEY = 'nazo-program:subs';
  const $ = (id) => document.getElementById(id);
  const saveId = (s) => s.saveKey ?? s.id;
  const clearKey = (s) => `nazo-program:cleared:stage${saveId(s)}`;
  const recordKey = (s) => `nazo-program:record:stage${saveId(s)}`;

  // クリア記録。どれも少ないほどよい。ベストは項目ごとに別々に残す
  const RECORD_ITEMS = [
    { key: 'lines', label: 'プログラムの行数', short: '行数', unit: '行' },
    { key: 'steps', label: '実行した命令の数', short: '実行', unit: '回' },
    { key: 'moves', label: '移動距離', short: '移動', unit: 'マス' },
    { key: 'exec', label: 'かかった時間', short: '時間', unit: '', format: formatDuration },
  ];
  const RECORD_CORE = ['lines', 'steps', 'moves'];

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  function recordText(it, n) {
    return it.format ? it.format(n) : `${n}${it.unit}`;
  }

  function loadRecord(s) {
    try {
      const r = JSON.parse(localStorage.getItem(recordKey(s)) || 'null');
      if (!r || !RECORD_CORE.every((k) => Number.isFinite(r[k]))) return null;
      if (!Number.isFinite(r.exec)) delete r.exec;
      return r;
    } catch (e) {
      return null;
    }
  }

  function saveRecord(s, record) {
    try { localStorage.setItem(recordKey(s), JSON.stringify(record)); } catch (e) { /* ignore */ }
  }
  const stageById = (id) => STAGES.find((s) => s.id === id);

  let speed = loadSpeed();
  let state = 'idle'; // idle | running | paused | finished
  let timer = null;
  let multi = null;

  let stage = null;
  let execMs = 0;
  let clearTimeMs = 0;
  let mainBoard = null;
  let mainView = null;
  let robot = null;
  let editor = null;
  let tutorial = null;

  const btnPlay = $('btnPlay');
  const btnStep = $('btnStep');

  function isCleared(s) {
    try { return !!localStorage.getItem(clearKey(s)); } catch (e) { return false; }
  }

  // ---- 画面切り替え ----
  function showScreen(name) {
    ['title', 'select', 'game'].forEach((n) => $(`${n}Screen`).classList.toggle('hidden', n !== name));
    window.scrollTo(0, 0);
  }

  function leaveGame() {
    stopMulti();
    clearTimeout(timer);
    timer = null;
    state = 'idle';
    if (tutorial) tutorial.destroy();
    tutorial = null;
  }

  function checkTutorial(acted = true) {
    if (!tutorial) return;
    tutorial.check({ program: editor.program, editor, robot, withinLimit: withinLimit(), acted });
  }

  function openTitle() {
    leaveGame();
    showScreen('title');
  }

  function openSelect() {
    leaveGame();
    renderStageSelect();
    showScreen('select');
  }

  function isUnlocked() {
    return true;
  }

  function renderStageSelect() {
    const root = $('stageGrid');
    root.innerHTML = '';
    let grid = null;
    let group = null;
    STAGES.forEach((s) => {
      if (s.group !== group) {
        group = s.group;
        root.appendChild(h('h3', 'stage-group', group));
        grid = h('div', 'stage-grid');
        root.appendChild(grid);
      }
      const open = isUnlocked(s);
      const card = h('button', 'stage-card' + (open ? '' : ' locked'));
      card.type = 'button';
      card.disabled = !open;
      const record = loadRecord(s);
      const recordHtml = record
        ? `<span class="stage-record"><span class="stage-record-title">ベスト記録</span>${RECORD_ITEMS
          .filter((it) => Number.isFinite(record[it.key]))
          .map((it) => `<span class="stage-record-item">${it.short} <b>${it.format ? it.format(record[it.key]) : record[it.key]}</b>${it.format ? '' : it.unit}</span>`).join('')}</span>`
        : '';
      card.innerHTML = `
        <span class="stage-num"><small>STAGE</small>${s.id}</span>
        <span class="stage-name">${s.title}</span>
        <span class="stage-desc">${open ? s.summary : `ステージ ${s.requires} をクリアすると遊べます`}</span>
        ${recordHtml}
        ${isCleared(s) ? `<span class="stage-badge">${s.finale ? '合格' : 'CLEAR'}</span>` : ''}`;
      if (open) card.addEventListener('click', () => openStage(s));
      grid.appendChild(card);
    });

    if (UPCOMING.length && group !== '本編') {
      root.appendChild(h('h3', 'stage-group', '本編'));
      grid = h('div', 'stage-grid');
      root.appendChild(grid);
    }
    UPCOMING.forEach((id) => {
      const card = h('div', 'stage-card locked');
      card.innerHTML = `
        <span class="stage-num"><small>STAGE</small>${id}</span>
        <span class="stage-name">準備中</span>
        <span class="stage-desc">もうすぐ登場</span>`;
      grid.appendChild(card);
    });
  }

  function openStage(s) {
    stage = s;
    execMs = 0;
    clearTimeMs = 0;
    $('stageTitle').textContent = `${s.label}　${s.title}`;
    $('guide').innerHTML = s.guide;
    $('clearMark').textContent = s.finale ? '合格済み' : 'CLEAR済み';
    $('clearMark').classList.toggle('hidden', !isCleared(s));
    showScreen('game');

    mainBoard = createBoard(s.problem, s.main);
    mainView = new BoardView($('mainBoard'), mainBoard, { speakHint: true, calcMods: s.calcMods });
    robot = new Robot(mainBoard);
    editor = new ProgramEditor({
      paletteEl: $('palette'),
      subSectionEl: $('subSection'),
      subPaletteEl: $('subPalette'),
      subCountEl: $('subCount'),
      newSubBtn: $('btnNewSub'),
      copyMainBtn: $('btnCopyMain'),
      lockedEl: $('lockedPalette'),
      tabsEl: $('routineTabs'),
      routineBarEl: $('routineBar'),
      listEl: $('program'),
      splitBtn: $('btnSplit'),
      multiBtn: $('btnMulti'),
      copyBtn: $('btnCopyInst'),
      pasteBtn: $('btnPasteInst'),
      noteEl: $('programNote'),
      panelEl: $('programPanel'),
      rootEl: $('gameLayout'),
      ops: s.ops,
      lockedOps: s.lockedOps,
      storageKey: `nazo-program:program:stage${saveId(s)}`,
      libraryKey: SUB_LIBRARY_KEY,
      allowSubs: s.allowSubs !== false,
      allowElse: !!s.allowElse,
      plainView: !!s.tutorial,
      onChange: () => {
        const n = programSize(editor.program);
        Sound.se(n < programUnits ? 'remove' : n > programUnits ? 'place' : 'tap');
        programUnits = n;
        skipUi = true;
        setTimeout(() => { skipUi = false; }, 0);
        if (state !== 'idle') resetRun();
        updateStats();
        checkTutorial();
      },
      onViewChange: () => checkTutorial(),
    });

    if (tutorial) tutorial.destroy();
    tutorial = s.tutorial ? new Tutorial($('tutorial'), s.tutorial, {
      storageKey: s.abortLine ? `nazo-program:tutorial:stage${saveId(s)}` : null,
      onIndexChange: () => {
        syncTutorialWorld();
        applyCompact();
      },
    }) : null;
    syncTutorialWorld();
    applyCompact();
    $('guideBox').open = !s.tutorial;
    programUnits = programSize(editor.program);

    resetRun();
    checkTutorial(false);
  }

  let programUnits = 0;
  let skipUi = false;

  function programSize(program) {
    const n = (body) => (body || []).length;
    return n(program.main) + (program.subs || []).reduce((sum, sub) => sum + n(sub.body), 0);
  }

  // チュートリアルの進みぐあいに合わせて、「あきらめる」と JUMP の出せるタイミングを切り替える
  function syncTutorialWorld() {
    if (!tutorial || !stage || !stage.abortLine || !editor) return;
    let phase = 'plain';
    for (let i = 0; i <= tutorial.index; i++) {
      if (tutorial.steps[i].phase) phase = tutorial.steps[i].phase;
    }
    if (phase === 'plain') editor.disarmAbort();
    else editor.armAbort([stage.abortLine]);
    if (phase === 'jump') editor.allowOp('JUMP');
    else editor.lockOp('JUMP');
  }

  function withinLimit() {
    return !stage.maxBlocks || editor.countBlocks() <= stage.maxBlocks;
  }

  // ---- 実行 ----
  function stepMs() {
    return SPEEDS[speed];
  }

  function loadSpeed() {
    try {
      const s = localStorage.getItem(SPEED_KEY);
      return Object.prototype.hasOwnProperty.call(SPEEDS, s) ? s : 'normal';
    } catch (e) {
      return 'normal';
    }
  }

  function setSpeed(s) {
    if (!Object.prototype.hasOwnProperty.call(SPEEDS, s)) s = 'normal';
    speed = s;
    document.documentElement.style.setProperty('--step-ms', `${Math.round(SPEEDS[s] * 0.85)}ms`);
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', b.dataset.speed === s));
    try { localStorage.setItem(SPEED_KEY, s); } catch (e) { /* ignore */ }
  }

  function setMessage(text, type = 'info') {
    const m = $('message');
    m.textContent = text;
    m.className = `message ${type}`;
  }

  function updateButtons() {
    const running = state === 'running';
    btnPlay.innerHTML = running
      ? '<span class="icon">❚❚</span> 止める'
      : '<span class="icon">▶</span> 再生';
    btnPlay.classList.toggle('is-pause', running);
    btnStep.disabled = running;
    editor.setLocked(running);
  }

  function updateStats() {
    const count = editor.countBlocks();
    $('stats').textContent = `行数 ${count}行 ／ 実行 ${robot.steps}回 ／ 移動 ${robot.moves}マス`;

    const mission = $('mission');
    mission.classList.toggle('hidden', !stage.maxBlocks);
    if (stage.maxBlocks) {
      mission.classList.toggle('ok', count <= stage.maxBlocks);
      mission.innerHTML = `<b>ミッション</b> 命令 ${stage.maxBlocks}個以内でクリア` +
        `<span class="mission-count">いま ${count}個</span>`;
    }
  }

  function resetRun() {
    clearTimeout(timer);
    timer = null;
    state = 'idle';
    execMs = 0;
    robot.reset();
    mainView.reset(robot);
    editor.setActive(null);
    editor.markError(null);
    setMessage(IDLE_MSG);
    updateButtons();
    updateStats();
  }

  function ensureReady() {
    if (state === 'finished') resetRun();
    if (!editor.program.main.length) {
      setMessage('まずは命令をメインのプログラムに入れよう！', 'warn');
      editor.flashEmpty();
      return false;
    }
    return true;
  }

  function play() {
    if (state === 'running') {
      clearTimeout(timer);
      state = 'paused';
      Sound.se('pause');
      setMessage('一時停止中。「▶ 再生」で続きから動きます。');
      updateButtons();
      return;
    }
    editor.commitFields();
    if (!ensureReady()) {
      Sound.se('ng');
      return;
    }
    Sound.se('play');
    state = 'running';
    if (tutorial) tutorial.runStarted();
    setMessage('実行中…');
    updateButtons();
    tick();
  }

  function stepOnce() {
    if (state === 'running') return;
    editor.commitFields();
    if (!ensureReady()) {
      Sound.se('ng');
      return;
    }
    if (tutorial) tutorial.runStarted();
    state = 'paused';
    setMessage('1ステップずつ実行中。');
    updateButtons();
    runStep();
  }

  function tick() {
    runStep();
    if (state === 'running') timer = setTimeout(tick, stepMs());
  }

  function runStep() {
    const ev = robot.step(editor.program);
    if (!ev) return;
    execMs += stepMs();
    mainView.apply(ev, robot);
    editor.setActive(ev.loc ?? null, ev);
    updateStats();
    checkTutorial();
    soundStep(ev);
    if (robot.finished) finishMain(ev);
  }

  function soundStep(ev) {
    if (!ev || ev.type === 'goal') return;
    if (ev.type === 'error') Sound.se('ng');
    else if (ev.type === 'if') Sound.se(ev.result ? 'if' : 'ifno');
    else Sound.se(ev.type);
  }

  function finishMain(ev) {
    clearTimeout(timer);
    state = 'finished';
    updateButtons();
    const tutorialAdvanced = tutorial ? tutorial.runEnded({ correct: robot.correct }) : false;

    if (ev.type !== 'goal') {
      // チュートリアルが進んだ実行は「途中まで動かしてみる」練習なので、エラー扱いにしない
      setMessage(robot.message, tutorialAdvanced ? 'warn' : 'error');
      if (ev.loc && !tutorialAdvanced) editor.markError(ev.loc);
      return;
    }

    setMessage('ゴールで「ABCを言う」！');
    timer = setTimeout(() => {
      mainView.say(robot.said);
      mainView.showResult(robot.correct);
      Sound.se(robot.correct ? 'ok' : 'ng');
      if (robot.correct && !withinLimit()) {
        setMessage(`「${robot.said}」 正解！ …でも命令が ${editor.countBlocks()}個。ミッションは ${stage.maxBlocks}個以内だよ。${stage.limitHint || ''}`, 'warn');
      } else if (robot.correct && tutorial && tutorial.blocksClear()) {
        setMessage(`「${robot.said}」 正解！ つづきは先生の話を見てね。`, 'success');
      } else if (robot.correct) {
        setMessage(`「${robot.said}」 正解！ 次は同じプログラムで 9つの問題に挑戦！`, 'success');
        clearTimeMs = execMs;
        timer = setTimeout(openMulti, 1800);
      } else {
        setMessage(`「${robot.said || '……'}」 …答えが違うみたい。問題文をよく読んでみよう。`, 'error');
      }
    }, stepMs() * 0.9);
  }

  // ---- 9つの盤面で同時に検証 ----
  function openMulti() {
    timer = null;
    const grid = $('multiGrid');
    grid.innerHTML = '';
    $('overlayResult').textContent = '';
    $('overlayResult').className = 'overlay-result';
    $('overlayActions').classList.add('hidden');

    const program = JSON.parse(JSON.stringify(editor.program));
    const units = stage.tests.map((spec, i) => {
      const wrap = h('div', 'multi-cell');
      wrap.appendChild(h('div', 'multi-label', `No.${i + 1}`));
      const holder = h('div');
      wrap.appendChild(holder);
      grid.appendChild(wrap);
      const board = createBoard(stage.problem, spec);
      return { wrap, view: new BoardView(holder, board, { small: true }), robot: new Robot(board) };
    });

    multi = { units, program, timer: null };
    $('overlay').classList.remove('hidden');
    multi.timer = setTimeout(multiTick, 900);
  }

  function multiTick() {
    if (!multi) return;
    let alive = false;
    let heard = 0;
    multi.units.forEach((u) => {
      if (u.robot.finished) return;
      const ev = u.robot.step(multi.program);
      u.view.apply(ev, u.robot);
      if (u.robot.finished) {
        finishUnit(u, ev);
        heard = Math.max(heard, ev.type === 'goal' && u.robot.correct ? 2 : 3);
      } else {
        alive = true;
        heard = Math.max(heard, 1);
      }
    });
    if (heard === 3) Sound.se('ng');
    else if (heard === 2) Sound.se('ok');
    else if (heard === 1) Sound.se('move');
    multi.timer = alive
      ? setTimeout(multiTick, stepMs())
      : setTimeout(showMultiResult, stepMs() + 900);
  }

  function finishUnit(u, ev) {
    const reveal = () => {
      if (ev.type === 'goal') u.view.say(u.robot.said);
      u.view.showResult(u.robot.correct);
      u.wrap.classList.add(u.robot.correct ? 'ok' : 'ng');
    };
    if (ev.type === 'goal') setTimeout(reveal, stepMs() * 0.9);
    else reveal();
  }

  function showMultiResult() {
    if (!multi) return;
    const total = multi.units.length;
    const ok = multi.units.filter((u) => u.robot.correct).length;
    const result = $('overlayResult');
    if (ok === total) {
      result.textContent = `${ok} / ${total} 全部正解！`;
      result.className = 'overlay-result ok';
      showClear();
    } else {
      result.textContent = `${ok} / ${total} 正解 … 同じプログラムで全部解けるようにしよう！`;
      result.className = 'overlay-result ng';
      $('overlayActions').classList.remove('hidden');
    }
  }

  function stopMulti() {
    if (multi) clearTimeout(multi.timer);
    multi = null;
    $('overlay').classList.add('hidden');
    $('clearBanner').classList.add('hidden');
    $('confetti').innerHTML = '';
  }

  function closeMulti() {
    stopMulti();
    resetRun();
  }

  // ---- CLEAR! 演出 ----
  function showClear() {
    try { localStorage.setItem(clearKey(stage), '1'); } catch (e) { /* ignore */ }
    $('clearMark').textContent = stage.finale ? '合格済み' : 'CLEAR済み';
    $('clearMark').classList.remove('hidden');
    $('clearText').textContent = stage.finale ? '合格！' : 'CLEAR!';
    $('clearSub').textContent = stage.finale
      ? `チュートリアル合格！ ${stage.label} ${stage.title}`
      : `${stage.label} ${stage.title} クリア！`;
    renderClearStats({
      lines: editor.countBlocks(),
      steps: robot.steps,
      moves: robot.moves,
      exec: clearTimeMs,
    });
    $('btnClearNext').classList.toggle('hidden', !nextStage());

    const confetti = $('confetti');
    confetti.innerHTML = '';
    const colors = ['#ffcc00', '#3d8bfd', '#ff9636', '#22b07d', '#ef4b5c', '#a66bff'];
    for (let i = 0; i < 80; i++) {
      const p = h('span', 'confetti-piece');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 1.2}s`;
      p.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
      confetti.appendChild(p);
    }
    $('clearBanner').classList.remove('hidden');
    Sound.se('clear');
  }

  // 今回の記録を見せて、ベストを更新したものには「ベスト更新！」をつける
  function renderClearStats(result) {
    const prev = loadRecord(stage);
    const best = {};
    RECORD_ITEMS.forEach((it) => {
      const old = prev && Number.isFinite(prev[it.key]) ? prev[it.key] : null;
      best[it.key] = old == null ? result[it.key] : Math.min(old, result[it.key]);
    });
    saveRecord(stage, best);

    const box = $('clearStats');
    box.innerHTML = '';
    RECORD_ITEMS.forEach((it) => {
      const had = prev && Number.isFinite(prev[it.key]);
      const improved = had && result[it.key] < prev[it.key];
      const stat = h('div', 'clear-stat' + (improved ? ' improved' : ''));
      stat.appendChild(h('span', 'clear-stat-label', it.label));
      const value = h('span', 'clear-stat-value', it.format ? it.format(result[it.key]) : String(result[it.key]));
      if (!it.format) value.appendChild(h('small', '', it.unit));
      stat.appendChild(value);
      stat.appendChild(h('span', 'clear-stat-best', had ? `ベスト ${recordText(it, best[it.key])}` : 'はじめての記録'));
      if (improved) stat.appendChild(h('span', 'clear-stat-new', 'ベスト更新！'));
      box.appendChild(stat);
    });
  }

  function nextStage() {
    return STAGES[STAGES.indexOf(stage) + 1] || null;
  }

  function openNextStage() {
    const next = nextStage();
    if (!next) return;
    leaveGame();
    openStage(next);
  }

  // ---- イベント ----
  $('btnGameStart').addEventListener('click', openSelect);
  $('btnToTitle').addEventListener('click', openTitle);
  $('btnToSelect').addEventListener('click', openSelect);

  btnPlay.addEventListener('click', play);
  let secretClicks = 0;
  let secretAt = 0;
  $('btnSecret').addEventListener('click', () => {
    if (!stage || !editor) return;
    const now = Date.now();
    secretClicks = now - secretAt > 4000 ? 1 : secretClicks + 1;
    secretAt = now;
    if (secretClicks < 10) return;
    secretClicks = 0;
    const model = modelProgram(stage);
    if (!model) {
      setMessage('このステージの模範解答は、まだ用意していないよ。', 'warn');
      return;
    }
    editor.installModel(model.main, model.sub || null);
    setMessage('模範解答を入れたよ。再生して確かめてね。', 'success');
  });
  btnStep.addEventListener('click', stepOnce);
  $('btnReset').addEventListener('click', resetRun);
  $('btnClear').addEventListener('click', () => editor.clear());
  window.addEventListener('keydown', (e) => {
    if (!editor || editor.locked) return;
    if (e.target.closest('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'c' && editor.selected.size) {
      e.preventDefault();
      editor.copySelection();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'v') {
      e.preventDefault();
      editor.pasteClip();
    }
  });
  $('btnBack').addEventListener('click', closeMulti);
  $('btnClearClose').addEventListener('click', closeMulti);
  $('btnClearSelect').addEventListener('click', openSelect);
  $('btnClearNext').addEventListener('click', openNextStage);
  $('btnCompact').addEventListener('click', () => setCompact(!document.body.classList.contains('is-compact'), true));
  document.querySelectorAll('[data-speed]').forEach((b) => {
    b.addEventListener('click', () => setSpeed(b.dataset.speed));
  });

  $('titleRobot').appendChild(buildRobotBody());
  Sound.bind();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.id === 'btnPlay' || btn.id === 'btnStep' || btn.id === 'btnSecret') return;
    if (skipUi) return;
    Sound.se('tap');
  });
  setSpeed(speed);
  setCompact(compactChosen() && loadCompact(), false);
  showScreen('title');

  function loadCompact() {
    try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch (e) { return false; }
  }

  function compactChosen() {
    try {
      if (localStorage.getItem(COMPACT_CHOSEN_KEY) === '1') return true;
      return localStorage.getItem(COMPACT_KEY) === '1';
    } catch (e) { return false; }
  }

  // ボタンで選んでいなければ、チュートリアルの途中は説明を出し、終わったら隠す
  function applyCompact() {
    if (compactChosen()) setCompact(loadCompact(), false);
    else setCompact(!(tutorial && !tutorial.isLast), false);
  }

  function setCompact(on, persist) {
    document.body.classList.toggle('is-compact', on);
    const btn = $('btnCompact');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '説明を表示' : '説明を非表示';
    btn.title = on ? '命令の説明や、プログラムの補足を表示します' : '命令の説明や、プログラムの補足を隠します';
    if (!persist) return;
    try {
      localStorage.setItem(COMPACT_CHOSEN_KEY, '1');
      localStorage.setItem(COMPACT_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
  }
})();
