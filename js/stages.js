'use strict';

const BOARD_COLS = 13;

// 盤面: 1行目 = 問題文(x=1..11)、2行目 = START(x=0) + 床(x=1..11) + GOAL(x=12)
function createBoard(problem, spec) {
  const chars = Array.from(spec.problem || problem);
  const top = [];
  const bottom = [];
  for (let x = 0; x < BOARD_COLS; x++) {
    if (x === 0 || x === BOARD_COLS - 1) top.push({ type: 'none', ch: null });
    else top.push({ type: 'text', ch: chars[x - 1] || null });

    if (x === 0) bottom.push({ type: 'start', ch: null });
    else if (x === BOARD_COLS - 1) bottom.push({ type: 'goal', ch: null });
    else bottom.push({ type: 'floor', ch: spec.items[x] || null });
  }

  return {
    cols: BOARD_COLS,
    rows: 2,
    cells: [top, bottom],
    start: { x: 0, y: 1 },
    goal: { x: BOARD_COLS - 1, y: 1 },
    answer: spec.answer,
    cellAt(x, y) {
      if (y < 0 || y >= this.rows || x < 0 || x >= this.cols) return null;
      return this.cells[y][x];
    },
    isWalkable(x, y) {
      const c = this.cellAt(x, y);
      return !!c && c.type !== 'none';
    },
    isGoal(x, y) {
      return x === this.goal.x && y === this.goal.y;
    },
    charAt(x, y) {
      const c = this.cellAt(x, y);
      return c ? c.ch : null;
    },
  };
}

function placeWord(word, positions) {
  const chars = Array.from(word);
  const items = {};
  positions.forEach((p, i) => { items[p] = chars[i]; });
  return { items, answer: word };
}

const STAGE01_POSITIONS = [3, 6, 9];
const STAGE04_POSITIONS = [1, 2, 3];

// たぬき暗号：「た」を抜いて読んだものが答え
const STAGE03_TANUKI = ['たかさ', 'かたさ', 'かさた', 'いすた', 'たねこ', 'くたま', 'うした', 'たかに', 'みかん'];
function tanukiBoard(chars) {
  return { ...placeWord(chars, STAGE01_POSITIONS), answer: chars.replace(/た/g, '') };
}

const STAGE01_WORDS = ['みるく', 'さくら', 'いるか', 'すいか', 'めだか', 'たぬき', 'こあら', 'きつね', 'うさぎ'];

// 五十音の並び。＋で進み、ーで戻る。「ん」の次は「あ」、「あ」の前は「ん」
const GOJUON = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
function shiftKana(ch, delta) {
  const i = GOJUON.indexOf(ch);
  if (i < 0) return null;
  const n = GOJUON.length;
  return GOJUON[((i + delta) % n + n) % n];
}
function plusOneBoard(word) {
  const spec = placeWord(word, STAGE01_POSITIONS);
  spec.answer = Array.from(word).map((ch) => shiftKana(ch, 1)).join('');
  return spec;
}
const STAGE05_WORDS = ['んあか', 'おああ', 'こあう', 'とああ', 'のああ', 'ほあお', 'もあを', 'よあい', 'そああ'];

// 右から読む。左から拾った3文字の、1文字目と3文字目を入れ替えると答えになる
function reverseReadBoard(word) {
  const spec = placeWord(word, STAGE01_POSITIONS);
  spec.answer = Array.from(word).reverse().join('');
  return spec;
}
const STAGE_COPY_WORDS = ['さくら', 'みるく', 'きつね', 'こうそ', 'さんた', 'ちんみ', 'いたや', 'くかい', 'こうほ'];

// 0-7: 3文字だが、並びは等間隔とは限らない。左から読んだものが答え
const STAGE06_CASES = [
  ['みるく', [2, 3, 8]],
  ['さくら', [1, 5, 6]],
  ['いるか', [3, 4, 10]],
  ['すいか', [1, 2, 11]],
  ['めだか', [4, 7, 8]],
  ['たぬき', [2, 6, 11]],
  ['こあら', [1, 8, 9]],
  ['きつね', [5, 6, 7]],
  ['うさぎ', [1, 4, 11]],
];
function unevenWord(word, positions) {
  return placeWord(word, positions);
}

const SCAN_GUIDE = `<span class="chip chip-scan">SCAN</span> は足元の文字を記憶します。
  <b>自動格納</b>のままだと、<b>A → B → C → a → b → c</b> の順に空いている場所へ入ります。
  <b>A〜c</b> を選ぶと、その場所に入れます（前の文字は上書き）。
  何もないマスを SCAN すると空白を読み込み、元の文字は消えます。自動格納のときは、何もないマスでは何も読み込みません。`;

