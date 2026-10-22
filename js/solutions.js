'use strict';

// 左下を10回クリックしたとき入れるプログラム。
// 出題の文字が変わっても、そのステージのルールで解ける形。
const MODEL_SUB = 'sub99';

function compile(build) {
  const insts = [];
  const labelAt = {};
  let seq = 1;
  const api = {
    move(dir) { insts.push({ id: seq++, op: 'MOVE', dir }); },
    scan(slot) { insts.push({ id: seq++, op: 'SCAN', slot: slot || 'auto' }); },
    say() { insts.push({ id: seq++, op: 'SAY' }); },
    plus(slot, by) { insts.push({ id: seq++, op: '+', slot, by }); },
    minus(slot, by) { insts.push({ id: seq++, op: '-', slot, by }); },
    copy(to, from) { insts.push({ id: seq++, op: 'COPY', to, from }); },
    call() { insts.push({ id: seq++, op: 'CALL', sub: MODEL_SUB }); },
    abort() { insts.push({ id: seq++, op: 'ABORT' }); },
    label(name) {
      const inst = { id: seq++, op: 'LABEL', name: String(name) };
      insts.push(inst);
      labelAt[name] = inst.id;
    },
    jump(name) { insts.push({ id: seq++, op: 'JUMP', targetName: name }); },
    if(conds, join, fn) {
      const inst = {
        id: seq++,
        op: 'IF',
        join: join || 'and',
        conds: conds.map((c) => ({ slot: c.slot, cmp: c.cmp, ch: c.ch ?? null })),
        end: 0,
      };
      insts.push(inst);
      fn(api);
      const end = { id: seq++, op: 'ENDIF' };
      insts.push(end);
      inst.end = end.id;
    },
  };
  build(api);
  insts.forEach((inst) => {
    if (inst.op === 'JUMP') {
      inst.target = labelAt[inst.targetName];
      delete inst.targetName;
    }
  });
  return insts;
}

function times(n, fn) {
  for (let i = 0; i < n; i++) fn(i);
}

function readAllAuto(p) {
  times(11, () => {
    p.move('right');
    p.scan('auto');
  });
}

function toGoal(p) {
  times(12, () => p.move('goal'));
  p.say();
}

function swapEnds(p) {
  p.copy('a', 'A');
  p.copy('A', 'C');
  p.copy('C', 'a');
}

function dropMiddle(p) {
  p.copy('B', 'C');
  p.copy('C', 'b');
}

function replaceSlot(p, slot, from, to) {
  p.if([{ slot, cmp: 'eq', ch: from }], 'and', () => p.copy(slot, to));
}

function shiftSlots(p, slots) {
  slots.forEach((slot) => p.plus(slot, 1));
}

function backSlots(p, slots) {
  slots.forEach((slot) => p.minus(slot, 1));
}

// 下の段を全部見て、「た」以外を A B C に積む
function skipLiteralLoop(p, ch, label) {
  p.label(label);
  p.move('right');
  p.scan('a');
  p.if([{ slot: 'a', cmp: 'eq', ch }], 'and', () => p.copy('a', 'b'));
  ['A', 'B', 'C'].forEach((slot) => {
    p.if([{ slot, cmp: 'eq', ch: null }], 'and', () => {
      p.if([{ slot: 'a', cmp: 'ne', ch: null }], 'and', () => {
        p.copy(slot, 'a');
        p.copy('a', 'b');
      });
    });
  });
  p.plus('c', 1);
  p.if([{ slot: 'c', cmp: 'ne', ch: '11' }], 'and', () => p.jump(label));
}

function goOrigin(p) {
  p.move('down');
  p.move('left');
}

function readTop(p, onCell) {
  p.move('right');
  p.move('up');
  times(11, (i) => {
    if (i) p.move('right');
    onCell(p);
  });
  p.move('down');
  times(11, () => p.move('left'));
}

function readGaps(p, positions, onPos) {
  let x = 0;
  positions.forEach((pos, i) => {
    times(pos - x, () => p.move('right'));
    onPos(p, i);
    x = pos;
  });
}

