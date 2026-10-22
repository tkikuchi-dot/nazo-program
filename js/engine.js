'use strict';

const DIRS = {
  left:  { dx: -1, dy: 0, arrow: '←' },
  up:    { dx: 0, dy: -1, arrow: '↑' },
  down:  { dx: 0, dy: 1, arrow: '↓' },
  right: { dx: 1, dy: 0, arrow: '→' },
  goal:  { dx: 1, dy: 0, arrow: 'ゴールまで進む' },
};
const DIR_ORDER = ['left', 'up', 'down', 'right'];

// ゴールへ向かう次の一歩。上下を先にそろえてから、左右へ進む
function stepTowardGoal(board, x, y) {
  const g = board.goal;
  if (y < g.y) return 'down';
  if (y > g.y) return 'up';
  if (x < g.x) return 'right';
  if (x > g.x) return 'left';
  return null;
}

const SLOTS = ['A', 'B', 'C', 'a', 'b', 'c'];
const SPEAK_SLOTS = ['A', 'B', 'C'];

const MAX_STEPS = 300;
const MAX_IDLE_STEPS = 50;
const MAX_CALL_DEPTH = 50;

// 目印（◆・ELSE・「IF ここまで」）は命令の数にも行番号にも数えない
const MARKER_OPS = ['LABEL', 'ELSE', 'ENDIF'];
function isMarker(inst) {
  return MARKER_OPS.includes(inst.op);
}

function digitValue(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0xff10 && code <= 0xff19) return code - 0xff10;
  return null;
}

// 半角と全角の数字は同じ整数。数字以外の文字が混ざっていれば、そのまま返す
function canonValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return value;
  let text = '';
  for (const ch of value) {
    if (ch === '-' || ch === '－') text += '-';
    else {
      const n = digitValue(ch);
      if (n == null) return value;
      text += String(n);
    }
  }
  return /^-?\d+$/.test(text) ? Number(text) : value;
}

function foldDigits(text) {
  return Array.from(String(text ?? '')).map((ch) => {
    const n = digitValue(ch);
    return n == null ? ch : String(n);
  }).join('');
}

function shownValue(value) {
  const v = canonValue(value);
  return v == null ? '空' : String(v);
}

// 条件 k を、ひとつ前と「かつ」でつなぐか「または」でつなぐか。無ければ IF 全体の join
function condJoinAt(inst, index) {
  const own = inst.conds[index] && inst.conds[index].join;
  if (own === 'and' || own === 'or') return own;
  return inst.join === 'or' ? 'or' : 'and';
}

// 当てはまらなかったとき、記憶の中身と入力を短く見せる
function condNote(inst, mem) {
  return inst.conds.map((c, i) => {
    const target = condCompareTo(c);
    const right = target.slot
      ? `${target.slot}は${shownValue(mem[target.slot])}`
      : `入力は${shownValue(target.value)}`;
    const text = `${c.slot}は${shownValue(mem[c.slot])}、${right}`;
    if (i === 0) return text;
    return `${condJoinAt(inst, i) === 'or' ? ' または ' : ' かつ '}${text}`;
  }).join('');
}

// 条件の右側。from が A〜c ならその記憶。なければ入力値（古いデータは ch）
function condCompareTo(c) {
  if (c && SLOTS.includes(c.from)) return { slot: c.from };
  if (c && Object.prototype.hasOwnProperty.call(c, 'from')) return { value: c.from ?? null };
  return { value: c ? (c.ch ?? null) : null };
}

function condRightValue(mem, c) {
  const target = condCompareTo(c);
  return target.slot ? mem[target.slot] : target.value;
}

// IF / ELSE IF の条件。選んだ記憶と、もう一つの記憶か入力を比べる。上から順に、かつ／またはでつなぐ
function evalConds(inst, mem) {
  const results = inst.conds.map((c) => {
    const same = canonValue(mem[c.slot]) === canonValue(condRightValue(mem, c));
    return c.cmp === 'ne' ? !same : same;
  });
  return results.reduce((acc, ok, i) => {
    if (i === 0) return ok;
    return condJoinAt(inst, i) === 'or' ? (acc || ok) : (acc && ok);
  }, false);
}

// IF のかたまり：IF … [ELSE IF …]* [ELSE …] IF ここまで。ELSE IF と ELSE は of で IF を指す
function ifEndIndex(body, ifId) {
  const cond = body.find((i) => i.op === 'IF' && i.id === ifId);
  return cond ? body.findIndex((i) => i.op === 'ENDIF' && i.id === cond.end) : -1;
}

