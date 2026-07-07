// Visual piling mode — fullscreen "lighttable" for tactile group creation (T425840).
//
// The user opens this mode from the toolbar. The rest of the workbench
// fades out and we render every stash photo as a thumbnail laid out on a
// lighttable surface. Already-grouped photos appear as overlapping piles
// in their own zones; ungrouped photos sit loose. Drag a photo onto
// another to form a new pile; drag onto an existing pile to join it;
// drag a photo out of a pile (back to the loose area) to ungroup it.
// Drag within the same pile to reorder photos in that pile (the order
// becomes the default display order in the table-view group list).
//
// Group state is shared with the table-view groups feature (T425839) via
// the same getGroups/setGroups in user-store.js. Whatever the user does
// here lands in the same persisted shape used by the table view.
//
// Group shape (matches user-store.js):
//   { id, name?, sha1s[], filekeys[], order? }
//   - name      : human-readable label. If missing/empty, default
//                 "New Group N" is shown (N is computed sequentially
//                 from the visible groups so the label always counts up
//                 from 1 — never "New Group 4" with only two groups).
//   - sha1s/filekeys : membership (sha1 preferred, filekey is fallback
//                     for items whose sha1 isn't yet known).
//   - order     : display order as a list of identifiers (sha1 or
//                 filekey). Used to render piles and to determine the
//                 default display order in the table-view group. Items
//                 not yet listed in `order` fall to the end (preserves
//                 forward-compat with groups created before this field
//                 existed).
//
// Drag-and-drop uses HTML5 dnd to match the precedent in T425839 (group
// header reorder) and columns-modal.jsx — no extra library.
//
// Layout strategy: deterministic per-photo offsets (seeded by the file's
// id) inside each pile zone, so the layout stays stable across renders
// even though it looks organic. The Ungrouped surface is a flowing wrap
// so it scales with the user's library (could be hundreds of items).

import React from 'react';

const Icon = window.Icon;
const Thumb = window.Thumb;

// ---- Helpers --------------------------------------------------------

