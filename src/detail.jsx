import React from 'react';
import { categoryExists } from './api/commons.js';

// Detail / metadata edit panel — compact + reorderable

const { useState: useState_d, useMemo: useMemo_d } = React;

function DetailPanel({ item, onClose, onUpdate, onPublish, onDelete, onRefresh, onPreviewWikitext, isRefreshing, duplicateOfPublished, fieldOrder, requiredFields, setRequiredFields, groupId, onRemoveFromGroup }) {
  if (!item) return null;
  const isStash = item.status?.startsWith("stash");

  const [showIssues, setShowIssues] = useState_d(false);

  // Esc closes the panel.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // update(key, value) writes one field; update(patch) merges several at
  // once — used by the Caption editor (T426422) to keep the legacy
  // `description` field and the per-language `descriptions.en` slot in
  // sync in a single onUpdate call (avoids the two-update overwrite race).
  const update = (k, v) => {
    if (k && typeof k === 'object' && v === undefined) {
      onUpdate({ ...item, ...k });
    } else {
      onUpdate({ ...item, [k]: v });
    }
  };
  const addCategory = (cat) => {
    if (!cat) return;
    const cats = item.categories || [];
    if (cats.includes(cat)) return;
    update("categories", [...cats, cat]);
  };
  const removeCategory = (cat) => update("categories", (item.categories || []).filter(c => c !== cat));

  // Map field key → which issue codes mark it red
  const fieldIssues = useMemo_d(() => {
    const map = {};
    (item.issues || []).forEach(code => {
      if (code === "missing-title") map.title = true;
      if (code === "missing-license") map.license = true;
      if (code === "missing-author") map.author = true;
      if (code === "missing-categories") map.categories = true;
      if (code === "categories-not-on-commons") map.categories = true;
      if (code === "missing-description") map.description = true;
      // Title format / uniqueness violations also turn the title input red.
      if (code === "invalid-title" || code === "title-taken") map.title = true;
    });
    return map;
  }, [item.issues]);

  const issueCount = item.issues?.length || 0;
  const visibleFields = fieldOrder.filter(f => f.visible);

  return (
    <div className={"detail" + (isStash ? "" : " detail--readonly")}>
      {/* ===== Compact header ===== */}
      <div className="detail__head detail__head--compact">
        <div className="detail__head-row">
          <div className="detail__thumb-mini">
            <Thumb item={item} ratio={item.width && item.height ? item.width/item.height : 4/3} />
          </div>
          <div className="detail__head-text">
            <div className={"detail__title detail__title--compact" + (item.title ? "" : " detail__title--muted")}>
              {item.title || "Untitled"}
            </div>
            <div className="detail__metaline">
              <span className="detail__metaline-name" title={item.filename}>{item.filename}</span>
              <span className="detail__metaline-dot">·</span>
              <span>{formatBytes(item.bytes)}</span>
              {item.width > 0 && (
                <>
                  <span className="detail__metaline-dot">·</span>
                  <span>{compactDims(item.width, item.height)}</span>
                </>
              )}
              <span className="detail__metaline-dot">·</span>
              <span className={"detail__statusdot " + (isStash ? "detail__statusdot--stash" : "detail__statusdot--ok")} />
              <span>{isStash ? "Stashed" : "Published"}</span>
            </div>
          </div>

          <div className="detail__head-actions">
            {issueCount > 0 && (
              <button
                className={"detail__notif" + (showIssues ? " detail__notif--open" : "")}
                onClick={() => setShowIssues(v => !v)}
                title={`${issueCount} issue${issueCount === 1 ? "" : "s"}`}
              >
                <Icon name="warn" size={14} />
                <span className="detail__notif-num">{issueCount}</span>
              </button>
            )}
            {item.status === "published" && (
              <button
                className="btn btn--quiet btn--icon-only"
                onClick={() => onRefresh(item)}
                disabled={isRefreshing}
                title={isRefreshing ? "Refreshing…" : "Refresh metadata from Commons"}
              >
                <span className={isRefreshing ? "spinner spinner--inline" : undefined}>
                  {!isRefreshing && <Icon name="cog" size={14} />}
                </span>
              </button>
            )}
            <button className="btn btn--quiet btn--icon-only" onClick={onClose} title="Close (Esc)">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>

        {/* Issues popover (only when notification clicked) */}
        {showIssues && issueCount > 0 && (
          <div className="detail__issues">
            {item.issues.map(iss => <IssueRow key={iss} code={iss} />)}
          </div>
        )}

        {/* Field-edit hint banner removed — column order is now managed in the table's Columns modal. */}
      </div>

      {/* Duplicate-of-published banner: this stash file's bytes already exist on Commons.
          existsOnCommons (someone else's upload, found via SHA-1 lookup) takes precedence
          over duplicateOfPublished (the user's own history) — the cross-Commons match is
          the more important warning. */}
      {item.existsOnCommons ? (
        <div className="detail__dup-banner" role="alert">
          <Icon name="warn" size={14} />
          <span className="detail__dup-text">
            Identical file already on Commons as{' '}
            <a
              href={item.existsOnCommons.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.existsOnCommons.filename)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              File:{item.existsOnCommons.filename}
            </a>
            {item.existsOnCommons.user && <> — uploaded by <strong>{item.existsOnCommons.user}</strong></>}
            {item.existsOnCommons.timestamp && <> on {new Date(item.existsOnCommons.timestamp).toLocaleDateString()}</>}
            . Publishing would create an exact duplicate.
          </span>
        </div>
      ) : duplicateOfPublished && (
        <div className="detail__dup-banner" role="alert">
          <Icon name="warn" size={14} />
          <span className="detail__dup-text">
            This file is already on Commons as{' '}
            <a
              href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(duplicateOfPublished)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              File:{duplicateOfPublished}
            </a>
            . Publishing now would create a duplicate.
          </span>
        </div>
      )}

      {/* ===== Body ===== */}
      <div className="detail__body">
        {visibleFields.map((f, idx) => (
          <FieldRow
            key={f.key}
            field={f}
            index={idx}
            editing={false}
            isMissing={!!fieldIssues[f.key]}
            item={item}
            update={update}
            addCategory={addCategory}
            removeCategory={removeCategory}
            requiredFields={requiredFields}
            setRequiredFields={setRequiredFields}
          />
        ))}

        <hr className="divider" />
        <div className="detail__actions">
          {isStash ? (
            <>
              <button className="btn btn--progressive" onClick={() => onPublish(item)}>
                <Icon name="publish" size={14} /> Publish to Commons
              </button>
              {onPreviewWikitext && (
                <button
                  className="btn"
                  onClick={() => onPreviewWikitext(item)}
                  title="See the wikitext that will be generated for this file"
                >
                  <Icon name="edit" size={14} /> Preview wikitext
                </button>
              )}
              {/* Remove this row from its manual photo group, putting it back
                  into Ungrouped (T425839). Only shown when the row actually
                  belongs to a group. */}
              {groupId && onRemoveFromGroup && (
                <button
                  className="btn"
                  onClick={() => onRemoveFromGroup(item)}
                  title="Move this row back into Ungrouped"
                >
                  <Icon name="folder" size={14} /> Remove from group
                </button>
              )}
              <button className="btn btn--destructive" onClick={() => onDelete(item)}>
                <Icon name="trash" size={14} /> Discard
              </button>
            </>
          ) : (
            <>
              <a
                className="btn"
                href={item.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.filename || '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="link" size={14} /> View on Commons
              </a>
              <a
                className="btn"
                href={item.url || item.thumburl || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(item.filename || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                <Icon name="download" size={14} /> Download
              </a>
              {onPreviewWikitext && (
                <button
                  className="btn"
                  onClick={() => onPreviewWikitext(item)}
                  title="See the wikitext that would be generated for this file"
                >
                  <Icon name="edit" size={14} /> Preview wikitext
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Field row =====
function FieldRow({ field, index, editing, isMissing, item, update, addCategory, removeCategory, requiredFields, setRequiredFields }) {
  const isAlwaysRequired = window.ALWAYS_REQUIRED && window.ALWAYS_REQUIRED.has(field.key);
  const isRequired = isAlwaysRequired || (requiredFields && requiredFields.includes(field.key));
  const toggleRequired = () => {
    if (isAlwaysRequired || !setRequiredFields) return;
    setRequiredFields(curr =>
      curr.includes(field.key) ? curr.filter(x => x !== field.key) : [...curr, field.key]
    );
  };

  return (
    <div className="field field--row">
      <div className="field__main">
        <FieldContent
          field={field}
          isMissing={isMissing}
          item={item}
          update={update}
          addCategory={addCategory}
          removeCategory={removeCategory}
          editing={editing}
          isRequired={isRequired}
          isAlwaysRequired={isAlwaysRequired}
          onToggleRequired={toggleRequired}
        />
      </div>
    </div>
  );
}

// ===== One field's actual content =====
function FieldContent({ field, isMissing, item, update, addCategory, removeCategory, editing, isRequired, isAlwaysRequired, onToggleRequired }) {
  const labelEl = (
    <div className="field__label-row">
      <label className={"field__label" + (isMissing ? " field__label--err" : "")}>
        {field.label}
        {isRequired && <span className="req">*</span>}
        {isMissing && <span className="field__missing">missing</span>}
      </label>
      {!isAlwaysRequired && onToggleRequired && (
        <button
          className={"field__req-toggle" + (isRequired ? " field__req-toggle--on" : "")}
          onClick={onToggleRequired}
          title={isRequired ? "Click to make optional" : "Click to make required"}
        >
          {isRequired ? "required" : "optional"}
        </button>
      )}
    </div>
  );

  switch (field.key) {
    case "title":
      return (
        <>
          {labelEl}
          <input
            className={"field__input" + (isMissing ? " field__input--err" : "")}
            value={item.title || ""}
            onChange={e => update("title", e.target.value)}
            // Mirror the spreadsheet TitleEditor: trim on blur so a stray
            // trailing space typed mid-edit doesn't get persisted to the
            // user-store as a draft. The validator already ignores
            // edge whitespace (it trims internally), so the visible
            // "invalid" state never lights up for that case either.
            // T425880 feedback 2026-05-11.
            onBlur={e => {
              const cleaned = e.target.value.trim();
              if (cleaned !== e.target.value) update("title", cleaned);
            }}
            placeholder="Descriptive name (becomes File:Name on Commons)"
          />
        </>
      );
    case "description":
      // The field key is `description` for back-compat with drafts, etc., but
      // the user-facing label is "Caption" — that's the SDC term Commons uses.
      // T426422: write through the multi-language helper so descriptions.en
      // stays in sync with the legacy description field — otherwise editing
      // the caption in the detail panel could leave stale Dutch / French /
      // … blocks ahead of the new English text in the published wikitext.
      // The detail panel only edits English; per-language captions are
      // edited from the table view (see CaptionLanguageMenuSection).
      return (
        <>
          {labelEl}
          <CaptionField
            value={item.description || ""}
            isMissing={isMissing}
            onChange={(v) => {
              const setter = window.setCaptionValue;
              if (setter) {
                const next = setter(item, "en", v);
                // Patch update — single onUpdate with both fields so the
                // closure-captured item doesn't overwrite the first write.
                update({
                  description: next.description ?? v,
                  descriptions: next.descriptions || { en: v },
                });
              } else {
                update("description", v);
              }
            }}
          />
        </>
      );
    case "categories":
      return (
        <>
          {labelEl}
          <CategoryEditor
            categories={item.categories || []}
            nonExistingCategories={item.nonExistingCategories || []}
            onAdd={addCategory}
            onRemove={removeCategory}
            isMissing={isMissing}
          />
        </>
      );
    case "license":
      return (
        <>
          {labelEl}
          <LicenseField
            value={item.license || ""}
            onChange={(v) => update("license", v)}
            isMissing={isMissing}
          />
        </>
      );
    case "author":
      return (
        <>
          {labelEl}
          <input
            className={"field__input" + (isMissing ? " field__input--err" : "")}
            value={item.author || ""}
            onChange={e => update("author", e.target.value)}
            placeholder="e.g. Jane Smith"
          />
        </>
      );
    case "source": {
      // Source is coupled to the licence (T425949): own-work licences
      // (CC0 / CC BY 4.0 / CC BY-SA 4.0) auto-fill `{{own}}` at publish
      // time when the cell is empty. The detail panel reflects that with
      // an "Own work" quick-insert button and a hint when the licence is
      // own-work, so the user can see the implicit default without having
      // to type it.
      const ownWork = !!window.isOwnWorkLicense?.(item.license);
      const isOwn = (item.source || '').trim() === '{{own}}';
      return (
        <>
          {labelEl}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="field__input"
              value={item.source || ""}
              onChange={e => update("source", e.target.value)}
              placeholder={ownWork ? "Empty = {{own}} (own-work licence)" : "URL, citation, or {{own}}"}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className={"btn btn--small" + (isOwn ? " is-on" : "")}
              onClick={() => update("source", "{{own}}")}
              title="Insert {{own}}"
            >
              {"{{own}}"}
            </button>
          </div>
          {ownWork && !item.source && (
            <div className="field__hint">
              Empty publishes as <code>{`{{own}}`}</code> because the licence is own-work.
            </div>
          )}
        </>
      );
    }
    case "dateTaken":
      return (
        <>
          {labelEl}
          <input
            type="datetime-local"
            className="field__input"
            value={item.dateTaken ? toLocalDateTime(item.dateTaken) : ""}
            step={60}
            onChange={e => {
              const v = e.target.value;
              if (!v) { update("dateTaken", ""); return; }
              const d = new Date(v);
              if (!isNaN(d)) update("dateTaken", d.toISOString());
            }}
          />
          <div className="field__hint">From the camera — edit if your camera's clock was wrong.</div>
        </>
      );
    case "location": {
      const cam = item.cameraLocation || item.coords;
      const obj = item.objectLocation;
      return (
        <>
          {labelEl}
          <div className="loc-pair">
            <div className="loc-pair__row">
              <span className="loc-pair__label">Camera</span>
              {cam ? (
                <span className="loc-pair__value mono">{cam.lat.toFixed(4)}°N, {cam.lon.toFixed(4)}°E</span>
              ) : (
                <span className="loc-pair__placeholder">— from EXIF or manual</span>
              )}
            </div>
            <div className="loc-pair__row">
              <span className="loc-pair__label">Object</span>
              {obj ? (
                <span className="loc-pair__value mono">{obj.lat.toFixed(4)}°N, {obj.lon.toFixed(4)}°E</span>
              ) : (
                <span className="loc-pair__placeholder">— what's depicted</span>
              )}
            </div>
          </div>
          <div className="map">
            {cam && (
              <div className="map__pin" style={{ left: "42%", top: "55%" }}>
                <Icon name="geo" size={28} />
              </div>
            )}
            {obj && (
              <div className="map__pin" style={{ left: "55%", top: "48%", color: "#2563eb" }}>
                <Icon name="geo" size={28} />
              </div>
            )}
          </div>
          <div className="field__hint">Edit either location from the table cell — click the mini-map.</div>
        </>
      );
    }
    case "technical":
      return (
        <>
          {labelEl}
          <dl className="kvgrid kvgrid--tight">
            <dt>MIME</dt><dd className="mono">{item.mime}</dd>
            {item.camera && <><dt>Camera</dt><dd>{item.camera}</dd></>}
            {item.iso && <><dt>Exposure</dt><dd>ISO {item.iso} · {item.aperture} · {item.shutter}</dd></>}
            {item.focal && <><dt>Focal length</dt><dd>{item.focal}</dd></>}
            {item.expiresAt && item.status?.startsWith("stash") && (
              <><dt>Expires</dt><dd>{timeUntil(item.expiresAt)}</dd></>
            )}
            {item.views !== undefined && item.status === "published" && (
              <><dt>Views</dt><dd>{item.views.toLocaleString()}</dd></>
            )}
          </dl>
        </>
      );
    default:
      return <>{labelEl}<div className="field__hint">—</div></>;
  }
}

// Detail-panel licence picker. Same option set as the in-cell editor but
// laid out vertically with room for a "Help me pick a licence" link, an
// info-text line for the current pick, and a "More info" link to the
// Commons template page. The "Custom licence…" branch reveals a free-form
// text input; whatever the user types becomes the stored value verbatim.
function LicenseField({ value, onChange, isMissing }) {
  const groups = window.LICENSE_GROUPS || [];
  const licenses = window.LICENSES || [];

  const known = window.isKnownLicenseId(value);
  const isCustom = !!value && !known;
  const selectValue = !value ? "" : (known ? value : window.CUSTOM_LICENSE_ID);

  const onChangeSelect = (e) => {
    const v = e.target.value;
    if (v === window.CUSTOM_LICENSE_ID) {
      // Switching into custom: keep any existing custom text the user had.
      onChange(isCustom ? value : "");
    } else {
      onChange(v);
    }
  };

  const def = known ? window.getLicense(value) : null;

  return (
    <>
      <select
        className={"select" + (isMissing ? " select--err" : "")}
        style={{ width: "100%" }}
        value={selectValue}
        onChange={onChangeSelect}
      >
        <option value="" title="Pick a licence">— Choose a license —</option>
        {groups.filter(g => g.id !== "custom").map(g => (
          <optgroup key={g.id} label={g.label}>
            {licenses.filter(l => l.group === g.id).map(l => (
              <option key={l.id} value={l.id} title={l.title}>{l.short}</option>
            ))}
          </optgroup>
        ))}
        <option value={window.CUSTOM_LICENSE_ID} title="Enter a different licence as raw wikitext">
          Custom licence…
        </option>
      </select>
      {selectValue === window.CUSTOM_LICENSE_ID && (
        <input
          className="field__input"
          style={{ marginTop: 6 }}
          value={isCustom ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Custom wikitext, e.g. {{PD-because|reason}}"
        />
      )}
      {def && (
        <div className="lic-field__help">
          <div className="lic-field__title">{def.title}</div>
          <div className="lic-field__desc">{def.info}</div>
          {def.moreUrl && (
            <a
              className="lic-field__more"
              href={def.moreUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              More info <Icon name="external" size={11} />
            </a>
          )}
        </div>
      )}
      <a
        className="lic-field__pick"
        href={window.LICENSE_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Help me pick a licence <Icon name="external" size={11} />
      </a>
    </>
  );
}

function CategoryEditor({ categories, onAdd, onRemove, isMissing, nonExistingCategories }) {
  const [input, setInput] = React.useState("");
  // Strip a leading "Category:" if the user typed one — storage stays bare.
  // Display surfaces add the prefix back. (T425912)
  const normalize = (s) => (window.stripCategoryPrefix ? window.stripCategoryPrefix(s) : String(s || "").trim());
  const fmt = (s) => (window.formatCategory ? window.formatCategory(s) : `Category:${s}`);
  // T425950: typed names that don't resolve on Commons are rejected
  // outright (the tool no longer creates new categories — see the cell
  // editor in table.jsx for the same rule). `rejected` carries the most
  // recently refused name so we can surface a one-line hint right under
  // the input. `pending` flags an in-flight existence check (Enter
  // during the network round-trip shows "checking…" instead of
  // suggesting a fresh add).
  const [rejected, setRejected] = React.useState(null); // { value, reason }
  const [pending, setPending] = React.useState(null); // string | null
  // Render names the parent has already verified as missing on Commons
  // in the same red style as the table cell. The detail panel doesn't
  // own the per-row existence cache — the parent's per-row effect in
  // app.jsx is the source of truth for chips that came in via
  // categories. We only do an on-confirm check for newly-typed names
  // (so the user can't sneak an unknown name through).
  const missingSet = new Set(nonExistingCategories || []);
  // Pull autocomplete suggestions from the same merged pool the table
  // editor uses, instead of the legacy hardcoded handful, so users in
  // this panel can still pick existing Commons categories without the
  // tool inventing names.
  const SUGGEST = (window.KNOWN_CATEGORIES || [])
    .filter(s => !categories.includes(s) && (input ? s.toLowerCase().includes(normalize(input).toLowerCase()) : false))
    .slice(0, 6);

  // Add a name only when it's confirmed to exist on Commons. Suggestion
  // pills come straight from the merged pool so they shortcut the API
  // check. Free-typed names go through `categoryExists`; the chip is
  // created only on confirmation.
  const tryAdd = (name) => {
    const t = normalize(name);
    if (!t) return;
    if (categories.includes(t)) {
      setInput("");
      setRejected(null);
      return;
    }
    if (window.isKnownCategory && window.isKnownCategory(t)) {
      onAdd(t);
      setInput("");
      setRejected(null);
      return;
    }
    setPending(t);
    categoryExists(t)
      .then((exists) => {
        setPending(null);
        if (exists) {
          onAdd(t);
          setInput("");
          setRejected(null);
        } else {
          setRejected({ value: t, reason: 'missing' });
        }
      })
      .catch((e) => {
        console.warn('[detail/category] existence check failed for', t, e?.message || e);
        setPending(null);
        setRejected({ value: t, reason: 'network' });
      });
  };

  const submit = () => { tryAdd(input); };

  const trimmedInput = input.trim();
  const showPending = pending && pending === trimmedInput;
  const showReject = !showPending && rejected?.value === trimmedInput;

  return (
    <>
      <div className={"tags" + (isMissing ? " tags--err" : "")}>
        {categories.map(c => {
          const red = missingSet.has(c);
          return (
            <span
              className={"tag" + (red ? " tag--unknown" : "")}
              key={c}
              title={red ? `${c} — does not exist on Commons; will not be published` : c}
            >
              {fmt(c)}
              <button className="tag__x" onClick={() => onRemove(c)} title="Remove">
                <Icon name="close" size={12} />
              </button>
            </span>
          );
        })}
        <input
          className={"tags__add" + (showReject ? " tags__add--rejected" : "")}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            if (rejected) setRejected(null);
          }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={categories.length ? "Add another existing category…" : "Type to search existing categories"}
        />
      </div>
      {input && SUGGEST.length > 0 && (
        <div style={{
          marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap",
          fontSize: "var(--font-size-x-small)"
        }}>
          {SUGGEST.map(s => (
            <button key={s} className="btn btn--small btn--quiet" onClick={() => { tryAdd(s); }}>
              <Icon name="plus" size={12} /> {fmt(s)}
            </button>
          ))}
        </div>
      )}
      {showPending && (
        <div className="cat-edit__hint cat-edit__hint--pending">
          <Icon name="info" size={11} /> Checking '{trimmedInput}' on Commons…
        </div>
      )}
      {showReject && (
        <div className="cat-edit__hint cat-edit__hint--reject">
          <Icon name="warn" size={11} />
          {rejected.reason === 'missing'
            ? <> '{trimmedInput}' isn't an existing Commons category — pick a suggestion or try a different spelling.</>
            : <> Couldn't reach Commons to verify '{trimmedInput}'. Try again.</>}
        </div>
      )}
    </>
  );
}

// ===== Caption field with quiet, threshold-based char count + inline validation =====
// Mirrors the spreadsheet cell editor's Caption rules. See validateCaption /
// CAPTION_MAX_LENGTH / CAPTION_COUNTER_THRESHOLD in src/table.jsx for the
// rule definitions and the maintainer-spec'd UX (T425878 feedback):
//   - Counter hidden until user is within ~50 chars of the cap (>=200).
//   - Counter is neutral grey at 200–250 and red over 250.
//   - Over-limit message sits on the same line as the counter, no count repeat.
//   - Trailing/leading whitespace trimmed silently on blur — never shown as an error.
//   - Placeholder describes the *goal* of a caption, not the limit.
function CaptionField({ value, onChange, isMissing }) {
  const validate = window.validateCaption;
  const max = window.CAPTION_MAX_LENGTH || 250;
  const counterThreshold = window.CAPTION_COUNTER_THRESHOLD || 200;
  const result = validate ? validate(value) : { valid: true, errors: [], length: (value || "").length };
  const overLimit = result.length > max;
  const showCounter = result.length >= counterThreshold;
  const counterCls = "field__caption-counter"
    + (overLimit ? " field__caption-counter--err" : "");
  const overLimitErr = result.errors.find((e) => e.code === "too-long") || null;
  const otherErrors = result.errors.filter((e) => e.code !== "too-long");

  // Strip vertical whitespace on input so multi-line paste doesn't sneak in a
  // newline; trim leading/trailing whitespace only on blur, so the user can
  // still hit space mid-word without the value snapping back.
  const onInputChange = (e) => onChange(e.target.value.replace(/[\n\r\v\t]+/g, " "));
  const onBlur = () => {
    const trimmed = (value || "").trim();
    if (trimmed !== value) onChange(trimmed);
  };

  return (
    <div className="field__caption">
      <input
        type="text"
        className={
          "field__input"
          + (isMissing ? " field__input--err" : "")
          + (overLimit ? " field__input--err" : "")
        }
        value={value}
        onChange={onInputChange}
        onBlur={onBlur}
        placeholder="Brief description of the file"
        aria-invalid={!result.valid}
      />
      <div className="field__caption-meta">
        {(showCounter || overLimitErr) && (
          <div className="field__caption-line">
            {overLimitErr
              ? <span className="field__caption-inline-err">{overLimitErr.message}</span>
              : <span className="field__caption-line-spacer" />}
            <span className={counterCls} aria-live="polite">{result.length} / {max}</span>
          </div>
        )}
        {otherErrors.length > 0 && (
          <ul className="field__caption-errors">
            {otherErrors.map((err) => (
              <li key={err.code}><Icon name="warn" size={11} /> {err.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IssueRow({ code }) {
  const map = {
    "missing-license": { sev: "err", text: "License is required before this file can be published." },
    "missing-title": { sev: "err", text: "Add a descriptive title — the filename alone won't do." },
    "missing-author": { sev: "warn", text: "Author/source is missing." },
    "missing-categories": { sev: "warn", text: "No categories — add at least one to help reusers find this file." },
    "missing-description": { sev: "warn", text: "A short caption (≤ 250 chars) helps people understand the image." },
    "categories-not-on-commons": { sev: "err", text: "One or more categories don't exist on Commons. Remove the red chips or replace them with existing categories — the tool no longer creates new ones." },
    "possible-duplicate": { sev: "warn", text: "Looks similar to a file already on Commons." },
    "exists-on-commons": { sev: "err", text: "Identical file already exists on Commons (same SHA-1)." },
    "invalid-title": { sev: "err", text: "Title violates Commons filename rules — fix it before publishing." },
    "title-taken": { sev: "err", text: "Title is already in use on Commons — pick a different one." },
    "format-warning": { sev: "info", text: "HEIC files are accepted but JPEG/PNG are preferred." },
    "large-file-warning": { sev: "info", text: "Large file — upload may take a moment to publish." }
  };
  const m = map[code] || { sev: "info", text: code };
  return (
    <div className={"issue issue--" + m.sev}>
      <Icon name={m.sev === "err" ? "warn" : m.sev === "warn" ? "warn" : "info"} size={12} />
      <span>{m.text}</span>
    </div>
  );
}

function compactDims(w, h) {
  // Compact pixel dims, e.g. 6000×4000 → 6000×4000, but trim if huge
  return `${w.toLocaleString()}×${h.toLocaleString()}`;
}

function formatBytes(b) {
  if (!b) return "—";
  if (b > 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function toLocalDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// Stash files auto-expire within ~48h, so a "days" countdown rounds away the
// urgency the user actually needs to act on (e.g. "in 1 day" can be anywhere
// from 24h to 47h). Always express the remaining stash window in hours /
// minutes — same convention as the stash-section header. (T425883)
function timeUntil(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  return `in ${mins}m`;
}

window.DetailPanel = DetailPanel;
window.formatBytes = formatBytes;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.timeUntil = timeUntil;
