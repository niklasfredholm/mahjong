/* Game rules and board generation.
 *
 * The one thing that matters most here: every board is dealt so that it is
 * winnable. A randomly-filled mahjong board frequently is not, which is a
 * miserable way to lose. Instead we build the board backwards -- repeatedly
 * choosing two positions that are free, assigning them a matching pair, and
 * setting them aside. Replaying those choices in the same order is a
 * guaranteed solution, so one always exists.
 */
(function (global) {
  'use strict';

  var EPS = 1e-6;

  function overlaps(a, b) {
    return Math.abs(a.x - b.x) < 1 - EPS && Math.abs(a.y - b.y) < 1 - EPS;
  }

  /* Build the neighbour tables once per layout. A tile is blocked from above
   * by anything on the next level that overlaps it, and blocked on a side by
   * a tile on the same level whose centre sits within one tile-width. */
  function analyse(layout) {
    var slots = layout.slots.map(function (s, i) {
      return { i: i, x: s.x, y: s.y, z: s.z, above: [], left: [], right: [] };
    });
    for (var a = 0; a < slots.length; a++) {
      for (var b = 0; b < slots.length; b++) {
        if (a === b) continue;
        var A = slots[a], B = slots[b];
        if (B.z === A.z + 1 && overlaps(A, B)) A.above.push(b);
        if (B.z === A.z && Math.abs(A.y - B.y) < 1 - EPS) {
          var d = A.x - B.x;
          if (d > EPS && d < 1 + EPS) A.left.push(b);
          else if (-d > EPS && -d < 1 + EPS) A.right.push(b);
        }
      }
    }
    return slots;
  }

  function anyPresent(list, present) {
    for (var i = 0; i < list.length; i++) if (present[list[i]]) return true;
    return false;
  }

  // A tile can be picked up if nothing rests on it and one long side is clear.
  function isFree(slot, present) {
    if (anyPresent(slot.above, present)) return false;
    return !anyPresent(slot.left, present) || !anyPresent(slot.right, present);
  }

  function freeIndices(slots, present) {
    var out = [];
    for (var i = 0; i < slots.length; i++) {
      if (present[i] && isFree(slots[i], present)) out.push(i);
    }
    return out;
  }

  // Small seedable PRNG so a board can be replayed from its seed alone.
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function shuffled(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Pick a free position, strongly preferring the highest stack level. This
   * unstacks the board roughly top-down, which both mirrors how the game is
   * actually played and avoids stranding a lone covered tile at the end. */
  function pickWeighted(free, slots, rand) {
    var weights = free.map(function (i) { return Math.pow(8, slots[i].z); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = rand() * total;
    for (var k = 0; k < free.length; k++) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return free.length - 1;
  }

  /* Choose a removal order over `positions`, or null if we paint ourselves
   * into a corner (rare, and the caller simply retries). */
  function removalOrder(slots, positions, rand) {
    var present = new Array(slots.length).fill(false);
    positions.forEach(function (i) { present[i] = true; });
    var order = [];
    var left = positions.length;
    while (left > 0) {
      var free = freeIndices(slots, present);
      if (free.length < 2) return null;
      var ka = pickWeighted(free, slots, rand);
      var a = free[ka];
      free.splice(ka, 1);
      var b = free[pickWeighted(free, slots, rand)];
      present[a] = false;
      present[b] = false;
      order.push([a, b]);
      left -= 2;
    }
    return order;
  }

  /* Deal a fresh solvable board. */
  function deal(layout, seed) {
    var slots = analyse(layout);
    var rand = rng(seed);
    var positions = slots.map(function (s) { return s.i; });

    for (var attempt = 0; attempt < 400; attempt++) {
      var order = removalOrder(slots, positions, rand);
      if (!order) continue;
      var pairs = shuffled(global.Tiles.deckPairs(), rand).slice(0, order.length);
      var faces = new Array(slots.length).fill(null);
      order.forEach(function (pair, k) {
        var p = shuffled(pairs[k], rand);
        faces[pair[0]] = p[0];
        faces[pair[1]] = p[1];
      });
      return { slots: slots, faces: faces, solution: order, seed: seed };
    }
    throw new Error('could not deal a solvable ' + layout.id + ' board');
  }

  /* Rearrange the tiles still on the board into a fresh solvable position.
   * Most implementations reshuffle at random and can hand back a dead board;
   * reusing the dealer here means a shuffle always leaves the game winnable. */
  function reshuffle(slots, faces, present, seed) {
    var positions = [];
    for (var i = 0; i < slots.length; i++) if (present[i]) positions.push(i);
    if (positions.length < 2) return null;

    // Regroup the surviving faces into legal pairs.
    var byGroup = {};
    positions.forEach(function (i) {
      var g = global.Tiles.group(faces[i]);
      (byGroup[g] = byGroup[g] || []).push(faces[i]);
    });
    var pairs = [];
    for (var g in byGroup) {
      var list = byGroup[g];
      if (list.length % 2 !== 0) return null;  // should never happen
      for (var k = 0; k < list.length; k += 2) pairs.push([list[k], list[k + 1]]);
    }

    var rand = rng(seed);
    for (var attempt = 0; attempt < 400; attempt++) {
      var order = removalOrder(slots, positions, rand);
      if (!order) continue;
      var mix = shuffled(pairs, rand);
      var next = faces.slice();
      order.forEach(function (pair, idx) {
        var p = shuffled(mix[idx], rand);
        next[pair[0]] = p[0];
        next[pair[1]] = p[1];
      });
      return next;
    }
    return null;
  }

  // Every matching pair currently available, used for hints and for
  // detecting a dead board.
  function availableMoves(slots, faces, present) {
    var free = freeIndices(slots, present);
    var moves = [];
    for (var i = 0; i < free.length; i++) {
      for (var j = i + 1; j < free.length; j++) {
        if (global.Tiles.matches(faces[free[i]], faces[free[j]])) {
          moves.push([free[i], free[j]]);
        }
      }
    }
    return moves;
  }

  global.Engine = {
    analyse: analyse,
    isFree: isFree,
    freeIndices: freeIndices,
    deal: deal,
    reshuffle: reshuffle,
    availableMoves: availableMoves,
    rng: rng
  };
})(window);
