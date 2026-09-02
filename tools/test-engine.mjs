import { createRequire } from 'module';
const require = createRequire(import.meta.url);
global.window = {};
require('../js/layouts.js');
require('../js/tiles.js');
require('../js/engine.js');
const { Layouts, Tiles, Engine } = window;

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('  FAIL:', msg); } };

// --- freeness rules on the turtle ---------------------------------------
{
  const turtle = Layouts.byId('turtle');
  const slots = Engine.analyse(turtle);
  const present = new Array(slots.length).fill(true);
  const at = (x, y, z) => slots.find(s => s.x === x && s.y === y && s.z === z);

  const nose = at(14, 3.5, 0), head = at(13, 3.5, 0), tail = at(0, 3.5, 0);
  const cap = at(6.5, 3.5, 4), buried = at(6, 3, 3), midBody = at(6, 0, 0);

  check(Engine.isFree(nose, present), 'nose tile should be free on a full board');
  check(!Engine.isFree(head, present), 'head is blocked by body and nose');
  check(Engine.isFree(tail, present), 'tail tile should be free on a full board');
  check(Engine.isFree(cap, present), 'capstone should be free on a full board');
  check(!Engine.isFree(buried, present), 'tile under the capstone is covered');
  check(!Engine.isFree(midBody, present), 'mid-row tile is blocked on both sides');
  check(at(6, 3, 3).above.length === 1, 'capstone covers each of the 2x2 below it');

  // The capstone must straddle all four tiles beneath it.
  const covered = [[6,3],[7,3],[6,4],[7,4]].map(([x,y]) => at(x,y,3));
  check(covered.every(s => s.above.length === 1), 'capstone covers all four level-3 tiles');

  const free = Engine.freeIndices(slots, present);
  console.log(`turtle: ${free.length} tiles free at the start`);
  check(free.length >= 2, 'a fresh board offers at least two free tiles');
}

// --- deal 300 boards per layout and replay the recorded solution ---------
for (const layout of Layouts.all) {
  let minOpeningMoves = Infinity, totalFree = 0;
  const t0 = Date.now();

  for (let n = 0; n < 300; n++) {
    const seed = (n + 1) * 2654435761 % 4294967295;
    const board = Engine.deal(layout, seed);
    const { slots, faces, solution } = board;

    check(faces.every(f => f !== null), `${layout.id}: every position got a face`);
    check(solution.length * 2 === layout.count, `${layout.id}: solution covers every tile`);

    // Replay: each pair must be genuinely legal at the moment it is played.
    const present = new Array(slots.length).fill(true);
    for (const [a, b] of solution) {
      if (!Engine.isFree(slots[a], present) || !Engine.isFree(slots[b], present)) {
        check(false, `${layout.id}/seed ${seed}: solution plays a blocked tile`); break;
      }
      if (!Tiles.matches(faces[a], faces[b])) {
        check(false, `${layout.id}/seed ${seed}: solution plays a non-matching pair`); break;
      }
      present[a] = false; present[b] = false;
    }
    check(present.every(p => p === false), `${layout.id}/seed ${seed}: board fully cleared`);

    const opening = Engine.availableMoves(slots, faces, new Array(slots.length).fill(true));
    minOpeningMoves = Math.min(minOpeningMoves, opening.length);
    totalFree += Engine.freeIndices(slots, new Array(slots.length).fill(true)).length;

    // Face multiset must still be a legal deck subset.
    const counts = {};
    faces.forEach(f => counts[f] = (counts[f] || 0) + 1);
    check(Object.values(counts).every(c => c <= 4), `${layout.id}: no face used more than 4 times`);
    const groups = {};
    faces.forEach(f => { const g = Tiles.group(f); groups[g] = (groups[g] || 0) + 1; });
    check(Object.values(groups).every(c => c % 2 === 0), `${layout.id}: every match-group has an even count`);
  }

  const ms = Date.now() - t0;
  console.log(`${layout.id.padEnd(8)} 300 boards, all solvable | free at start: ${(totalFree/300).toFixed(0)}` +
              ` | fewest opening moves: ${minOpeningMoves} | ${(ms/300).toFixed(1)}ms per deal`);
}

// --- shuffle must hand back a winnable position -------------------------
{
  const layout = Layouts.byId('turtle');
  const board = Engine.deal(layout, 12345);
  const present = new Array(board.slots.length).fill(true);
  // Play half the recorded solution, then shuffle what is left.
  for (const [a, b] of board.solution.slice(0, 36)) { present[a] = false; present[b] = false; }
  const next = Engine.reshuffle(board.slots, board.faces, present, 999);
  check(next !== null, 'reshuffle produced a position');
  const moves = Engine.availableMoves(board.slots, next, present);
  check(moves.length > 0, 'reshuffled board has at least one legal move');
  const before = board.faces.filter((_, i) => present[i]).map(f => Tiles.group(f)).sort();
  const after = next.filter((_, i) => present[i]).map(f => Tiles.group(f)).sort();
  check(JSON.stringify(before) === JSON.stringify(after), 'reshuffle preserves the surviving tiles');
  console.log(`reshuffle: ${moves.length} moves available afterwards, tile multiset preserved`);
}

console.log(failures === 0 ? '\nALL ENGINE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