function nextBranchIndex(body, ifId, from, endIdx) {
  return body.findIndex((i, k) => k > from && k < endIdx && (i.op === 'ELSEIF' || i.op === 'ELSE') && i.of === ifId);
}

// program = { main: [命令...], subs: [{ id, name, color, body: [命令...] }] }
function routineBody(program, routine) {
  if (routine === 'main') return program.main;
  const sub = program.subs.find((s) => s.id === routine);
  return sub ? sub.body : [];
}

const COPY_DAKUTEN = new Set('がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ');

// コピーの X。ひらがな1文字（濁点・半濁点なし）か、0〜9。カタカナと全角数字は直して返す
function normalizeCopyLiteral(value) {
  const ch = Array.from(String(value ?? '').trim())[0];
  if (!ch) return null;
  const code = ch.codePointAt(0);
  const digit = digitValue(ch);
  if (digit != null) return digit;
  const h = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
  const hcode = h.codePointAt(0);
  if (hcode >= 0x3041 && hcode <= 0x3093 && !COPY_DAKUTEN.has(h)) return h;
  return null;
}

function isCopyLiteral(value) {
  // null は X の空欄。コピーすると、先の記憶が空になる
  if (value == null) return true;
  return (typeof value === 'number' || typeof value === 'string') && normalizeCopyLiteral(value) === value;
}

// ＋／ーの X。半角・全角の数字、ー − － を受け、整数ならその数を返す
function parseArithLiteral(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/[ー−－]/g, '-');
  const n = canonValue(text);
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

function arithAmount(mem, by) {
  if (SLOTS.includes(by)) {
    const v = canonValue(mem[by]);
    if (v == null) return { error: 'empty' };
    if (typeof v === 'number' && Number.isInteger(v)) return { n: v };
    return { error: 'notnum' };
  }
  const n = parseArithLiteral(by);
  return n == null ? { error: 'bad' } : { n };
}

function routineName(program, routine) {
  if (routine === 'main') return 'メイン';
  const sub = program.subs.find((s) => s.id === routine);
  return sub ? sub.name : '?';
}

class Robot {
  constructor(board) {
    this.board = board;
    this.reset();
  }

  reset() {
    this.x = this.board.start.x;
    this.y = this.board.start.y;
    this.dir = 'right';
    this.mem = Object.fromEntries(SLOTS.map((s) => [s, null]));
    this.stack = [{ routine: 'main', pc: 0 }];
    this.steps = 0;
    this.moves = 0;
    this.idleSteps = 0;
    this.status = 'ready';
    this.reason = null;
    this.said = null;
    this.message = '';
  }

  get finished() {
    return this.status === 'goal' || this.status === 'error';
  }

  get correct() {
    return this.status === 'goal' && foldDigits(this.said) === foldDigits(this.board.answer);
  }

  speak() {
    return foldDigits(SPEAK_SLOTS.map((s) => (this.mem[s] == null ? '' : String(this.mem[s]))).join(''));
  }

  fail(reason, message, extra = {}) {
    this.status = 'error';
    this.reason = reason;
    this.message = message;
    return { type: 'error', reason, ...extra };
  }