function modelProgram(stage) {
  const id = stage.id;
  if (id === '0-1' || id === '0-2' || id === '0-7' || id === '1-1') {
    return { main: compile((p) => { readAllAuto(p); toGoal(p); }) };
  }
  if (id === '0-4') {
    return { main: compile((p) => {
      p.label('skip');
      p.jump('go');
      p.abort();
      p.label('go');
      readAllAuto(p);
      toGoal(p);
    }) };
  }
  if (id === '0-3') {
    return { main: compile((p) => {
      readGaps(p, [3, 6, 9], (q) => {
        q.scan('a');
        q.if([{ slot: 'a', cmp: 'ne', ch: 'た' }], 'and', () => q.scan('auto'));
      });
      toGoal(p);
    }) };
  }
  if (id === '0-5' || id === '2-1') {
    return { main: compile((p) => {
      readAllAuto(p);
      shiftSlots(p, ['A', 'B', 'C']);
      toGoal(p);
    }) };
  }
  if (id === '2-2') {
    return { main: compile((p) => {
      readAllAuto(p);
      backSlots(p, ['A', 'B', 'C']);
      toGoal(p);
    }) };
  }
  if (id === '0-6' || id === '1-2') {
    return { main: compile((p) => {
      readAllAuto(p);
      swapEnds(p);
      toGoal(p);
    }) };
  }
  if (id === '1-3') {
    return { main: compile((p) => {
      readAllAuto(p);
      ['A', 'B', 'C'].forEach((slot) => replaceSlot(p, slot, 'は', 'き'));
      toGoal(p);
    }) };
  }
  if (id === '1-4') {
    return { main: compile((p) => {
      readAllAuto(p);
      dropMiddle(p);
      toGoal(p);
    }) };
  }
  if (id === '1-5') {
    return { main: compile((p) => {
      skipLiteralLoop(p, 'た', 'L');
      toGoal(p);
    }) };
  }
  if (id === '1-6') return pairProgram();
  if (id === '3-1' || id === '6-1') return numberOrderProgram();
  if (id === '3-2') return { main: compile(signedProgram) };
  if (id === '4-1') return { main: compile((p) => arrowProgram(p, false)) };
  if (id === '4-2') return { main: compile((p) => flickLetters(p)) };
  if (id === '4-3') return { main: compile((p) => flickDigits(p)) };
  if (id === '4-4') return tableProgram();
  if (id === '5-1') return { main: compile(cutProgram) };
  if (id === '5-2') return { main: compile(eraseProgram) };
  if (id === '5-3') return { main: compile(replacePosProgram) };
  if (id === '5-4') return { main: compile(replaceXYProgram) };
  if (id === '5-5') return { main: compile(shiftDirProgram) };
  if (id === '5-6') return { main: compile(shiftNProgram) };
  if (id === '6-2') return { main: compile(sortProgram) };
  return null;
}

// ひらがな全部。よく出る文字を先にして、空振りの IF を減らす
function modelChars() {
  const seen = [];
  const add = (ch) => { if (ch && !seen.includes(ch)) seen.push(ch); };
  const freq = {};
  PAIR_SHOWN.forEach((word) => Array.from(word).forEach((ch) => { freq[ch] = (freq[ch] || 0) + 1; }));
  Object.entries(freq).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).forEach(([ch]) => add(ch));
  Array.from(GOJUON).forEach(add);
  Array.from('がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ').forEach(add);
  return seen;
}

// 空いている A B C の先頭へコピーして、そこで終わる
function fillNext(p, from, label) {
  ['A', 'B', 'C'].forEach((slot) => {
    p.if([{ slot, cmp: 'eq', ch: null }], 'and', () => {
      p.copy(slot, from);
      p.jump(label);
    });
  });
  p.label(label);
}