// Stable hash — used for both the per-thumb tilt and the within-pile
// offset. Same input always produces the same output, so layout doesn't
// jitter on re-render.
function hash(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Map a hash into [-range, +range] roughly uniformly.
function jitter(seed, range) {
  return ((seed % 1000) / 1000 - 0.5) * 2 * range;
}

// The identifier we use for the per-pile `order` list. Sha1 is content-
// permanent; filekey is the fallback for in-flight rows whose sha1 isn't
// known yet. Matches the membership-key convention used elsewhere.
function orderKey(item) {
  return item?.sha1 || item?.filekey || null;
}

// Sort items inside a single group by the group's `order` list.
// Items missing from `order` go to the end (most-recently-added wins,
// since insertion appends to the back of sha1s/filekeys).
function sortByOrder(items, order) {
  if (!Array.isArray(order) || !order.length) return items;
  const rank = new Map();
  order.forEach((k, i) => rank.set(k, i));
  return [...items].sort((a, b) => {
    const ka = orderKey(a);
    const kb = orderKey(b);
    const ra = ka != null && rank.has(ka) ? rank.get(ka) : Infinity;
    const rb = kb != null && rank.has(kb) ? rank.get(kb) : Infinity;
    if (ra !== rb) return ra - rb;
    return 0;
  });
}

// Normalise group + items list into bucket arrays the renderer consumes.
// Output preserves the order of `groups` then puts ungrouped at the end.
// Inside each group bucket, items are sorted by `group.order` (if set).
function bucketise(items, groups) {
  const byGroup = new Map();
  for (const g of groups) byGroup.set(g.id, []);
  const ungrouped = [];
  // membership map by item.id: which group does this row belong to?
  const membership = new Map();
  for (const g of groups) {
    const sha1Set = new Set(g.sha1s || []);
    const filekeySet = new Set(g.filekeys || []);
    for (const it of items) {
      if (membership.has(it.id)) continue; // earlier groups win on a collision
      if ((it.sha1 && sha1Set.has(it.sha1)) || (it.filekey && filekeySet.has(it.filekey))) {
        membership.set(it.id, g.id);
      }
    }
  }
  for (const it of items) {
    const gid = membership.get(it.id);
    if (gid && byGroup.has(gid)) byGroup.get(gid).push(it);
    else ungrouped.push(it);
  }
  // Apply per-group ordering.
  for (const g of groups) {
    const arr = byGroup.get(g.id);
    if (arr && arr.length > 1) byGroup.set(g.id, sortByOrder(arr, g.order));
  }
  return { byGroup, ungrouped, membership };
}

// Compute the next "New Group N" label that isn't already taken by an
// existing group's name. We don't reuse the group's *position* (length+1)
// because positions shift when groups are deleted or reordered, leaving
// gaps in the user's mental count ("Group 4, but I only see two groups").
// Instead we scan existing names for the "New Group N" pattern and pick
// the first integer >=1 that's free.
function nextDefaultGroupName(groups) {
  const used = new Set();
  for (const g of groups) {
    const m = /^New Group (\d+)$/.exec(g?.name || '');
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `New Group ${n}`;
}

// Return groups[] with the given identifier list moved into a NEW group.
// Removes the items from any pre-existing groups so a row is never in two
// groups at once. Drops any group that ends up empty after the move.
// Skips items that have no usable identifier (no sha1 AND no filekey).
function moveToNewGroup(groups, targetItems) {
  const newSha1s = new Set();
  const newFilekeys = new Set();
  const newOrder = [];
  for (const it of targetItems) {
    if (it.sha1) {
      newSha1s.add(it.sha1);
      newOrder.push(it.sha1);
    } else if (it.filekey) {
      newFilekeys.add(it.filekey);
      newOrder.push(it.filekey);
    }
  }
  if (!newSha1s.size && !newFilekeys.size) return groups;
  const cleaned = groups
    .map((g) => stripItemsFromGroup(g, newSha1s, newFilekeys))
    .filter((g) => g.sha1s.length + g.filekeys.length > 0);
  const newGroup = {
    id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: nextDefaultGroupName(cleaned),
    sha1s: [...newSha1s],
    filekeys: [...newFilekeys],
    order: newOrder,
  };
  return [...cleaned, newGroup];
}

// Strip the given identifier sets from a group's membership AND order
// list. Used by every move operation so an item never appears twice.
function stripItemsFromGroup(g, sha1Set, filekeySet) {
  const sha1s = (g.sha1s || []).filter((s) => !sha1Set.has(s));
  const filekeys = (g.filekeys || []).filter((k) => !filekeySet.has(k));
  const order = Array.isArray(g.order)
    ? g.order.filter((k) => !sha1Set.has(k) && !filekeySet.has(k))
    : g.order;
  return { ...g, sha1s, filekeys, order };
}

// Move the given items into an existing group (creates the group if it
// vanished mid-drag; defensive). Strips them from any other group first.
// Appends to the end of the target group's `order` so reordering within
// a pile feels predictable (newcomers land at the back, drag-to-reorder
// moves them forward).
function moveToExistingGroup(groups, targetGroupId, targetItems) {
  const newSha1s = new Set();
  const newFilekeys = new Set();
  const incomingOrder = [];
  for (const it of targetItems) {
    if (it.sha1) {
      newSha1s.add(it.sha1);
      incomingOrder.push(it.sha1);
    } else if (it.filekey) {
      newFilekeys.add(it.filekey);
      incomingOrder.push(it.filekey);
    }
  }
  if (!newSha1s.size && !newFilekeys.size) return groups;
  let foundTarget = false;
  const cleaned = groups
    .map((g) => {
      if (g.id === targetGroupId) {
        foundTarget = true;
        // Append (de-duped via the strip-step on other groups + Set on input).
        const sha1s = [...new Set([...(g.sha1s || []), ...newSha1s])];
        const filekeys = [...new Set([...(g.filekeys || []), ...newFilekeys])];
        const existingOrder = Array.isArray(g.order) ? g.order : [];
        const order = [
          ...existingOrder.filter((k) => !newSha1s.has(k) && !newFilekeys.has(k)),
          ...incomingOrder,
        ];
        return { ...g, sha1s, filekeys, order };
      }
      return stripItemsFromGroup(g, newSha1s, newFilekeys);
    })
    .filter((g) => g.sha1s.length + g.filekeys.length > 0);
  if (!foundTarget) {
    cleaned.push({
      id: targetGroupId,
      name: nextDefaultGroupName(cleaned),
      sha1s: [...newSha1s],
      filekeys: [...newFilekeys],
      order: incomingOrder,
    });
  }
  return cleaned;
}

// Move a single item to a specific position inside its OWN group (drag-
// reorder within a pile). If the item isn't in the target group, falls
// back to moveToExistingGroup which appends.
function reorderWithinGroup(groups, groupId, sourceItem, targetItem) {
  const sk = orderKey(sourceItem);
  const tk = orderKey(targetItem);
  if (!sk || !tk) return groups;
  return groups.map((g) => {
    if (g.id !== groupId) return g;
    const inGroup =
      (sourceItem.sha1 && (g.sha1s || []).includes(sourceItem.sha1)) ||
      (sourceItem.filekey && (g.filekeys || []).includes(sourceItem.filekey));
    if (!inGroup) return g;
    // Build current order: stored order first (deduped against current
    // membership), then any membership keys we've never seen (newcomers).
    const memberKeys = new Set([
      ...((g.sha1s || []).filter(Boolean)),
      ...((g.filekeys || []).filter(Boolean)),
    ]);
    const stored = Array.isArray(g.order) ? g.order.filter((k) => memberKeys.has(k)) : [];
    const seen = new Set(stored);
    const trailing = [...memberKeys].filter((k) => !seen.has(k));
    const current = [...stored, ...trailing];
    if (!current.includes(sk) || !current.includes(tk)) return g;
    // Move source to target position. Insert BEFORE target — this matches
    // the natural "dropped on top of" feel.
    const without = current.filter((k) => k !== sk);
    const targetIdx = without.indexOf(tk);
    const next = [...without.slice(0, targetIdx), sk, ...without.slice(targetIdx)];
    return { ...g, order: next };
  });
}

// Remove a single item from whichever group it sits in. Empty groups are
// pruned. Used when the user drags a thumb back onto the loose area.
function removeFromAnyGroup(groups, item) {
  if (!item) return groups;
  const sha1Set = item.sha1 ? new Set([item.sha1]) : new Set();
  const filekeySet = item.filekey ? new Set([item.filekey]) : new Set();
  const next = groups
    .map((g) => stripItemsFromGroup(g, sha1Set, filekeySet))
    .filter((g) => g.sha1s.length + g.filekeys.length > 0);
  return next;
}

// Rename a group. Empty/whitespace name reverts to the default-name
// behaviour (we store the empty string so the renderer falls back to
// nextDefaultGroupName-style autonumbering on read).
function renameGroup(groups, groupId, name) {
  const trimmed = (name || '').trim();
  return groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g));
}

