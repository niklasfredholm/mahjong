'use strict';
const fs = require('fs');
const path = require('path');
const { install } = require('./dom-stub.cjs');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('  FAIL:', msg); } else console.log('  ok:', msg); };

function boot(seedStore) {
  const env = install(html);
  if (seedStore) seedStore(env.store);
  global.window = env.win;
  global.document = env.win.document;
  global.localStorage = env.win.localStorage;
  try { Object.defineProperty(global, "navigator", { value: env.win.navigator, configurable: true }); } catch (e) {}
  global.setTimeout = env.win.setTimeout;
  global.clearTimeout = env.win.clearTimeout;
  global.setInterval = env.win.setInterval;
  for (const f of ['layouts.js', 'tiles.js', 'engine.js', 'ui.js']) {
    const p = path.join(ROOT, 'js', f);
    delete require.cache[require.resolve(p)];
    require(p);
  }
  env.flush();
  return env;
}

// Rebuild the game state purely from what is on screen, so the test never
// reaches into the app's internals.
function readBoard(env) {
  const { Layouts, Tiles, Engine } = env.win;
  const layout = Layouts.all.find(l => l.name === env.byId['stat-layout'].textContent);
  const slots = Engine.analyse(layout);
  const tiles = env.byId.board.children;
  const labelToId = {};
  Tiles.faces.forEach(f => { labelToId[f.label] = f.id; });
  const faces = tiles.map(t => labelToId[t.getAttribute('aria-label')]);
  const present = tiles.map(t => !t.classList.contains('hidden'));
  return { layout, slots, faces, present, tiles, Engine, Tiles };
}

console.log('\n== a full game, played through the real click handlers ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"turtle"'));
  const start = readBoard(env);
  check(start.tiles.length === 144, 'turtle board rendered 144 tile elements');
  check(Number(env.byId['stat-left'].textContent) === 144, 'counter shows 144 tiles left');
  check(start.faces.every(Boolean), 'every tile element carries a readable face label');

  let moves = 0, shuffles = 0, undos = 0;
  for (let guard = 0; guard < 900; guard++) {
    const b = readBoard(env);
    if (b.present.every(p => !p)) break;
    const options = b.Engine.availableMoves(b.slots, b.faces, b.present);
    if (!options.length) {
      env.byId['btn-shuffle'].click(); env.flush();
      if (env.byId.stuck.hidden === false) {      // shuffling could not rescue it
        env.byId['btn-stuck-undo'].click(); env.flush(); undos++;
      } else shuffles++;
      continue;
    }
    const [a, c] = options[Math.floor(Math.random() * options.length)];
    b.tiles[a].click(); env.flush();
    b.tiles[c].click(); env.flush();
    moves++;
  }

  const end = readBoard(env);
  check(undos < 40, `escaped every dead end within 40 undos (used ${undos})`);
  check(end.present.every(p => !p), `board fully cleared in ${moves} moves (${shuffles} shuffles, ${undos} forced undos)`);
  check(Number(env.byId['stat-left'].textContent) === 0, 'counter reached zero');
  check(env.byId.win.hidden === false, 'win screen appeared');
  check(env.store.get('mahjong.save') === undefined, 'finished game cleared its autosave');
  check(/cleared in/.test(env.byId['win-detail'].textContent), 'win screen reports a result');
  check(typeof JSON.parse(env.store.get('mahjong.bests')).turtle === 'number', 'best time was recorded');
}

console.log('\n== tapping a blocked tile is refused, not silently accepted ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"turtle"'));
  const b = readBoard(env);
  const blockedIdx = b.slots.findIndex(s => !b.Engine.isFree(s, b.present));
  b.tiles[blockedIdx].click(); env.flush();
  const after = readBoard(env);
  check(after.present[blockedIdx] === true, 'blocked tile stays on the board');
  check(Number(env.byId['stat-left'].textContent) === 144, 'no tile was removed');
  check(after.tiles.filter(t => t.classList.contains('selected')).length === 0, 'blocked tile did not become selected');
}

console.log('\n== selecting, deselecting and mismatches ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"garden"'));
  const b = readBoard(env);
  const free = b.Engine.freeIndices(b.slots, b.present);
  const first = free[0];
  b.tiles[first].click(); env.flush();
  check(readBoard(env).tiles[first].classList.contains('selected'), 'tapping a free tile selects it');
  b.tiles[first].click(); env.flush();
  check(!readBoard(env).tiles[first].classList.contains('selected'), 'tapping it again deselects it');

  const mismatch = free.find(i => i !== first && !b.Tiles.matches(b.faces[i], b.faces[first]));
  b.tiles[first].click(); env.flush();
  b.tiles[mismatch].click(); env.flush();
  const after = readBoard(env);
  check(after.present[first] && after.present[mismatch], 'a non-matching pair removes nothing');
  check(after.tiles[mismatch].classList.contains('selected'), 'selection moves to the newly tapped tile');
}