function pairProgram() {
  const chars = modelChars();
  const store = ['A', 'B', 'C', 'b', 'c'];
  const sub = compile((p) => {
    p.move('right');
    p.scan('a');
    p.if([{ slot: 'a', cmp: 'eq', ch: null }], 'and', () => p.jump('tick'));
    for (let g = 0; g < chars.length; g += 4) {
      const group = chars.slice(g, g + 4);
      p.if(group.map((ch) => ({ slot: 'a', cmp: 'eq', ch })), 'or', () => {
        group.forEach((ch) => {
          p.if([{ slot: 'a', cmp: 'eq', ch }], 'and', () => {
            store.forEach((slot, index) => {
              p.if([{ slot, cmp: 'eq', ch }], 'and', () => {
                for (let i = index; i < store.length - 1; i++) p.copy(store[i], store[i + 1]);
                p.copy(store[store.length - 1], 0);
                p.copy('a', 0);
              });
            });
            store.forEach((slot) => {
              p.if([
                { slot, cmp: 'eq', ch: null },
                { slot, cmp: 'eq', ch: '0' },
              ], 'or', () => {
                p.if([
                  { slot: 'a', cmp: 'ne', ch: null },
                  { slot: 'a', cmp: 'ne', ch: '0' },
                ], 'and', () => {
                  p.copy(slot, 'a');
                  p.copy('a', 0);
                });
              });
            });
            p.jump('tick');
          });
        });
      });
    }
    p.label('tick');
  });
  const main = compile((p) => {
    times(11, () => p.call());
    toGoal(p);
  });
  return { main, sub };
}

function numberOrderProgram() {
  return { main: compile((p) => {
    for (let n = 0; n <= 9; n++) {
      for (let pair = 0; pair < 3; pair++) {
        p.move('right');
        p.scan('a');
        p.move('right');
        p.scan('b');
        p.if([{ slot: 'b', cmp: 'eq', ch: String(n) }], 'and', () => fillNext(p, 'a', `N${n}${pair}`));
      }
      times(6, () => p.move('left'));
    }
    toGoal(p);
  }) };
}

function signedProgram(p) {
  ['A', 'B', 'C'].forEach((slot) => {
    p.move('right');
    p.scan(slot);
    p.move('right');
    p.scan('a');
    p.move('right');
    p.scan('b');
    p.if([{ slot: 'a', cmp: 'eq', ch: '＋' }], 'and', () => p.plus(slot, 'b'));
    p.if([{ slot: 'a', cmp: 'eq', ch: 'ー' }], 'and', () => p.minus(slot, 'b'));
  });
  toGoal(p);
}

function arrowProgram(p) {
  ['A', 'B', 'C'].forEach((slot) => {
    p.move('right');
    p.scan(slot);
    p.move('right');
    p.scan('a');
    p.if([{ slot: 'a', cmp: 'eq', ch: '↓' }], 'and', () => p.plus(slot, 1));
    p.if([{ slot: 'a', cmp: 'eq', ch: '↑' }], 'and', () => p.minus(slot, 1));
  });
  toGoal(p);
}

const FLICK_KEYS = ['わ', 'あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら'];

function markShort(p, slot) {
  p.copy('b', 0);
  p.if([
    { slot, cmp: 'eq', ch: 'や' },
    { slot, cmp: 'eq', ch: 'ゆ' },
    { slot, cmp: 'eq', ch: 'よ' },
    { slot, cmp: 'eq', ch: 'わ' },
  ], 'or', () => p.copy('b', 1));
  p.if([
    { slot, cmp: 'eq', ch: 'を' },
    { slot, cmp: 'eq', ch: 'ん' },
  ], 'or', () => p.copy('b', 1));
}

function applyFlick(p, slot) {
  markShort(p, slot);
  p.if([{ slot: 'a', cmp: 'eq', ch: '←' }], 'and', () => p.plus(slot, 1));
  p.if([{ slot: 'a', cmp: 'eq', ch: '→' }], 'and', () => p.plus(slot, 3));
  p.if([{ slot: 'a', cmp: 'eq', ch: '↑' }], 'and', () => {
    p.if([{ slot: 'b', cmp: 'eq', ch: '1' }], 'and', () => p.plus(slot, 1));
    p.if([{ slot: 'b', cmp: 'eq', ch: '0' }], 'and', () => p.plus(slot, 2));
  });
  p.if([{ slot: 'a', cmp: 'eq', ch: '↓' }], 'and', () => {
    p.if([{ slot: 'b', cmp: 'eq', ch: '1' }], 'and', () => p.plus(slot, 2));
    p.if([{ slot: 'b', cmp: 'eq', ch: '0' }], 'and', () => p.plus(slot, 4));
  });
}

