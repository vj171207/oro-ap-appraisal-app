// Shared list-reconciliation helper for city.js (AP Calibration) and
// interview-city.js (AP Interview). Both previously did
// `historyEl.innerHTML = ""` + full rebuild on every single Apply click —
// correct, but wasteful: it destroys and recreates every row even when
// most of them didn't change, and it collapses any row you'd expanded
// even if that same row is still in the filtered results.
//
// This reuses existing row elements for records that are still visible,
// only building new DOM for records that are newly visible, and only
// removing DOM for records that dropped out of the filtered view.
//
// SAFE SPECIFICALLY BECAUSE of how these two pages work: `records` is
// always a subsequence of the same underlying Firestore query order
// (orderBy("createdAt", "desc")) — client-side filtering only ever removes
// items from that list, it never reorders them. That means a single
// left-to-right walk is enough to produce correct final DOM order; this is
// NOT a general-purpose keyed-list reconciler (no reordering support) —
// don't reuse it somewhere that re-sorts the array between calls.

/** Call once per page, store the result, pass it into every reconcileList call for that same list. */
export function createReconcileState() {
  return { nodesByKey: new Map(), initialized: false };
}

/**
 * @param {HTMLElement} container
 * @param {Array} records - in the order they should appear; see note above about ordering assumptions
 * @param {ReturnType<typeof createReconcileState>} state
 * @param {(record) => string} getKey - must be stable and unique per record (e.g. the Firestore doc ID)
 * @param {(record) => HTMLElement} buildRow - called ONLY the first time a given key is seen; the returned element is cached and reused on later calls
 * @param {string} emptyMessageHtml - shown when records.length === 0; also resets the reconciliation state, so a later non-empty call starts clean
 */
export function reconcileList(container, records, state, { getKey, buildRow, emptyMessageHtml }) {
  // First-ever call: the container still holds whatever static placeholder
  // was in the page's original HTML (e.g. "Loading…") — clear that once,
  // since it isn't one of our tracked nodes.
  //
  // Also clear whenever we're transitioning AWAY from the empty-message
  // state (below) back to a non-empty render — that message was written
  // via container.innerHTML directly, bypassing nodesByKey entirely, so
  // without this check a later non-empty render would append new rows
  // alongside the stale leftover message instead of replacing it.
  if (!state.initialized || state.showingEmptyMessage) {
    container.innerHTML = "";
    state.initialized = true;
    state.showingEmptyMessage = false;
  }

  if (records.length === 0) {
    container.innerHTML = emptyMessageHtml;
    state.nodesByKey.clear();
    state.showingEmptyMessage = true;
    return;
  }

  const seenKeys = new Set();
  let lastNode = null;

  records.forEach((record) => {
    const key = getKey(record);
    seenKeys.add(key);

    let node = state.nodesByKey.get(key);
    if (!node) {
      node = buildRow(record);
      state.nodesByKey.set(key, node);
    }

    if (lastNode === null) {
      if (container.firstChild !== node) container.insertBefore(node, container.firstChild);
    } else if (lastNode.nextSibling !== node) {
      container.insertBefore(node, lastNode.nextSibling);
    }
    lastNode = node;
  });

  for (const [key, node] of state.nodesByKey) {
    if (!seenKeys.has(key)) {
      node.remove();
      state.nodesByKey.delete(key);
    }
  }
}