console.log('\n== undo ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"garden"'));
  check(env.byId['btn-undo'].disabled === true, 'undo is disabled before any move');
  const b = readBoard(env);
  const [a, c] = b.Engine.availableMoves(b.slots, b.faces, b.present)[0];
  b.tiles[a].click(); b.tiles[c].click(); env.flush();
  check(Number(env.byId['stat-left'].textContent) === 86, 'a match removed two tiles');
  check(env.byId['btn-undo'].disabled === false, 'undo became available');
  env.byId['btn-undo'].click(); env.flush();
  const after = readBoard(env);
  check(after.present[a] && after.present[c], 'undo put both tiles back');
  check(Number(env.byId['stat-left'].textContent) === 88, 'counter restored');
  check(env.byId['btn-undo'].disabled === true, 'undo disabled again at the start of the game');
}

console.log('\n== shuffle, and undoing a shuffle ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"garden"'));
  const before = readBoard(env).faces.slice();
  env.byId['btn-shuffle'].click(); env.flush();
  const shuffled = readBoard(env).faces.slice();
  check(before.join() !== shuffled.join(), 'shuffle rearranged the tiles');
  check(before.slice().sort().join() === shuffled.slice().sort().join(), 'shuffle kept exactly the same tiles');
  const b = readBoard(env);
  check(b.Engine.availableMoves(b.slots, b.faces, b.present).length > 0, 'shuffled board still has a legal move');
  env.byId['btn-undo'].click(); env.flush();
  check(readBoard(env).faces.join() === before.join(), 'undo reverted the shuffle');
}

console.log('\n== the game survives being closed mid-play ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"pyramid"'));
  for (let i = 0; i < 5; i++) {
    const b = readBoard(env);
    const [a, c] = b.Engine.availableMoves(b.slots, b.faces, b.present)[0];
    b.tiles[a].click(); b.tiles[c].click(); env.flush();
  }
  const mid = readBoard(env);
  const saved = env.store.get('mahjong.save');
  check(!!saved, 'a game in progress is autosaved');

  const env2 = boot(s => { for (const [k, v] of env.store) s.set(k, v); });   // relaunch
  const resumed = readBoard(env2);
  check(env2.byId['stat-layout'].textContent === 'Pyramid', 'reopened on the same board');
  check(Number(env2.byId['stat-left'].textContent) === 110, 'reopened with 110 tiles left');
  check(resumed.faces.join() === mid.faces.join(), 'tile faces restored exactly');
  check(resumed.present.join() === mid.present.join(), 'cleared tiles stayed cleared');
}


console.log('\n== the dimming matches the rules exactly ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"turtle"'));
  const b = readBoard(env);
  const dimmed = b.tiles.map(t => t.classList.contains('blocked'));
  const shouldDim = b.slots.map(s => !b.Engine.isFree(s, b.present));
  check(dimmed.join() === shouldDim.join(), 'every dimmed tile is exactly one that cannot be lifted');
  const free = dimmed.filter(d => !d).length;
  check(free === 35, `35 of 144 turtle tiles shown as liftable (got ${free})`);

  const at = (x, y, z) => b.slots.findIndex(s => s.x === x && s.y === y && s.z === z);
  check(dimmed[at(13, 3.5, 0)] === true,  'the turtle head is dimmed (blocked both sides)');
  check(dimmed[at(14, 3.5, 0)] === false, 'the nose beyond it is not dimmed');
  check(dimmed[at(0, 3.5, 0)] === false,  'the tail is not dimmed');
  check(dimmed[at(6.5, 3.5, 4)] === false, 'the capstone is not dimmed');
  check(dimmed[at(6, 3, 3)] === true,     'the tile under the capstone is dimmed');

  // Turning the setting off must clear the dimming without changing play.
  env.byId['btn-showfree'].click(); env.flush();
  check(readBoard(env).tiles.every(t => !t.classList.contains('blocked')), 'dimming can be switched off');
  env.byId['btn-showfree'].click(); env.flush();
  check(readBoard(env).tiles.filter(t => t.classList.contains('blocked')).length === 109, 'and switched back on');
}