const CHIP = {
  MOVE: '<span class="chip chip-move">MOVE</span>',
  SCAN: '<span class="chip chip-scan">SCAN</span>',
  SAY: '<span class="chip chip-say">ABCを言う</span>',
  CALL: '<span class="chip chip-call">CALL</span>',
  IF: '<span class="chip chip-if">IF</span>',
  JUMP: '<span class="chip chip-jump">JUMP</span>',
  ABORT: '<span class="chip chip-abort">あきらめる</span>',
  PLUS: '<span class="chip chip-plus">＋</span>',
  MINUS: '<span class="chip chip-minus">ー</span>',
  COPY: '<span class="chip chip-copy">コピー</span>',
};

// 「た」のときは SCAN しない形になっているか。
// 「記憶が た と違う」IF の中に SCAN がある、または「記憶が た と同じ」IF の ELSE に SCAN がある
function hasSkipTanukiScan(program) {
  return [program.main, ...program.subs.map((s) => s.body)].some((body) => body.some((i, k) => {
    if (i.op !== 'IF') return false;
    const end = body.findIndex((e) => e.op === 'ENDIF' && e.id === i.end);
    if (end <= k) return false;
    const branch = nextBranchIndex(body, i.id, k, end);
    const thenPart = body.slice(k + 1, branch >= 0 ? branch : end);
    const allAnd = i.conds.every((c, n) => n === 0 || (c.join || i.join || 'and') !== 'or');
    const notTa = i.conds.some((c) => c.cmp === 'ne' && c.ch === 'た') && (i.conds.length === 1 || allAnd);
    if (notTa && thenPart.some((e) => e.op === 'SCAN')) return true;
    const isTa = i.conds.length === 1 && i.conds[0].cmp === 'eq' && i.conds[0].ch === 'た';
    const elseIdx = body.findIndex((e, j) => j > k && j < end && e.op === 'ELSE' && e.of === i.id);
    return isTa && elseIdx >= 0 && body.slice(elseIdx + 1, end).some((e) => e.op === 'SCAN');
  }));
}

function hasIf(program) {
  return [program.main, ...program.subs.map((s) => s.body)].some((body) => body.some((i) => i.op === 'IF'));
}

function hasScanTo(program, slot) {
  return [program.main, ...program.subs.map((s) => s.body)].some((body) => body.some((i) => i.op === 'SCAN' && i.slot === slot));
}

// 「MOVE→ MOVE→ MOVE→ SCAN(自動格納)」の形のサブ命令か
function isWalkScanSub(sub) {
  const ops = sub.body.filter((i) => !isMarker(i));
  return ops.length === 4 &&
    ops.slice(0, 3).every((i) => i.op === 'MOVE' && i.dir === 'right') &&
    ops[3].op === 'SCAN' && ops[3].slot === 'auto';
}

function countWalkScanCalls(program) {
  const ids = new Set(program.subs.filter(isWalkScanSub).map((s) => s.id));
  return program.main.filter((i) => i.op === 'CALL' && ids.has(i.sub)).length;
}

// チュートリアルの ctx: { program, editor, robot, withinLimit }
const TUTORIAL_01 = [
  {
    manual: true,
    text: `やあ、よく来たにゃ。このロボットはまだ何も知らないから、プログラムで動かし方を教えてあげよう。<br>
      まずは「<b>ひだりからよめ</b>」っていう問題に合うプログラムを作るよ。下の段を見ると、答えは「<b>みるく</b>」になりそうだね。
      「み」「る」「く」の3文字は<b>等間隔</b>に並んでいるよ。`,
    highlight: ['#mainBoard .token'],
  },
  {
    text: `まずは ${CHIP.MOVE} を<b>3つ</b>、${CHIP.SCAN} を<b>1つ</b>置いて、<b>▶ 再生</b>で動かしてみよう。<br>
      命令の欄からプログラム欄へドラッグしてね（クリックでも追加できるよ）。`,
    done: (c) => Object.values(c.robot.mem).includes('み'),
    highlight: ['#palette .block-move', '#palette .block-scan', '#btnPlay'],
    failHint: 'あれれ、「み」の上で SCAN できたかにゃ？ ロボットが何マス動いたか数えてみよう。',
  },
  {
    text: `やったね！「み」が記憶エリアの <b>A</b> に入ったよ。SCAN は自動格納だから、次の文字は <b>B</b>、その次は <b>C</b> に入るんだ。<br>
      何もないところを ${CHIP.SCAN} すると、空白を読み込むよ。元あった文字が消えちゃうから気を付けてね。<br>
      でも、自動格納が選ばれているときは何も読み込まないようになっているから、安心してね。<br>
      同じように MOVE 3つと SCAN 1つを<b>あと2回</b>つなげて、「る」「く」も覚えさせよう。`,
    done: (c) => c.robot.mem.A === 'み' && c.robot.mem.B === 'る' && c.robot.mem.C === 'く',
    highlight: ['#palette .block-move', '#palette .block-scan'],
    failHint: 'A・B・C に「み」「る」「く」が入ったかにゃ？ MOVE は3つずつだよ。',
  },
  {
    text: `3文字そろったね！ 最後に ${CHIP.MOVE} の<b>ゴールまで進む</b>で <b>GOAL</b> まで行こう。<br>
      ゴールのうえで ${CHIP.SAY} を実行すると、<b>A → B → C</b> を言うよ。それが答えと合えばクリアだにゃ！`,
    done: (c) => c.robot.correct,
    highlight: ['#mainBoard .cell-goal', '#palette .block-move', '#palette .block-say'],
    failHint: 'ゴールのうえで「ABCを言う」を実行できたかにゃ？',
  },
  {
    text: `正解だにゃ！ 次は<b>同じプログラム</b>で 9つの問題に挑戦するよ。<br>
      どの問題も同じ場所に文字が並んでいるから、きっと大丈夫。全部正解で <b>CLEAR!</b>`,
  },
];