  // 1命令だけ実行して、何が起きたかを返す
  step(program) {
    if (this.finished) return null;
    this.status = 'running';

    // 終わったサブ命令から戻り、目印は読み飛ばす。
    // ELSE IF / ELSE に上から流れてきたら、前の枝を実行し終えたので「IF ここまで」の後へ進む。
    // 条件に当てはまらず飛んできたとき（frame.enter が一致）は、その枝に入る
    let frame;
    let body;
    for (;;) {
      frame = this.stack[this.stack.length - 1];
      body = routineBody(program, frame.routine);
      if (frame.pc >= body.length) {
        if (this.stack.length > 1) { this.stack.pop(); continue; }
        break;
      }
      const cur = body[frame.pc];
      if (cur.op === 'ELSE' || cur.op === 'ELSEIF') {
        if (frame.enter === frame.pc) {
          if (cur.op === 'ELSEIF') break;
          frame.enter = null;
          frame.pc++;
          continue;
        }
        const endIdx = ifEndIndex(body, cur.of);
        if (endIdx < frame.pc) {
          return this.fail('badelse', `${cur.op === 'ELSE' ? 'ELSE' : 'ELSE IF'} が IF と「IF ここまで」の間にないよ。`);
        }
        frame.pc = endIdx + 1;
        continue;
      }
      if (isMarker(cur)) { frame.pc++; continue; }
      break;
    }

    if (frame.pc >= body.length) {
      if (this.board.isGoal(this.x, this.y)) {
        return this.fail('nosay', 'ゴールに着いたけど、「ABCを言う」で答えを言っていないよ。');
      }
      return this.fail('end', 'プログラムが終わったけど、ゴールに着いていないよ。');
    }
    if (this.steps >= MAX_STEPS) {
      return this.fail('limit', `${MAX_STEPS}回動いても、ゴールに着かなかったよ。`);
    }
    if (this.idleSteps >= MAX_IDLE_STEPS) {
      return this.fail('idle', '同じところをぐるぐる回っているみたい…。JUMP の飛び先を見直そう。');
    }

    const loc = { routine: frame.routine, pc: frame.pc };
    const no = body.slice(0, frame.pc).filter((i) => !isMarker(i)).length + 1;
    const where = frame.routine === 'main'
      ? `${no}番目の`
      : `「${routineName(program, frame.routine)}」の${no}番目の`;
    const inst = body[frame.pc];
    this.steps++;
    this.idleSteps = inst.op === 'MOVE' || inst.op === 'SCAN' ? 0 : this.idleSteps + 1;

    switch (inst.op) {
      case 'MOVE': {
        const toward = inst.dir === 'goal' ? stepTowardGoal(this.board, this.x, this.y) : inst.dir;
        if (!toward) {
          frame.pc++;
          return { type: 'move', loc };
        }
        const d = DIRS[toward];
        const nx = this.x + d.dx;
        const ny = this.y + d.dy;
        this.dir = toward;
        if (!this.board.isWalkable(nx, ny)) {
          return this.fail('wall', `${where} MOVE で壁にぶつかった！`, { loc, bump: true });
        }
        this.x = nx;
        this.y = ny;
        this.moves++;
        const arrived = this.board.isGoal(nx, ny);
        if (arrived || inst.dir !== 'goal') frame.pc++;
        return { type: 'move', loc };
      }
      case 'SAY': {
        this.said = this.speak();
        frame.pc++;
        if (this.board.isGoal(this.x, this.y)) {
          this.status = 'goal';
          return { type: 'goal', loc, said: this.said };
        }
        return { type: 'say', loc, said: this.said };
      }
      case 'SCAN': {
        // slot が 'auto' なら A→B→C→a→b→c の順に空いている場所へ入れる
        const ch = this.board.charAt(this.x, this.y);
        let slot = inst.slot;
        if (slot === 'auto') {
          slot = ch == null ? null : SLOTS.find((s) => this.mem[s] == null);
          if (ch != null && !slot) {
            return this.fail('full', `${where} SCAN で、記憶エリアがいっぱいになったよ。`, { loc });
          }
        }
        if (slot) this.mem[slot] = ch == null ? null : canonValue(ch);
        frame.pc++;
        return { type: 'scan', loc, slot, ch };
      }
      case 'CALL': {
        if (!program.subs.some((s) => s.id === inst.sub)) {
          return this.fail('nosub', `${where} CALL のサブ命令が見つからないよ。`, { loc });
        }
        if (this.stack.length >= MAX_CALL_DEPTH) {
          return this.fail('depth', `${where} CALL で呼び出しが深くなりすぎたよ。自分自身を呼び続けていない？`, { loc });
        }
        frame.pc++;
        this.stack.push({ routine: inst.sub, pc: 0 });
        return { type: 'call', loc };
      }
      case 'IF':
      case 'ELSEIF': {
        // 当てはまればその枝を実行。当てはまらなければ次の ELSE IF / ELSE へ、なければ「IF ここまで」の後へ
        const ifId = inst.op === 'IF' ? inst.id : inst.of;
        const endIdx = ifEndIndex(body, ifId);
        if (endIdx < 0) {
          return this.fail('noend', `${where} IF の「ここまで」が見つからないよ。`, { loc });
        }
        if (endIdx < frame.pc) {
          return this.fail('badend', `${where} IF の「ここまで」が上にあるよ。`, { loc });
        }
        frame.enter = null;
        if (inst.conds.some((c) => !SLOTS.includes(c.slot))) {
          return this.fail('noslot', `${where} IF で調べる記憶を、A〜c から選ぼう。`, { loc });
        }
        const ok = evalConds(inst, this.mem);
        if (ok) {
          frame.pc++;
        } else {
          const next = nextBranchIndex(body, ifId, frame.pc, endIdx);
          frame.pc = next >= 0 ? next : endIdx + 1;
          if (next >= 0) frame.enter = next;
        }
        return { type: 'if', loc, result: ok, note: ok ? '' : condNote(inst, this.mem) };
      }
      case 'JUMP': {
        const idx = body.findIndex((i) => i.op === 'LABEL' && i.id === inst.target);
        if (idx < 0) {
          return this.fail('nolabel', `${where} JUMP の飛び先（◆）が見つからないよ。`, { loc });
        }
        frame.enter = null;
        frame.pc = idx + 1;
        return { type: 'jump', loc };
      }
      case 'ABORT':
        return this.fail('abort', `${where}「あきらめる」で、ロボットがあきらめてしまった…。JUMP でとび越えよう！`, { loc });
      case 'COPY': {
        const from = inst.from;
        const to = inst.to;
        const literal = isCopyLiteral(from);
        if (!SLOTS.includes(to) || !(SLOTS.includes(from) || literal)) {
          return this.fail('noslot', `${where}コピーは、A に a をコピーするか、A に X をコピーするように選ぼう。`, { loc });
        }
        this.mem[to] = literal ? from : this.mem[from];
        frame.pc++;
        return { type: 'copy', loc, slot: to, ch: this.mem[to] };
      }
      case '+':
      case '-':
      case '+1':
      case '-1': {
        const minus = inst.op === '-' || inst.op === '-1';
        const word = minus ? 'ー' : '＋';
        const slot = inst.slot;
        const by = inst.by == null ? 1 : inst.by;
        if (!SLOTS.includes(slot)) {
          return this.fail('noslot', `${where}${word}は、${minus ? 'A から X を引く' : 'A に X を足す'}ように、A〜c を選ぼう。`, { loc });
        }
        const amt = arithAmount(this.mem, by);
        if (amt.error === 'empty') {
          return this.fail('empty', `${where}${by} には、まだ数字がないよ。`, { loc });
        }
        if (amt.error === 'notnum') {
          return this.fail('notnum', `${where}${by} は「${shownValue(this.mem[by])}」だよ。X に使えるのは、数字だよ。`, { loc });
        }
        if (amt.error) {
          return this.fail('badby', `${where}X は、整数か A〜c の数字にしてね。`, { loc });
        }
        const delta = minus ? -amt.n : amt.n;
        const cur = canonValue(this.mem[slot]);
        if (cur == null || typeof cur === 'number') {
          this.mem[slot] = (cur == null ? 0 : cur) + delta;
        } else {
          const next = shiftKana(cur, delta);
          if (next == null) {
            return this.fail('notkana', `${where}${word}は、数字か五十音のひらがなに使えるよ。`, { loc });
          }
          this.mem[slot] = next;
        }
        frame.pc++;
        return { type: 'add', loc, slot, ch: this.mem[slot] };
      }
      default:
        return this.fail('unknown', `${where}命令は、まだ使えないよ。`, { loc });
    }
  }
}

