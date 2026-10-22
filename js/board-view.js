'use strict';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function buildRobotBody() {
  const body = h('div', 'robot-body');
  body.style.setProperty('--blink-delay', `${-(Math.random() * 4).toFixed(2)}s`);
  const face = h('div', 'robot-face');
  const eyes = h('div', 'robot-eyes');
  eyes.append(h('span', 'robot-eye robot-eye-l'), h('span', 'robot-eye robot-eye-r'));
  face.append(eyes, h('span', 'robot-cheek robot-cheek-l'), h('span', 'robot-cheek robot-cheek-r'), h('span', 'robot-mouth'));
  body.append(h('span', 'robot-antenna'), face);
  return body;
}

const MOODS = ['happy', 'sad', 'hurt'];

// 記憶の右に置く拡張ボード。「ひらがな」「数字」はあとから差し替えられる
function modBoard(names) {
  const board = h('div', 'mod-board');
  board.appendChild(h('div', 'mod-title', '拡張'));
  const line = h('div', 'mod-line');
  names.forEach((name, i) => {
    if (i > 0) line.appendChild(h('span', 'mod-join', 'と'));
    const chip = h('span', 'mod-chip', name);
    chip.dataset.mod = name;
    line.appendChild(chip);
  });
  line.appendChild(h('span', 'mod-result', 'を計算可能'));
  board.appendChild(line);
  return board;
}

class BoardView {
  constructor(container, board, opts = {}) {
    this.board = board;
    this.opts = opts;
    this.pos = null;
    this.root = h('div', 'board' + (opts.small ? ' board-small' : ''));
    container.innerHTML = '';
    container.appendChild(this.root);
    this.build();
  }

  build() {
    const b = this.board;
    const grid = h('div', 'grid');
    grid.style.setProperty('--cols', b.cols);
    this.cellEls = [];

    for (let y = 0; y < b.rows; y++) {
      this.cellEls.push([]);
      for (let x = 0; x < b.cols; x++) {
        const c = b.cells[y][x];
        const cell = h('div', `cell cell-${c.type}`);
        cell.style.gridColumn = x + 1;
        cell.style.gridRow = y + 1;

        if (c.type === 'none') {
          if (y === 0 && x === 0) cell.appendChild(h('span', 'row-label', '問題'));
        } else {
          const tile = h('div', 'tile');
          if (c.type === 'text') {
            if (c.ch) tile.appendChild(h('span', 'ch', c.ch));
            else cell.classList.add('empty');
          } else if (c.type === 'floor') {
            if (c.ch) tile.appendChild(h('span', 'token', c.ch));
          } else if (c.type === 'start') {
            tile.appendChild(h('span', 'tile-label', 'START'));
          } else if (c.type === 'goal') {
            tile.appendChild(h('span', 'tile-label', 'GOAL'));
          }
          cell.appendChild(tile);
        }
        grid.appendChild(cell);
        this.cellEls[y].push(cell);
      }
    }

    this.robotEl = h('div', 'robot');
    this.shakeEl = h('div', 'robot-shake');
    this.bodyEl = buildRobotBody();
    this.mouthEl = this.bodyEl.querySelector('.robot-mouth');
    this.shakeEl.appendChild(this.bodyEl);
    this.bubbleEl = h('div', 'bubble hidden');
    this.robotEl.append(this.shakeEl, this.bubbleEl);
    grid.appendChild(this.robotEl);

    this.resultEl = h('div', 'result-badge hidden');
    grid.appendChild(this.resultEl);
    this.root.appendChild(grid);

    const footer = h('div', 'board-footer');
    const mem = h('div', 'memory');
    mem.appendChild(h('div', 'memory-title', '記憶'));
    const mg = h('div', 'memory-grid');
    this.slotEls = {};
    SLOTS.forEach((s) => {
      const el = h('div', 'slot' + (SPEAK_SLOTS.includes(s) ? ' slot-speak' : ''));
      el.append(h('span', 'slot-label', s), h('span', 'slot-ch'));
      mg.appendChild(el);
      this.slotEls[s] = el;
    });
    mem.appendChild(mg);
    footer.appendChild(mem);

    const mods = this.opts.calcMods;
    if (Array.isArray(mods) && mods.length) footer.appendChild(modBoard(mods));

    if (this.opts.speakHint) {
      const hint = h('div', 'speak-hint');
      hint.innerHTML = 'ゴールで<br><b>ABCを言う</b>と<br>A → B → C';
      footer.appendChild(hint);
    }
    this.root.appendChild(footer);
  }

  setRobot(x, y, dir, instant = false) {
    const moved = this.pos && (this.pos.x !== x || this.pos.y !== y);
    this.pos = { x, y };
    if (instant) this.robotEl.classList.add('no-anim');
    this.robotEl.style.setProperty('--rx', x);
    this.robotEl.style.setProperty('--ry', y);
    this.robotEl.style.setProperty('--lx', DIRS[dir].dx);
    this.robotEl.style.setProperty('--ly', DIRS[dir].dy);
    if (instant) {
      void this.robotEl.offsetWidth;
      this.robotEl.classList.remove('no-anim');
    } else if (moved) {
      restartAnim(this.bodyEl, 'hop');
    }
  }

  setMood(mood) {
    this.bodyEl.classList.remove('hop', ...MOODS);
    if (mood) this.bodyEl.classList.add(mood);
  }

  setMemory(mem, popSlot = null) {
    SLOTS.forEach((s) => {
      const el = this.slotEls[s];
      const ch = mem[s];
      el.querySelector('.slot-ch').textContent = ch ?? '';
      el.classList.toggle('filled', ch != null);
      if (s === popSlot) restartAnim(el, 'pop');
    });
  }

  apply(ev, robot) {
    if (!ev) return;
    this.setRobot(robot.x, robot.y, robot.dir);
    if (ev.type === 'scan') {
      restartAnim(this.cellEls[robot.y][robot.x], 'flash');
      restartAnim(this.robotEl, 'scanning');
      this.setMemory(robot.mem, ev.slot);
    } else if (ev.type === 'say') {
      this.say(ev.said);
    } else if (ev.type === 'add' || ev.type === 'copy') {
      this.setMemory(robot.mem, ev.slot);
    } else if (ev.type === 'error' && ev.bump) {
      const d = DIRS[robot.dir];
      this.shakeEl.style.setProperty('--bx', d.dx * 0.3);
      this.shakeEl.style.setProperty('--by', d.dy * 0.3);
      restartAnim(this.shakeEl, 'bump');
      this.setMood('hurt');
    }
  }

  say(text) {
    this.bubbleEl.textContent = text || '……';
    this.bubbleEl.classList.remove('hidden');
    restartAnim(this.bubbleEl, 'show');
    restartAnim(this.mouthEl, 'talk');
  }

  showResult(ok) {
    this.resultEl.innerHTML = `<span>${ok ? '○' : '×'}</span>`;
    this.resultEl.className = `result-badge ${ok ? 'ok' : 'ng'}`;
    if (ok) this.setMood('happy');
    else if (!this.bodyEl.classList.contains('hurt')) this.setMood('sad');
  }

  reset(robot) {
    this.pos = null;
    this.setRobot(robot.x, robot.y, robot.dir, true);
    this.setMemory(robot.mem);
    this.bubbleEl.classList.add('hidden');
    this.resultEl.className = 'result-badge hidden';
    this.setMood(null);
    this.mouthEl.classList.remove('talk');
    this.shakeEl.classList.remove('bump');
    this.robotEl.classList.remove('scanning');
  }
}
