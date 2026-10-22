'use strict';

// 本編。答えはどれも3文字。盤面の文字数は問題によって違う。
// 問題文をテストごとに変えるステージは、spec.problem を上の段に出す。
// 五十音のずらしは濁点・半濁点を使わない。「ん」の次は「あ」。

const MAIN_OPS = ['MOVE', 'SCAN', 'SAY', 'COPY', '+', '-', 'IF', 'JUMP'];
const DIGIT = '０１２３４５６７８９';

// 五十音表。右が「あ」列。→ はあ列へ、← は反対へ。
// や・わ の列は、行が飛び飛び。
const GOJUON_TABLE = [
  ['わ', 'を', 'ん', null, null],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['や', null, 'ゆ', null, 'よ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['あ', 'い', 'う', 'え', 'お'],
];

function tableShift(ch, dir) {
  let x = -1;
  let y = -1;
  GOJUON_TABLE.forEach((col, i) => {
    const row = col.indexOf(ch);
    if (row >= 0) { x = i; y = row; }
  });
  if (x < 0) return null;
  const dx = dir === '→' ? 1 : dir === '←' ? -1 : 0;
  const dy = dir === '↓' ? 1 : dir === '↑' ? -1 : 0;
  let nx = x + dx;
  let ny = y + dy;
  if (!GOJUON_TABLE[nx] || GOJUON_TABLE[nx][ny] == null) {
    nx += dx;
    ny += dy;
  }
  const next = GOJUON_TABLE[nx] && GOJUON_TABLE[nx][ny];
  return next || ch;
}

const FLICK_DELTA = { '←': 1, '↑': 2, '→': 3, '↓': 4 };
const FLICK_SHORT = { '↑': 1, '↓': 2 };
const FLICK_KEY = { '１': 'あ', '２': 'か', '３': 'さ', '４': 'た', '５': 'な', '６': 'は', '７': 'ま', '８': 'や', '９': 'ら', '０': 'わ' };

function flickDelta(base, arrow) {
  const i = GOJUON.indexOf(base);
  const short = (i >= GOJUON.indexOf('や') && i <= GOJUON.indexOf('よ'))
    || (i >= GOJUON.indexOf('わ') && i <= GOJUON.indexOf('ん'));
  if (short && FLICK_SHORT[arrow]) return FLICK_SHORT[arrow];
  return FLICK_DELTA[arrow];
}

function charsOf(text) {
  return Array.from(text);
}

function putAt(entries) {
  const items = {};
  entries.forEach(([x, ch]) => { items[x] = ch; });
  return items;
}

function spreadWord(word, positions) {
  return putAt(charsOf(word).map((ch, i) => [positions[i], ch]));
}

function seqPairs(pairs) {
  const items = {};
  pairs.forEach((pair, i) => {
    pair.forEach((ch, k) => { items[1 + i * pair.length + k] = ch; });
  });
  return items;
}

function readCases(words) {
  return words.map(([word, positions]) => ({
    items: spreadWord(word, positions),
    answer: word,
  }));
}

function reverseCases(words) {
  return words.map(([word, positions]) => ({
    items: spreadWord(word, positions),
    answer: charsOf(word).reverse().join(''),
  }));
}

function replaceHa(word) {
  return charsOf(word).map((ch) => (ch === 'は' ? 'き' : ch)).join('');
}

function dropAt(word, index) {
  const list = charsOf(word);
  list.splice(index, 1);
  return list.join('');
}

function dropPairs(word) {
  const list = charsOf(word);
  const count = {};
  list.forEach((ch) => { count[ch] = (count[ch] || 0) + 1; });
  return list.filter((ch) => count[ch] === 1).join('');
}

function gojuonSort(word) {
  return charsOf(word).slice().sort((a, b) => GOJUON.indexOf(a) - GOJUON.indexOf(b)).join('');
}

// 3文字の置き場所。隣同士の空きは左右でちがう。どの盤面も等間隔にしない
const UNEVEN3 = [
  [1, 2, 6],
  [1, 3, 8],
  [1, 4, 9],
  [1, 5, 10],
  [1, 6, 10],
  [2, 3, 7],
  [2, 4, 9],
  [2, 5, 11],
  [2, 7, 10],
  [3, 4, 10],
];

const READ = [
  ['みるく', [2, 5, 9]],
  ['さくら', [1, 4, 8]],
  ['きつね', [3, 5, 10]],
  ['あいし', [2, 6, 11]],
  ['たいと', [1, 5, 10]],
  ['ねんり', [3, 7, 10]],
  ['ひいる', [2, 4, 8]],
  ['かいさ', [1, 6, 10]],
  ['さいた', [4, 6, 10]],
  ['みきり', [2, 3, 9]],
];

const HA = ['あはた', 'かはね', 'さしは', 'たちは', 'なみは', 'ひはり', 'まさは', 'やさは', 'りはみ', 'あはち'];
const MID3 = ['あさい', 'かくお', 'そあら', 'つうき', 'なえつ', 'はきな', 'みとみ', 'やこま', 'りねす', 'わふら'];
// たぬき暗号。たは何個でもよい。たを全部抜いた3文字が答えで、答えにたは入らない
const TA_SHOWN = [
  'たたみたたるくたた',
  'たたさたたくたらたたた',
  'たたいたるたたかた',
  'たすたたいたかたた',
  'たためたただたたかた',
  'たたこたあたたらたた',
  'たきたつたたねたた',
  'たたうたたさたぎたた',
  'たたさたかたたなた',
  'たたひたかたたりた',
];

const PAIR_EXTRA = ['あ', 'ん', 'お', 'え', 'ゆ', 'わ', 'ほ', 'せ', 'ぬ', 'へ'];
const PAIR_WORDS = ['みるく', 'さくら', 'いるか', 'すいか', 'めだか', 'こあら', 'きつね', 'うさぎ', 'さかな', 'ひかり'];
// 2回出る文字は何種類でもよい。1回だけの文字を左から読むと3文字
const PAIR_SHOWN = [
  'あみんあるくん',
  'いさついくねつらね',
  'さいつるさつか',
  'あすめあいよめかんよん',
  'いめすいだよすかよ',
  'いこついあつら',
  'あきさあつよさねよ',
  'かうんかさよんぎせよせ',
  'いさついかつな',
  'あひすあかよすりよ',
];

const SHIFT_PLUS = ['たさか', 'んあか', 'おああ', 'こあう', 'とああ', 'のああ', 'ほあお', 'もあを', 'よあい', 'そああ'];
const SHIFT_MINUS = ['いうさ', 'きうお', 'しうき', 'ちうき', 'にうき', 'ひうき', 'みうく', 'ゆおう', 'りうき', 'いうす'];
const SHIFT_DIR_WORDS = ['んあほ', 'きうの', 'こあは', 'ちうな', 'とあも', 'ひうへ', 'ほいし', 'ゆくあ', 'よきこ', 'いうむ'];
const SHIFT_N_WORDS = ['をんほ', 'けおへ', 'こあひ', 'とかほ', 'ぬえい', 'なろひ', 'ふんや', 'ゆけす', 'をつか', 'ろわへ'];
const CUT_WORDS = ['うあいて', 'うくみ', 'さいたあ', 'あたいそ', 'いねし', 'はいちあ', 'あまいり', 'ねあこ', 'らいむあ', 'うあいぬ'];
const REPLACE_POS = [
  { word: 'ういぬ', x: 'あ', index: 0 },
  { word: 'かあて', x: 'い', index: 1 },
  { word: 'さいあ', x: 'ち', index: 2 },
  { word: 'あいち', x: 'た', index: 0 },
  { word: 'なあふ', x: 'い', index: 1 },
  { word: 'はいあ', x: 'つ', index: 2 },
  { word: 'あいる', x: 'ま', index: 0 },
  { word: 'やあふ', x: 'き', index: 1 },
  { word: 'らいあ', x: 'ん', index: 2 },
  { word: 'ういひ', x: 'あ', index: 0 },
];

function numberOrder(rows) {
  const answer = rows.slice().sort((a, b) => a.n - b.n).map((row) => row.ch).join('');
  return {
    items: seqPairs(rows.map((row) => [row.ch, DIGIT[row.n]])),
    answer,
  };
}

function signedShift(rows) {
  return {
    items: seqPairs(rows.map((row) => [row.ch, row.sign > 0 ? '＋' : 'ー', DIGIT[row.n]])),
    answer: rows.map((row) => shiftKana(row.ch, row.sign * row.n)).join(''),
  };
}

function markedShift(rows, next) {
  return {
    items: seqPairs(rows.map((row) => [row.ch, row.mark])),
    answer: rows.map(next).join(''),
  };
}

// 例「は↓む↑ち↓」は、↓で進み ↑で戻すと「ひみつ」
function arrowDelta(arrow) {
  if (arrow === '↓') return 1;
  if (arrow === '↑') return -1;
  return 0;
}

const NUMBER_ROWS = [
  [{ ch: 'か', n: 2 }, { ch: 'さ', n: 1 }, { ch: 'な', n: 3 }],
  [{ ch: 'そ', n: 3 }, { ch: 'あ', n: 1 }, { ch: 'い', n: 2 }],
  [{ ch: 'い', n: 2 }, { ch: 'こ', n: 3 }, { ch: 'か', n: 1 }],
  [{ ch: 'た', n: 1 }, { ch: 'こ', n: 3 }, { ch: 'い', n: 2 }],
  [{ ch: 'す', n: 3 }, { ch: 'い', n: 2 }, { ch: 'な', n: 1 }],
  [{ ch: 'は', n: 1 }, { ch: 'し', n: 3 }, { ch: 'い', n: 2 }],
  [{ ch: 'い', n: 2 }, { ch: 'ま', n: 1 }, { ch: 'と', n: 3 }],
  [{ ch: 'や', n: 3 }, { ch: 'や', n: 1 }, { ch: 'お', n: 2 }],
  [{ ch: 'ら', n: 1 }, { ch: 'い', n: 2 }, { ch: 'せ', n: 3 }],
  [{ ch: 'い', n: 2 }, { ch: 'こ', n: 3 }, { ch: 'さ', n: 1 }],
];

const SIGN_ROWS = [
  [{ ch: 'か', sign: 1, n: 2 }, { ch: 'る', sign: -1, n: 1 }, { ch: 'き', sign: -1, n: 6 }],
  [{ ch: 'た', sign: 1, n: 1 }, { ch: 'さ', sign: 1, n: 1 }, { ch: 'か', sign: 1, n: 1 }],
  [{ ch: 'し', sign: -1, n: 1 }, { ch: 'ん', sign: 1, n: 2 }, { ch: 'す', sign: -1, n: 1 }],
  [{ ch: 'ん', sign: 1, n: 1 }, { ch: 'わ', sign: 1, n: 2 }, { ch: 'ら', sign: -1, n: 1 }],
  [{ ch: 'つ', sign: 1, n: 3 }, { ch: 'え', sign: -1, n: 2 }, { ch: 'て', sign: 1, n: 1 }],
  [{ ch: 'ふ', sign: -1, n: 2 }, { ch: 'あ', sign: 1, n: 1 }, { ch: 'て', sign: -1, n: 3 }],
  [{ ch: 'ひ', sign: 1, n: 4 }, { ch: 'う', sign: -1, n: 1 }, { ch: 'や', sign: 1, n: 2 }],
  [{ ch: 'も', sign: 1, n: 1 }, { ch: 'お', sign: 1, n: 1 }, { ch: 'る', sign: -1, n: 2 }],
  [{ ch: 'り', sign: -1, n: 1 }, { ch: 'を', sign: 1, n: 3 }, { ch: 'へ', sign: -1, n: 1 }],
  [{ ch: 'れ', sign: 1, n: 5 }, { ch: 'え', sign: -1, n: 2 }, { ch: 'ち', sign: 1, n: 1 }],
];

const UP_DOWN = [
  [{ ch: 'は', mark: '↓' }, { ch: 'む', mark: '↑' }, { ch: 'ち', mark: '↓' }],
  [{ ch: 'ん', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'ち', mark: '↓' }],
  [{ ch: 'き', mark: '↑' }, { ch: 'あ', mark: '↓' }, { ch: 'す', mark: '↑' }],
  [{ ch: 'こ', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'さ', mark: '↓' }],
  [{ ch: 'そ', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'さ', mark: '↓' }],
  [{ ch: 'に', mark: '↑' }, { ch: 'あ', mark: '↓' }, { ch: 'な', mark: '↑' }],
  [{ ch: 'ほ', mark: '↓' }, { ch: 'あ', mark: '↓' }, { ch: 'ら', mark: '↑' }],
  [{ ch: 'ゆ', mark: '↑' }, { ch: 'お', mark: '↓' }, { ch: 'り', mark: '↑' }],
  [{ ch: 'よ', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'ひ', mark: '↓' }],
  [{ ch: 'ん', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'つ', mark: '↓' }],
];

const FLICK = [
  [{ ch: 'あ', mark: '↓' }, { ch: 'た', mark: '↓' }, { ch: 'ま', mark: '→' }],
  [{ ch: 'お', mark: '←' }, { ch: 'い', mark: '↑' }, { ch: 'よ', mark: '→' }],
  [{ ch: 'き', mark: '↓' }, { ch: 'え', mark: '↑' }, { ch: 'ち', mark: '↓' }],
  [{ ch: 'そ', mark: '←' }, { ch: 'え', mark: '↑' }, { ch: 'お', mark: '→' }],
  [{ ch: 'つ', mark: '→' }, { ch: 'あ', mark: '←' }, { ch: 'た', mark: '↓' }],
  [{ ch: 'ね', mark: '↑' }, { ch: 'ん', mark: '↓' }, { ch: 'そ', mark: '←' }],
  [{ ch: 'へ', mark: '↑' }, { ch: 'か', mark: '↑' }, { ch: 'せ', mark: '↓' }],
  [{ ch: 'む', mark: '→' }, { ch: 'か', mark: '←' }, { ch: 'み', mark: '↑' }],
  [{ ch: 'も', mark: '↓' }, { ch: 'を', mark: '→' }, { ch: 'ひ', mark: '←' }],
  [{ ch: 'ろ', mark: '↓' }, { ch: 'う', mark: '↑' }, { ch: 'き', mark: '→' }],
];

const FLICK_NUM = [
  [{ ch: '３', mark: '←' }, { ch: '２', mark: '→' }, { ch: '０', mark: '↓' }],
  [{ ch: '２', mark: '←' }, { ch: '１', mark: '↑' }, { ch: '０', mark: '↓' }],
  [{ ch: '３', mark: '←' }, { ch: '１', mark: '←' }, { ch: '９', mark: '↑' }],
  [{ ch: '４', mark: '←' }, { ch: '１', mark: '↓' }, { ch: '０', mark: '↓' }],
  [{ ch: '５', mark: '←' }, { ch: '２', mark: '↓' }, { ch: '７', mark: '←' }],
  [{ ch: '６', mark: '←' }, { ch: '１', mark: '↑' }, { ch: '４', mark: '←' }],
  [{ ch: '７', mark: '←' }, { ch: '１', mark: '↓' }, { ch: '７', mark: '↓' }],
  [{ ch: '８', mark: '←' }, { ch: '１', mark: '↑' }, { ch: '６', mark: '←' }],
  [{ ch: '８', mark: '→' }, { ch: '１', mark: '←' }, { ch: '７', mark: '↑' }],
  [{ ch: '１', mark: '←' }, { ch: '１', mark: '↓' }, { ch: '０', mark: '↓' }],
];

const TABLE_SHIFT = [
  [{ ch: 'あ', mark: '←' }, { ch: 'き', mark: '→' }, { ch: 'せ', mark: '←' }],
  [{ ch: 'か', mark: '←' }, { ch: 'き', mark: '→' }, { ch: 'ち', mark: '→' }],
  [{ ch: 'さ', mark: '←' }, { ch: 'き', mark: '→' }, { ch: 'し', mark: '←' }],
  [{ ch: 'か', mark: '→' }, { ch: 'い', mark: '←' }, { ch: 'に', mark: '→' }],
  [{ ch: 'た', mark: '←' }, { ch: 'あ', mark: '↓' }, { ch: 'へ', mark: '↑' }],
  [{ ch: 'ま', mark: '→' }, { ch: 'う', mark: '←' }, { ch: 'た', mark: '↓' }],
  [{ ch: 'は', mark: '←' }, { ch: 'く', mark: '→' }, { ch: 'お', mark: '↑' }],
  [{ ch: 'ま', mark: '←' }, { ch: 'し', mark: '→' }, { ch: 'む', mark: '↓' }],
  [{ ch: 'わ', mark: '→' }, { ch: 'せ', mark: '←' }, { ch: 'を', mark: '↓' }],
  [{ ch: 'あ', mark: '←' }, { ch: 'き', mark: '→' }, { ch: 'の', mark: '↑' }],
];

const SORT_WORDS = ['ねつき', 'むあい', 'んさも', 'りたよ', 'やのみ', 'んひれ', 'れまみ', 'んよろ', 'すかけ', 'んりろ'];

const CUT_KINDS = [
  ['さいしょをけせ', 0],
  ['まんなかをけせ', 1],
  ['さいごをけせ', 3],
];

const REPLACE_KINDS = ['さいしょを', 'まんなかを', 'さいごを'];
const SHIFT_DIR = [
  ['１こあとにずらせ', 1],
  ['１こまえにずらせ', -1],
];
const N_SHIFT = [
  ['２こあとにずらせ', 2],
  ['３こまえにずらせ', -3],
  ['１こあとにずらせ', 1],
  ['４こまえにずらせ', -4],
  ['２こまえにずらせ', -2],
  ['５こあとにずらせ', 5],
  ['３こあとにずらせ', 3],
  ['１こまえにずらせ', -1],
  ['６こまえにずらせ', -6],
  ['４こあとにずらせ', 4],
];

const XY = [
  ['う', 'あ', 'ういひ'],
  ['あ', 'か', 'あいと'],
  ['あ', 'さ', 'あいと'],
  ['あ', 'た', 'あいつ'],
  ['あ', 'な', 'あいむ'],
  ['あ', 'は', 'あいと'],
  ['あ', 'ま', 'あうえ'],
  ['あ', 'や', 'あきめ'],
  ['あ', 'ら', 'あかん'],
  ['う', 'あ', 'ういま'],
];

function cutBoard(word, problem, index) {
  return {
    problem,
    items: spreadWord(word, [1, 2, 3, 4]),
    answer: dropAt(word, index),
  };
}

function replacePosBoard(word, kind, x, place) {
  const at = kind === 'さいしょを' ? 0 : kind === 'まんなかを' ? 1 : 2;
  const list = charsOf(word);
  const answer = list.slice();
  answer[at] = x;
  return {
    problem: `${kind}${x}にしろ`,
    items: spreadWord(word, UNEVEN3[place]),
    answer: answer.join(''),
  };
}

function guide(lines) {
  return `<ol class="guide-list">${lines.map((line) => `<li>${line}</li>`).join('')}</ol>`;
}

function stage(id, group, title, summary, problem, cases, lines) {
  const [main, ...tests] = cases;
  return {
    id,
    saveKey: id,
    requires: '0-7',
    group,
    label: `ステージ ${id}`,
    title,
    summary,
    problem: main.problem || problem,
    main,
    tests,
    ops: MAIN_OPS,
    allowSubs: true,
    lockedOps: [],
    calcMods: ['ひらがな', '数字'],
    guide: guide(lines),
  };
}

const MAIN_STAGES = [
  stage('1-1', '本編', 'ひだりからよめ', '左から3文字を読もう', 'ひだりからよめ', readCases(READ), [
    '下の段の文字を、<b>左から</b>読んだものが答えです。場所は毎回変わります。',
    `ゴールで ${CHIP.SAY}。A → B → C が答えです。`,
  ]),
  stage('1-2', '本編', 'みぎからよめ', '右から3文字を読もう', 'みぎからよめ', reverseCases(READ), [
    '下の段の文字を、<b>右から</b>読んだものが答えです。',
    `ゴールで ${CHIP.SAY}。`,
  ]),
  stage('1-3', '本編', 'はをきにしろ', '「は」を「き」に変えて言おう', 'はをきにしろ', HA.map((word, i) => ({
    items: spreadWord(word, UNEVEN3[i]),
    answer: replaceHa(word),
  })), [
    '拾った文字の <b>は</b> を <b>き</b> に変えて、3文字で答えます。',
  ]),
  stage('1-4', '本編', 'まんなかをけせ', '3文字の真ん中を抜いて2文字で言おう', 'まんなかをけせ', MID3.map((word, i) => ({
    items: spreadWord(word, UNEVEN3[i]),
    answer: dropAt(word, 1),
  })), [
    '下の段に3文字があります。場所は毎回変わります。真ん中を抜いた<b>2文字</b>が答えです。',
  ]),
  stage('1-5', '本編', 'たをけせ', '「た」を全部抜いて、残った3文字を言おう', 'たをけせ', TA_SHOWN.map((shown) => ({
    items: spreadWord(shown, charsOf(shown).map((_, k) => k + 1)),
    answer: shown.replace(/た/g, ''),
  })), [
    '<b>た</b> を全部抜いて、残った文字を左から読みます。<b>た</b> は何個あっても大丈夫です。答えは3文字で、<b>た</b> は入りません。',
  ]),
  stage('1-6', '本編', 'ぺあをけせ', '2回出ている文字を消そう', 'ぺあをけせ', PAIR_SHOWN.map((shown) => ({
    items: spreadWord(shown, charsOf(shown).map((_, k) => k + 1)),
    answer: dropPairs(shown),
  })), [
    '<b>2回</b>出ている文字は、両方消します。2回出る文字は、何種類あっても大丈夫です。1回だけの文字を左から読むと3文字です。',
  ]),

  stage('2-1', 'inc&dec', '１こあとにずらせ', '五十音で一つ進めた文字を言おう', '１こあとにずらせ', SHIFT_PLUS.map((word, i) => ({
    items: spreadWord(word, UNEVEN3[i]),
    answer: charsOf(word).map((ch) => shiftKana(ch, 1)).join(''),
  })), [
    '拾ったひらがなを、五十音で <b>一つ進めて</b> 答えます。',
    '「ん」の次は「あ」です。濁点・半濁点はありません。',
  ]),
  stage('2-2', 'inc&dec', '１こまえにずらせ', '五十音で一つ戻した文字を言おう', '１こまえにずらせ', SHIFT_MINUS.map((word, i) => ({
    items: spreadWord(word, UNEVEN3[i]),
    answer: charsOf(word).map((ch) => shiftKana(ch, -1)).join(''),
  })), [
    '拾ったひらがなを、五十音で <b>一つ戻して</b> 答えます。',
    '「あ」の前は「ん」です。',
  ]),

  stage('3-1', '123…', 'すうじじゅんによめ', '横の数字が小さい順に読もう', 'すうじじゅんによめ', NUMBER_ROWS.map(numberOrder), [
    '文字の横に数字があります。例は「か２ さ１ な３」で、答えは <b>さかな</b> です。',
    '数字の小さい順に、3文字を言います。',
  ]),
  stage('3-2', '123…', '５０おんでずらせ', '＋とーの数だけ五十音をずらそう', '５０おんでずらせ', SIGN_ROWS.map(signedShift), [
    '文字の横に、＋かーと数字があります。例は「か＋２ るー１ きー６」。',
    '数字のマスを SCAN して、その記憶を X にします。＋なら足す、ーなら引きます。２と2は同じです。',
    'その数だけ五十音を進めるか戻して、3文字を言います。「ん」の次は「あ」、「あ」の前は「ん」です。',
  ]),

  stage('4-1', '↑→↓←', '５０おんでずらせ（↑↓）', '↓で進めて、↑で戻そう', 'やじるしでずらせ', UP_DOWN.map((rows) => markedShift(rows, (row) => shiftKana(row.ch, arrowDelta(row.mark)))), [
    '↓ は五十音で一つ進む、↑ は一つ戻る、にしています。',
    '「は↓ む↑ ち↓」の答えは <b>ひみつ</b> です。',
  ]),
  stage('4-2', '↑→↓←', 'ふりっくしろ', '矢印の数だけ五十音を進もう', 'ふりっくしろ', FLICK.map((rows) => markedShift(rows, (row) => shiftKana(row.ch, flickDelta(row.ch, row.mark)))), [
    '←は＋１、↑は＋２、→は＋３、↓は＋４です。',
    '「や」「わ」のときは、↑が＋１、↓が＋２です。',
  ]),
  stage('4-3', '↑→↓←', 'ふりっくしろ（数字）', '数字のキーをフリックしよう', 'すうじふりっく', FLICK_NUM.map((rows) => markedShift(rows, (row) => shiftKana(FLICK_KEY[row.ch], flickDelta(FLICK_KEY[row.ch], row.mark)))), [
    '１あ ２か ３さ ４た ５な ６は ７ま ８や ９ら ０わ、です。',
    '「３← ２→ ０↓」の答えは <b>しけん</b> です。や・わ の ↑↓ は短いフリックです。',
  ]),
  stage('4-4', '↑→↓←', '５０おんひょうでずらせ', '五十音表のマスを矢印の方向へずらそう', '５０おんひょうでずらせ', TABLE_SHIFT.map((rows) => markedShift(rows, (row) => tableShift(row.ch, row.mark))), [
    '五十音表で、→ は「あ」の列の方、← は反対へ動きます。',
    '「あ←」は「か」、「く→」は「う」です。あいうえお の → は端なので使っていません。',
  ]),

  stage('5-1', '問題文もみる', 'けすところ', '問題文が、最初・真ん中・最後のどれを消すか決める', 'まんなかをけせ', CUT_WORDS.map((word, i) => {
    const [problem, index] = CUT_KINDS[i % CUT_KINDS.length];
    return cutBoard(word, problem, index);
  }), [
    '問題文は「さいしょをけせ」「まんなかをけせ」「さいごをけせ」のどれかです。上の段を読みます。',
    '「さいしょをけせ」は4文字の最初、「さいごをけせ」は4文字の最後を抜いた3文字です。「まんなかをけせ」は3文字の真ん中を抜いた2文字です。',
  ]),
  stage('5-2', '問題文もみる', 'Ｘをけせ', '問題文の文字を盤面から抜こう', 'たをけせ', PAIR_WORDS.map((word, i) => {
    const x = PAIR_EXTRA[i];
    const text = charsOf(word)[0] + x + charsOf(word).slice(1).join('');
    return {
      problem: `${x}をけせ`,
      items: spreadWord(text, charsOf(text).map((_, k) => k + 1)),
      answer: word,
    };
  }), [
    '問題文は「〇をけせ」です。〇に入ったひらがなを、上の段から拾います。',
    '下の段からその文字を全部抜いて、残った3文字を左から読みます。',
  ]),
  stage('5-3', '問題文もみる', 'Ｘにしろ', '最初・真ん中・最後を、問題文の文字に変えよう', 'さいしょをあにしろ', REPLACE_POS.map((row, i) => replacePosBoard(row.word, REPLACE_KINDS[row.index], row.x, i)), [
    '問題文は「さいしょを〇にしろ」「まんなかを〇にしろ」「さいごを〇にしろ」のどれかです。',
    '3文字の、最初・真ん中（2文字目）・最後を、〇のひらがなに変えます。',
  ]),
  stage('5-4', '問題文もみる', 'ＸをＹにしろ', '問題文の通りに、1文字を別の文字へ変えよう', 'はをきにしろ', XY.map(([x, y, word], i) => ({
    problem: `${x}を${y}にしろ`,
    items: spreadWord(word, UNEVEN3[i]),
    answer: charsOf(word).map((ch) => (ch === x ? y : ch)).join(''),
  })), [
    '問題文は「〇を△にしろ」です。上の段から、どの文字をどの文字にするか読みます。',
    '下の段の〇を△に変えて、3文字で答えます。',
  ]),
  stage('5-5', '問題文もみる', '１こずらす', '進むか戻るかは、問題文が決める', '１こあとにずらせ', SHIFT_DIR_WORDS.map((word, i) => {
    const [problem, delta] = SHIFT_DIR[i % 2];
    return {
      problem,
      items: spreadWord(word, UNEVEN3[i]),
      answer: charsOf(word).map((ch) => shiftKana(ch, delta)).join(''),
    };
  }), [
    '問題文は「１こあとにずらせ」か「１こまえにずらせ」です。上の段を読みます。',
    '五十音で一つ進めるか、一つ戻します。「ん」の次は「あ」です。',
  ]),
  stage('5-6', '問題文もみる', 'Ｎこずらす', 'いくつずらすかも、問題文を見よう', '２こあとにずらせ', SHIFT_N_WORDS.map((word, i) => {
    const [problem, delta] = N_SHIFT[i];
    return {
      problem,
      items: spreadWord(word, UNEVEN3[i]),
      answer: charsOf(word).map((ch) => shiftKana(ch, delta)).join(''),
    };
  }), [
    '問題文は「Ｎこあとにずらせ」か「Ｎこまえにずらせ」です。Ｎも方向も上の段にあります。',
    '上の段の数字を SCAN して、その記憶を X にします。２と2は同じです。その数だけ五十音を進めるか戻します。「ん」の次は「あ」です。',
  ]),

  stage('6-1', 'えぐそう', 'ちいさいじゅんによめ', '横の数字が小さい順に並べて読もう', 'ちいさいじゅんによめ', [
    [{ ch: 'ね', n: 8 }, { ch: 'き', n: 2 }, { ch: 'つ', n: 5 }],
    [{ ch: 'ち', n: 9 }, { ch: 'あ', n: 1 }, { ch: 'い', n: 4 }],
    [{ ch: 'い', n: 6 }, { ch: 'さ', n: 3 }, { ch: 'さ', n: 7 }],
    [{ ch: 'た', n: 2 }, { ch: 'さ', n: 9 }, { ch: 'い', n: 4 }],
    [{ ch: 'い', n: 5 }, { ch: 'な', n: 1 }, { ch: 'ち', n: 8 }],
    [{ ch: 'そ', n: 7 }, { ch: 'は', n: 3 }, { ch: 'い', n: 6 }],
    [{ ch: 'い', n: 4 }, { ch: 'む', n: 9 }, { ch: 'ま', n: 2 }],
    [{ ch: 'や', n: 1 }, { ch: 'い', n: 6 }, { ch: 'か', n: 3 }],
    [{ ch: 'と', n: 8 }, { ch: 'い', n: 5 }, { ch: 'ら', n: 2 }],
    [{ ch: 'い', n: 3 }, { ch: 'さ', n: 7 }, { ch: 'か', n: 1 }],
  ].map(numberOrder), [
    '文字の横の数字を見て、<b>小さい順</b>に3文字を言います。',
  ]),
  stage('6-2', 'えぐそう', '５０おんじゅんによめ', '五十音の順に並べ替えよう', '５０おんじゅんによめ', SORT_WORDS.map((word, i) => ({
    items: spreadWord(word, UNEVEN3[i]),
    answer: gojuonSort(word),
  })), [
    '3文字を五十音の順に並べ替えます。「ねつき」は <b>きつね</b> です。',
  ]),
];

STAGES.push(...MAIN_STAGES);
