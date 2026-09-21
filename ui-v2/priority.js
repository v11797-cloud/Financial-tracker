/* Always-on recommendations with independent ID-only additions and exclusions. */
(function(root) {
  'use strict';
  const EXCLUDED_KEY = 'regwatch_priority_excluded_v1', ADDED_KEY = 'regwatch_priority_added_v1';
  const clean = ids => Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0))] : [];
  function parse(value) { try { return clean(JSON.parse(value || '[]')); } catch { return []; } }
  function create(storage) {
    let excluded = [], added = [], available = true, candidates = [], scopedItems = [];
    function persist() {
      try { storage.setItem(ADDED_KEY, JSON.stringify(added)); storage.setItem(EXCLUDED_KEY, JSON.stringify(excluded)); available = true; }
      catch { available = false; }
    }
    function reload() {
      try {
        const rawAdded = storage.getItem(ADDED_KEY), rawExcluded = storage.getItem(EXCLUDED_KEY);
        added = parse(rawAdded); excluded = parse(rawExcluded); available = true;
        // Preserve prior local selections once; legacy mode no longer controls recommendations.
        if (rawAdded === null && rawExcluded === null && storage.getItem('regwatch_priority_mode_v1') === 'custom') {
          added = parse(storage.getItem('regwatch_custom_priority_v1')); persist();
        }
      } catch { available = false; }
    }
    function configure(automatic, scoped) { candidates = automatic; scopedItems = scoped; }
    function getExcludedPriorityIds() { return [...excluded]; }
    function getManuallyAddedPriorityIds() { return [...added]; }
    function isPriorityExcluded(id) { return excluded.includes(id); }
    function isManuallyAdded(id) { return added.includes(id); }
    function getAutoPriorityCandidates() { return [...candidates]; }
    function getAutoPriorityRegulations() {
      const seen = new Set(excluded);
      return candidates.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; }).slice(0,3);
    }
    function getVisiblePriorityRegulations() {
      const byId = new Map(scopedItems.map(item => [item.id,item]));
      const merged = [...getAutoPriorityRegulations(), ...added.map(id => byId.get(id)).filter(Boolean)];
      const seen = new Set(excluded);
      return merged.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    }
    function isVisiblePriorityItem(id) { return getVisiblePriorityRegulations().some(item => item.id === id); }
    function snapshot(id) { return { id, addedIndex: added.indexOf(id), excluded: excluded.includes(id) }; }
    function excludePriorityItem(id) {
      const before = snapshot(id); if (!excluded.includes(id)) excluded.push(id); persist(); return before;
    }
    function restoreExcludedPriorityItem(id) { excluded = excluded.filter(v => v !== id); persist(); }
    function restoreAllExcludedPriorityItems() { excluded = []; persist(); }
    function addManualPriorityItem(id) {
      if (typeof id !== 'string' || !id) return;
      excluded = excluded.filter(v => v !== id); if (!added.includes(id)) added.push(id); persist();
    }
    function removeManualPriorityItem(id) {
      const before = snapshot(id); added = added.filter(v => v !== id);
      // If this is also recommended, exclude it too so the toggle actually removes the row.
      if (getAutoPriorityRegulations().some(item => item.id === id) && !excluded.includes(id)) excluded.push(id);
      persist(); return before;
    }
    function undoPriorityChange(before) {
      if (!before) return;
      excluded = excluded.filter(id => id !== before.id); if (before.excluded) excluded.push(before.id);
      if (before.addedIndex >= 0 && !added.includes(before.id)) added.splice(Math.min(before.addedIndex,added.length),0,before.id);
      persist();
    }
    reload();
    return { configure, reload, getExcludedPriorityIds, getManuallyAddedPriorityIds, isPriorityExcluded, isManuallyAdded, getAutoPriorityCandidates, getAutoPriorityRegulations, getVisiblePriorityRegulations, isVisiblePriorityItem, excludePriorityItem, restoreExcludedPriorityItem, restoreAllExcludedPriorityItems, addManualPriorityItem, removeManualPriorityItem, undoPriorityChange, storageAvailable: () => available };
  }
  if (typeof module !== 'undefined') module.exports = { create, EXCLUDED_KEY, ADDED_KEY };
  else root.RegWatchPriority = create({ getItem: key => root.localStorage.getItem(key), setItem: (key,value) => root.localStorage.setItem(key,value) });
})(typeof window !== 'undefined' ? window : globalThis);