function flickLetters(p) {
  ['A', 'B', 'C'].forEach((slot) => {
    p.move('right');
    p.scan(slot);
    p.move('right');
    p.scan('a');
    applyFlick(p, slot);
  });
  toGoal(p);
}

function flickDigits(p) {
  ['A', 'B', 'C'].forEach((slot) => {
    p.move('right');
    p.scan('a');
    FLICK_KEYS.forEach((ch, n) => {
      p.if([{ slot: 'a', cmp: 'eq', ch: String(n) }], 'and', () => p.copy(slot, ch));
    });
    p.move('right');
    p.scan('a');
    applyFlick(p, slot);
  });
  toGoal(p);
}

function tableProgram() {
  const arrows = ['←', '→', '↑', '↓'];
  const sub = compile((p) => {
    p.scan('A');
    p.move('right');
    p.scan('a');
    let n = 0;
    Array.from(GOJUON).forEach((ch) => {
      if (n > 0 && n % 36 === 0) {
        p.move('left');
        p.move('right');
      }
      n += 1;
      p.if([{ slot: 'A', cmp: 'eq', ch }], 'and', () => {
        arrows.forEach((dir) => {
          const result = tableShift(ch, dir);
          if (result == null || !isCopyLiteral(result)) return;
          p.if([{ slot: 'a', cmp: 'eq', ch: dir }], 'and', () => {
            p.copy('A', result);
            p.jump('done');
          });
        });
        p.jump('done');
      });
    });
    p.label('done');
  });
  const main = compile((p) => {
    p.move('right');
    p.call();
    p.copy('b', 'A');
    p.move('right');
    p.call();
    p.copy('c', 'A');
    p.move('right');
    p.call();
    p.copy('C', 'A');
    p.copy('B', 'c');
    p.copy('A', 'b');
    toGoal(p);
  });
  return { main, sub };
}

function cutProgram(p) {
  readTop(p, (q) => {
    q.scan('b');
    q.if([{ slot: 'b', cmp: 'eq', ch: 'ご' }], 'and', () => q.copy('a', 'b'));
    q.if([{ slot: 'b', cmp: 'eq', ch: 'ま' }], 'and', () => q.copy('a', 'b'));
  });
  ['A', 'B', 'C', 'b'].forEach((slot) => {
    p.move('right');
    p.scan(slot);
  });
  p.if([{ slot: 'a', cmp: 'eq', ch: 'ま' }], 'and', () => {
    p.copy('B', 'C');
    p.copy('C', 'b');
  });
  p.if([
    { slot: 'a', cmp: 'ne', ch: 'ま' },
    { slot: 'a', cmp: 'ne', ch: 'ご' },
  ], 'and', () => {
    p.copy('A', 'B');
    p.copy('B', 'C');
    p.copy('C', 'b');
  });
  toGoal(p);
}

function eraseProgram(p) {
  const chars = modelChars();
  p.move('right');
  p.move('up');
  p.scan('a');
  goOrigin(p);
  times(11, (i) => {
    p.move('right');
    p.scan('b');
    p.if([{ slot: 'b', cmp: 'eq', ch: null }], 'and', () => p.jump(`Z${i}`));
    for (let g = 0; g < chars.length; g += 4) {
      const group = chars.slice(g, g + 4);
      p.if(group.map((ch) => ({ slot: 'b', cmp: 'eq', ch })), 'or', () => {
        group.forEach((ch) => {
          p.if([{ slot: 'b', cmp: 'eq', ch }], 'and', () => {
            p.if([{ slot: 'a', cmp: 'eq', ch }], 'and', () => p.jump(`Z${i}`));
            fillNext(p, 'b', `E${i}${g}${ch}`);
            p.jump(`Z${i}`);
          });
        });
      });
    }
    p.label(`Z${i}`);
  });
  toGoal(p);
}

