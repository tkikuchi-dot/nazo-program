'use strict';

// チュートリアルの案内役の猫の先生。ロボットは何も知らないので、教えるのは先生の役目
function buildCatTeacher() {
  const cat = h('div', 'cat');
  const head = h('div', 'cat-head');
  head.append(
    h('span', 'cat-eye cat-eye-l'), h('span', 'cat-eye cat-eye-r'),
    h('span', 'cat-glasses'),
    h('span', 'cat-cheek cat-cheek-l'), h('span', 'cat-cheek cat-cheek-r'),
    h('span', 'cat-nose'),
    h('span', 'cat-mouth', 'ω'),
    h('span', 'cat-whisker cat-whisker-l'), h('span', 'cat-whisker cat-whisker-r'),
  );
  cat.append(h('span', 'cat-ear cat-ear-l'), h('span', 'cat-ear cat-ear-r'), head, h('span', 'cat-cap'));
  return cat;
}

// ステージのチュートリアル。ステップを1つずつ表示し、条件を満たすと次へ進む。
// step: { text, manual?, phase?, done?(ctx), highlight?: [セレクタ], failHint? }
class Tutorial {
  constructor(root, steps, opts = {}) {
    this.root = root;
    this.steps = steps;
    this.storageKey = opts.storageKey || null;
    this.onIndexChange = opts.onIndexChange || null;
    const helpAt = steps.findIndex((s) => s.help);
    this.revealed = helpAt < 0 ? steps.length - 1 : helpAt - 1;
    this.index = Math.min(this.loadIndex(), this.revealed);
    this.done = new Set();
    this.hint = '';
    this.runStartIndex = null;

    root.innerHTML = '';
    root.classList.remove('hidden');

    const avatar = h('div', 'tut-avatar');
    avatar.appendChild(buildCatTeacher());
    this.helpBtn = h('button', 'btn btn-small tut-help', 'ネコ先生に助けを求める');
    this.helpBtn.type = 'button';
    this.helpBtn.title = 'ネコ先生に助けを求める';
    this.helpBtn.addEventListener('click', () => this.askHelp());
    avatar.appendChild(this.helpBtn);
    const body = h('div', 'tut-body');
    this.headEl = h('div', 'tut-head');
    this.textEl = h('div', 'tut-text');
    this.hintEl = h('div', 'tut-hint hidden');
    body.append(this.headEl, this.textEl, this.hintEl);

    const nav = h('div', 'tut-nav');
    this.prevBtn = h('button', 'btn btn-small', '◀ 前へ');
    this.prevBtn.type = 'button';
    this.prevBtn.addEventListener('click', () => this.go(this.index - 1));
    this.nextBtn = h('button', 'btn btn-small btn-next', '次へ ▶');
    this.nextBtn.type = 'button';
    this.nextBtn.addEventListener('click', () => { if (this.canNext()) this.go(this.index + 1); });
    nav.append(this.prevBtn, this.nextBtn);

    root.append(avatar, body, nav);
    this.render();
  }

  loadIndex() {
    if (!this.storageKey) return 0;
    try {
      const n = parseInt(localStorage.getItem(this.storageKey), 10);
      if (Number.isInteger(n) && n >= 0 && n < this.steps.length) return n;
    } catch (e) { /* 読めなければ最初から */ }
    return 0;
  }

  saveIndex() {
    if (!this.storageKey) return;
    try { localStorage.setItem(this.storageKey, String(this.index)); } catch (e) { /* ignore */ }
  }

  get step() {
    return this.steps[this.index];
  }

  get isLast() {
    return this.index === this.steps.length - 1;
  }

  canNext() {
    if (this.index >= this.revealed) return false;
    return this.step.manual || this.done.has(this.index) || !!this.steps[this.index + 1]?.help;
  }

  helpAvailable() {
    if (this.revealed >= this.steps.length - 1) return false;
    if (!this.steps[this.revealed + 1]?.help) return false;
    const releaseAt = this.steps.findIndex((s) => s.release);
    return this.index >= (releaseAt < 0 ? 0 : releaseAt);
  }

  askHelp() {
    if (!this.helpAvailable()) return;
    this.revealed++;
    this.go(this.revealed);
  }

  // この先に、助けのヒント以外の話が残っているあいだは、9問へ進まない
  blocksClear() {
    return this.steps.slice(this.index + 1).some((s) => !s.help);
  }

  go(i) {
    const next = Math.max(0, Math.min(this.revealed, i));
    if (next === this.index) return;
    this.index = next;
    this.hint = '';
    this.saveIndex();
    if (this.onIndexChange) this.onIndexChange();
    this.render();
    restartAnim(this.root, 'tut-pop');
  }

  // 今のステップの条件を満たしたら次へ。続けて満たしていればさらに進む。
  // 説明だけのステップ（manual）は、プレイヤーが操作を始めたら（ctx.acted）読んだものとして進める
  check(ctx) {
    const before = this.index;
    while (this.index < this.revealed) {
      const s = this.step;
      if (this.done.has(this.index)) break;
      if (s.release || s.help) break;
      const next = this.steps[this.index + 1];
      if (next && (next.help || next.release)) break;
      if (s.manual ? !ctx.acted : !(s.done && s.done(ctx))) break;
      this.done.add(this.index);
      this.index++;
      this.hint = '';
    }
    if (this.index !== before) {
      this.saveIndex();
      if (this.onIndexChange) this.onIndexChange();
      this.render();
      restartAnim(this.root, 'tut-pop');
      return true;
    }
    this.applyHighlight();
    return false;
  }

  runStarted() {
    if (this.runStartIndex == null) this.runStartIndex = this.index;
    this.hint = '';
    this.renderHint();
  }

  // 実行が終わったとき、ステップが進んでいれば true。進まなかったらヒントを出す
  runEnded(ctx = {}) {
    const advanced = this.runStartIndex != null && this.index !== this.runStartIndex;
    this.runStartIndex = null;
    if (!advanced && !ctx.correct && this.step.failHint && !this.done.has(this.index)) {
      this.hint = this.step.failHint;
      this.renderHint();
    }
    return advanced;
  }

  render() {
    const total = this.steps.length;
    const dots = this.steps.map((_, i) => {
      let cls = 'tut-dot';
      if (i === this.index) cls += ' on';
      else if (i < this.index || this.done.has(i)) cls += ' done';
      return `<span class="${cls}"></span>`;
    }).join('');
    this.headEl.innerHTML = `<b>チュートリアル</b><span class="tut-step">STEP ${this.index + 1} / ${total}</span><span class="tut-dots">${dots}</span>`;
    this.textEl.innerHTML = this.step.text;
    this.renderHint();

    this.prevBtn.disabled = this.index === 0;
    this.helpBtn.classList.toggle('hidden', !this.helpAvailable());
    this.nextBtn.classList.toggle('hidden', this.isLast);
    const ready = this.canNext();
    this.nextBtn.disabled = !ready;
    this.nextBtn.classList.toggle('btn-play', ready);
    this.nextBtn.textContent = ready ? '次へ ▶' : 'やってみよう';
    this.applyHighlight();
  }

  renderHint() {
    this.hintEl.textContent = this.hint;
    this.hintEl.classList.toggle('hidden', !this.hint);
  }

  applyHighlight() {
    Tutorial.clearHighlight();
    (this.step.highlight || []).forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => el.classList.add('tut-glow'));
    });
  }

  destroy() {
    Tutorial.clearHighlight();
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  static clearHighlight() {
    document.querySelectorAll('.tut-glow').forEach((el) => el.classList.remove('tut-glow'));
  }
}
