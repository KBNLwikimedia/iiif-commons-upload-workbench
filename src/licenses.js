// Centralized license catalog.
//
// One source of truth for the licence selector across cell editor (table.jsx),
// detail panel (detail.jsx), header default-value popover (table.jsx),
// columns-modal default cell (columns-modal.jsx), and the wikitext template
// builder (api/publish.js).
//
// The option set is the Upload Wizard's "Default license for new uploads"
// list — see https://commons.wikimedia.org/wiki/MediaWiki:Licenses and
// the matching baseline documented on T425876.
//
// Each option's `id` is the value we persist in `item.license` (and in the
// user-store Metadata.json drafts). The keys we already used pre-T425876
// (`CC-BY-SA-4.0`, `CC-BY-4.0`, `CC0`, `PD-old-70`, `GFDL`) are preserved as-is
// so existing drafts and history rows keep working.
//
// `template(author)` returns the Commons wikitext that goes under
// `=={{int:license-header}}==` for this licence. The `{{cc-*}}` family
// optionally accepts the original author as a positional parameter; the
// public-domain templates ignore the author argument.
//
// Order: most-used-on-Commons first within each work-source group. The Upload
// Wizard's order is the proxy (CC-BY-SA-4.0 first as the recommended own-work
// licence, then CC BY 4.0, then CC0; older CC versions and the PD claims
// follow). "Custom" is always last — it lets the user enter free-form
// wikitext for unusual cases (e.g. a specific PD tag).
//
// Help links point at Commons' canonical guidance pages:
//   - General "help me pick" page: https://commons.wikimedia.org/wiki/Commons:Choosing_a_license
//   - Per-licence info page (license review and template documentation).

export const LICENSE_HELP_URL =
  'https://commons.wikimedia.org/wiki/Commons:Choosing_a_license';

// Sentinel id for the free-form custom-licence option. Never written into a
// `template()` call — the cell editor flips into a text input when the user
// picks this; the resulting `item.license` is the raw wikitext.
export const CUSTOM_LICENSE_ID = '__custom__';

// Source-of-work category. `own` = user is the copyright holder; `other` =
// someone else made the work; the PD options are listed under `other` to
// match Upload Wizard's grouping.
export const LICENSE_GROUPS = [
  { id: 'own',    label: "I made this work (own work)" },
  { id: 'other',  label: "Someone else made this work" },
  { id: 'custom', label: "Other / custom" },
];

export const LICENSES = [
  // ===== Own work =====
  {
    id: 'CC-BY-SA-4.0',
    short: 'CC BY-SA 4.0',
    title: 'Creative Commons Attribution-ShareAlike 4.0 International',
    group: 'own',
    info: 'You allow anyone to share and adapt the work for any purpose, as long as they credit you and share their adaptations under the same licence. Commons default for own work.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Commons:CC-BY-SA-4.0',
    template: (author) => `{{cc-by-sa-4.0|${author || ''}}}`,
  },
  {
    id: 'CC-BY-4.0',
    short: 'CC BY 4.0',
    title: 'Creative Commons Attribution 4.0 International',
    group: 'own',
    info: 'You allow anyone to share and adapt the work for any purpose, including commercially, as long as they credit you. No share-alike requirement.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Commons:CC-BY-4.0',
    template: (author) => `{{cc-by-4.0|${author || ''}}}`,
  },
  {
    id: 'CC0',
    short: 'CC0',
    title: 'Creative Commons CC0 1.0 Universal Public Domain Dedication',
    group: 'own',
    info: 'You waive all copyright in the work — anyone can use it for any purpose without crediting you. The most permissive option.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Commons:CC0',
    template: () => `{{cc-zero}}`,
  },

  // ===== Someone else's work — modern CC =====
  {
    id: 'CC-BY-SA-3.0',
    short: 'CC BY-SA 3.0',
    title: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
    group: 'other',
    info: 'Older share-alike licence. Use this when the original release was specifically under 3.0.',
    moreUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    template: (author) => `{{cc-by-sa-3.0|${author || ''}}}`,
  },
  {
    id: 'CC-BY-3.0',
    short: 'CC BY 3.0',
    title: 'Creative Commons Attribution 3.0 Unported',
    group: 'other',
    info: 'Older attribution licence. Use this when the original release was specifically under 3.0.',
    moreUrl: 'https://creativecommons.org/licenses/by/3.0/',
    template: (author) => `{{cc-by-3.0|${author || ''}}}`,
  },
  {
    id: 'CC-BY-SA-2.5',
    short: 'CC BY-SA 2.5',
    title: 'Creative Commons Attribution-ShareAlike 2.5 Generic',
    group: 'other',
    info: 'Older share-alike licence. Use this when the original release was specifically under 2.5.',
    moreUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
    template: (author) => `{{cc-by-sa-2.5|${author || ''}}}`,
  },
  {
    id: 'CC-BY-2.5',
    short: 'CC BY 2.5',
    title: 'Creative Commons Attribution 2.5 Generic',
    group: 'other',
    info: 'Older attribution licence. Use this when the original release was specifically under 2.5.',
    moreUrl: 'https://creativecommons.org/licenses/by/2.5/',
    template: (author) => `{{cc-by-2.5|${author || ''}}}`,
  },

  // ===== Someone else's work — public-domain claims =====
  {
    id: 'PD-old-70',
    short: 'PD-old-70',
    title: 'Author has been deceased for more than 70 years',
    group: 'other',
    info: 'Use this for works whose author died over 70 years ago. The work is in the public domain in countries with a "life + 70 years" copyright term.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Template:PD-old-70',
    template: () => `{{PD-old-70}}`,
  },
  {
    id: 'PD-US-expired',
    short: 'PD-US-expired',
    title: 'First published in the United States before 1931',
    group: 'other',
    info: 'Works first published in the US before 1931 are in the US public domain because their copyright term has expired.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Template:PD-US-expired',
    template: () => `{{PD-US-expired}}`,
  },
  {
    id: 'PD-USGov',
    short: 'PD-USGov',
    title: 'Original work of the US Federal Government',
    group: 'other',
    info: 'Works produced by US federal government employees as part of their official duties are not subject to copyright in the US.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Template:PD-USGov',
    template: () => `{{PD-USGov}}`,
  },
  {
    id: 'PD-USGov-NASA',
    short: 'PD-USGov-NASA',
    title: 'Original work of NASA',
    group: 'other',
    info: 'Works produced by NASA are public domain in the US (with limited exceptions for contractor-produced material and the NASA insignia).',
    moreUrl: 'https://commons.wikimedia.org/wiki/Template:PD-USGov-NASA',
    template: () => `{{PD-USGov-NASA}}`,
  },

  // ===== Legacy GFDL — was in the previous narrow list, kept so existing
  // drafts that picked it still resolve. Placed under "other" since GFDL is
  // rarely the right choice for new own-work uploads.
  {
    id: 'GFDL',
    short: 'GFDL',
    title: 'GNU Free Documentation License',
    group: 'other',
    info: 'Older copyleft licence designed for documentation. Rarely the right choice for new uploads — Commons recommends a Creative Commons licence instead.',
    moreUrl: 'https://commons.wikimedia.org/wiki/Commons:GNU_Free_Documentation_License',
    template: (author) => `{{GFDL|${author || ''}}}`,
  },
];

