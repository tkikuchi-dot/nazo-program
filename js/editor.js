'use strict';

const OP_INFO = {
  MOVE: { desc: '1マス動く\n「ゴールまで進む」でゴールへ', cls: 'move' },
  SCAN: { desc: '足元の文字を記憶\n（自動格納: A→B→C→a→b→c）', cls: 'scan' },
  SAY: { desc: 'A→B→C の順に言う\nゴールのうえで言うとクリア判定', cls: 'say' },
  CALL: { desc: 'サブ命令を実行', cls: 'call' },
  JUMP: { desc: '◆ の場所へ飛ぶ', cls: 'jump' },
  LABEL: { cls: 'label' },
  ELSEIF: { cls: 'elseif' },
  ELSE: { cls: 'else' },
  ENDIF: { cls: 'endif' },
  IF: { desc: '選んだ記憶が、入力と同じか調べる\nひらがなも数字も可。２と2は同じ\n空欄は「何も入っていない」\nかつ／またはは、条件のあいだで別々\n上から順に組み合わせる\n当てはまれば「ここまで」を実行', cls: 'if' },
  ABORT: { desc: 'あきらめてしまう（消せない）', cls: 'abort' },
  '+': { desc: 'A に X を足す\nX は A〜c か、N の数字\nスキャンした数字も X にできる。２と2は同じ\nA がひらがななら、その数だけ五十音で進む\n「ん」の次は「あ」。空の A は 0 から', cls: 'plus' },
  '-': { desc: 'A から X を引く\nX は A〜c か、N の数字\nスキャンした数字も X にできる。２と2は同じ\nA がひらがななら、その数だけ五十音で戻る\n「あ」の前は「ん」。空の A は 0 から', cls: 'minus' },
  COPY: { desc: 'A に a をコピーする\n左がコピー先、右がコピー元\nX は、ひらがな1文字か数字か空欄\n空欄をコピーすると、先の記憶が消える\n濁点・半濁点は使えない', cls: 'copy' },
};

// 命令の色（青・橙・赤・紫・桃・緑・青緑・琥珀・茶・青灰）と重ならないよう、サブ命令は灰色だけ
const SUB_COLORS = [
  '#2f2d2b', '#4e4842', '#3a3633', '#635c54', '#45413d',
  '#6e675e', '#38342f', '#585248', '#403c38', '#5c554c',
];

function subColorFor(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
  return SUB_COLORS[(n - 1) % SUB_COLORS.length];
}
const MAX_SUBS = 20;
const SUB_NAME_MAX = 10;
const DRAG_THRESHOLD = 5;
const LIST_GAP = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MAX_CONDS = 50;

const OP_MARK = {
  MOVE: 'M',
  SCAN: 'S',
  SAY: '言',
  CALL: 'C',
  JUMP: 'J',
  LABEL: '◆',
  IF: 'I',
  ELSEIF: 'EI',
  ELSE: 'E',
  ENDIF: ']',
  ABORT: 'あ',
  '+': '＋',
  '-': 'ー',
  COPY: 'コ',
};

function subSketch(body) {
  return body.map((inst) => OP_MARK[inst.op]).filter(Boolean).join(' ');
}

function opLabel(op) {
  if (op === 'SAY') return 'ABCを言う';
  if (op === 'COPY') return 'コピー';
  if (op === '+' || op === '+1') return '＋';
  if (op === '-' || op === '-1') return 'ー';
  if (op === 'ELSEIF') return 'ELSE IF';
  return op;
}

function upgradeArith(inst) {
  if (!inst) return inst;
  const op = inst.op === '+1' ? '+' : inst.op === '-1' ? '-' : inst.op;
  if (op !== '+' && op !== '-') return inst;
  const slot = SLOTS.includes(inst.slot) ? inst.slot : 'A';
  const by = SLOTS.includes(inst.by) ? inst.by : (parseArithLiteral(inst.by) ?? 1);
  return { ...inst, op, slot, by };
}

function validConds(inst) {
  return Array.isArray(inst.conds) && inst.conds.length >= 1 && inst.conds.length <= MAX_CONDS &&
    inst.conds.every((c, i) => c && SLOTS.includes(c.slot) && (c.cmp === 'eq' || c.cmp === 'ne') &&
      (c.ch === null || typeof c.ch === 'string') &&
      (i === 0 || c.join === 'and' || c.join === 'or'));
}

function withCondSlots(inst) {
  const fallback = inst.join === 'or' ? 'or' : 'and';
  return {
    ...inst,
    join: fallback,
    conds: inst.conds.map((c, i) => {
      const next = { ...c, ch: c.ch ?? null, slot: SLOTS.includes(c.slot) ? c.slot : 'A' };
      if (i === 0) delete next.join;
      else next.join = c.join === 'or' || c.join === 'and' ? c.join : fallback;
      return next;
    }),
  };
}

// 条件が1つだけだった頃の IF（cmp / ch）を、conds の形に直す。調べる場所は記憶 A〜c
function upgradeIf(inst) {
  if (!inst || (inst.op !== 'IF' && inst.op !== 'ELSEIF')) return inst;
  if (!Array.isArray(inst.conds) && inst.cmp) {
    const { cmp, ch, ...rest } = inst;
    return withCondSlots({ ...rest, conds: [{ cmp, ch: ch ?? null }], join: inst.join || 'and' });
  }
  if (!Array.isArray(inst.conds)) return inst;
  return withCondSlots(inst);
}

// IF に入力された文字を1文字にそろえる（カタカナはひらがな、全角数字は半角に直す）。
// 続けて打ったときは、最後の1文字を使う。空なら null
function normalizeChar(value) {
  const chars = Array.from(String(value ?? '').replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim());
  const ch = chars[chars.length - 1];
  if (!ch) return null;
  const digit = digitValue(ch);
  if (digit != null) return String(digit);
  const code = ch.codePointAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
}

class ProgramEditor {
  constructor(opts) {
    this.paletteEl = opts.paletteEl;
    this.subSectionEl = opts.subSectionEl;
    this.subPaletteEl = opts.subPaletteEl;
    this.subCountEl = opts.subCountEl;
    this.newSubBtn = opts.newSubBtn;
    this.copyMainBtn = opts.copyMainBtn;
    this.lockedEl = opts.lockedEl;
    this.tabsEl = opts.tabsEl;
    this.routineBarEl = opts.routineBarEl;
    this.listEl = opts.listEl;
    this.splitBtn = opts.splitBtn || null;
    this.multiBtn = opts.multiBtn || null;
    this.copyBtn = opts.copyBtn || null;
    this.pasteBtn = opts.pasteBtn || null;
    this.noteEl = opts.noteEl || null;
    this.panelEl = opts.panelEl;
    this.rootEl = opts.rootEl;
    this.ops = [...opts.ops];
    this.lockedOps = [...(opts.lockedOps || [])];
    this.storageKey = opts.storageKey;
    this.libraryKey = opts.libraryKey;
    this.allowSubs = opts.allowSubs !== false;
    this.allowElse = !!opts.allowElse;
    this.plainView = !!opts.plainView;
    this.fixedAbortLines = opts.fixedAbortLines || null;
    this.onChange = opts.onChange || (() => {});
    this.onViewChange = opts.onViewChange || (() => {});

    this.locked = false;
    this.current = 'main';
    this.activeLoc = null;
    this.errorLoc = null;
    this.justAddedId = null;
    this.drag = null;
    this.fieldCommits = [];
    this.selected = new Set();
    this.anchor = null;
    this.clip = null;
    this.multi = false;
    this.split = false;
    try { this.split = localStorage.getItem('nazo-program:split') === '1'; } catch (e) { /* 読めなくても一画面のまま */ }
    // チュートリアルは盤面とタブの位置が決まっている。二画面は、このステージではいったん外す
    if (this.plainView) this.split = false;
    this.splitSub = null;
    this.mirrorRoutine = null;
    this.buildingMirror = false;
    this.viewMain = document.getElementById('viewMain');
    this.viewSub = document.getElementById('viewSub');
    this.slotMain = document.getElementById('slotMain');
    this.slotSub = document.getElementById('slotSub');
    this.liveStack = document.getElementById('liveStack');
    this.mirrorStack = document.getElementById('mirrorStack');
    this.mirrorList = document.getElementById('mirrorList');
    this.mirrorBar = document.getElementById('mirrorBar');
    this.paneMainBtn = document.getElementById('paneMainBtn');
    this.paneSubBtn = document.getElementById('paneSubBtn');
    this.splitSubPick = document.getElementById('splitSubPick');

    this.program = this.load();
    const allInsts = [this.program.main, ...this.program.subs.map((s) => s.body)].flat();
    this.nextId = allInsts.reduce((m, i) => Math.max(m, i.id), 0) + 1;
    this.nextSubNo = this.program.subs.reduce((m, s) => Math.max(m, parseInt(s.id.slice(3), 10) || 0), 0) + 1;

    this.placeholder = h('li', 'drop-placeholder');
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);
    this.handleCancel = this.handleCancel.bind(this);

