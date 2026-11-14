// nav.js — waypoint graph for bot navigation over "Kestrel Yard".
// Every node sits in open floor, >= 1.2 m from any solid box, and every
// edge is a straight walkable line (no box crossed). Edges are
// bidirectional; cost is euclidean distance. No per-frame work here:
// findPath allocates a fresh array per call and is only used on demand.
//
// Fixes vs the first draft of the layout (see NODES comments):
// - m0 moved (0,0) -> (0,2.5): (0,0) sits inside the mid low wall.
// - m0n/m0w/m0e added so bots route around that low wall instead of
//   through it; there is no direct m0-mn edge.
// - wl2/el2 moved (∓14.5,0) -> (∓14.5,3): the crate at (∓12,0) blocked
//   the mw-wl2 / me-el2 edges.
// - ad/bd moved (∓17,-4.6) -> (∓17,-5.5) and ae/be (∓14.5,-9) ->
//   (∓15.5,-8.5): the door nodes were < 1.2 m from the site walls.
//   ae/be sit at z=-8.5 (not -9) because the north divider wall at
//   z=-10 leaves only 0.8 m to any node on the site centre line.
// - The north divider wall (z=-10) as first specified bisected both
//   sites and sealed their northern strips (incl. the tall crates at
//   (±16,-12)) with no way in. world.js now leaves a 4 m gap in it
//   centred on each site (x -21..-17 / 17..21); an/bn (-19,-12) /
//   (19,-12) cover the reopened northern strip, reached via a/b.
// - wl2-wl3 has no direct edge (it would cross the site A south wall's
//   solid segment); west entry routes wl2-ad-wl3. ms-mw / ms-me and
//   m0-mw / m0-me are likewise routed via m0w/m0e: the diagonals clip
//   the crate at (-3,2) / (3,-6) and the container corner at (-8,4).
// - ad-a / bd-b have no direct edge: the diagonal clips the corner of
//   the crate at (∓19,-7) (0.2 m clearance). Site centres are reached
//   via ae/be instead: wl3-ae-a, el3-be-b.

export const NODES = [
  // Kestrel spawn (south)
  { id: 'k0', x: -6, z: 15 },
  { id: 'k1', x: -3, z: 16 },
  { id: 'k2', x: 0, z: 15 },
  { id: 'k3', x: 3, z: 16 },
  { id: 'k4', x: 6, z: 15 },
  // Vulture spawn (north)
  { id: 'v0', x: -6, z: -15 },
  { id: 'v1', x: -3, z: -16 },
  { id: 'v2', x: 0, z: -15 },
  { id: 'v3', x: 3, z: -16 },
  { id: 'v4', x: 6, z: -15 },
  // mid lane
  { id: 'sm', x: 0, z: 12 },
  { id: 'ms', x: 0, z: 7 },
  { id: 'm0', x: 0, z: 2.5 },
  { id: 'm0w', x: -3.5, z: 0 },
  { id: 'm0e', x: 3.5, z: 0 },
  { id: 'm0n', x: 0, z: -2.5 },
  { id: 'mn', x: 0, z: -7 },
  { id: 'nm', x: 0, z: -12 },
  // west / east lanes
  { id: 'mw', x: -8, z: 0 },
  { id: 'me', x: 8, z: 0 },
  { id: 'wl1', x: -14.5, z: 8 },
  { id: 'wl2', x: -14.5, z: 3 },
  { id: 'wl3', x: -16, z: -6 },
  { id: 'el1', x: 14.5, z: 8 },
  { id: 'el2', x: 14.5, z: 3 },
  { id: 'el3', x: 16, z: -6 },
  // spawn-divider gaps (west / east)
  { id: 'wg', x: -8.5, z: 10 },
  { id: 'eg', x: 8.5, z: 10 },
  // site A (west)
  { id: 'a', x: -19, z: -9 },
  { id: 'an', x: -19, z: -12 },
  { id: 'ad', x: -17, z: -5.5 },
  { id: 'ae', x: -15.5, z: -8.5 },
  // site B (east)
  { id: 'b', x: 19, z: -9 },
  { id: 'bn', x: 19, z: -12 },
  { id: 'bd', x: 17, z: -5.5 },
  { id: 'be', x: 15.5, z: -8.5 },
];