const TUTORIAL_02 = [
  {
    manual: true,
    text: `また会ったにゃ。今回も 0-1 と同じ問題だよ。0-1 では「MOVE → MOVE → MOVE → SCAN」を<b>3回くり返した</b>よね。<br>
      このかたまりを<b>サブ命令</b>にまとめると、ぐっと楽になるんだ。`,
  },
  {
    text: `命令の欄の「<b>＋ 作る</b>」を押して、サブ命令を作ってみよう。<br>
      （前に作ったサブ命令があるなら「編集」でもいいよ）`,
    done: (c) => c.editor.current !== 'main',
    highlight: ['#btnNewSub'],
  },
  {
    text: `プログラム欄がサブ命令の編集画面になったね。ここに ${CHIP.MOVE} を<b>3つ</b>、${CHIP.SCAN} を<b>1つ</b>入れよう。<br>
      SCAN は<b>自動格納</b>のままでOK。名前も好きにつけていいよ。`,
    done: (c) => c.program.subs.some(isWalkScanSub),
    highlight: ['#palette .block-move', '#palette .block-scan'],
  },
  {
    text: `サブ命令ができたにゃ！「<b>メイン</b>」タブにもどって、命令の欄の ${CHIP.CALL} をメインに<b>3つ</b>置いてみて。`,
    done: (c) => countWalkScanCalls(c.program) >= 3,
    highlight: ['#routineTabs .routine-tab:first-child', '#subPalette .block-call'],
  },
  {
    text: `これで「み」「る」「く」を覚えられるね。でもこのままだと、<b>ゴールの3マス手前</b>で止まっちゃう…。<br>
      ${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ行って、ゴールで ${CHIP.SAY}。<b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#btnPlay', '#palette .block-move', '#palette .block-say'],
    failHint: 'ゴールのうえで「ABCを言う」ができたかにゃ？',
  },
  {
    text: `正解だにゃ！ 作ったサブ命令はちゃんと保存されてるから、<b>ほかのステージでも使える</b>よ。<br>
      次は同じプログラムで 9つの問題に挑戦だ！`,
  },
];

function hasJump(program) {
  return [program.main, ...program.subs.map((s) => s.body)].some((body) => body.some((i) => i.op === 'JUMP'));
}

// JUMP → あきらめる → ◆ の順で、あきらめるをとび越える形になっているか
function hasJumpOverAbort(program) {
  const body = program.main;
  return body.some((inst, jumpAt) => {
    if (inst.op !== 'JUMP') return false;
    const labelAt = body.findIndex((i) => i.op === 'LABEL' && i.id === inst.target);
    return labelAt > jumpAt && body.slice(jumpAt + 1, labelAt).some((i) => i.op === 'ABORT');
  });
}

const TUTORIAL_04 = [
  {
    manual: true,
    text: `今回は ${CHIP.JUMP} の練習なんだけど、その前にいつものプログラムを作ろう。<br>
      問題は 0-1 と同じで、答えは「<b>みるく</b>」になりそうだね。`,
    highlight: ['#mainBoard .token'],
  },
  {
    text: `${CHIP.MOVE} と ${CHIP.SCAN} で「み」「る」「く」を覚えよう。最後は ${CHIP.MOVE} の<b>ゴールまで進む</b>で <b>GOAL</b> まで行こう。<br>
      ゴールで ${CHIP.SAY}。できたら <b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#palette .block-move', '#palette .block-scan', '#btnPlay'],
    failHint: 'ゴールまで届いて、「みるく」って言えたかにゃ？',
  },
  {
    phase: 'abort',
    text: `できたね！ 今、プログラムの途中に ${CHIP.ABORT} を入れたよ。消したり動かしたりはできないんだ。<br>
      このまま <b>▶ 再生</b>してみて。`,
    done: (c) => c.robot.reason === 'abort',
    highlight: ['#program .block-abort', '#btnPlay'],
    failHint: '「あきらめる」まで実行できたかにゃ？',
  },
  {
    phase: 'jump',
    text: `そこで止まっちゃったね。じゃあ ${CHIP.JUMP} を追加しよう。<br>
      JUMP を置くと飛び先の <b>◆</b> も出てくるよ。JUMP まで来たロボットは ◆ へ飛んで、そこから続きを実行するんだ。<br>
      まずは JUMP をプログラムに置いてみよう。`,
    done: (c) => hasJump(c.program),
    highlight: ['#palette .block-jump'],
  },
  {
    text: `コツはこうだにゃ。<b>JUMP → あきらめる → ◆</b> のじゅんにすると、とび越えられるよ。<br>
      ◆ はドラッグで動かせるよ。「あきらめる」の前には、命令を<b>2つまで</b>置けるよ。`,
    done: (c) => hasJumpOverAbort(c.program),
    highlight: ['#program .block-jump', '#program .block-label'],
  },
  {
    text: `とび越えたあとは、さっき作ったプログラムの続きが動くよ。できたら <b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#btnPlay'],
    failHint: '「あきらめる」にぶつかってないかにゃ？ JUMP の矢印が、あきらめるの向こうの ◆ を指しているか見てみよう。',
  },
  {
    text: `正解だにゃ！ JUMP で「あきらめる」をとび越えられたね。次は 9つの問題でも同じプログラムが通じるか試そう！`,
  },
];

const TUTORIAL_03 = [
  {
    manual: true,
    text: `今回は「<b>たぬき暗号</b>」だにゃ。問題文は「たぬきにしてよもう」…つまり、<b>「た」を抜いて</b>読めってこと。<br>
      下の段は「た」「か」「さ」だから、答えは「<b>かさ</b>」になりそうだね。`,
    highlight: ['#mainBoard .token'],
  },
  {
    manual: true,
    text: `でも気をつけて！ 9つの問題の中には「かたさ」や「かさた」みたいに、<b>「た」の場所がバラバラ</b>のものもあるんだ。<br>
      だから「『た』のときだけ SCAN しない」っていうプログラムが必要になるよ。`,
  },
  {
    text: `「た」かどうかは、先に足元の文字を記憶してから調べるよ。<br>
      ${CHIP.SCAN} をプログラムに置いて、格納先を <b>a</b> にしよう。a はゴールでしゃべらない記憶だよ。`,
    done: (c) => hasScanTo(c.program, 'a'),
    highlight: ['#palette .block-scan', '#program .block-scan'],
    failHint: 'SCAN を置いて、格納先を a にしたかにゃ？',
  },
  {
    text: `そこで ${CHIP.IF} の出番だにゃ。IF は選んだ記憶（A〜c）が、入力した文字と<b>「同じ」か「違う」か</b>を調べて、
      当てはまったときだけ<b>「IF ここまで」までの命令</b>を実行するよ。<br>IF をプログラムに置いてみよう。`,
    done: (c) => hasIf(c.program),
    highlight: ['#palette .block-if'],
  },
  {
    text: `${CHIP.IF} で <b>a</b> を選んで「<b>た</b>」と入力し、「<b>と違う</b>」にしよう。IF と「IF ここまで」の<b>間に、自動格納の SCAN</b> を入れてね。<br>
      a が「た」のときは、答えに入る SCAN を飛ばせるよ。「IF ここまで」はドラッグで動かせるよ。`,
    done: (c) => hasSkipTanukiScan(c.program),
    highlight: ['#program .block-if .cond-slots', '#program .block-if .if-char', '#program .block-endif'],
  },
  {
    text: `あとは「MOVE 3つ → IF（SCAN）」を3回くり返そう。文字を読み終えたら、${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ。<br>
      ゴールで ${CHIP.SAY}。サブ命令にまとめると楽ちんだよ。<br>
      メインにつくった IF は、「<b>メインをコピー</b>」ボタンでサブ命令にコピーできるよ。できたら <b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#btnPlay', '#btnCopyMain'],
    failHint: '「た」まで答えに入ってないかにゃ？ 先に a へ SCAN して、a が「た」と違うときだけ自動格納の SCAN をしよう。',
  },
  {
    text: `正解だにゃ！ 次は 9つの問題で、「た」の場所がバラバラでも大丈夫か試すよ。`,
  },
];

const TUTORIAL_COPY = [
  {
    manual: true,
    text: `今回は ${CHIP.COPY} の練習だにゃ。問題は「<b>みぎからよもう</b>」。<br>
      下の段は「か」「ん」「き」で、<b>等間隔</b>に並んでいるよ。まずは左から3文字拾って、言ってみよう。`,
    highlight: ['#mainBoard .token'],
  },
  {
    text: `${CHIP.MOVE} を<b>3つ</b>と ${CHIP.SCAN} を<b>1つ</b>、それを3回つなげよう。いつもの等間隔だよ。<br>
      拾えたら ${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ行って、${CHIP.SAY}。<b>▶ 再生</b>！`,
    done: (c) => c.robot.said === 'かんき' || c.robot.correct,
    highlight: ['#palette .block-move', '#palette .block-scan', '#palette .block-say', '#btnPlay'],
    failHint: 'A・B・C は「か」「ん」「き」になってるかにゃ？ ゴールで言ってみて。',
  },
  {
    text: `「かんき」になったね。右からよむと、1文字目と3文字目が逆だよ。答えは「<b>きんか</b>」。<br>
      ${CHIP.COPY} で入れ替えよう。コピーは上書きだから、先に <b>a に A をコピー</b>して避難する。それから <b>A に C をコピー</b>、<b>C に a をコピー</b>。<br>
      A が「き」、C が「か」になったら、ゴールで ${CHIP.SAY}。<b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#palette .block-copy', '#btnPlay'],
    failHint: 'a に A、A に C、C に a、の順でコピーできたかにゃ？ A・B・C は「き」「ん」「か」？',
  },
  {
    text: `正解だにゃ！ コピーで1文字目と3文字目を入れ替えられたね。次は 9つの問題でも、同じプログラムが通じるか試そう！`,
  },
];

const TUTORIAL_06 = [
  {
    manual: true,
    text: `チュートリアルの<b>最終ステージ</b>だにゃ。問題は「<b>ひだりからよめ</b>」。<br>
      今までの知識をつかってクリアしよう。<br>
      下の段は「み」「る」「く」。でも<b>等間隔とは限らない</b>よ。左から読むと、答えは「<b>みるく</b>」。9つの問題では、文字の場所が毎回ちがうんだ。`,
    highlight: ['#mainBoard .token'],
  },
  {
    manual: true,
    text: `${CHIP.IF} は、文字欄に何も入れないと、文字があるかどうかを判別できる。これをうまく使うと、少し処理を減らすことができるよ。`,
    highlight: ['#palette .block-if'],
  },
  {
    manual: true,
    release: true,
    text: `<b>後はがんばるにゃ！</b><br>
      今までの知識で、左から読んでゴールまで行こう。クリアできたら<b>合格</b>だよ。<br>
      困ったら、横のボタンでネコ先生に助けを求めてもいいよ。`,
    highlight: ['#mainBoard .token', '#tutorial .tut-help'],
  },
  {
    help: true,
    text: `まずは ${CHIP.MOVE} で一歩動いたあと、${CHIP.SCAN} で足元の文字を拾ってみよう。`,
    highlight: ['#palette .block-move', '#palette .block-scan'],
  },
  {
    help: true,
    text: `そのあと ${CHIP.JUMP} を下に入れて、<b>◆1</b> を MOVE と SCAN の上に置くと、繰り返しが行えるよ。`,
    highlight: ['#palette .block-jump', '#program .block-label', '#program .block-jump'],
  },
  {
    help: true,
    text: `次は、このループから抜け出す方法を考えよう。`,
  },
  {
    help: true,
    text: `${CHIP.IF} で <b>C</b> に文字が入っているかどうかを判別しよう。<br>
      IF を <b>◆1</b> と ${CHIP.MOVE} の間に入れよう。<br>
      自動格納があるから、C に文字が入っているなら、3文字は問題なく拾えているね。<br>
      C に対して「<b>空欄</b>」と<b>同じ</b>という条件にしよう。`,
    highlight: ['#palette .block-if', '#program .block-if .cond-slots', '#program .block-if .if-char'],
  },
  {
    help: true,
    text: `今作った「<b>IF ここまで</b>」を ${CHIP.JUMP} の下に入れよう。<br>
      あとはゴールするだけだね！`,
    highlight: ['#program .block-endif', '#palette .block-move', '#palette .block-say', '#btnPlay'],
    failHint: '◆1、IF（C が空欄と同じ）、MOVE、SCAN、JUMP、「IF ここまで」の順になってるかにゃ？ 抜けたらゴールまで進もう。',
  },
];

const TUTORIAL_05 = [
  {
    manual: true,
    text: `ロボットに<b>拡張機能</b>を付けておいたよ。この機能は、ひらがなに数字を足すと、その数字の分だけひらがなを五十音で進めてくれるんだ。引くと、その分だけ戻るよ。<br>
      記憶の右のボードが、今付いている機能だよ。「ひらがな」と「数字」を計算できる。<br>
      ${CHIP.PLUS} は「<b>A に X を足す</b>」、${CHIP.MINUS} は「<b>A から X を引く</b>」だよ。X は A〜c か、<b>N</b> の数字。N を選ぶと入力欄が出るよ。盤面の数字をスキャンして、その記憶を X にしても足せるよ。２と2は同じだよ。<br>
      A が数字のときは、その数だけ増減する。今回は <b>A に 1 を足す</b>よ。<br>
      問題文は「<b>ごじゅうおんで＋１</b>」。下の段は「た」「さ」「か」で<b>等間隔</b>。た→ち、さ→し、か→きだから、答えは「<b>ちしき</b>」だね。`,
    highlight: ['#mainBoard .mod-board', '#mainBoard .token'],
  },
  {
    text: `まずは ${CHIP.MOVE} を<b>3つ</b>と ${CHIP.SCAN} で「た」を拾って、そのあとに ${CHIP.PLUS} を置こう。<br>
      <b>A に 1 を足す</b>だよ。次に置く＋は B、その次は C が最初から選ばれる。<b>▶ 再生</b>！`,
    done: (c) => c.robot.mem.A === 'ち',
    highlight: ['#palette .block-move', '#palette .block-scan', '#palette .block-plus', '#btnPlay'],
    failHint: 'A に 1 を足せてるかにゃ？ A が「ち」になったか見てみて。',
  },
  {
    text: `「ち」になったね！ 「さ」は <b>B に 1 を足す</b>、「か」は <b>C に 1 を足す</b>＋を置こう。A・B・C が「ち」「し」「き」になったら、${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ行って ${CHIP.SAY}。<b>▶ 再生</b>！`,
    done: (c) => c.robot.correct,
    highlight: ['#btnPlay', '#palette .block-plus'],
    failHint: 'A・B・C は「ち」「し」「き」？ ゴールまで届いたかにゃ？',
  },
  {
    text: `正解だにゃ！ 拾ったひらがなを五十音で進められたね。次は 9つの問題でも、同じプログラムが通じるか試そう！`,
  },
];

// saveKey: 保存データのキー（ステージ番号を変えても以前の進みぐあいを引き継ぐため）
// requires: おすすめの順番。選ぶときは、最初から全部遊べる
// allowSubs: サブ命令を使えるか
// allowElse: IF に ELSE IF / ELSE を足すボタンを出すか（後のステージで解放する）
const STAGES = [
  {
    id: '0-1',
    saveKey: '0',
    group: 'チュートリアル',
    label: 'ステージ 0-1',
    title: '動かしてみよう',
    summary: 'MOVE と SCAN の使い方を覚えよう',
    problem: 'ひだりからよめ',
    main: placeWord('みるく', STAGE01_POSITIONS),
    tests: STAGE01_WORDS.map((w) => placeWord(w, STAGE01_POSITIONS)),
    ops: ['MOVE', 'SCAN', 'SAY'],
    allowSubs: false,
    lockedOps: ['CALL', 'IF', 'JUMP', '+', '-'],
    tutorial: TUTORIAL_01,
    guide: `
      <ol class="guide-list">
        <li><b>上の段</b>は問題文。<b>下の段</b>には、ロボットが拾える文字が置いてあります。</li>
        <li><span class="chip chip-move">MOVE</span> を右のプログラム欄へドラッグ。矢印ボタンで動く向きを選ぼう。<b>ゴールまで進む</b>を選ぶと、ゴールに着くまで進みます。</li>
        <li>${SCAN_GUIDE}</li>
        <li>${CHIP.SAY} は <b>A → B → C</b> の順に言います。ゴールのうえで言えて、答えと合えば正解です。</li>
        <li>最後に<b>同じプログラム</b>で 9つの問題を解きます。全部正解で <b>CLEAR!</b></li>
      </ol>`,
  },
  {
    id: '0-2',
    saveKey: 'sub-0-2',
    requires: '0-1',
    group: 'チュートリアル',
    label: 'ステージ 0-2',
    title: 'サブ命令を作って楽をしよう',
    summary: 'くり返す命令のかたまりを、サブ命令にまとめよう',
    problem: 'ひだりからよめ',
    main: placeWord('みるく', STAGE01_POSITIONS),
    tests: STAGE01_WORDS.map((w) => placeWord(w, STAGE01_POSITIONS)),
    ops: ['MOVE', 'SCAN', 'SAY'],
    allowSubs: true,
    lockedOps: ['IF', 'JUMP', '+', '-'],
    tutorial: TUTORIAL_02,
    guide: `
      <ol class="guide-list">
        <li>0-1 と同じ問題です。<b>「MOVE → MOVE → MOVE → SCAN」</b>が 3回くり返されていることに気づいた？</li>
        <li>命令の欄の「<b>＋ 作る</b>」でサブ命令を作り、その中に MOVE・MOVE・MOVE・SCAN を入れよう。</li>
        <li>命令の欄に出てくる <span class="chip chip-call">CALL</span> をメインに置くと、サブ命令の中身を上から実行して、終わるとメインに戻ってきます。</li>
        <li>SCAN を<b>自動格納</b>のままにしておけば、呼ぶたびに A → B → C と順番に記憶してくれます。</li>
        <li>作ったサブ命令は保存されて、<b>ほかのステージでも使えます</b>（20個まで）。</li>
        <li>3回呼んだあとは、ゴールの手前で止まります。${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ行き、${CHIP.SAY}。A → B → C が答えと合えば正解です。</li>
      </ol>`,
  },
  {
    id: '0-3',
    saveKey: 'if-0-3',
    requires: '0-2',
    group: 'チュートリアル',
    label: 'ステージ 0-3',
    title: 'IF文を使ってたぬき暗号を解こう',
    summary: '「た」のときだけ読み飛ばすプログラムを作ろう',
    problem: 'たぬきにしてよもう',
    main: tanukiBoard('たかさ'),
    tests: STAGE03_TANUKI.map(tanukiBoard),
    ops: ['MOVE', 'SCAN', 'SAY', 'IF'],
    allowSubs: true,
    lockedOps: ['JUMP', '+', '-'],
    tutorial: TUTORIAL_03,
    guide: `
      <ol class="guide-list">
        <li>問題文は「<b>たぬきにしてよもう</b>」。つまり、<b>「た」を抜いて</b>読んだものが答えです。</li>
        <li>9つの問題の中には「かたさ」「かさた」のように、<b>「た」の位置がバラバラ</b>のものもあります。</li>
        <li>先に ${CHIP.SCAN} を置いて、格納先を <b>a</b> にします。a はゴールではしゃべらない記憶です。</li>
        <li>${CHIP.IF} は選んだ記憶（A〜c）が、入力した文字と<b>「同じ」か「違う」か</b>を調べます。
          当てはまったときだけ、IF から<b>「IF ここまで」までの命令</b>を実行し、当てはまらなければ飛ばします。</li>
        <li>IF を置くと「IF ここまで」も一緒に出てきます。ドラッグで動かして、IF の範囲を決めよう。</li>
        <li>「<b>a</b> が <b>た</b> と<b>違う</b>」IF の中に、自動格納の SCAN を入れれば、「た」は答えに入りません。</li>
        <li>「<b>＋ 条件</b>」で条件を増やせます。条件と条件のあいだは、それぞれ「<b>かつ（AND）</b>」か「<b>または（OR）</b>」です。上から順に組み合わせます。</li>
        <li>サブ命令と組み合わせると、ぐっと短く書けます。</li>
      </ol>`,
  },
  {
    id: '0-4',
    saveKey: 'jump-0-4',
    requires: '0-3',
    group: 'チュートリアル',
    label: 'ステージ 0-4',
    title: 'JUMPを使ってみよう',
    summary: 'いつものプログラムを作ってから、JUMP であきらめるをとび越えよう',
    problem: 'ひだりからよめ',
    main: placeWord('みるく', STAGE01_POSITIONS),
    tests: STAGE01_WORDS.map((w) => placeWord(w, STAGE01_POSITIONS)),
    ops: ['MOVE', 'SCAN', 'SAY'],
    allowSubs: false,
    lockedOps: ['CALL', 'JUMP', 'IF', '+', '-'],
    abortLine: 3,
    tutorial: TUTORIAL_04,
    guide: `
      <ol class="guide-list">
        <li>問題は 0-1 と同じ。「ひだりからよめ」で、答えは「みるく」になりそうです。</li>
        <li>まずは ${CHIP.MOVE} と ${CHIP.SCAN} で、いつものプログラムを作ろう。最後は MOVE の<b>ゴールまで進む</b>でゴールへ行き、${CHIP.SAY}。</li>
        <li>動いたら、お邪魔命令の ${CHIP.ABORT} が<b>1つ</b>、プログラムの途中に入ります。消したり並べ替えたりはできません。前には命令を<b>2つまで</b>置けて、3つ目からは自動でうしろに回ります。</li>
        <li>そこで ${CHIP.JUMP} の出番です。置くと飛び先の <b>◆</b> も出てきます。<b>JUMP → あきらめる → ◆</b> の順にすると、とび越えられます。</li>
        <li>このステージではサブ命令と ${CHIP.IF} は使えません。</li>
      </ol>`,
  },
  {
    id: '0-5',
    saveKey: 'plus-1-1',
    requires: '0-4',
    group: 'チュートリアル',
    label: 'ステージ 0-5',
    title: '五十音で＋１',
    summary: '拾ったひらがなを、五十音で一つ進めよう',
    problem: 'ごじゅうおんで＋１',
    main: plusOneBoard('たさか'),
    tests: STAGE05_WORDS.map(plusOneBoard),
    ops: ['MOVE', 'SCAN', 'SAY', 'COPY', '+', '-', 'IF', 'JUMP'],
    allowSubs: true,
    lockedOps: [],
    calcMods: ['ひらがな', '数字'],
    tutorial: TUTORIAL_05,
    guide: `
      <ol class="guide-list">
        <li>ロボットに<b>拡張機能</b>が付いています。ひらがなに数字を足すと、その数字の分だけひらがなを五十音で進めます。引くと、その分だけ戻ります。記憶の右のボードが、今付いている機能です。</li>
        <li>${CHIP.PLUS} は「<b>A に X を足す</b>」、${CHIP.MINUS} は「<b>A から X を引く</b>」です。X は A〜c か、<b>N</b> の数字です。N を選んだときだけ、数字の入力欄が出ます。盤面からスキャンした数字も、その記憶を X にすれば使えます。２と2は同じです。A がひらがななら、その数だけ五十音で進みます。「ん」の次は「あ」、「あ」の前は「ん」です。A が数字なら、その数だけ増減します。何も入っていない記憶は 0 からです。</li>
        <li>${CHIP.COPY} は、「<b>A に a をコピー</b>」です。左がコピー先、右がコピー元です。右で <b>X</b> を選ぶと入力欄が出て、ひらがな1文字か数字をコピーできます。欄を空にすると、コピー先の記憶が消えます。濁点・半濁点は使えません。</li>
        <li>問題文は「<b>ごじゅうおんで＋１</b>」。下の段は「た」「さ」「か」。た→ち、さ→し、か→きなので、答えは「<b>ちしき</b>」です。</li>
        <li>文字は 0-1 と同じく<b>等間隔</b>です。SCAN で <b>A</b> に入った文字は、${CHIP.PLUS} で <b>A に 1 を足す</b>と進みます。B、C も同じです。</li>
        <li>新しく置く ${CHIP.PLUS} と ${CHIP.MINUS} は、前に置いたものの<b>次の場所</b>（A の次は B）が選ばれ、X は <b>1</b> です。</li>
        <li>五十音の端は一周します。「ん」の次は「あ」、「あ」の前は「ん」です。</li>
        <li>A・B・C がそろったら、${CHIP.MOVE} の<b>ゴールまで進む</b>でゴールへ行き、${CHIP.SAY}。A → B → C が答えと合えば正解です。同じプログラムで 9つの問題も解きます。</li>
      </ol>`,
  },
  {
    id: '0-6',
    saveKey: 'copy-0-6',
    requires: '0-5',
    group: 'チュートリアル',
    label: 'ステージ 0-6',
    title: 'コピーで入れ替えよう',
    summary: '1文字目と3文字目を、コピーで入れ替えよう',
    problem: 'みぎからよもう',
    main: reverseReadBoard('かんき'),
    tests: STAGE_COPY_WORDS.map(reverseReadBoard),
    ops: ['MOVE', 'SCAN', 'SAY', 'COPY', '+', '-', 'IF', 'JUMP'],
    allowSubs: true,
    lockedOps: [],
    calcMods: ['ひらがな', '数字'],
    tutorial: TUTORIAL_COPY,
    guide: `
      <ol class="guide-list">
        <li>問題文は「<b>みぎからよもう</b>」。下の段は「か」「ん」「き」で、<b>等間隔</b>です。右から読むと「<b>きんか</b>」です。</li>
        <li>左から SCAN すると、A・B・C は「か」「ん」「き」になります。このまま言うと「かんき」です。</li>
        <li>${CHIP.COPY} は「<b>A に a をコピー</b>」です。左がコピー先、右がコピー元で、先の中身は上書きされます。右の <b>X</b> は、入力したひらがな1文字か数字です。X を空欄にすると、コピー先が空になります。</li>
        <li>1文字目と3文字目を入れ替えるには、先に <b>a に A をコピー</b>して避難します。それから <b>A に C をコピー</b>、<b>C に a をコピー</b>。A・B・C は「き」「ん」「か」になります。</li>
        <li>ゴールで ${CHIP.SAY}。同じプログラムで 9つの問題も解きます。</li>
      </ol>`,
  },
  {
    id: '0-7',
    saveKey: 'read-0-6',
    requires: '0-6',
    group: 'チュートリアル',
    label: 'ステージ 0-7',
    title: 'ひだりからよめ',
    summary: '最終問題。間隔がバラバラな文字を、左から読もう',
    problem: 'ひだりからよめ',
    main: unevenWord('みるく', [2, 3, 8]),
    tests: STAGE06_CASES.map(([word, pos]) => unevenWord(word, pos)),
    ops: ['MOVE', 'SCAN', 'SAY', 'COPY', '+', '-', 'IF', 'JUMP'],
    allowSubs: true,
    lockedOps: [],
    calcMods: ['ひらがな', '数字'],
    finale: true,
    tutorial: TUTORIAL_06,
    guide: `
      <ol class="guide-list">
        <li>チュートリアルの<b>最終ステージ</b>です。今まで出てきた命令を使ってクリアしましょう。</li>
        <li>問題文は「<b>ひだりからよめ</b>」。下の段の文字を、左から読んだものが答えです。</li>
        <li>文字は<b>等間隔とは限りません</b>。9つの問題では、文字の場所が毎回変わります。</li>
        <li>${CHIP.IF} は、文字欄に何も入れないと、文字があるかどうかを判別できます。これをうまく使うと、少し処理を減らせます。C に対して「空欄」と「と同じ」にすると、C が空かどうかを調べられます。</li>
        <li>繰り返しは、${CHIP.MOVE} と ${CHIP.SCAN} の上に <b>◆1</b>、下に ${CHIP.JUMP} です。抜け出すときは、◆1 と MOVE の間にその IF を入れ、「IF ここまで」を JUMP の下に置きます。自動格納なので、C に文字が入っていれば 3文字そろっています。抜けたらゴールへ行き、${CHIP.SAY} で答えを言います。</li>
        <li>ゴールで ${CHIP.SAY} ができて、9問すべて正解で<b>合格</b>です。</li>
      </ol>`,
  },
];