console.log('\n== a dead board announces itself ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"turtle"'));
  const startFreshTurtle = () => {
    env.byId['btn-menu'].click(); env.flush();
    const turtleRow = env.byId['layout-list'].children.find(c => /Turtle/.test(c.innerHTML));
    turtleRow.click(); env.flush();
  };

  let stuckAfter = -1, attempts = 0;
  // Greedy play strands the turtle often, but not every deal; try a few.
  for (attempts = 1; attempts <= 12 && stuckAfter < 0; attempts++) {
    let played = 0;
    for (let i = 0; i < 100; i++) {
      const b = readBoard(env);
      if (b.present.every(p => !p)) break;
      const opts = b.Engine.availableMoves(b.slots, b.faces, b.present);
      if (!opts.length) { stuckAfter = played; break; }
      b.tiles[opts[0][0]].click(); b.tiles[opts[0][1]].click(); env.flush();
      played++;
    }
    if (stuckAfter < 0) startFreshTurtle();
  }

  check(stuckAfter >= 0, `greedy play stranded a turtle board after ${stuckAfter} moves (deal ${attempts - 1})`);
  check(env.byId.stuck.hidden === false, 'the "no moves left" screen appeared on its own');

  const before = Number(env.byId['stat-left'].textContent);
  const shuffleOffered = env.byId['btn-stuck-shuffle'].hidden === false;
  check(true, shuffleOffered ? 'the screen offered a shuffle' : 'the screen withdrew the shuffle (dead by geometry)');

  if (shuffleOffered) {
    env.byId['btn-stuck-shuffle'].click(); env.flush();
    check(Number(env.byId['stat-left'].textContent) === before, 'shuffling removes no tiles');
  } else {
    env.byId['btn-stuck-undo'].click(); env.flush();
    check(Number(env.byId['stat-left'].textContent) === before + 2, 'undo put a pair back');
  }
  check(env.byId.stuck.hidden === true, 'taking the offered escape dismisses the screen');
  const b2 = readBoard(env);
  check(b2.Engine.availableMoves(b2.slots, b2.faces, b2.present).length > 0, 'and leaves a playable board');
}


console.log('\n== a stack that cannot be matched is called out honestly ==');
{
  // Restore a crafted position: the only survivors are two tiles stacked
  // directly on top of each other, which no shuffle can ever separate.
  const probe = boot();
  const { Layouts, Engine } = probe.win;
  const layout = Layouts.byId('turtle');
  const slots = Engine.analyse(layout);
  const lower = slots.findIndex(s => s.z === 0 && slots.some(o => o.z === 1 && o.x === s.x && o.y === s.y));
  const upper = slots.findIndex(s => s.z === 1 && s.x === slots[lower].x && s.y === slots[lower].y);
  const faces = Engine.deal(layout, 4242).faces.slice();
  faces[lower] = 'pin5'; faces[upper] = 'pin5';
  const spareA = slots.findIndex((s, i) => i !== lower && i !== upper && s.z === 0);
  const spareB = slots.findIndex((s, i) => i !== lower && i !== upper && i !== spareA && s.z === 0);
  faces[spareA] = 'man3'; faces[spareB] = 'man3';
  const present = slots.map((_, i) => i === lower || i === upper);

  const env = boot(st => {
    st.set('mahjong.lastLayout', '"turtle"');
    st.set('mahjong.save', JSON.stringify({
      layout: 'turtle', seed: 1, faces, present,
      undo: [{ t: 'm', a: spareA, b: spareB }], moves: 71, shuffles: 0, elapsed: 60000
    }));
  });

  check(Number(env.byId['stat-left'].textContent) === 2, 'restored the crafted two-tile position');
  const b = readBoard(env);
  check(b.Engine.availableMoves(b.slots, b.faces, b.present).length === 0, 'the two tiles cannot be matched');
  check(b.Engine.reshuffle(b.slots, b.faces, b.present, 7) === null, 'and no shuffle can rescue them');

  env.byId['btn-shuffle'].click(); env.flush();
  check(env.byId.stuck.hidden === false, 'tapping Shuffle explains the situation instead of failing silently');
  check(env.byId['stuck-title'].textContent === 'This board cannot be finished', 'the screen says the board is unfinishable');
  check(env.byId['btn-stuck-shuffle'].hidden === true, 'the Shuffle button is withdrawn, not left as a dead end');
  check(env.byId['btn-stuck-undo'].hidden === false, 'undo is offered');
  check(env.byId['btn-stuck-undo'].classList.contains('primary'), 'undo is promoted to the primary action');

  env.byId['btn-stuck-undo'].click(); env.flush();
  check(Number(env.byId['stat-left'].textContent) === 4, 'undo restored the pair');
  const after = readBoard(env);
  check(after.Engine.availableMoves(after.slots, after.faces, after.present).length > 0,
        'and the board is playable again');
}

console.log('\n== hint always points at a genuinely legal pair ==');
{
  const env = boot(s => s.set('mahjong.lastLayout', '"turtle"'));
  for (let round = 0; round < 12; round++) {
    env.byId['btn-hint'].click(); env.flush();
    const b = readBoard(env);
    const hinted = b.tiles.map((t, i) => [t, i]).filter(([t]) => t.classList.contains('hinted')).map(([, i]) => i);
    if (hinted.length !== 2) { check(false, 'hint highlighted exactly two tiles'); break; }
    const [a, c] = hinted;
    if (!b.Tiles.matches(b.faces[a], b.faces[c]) ||
        !b.Engine.isFree(b.slots[a], b.present) || !b.Engine.isFree(b.slots[c], b.present)) {
      check(false, 'hint pointed at an illegal pair'); break;
    }
    b.tiles[a].click(); b.tiles[c].click(); env.flush();
  }
  check(true, 'twelve consecutive hints were all legal, free, matching pairs');
}

console.log(failures === 0 ? '\nALL UI TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