// Undirected edges, as [fromId, toId] pairs.
const EDGE_PAIRS = [
  // spawns <-> mid
  ['k0', 'sm'], ['k1', 'sm'], ['k2', 'sm'], ['k3', 'sm'], ['k4', 'sm'],
  ['sm', 'ms'],
  ['ms', 'm0'],
  ['m0', 'm0w'], ['m0', 'm0e'],
  ['m0w', 'm0n'], ['m0e', 'm0n'],
  ['m0n', 'mn'],
  ['mn', 'nm'],
  ['nm', 'v0'], ['nm', 'v1'], ['nm', 'v2'], ['nm', 'v3'], ['nm', 'v4'],
  // mid flanks
  ['m0w', 'mw'], ['m0e', 'me'],
  ['mw', 'wl2'], ['me', 'el2'],
  ['wl2', 'wl1'], ['el2', 'el1'],
  // divider west/east gaps -> Kestrel spawn
  ['wl1', 'wg'], ['wg', 'k0'], ['wg', 'k1'],
  ['el1', 'eg'], ['eg', 'k3'], ['eg', 'k4'],
  // site A entry (via the south-wall gap, not straight through the wall)
  ['wl2', 'ad'], ['ad', 'wl3'], ['wl3', 'ae'], ['ae', 'a'], ['a', 'an'],
  // site B entry (mirrored)
  ['el2', 'bd'], ['bd', 'el3'], ['el3', 'be'], ['be', 'b'], ['b', 'bn'],
];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createNav() {
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const adjacency = new Map(NODES.map((n) => [n.id, []]));

  for (const [fromId, toId] of EDGE_PAIRS) {
    const a = byId.get(fromId);
    const b = byId.get(toId);
    const cost = dist(a, b);
    adjacency.get(fromId).push({ to: toId, cost });
    adjacency.get(toId).push({ to: fromId, cost });
  }

  function neighbours(id) {
    return adjacency.get(id) ?? [];
  }

  // Closest node to a map position (linear scan; the graph is tiny).
  function nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const n of NODES) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best.id;
  }

  // A* with a euclidean heuristic. Returns node objects from fromId to
  // toId inclusive, or [] when either id is unknown / no route exists.
  function findPath(fromId, toId) {
    if (!byId.has(fromId) || !byId.has(toId)) return [];
    if (fromId === toId) return [byId.get(fromId)];

    const open = [{ id: fromId, f: dist(byId.get(fromId), byId.get(toId)) }];
    const cameFrom = new Map();
    const gScore = new Map([[fromId, 0]]);
    const closed = new Set();

    while (open.length > 0) {
      // Pop the lowest-f entry (tiny graph; linear scan is fine).
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0].id;
      if (current === toId) {
        const path = [byId.get(current)];
        let step = current;
        while (cameFrom.has(step)) {
          step = cameFrom.get(step);
          path.unshift(byId.get(step));
        }
        return path;
      }
      closed.add(current);
      for (const { to, cost } of neighbours(current)) {
        if (closed.has(to)) continue;
        const tentative = gScore.get(current) + cost;
        if (tentative < (gScore.get(to) ?? Infinity)) {
          cameFrom.set(to, current);
          gScore.set(to, tentative);
          const f = tentative + dist(byId.get(to), byId.get(toId));
          const existing = open.find((e) => e.id === to);
          if (existing) existing.f = f;
          else open.push({ id: to, f });
        }
      }
    }
    return [];
  }

  return { nodes: NODES, byId, neighbours, nearest, findPath };
}