// まだ「あきらめる」がないプログラムの、N 行目に割り込ませる。命令の順番はそのまま。
function insertAbortAtLine(body, makeAbort, line = 3) {
  const keep = Math.max(0, line - 1);
  const out = [];
  let n = 0;
  let placed = false;
  body.forEach((inst) => {
    if (inst.op === 'ABORT' || inst.op === 'PAD') return;
    if (!placed && !isMarker(inst) && n === keep) {
      out.push(makeAbort());
      placed = true;
    }
    out.push(inst);
    if (!isMarker(inst)) n++;
  });
  if (!placed) out.push(makeAbort());
  return out;
}

// メインの N 行目（◆ などの目印は数えない）に「あきらめる」を1つ固定する。
// 空き行は作らない。前に置ける命令は N-1 個までで、はみ出した分はうしろへ回す。
// 「あきらめる」のうしろに置いた命令や ◆ は、そのままうしろに残す。
function pinAbortLines(body, makeAbort, lines = [3]) {
  const keep = Math.max(0, lines[0] - 1);
  const abortIdx = body.findIndex((i) => i.op === 'ABORT');
  const before = [];
  const after = [];
  body.forEach((inst, i) => {
    if (inst.op === 'ABORT' || inst.op === 'PAD') return;
    if (abortIdx >= 0 && i > abortIdx) after.push(inst);
    else before.push(inst);
  });

  let extra = before.filter((i) => !isMarker(i)).length - keep;
  if (extra > 0) {
    const moved = [];
    const stay = [];
    before.forEach((inst) => {
      if (extra > 0) {
        moved.push(inst);
        if (!isMarker(inst)) extra--;
      } else {
        stay.push(inst);
      }
    });
    before.length = 0;
    stay.forEach((inst) => before.push(inst));
    after.unshift(...moved);
  }

  return [...before, makeAbort(), ...after];
}