// ---- Drag payload ---------------------------------------------------
//
// HTML5 dnd's dataTransfer is async-friendly across windows but awkward
// for our case (we want React state). We use a module-level latch for
// the live drag and only write a sentinel to dataTransfer to satisfy
// browsers that need it to start a drag at all.

let dragPayload = null; // { itemId, fromGroupId | null }

// ---- Component ------------------------------------------------------

function PilingMode({ items, groups, onUpdateGroups, onClose }) {
  // Local working copy of groups so the lighttable feels instant — we
  // commit upstream on every change (which goes to user-store + debounces
  // the wiki write). Keeping the local copy means we don't need to wait
  // for the parent to round-trip props on every drop.
  const [localGroups, setLocalGroups] = React.useState(groups);
  // Re-sync if the parent groups change (e.g. another mode edited them
  // in the background — unlikely while we're fullscreen, but harmless).
  React.useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  // What's being dragged right now (drives the dragging visual on the
  // source thumb and the drop-target highlights).
  const [dragging, setDragging] = React.useState(null); // { itemId, fromGroupId }
  // Which drop zone is being hovered over (for the highlight).
  const [hoverZone, setHoverZone] = React.useState(null); // groupId | 'ungrouped' | 'newGroup' | null
  // Which thumbnail is being hovered over (for the merge-into-pile or
  // reorder-within-pile highlight).
  const [hoverItemId, setHoverItemId] = React.useState(null);
  // Inline-rename state. groupId being renamed + the in-progress text.
  const [renamingId, setRenamingId] = React.useState(null);
  const [renameText, setRenameText] = React.useState('');

  const buckets = React.useMemo(() => bucketise(items, localGroups), [items, localGroups]);

  // Single funnel for group writes. Updates local + parent in lockstep.
  const commit = React.useCallback(
    (next) => {
      setLocalGroups(next);
      onUpdateGroups(next);
    },
    [onUpdateGroups],
  );

  // Esc to exit the mode (and to cancel an in-progress rename).
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (renamingId) {
        setRenamingId(null);
        setRenameText('');
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, renamingId]);

  // Lock body scroll while the lighttable is up. Restored on unmount.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- DnD handlers --------------------------------------------------

  const onDragStart = (item, fromGroupId) => (e) => {
    dragPayload = { itemId: item.id, fromGroupId: fromGroupId || null };
    setDragging({ itemId: item.id, fromGroupId: fromGroupId || null });
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers refuse the drag without setData; use a sentinel — we
    // rely on the module-level dragPayload, not on the actual mime.
    try {
      e.dataTransfer.setData('text/plain', String(item.id));
    } catch (err) {}
  };

  const onDragEnd = () => {
    dragPayload = null;
    setDragging(null);
    setHoverZone(null);
    setHoverItemId(null);
  };

  const onDragOverZone = (zoneId) => (e) => {
    if (!dragPayload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverZone !== zoneId) setHoverZone(zoneId);
  };

  const onDragLeaveZone = (zoneId) => () => {
    if (hoverZone === zoneId) setHoverZone(null);
  };

  // Drop on a pile (existing group) — move the dragged item into it.
  // The dataTransfer drop event for a pile bubbles into the zone too;
  // we stopPropagation to keep the per-pile handler authoritative.
  const onDropOnPile = (groupId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    onDragEnd();
    if (!payload) return;
    if (payload.fromGroupId === groupId) return; // dropped on its own pile, no-op
    const item = items.find((i) => i.id === payload.itemId);
    if (!item) return;
    commit(moveToExistingGroup(localGroups, groupId, [item]));
  };

  // Drop on a thumb inside an existing pile — either join the pile (if the
  // source is from elsewhere) or reorder within the same pile (if both are
  // in the same group). Stops propagation so the pile-level handler doesn't
  // also fire and append the item again.
  const onDropOnPileThumb = (groupId, targetItem) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    onDragEnd();
    if (!payload) return;
    if (payload.itemId === targetItem.id) return; // dropped on self
    const source = items.find((i) => i.id === payload.itemId);
    if (!source) return;
    if (payload.fromGroupId === groupId) {
      // Reorder within the pile.
      commit(reorderWithinGroup(localGroups, groupId, source, targetItem));
    } else {
      // Join from elsewhere (loose or another pile). Append to the end
      // of the target group; identical end-state to dropping on the pile
      // background.
      commit(moveToExistingGroup(localGroups, groupId, [source]));
    }
  };

  // Drop on the always-available "New group" placeholder zone — promotes
  // the dragged item into its own brand-new pile, regardless of where it
  // came from. The placeholder makes single-item-group creation a one-step
  // gesture instead of "drag onto another loose photo".
  const onDropOnNewGroup = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    onDragEnd();
    if (!payload) return;
    const source = items.find((i) => i.id === payload.itemId);
    if (!source) return;
    commit(moveToNewGroup(localGroups, [source]));
  };

  // Drop on a thumb in the loose (Ungrouped) area — form a new pile.
  // If both the source and target are loose, that's a fresh group of two.
  // If the source is in a group and target is loose, the source moves out
  // of its group and forms a new 2-item group with the target.
  const onDropOnLooseThumb = (targetItem) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = dragPayload;
    onDragEnd();
    if (!payload) return;
    if (payload.itemId === targetItem.id) return; // dropped on self
    const source = items.find((i) => i.id === payload.itemId);
    if (!source) return;
    // moveToNewGroup strips the source from any pre-existing group AND
    // also strips the target if it happened to be in a group already.
    commit(moveToNewGroup(localGroups, [source, targetItem]));
  };

  // Drop on the loose surface (not on a thumb) — pull the item out of
  // its group. If it's already loose, no-op.
  const onDropOnLooseZone = (e) => {
    e.preventDefault();
    const payload = dragPayload;
    onDragEnd();
    if (!payload) return;
    if (!payload.fromGroupId) return; // already ungrouped
    const item = items.find((i) => i.id === payload.itemId);
    if (!item) return;
    commit(removeFromAnyGroup(localGroups, item));
  };

  // ---- Rename handlers ----------------------------------------------

  const startRename = (group) => {
    setRenamingId(group.id);
    setRenameText(group.name || '');
  };
  const commitRename = () => {
    if (!renamingId) return;
    const next = renameGroup(localGroups, renamingId, renameText);
    commit(next);
    setRenamingId(null);
    setRenameText('');
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameText('');
  };

  // ---- Render --------------------------------------------------------

  // Stats for the header strip.
  const totalCount = items.length;
  const grouped = totalCount - buckets.ungrouped.length;
  // Count visible groups (any group with at least one item in the bucket).
  // Empty/orphaned groups don't render and shouldn't inflate the count.
  const visibleGroupCount = localGroups.filter(
    (g) => (buckets.byGroup.get(g.id) || []).length > 0,
  ).length;

  // Resolve the effective display label for a group at a given index. The
  // index is the *visible* index (1-based), used as a fallback when the
  // group has neither a custom name nor a "New Group N" autoname stored.
  const labelFor = (g, visibleIdx) => {
    const custom = (g?.name || '').trim();
    if (custom) return custom;
    return `New Group ${visibleIdx}`;
  };

  return (
    <div className="piling" role="dialog" aria-modal="true" aria-label="Visual piling mode">
      {/* Top bar */}
      <div className="piling__topbar">
        <div className="piling__title">
          <Icon name="folder" size={16} />
          <strong>Piling mode</strong>
          <span className="piling__sub">
            {visibleGroupCount} group{visibleGroupCount === 1 ? '' : 's'} · {grouped} grouped · {buckets.ungrouped.length} loose
          </span>
        </div>
        <div className="piling__hint">
          Drag onto a pile to join · Drag within a pile to reorder · Drag onto "New group" or another loose photo to start a pile
        </div>
        <button
          type="button"
          className="btn btn--quiet piling__close"
          onClick={onClose}
          title="Exit piling mode (Esc)"
        >
          <Icon name="close" size={14} /> Exit
        </button>
      </div>

      {/* Lighttable surface */}
      <div className="piling__surface">
        {totalCount === 0 ? (
          <div className="piling__empty">
            <Icon name="image" size={28} />
            <p>No stash files to organise. Upload some files first.</p>
          </div>
        ) : (
          <>
            {/* Existing piles + always-available "New group" placeholder.
                Rendered together in a flowing wrap so the placeholder reads
                as "another bucket you can drop into" rather than a separate
                control. */}
            <div className="piling__piles">
              {(() => {
                let visibleIdx = 0;
                return localGroups.map((g) => {
                  const items_ = buckets.byGroup.get(g.id) || [];
                  if (items_.length === 0) return null; // skip empty/orphaned groups
                  visibleIdx++;
                  const isHover = hoverZone === g.id && dragPayload && dragPayload.fromGroupId !== g.id;
                  return (
                    <PileZone
                      key={g.id}
                      label={labelFor(g, visibleIdx)}
                      groupId={g.id}
                      items={items_}
                      isHover={isHover}
                      draggingItemId={dragging?.itemId}
                      draggingFromGroupId={dragging?.fromGroupId}
                      hoverItemId={hoverItemId}
                      setHoverItemId={setHoverItemId}
                      isRenaming={renamingId === g.id}
                      renameText={renameText}
                      setRenameText={setRenameText}
                      onStartRename={() => startRename(g)}
                      onCommitRename={commitRename}
                      onCancelRename={cancelRename}
                      onDragOver={onDragOverZone(g.id)}
                      onDragLeave={onDragLeaveZone(g.id)}
                      onDrop={onDropOnPile(g.id)}
                      onThumbDragStart={(item) => onDragStart(item, g.id)}
                      onThumbDragEnd={onDragEnd}
                      onThumbDrop={(item) => onDropOnPileThumb(g.id, item)}
                    />
                  );
                });
              })()}

              {/* Always-available "New group" drop target. Stays visible
                  even when nothing is being dragged so the user knows where
                  a single-item new group lands. */}
              <NewGroupZone
                isHover={hoverZone === 'newGroup' && !!dragPayload}
                isActive={!!dragPayload}
                onDragOver={onDragOverZone('newGroup')}
                onDragLeave={onDragLeaveZone('newGroup')}
                onDrop={onDropOnNewGroup}
              />
            </div>

            {/* Loose / Ungrouped — flowing wrap, drop here to ungroup or
                onto another loose thumb to form a new pile. Always rendered
                so the user always has somewhere to drop "out of group". */}
            <LooseZone
              items={buckets.ungrouped}
              isHover={hoverZone === 'ungrouped' && dragPayload && dragPayload.fromGroupId}
              draggingItemId={dragging?.itemId}
              hoverItemId={hoverItemId}
              setHoverItemId={setHoverItemId}
              onDragOver={onDragOverZone('ungrouped')}
              onDragLeave={onDragLeaveZone('ungrouped')}
              onDrop={onDropOnLooseZone}
              onThumbDragStart={(item) => onDragStart(item, null)}
              onThumbDragEnd={onDragEnd}
              onThumbDrop={onDropOnLooseThumb}
            />
          </>
        )}
      </div>
    </div>
  );
}