    this.newSubBtn.onclick = () => this.addSub();
    this.copyMainBtn.onclick = () => this.copyMainToSub();
    if (this.splitBtn) this.splitBtn.onclick = () => this.toggleSplit();
    if (this.paneMainBtn) this.paneMainBtn.onclick = () => this.showRoutine('main');
    if (this.paneSubBtn) this.paneSubBtn.onclick = () => { if (this.splitSub) this.showRoutine(this.splitSub); };
    if (this.splitSubPick) this.splitSubPick.addEventListener('change', () => {
      this.splitSub = this.splitSubPick.value;
      if (this.current !== 'main') this.showRoutine(this.splitSub);
      else this.renderMirror();
    });
    if (this.mirrorStack) {
      this.mirrorStack.addEventListener('pointerdown', (e) => {
        if (!this.split || !this.allowSubs || this.locked || this.drag || e.button !== 0) return;
        if (e.target.closest('button, select, input')) return;
        const id = this.current === 'main' ? this.splitSub : 'main';
        if (!id) return;
        e.preventDefault();
        this.showRoutine(id);
      });
    }
    if (this.multiBtn) this.multiBtn.onclick = () => this.toggleMulti();
    if (this.copyBtn) this.copyBtn.onclick = () => this.copySelection();
    if (this.pasteBtn) this.pasteBtn.onclick = () => this.pasteClip();
    if (this.listEl.selectHandler) this.listEl.removeEventListener('pointerdown', this.listEl.selectHandler);
    this.listEl.selectHandler = (e) => this.onListPointerDown(e);
    this.listEl.addEventListener('pointerdown', this.listEl.selectHandler);
    if (this.listEl.arrowObserver) this.listEl.arrowObserver.disconnect();
    this.listEl.arrowObserver = new ResizeObserver(() => {
      if (this.drag) return;
      this.drawArrows();
      if (this.mirrorList && this.split && this.mirrorRoutine) {
        this.drawArrows(this.mirrorList, routineBody(this.program, this.mirrorRoutine));
      }
    });
    this.listEl.arrowObserver.observe(this.listEl);
    if (this.mirrorList) this.listEl.arrowObserver.observe(this.mirrorList);
    this.renderAll();
  }

  // ---- 保存 ----
  readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  // メインはステージごと、サブ命令は全ステージ共通で保存する
  load() {
    let data = this.readJSON(this.storageKey);
    if (Array.isArray(data)) data = { main: data };
    const main = data && Array.isArray(data.main) ? data.main : [];

    const library = this.readJSON(this.libraryKey);
    const rawSubs = Array.isArray(library) ? library : [];
    // 以前のステージごとのサブ命令は、共通のサブ命令へ引っ越す
    if (data && Array.isArray(data.subs)) {
      data.subs.forEach((s) => { if (s && !rawSubs.some((x) => x && x.id === s.id)) rawSubs.push(s); });
    }

    const subs = rawSubs
      .filter((s) => s && /^sub\d+$/.test(s.id) && typeof s.name === 'string' && Array.isArray(s.body))
      .slice(0, MAX_SUBS)
      .map((s) => ({ id: s.id, name: s.name.slice(0, SUB_NAME_MAX), color: subColorFor(s.id), body: s.body }));
    const subIds = new Set(subs.map((s) => s.id));
    const valid = (allowCall) => (i) => i && Number.isInteger(i.id) && (
      (i.op === 'MOVE' && DIRS[i.dir]) ||
      (i.op === 'SCAN' && (i.slot === 'auto' || SLOTS.includes(i.slot))) ||
      i.op === 'SAY' ||
      (i.op === 'CALL' && allowCall && subIds.has(i.sub)) ||
      (i.op === 'LABEL' && typeof i.name === 'string') ||
      (i.op === 'IF' && validConds(i) && Number.isInteger(i.end)) ||
      (i.op === 'ELSEIF' && validConds(i) && Number.isInteger(i.of)) ||
      (i.op === 'ELSE' && Number.isInteger(i.of)) ||
      i.op === 'ENDIF' ||
      (i.op === 'JUMP' && Number.isInteger(i.target)) ||
      i.op === 'ABORT' ||
      ((i.op === '+' || i.op === '-') && SLOTS.includes(i.slot) && (Number.isInteger(i.by) || SLOTS.includes(i.by))) ||
      (i.op === 'COPY' && SLOTS.includes(i.to) && (SLOTS.includes(i.from) || isCopyLiteral(i.from)))
    );
    // JUMP と ◆、IF と「ここまで」・ELSE IF・ELSE は同じルーチン内でそろっていないといけない
    const clean = (body, allowCall) => {
      let list = body.map(upgradeIf).map(upgradeArith).filter(valid(allowCall));
      const ids = (op) => new Set(list.filter((i) => i.op === op).map((i) => i.id));
      const labelIds = ids('LABEL');
      const endIds = ids('ENDIF');
      list = list.filter((i) => (i.op !== 'JUMP' || labelIds.has(i.target)) && (i.op !== 'IF' || endIds.has(i.end)));
      const ifIds = ids('IF');
      const usedEnds = new Set(list.filter((i) => i.op === 'IF').map((i) => i.end));
      return list.filter((i) => (i.op !== 'ENDIF' || usedEnds.has(i.id)) &&
        ((i.op !== 'ELSEIF' && i.op !== 'ELSE') || ifIds.has(i.of)));
    };
    subs.forEach((s) => {
      s.body = clean(s.body, true).filter((i) => i.op !== 'ABORT');
    });
    let nextMain = clean(main, this.allowSubs);
    if (this.fixedAbortLines) {
      let nid = nextMain.reduce((m, i) => Math.max(m, i.id || 0), 0) + 1;
      nextMain = pinAbortLines(
        nextMain,
        () => ({ id: nid++, op: 'ABORT' }),
        this.fixedAbortLines,
      );
    }
    return { main: nextMain, subs };
  }

  pinAborts() {
    if (!this.fixedAbortLines) return;
    this.program.main = pinAbortLines(
      this.program.main,
      () => ({ id: this.nextId++, op: 'ABORT' }),
      this.fixedAbortLines,
    );
  }

  // いまのプログラムの N 行目に「あきらめる」を割り込ませる。すでに入っていれば、その位置関係を保つ
  armAbort(lines) {
    const had = this.program.main.some((i) => i.op === 'ABORT');
    this.fixedAbortLines = lines;
    if (had) this.pinAborts();
    else {
      this.program.main = insertAbortAtLine(
        this.program.main,
        () => ({ id: this.nextId++, op: 'ABORT' }),
        lines[0],
      );
    }
    this.save();
    this.activeLoc = null;
    this.errorLoc = null;
    if (this.current !== 'main') this.current = 'main';
    this.renderAll();
  }

  disarmAbort() {
    if (!this.fixedAbortLines && !this.program.main.some((i) => i.op === 'ABORT')) return;
    this.fixedAbortLines = null;
    this.program.main = this.program.main.filter((i) => i.op !== 'ABORT');
    this.save();
    this.activeLoc = null;
    this.errorLoc = null;
    this.renderAll();
  }

  allowOp(op) {
    if (this.ops.includes(op)) return;
    this.lockedOps = this.lockedOps.filter((o) => o !== op);
    this.ops.push(op);
    this.renderPalette();
  }

  lockOp(op) {
    if (!this.ops.includes(op)) return;
    this.ops = this.ops.filter((o) => o !== op);
    if (!this.lockedOps.includes(op)) this.lockedOps.unshift(op);
    this.renderPalette();
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ main: this.program.main }));
      localStorage.setItem(this.libraryKey, JSON.stringify(this.program.subs));
    } catch (e) { /* 保存できない環境では無視 */ }
  }

  changed() {
    this.errorLoc = null;
    this.activeLoc = null;
    this.pinAborts();
    this.save();
    this.renderAll();
    this.onChange(this.program);
  }

  // 模範解答。サブ命令が要るステージは「模範」(sub99) を足すか、中身を入れ替える
  installModel(main, sub) {
    const copy = (list) => JSON.parse(JSON.stringify(list));
    this.program.main = copy(main);
    if (sub) {
      let found = this.program.subs.find((s) => s.id === 'sub99');
      if (!found) {
        if (this.program.subs.length >= MAX_SUBS) this.program.subs.pop();
        found = { id: 'sub99', name: '模範', color: subColorFor('sub99'), body: [] };
        this.program.subs.push(found);
      }
      found.name = '模範';
      found.color = subColorFor('sub99');
      found.body = copy(sub);
      this.nextSubNo = Math.max(this.nextSubNo, 100);
    }
    const ids = this.program.main.concat(sub ? this.program.subs.find((s) => s.id === 'sub99').body : []).map((i) => i.id || 0);
    this.nextId = Math.max(this.nextId, ...ids) + 1;
    this.current = 'main';
    this.selected.clear();
    this.anchor = null;
    this.changed();
  }

  // 再生の直前に、フォーカス中の文字欄も条件へ入れる
  commitFields() {
    this.fieldCommits.forEach((fn) => fn());
  }

  // ---- ルーチン ----
  subById(id) {
    return this.program.subs.find((s) => s.id === id) || null;
  }

  currentBody() {
    return routineBody(this.program, this.current);
  }

  // メインと、メインから使われているサブ命令の中身を数える（◆ は数えない）
  countBlocks() {
    const count = (body) => body.filter((i) => !isMarker(i)).length;
    const seen = new Set();
    let n = count(this.program.main);
    const visit = (body) => body.forEach((i) => {
      if (i.op !== 'CALL' || seen.has(i.sub)) return;
      seen.add(i.sub);
      const sub = this.subById(i.sub);
      if (!sub) return;
      n += count(sub.body);
      visit(sub.body);
    });
    visit(this.program.main);
    return n;
  }

  showRoutine(id) {
    if (id !== 'main' && !this.subById(id)) id = 'main';
    if (this.current === id) return;
    this.selected = new Set();
    this.anchor = null;
    this.current = id;
    this.refreshViews();
    this.onViewChange(id);
  }

  addSub() {
    if (this.locked || this.program.subs.length >= MAX_SUBS) return;
    const n = this.nextSubNo++;
    const sub = {
      id: `sub${n}`,
      name: `サブ${n}`,
      color: subColorFor(`sub${n}`),
      body: [],
    };
    this.program.subs.push(sub);
    this.current = sub.id;
    this.changed();
  }

  // メインの命令を、ID のつながり（JUMP と ◆、IF と「ここまで」）を保ったまま複製する
  cloneInsts(list) {
    const idMap = new Map();
    const nid = (old) => {
      if (!idMap.has(old)) idMap.set(old, this.nextId++);
      return idMap.get(old);
    };
    return list.map((inst) => {
      const copy = { ...inst, id: nid(inst.id) };
      if (Array.isArray(inst.conds)) copy.conds = inst.conds.map((c) => ({ ...c }));
      if (inst.op === 'IF') copy.end = nid(inst.end);
      if (inst.op === 'ELSEIF' || inst.op === 'ELSE') copy.of = nid(inst.of);
      if (inst.op === 'JUMP') copy.target = nid(inst.target);
      return copy;
    });
  }

  copyMainToSub() {
    if (this.locked || this.program.subs.length >= MAX_SUBS) return;
    const src = this.program.main.filter((i) => i.op !== 'ABORT' && i.op !== 'PAD');
    if (!src.length) return;
    const n = this.nextSubNo++;
    const sub = {
      id: `sub${n}`,
      name: `サブ${n}`,
      color: subColorFor(`sub${n}`),
      body: this.cloneInsts(src),
    };
    this.program.subs.push(sub);
    this.current = sub.id;
    this.changed();
  }

  copySub(id) {
    if (this.locked || this.program.subs.length >= MAX_SUBS) return;
    const src = this.subById(id);
    if (!src) return;
    const n = this.nextSubNo++;
    const sub = {
      id: `sub${n}`,
      name: `${src.name || 'サブ'}コピー`.slice(0, SUB_NAME_MAX),
      color: subColorFor(`sub${n}`),
      body: this.cloneInsts(src.body.filter((i) => i.op !== 'ABORT' && i.op !== 'PAD')),
    };
    this.program.subs.push(sub);
    this.current = sub.id;
    this.changed();
  }

  toggleSplit() {
    if (this.locked || !this.allowSubs) return;
    this.split = !this.split;
    try { localStorage.setItem('nazo-program:split', this.split ? '1' : '0'); } catch (e) { /* 保存できなくても表示は切り替える */ }
    this.refreshViews();
  }

  ensureSplitSub() {
    if (this.current !== 'main' && this.subById(this.current)) this.splitSub = this.current;
    if (!this.subById(this.splitSub)) this.splitSub = (this.program.subs[0] && this.program.subs[0].id) || null;
  }

  otherRoutine() {
    return this.current === 'main' ? this.splitSub : 'main';
  }

  placePanes() {
    const split = !!(this.split && this.allowSubs && this.viewSub && this.liveStack);
    if (this.panelEl) this.panelEl.classList.toggle('is-split', split);
    if (this.rootEl) this.rootEl.classList.toggle('is-split', split);
    if (this.viewSub) this.viewSub.classList.toggle('hidden', !split);
    if (this.mirrorStack) this.mirrorStack.classList.toggle('hidden', !split);
    if (!this.slotMain || !this.liveStack) return;
    if (!split) {
      this.slotMain.appendChild(this.liveStack);
      if (this.viewMain) this.viewMain.classList.remove('is-active');
      if (this.viewSub) this.viewSub.classList.remove('is-active');
      return;
    }
    this.ensureSplitSub();
    const editingSub = this.current !== 'main';
    (editingSub ? this.slotSub : this.slotMain).appendChild(this.liveStack);
    if (this.mirrorStack) (editingSub ? this.slotMain : this.slotSub).appendChild(this.mirrorStack);
    if (this.viewMain) this.viewMain.classList.toggle('is-active', !editingSub);
    if (this.viewSub) this.viewSub.classList.toggle('is-active', editingSub);
    if (this.paneSubBtn) {
      const sub = this.subById(this.splitSub);
      this.paneSubBtn.textContent = sub ? `サブ: ${sub.name}` : 'サブ命令';
    }
    if (this.splitSubPick) {
      const subs = this.program.subs;
      this.splitSubPick.classList.toggle('hidden', subs.length <= 1);
      this.splitSubPick.innerHTML = '';
      subs.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name || s.id;
        this.splitSubPick.appendChild(opt);
      });
      if (this.splitSub) this.splitSubPick.value = this.splitSub;
    }
  }

  refreshViews() {
    this.placePanes();
    this.renderTabs();
    this.renderRoutineBar();
    this.render();
    this.renderMirror();
  }

  toggleMulti() {
    if (this.locked) return;
    this.multi = !this.multi;
    this.listEl.classList.toggle('is-picking', this.multi);
    this.updateClipButtons();
  }

  // 選んだ命令に、IF と「ここまで」、JUMP と ◆ の相手が足りなければ足す
  expandForCopy(ids) {
    const body = this.currentBody();
    const idset = new Set(ids);
    const ensure = (inst) => { if (inst && inst.op !== 'ABORT') idset.add(inst.id); };
    body.forEach((inst) => {
      if (!idset.has(inst.id)) return;
      if (inst.op === 'IF') ensure(body.find((i) => i.op === 'ENDIF' && i.id === inst.end));
      else if (inst.op === 'ENDIF') ensure(body.find((i) => i.op === 'IF' && i.end === inst.id));
      else if (inst.op === 'ELSEIF' || inst.op === 'ELSE') {
        const cond = body.find((i) => i.op === 'IF' && i.id === inst.of);
        ensure(cond);
        if (cond) ensure(body.find((i) => i.op === 'ENDIF' && i.id === cond.end));
      } else if (inst.op === 'JUMP') ensure(body.find((i) => i.op === 'LABEL' && i.id === inst.target));
    });
    return body.filter((i) => idset.has(i.id) && i.op !== 'ABORT');
  }

  copySelection() {
    if (this.locked || !this.selected.size) return;
    const list = this.expandForCopy(this.selected);
    if (!list.length) return;
    this.clip = JSON.parse(JSON.stringify(list));
    this.updateClipButtons();
  }

  pasteClip() {
    if (this.locked || !this.clip || !this.clip.length) return;
    const clones = this.cloneInsts(this.clip);
    const body = this.currentBody();
    const used = new Set(body.filter((i) => i.op === 'LABEL').map((i) => i.name));
    clones.forEach((inst) => {
      if (inst.op !== 'LABEL' || !used.has(inst.name)) {
        if (inst.op === 'LABEL') used.add(inst.name);
        return;
      }
      let n = 1;
      while (used.has(String(n))) n++;
      inst.name = String(n);
      used.add(inst.name);
    });
    const at = this.appendIndex();
    body.splice(at, 0, ...clones);
    this.selected = new Set(clones.map((i) => i.id));
    this.anchor = at;
    this.justAddedId = clones[0].id;
    this.changed();
  }

  copyIntoSub(index, subId) {
    const body = this.currentBody();
    const inst = body[index];
    if (!inst || inst.op === 'ABORT' || (subId !== 'main' && !this.subById(subId))) {
      this.render();
      return;
    }
    const ids = this.selected.has(inst.id) ? [...this.selected] : [inst.id];
    const list = this.expandForCopy(ids);
    if (!list.length) {
      this.render();
      return;
    }
    this.clip = JSON.parse(JSON.stringify(list));
    this.showRoutine(subId);
    this.pasteClip();
  }

  applyClickSelect(index, flags) {
    const body = this.currentBody();
    const inst = body[index];
    if (!inst || inst.op === 'ABORT') return;
    if (flags.shift && this.anchor != null) {
      this.selectRange(this.anchor, index);
      return;
    }
    if (flags.toggle) {
      if (this.selected.has(inst.id)) this.selected.delete(inst.id);
      else this.selected.add(inst.id);
      this.anchor = index;
      this.syncSelection();
      return;
    }
    this.selected = new Set([inst.id]);
    this.anchor = index;
    this.syncSelection();
  }

  selectRange(a, b) {
    const body = this.currentBody();
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(body.length - 1, Math.max(a, b));
    this.selected = new Set();
    for (let i = lo; i <= hi; i++) {
      if (body[i] && body[i].op !== 'ABORT') this.selected.add(body[i].id);
    }
    this.anchor = a;
    this.syncSelection();
  }

  syncSelection() {
    const body = this.currentBody();
    const live = new Set(body.map((i) => i.id));
    [...this.selected].forEach((id) => { if (!live.has(id)) this.selected.delete(id); });
    this.blocks().forEach((el, i) => {
      el.classList.toggle('is-selected', !!(body[i] && this.selected.has(body[i].id)));
    });
    this.updateClipButtons();
  }

  updateClipButtons() {
    const show = this.allowSubs;
    [this.splitBtn, this.multiBtn, this.copyBtn, this.pasteBtn].forEach((btn) => {
      if (btn) btn.classList.toggle('hidden', !show);
    });
    if (this.splitBtn) {
      this.splitBtn.disabled = this.locked;
      this.splitBtn.classList.toggle('on', !!(this.split && show));
    }
    if (this.multiBtn) {
      this.multiBtn.disabled = this.locked;
      this.multiBtn.classList.toggle('on', this.multi);
    }
    if (this.copyBtn) this.copyBtn.disabled = this.locked || this.selected.size === 0;
    if (this.pasteBtn) {
      this.pasteBtn.disabled = this.locked || !this.clip || !this.clip.length;
      const n = this.clip ? this.clip.length : 0;
      this.pasteBtn.title = n
        ? `コピーした ${n} 個を、いま開いているプログラムの末尾に貼ります`
        : 'いま開いているプログラムの末尾に貼ります。サブ命令を開いてから貼ると、そこに入ります';
    }
    if (this.noteEl) {
      this.noteEl.textContent = !show
        ? '並べ替えはドラッグ。外へドラッグすると消せます。'
        : (this.split
          ? '左はメイン、右はサブ命令です。色の枠が編集中です。もう片方をクリックすると、そちらを編集できます。'
          : '並べ替えはドラッグ。外へドラッグすると消せます。選んでコピーし、サブ命令を開いて貼り付け。サブのカードへドラッグしてもコピーできます。');
    }
    this.listEl.classList.toggle('is-picking', show && this.multi);
  }

  onListPointerDown(e) {
    if (this.locked || e.button !== 0 || this.drag) return;
    if (e.target.closest('.block, button, input, select')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const box = h('div', 'select-marquee');
    document.body.appendChild(box);
    let moved = false;
    const draw = (x1, y1, x2, y2) => {
      box.style.left = `${Math.min(x1, x2)}px`;
      box.style.top = `${Math.min(y1, y2)}px`;
      box.style.width = `${Math.abs(x2 - x1)}px`;
      box.style.height = `${Math.abs(y2 - y1)}px`;
    };
    draw(startX, startY, startX, startY);
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) moved = true;
      draw(startX, startY, ev.clientX, ev.clientY);
      if (!moved) return;
      const rect = box.getBoundingClientRect();
      const body = this.currentBody();
      const ids = [];
      this.blocks().forEach((el, i) => {
        const inst = body[i];
        if (!inst || inst.op !== 'ABORT') return;
        const r = el.getBoundingClientRect();
        const hit = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
        if (hit) ids.push(inst.id);
      });
      this.selected = new Set(ids);
      this.syncSelection();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      box.remove();
      if (!moved) {
        this.selected = new Set();
        this.anchor = null;
        this.syncSelection();
      } else if (this.selected.size) {
        this.anchor = this.currentBody().findIndex((i) => this.selected.has(i.id));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  startRangeDrag(index, e, toggleOnClick) {
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const block = hit && hit.closest('.program-list .block');
      if (!block) return;
      const idx = this.blocks().indexOf(block);
      if (idx >= 0) this.selectRange(index, idx);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) {
        this.applyClickSelect(index, {
          shift: e.shiftKey,
          toggle: toggleOnClick || e.ctrlKey || e.metaKey,
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  subAt(x, y) {
    if (!this.allowSubs) return null;
    const el = document.elementFromPoint(x, y);
    const item = el && el.closest('[data-sub]');
    return item ? item.dataset.sub : null;
  }

  removeSub(id) {
    const sub = this.subById(id);
    if (!sub) return;
    const bodies = [this.program.main, ...this.program.subs.map((s) => s.body)];
    const uses = bodies.flat().filter((i) => i.op === 'CALL' && i.sub === id).length;
    const msg = (uses
      ? `「${sub.name}」を消すと、これを呼び出している CALL（${uses}個）も消えます。`
      : `「${sub.name}」を消しますか？`) +
      '\nサブ命令は全ステージ共通なので、ほかのステージのプログラムからも消えます。';
    if (!window.confirm(msg)) return;

    this.program.main = this.program.main.filter((i) => !(i.op === 'CALL' && i.sub === id));
    this.program.subs = this.program.subs.filter((s) => s.id !== id);
    this.program.subs.forEach((s) => { s.body = s.body.filter((i) => !(i.op === 'CALL' && i.sub === id)); });
    this.current = 'main';
    this.changed();
  }

  renameSub(id, name) {
    const sub = this.subById(id);
    if (!sub) return;
    sub.name = name.slice(0, SUB_NAME_MAX);
    this.save();
    this.renderPalette();
    this.refreshViews();
  }

  // ---- 命令の生成 ----
  createInst(source, index) {
    const before = this.currentBody().slice(0, index);
    const id = this.nextId++;
    const { op } = source;
    if (op === 'MOVE') {
      const lastMove = [...before].reverse().find((i) => i.op === 'MOVE');
      return { id, op, dir: lastMove ? lastMove.dir : 'right' };
    }
    if (op === 'SCAN') return { id, op, slot: 'auto' };
    if (op === '+' || op === '-') {
      const prev = [...before].reverse().find((i) => (i.op === '+' || i.op === '-') && SLOTS.includes(i.slot));
      const slot = prev ? (SLOTS[SLOTS.indexOf(prev.slot) + 1] || prev.slot) : 'A';
      return { id, op, slot, by: 1 };
    }
    if (op === 'COPY') {
      const prev = [...before].reverse().find((i) => i.op === 'COPY' && SLOTS.includes(i.to) && (SLOTS.includes(i.from) || isCopyLiteral(i.from)));
      const next = (slot) => SLOTS[Math.min(SLOTS.indexOf(slot) + 1, SLOTS.length - 1)];
      if (!prev) return { id, op, from: 'a', to: 'A' };
      const from = SLOTS.includes(prev.from) ? next(prev.from) : prev.from;
      return { id, op, from, to: next(prev.to) };
    }
    if (op === 'CALL') return { id, op, sub: source.sub };
    return { id, op };
  }

  nextLabelName(body) {
    const used = new Set(body.filter((i) => i.op === 'LABEL').map((i) => i.name));
    let n = 1;
    while (used.has(String(n))) n++;
    return String(n);
  }

  insert(source, index) {
    const body = this.currentBody();
    if (source.op === 'JUMP') {
      // JUMP は ◆ とセットで置く。◆ は直前の命令の上に置き、その命令をくり返す形にする
      const label = { id: this.nextId++, op: 'LABEL', name: this.nextLabelName(body) };
      const jump = { id: this.nextId++, op: 'JUMP', target: label.id };
      body.splice(index, 0, jump);
      body.splice(Math.max(0, index - 1), 0, label);
      this.justAddedId = jump.id;
    } else if (source.op === 'IF') {
      // IF は「ここまで」とセットで置く。すぐ下に命令があれば、それを囲む形にする
      const end = { id: this.nextId++, op: 'ENDIF' };
      const cond = { id: this.nextId++, op: 'IF', conds: [{ cmp: 'eq', ch: null, slot: 'A' }], join: 'and', end: end.id };
      const next = body[index];
      body.splice(index, 0, cond);
      body.splice(next && !isMarker(next) ? index + 2 : index + 1, 0, end);
      this.justAddedId = cond.id;
    } else {
      const inst = this.createInst(source, index);
      body.splice(index, 0, inst);
      this.justAddedId = inst.id;
    }
    this.changed();
  }

  // IF のかたまりに ELSE IF / ELSE を足す。ELSE IF は ELSE の前、ELSE は「IF ここまで」の前に入る
  addBranch(cond, op) {
    const body = this.currentBody();
    const endIdx = body.findIndex((i) => i.op === 'ENDIF' && i.id === cond.end);
    const elseIdx = body.findIndex((i) => i.op === 'ELSE' && i.of === cond.id);
    if (endIdx < 0 || (op === 'ELSE' && elseIdx >= 0)) return;
    const item = op === 'ELSE'
      ? { id: this.nextId++, op, of: cond.id }
      : { id: this.nextId++, op, of: cond.id, conds: [{ cmp: 'eq', ch: null, slot: 'A' }], join: 'and' };
    body.splice(op === 'ELSEIF' && elseIdx >= 0 ? elseIdx : endIdx, 0, item);
    this.justAddedId = item.id;
    this.changed();
  }

  // クリックで追加する位置。最後が中身の空っぽな IF / ELSE IF / ELSE なら、その中に入れる
  appendIndex() {
    const body = this.currentBody();
    const last = body[body.length - 1];
    const prev = body[body.length - 2];
    if (!last || last.op !== 'ENDIF' || !prev) return body.length;
    const ifId = prev.op === 'IF' ? prev.id : (prev.op === 'ELSEIF' || prev.op === 'ELSE') ? prev.of : null;
    const owner = body.find((i) => i.op === 'IF' && i.id === ifId);
    return owner && owner.end === last.id ? body.length - 1 : body.length;
  }

  // ◆ を消すとそこへ飛ぶ JUMP も消え、JUMP を消すと使われなくなった ◆ も消える。
  // IF と「ここまで」は、どちらを消してももう片方も消える（中の命令は残る）
  removeAt(index) {
    const body = this.currentBody();
    if (body[index] && body[index].op === 'ABORT') return;
    const [item] = body.splice(index, 1);
    const drop = (pred) => {
      for (let i = body.length - 1; i >= 0; i--) if (pred(body[i])) body.splice(i, 1);
    };
    const dropBranches = (ifId) => drop((i) => (i.op === 'ELSEIF' || i.op === 'ELSE') && i.of === ifId);
    if (item.op === 'IF') {
      drop((i) => i.op === 'ENDIF' && i.id === item.end);
      dropBranches(item.id);
    } else if (item.op === 'ENDIF') {
      body.filter((i) => i.op === 'IF' && i.end === item.id).forEach((i) => dropBranches(i.id));
      drop((i) => i.op === 'IF' && i.end === item.id);
    } else if (item.op === 'LABEL') {
      drop((i) => i.op === 'JUMP' && i.target === item.id);
    } else if (item.op === 'JUMP' && !body.some((i) => i.op === 'JUMP' && i.target === item.target)) {
      drop((i) => i.op === 'LABEL' && i.id === item.target);
    }
  }

  clear() {
    if (this.current === 'main' && this.fixedAbortLines) {
      this.program.main = [];
      this.changed();
      return;
    }
    const body = this.currentBody();
    if (!body.length) return;
    body.length = 0;
    this.changed();
  }

  // ---- 描画 ----
  renderAll() {
    if (this.current !== 'main' && !this.subById(this.current)) this.current = 'main';
    this.ensureSplitSub();
    this.renderPalette();
    this.refreshViews();
  }

  renderPalette() {
    this.paletteEl.innerHTML = '';
    this.ops.forEach((op) => {
      const item = h('div', `block palette-item block-${OP_INFO[op].cls}`);
      item.append(h('span', 'op-name', opLabel(op)), h('span', 'op-desc', OP_INFO[op].desc), h('span', 'add-mark', '＋'));
      item.title = 'ドラッグ または クリックで追加';
      item.addEventListener('pointerdown', (e) => this.handleDown(e, { kind: 'palette', op }, item));
      this.paletteEl.appendChild(item);
    });

    this.subSectionEl.classList.toggle('hidden', !this.allowSubs);
    this.subCountEl.textContent = `${this.program.subs.length}/${MAX_SUBS}`;
    this.subPaletteEl.innerHTML = '';
    if (!this.program.subs.length) {
      this.subPaletteEl.appendChild(h('p', 'panel-note', 'よく使う命令のかたまりを、1つの命令にまとめられます。作ったサブ命令は、ほかのステージでも使えます。'));
    }
    this.program.subs.forEach((sub) => {
      const item = h('div', 'block palette-item block-call');
      item.dataset.sub = sub.id;
      item.style.setProperty('--sub-color', sub.color);
      const edit = h('button', 'open-btn', '編集');
      edit.type = 'button';
      edit.title = `「${sub.name}」の中身を編集`;
      edit.addEventListener('click', () => this.showRoutine(sub.id));
      const copy = h('button', 'open-btn', 'コピー');
      copy.type = 'button';
      copy.title = `「${sub.name}」を複製して、新しいサブ命令にします`;
      copy.addEventListener('click', () => this.copySub(sub.id));
      item.append(h('span', 'op-name', 'CALL'), h('span', 'call-name', sub.name), edit, copy);
      const sketch = subSketch(sub.body);
      if (sketch) {
        const line = h('span', 'sub-sketch', sketch);
        line.title = sketch;
        item.appendChild(line);
      }
      item.title = `「${sub.name}」を呼び出す命令を追加`;
      item.addEventListener('pointerdown', (e) => this.handleDown(e, { kind: 'palette', op: 'CALL', sub: sub.id }, item));
      this.subPaletteEl.appendChild(item);
    });
    this.syncSubButtons();

    this.lockedEl.innerHTML = '';
    const lockedTitle = this.lockedEl.previousElementSibling;
    if (lockedTitle) lockedTitle.classList.toggle('hidden', this.lockedOps.length === 0);
    this.lockedOps.forEach((op) => {
      const item = h('div', 'block block-locked');
      item.append(h('span', 'op-name', opLabel(op)), h('span', 'lock-tag', 'あとで'));
      item.title = `${OP_INFO[op].desc}（あとのステージで登場）`;
      this.lockedEl.appendChild(item);
    });
  }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    const tab = (id, label, color) => {
      const b = h('button', 'routine-tab' + (id === this.current ? ' on' : ''), label);
      b.type = 'button';
      if (color) b.style.setProperty('--tab-color', color);
      b.addEventListener('click', () => this.showRoutine(id));
      this.tabsEl.appendChild(b);
    };
    tab('main', 'メイン');
    const sub = this.subById(this.current);
    if (sub) tab(sub.id, `サブ命令: ${sub.name || '（名前なし）'}`, sub.color);
  }

  renderRoutineBar() {
    const bar = this.routineBarEl;
    bar.innerHTML = '';
    const sub = this.subById(this.current);
    bar.classList.toggle('is-sub', !!sub);
    if (!sub) {
      bar.appendChild(h('span', 'routine-note', '▶ 再生すると、ここが上から順に動きます。'));
      return;
    }
    bar.style.setProperty('--tab-color', sub.color);

    const input = h('input', 'routine-name');
    input.type = 'text';
    input.value = sub.name;
    input.maxLength = SUB_NAME_MAX;
    input.placeholder = '名前';
    input.disabled = this.locked;
    input.addEventListener('input', () => this.renameSub(sub.id, input.value));
    input.addEventListener('change', () => {
      if (!input.value.trim()) {
        input.value = sub.id.replace('sub', 'サブ');
        this.renameSub(sub.id, input.value);
      }
    });

    const copy = h('button', 'btn btn-small btn-new-sub', 'コピー');
    copy.type = 'button';
    copy.title = 'このサブ命令を複製して、新しいサブ命令にします';
    copy.disabled = this.locked || this.program.subs.length >= MAX_SUBS;
    copy.addEventListener('click', () => this.copySub(sub.id));

    const del = h('button', 'btn btn-small btn-danger', '消す');
    del.type = 'button';
    del.disabled = this.locked;
    del.addEventListener('click', () => this.removeSub(sub.id));

    const label = h('label', 'routine-label', '名前');
    label.appendChild(input);
    bar.append(label, copy, del, h('span', 'routine-note', 'CALL で呼ばれると、ここを上から実行して元の場所へ戻ります。全ステージ共通で保存されます。'));
  }

  render() {
    this.paintList(this.listEl, this.current, false);
  }

  renderMirror() {
    if (!this.mirrorList || !this.mirrorBar) return;
    if (!(this.split && this.allowSubs)) return;
    const id = this.otherRoutine();
    this.mirrorRoutine = id;
    if (!id) {
      this.mirrorBar.textContent = '＋ 作る でサブ命令を作れます';
      this.mirrorList.innerHTML = '';
      const hint = h('li', 'empty-hint');
      hint.innerHTML = 'サブ命令を作ると<br>ここに出ます';
      this.mirrorList.appendChild(hint);
      return;
    }
    this.mirrorBar.textContent = 'クリックで、こちらを編集';
    this.paintList(this.mirrorList, id, true);
  }

  paintList(listEl, routineId, mirror) {
    const body = routineBody(this.program, routineId);
    const keepScroll = listEl.scrollTop;
    const atBottom = keepScroll > 0 && keepScroll + listEl.clientHeight >= listEl.scrollHeight - 12;
    this.buildingMirror = mirror;
    if (!mirror) {
      this.fieldCommits = [];
      const live = new Set(body.map((i) => i.id));
      [...this.selected].forEach((id) => { if (!live.has(id)) this.selected.delete(id); });
    }
    const sub = routineId === 'main' ? null : this.subById(routineId);
    listEl.innerHTML = '';
    listEl.style.setProperty('--routine-color', sub ? sub.color : 'var(--line)');
    listEl.classList.toggle('is-sub', !!sub);
    listEl.classList.toggle('is-mirror', mirror);
    if (!body.length) {
      const hint = h('li', 'empty-hint');
      hint.innerHTML = mirror ? 'まだ命令がありません' : 'ここに命令を<br>ドラッグしてね';
      listEl.appendChild(hint);
    }
    // IF と「ここまで」の間にある命令は、入れ子の深さだけ字下げする
    // ELSE IF / ELSE は自分の IF と同じ深さに戻す
    const ranges = body
      .map((inst, i) => (inst.op === 'IF'
        ? { s: i, e: body.findIndex((x) => x.op === 'ENDIF' && x.id === inst.end), id: inst.id }
        : null))
      .filter(Boolean);
    const isBranch = (inst) => inst.op === 'ELSEIF' || inst.op === 'ELSE';
    let lineNo = 0;
    body.forEach((inst, i) => {
      if (!isMarker(inst)) lineNo++;
      const li = this.blockEl(inst, i, lineNo);
      const depth = ranges.filter((r) => r.s < i && i < r.e && !(isBranch(inst) && inst.of === r.id)).length;
      if (depth) {
        li.classList.add('in-if');
        li.style.setProperty('--depth', depth);
      }
      let broken = ranges.some((r) => r.e < r.s && (i === r.s || i === r.e));
      if (isBranch(inst)) {
        const own = ranges.find((r) => r.id === inst.of);
        broken = broken || !own || !(own.s < i && i < own.e) ||
          (inst.op === 'ELSE' && body.some((x, k) => k > i && x.op === 'ELSEIF' && x.of === inst.of));
      }
      if (broken) li.classList.add('if-broken');
      listEl.appendChild(li);
    });
    this.buildingMirror = false;
    if (!mirror) this.justAddedId = null;
    this.drawArrows(listEl, body);
    if (!mirror) this.updateClipButtons();
    const restoreScroll = () => {
      listEl.scrollTop = atBottom ? listEl.scrollHeight : keepScroll;
    };
    restoreScroll();
    requestAnimationFrame(restoreScroll);
  }

  // IF の範囲と JUMP の矢印を、リスト全体にかぶせた1枚の図に描く。
  // 命令ごとの棒だと、隙間や入れ子のところで線が切れる。
  drawArrows(listEl = this.listEl, body = this.currentBody()) {
    listEl.querySelector('.jump-arrows')?.remove();
    const blocks = [...listEl.querySelectorAll('.block')];
    if (!body.length || blocks.length !== body.length) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('jump-arrows');
    const width = Math.max(listEl.clientWidth, 1);
    const height = Math.max(listEl.scrollHeight, 1);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('overflow', 'visible');
    const listBox = listEl.getBoundingClientRect();
    const originX = listBox.left + listEl.clientLeft - listEl.scrollLeft;
    const originY = listBox.top + listEl.clientTop - listEl.scrollTop;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - originX,
        top: r.top - originY,
        right: r.right - originX,
        bottom: r.bottom - originY,
        cx: (r.left + r.right) / 2 - originX,
        cy: (r.top + r.bottom) / 2 - originY,
        mid: (r.top + r.bottom) / 2 - originY,
      };
    };
    const add = (d, cls) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      if (cls) path.classList.add(cls);
      svg.appendChild(path);
    };
    body.forEach((inst, idx) => {
      if (inst.op !== 'IF') return;
      const end = body.findIndex((x) => x.op === 'ENDIF' && x.id === inst.end);
      const from = blocks[idx];
      const to = blocks[end];
      if (!from || !to || end <= idx) return;
      const a = box(from);
      const b = box(to);
      const x = Math.min(a.left, b.left) - 12;
      if (b.top - a.bottom < 2 || x < 2) return;
      add(`M ${a.left - 1} ${a.bottom} H ${x} V ${b.top} H ${b.left - 1}`, 'if-rail');
    });

    let jumpNo = 0;
    body.forEach((inst, idx) => {
      if (inst.op !== 'JUMP') return;
      const from = blocks[idx];
      const to = blocks[body.findIndex((i) => i.id === inst.target)];
      if (!from || !to) return;
      const a = box(from);
      const b = box(to);
      const lane = Math.max(4, Math.min(a.left, b.left) - 18 - (jumpNo % 3) * 6);
      jumpNo += 1;
      const r = Math.min(8, Math.abs(b.mid - a.mid) / 2, Math.abs(a.left - lane), Math.abs(b.left - lane));
      const s = b.mid > a.mid ? 1 : -1;
      const d = Math.abs(b.mid - a.mid) < 2 || r < 1
        ? `M ${a.left - 1} ${a.mid} H ${b.left - 7}`
        : [
          `M ${a.left - 1} ${a.mid}`,
          `H ${lane + r}`,
          `Q ${lane} ${a.mid} ${lane} ${a.mid + s * r}`,
          `V ${b.mid - s * r}`,
          `Q ${lane} ${b.mid} ${lane + r} ${b.mid}`,
          `H ${b.left - 7}`,
        ].join(' ');
      add(d);
      const head = document.createElementNS(SVG_NS, 'polygon');
      const tip = b.left - 1;
      head.setAttribute('points', `${tip - 8},${b.mid - 4.5} ${tip},${b.mid} ${tip - 8},${b.mid + 4.5}`);
      svg.appendChild(head);
    });
    listEl.appendChild(svg);
  }

  // 「[記憶] が [文字] と同じ / と違う」を条件の数だけ並べ、2つ以上なら「かつ / または」でつなぐ
  condEditor(inst) {
    const wrap = h('div', 'if-conds');
    inst.conds.forEach((cond, k) => {
      if (k > 0) {
        const current = cond.join === 'or' || cond.join === 'and' ? cond.join : (inst.join === 'or' ? 'or' : 'and');
        const join = h('button', 'join-btn', current === 'or' ? 'または（OR）' : 'かつ（AND）');
        join.type = 'button';
        join.title = 'このつなぎだけを切り替える。上の条件から順に組み合わせる';
        join.addEventListener('click', () => {
          if (this.locked) return;
          cond.join = current === 'or' ? 'and' : 'or';
          this.changed();
        });
        wrap.appendChild(join);
      }
      const row = h('div', 'cond-row');
      const slots = h('div', 'cond-slots');
      SLOTS.forEach((s) => {
        const btn = h('button', 'slot-btn' + (cond.slot === s ? ' on' : ''), s);
        btn.type = 'button';
        btn.title = `${s} に入っている値と比べる`;
        btn.addEventListener('click', () => {
          if (this.locked || cond.slot === s) return;
          cond.slot = s;
          this.changed();
        });
        slots.appendChild(btn);
      });
      row.append(slots, h('span', 'if-label', 'が'));

      const input = h('input', 'if-char');
      input.type = 'text';
      input.value = cond.ch ?? '';
      input.placeholder = '文字';
      input.title = 'ひらがな1文字、または 0〜9。２ と 2 は同じ。空欄は「何も入っていない」';
      input.disabled = this.locked;
      input.autocomplete = 'off';
      let pending = false;
      const apply = (render) => {
        const ch = normalizeChar(input.value);
        const prev = cond.ch ?? null;
        if (ch !== prev) {
          cond.ch = ch;
          pending = true;
          if (!render) this.save();
        }
        if ((ch ?? '') !== input.value) input.value = ch ?? '';
        if (render && pending) {
          pending = false;
          this.changed();
        }
      };
      if (!this.buildingMirror) this.fieldCommits.push(() => apply(false));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) input.blur(); });
      input.addEventListener('input', (e) => { if (!e.isComposing) apply(false); });
      input.addEventListener('compositionend', () => apply(false));
      input.addEventListener('change', () => apply(true));
      row.appendChild(input);

      const pad = h('div', 'cmppad');
      [['eq', 'と同じ'], ['ne', 'と違う']].forEach(([cmp, label]) => {
        const btn = h('button', 'cmp-btn' + (cond.cmp === cmp ? ' on' : ''), label);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          if (this.locked || cond.cmp === cmp) return;
          cond.cmp = cmp;
          this.changed();
        });
        pad.appendChild(btn);
      });
      row.appendChild(pad);

      if (inst.conds.length > 1) {
        const del = h('button', 'cond-del', '×');
        del.type = 'button';
        del.title = 'この条件を消す';
        del.addEventListener('click', () => {
          if (this.locked) return;
          inst.conds.splice(k, 1);
          this.changed();
        });
        row.appendChild(del);
      }
      wrap.appendChild(row);
    });
    return wrap;
  }

  isHere(loc, index) {
    return !!loc && loc.routine === this.current && loc.pc === index;
  }

  blockEl(inst, index, lineNo) {
    const li = h('li', `block block-${OP_INFO[inst.op].cls}`);
    if (this.selected.has(inst.id)) li.classList.add('is-selected');
    if (this.isHere(this.activeLoc, index)) li.classList.add('active');
    if (this.isHere(this.errorLoc, index)) li.classList.add('error');
    if (inst.id === this.justAddedId) li.classList.add('just-added');

    if (inst.op === 'LABEL') {
      li.append(h('span', 'label-mark', `◆${inst.name}`), h('span', 'label-text', 'ここへ飛ぶ'));
    } else if (inst.op === 'ENDIF') {
      li.append(h('span', 'endif-mark', 'IF ここまで'), h('span', 'label-text', 'ドラッグで範囲を決めよう'));
    } else if (inst.op === 'ELSE') {
      li.append(h('span', 'endif-mark', 'ELSE'), h('span', 'label-text', 'どれにも当てはまらなかったとき'));
    } else if (inst.op === 'ABORT') {
      li.classList.add('block-fixed');
      li.append(
        h('span', 'line-no', lineNo),
        h('span', 'op-name', 'あきらめる'),
      );
    } else {
      li.append(h('span', 'line-no', lineNo), h('span', 'op-name', opLabel(inst.op)));
    }

    if (inst.op === 'IF' || inst.op === 'ELSEIF') {
      li.appendChild(this.condEditor(inst));
      const tools = h('div', 'if-tools');
      const tool = (label, title, onClick, disabled = false) => {
        const btn = h('button', 'if-tool', label);
        btn.type = 'button';
        btn.title = title;
        btn.disabled = disabled;
        btn.addEventListener('click', () => { if (!this.locked) onClick(); });
        tools.appendChild(btn);
      };
      tool('＋ 条件', '条件を増やす（50個まで。かつ / または でつなぐ）', () => {
        inst.conds.push({ cmp: 'eq', ch: null, slot: 'A', join: 'and' });
        this.changed();
      }, inst.conds.length >= MAX_CONDS);
      if (inst.op === 'IF' && this.allowElse) {
        const body = this.currentBody();
        tool('＋ ELSE IF', '当てはまらなかったときに、別の条件を調べる', () => this.addBranch(inst, 'ELSEIF'));
        tool('＋ ELSE', 'どれにも当てはまらなかったときの命令を書く', () => this.addBranch(inst, 'ELSE'),
          body.some((i) => i.op === 'ELSE' && i.of === inst.id));
      }
      li.appendChild(tools);
    } else if (inst.op === 'JUMP') {
      li.appendChild(h('span', 'jump-to', '→'));
      const pad = h('div', 'labelpad');
      this.currentBody().filter((i) => i.op === 'LABEL').forEach((label) => {
        const btn = h('button', 'label-btn' + (inst.target === label.id ? ' on' : ''), `◆${label.name}`);
        btn.type = 'button';
        btn.title = `◆${label.name} へ飛ぶ`;
        btn.addEventListener('click', () => {
          if (this.locked || inst.target === label.id) return;
          const old = inst.target;
          inst.target = label.id;
          const body = this.currentBody();
          if (!body.some((i) => i.op === 'JUMP' && i.target === old)) {
            body.splice(body.findIndex((i) => i.id === old), 1);
          }
          this.changed();
        });
        pad.appendChild(btn);
      });
      li.appendChild(pad);
    } else if (inst.op === 'MOVE') {
      const pad = h('div', 'dirpad');
      DIR_ORDER.forEach((dir) => {
        const btn = h('button', 'dir-btn' + (inst.dir === dir ? ' on' : ''), DIRS[dir].arrow);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          if (this.locked || inst.dir === dir) return;
          inst.dir = dir;
          this.changed();
        });
        pad.appendChild(btn);
      });
      const goalBtn = h('button', 'dir-btn dir-goal' + (inst.dir === 'goal' ? ' on' : ''), 'ゴールまで進む');
      goalBtn.type = 'button';
      goalBtn.title = 'ゴールに着くまで、この命令で進み続ける';
      goalBtn.addEventListener('click', () => {
        if (this.locked || inst.dir === 'goal') return;
        inst.dir = 'goal';
        this.changed();
      });
      pad.appendChild(goalBtn);
      li.appendChild(pad);
    } else if (inst.op === 'SCAN') {
      const slotBtn = (slot, label, cls) => {
        const btn = h('button', cls + (inst.slot === slot ? ' on' : ''), label);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          if (this.locked || inst.slot === slot) return;
          inst.slot = slot;
          this.changed();
        });
        return btn;
      };
      const auto = slotBtn('auto', '自動\n格納', 'slot-btn slot-auto');
      auto.title = '自動格納: A→B→C→a→b→c の順に、空いている場所へ記憶';
      const pad = h('div', 'slotpad');
      SLOTS.forEach((s) => pad.appendChild(slotBtn(s, s, 'slot-btn')));
      li.append(auto, pad);
    } else if (inst.op === '+' || inst.op === '-') {
      const forward = inst.op === '+';
      const verb = forward ? '足す' : '引く';
      const particle = forward ? 'に' : 'から';
      const slotBtn = (slot, label, cls, on, title, onClick) => {
        const btn = h('button', cls + (on ? ' on' : ''), label);
        btn.type = 'button';
        btn.title = title;
        btn.addEventListener('click', () => {
          if (this.locked || on) return;
          onClick();
        });
        return btn;
      };
      const pad = h('div', 'slotpad');
      SLOTS.forEach((s) => pad.appendChild(slotBtn(
        s, s, 'slot-btn', inst.slot === s,
        `${s} ${particle} X を${verb}。数字なら計算、ひらがなならその数だけ五十音で動く`,
        () => { inst.slot = s; this.changed(); },
      )));
      const useNum = typeof inst.by === 'number';
      const src = h('div', 'slotpad');
      let pickingSlot = false;
      SLOTS.forEach((s) => src.appendChild(slotBtn(
        s, s, 'slot-btn', inst.by === s,
        `X に ${s} を使う。スキャンした数字なら、その数だけ足す・引く`,
        () => { inst.by = s; this.changed(); },
      )));
      src.appendChild(slotBtn(
        'N', 'N', 'slot-btn', useNum,
        'X を数字にする。選ぶと入力欄が出る。２と2は同じ',
        () => { inst.by = 1; this.changed(); },
      ));
      src.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('pointerdown', () => {
          pickingSlot = true;
          const stop = () => { pickingSlot = false; };
          window.addEventListener('pointerup', stop, { once: true });
          window.addEventListener('pointercancel', stop, { once: true });
        });
      });
      const parts = [pad, h('span', 'plus-label', particle), src];
      if (useNum) {
        const num = h('input', 'plus-num');
        num.type = 'text';
        num.inputMode = 'numeric';
        num.placeholder = '数字';
        num.title = 'N の数字。整数。２と2は同じ。ーも使える';
        num.value = String(inst.by);
        num.disabled = this.locked;
        num.autocomplete = 'off';
        const commitNum = (final) => {
          if (pickingSlot || typeof inst.by !== 'number') return;
          const n = parseArithLiteral(num.value);
          if (n == null) {
            if (final) num.value = String(inst.by);
            return;
          }
          if (n !== inst.by) {
            inst.by = n;
            this.save();
          }
          if (num.value !== String(n)) num.value = String(n);
        };
        num.addEventListener('input', (e) => { if (!e.isComposing) commitNum(false); });
        num.addEventListener('compositionend', () => commitNum(false));
        num.addEventListener('change', () => commitNum(true));
        if (!this.buildingMirror) this.fieldCommits.push(() => commitNum(true));
        parts.push(num);
      }
      parts.push(h('span', 'plus-label', `を${verb}`));
      li.append(...parts);
    } else if (inst.op === 'COPY') {
      const slotBtn = (slot, on, title, onClick) => {
        const btn = h('button', 'slot-btn' + (on ? ' on' : ''), slot);
        btn.type = 'button';
        btn.title = title;
        btn.addEventListener('click', () => {
          if (this.locked || on) return;
          onClick();
        });
        return btn;
      };
      const to = h('div', 'slotpad');
      SLOTS.forEach((s) => to.appendChild(slotBtn(
        s, inst.to === s, `${s} にコピーする`,
        () => { inst.to = s; this.changed(); },
      )));
      const from = h('div', 'slotpad');
      const useLiteral = isCopyLiteral(inst.from);
      SLOTS.forEach((s) => from.appendChild(slotBtn(
        s, inst.from === s, `${s} の中身をコピーする`,
        () => { inst.from = s; this.changed(); },
      )));
      from.appendChild(slotBtn(
        'X', useLiteral, 'X を、入力した文字か空欄にする。空欄は削除',
        () => { inst.from = 'あ'; this.changed(); },
      ));
      const parts = [to, h('span', 'copy-label', 'に'), from];
      if (useLiteral) {
        const input = h('input', 'plus-num copy-char');
        input.type = 'text';
        input.placeholder = '空';
        input.title = 'X の文字。ひらがな1文字か、0から9。空欄にすると、コピー先が空になる';
        input.value = inst.from == null ? '' : String(inst.from);
        input.disabled = this.locked;
        input.autocomplete = 'off';
        const commit = (final) => {
          const raw = String(input.value ?? '').replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim();
          if (!raw) {
            input.value = '';
            if (inst.from !== null) {
              inst.from = null;
              this.save();
            }
            return;
          }
          const next = normalizeCopyLiteral(raw);
          if (next == null) {
            if (final) input.value = inst.from == null ? '' : String(inst.from);
            return;
          }
          input.value = String(next);
          if (next === inst.from) return;
          inst.from = next;
          this.save();
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) input.blur(); });
        input.addEventListener('input', (e) => { if (!e.isComposing) commit(false); });
        input.addEventListener('compositionend', () => commit(true));
        input.addEventListener('change', () => commit(true));
        if (!this.buildingMirror) this.fieldCommits.push(() => commit(true));
        parts.push(input);
      }
      parts.push(h('span', 'copy-label', 'をコピー'));
      li.append(...parts);
    } else if (inst.op === 'CALL') {
      const sub = this.subById(inst.sub);
      li.style.setProperty('--sub-color', sub.color);
      li.appendChild(h('span', 'call-name', sub.name));
      const open = h('button', 'open-btn', '開く');
      open.type = 'button';
      open.title = `「${sub.name}」の中身を見る`;
      open.addEventListener('click', () => this.showRoutine(sub.id));
      li.appendChild(open);
    }

    if (inst.op !== 'ABORT') {
      const del = h('button', 'del-btn', '×');
      del.type = 'button';
      del.title = '消す';
      del.disabled = this.buildingMirror;
      if (!this.buildingMirror) {
        del.addEventListener('click', () => {
          if (this.locked) return;
          this.removeAt(index);
          this.changed();
        });
        li.addEventListener('pointerdown', (e) => this.handleDown(e, { kind: 'program', index }, li));
      }
      li.appendChild(del);
    } else {
      li.title = 'この行は消せないし、動かせないよ';
    }
    return li;
  }

  blocks() {
    return [...this.listEl.querySelectorAll('.block')];
  }

  setLocked(locked) {
    this.locked = locked;
    this.rootEl.classList.toggle('is-locked', locked);
    this.routineBarEl.querySelectorAll('input, button').forEach((el) => { el.disabled = locked; });
    this.syncSubButtons();
    this.updateClipButtons();
  }

  syncSubButtons() {
    const full = this.program.subs.length >= MAX_SUBS;
    const hasMain = this.program.main.some((i) => i.op !== 'ABORT' && i.op !== 'PAD');
    this.newSubBtn.disabled = this.locked || full;
    this.copyMainBtn.disabled = this.locked || full || !hasMain;
    this.subPaletteEl.querySelectorAll('.open-btn').forEach((b) => {
      if (b.textContent === 'コピー') b.disabled = this.locked || full;
    });
  }

  // 実行中の場所がほかのルーチンなら、そのタブに切り替えて表示する
  highlight(loc, cls) {
    if (loc && loc.routine !== this.current) {
      this.current = loc.routine;
      this.refreshViews();
      this.onViewChange(loc.routine);
    }
    const blocks = this.blocks();
    blocks.forEach((b, j) => b.classList.toggle(cls, this.isHere(loc, j)));
    if (loc && blocks[loc.pc]) this.scrollToBlock(blocks[loc.pc]);
  }

  setActive(loc, ev = null) {
    this.activeLoc = loc;
    this.highlight(loc, 'active');
    const isIf = ev && ev.type === 'if';
    this.blocks().forEach((b, j) => {
      const here = isIf && this.isHere(loc, j);
      b.classList.toggle('if-true', here && ev.result);
      b.classList.toggle('if-false', here && !ev.result);
      if (here && !ev.result && ev.note) b.dataset.ifNote = ` （${ev.note}）`;
      else delete b.dataset.ifNote;
    });
  }

  markError(loc) {
    this.errorLoc = loc;
    this.highlight(loc, 'error');
  }

  scrollToBlock(b) {
    const list = this.listEl;
    const top = b.offsetTop;
    const bottom = top + b.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }

  flashEmpty() {
    this.showRoutine('main');
    restartAnim(this.listEl, 'nudge');
  }

  // ---- ドラッグ＆ドロップ ----
  handleDown(e, source, el) {
    if (this.locked || e.button !== 0 || e.target.closest('button, select, input')) return;
    if (source.kind === 'program' && (this.multi || e.shiftKey)) {
      e.preventDefault();
      this.startRangeDrag(source.index, e, this.multi && !e.shiftKey);
      return;
    }
    e.preventDefault();
    this.drag = {
      source, el, startX: e.clientX, startY: e.clientY, started: false, index: null, over: false, subId: null, mirrorDrop: false,
      shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey,
    };
    window.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleCancel);
  }

  beginDrag() {
    const d = this.drag;
    const r = d.el.getBoundingClientRect();
    d.offX = d.startX - r.left;
    d.offY = d.startY - r.top;

    const ghost = d.el.cloneNode(true);
    ghost.classList.remove('active', 'error', 'just-added');
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${r.width}px`;
    document.body.appendChild(ghost);
    d.ghost = ghost;

    if (d.source.kind === 'program') d.el.classList.add('dragging');
    document.body.classList.add('is-dragging');

    const listRect = this.listEl.getBoundingClientRect();
    const st = this.listEl.scrollTop;
    d.blockEls = this.blocks().filter((b) => !b.classList.contains('dragging'));
    d.mids = d.blockEls.map((b) => {
      const br = b.getBoundingClientRect();
      return br.top - listRect.top + st + br.height / 2;
    });

    if (d.source.kind === 'program') {
      this.placeholder.style.height = `${r.height}px`;
      this.placePlaceholder(d.source.index);
    } else {
      this.placeholder.style.height = '';
    }
    d.started = true;
  }

  placePlaceholder(idx) {
    const d = this.drag;
    if (d.index === idx && this.placeholder.isConnected) return;
    if (idx < d.blockEls.length) this.listEl.insertBefore(this.placeholder, d.blockEls[idx]);
    else this.listEl.appendChild(this.placeholder);
    d.index = idx;
    d.phSize = this.placeholder.offsetHeight + LIST_GAP;
  }

  removePlaceholder() {
    this.placeholder.remove();
    if (this.drag) this.drag.index = null;
  }

  // プレースホルダーで下にずれた分を考慮して、挿入位置を決める
  computeIndex(clientY) {
    const d = this.drag;
    const lr = this.listEl.getBoundingClientRect();
    const y = clientY - lr.top + this.listEl.scrollTop;
    const k = d.index == null ? Infinity : d.index;
    for (let i = 0; i < d.mids.length; i++) {
      if (y < d.mids[i] + (i >= k ? d.phSize : 0)) return i;
    }
    return d.mids.length;
  }

  isOverPanel(x, y) {
    const r = this.panelEl.getBoundingClientRect();
    const m = 24;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  }

  handleMove(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      this.beginDrag();
    }
    d.ghost.style.transform = `translate(${e.clientX - d.offX}px, ${e.clientY - d.offY}px) rotate(2deg)`;

    d.subId = d.source.kind === 'program' ? this.subAt(e.clientX, e.clientY) : null;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const other = this.split && this.allowSubs ? (this.current === 'main' ? this.viewSub : this.viewMain) : null;
    d.mirrorDrop = !!(hit && other && !other.classList.contains('hidden') && other.contains(hit));
    if (d.subId || d.mirrorDrop) {
      this.removePlaceholder();
      d.over = false;
      d.ghost.classList.remove('will-delete');
      d.ghost.classList.add('will-copy');
      return;
    }
    d.ghost.classList.remove('will-copy');
    d.over = this.isOverPanel(e.clientX, e.clientY);
    if (d.over) {
      this.placePlaceholder(this.computeIndex(e.clientY));
      const lr = this.listEl.getBoundingClientRect();
      if (e.clientY < lr.top + 30) this.listEl.scrollTop -= 10;
      else if (e.clientY > lr.bottom - 30) this.listEl.scrollTop += 10;
    } else {
      this.removePlaceholder();
    }
    d.ghost.classList.toggle('will-delete', !d.over && d.source.kind === 'program');
  }

  endListeners() {
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('pointercancel', this.handleCancel);
  }

  cleanupDrag() {
    const d = this.drag;
    if (d && d.ghost) d.ghost.remove();
    this.placeholder.remove();
    document.body.classList.remove('is-dragging');
    this.drag = null;
  }

  handleCancel() {
    this.endListeners();
    this.cleanupDrag();
    this.render();
  }

  handleUp() {
    this.endListeners();
    const d = this.drag;
    if (!d) return;

    if (!d.started) {
      this.drag = null;
      if (d.source.kind === 'palette') this.insert(d.source, this.appendIndex());
      else this.applyClickSelect(d.source.index, { shift: d.shift, toggle: d.toggle });
      return;
    }

    const { source, over, index, subId, mirrorDrop } = d;
    this.cleanupDrag();
    if (subId && source.kind === 'program') {
      this.copyIntoSub(source.index, subId);
      return;
    }
    if (mirrorDrop) {
      const dest = this.otherRoutine();
      if (!dest) {
        this.render();
        return;
      }
      if (source.kind === 'program') this.copyIntoSub(source.index, dest);
      else {
        this.showRoutine(dest);
        this.insert(source, this.appendIndex());
      }
      return;
    }
    const body = this.currentBody();

    if (over && index != null) {
      if (source.kind === 'palette') {
        this.insert(source, index);
      } else {
        const [item] = body.splice(source.index, 1);
        body.splice(index, 0, item);
        if (index !== source.index) this.changed();
        else this.render();
      }
    } else if (source.kind === 'program') {
      this.removeAt(source.index);
      this.changed();
    }
  }
}