// Lookup helpers ------------------------------------------------------------

const BY_ID = new Map(LICENSES.map((l) => [l.id, l]));

export function getLicense(id) {
  return BY_ID.get(id) || null;
}

// Render the wikitext for a stored license id, or pass the value through
// unchanged if it doesn't match a known id (covers custom licences and
// raw-template values from imported items).
export function renderLicenseTemplate(licenseId, author) {
  const def = BY_ID.get(licenseId);
  if (def) return def.template(author || '');
  return licenseId || '';
}

// Short label for a stored license id; falls back to the raw value (so a
// custom licence still renders something readable in the cell view).
export function licenseShortLabel(licenseId) {
  const def = BY_ID.get(licenseId);
  if (def) return def.short;
  return licenseId || '';
}

// Full descriptive title for hover tooltips. Falls back to the raw id.
export function licenseTitle(licenseId) {
  const def = BY_ID.get(licenseId);
  if (def) return def.title;
  return licenseId || '';
}

// Whether `value` is a recognised catalog id. Used to decide whether to
// render the dropdown as the "custom" branch (with the free-form text input).
export function isKnownLicenseId(value) {
  return BY_ID.has(value);
}

// True when the licence id is in the "own work" group (CC-BY-SA-4.0,
// CC-BY-4.0, CC0). Drives the Source column's default-coupling: an own-work
// licence + an empty Source cell publishes as `{{own}}`; a non-own-work
// licence + an empty Source cell stays empty and falls to the user.
// Custom / unknown licences are NOT treated as own-work — those are typically
// PD claims, third-party releases, or specific tags where attributing the
// uploader as the source would be wrong.
export function isOwnWorkLicense(licenseId) {
  const def = BY_ID.get(licenseId);
  return !!def && def.group === 'own';
}

// Expose on window for the design's window-globals pattern (table.jsx,
// detail.jsx, columns-modal.jsx all read window.X). publish.js uses the
// regular ESM imports above.
if (typeof window !== 'undefined') {
  window.LICENSES = LICENSES;
  window.LICENSE_GROUPS = LICENSE_GROUPS;
  window.LICENSE_HELP_URL = LICENSE_HELP_URL;
  window.CUSTOM_LICENSE_ID = CUSTOM_LICENSE_ID;
  window.getLicense = getLicense;
  window.renderLicenseTemplate = renderLicenseTemplate;
  window.licenseShortLabel = licenseShortLabel;
  window.licenseTitle = licenseTitle;
  window.isKnownLicenseId = isKnownLicenseId;
  window.isOwnWorkLicense = isOwnWorkLicense;
}