// One pile (= existing group). Thumbnails overlap with deterministic
// offsets so the pile reads as a cluster but every photo is still partially
// visible. Drop-target the whole zone (so you can add to a pile by dropping
// near it, not just exactly on a thumb). Per-thumb drop targets layer on
// top so dropping ON a specific photo can either reorder within the pile
// (if same group) or join from elsewhere.
function PileZone({
  label,
  groupId,
  items,
  isHover,
  draggingItemId,
  draggingFromGroupId,
  hoverItemId,
  setHoverItemId,
  isRenaming,
  renameText,
  setRenameText,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDragOver,
  onDragLeave,
  onDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbDrop,
}) {
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <div
      className={'pile' + (isHover ? ' pile--hover' : '')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pile__label">
        {isRenaming ? (
          <input
            ref={inputRef}
            className="pile__rename-input"
            type="text"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancelRename();
              }
            }}
            placeholder="Group name"
            aria-label="Rename group"
          />
        ) : (
          <button
            type="button"
            className="pile__name"
            onClick={onStartRename}
            title="Click to rename"
          >
            {label}
          </button>
        )}
        <span className="pile__count">{items.length}</span>
      </div>
      <div className="pile__stack">
        {items.map((item, i) => {
          const seed = hash(item.id || item.sha1 || item.filekey || '');
          // Tight offset within the pile — everything overlapping but
          // each photo's edge still visible.
          const dx = jitter(seed + i * 17, 12);
          const dy = jitter(seed * 7 + i * 31, 8);
          const rot = jitter(seed * 3 + i * 11, 6); // -6..+6deg
          const z = i; // later items sit on top
          const isDragSource = draggingItemId === item.id;
          // Highlight reorder/merge target — only when there's a live drag
          // AND this isn't the source thumb itself.
          const isHoverTarget =
            hoverItemId === item.id && draggingItemId && draggingItemId !== item.id;
          // Distinguish "reorder within this pile" (same group) from
          // "join this pile from elsewhere" — both are useful affordances
          // but the reorder one is more subtle.
          const reorderTarget = isHoverTarget && draggingFromGroupId === groupId;
          const mergeTarget = isHoverTarget && draggingFromGroupId !== groupId;
          return (
            <div
              key={item.id}
              className={
                'pile__thumb' +
                (isDragSource ? ' pile__thumb--dragging' : '') +
                (reorderTarget ? ' pile__thumb--reorder-target' : '') +
                (mergeTarget ? ' pile__thumb--merge-target' : '')
              }
              style={{
                transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
                zIndex: z,
              }}
              draggable
              onDragStart={onThumbDragStart(item)}
              onDragEnd={onThumbDragEnd}
              onDragOver={(e) => {
                if (!draggingItemId || draggingItemId === item.id) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (hoverItemId !== item.id) setHoverItemId(item.id);
              }}
              onDragLeave={() => {
                if (hoverItemId === item.id) setHoverItemId(null);
              }}
              onDrop={onThumbDrop(item)}
              title={item.title || item.filename || ''}
            >
              <Thumb item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Always-visible "New group" placeholder. Drop a single photo here to
// promote it into its own brand-new group. Sits at the end of the piles
// row so the user always has a one-gesture path to a one-photo group.
function NewGroupZone({ isHover, isActive, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className={
        'pile pile--new' +
        (isHover ? ' pile--hover' : '') +
        (isActive ? ' pile--new-active' : '')
      }
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pile__label">
        <span className="pile__name pile__name--placeholder">
          <Icon name="plus" size={12} /> New group
        </span>
      </div>
      <div className="pile__stack pile__stack--new">
        <div className="pile__new-hint">Drop a photo here to start a new group</div>
      </div>
    </div>
  );
}

// The loose / ungrouped surface. Flowing layout so the user can have
// hundreds of thumbs without overlapping chaos. Each thumb is itself a
// drop target — dropping on a thumb forms a new pile of (source, target).
function LooseZone({
  items,
  isHover,
  draggingItemId,
  hoverItemId,
  setHoverItemId,
  onDragOver,
  onDragLeave,
  onDrop,
  onThumbDragStart,
  onThumbDragEnd,
  onThumbDrop,
}) {
  return (
    <div
      className={'loose' + (isHover ? ' loose--hover' : '')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="loose__label">
        Loose photos
        <span className="loose__count">{items.length}</span>
        <span className="loose__hint">drop here to ungroup · drop one onto another to pile</span>
      </div>
      <div className="loose__grid">
        {items.length === 0 ? (
          <div className="loose__empty">
            <Icon name="info" size={14} /> Everything is grouped. Drop a thumb here to ungroup it.
          </div>
        ) : (
          items.map((item) => {
            const seed = hash(item.id || item.sha1 || item.filekey || '');
            // Slight tilt for a "scattered photos" feel without breaking
            // the wrap layout.
            const rot = jitter(seed, 3);
            const isDragSource = draggingItemId === item.id;
            const isHoverTarget =
              hoverItemId === item.id && draggingItemId && draggingItemId !== item.id;
            return (
              <div
                key={item.id}
                className={
                  'loose__thumb' +
                  (isDragSource ? ' loose__thumb--dragging' : '') +
                  (isHoverTarget ? ' loose__thumb--target' : '')
                }
                style={{ transform: `rotate(${rot}deg)` }}
                draggable
                onDragStart={onThumbDragStart(item)}
                onDragEnd={onThumbDragEnd}
                onDragOver={(e) => {
                  // Allow dropping on this thumb so it becomes a target.
                  if (!draggingItemId || draggingItemId === item.id) return;
                  e.preventDefault();
                  e.stopPropagation(); // so the surface's hover state doesn't compete
                  e.dataTransfer.dropEffect = 'move';
                  if (hoverItemId !== item.id) setHoverItemId(item.id);
                }}
                onDragLeave={() => {
                  if (hoverItemId === item.id) setHoverItemId(null);
                }}
                onDrop={onThumbDrop(item)}
                title={item.title || item.filename || ''}
              >
                <Thumb item={item} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default PilingMode;