function replacePosProgram(p) {
  p.copy('c', 0);
  readTop(p, (q) => {
    q.scan('b');
    q.if([{ slot: 'c', cmp: 'eq', ch: '1' }], 'and', () => q.copy('c', 'b'));
    q.if([{ slot: 'b', cmp: 'eq', ch: 'を' }], 'and', () => q.copy('c', 1));
    q.if([
      { slot: 'b', cmp: 'eq', ch: 'ま' },
      { slot: 'c', cmp: 'eq', ch: '0' },
    ], 'and', () => q.copy('a', 'b'));
    q.if([
      { slot: 'b', cmp: 'eq', ch: 'ご' },
      { slot: 'c', cmp: 'eq', ch: '0' },
    ], 'and', () => q.copy('a', 'b'));
  });
  readAllAuto(p);
  p.if([{ slot: 'a', cmp: 'eq', ch: 'ま' }], 'and', () => p.copy('B', 'c'));
  p.if([{ slot: 'a', cmp: 'eq', ch: 'ご' }], 'and', () => p.copy('C', 'c'));
  p.if([
    { slot: 'a', cmp: 'ne', ch: 'ま' },
    { slot: 'a', cmp: 'ne', ch: 'ご' },
  ], 'and', () => p.copy('A', 'c'));
  toGoal(p);
}

function replaceXYProgram(p) {
  const chars = modelChars();
  p.copy('a', 0);
  p.copy('c', 0);
  readTop(p, (q) => {
    q.scan('b');
    q.if([{ slot: 'a', cmp: 'eq', ch: '0' }], 'and', () => q.copy('a', 'b'));
    q.if([{ slot: 'c', cmp: 'eq', ch: '1' }], 'and', () => q.copy('c', 'b'));
    q.if([{ slot: 'b', cmp: 'eq', ch: 'を' }], 'and', () => q.copy('c', 1));
  });
  readAllAuto(p);
  let n = 0;
  chars.forEach((ch) => {
    if (n > 0 && n % 24 === 0) {
      p.move('left');
      p.move('right');
    }
    n += 1;
    p.if([{ slot: 'a', cmp: 'eq', ch }], 'and', () => {
      ['A', 'B', 'C'].forEach((slot) => {
        p.if([{ slot, cmp: 'eq', ch }], 'and', () => p.copy(slot, 'c'));
      });
      p.jump('xy');
    });
  });
  p.label('xy');
  toGoal(p);
}

function shiftDirProgram(p) {
  p.copy('a', 0);
  readTop(p, (q) => {
    q.scan('b');
    q.if([{ slot: 'b', cmp: 'eq', ch: 'ま' }], 'and', () => q.copy('a', 1));
  });
  readAllAuto(p);
  p.if([{ slot: 'a', cmp: 'eq', ch: '1' }], 'and', () => backSlots(p, ['A', 'B', 'C']));
  p.if([{ slot: 'a', cmp: 'eq', ch: '0' }], 'and', () => shiftSlots(p, ['A', 'B', 'C']));
  toGoal(p);
}

function shiftNProgram(p) {
  p.move('right');
  p.move('up');
  p.scan('b');
  p.copy('a', 0);
  times(10, () => {
    p.move('right');
    p.scan('c');
    p.if([{ slot: 'c', cmp: 'eq', ch: 'ま' }], 'and', () => p.copy('a', 1));
  });
  p.move('down');
  times(11, () => p.move('left'));
  readAllAuto(p);
  p.if([{ slot: 'a', cmp: 'eq', ch: '1' }], 'and', () => {
    ['A', 'B', 'C'].forEach((slot) => p.minus(slot, 'b'));
  });
  p.if([{ slot: 'a', cmp: 'eq', ch: '0' }], 'and', () => {
    ['A', 'B', 'C'].forEach((slot) => p.plus(slot, 'b'));
  });
  toGoal(p);
}

function sortProgram(p) {
  readAllAuto(p);
  let n = 0;
  Array.from(GOJUON).forEach((ch) => {
    ['A', 'B', 'C'].forEach((slot) => {
      if (n > 0 && n % 20 === 0) {
        p.move('left');
        p.move('right');
      }
      n += 1;
      p.if([{ slot, cmp: 'eq', ch }], 'and', () => {
        ['a', 'b', 'c'].forEach((dest) => {
          p.if([{ slot: dest, cmp: 'eq', ch: null }], 'and', () => {
            p.copy(dest, slot);
            p.copy(slot, 0);
            p.jump(`S${n}`);
          });
        });
        p.label(`S${n}`);
      });
    });
  });
  p.copy('A', 'a');
  p.copy('B', 'b');
  p.copy('C', 'c');
  toGoal(p);
}
