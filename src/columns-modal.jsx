import React from 'react';
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  resolveTemplate,
  templateColumnKeys,
  missingColumnsForTemplate,
  renderTemplateBlock,
  columnTemplateRelation,
  isColumnInTemplate,
  templateDocsUrl,
} from './wikitext-templates.js';

// Consolidated "Templates and columns" modal:
//   - Templates tab: pick which {{Information}}/{{Artwork}}/etc. wikitext
//     template the published file uses. Built-in templates only — the
//     custom-wikitext escape hatch was removed in T426449 in favour of a
//     comprehensive catalogue (Information / Photograph / Artwork / Book /
//     Map / Art photo / Specimen / Musical work).
//   - Columns tab: visibility / required / default value / order. Two
//     variants: "compact" (single-line list with inline controls) and
//     "expandable" (click row to reveal default-editor + per-row controls).
//
// The Templates tab nudges the user to add any columns the template uses
// that they haven't enabled yet — it's a one-click "add these" link, not a
// hard requirement.

const { useState: useStateCM, useEffect: useEffectCM, useMemo: useMemoCM, useRef: useRefCM } = React;

function ColumnsModal({
  variant,                     // "compact" | "expandable"
  initialTab = 'columns',      // 'columns' | 'templates'
  allColumns,                  // ordered array of column descriptors
  visibleKeys,                 // string[]
  orderKeys,                   // string[] -- explicit order
  requiredFields,              // string[]
  alwaysRequired,              // Set<string>
  columnDefaults,              // {key: value}
  wikitextTemplate,            // { id, body?, fields? }
  setWikitextTemplate,
  setVisibleKeys,
  setOrderKeys,
  setRequiredFields,
  setColumnDefaults,
  onClose,
  // Bulk-fill helpers (provided by host).
  onFillBlank,                 // (key, value) => void
  onOverwriteAll,              // (key, value) => void
  onOverwriteSelected,         // (key, value) => void
  selectedCount = 0,
  // Logged-in user's Commons username — used by the Author column's
  // "Me" quick-insert button to fill the canonical [[User:X|X]] form.
  selfUsername,
  // Custom-column controls. If unset, the create/remove UI is hidden — keeps
  // the modal usable in callers that don't (yet) wire these.
  customProps,                 // [{ pid, kind, label, template? }]
  onRemoveCustomProp,          // (pid) => void
  // T426449 removed the `initialCustomFormOpen` prop that auto-expanded the
  // (now-deleted) CustomColumnCreator form when the modal was opened from
  // the "+ Add column" popover's "Custom wikitext-template column" entry.
}) {
  // Esc does NOT close — this modal holds column/template settings the user is
  // actively arranging; a stray Esc shouldn't discard the interaction. The ×
  // in the header and the "Done" button are the deliberate way out.

  // Tabs: Templates / Columns. Initial tab comes in via prop.
  const [tab, setTab] = useStateCM(initialTab === 'templates' ? 'templates' : 'columns');

  // Legend chips act as filters (Columns tab only).
  const [filter, setFilter] = useStateCM(null); // null | "visible" | "hidden" | "required" | "optional" | "in-template" | "out-of-template"

  // Column keys that were just added by the user via the "Add N columns"
  // template-suggestion button. Flash-highlighted briefly + auto-cleared so
  // the user can see *which* rows the action just touched.
  const [recentlyAdded, setRecentlyAdded] = useStateCM(() => new Set());
  useEffectCM(() => {
    if (recentlyAdded.size === 0) return;
    const t = setTimeout(() => setRecentlyAdded(new Set()), 4000);
    return () => clearTimeout(t);
  }, [recentlyAdded]);

  const rows = useMemoCM(() => {
    const byKey = new Map(allColumns.map(c => [c.key, c]));
    const seen = new Set();
    const out = [];
    for (const k of orderKeys) {
      if (byKey.has(k) && !seen.has(k)) { out.push(byKey.get(k)); seen.add(k); }
    }
    for (const c of allColumns) {
      if (!seen.has(c.key)) { out.push(c); seen.add(c.key); }
    }
    // T426422: per-language Caption columns (other than English) are added
    // via the column header menu, not from this modal — the catalog has
    // ~24 entries and listing every language as a separate row would bury
    // the rest of the modal in caption rows. We only surface a per-language
    // caption row here when the user has *already* added that column to
    // the table (so they can hide it / change required / reorder it from
    // here too). The bare "description" key (English) always shows.
    return out.filter((c) => {
      if (!c?.caption) return true;
      if (c.key === 'description') return true;
      return visibleKeys.includes(c.key);
    });
  }, [allColumns, orderKeys, visibleKeys]);

  const isVisible = (k) => visibleKeys.includes(k);
  const isRequired = (k) => alwaysRequired.has(k) || requiredFields.includes(k);

  const filteredRows = useMemoCM(() => {
    if (!filter) return rows;
    return rows.filter(c => {
      if (filter === "visible")  return isVisible(c.key);
      if (filter === "hidden")   return !isVisible(c.key);
      if (filter === "required") return isRequired(c.key);
      if (filter === "optional") return !isRequired(c.key);
      if (filter === "in-template")     return isColumnInTemplate(c.key, wikitextTemplate);
      if (filter === "out-of-template") return !isColumnInTemplate(c.key, wikitextTemplate);
      return true;
    });
  }, [rows, filter, visibleKeys, requiredFields, alwaysRequired, wikitextTemplate]);

  const toggleVisible = (k) => {
    if (alwaysRequired.has(k)) return;
    setVisibleKeys(visibleKeys.includes(k)
      ? visibleKeys.filter(x => x !== k)
      : [...visibleKeys, k]);
  };
  const toggleRequired = (k) => {
    if (alwaysRequired.has(k)) return;
    setRequiredFields(requiredFields.includes(k)
      ? requiredFields.filter(x => x !== k)
      : [...requiredFields, k]);
  };
  const setDefault = (k, v) => {
    const next = { ...columnDefaults };
    if (v == null || v === "") delete next[k]; else next[k] = v;
    setColumnDefaults(next);
  };

  // ---- DnD ----
  const dragKey = useRefCM(null);
  const [dragOver, setDragOver] = useStateCM(null);
  const onDragStart = (e, k) => { dragKey.current = k; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e, k) => { e.preventDefault(); setDragOver(k); };
  const onDrop = (e, k) => {
    e.preventDefault();
    const from = dragKey.current;
    setDragOver(null);
    if (!from || from === k) return;
    const order = rows.map(r => r.key);
    const fi = order.indexOf(from);
    const ti = order.indexOf(k);
    if (fi < 0 || ti < 0) return;
    const next = [...order];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    setOrderKeys(next);
  };

  const counts = useMemoCM(() => ({
    visible: rows.filter(c => isVisible(c.key)).length,
    hidden:  rows.filter(c => !isVisible(c.key)).length,
    required: rows.filter(c => isRequired(c.key)).length,
    optional: rows.filter(c => !isRequired(c.key)).length,
    inTemplate: rows.filter(c => isColumnInTemplate(c.key, wikitextTemplate)).length,
  }), [rows, visibleKeys, requiredFields, alwaysRequired, wikitextTemplate]);

  // Adds the given column keys to visibleKeys (without dedup-ing existing ones)
  // and remembers which were newly added so the Columns tab can flash-
  // highlight them (drives the "I see what just happened" feedback after
  // clicking "Add N columns" on the Templates tab).
  const addColumns = (keys) => {
    if (!keys?.length) return [];
    const newlyAdded = [];
    const next = [...visibleKeys];
    for (const k of keys) {
      if (!next.includes(k)) {
        next.push(k);
        newlyAdded.push(k);
      }
    }
    setVisibleKeys(next);
    if (newlyAdded.length) setRecentlyAdded(new Set(newlyAdded));
    return newlyAdded;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal--cols" role="dialog" aria-modal="true">
        <header className="modal__head">
          <div>
            <h2 className="modal__title">Templates and columns</h2>
            <p className="modal__sub">
              Pick the wikitext template used when publishing, and configure which columns appear in the table.
            </p>
          </div>
          <button className="btn btn--quiet btn--icon-only" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>

        <div className="cols-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'templates'}
            className={"cols-modal__tab" + (tab === 'templates' ? " cols-modal__tab--active" : "")}
            onClick={() => setTab('templates')}
          >
            Templates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'columns'}
            className={"cols-modal__tab" + (tab === 'columns' ? " cols-modal__tab--active" : "")}
            onClick={() => setTab('columns')}
          >
            Columns
          </button>
        </div>

        {tab === 'templates' && (
          <div className="modal__body cols-modal__body cols-modal__body--templates">
            <TemplatesPanel
              wikitextTemplate={wikitextTemplate}
              setWikitextTemplate={setWikitextTemplate}
              allColumns={allColumns}
              visibleKeys={visibleKeys}
              addColumns={addColumns}
              setColumnFilter={setFilter}
              switchTab={() => setTab('columns')}
            />
          </div>
        )}

        {tab === 'columns' && (
          <>
            <div className="cols-modal__legend">
              <FilterChip label="Visible"  count={counts.visible}  active={filter === "visible"}  onClick={() => setFilter(filter === "visible"  ? null : "visible")}>
                <Icon name="eye" size={11} />
              </FilterChip>
              <FilterChip label="Hidden"   count={counts.hidden}   active={filter === "hidden"}   onClick={() => setFilter(filter === "hidden"   ? null : "hidden")}>
                <Icon name="eye-off" size={11} />
              </FilterChip>
              <FilterChip label="Required" count={counts.required} active={filter === "required"} onClick={() => setFilter(filter === "required" ? null : "required")} className="legend-req-chip">
                <span className="legend-req">*</span>
              </FilterChip>
              <FilterChip label="Optional" count={counts.optional} active={filter === "optional"} onClick={() => setFilter(filter === "optional" ? null : "optional")}>
                <span className="legend-opt">·</span>
              </FilterChip>
              <FilterChip
                label={`In ${resolveTemplate(wikitextTemplate).label}`}
                count={counts.inTemplate}
                active={filter === "in-template"}
                onClick={() => setFilter(filter === "in-template" ? null : "in-template")}
                className="legend-tmpl-chip"
              >
                <Icon name="filter" size={11} />
              </FilterChip>
              {filter && (
                <button className="cols-modal__clearfilter" onClick={() => setFilter(null)}>Clear filter</button>
              )}
            </div>

            {recentlyAdded.size > 0 && (
              <div className="cols-modal__notice">
                <Icon name="check" size={12} /> Added{' '}
                {[...recentlyAdded]
                  .map((k) => allColumns.find((c) => c.key === k)?.label || k)
                  .join(', ')}{' '}
                to the table.
              </div>
            )}

            <div className="modal__body cols-modal__body">
              {filteredRows.map(col => (
                variant === "expandable"
                  ? <ExpandableRow
                      key={col.key}
                      col={col}
                      visible={isVisible(col.key)}
                      required={isRequired(col.key)}
                      locked={alwaysRequired.has(col.key)}
                      defaultValue={columnDefaults[col.key]}
                      relation={columnTemplateRelation(col.key, wikitextTemplate)}
                      templateLabel={resolveTemplate(wikitextTemplate).label}
                      isRecentlyAdded={recentlyAdded.has(col.key)}
                      onToggleVisible={() => toggleVisible(col.key)}
                      onToggleRequired={() => toggleRequired(col.key)}
                      onSetDefault={(v) => setDefault(col.key, v)}
                      onDragStart={(e) => onDragStart(e, col.key)}
                      onDragOver={(e) => onDragOver(e, col.key)}
                      onDrop={(e) => onDrop(e, col.key)}
                      isDragOver={dragOver === col.key}
                      onFillBlank={onFillBlank}
                      onOverwriteAll={onOverwriteAll}
                      onOverwriteSelected={onOverwriteSelected}
                      selectedCount={selectedCount}
                      selfUsername={selfUsername}
                      onRemove={col.customProp && onRemoveCustomProp ? () => onRemoveCustomProp(col.customProp.pid) : null}
                    />
                  : <CompactRow
                      key={col.key}
                      col={col}
                      visible={isVisible(col.key)}
                      required={isRequired(col.key)}
                      locked={alwaysRequired.has(col.key)}
                      defaultValue={columnDefaults[col.key]}
                      relation={columnTemplateRelation(col.key, wikitextTemplate)}
                      templateLabel={resolveTemplate(wikitextTemplate).label}
                      isRecentlyAdded={recentlyAdded.has(col.key)}
                      onToggleVisible={() => toggleVisible(col.key)}
                      onToggleRequired={() => toggleRequired(col.key)}
                      onSetDefault={(v) => setDefault(col.key, v)}
                      onDragStart={(e) => onDragStart(e, col.key)}
                      onDragOver={(e) => onDragOver(e, col.key)}
                      onDrop={(e) => onDrop(e, col.key)}
                      isDragOver={dragOver === col.key}
                      selfUsername={selfUsername}
                      onRemove={col.customProp && onRemoveCustomProp ? () => onRemoveCustomProp(col.customProp.pid) : null}
                    />
              ))}
            </div>
          </>
        )}


        <footer className="modal__foot">
          <span className="modal__hint">Changes apply immediately.</span>
          <button className="btn btn--progressive" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

function FilterChip({ label, count, active, onClick, className, children }) {
  return (
    <button
      type="button"
      className={"chip-filter" + (active ? " chip-filter--active" : "") + (className ? " " + className : "")}
      onClick={onClick}
    >
      <span className="chip-filter__icon">{children}</span>
      <span className="chip-filter__label">{label}</span>
      <span className="chip-filter__count">{count}</span>
    </button>
  );
}

// ---------- Templates tab ----------
//
// Expandable list of built-in Commons file-description templates, ordered by
// prevalence (Information first, niche templates last). Each row collapses to
// `{{Name}} — one-line use case`; clicking expands to:
//   - radio "Use this template" button + Commons docs link
//   - live wikitext preview rendered against a sample item
//   - a per-param table mapping `template_param` ↔ workbench column with
//     required/optional badges and the docs page's "expected value" hint
//   - the recommended-columns list with a "Add N columns" suggestion when
//     any of them aren't yet visible
//
// The selected template defines the wrapper wikitext at publish time
// (see `renderTemplateBlock` in `wikitext-templates.js`). The custom-wikitext
// escape hatch was removed in T426449 — built-ins cover every primary
// Commons file-description template.
function TemplatesPanel({ wikitextTemplate, setWikitextTemplate, allColumns, visibleKeys, addColumns, setColumnFilter, switchTab }) {
  const config = wikitextTemplate || { id: DEFAULT_TEMPLATE_ID };
  // Default-expand whichever template is currently selected, so a returning
  // user sees the relevant detail without clicking. They can still expand
  // others to compare.
  const [expandedId, setExpandedId] = useStateCM(() => (
    BUILTIN_TEMPLATES[config.id] ? config.id : DEFAULT_TEMPLATE_ID
  ));

  // Sample item drives the live wikitext preview block inside each expanded
  // template. Same shape we've used since the custom-template editor lived
  // here — keeps the previews realistic without forcing the user to publish
  // anything.
  const sampleItem = useMemoCM(() => ({
    title: 'Example file',
    description: 'A sample description.',
    descriptions: { en: 'A sample description.' },
    author: 'Wikimedian',
    source: 'own work',
    license: 'CC-BY-SA-4.0',
    dateTaken: '2024-01-15T12:00:00Z',
    objectLocation: { lat: 52.37, lon: 4.89 },
    cameraLocation: { lat: 52.37, lon: 4.89 },
    locationOfCreation: { qid: 'Q727', label: 'Amsterdam' },
    depicts: [{ qid: 'Q146', label: 'cat' }],
    categories: ['Sample category'],
  }), []);

  return (
    <div className="tmpl-panel">
      <section className="tmpl-panel__section">
        <div className="tmpl-panel__label">Wikitext template</div>
        <p className="tmpl-panel__hint">
          Pick the wrapper template Commons uses to render your file's metadata.
          Click any row to see the wikitext preview, the per-parameter docs,
          and which workbench columns flow into it.
        </p>
        <ul className="tmpl-list" role="list">
          {Object.values(BUILTIN_TEMPLATES).map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              selected={config.id === t.id}
              expanded={expandedId === t.id}
              onToggleExpand={() => setExpandedId(expandedId === t.id ? null : t.id)}
              onSelect={() => setWikitextTemplate({ id: t.id })}
              visibleKeys={visibleKeys}
              allColumns={allColumns}
              addColumns={addColumns}
              setColumnFilter={setColumnFilter}
              switchTab={switchTab}
              sampleItem={sampleItem}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

// One row in the expandable Templates list. Closed: name + use-case + radio.
// Open: wikitext preview + per-param table + recommended-columns block +
// docs link.
function TemplateRow({
  template, selected, expanded, onToggleExpand, onSelect,
  visibleKeys, allColumns, addColumns, setColumnFilter, switchTab,
  sampleItem,
}) {
  const config = useMemoCM(() => ({ id: template.id }), [template.id]);
  const labelFor = (k) => (allColumns || []).find((c) => c.key === k)?.label || k;

  const previewBlock = useMemoCM(() => {
    try { return renderTemplateBlock(sampleItem, config); }
    catch (e) { return `(error: ${e.message})`; }
  }, [config, sampleItem]);

  const missing = useMemoCM(() => missingColumnsForTemplate(config, visibleKeys), [config, visibleKeys]);
  const colKeys = useMemoCM(() => templateColumnKeys(config), [config]);

  // Recommended-only columns: things the template uses but doesn't directly
  // map a workbench column to via fields[]. Same split we had in the previous
  // "Columns this template uses" panel.
  const recommendedOnly = useMemoCM(() => {
    const mappedKeys = new Set((template.fields || []).filter((f) => f.key).map((f) => f.key));
    return (template.recommendedColumns || []).filter((k) => !mappedKeys.has(k));
  }, [template]);

  const docsHref = templateDocsUrl(template);

  return (
    <li className={"tmpl-row" + (expanded ? " tmpl-row--open" : "") + (selected ? " tmpl-row--selected" : "")}>
      <button
        type="button"
        className="tmpl-row__head"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <span className="tmpl-row__chev" aria-hidden="true">
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} />
        </span>
        <span className="tmpl-row__label">{template.label}</span>
        {selected && (
          <span className="tmpl-row__selected-pill" title="This template is currently selected">
            <Icon name="check" size={10} /> selected
          </span>
        )}
        <span className="tmpl-row__use">{template.useCase}</span>
      </button>

      {expanded && (
        <div className="tmpl-row__body" onClick={(e) => e.stopPropagation()}>
          <div className="tmpl-row__actions">
            {selected ? (
              <span className="tmpl-row__active">
                <Icon name="ok" size={12} /> Selected
              </span>
            ) : (
              <button
                type="button"
                className="btn btn--small btn--progressive"
                onClick={onSelect}
              >
                Use {template.label}
              </button>
            )}
            {docsHref && (
              <a
                className="tmpl-row__docs"
                href={docsHref}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open Commons documentation for ${template.label}`}
              >
                Commons docs <Icon name="external" size={11} />
              </a>
            )}
          </div>

          <div className="tmpl-row__previewlabel">Wikitext preview (sample data)</div>
          <pre className="tmpl-panel__preview">{previewBlock}</pre>

          <div className="tmpl-row__previewlabel">Template parameters</div>
          <table className="tmpl-params">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Column</th>
                <th>Required?</th>
                <th>Visible</th>
              </tr>
            </thead>
            <tbody>
              {(template.fields || []).map((f) => {
                const enabled = f.key ? visibleKeys.includes(f.key) : false;
                const paramHref = templateDocsUrl(template, f.param);
                return (
                  <tr key={f.param} className={!f.key ? "tmpl-params__row--unmapped" : (enabled ? "" : "tmpl-params__row--off")}>
                    <td>
                      <a
                        className="tmpl-params__param"
                        href={paramHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={f.hint || `Open docs for |${f.param}=`}
                      >
                        <code>|{f.param}=</code>
                      </a>
                      {f.hint && (
                        <div className="tmpl-params__hint">{f.hint}</div>
                      )}
                    </td>
                    <td>
                      {f.key ? (
                        <span className="tmpl-params__col">
                          <span className="tmpl-params__arrow" aria-hidden="true">←</span>
                          {' '}{labelFor(f.key)}
                        </span>
                      ) : (
                        <span className="tmpl-params__nocol" title="No workbench column maps to this parameter — fill it manually in the published wikitext, or leave it empty">
                          (no column)
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={"tmpl-params__badge " + (f.required ? "tmpl-params__badge--req" : "tmpl-params__badge--opt")}>
                        {f.required ? "required" : "optional"}
                      </span>
                    </td>
                    <td>
                      {!f.key ? (
                        <span className="tmpl-panel__dot tmpl-panel__dot--off" title="No workbench column maps to this parameter">·</span>
                      ) : enabled ? (
                        <span className="tmpl-panel__dot tmpl-panel__dot--on" title="Column is enabled in your table">
                          <Icon name="check" size={10} />
                        </span>
                      ) : (
                        <span className="tmpl-panel__dot tmpl-panel__dot--off" title="Column is not enabled in your table">·</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {recommendedOnly.length > 0 && (
            <>
              <div className="tmpl-row__previewlabel">Also commonly used with this template</div>
              <ul className="tmpl-panel__map">
                {recommendedOnly.map((k) => {
                  const enabled = visibleKeys.includes(k);
                  return (
                    <li key={k} className={"tmpl-panel__mapitem" + (enabled ? "" : " tmpl-panel__mapitem--off")}>
                      <span className="tmpl-panel__col">{labelFor(k)}</span>
                      <span className="tmpl-panel__rec">recommended</span>
                      {enabled ? (
                        <span className="tmpl-panel__dot tmpl-panel__dot--on" title="Column is enabled in your table">
                          <Icon name="check" size={10} />
                        </span>
                      ) : (
                        <span className="tmpl-panel__dot tmpl-panel__dot--off" title="Column is not enabled in your table">·</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {colKeys.length > 0 && (
            missing.length === 0 ? (
              <p className="tmpl-panel__hint tmpl-panel__hint--ok">
                <Icon name="ok" size={12} /> All {colKeys.length} workbench columns this template uses are already enabled in your table.
              </p>
            ) : (
              <div className="tmpl-row__addnote">
                <p className="tmpl-panel__addnote">
                  <strong>{template.label}</strong> uses {missing.length}{' '}
                  column{missing.length === 1 ? '' : 's'} you haven't enabled yet:{' '}
                  <span className="tmpl-panel__missingnames">
                    {missing.map((k) => labelFor(k)).join(', ')}
                  </span>
                </p>
                <div className="tmpl-panel__actions">
                  <button
                    type="button"
                    className="btn btn--small btn--progressive"
                    onClick={() => {
                      const added = addColumns(missing);
                      if (added && added.length) {
                        setColumnFilter && setColumnFilter('in-template');
                      }
                      switchTab && switchTab();
                    }}
                  >
                    <Icon name="check" size={12} /> Add {missing.length} column{missing.length === 1 ? '' : 's'}
                  </button>
                  <span className="tmpl-panel__hint tmpl-panel__hint--inline">
                    Empty fields are dropped from the published wikitext.
                  </span>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Compact row ----------
function CompactRow({ col, visible, required, locked, defaultValue, relation, templateLabel, isRecentlyAdded, onToggleVisible, onToggleRequired, onSetDefault, onDragStart, onDragOver, onDrop, isDragOver, selfUsername, onRemove }) {
  return (
    <div
      className={"cmrow cmrow--compact" + (isDragOver ? " cmrow--drop" : "") + (!visible ? " cmrow--off" : "") + (isRecentlyAdded ? " cmrow--just-added" : "")}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="cmrow__drag" title="Drag to reorder"><Icon name="drag" size={12} /></span>
      <span className="cmrow__name">
        {col.label}
        {/* Per-language caption columns surface their language as a small
            badge so the row label is distinct from the canonical "Caption"
            (English) row. T426422. */}
        {col.caption && <span className="cmrow__group">{(col.caption.lang || 'en').toUpperCase()}</span>}
        {col.tone === "exif" && <span className="cmrow__group">EXIF</span>}
        {col.customProp && <span className="cmrow__group">Custom</span>}
        <TemplateBadge relation={relation} templateLabel={templateLabel} />
      </span>
      <DefaultCell col={col} value={defaultValue} onChange={onSetDefault} selfUsername={selfUsername} />
      <button
        className={"cmrow__toggle" + (visible ? " is-on" : "")}
        onClick={onToggleVisible}
        disabled={locked}
        title={locked ? "Always visible" : (visible ? "Hide" : "Show")}
      >
        <Icon name={visible ? "eye" : "eye-off"} size={13} />
      </button>
      <button
        className={"cmrow__toggle cmrow__toggle--req" + (required ? " is-on" : "")}
        onClick={onToggleRequired}
        disabled={locked}
        title={locked ? "Always required" : (required ? "Required — click to make optional" : "Click to make required")}
      >*</button>
      {onRemove && (
        <button
          className="cmrow__remove"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove the "${col.label}" column? Any values entered will be lost.`)) onRemove();
          }}
          title="Remove this custom column"
        >
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  );
}

// Small per-row badge that surfaces the column's relationship to the
// currently-selected template. Drives the "I see why this column matters"
// signal the maintainer asked for in the T425881 review.
function TemplateBadge({ relation, templateLabel }) {
  if (!relation || relation.kind === 'unrelated') return null;
  if (relation.kind === 'mapped') {
    return (
      <span className="cmrow__tbadge cmrow__tbadge--mapped" title={`Maps to ${templateLabel} param: ${relation.param}`}>
        <code>|{relation.param}=</code>
      </span>
    );
  }
  // recommended
  return (
    <span className="cmrow__tbadge cmrow__tbadge--rec" title={`Commonly used with ${templateLabel}`}>
      recommended
    </span>
  );
}

// ---------- Expandable row ----------
function ExpandableRow({
  col, visible, required, locked, defaultValue,
  relation, templateLabel, isRecentlyAdded,
  onToggleVisible, onToggleRequired, onSetDefault,
  onDragStart, onDragOver, onDrop, isDragOver,
  onFillBlank, onOverwriteAll, onOverwriteSelected, selectedCount,
  selfUsername,
  onRemove,
}) {
  const [open, setOpen] = useStateCM(false);
  return (
    <div
      className={"cmrow cmrow--expand" + (isDragOver ? " cmrow--drop" : "") + (!visible ? " cmrow--off" : "") + (open ? " cmrow--open" : "") + (isRecentlyAdded ? " cmrow--just-added" : "")}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="cmrow__head" onClick={() => setOpen(o => !o)}>
        <span className="cmrow__drag" onClick={(e) => e.stopPropagation()} title="Drag to reorder"><Icon name="drag" size={12} /></span>
        <span className="cmrow__chev"><Icon name="chevron-down" size={12} /></span>
        <span className="cmrow__name">
          {col.label}
          {/* T426422 — language tag for caption columns (matches CompactRow). */}
          {col.caption && <span className="cmrow__group">{(col.caption.lang || 'en').toUpperCase()}</span>}
          {col.tone === "exif" && <span className="cmrow__group">EXIF</span>}
          {col.customProp && <span className="cmrow__group">Custom</span>}
          <TemplateBadge relation={relation} templateLabel={templateLabel} />
        </span>

        <div className="cmrow__badges" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={"cmrow__pill" + (required ? " cmrow__pill--req" : " cmrow__pill--opt") + (locked ? " cmrow__pill--locked" : "")}
            onClick={(e) => { e.stopPropagation(); if (!locked) onToggleRequired(); }}
            disabled={locked}
            title={locked ? "Always required" : (required ? "Click to make optional" : "Click to make required")}
          >
            {required ? "required" : "optional"}
          </button>
          {defaultValue && <span className="cmrow__pill cmrow__pill--def" title={`Default: ${col.key === "categories" ? `Category:${defaultValue}` : defaultValue}`}>default set</span>}
        </div>

        <button
          className={"cmrow__toggle" + (visible ? " is-on" : "")}
          onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
          disabled={locked}
          title={locked ? "Always visible" : (visible ? "Hide" : "Show")}
        >
          <Icon name={visible ? "eye" : "eye-off"} size={13} />
        </button>
      </div>

      {open && (
        <div className="cmrow__panel" onClick={(e) => e.stopPropagation()}>
          <div className="cmrow__panel-row cmrow__panel-row--default">
            <span className="cmrow__panel-label">Default value</span>
            <DefaultCell col={col} value={defaultValue} onChange={onSetDefault} expanded selfUsername={selfUsername} />
          </div>
          {!!defaultValue && (col.editable !== false) && !col.immutable && (
            <div className="cmrow__panel-actions">
              <button
                className="btn btn--small"
                onClick={() => onFillBlank && onFillBlank(col.key, defaultValue)}
                title="Apply default to rows where this column is empty"
              >Fill empty cells</button>
              <button
                className="btn btn--small"
                onClick={() => onOverwriteSelected && onOverwriteSelected(col.key, defaultValue)}
                disabled={!selectedCount}
                title={selectedCount ? `Overwrite this column for ${selectedCount} selected file${selectedCount === 1 ? "" : "s"}` : "Select files to enable"}
              >Overwrite selected{selectedCount ? ` (${selectedCount})` : ""}</button>
              <button
                className="btn btn--small btn--destructive-quiet"
                onClick={() => {
                  if (confirm("Overwrite this column for ALL files in the table? This cannot be undone.")) {
                    onOverwriteAll && onOverwriteAll(col.key, defaultValue);
                  }
                }}
                title="Overwrite this column for every file"
              >Overwrite all</button>
            </div>
          )}
          {onRemove && (
            <div className="cmrow__panel-actions">
              <button
                className="btn btn--small btn--destructive-quiet"
                onClick={() => {
                  if (confirm(`Remove the "${col.label}" column? Any values entered will be lost.`)) onRemove();
                }}
                title="Remove this custom column"
              >
                Remove column
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Default-value editor cell (compact + expanded share this).
function DefaultCell({ col, value, onChange, expanded, selfUsername }) {
  // Custom columns (Wikidata-property — the only surviving customProp kind
  // after T426449 dropped wikitext-template columns) are user-editable
  // plain-text inputs. Allow a default value just like author/title would.
  // Truly immutable built-ins (size, EXIF, etc.) still get a muted dash.
  const isCustom = !!col.customProp;
  if ((col.immutable || col.editable === false) && !isCustom) {
    return <span className="cmrow__defaultmuted">—</span>;
  }
  if (col.key === "license") {
    // Reuse the centralised catalog so we don't drift from the rest of the
    // UI when new licences are added. Default-value picker stays catalog-only
    // (no custom branch — see HeaderDefaultPopover for the same call).
    return (
      <select
        className={"cmrow__defaultinput" + (expanded ? " cmrow__defaultinput--lg" : "")}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">No default</option>
        {(window.LICENSE_GROUPS || []).filter(g => g.id !== "custom").map(g => (
          <optgroup key={g.id} label={g.label}>
            {(window.LICENSES || []).filter(l => l.group === g.id).map(l => (
              <option key={l.id} value={l.id} title={l.title}>{l.short}</option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }
  if (col.key === "depicts") {
    return <span className="cmrow__defaultmuted">Set in cell editor</span>;
  }
  // Author column: text input + "Me (Username)" quick-insert button. Inserts
  // the canonical Commons own-work form `[[User:X|X]]`. See T425874.
  if (col.key === "author" && selfUsername) {
    const selfForm = `[[User:${selfUsername}|${selfUsername}]]`;
    const isMe = (value || '').trim() === selfForm;
    return (
      <span className="cmrow__defaultwrap">
        <input
          type="text"
          className={"cmrow__defaultinput" + (expanded ? " cmrow__defaultinput--lg" : "")}
          placeholder={`Default ${col.label.toLowerCase()}`}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          className={"btn btn--small cmrow__defaultbtn" + (isMe ? " is-on" : "")}
          onClick={(e) => { e.stopPropagation(); onChange(selfForm); }}
          title={`Set default to ${selfForm}`}
        >
          <Icon name="user" size={11} /> Me ({selfUsername})
        </button>
      </span>
    );
  }
  // Categories column: free-text input but strip a leading "Category:"
  // before saving so storage stays bare. Display surfaces add the prefix back
  // (the table cell, the chip, the autocomplete). T425912.
  if (col.key === "categories") {
    return (
      <input
        type="text"
        className={"cmrow__defaultinput" + (expanded ? " cmrow__defaultinput--lg" : "")}
        placeholder="Default category (e.g. Mountains)"
        value={value || ""}
        onChange={(e) => {
          const v = e.target.value;
          const cleaned = /^\s*Category\s*:/i.test(v) && window.stripCategoryPrefix
            ? window.stripCategoryPrefix(v)
            : v;
          onChange(cleaned);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  // Source column: text input + `{{own}}` quick-insert button. Note: own-work
  // licences already publish empty source as `{{own}}` automatically — this
  // default is for users who want to make that explicit, or to set a different
  // default attribution across the whole batch. See T425949.
  if (col.key === "source") {
    const isOwn = (value || '').trim() === '{{own}}';
    return (
      <span className="cmrow__defaultwrap">
        <input
          type="text"
          className={"cmrow__defaultinput" + (expanded ? " cmrow__defaultinput--lg" : "")}
          placeholder={`Default ${col.label.toLowerCase()}`}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          className={"btn btn--small cmrow__defaultbtn" + (isOwn ? " is-on" : "")}
          onClick={(e) => { e.stopPropagation(); onChange('{{own}}'); }}
          title="Set default to {{own}}"
        >
          <Icon name="user" size={11} /> {"{{own}}"}
        </button>
      </span>
    );
  }
  return (
    <input
      type="text"
      className={"cmrow__defaultinput" + (expanded ? " cmrow__defaultinput--lg" : "")}
      placeholder={`Default ${col.label.toLowerCase()}`}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

window.ColumnsModal = ColumnsModal;
