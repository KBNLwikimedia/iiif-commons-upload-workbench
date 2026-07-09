// Wikitext template registry + renderer.
//
// Today the published wikitext is built from {{Information}}. Different
// Commons workflows expect different templates — {{Artwork}} for paintings,
// {{Photograph}} for photographs with EXIF, {{Book}} for scanned books, plus
// a handful of specialist templates ({{Map}}, {{Art photo}}, {{Specimen}},
// {{Musical work}}). The catalogue here aims to be exhaustive for primary
// file-description templates; custom-wikitext escape hatches were removed in
// T426449 in favour of enumerating every supported template as a first-class
// option.
//
// A "template config" is a small descriptor: which template is selected. The
// renderer turns it into the actual `{{Foo|param=value|...}}` block that gets
// posted.
//
// Field mapping uses the workbench's internal column keys (the same ones
// used by the table and detail panel) — see `FIELD_HANDLERS` below.

import { isOwnWorkLicense } from './licenses.js';

// Internal column keys → renderable strings. Keep this list aligned with
// `DRAFT_FIELDS` in user-store.js and the cell editors in table.jsx.
const FIELD_HANDLERS = {
  description: (item) => formatDescription(item),
  date: (item) => formatDate(item),
  source: (item) => formatSource(item),
  author: (item) => item.author || '',
  title: (item) => item.title || '',
  permission: () => '',
  other_versions: () => '',
  other_fields: () => '',
};

// Public catalogue: built-in templates with their default field-map.
//
// `fields` is an ordered list of { param, key, required?, hint? } entries.
//   - `param` is the template's named parameter (e.g. "description").
//   - `key` is the workbench column key whose value flows into it. `null`
//     means the template has this param but the workbench doesn't model it
//     (the param is documented in the expanded row but never rendered).
//   - `required` is the docs-page "required" flag for this param — drives
//     the required/optional badge in the Templates tab.
//   - `hint` is a one-line "expected value" note from the docs page (e.g.
//     "ISO 8601 date" for {{Information|date}}).
//
// `requiredColumns` is the list of columns the template normally expects to
// be filled in (drives the "add these columns" suggestion when switching).
//
// `recommendedColumns` is broader: columns the user probably wants enabled
// in the table when working with this template, even if the template
// doesn't strictly require them.
//
// `useCase` is a one-line description shown next to the template name in the
// Templates tab list.
//
// `docsName` is the page name on Commons. Defaults to `name` if absent —
// used to build the docs link (`https://commons.wikimedia.org/wiki/Template:<docsName>`)
// plus per-param anchors (`#<param>`).
//
// Insertion order in this object is also the display order in the Templates
// tab — keep it sorted by prevalence (Information first, niche stuff last).
export const BUILTIN_TEMPLATES = {
  Information: {
    id: 'Information',
    label: '{{Information}}',
    name: 'Information',
    useCase: 'Default for most uploads. Generic media — recommended unless one of the specialist templates fits better.',
    description: 'Default for most uploads. Generic media template.',
    fields: [
      { param: 'description', key: 'description', required: true,  hint: 'Multilingual: {{en|1=…}}{{nl|1=…}} (filled automatically when the description column has language pairs).' },
      { param: 'date',        key: 'dateTaken',   required: false, hint: 'ISO 8601 (YYYY-MM-DD). Optional but strongly recommended.' },
      { param: 'source',      key: 'source',      required: true,  hint: '{{own}} for own work, otherwise a URL or citation.' },
      { param: 'author',      key: 'author',      required: true,  hint: '[[User:You|You]] for own uploads, or the creator\'s name + a link.' },
      { param: 'permission',  key: null,          required: false, hint: 'Only when a separate permission template ({{OTRS}}, etc.) applies.' },
      { param: 'other_versions', key: null,       required: false, hint: 'Gallery / list of related file versions.' },
      { param: 'other_fields', key: null,         required: false, hint: 'Free-form additional metadata (rarely used).' },
    ],
    requiredColumns: ['description', 'author'],
    recommendedColumns: ['title', 'description', 'author', 'license', 'categories', 'dateTaken'],
  },

  Photograph: {
    id: 'Photograph',
    label: '{{Photograph}}',
    name: 'Photograph',
    useCase: 'Photographs (especially historical / archival, museum holdings, GLAM uploads). Adds photographer + EXIF-friendly fields.',
    description: 'For photographs (especially historical/archival). Adds photographer + EXIF-friendly fields.',
    fields: [
      { param: 'photographer',       key: 'author',         required: true,  hint: 'The person who took the photograph.' },
      { param: 'title',              key: 'title',          required: false, hint: 'Photograph title, if any.' },
      { param: 'description',        key: 'description',    required: true,  hint: 'What the photograph shows.' },
      { param: 'depicted people',    key: null,             required: false, hint: 'People shown in the photograph (free text or {{Creator:…}}).' },
      { param: 'depicted place',     key: 'objectLocation', required: false, hint: 'Place shown (Wikidata link or free text).' },
      { param: 'date',               key: 'dateTaken',      required: false, hint: 'ISO 8601 (YYYY-MM-DD).' },
      { param: 'medium',             key: null,             required: false, hint: 'Print process / film type (e.g. "albumen print").' },
      { param: 'dimensions',         key: null,             required: false, hint: 'Physical size of the print/negative.' },
      { param: 'institution',        key: null,             required: false, hint: 'Holding institution ({{Institution:…}}).' },
      { param: 'department',         key: null,             required: false, hint: 'Sub-collection within the institution.' },
      { param: 'references',         key: null,             required: false, hint: 'External references / citations.' },
      { param: 'object history',     key: null,             required: false, hint: 'Provenance trail.' },
      { param: 'exhibition history', key: null,             required: false, hint: 'Where the print has been displayed.' },
      { param: 'credit line',        key: null,             required: false, hint: 'Standard credit-line text the institution requires.' },
      { param: 'inscriptions',       key: null,             required: false, hint: 'Text written on or attached to the original.' },
      { param: 'notes',              key: null,             required: false, hint: 'Free-form notes.' },
      { param: 'accession number',   key: null,             required: false, hint: 'Catalogue / inventory number at the holding institution.' },
      { param: 'source',             key: 'source',         required: true,  hint: '{{own}} for own work, otherwise a URL / citation.' },
      { param: 'permission',         key: null,             required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'other_versions',     key: null,             required: false, hint: 'Gallery / list of related file versions.' },
    ],
    requiredColumns: ['author', 'description'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken', 'cameraLocation', 'objectLocation'],
  },

  Artwork: {
    id: 'Artwork',
    label: '{{Artwork}}',
    name: 'Artwork',
    useCase: 'Artworks: paintings, sculptures, museum pieces. Maps to Wikidata via {{Creator:…}}.',
    description: 'For artworks (paintings, sculptures, etc.). Maps to Wikidata via {{Creator:…}}.',
    fields: [
      { param: 'artist',             key: 'author',         required: true,  hint: 'Use {{Creator:…}} when the artist has a Wikidata entry.' },
      { param: 'title',              key: 'title',          required: false, hint: 'Multilingual title (use {{Title|lang=…|1=…}} for multiple translations).' },
      { param: 'description',        key: 'description',    required: false, hint: 'What the artwork depicts.' },
      { param: 'depicted people',    key: null,             required: false, hint: 'People depicted in the artwork.' },
      { param: 'depicted place',     key: 'objectLocation', required: false, hint: 'Place depicted (Wikidata link or free text).' },
      { param: 'date',               key: 'dateTaken',      required: false, hint: 'When the work was created. ISO 8601 or {{other date|circa|1850}}.' },
      { param: 'medium',             key: 'medium',         required: false, hint: 'Material/technique (e.g. "oil on canvas").' },
      { param: 'dimensions',         key: 'dimensions',     required: false, hint: 'Use {{Size|height|width|unit}} for structured values.' },
      { param: 'institution',        key: 'institution',    required: false, hint: 'Holding institution ({{Institution:…}}).' },
      { param: 'department',         key: 'department',     required: false, hint: 'Sub-collection within the institution.' },
      { param: 'location',           key: 'objectLocation', required: false, hint: 'Gallery / room within the institution.' },
      { param: 'references',         key: null,             required: false, hint: 'External references / catalogue raisonné entries.' },
      { param: 'object_history',     key: null,             required: false, hint: 'Provenance trail.' },
      { param: 'exhibition_history', key: null,             required: false, hint: 'Where the work has been exhibited.' },
      { param: 'credit_line',        key: null,             required: false, hint: 'Standard credit-line text the institution requires.' },
      { param: 'inscriptions',       key: null,             required: false, hint: 'Inscriptions on the artwork itself.' },
      { param: 'notes',              key: null,             required: false, hint: 'Free-form notes.' },
      // NB: Commons {{Artwork}} spells this param with a space ("accession
      // number"); the underscored form isn't a recognised alias. Harmless
      // while key was null (the param never rendered) — fixed when wiring it.
      { param: 'accession number',   key: 'accessionNumber', required: false, hint: 'Catalogue / inventory number at the holding institution.' },
      { param: 'source',             key: 'source',         required: true,  hint: 'Original source (URL, museum citation, or {{own}}).' },
      { param: 'permission',         key: null,             required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'other_versions',     key: null,             required: false, hint: 'Gallery / list of related file versions.' },
      { param: 'wikidata',           key: null,             required: false, hint: 'Q-id of the artwork itself. Fills many other fields automatically.' },
    ],
    requiredColumns: ['title', 'author', 'description'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken', 'depicts'],
  },

  Book: {
    id: 'Book',
    label: '{{Book}}',
    name: 'Book',
    useCase: 'Scanned books, manuscripts, multi-page printed works.',
    description: 'For scanned books, manuscripts, and printed works.',
    fields: [
      { param: 'Author',            key: 'author',      required: false, hint: 'Use {{Creator:…}} for known authors.' },
      { param: 'Translator',        key: null,          required: false, hint: 'Translator (Creator template encouraged).' },
      { param: 'Editor',            key: null,          required: false, hint: 'Editor of the volume.' },
      { param: 'Illustrator',       key: null,          required: false, hint: 'Illustrator, when separate from author.' },
      { param: 'Title',             key: 'title',       required: true,  hint: 'Book title.' },
      { param: 'Subtitle',          key: null,          required: false, hint: 'Subtitle, if any.' },
      { param: 'Series title',      key: null,          required: false, hint: 'Series this volume belongs to.' },
      { param: 'Volume',            key: null,          required: false, hint: 'Volume number / identifier.' },
      { param: 'Edition',           key: null,          required: false, hint: 'Edition number / year.' },
      { param: 'Publisher',         key: null,          required: false, hint: 'Publishing house.' },
      { param: 'Printer',           key: null,          required: false, hint: 'Printer (when distinct from publisher).' },
      { param: 'Date',              key: 'dateTaken',   required: false, hint: 'Publication date (ISO 8601 or year).' },
      { param: 'City',              key: null,          required: false, hint: 'City of publication.' },
      { param: 'Language',          key: null,          required: false, hint: 'ISO 639 language code or full name.' },
      { param: 'Description',       key: 'description', required: false, hint: 'What the book contains.' },
      { param: 'Source',            key: 'source',      required: true,  hint: '{{own}} for own scans, otherwise an archive URL.' },
      { param: 'Permission',        key: null,          required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'Image',             key: null,          required: false, hint: 'Filename of the cover/representative image when this is a {{Book}} root page.' },
      { param: 'Image page',        key: null,          required: false, hint: 'Page number that the cover image represents.' },
      { param: 'Pageoverview',      key: null,          required: false, hint: 'Page overview / table of contents (raw wikitext).' },
      { param: 'Wikisource',        key: null,          required: false, hint: 'Wikisource page name, when transcribed.' },
      { param: 'Homecat',           key: null,          required: false, hint: 'Top category for the work (no "Category:" prefix).' },
      { param: 'Other_versions',    key: null,          required: false, hint: 'Related editions or scans.' },
      { param: 'ISBN',              key: null,          required: false, hint: 'ISBN-10 or ISBN-13.' },
      { param: 'LCCN',              key: null,          required: false, hint: 'Library of Congress Control Number.' },
      { param: 'OCLC',              key: null,          required: false, hint: 'OCLC / WorldCat number.' },
      { param: 'Institution',       key: null,          required: false, hint: 'Holding institution ({{Institution:…}}).' },
      { param: 'Department',        key: null,          required: false, hint: 'Sub-collection within the institution.' },
      { param: 'Accession number',  key: null,          required: false, hint: 'Catalogue / shelfmark.' },
      { param: 'References',        key: null,          required: false, hint: 'External references / citations.' },
      { param: 'Linkback',          key: null,          required: false, hint: 'Backlink to the holding institution\'s catalogue page.' },
      { param: 'Wikidata',          key: null,          required: false, hint: 'Q-id of the book/edition itself.' },
      { param: 'noimage',           key: null,          required: false, hint: 'Set to a non-empty value to suppress the auto-thumbnail.' },
    ],
    requiredColumns: ['title', 'author'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken'],
  },

  Map: {
    id: 'Map',
    label: '{{Map}}',
    name: 'Map',
    useCase: 'Maps and cartographic works. Captures projection, scale, coordinates, and warp state.',
    description: 'For maps. Captures projection, scale, coordinates, and warp state.',
    fields: [
      { param: 'author',            key: 'author',         required: true,  hint: 'Cartographer or publisher of the map.' },
      { param: 'source',            key: 'source',         required: true,  hint: 'Where the map came from (URL / citation / {{own}}).' },
      { param: 'title',             key: 'title',          required: false, hint: 'Original map title.' },
      { param: 'wikidata title',    key: null,             required: false, hint: 'Q-id of the work (overrides title with a Wikidata-linked one).' },
      { param: 'description',       key: 'description',    required: false, hint: 'What the map shows.' },
      { param: 'legend',            key: null,             required: false, hint: 'Explanation of the map\'s legend / key.' },
      { param: 'date',              key: 'dateTaken',      required: false, hint: 'Date the map was made (ISO 8601 or year).' },
      { param: 'permission',        key: null,             required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'map date',          key: null,             required: false, hint: 'Date the map\'s data refers to, if distinct from creation date.' },
      { param: 'location',          key: 'objectLocation', required: false, hint: 'Free-text or wikilinked region the map covers.' },
      { param: 'wikidata location', key: null,             required: false, hint: 'Q-id of the location depicted.' },
      { param: 'type',              key: null,             required: false, hint: 'Map type (topographic, political, thematic, …).' },
      { param: 'projection',        key: null,             required: false, hint: 'Cartographic projection (Mercator, equirectangular, …).' },
      { param: 'scale',             key: null,             required: false, hint: 'Map scale (e.g. "1:100,000").' },
      { param: 'zoom',              key: null,             required: false, hint: 'Default zoom level for interactive viewers.' },
      { param: 'heading',           key: null,             required: false, hint: 'Map orientation in degrees (0 = north up).' },
      { param: 'latitude',          key: null,             required: false, hint: 'Centre latitude (decimal degrees).' },
      { param: 'longitude',         key: null,             required: false, hint: 'Centre longitude (decimal degrees).' },
      { param: 'warp status',       key: null,             required: false, hint: 'Georeferencing state (warped / unwarped).' },
      { param: 'warp url',          key: null,             required: false, hint: 'Link to the warped (georeferenced) version.' },
      { param: 'set',               key: null,             required: false, hint: 'Map set / atlas this sheet belongs to.' },
      { param: 'sheet',             key: null,             required: false, hint: 'Sheet number within the set.' },
      { param: 'language',          key: null,             required: false, hint: 'Language of labels on the map.' },
      { param: 'publisher',         key: null,             required: false, hint: 'Publisher of the map.' },
      { param: 'printer',           key: null,             required: false, hint: 'Printer (when distinct from publisher).' },
      { param: 'print date',        key: null,             required: false, hint: 'When this copy was printed.' },
      { param: 'publication place', key: null,             required: false, hint: 'City of publication.' },
      { param: 'institution',       key: null,             required: false, hint: 'Holding institution ({{Institution:…}}).' },
      { param: 'accession number',  key: null,             required: false, hint: 'Catalogue / inventory number.' },
      { param: 'dimensions',        key: null,             required: false, hint: 'Physical size of the map sheet.' },
      { param: 'medium',            key: null,             required: false, hint: 'Material (paper, vellum, digital, …).' },
      { param: 'credit line',       key: null,             required: false, hint: 'Standard credit-line text the institution requires.' },
      { param: 'inscriptions',      key: null,             required: false, hint: 'Inscriptions / cartouche text.' },
      { param: 'notes',             key: null,             required: false, hint: 'Free-form notes.' },
      { param: 'other versions',    key: null,             required: false, hint: 'Gallery / list of related versions.' },
      { param: 'references',        key: null,             required: false, hint: 'External references / citations.' },
    ],
    requiredColumns: ['author'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken', 'objectLocation'],
  },

  ArtPhoto: {
    id: 'ArtPhoto',
    label: '{{Art photo}}',
    name: 'Art photo',
    docsName: 'Art photo',
    useCase: 'Photographs of artworks. Separates the photo\'s license / photographer from the underlying artwork\'s.',
    description: 'Photographs of artworks — separates photographer + artwork license.',
    fields: [
      { param: 'photographer',      key: 'author',         required: true,  hint: 'Person who took the photo of the artwork.' },
      { param: 'photo description', key: null,             required: false, hint: 'Notes specific to the photograph (lighting, framing, …).' },
      { param: 'photo date',        key: 'dateTaken',      required: false, hint: 'When the photo was taken (ISO 8601).' },
      { param: 'photo license',     key: null,             required: false, hint: 'License of the photograph itself (separate from the artwork\'s).' },
      { param: 'source',            key: 'source',         required: true,  hint: 'Where the photo came from ({{own}}, URL, citation).' },
      { param: 'artwork license',   key: null,             required: false, hint: 'License of the underlying artwork — often {{PD-art}} for old works.' },
      { param: 'artist',            key: null,             required: false, hint: 'Creator of the underlying artwork.' },
      { param: 'title',             key: 'title',          required: false, hint: 'Title of the underlying artwork.' },
      { param: 'description',       key: 'description',    required: false, hint: 'What the artwork shows.' },
      { param: 'date',              key: null,             required: false, hint: 'Date the underlying artwork was created.' },
      { param: 'medium',            key: null,             required: false, hint: 'Material/technique of the artwork.' },
      { param: 'dimensions',        key: null,             required: false, hint: 'Physical size of the artwork.' },
      { param: 'institution',       key: null,             required: false, hint: 'Where the artwork is held.' },
      { param: 'department',        key: null,             required: false, hint: 'Sub-collection within the institution.' },
      { param: 'location',          key: 'objectLocation', required: false, hint: 'Gallery / room.' },
      { param: 'accession number',  key: null,             required: false, hint: 'Catalogue / inventory number.' },
      { param: 'object history',    key: null,             required: false, hint: 'Provenance of the artwork.' },
      { param: 'credit line',       key: null,             required: false, hint: 'Credit line the institution requires.' },
      { param: 'inscriptions',      key: null,             required: false, hint: 'Inscriptions on the artwork.' },
      { param: 'notes',             key: null,             required: false, hint: 'Free-form notes.' },
      { param: 'references',        key: null,             required: false, hint: 'External references.' },
      { param: 'permission',        key: null,             required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'wikidata',          key: null,             required: false, hint: 'Q-id of the underlying artwork.' },
      { param: 'other_versions',    key: null,             required: false, hint: 'Gallery / list of related files.' },
    ],
    requiredColumns: ['author', 'source'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken'],
  },

  Specimen: {
    id: 'Specimen',
    label: '{{Specimen}}',
    name: 'Specimen',
    useCase: 'Biological specimens (botanical / zoological / mineralogical). Captures taxon, authority, accession.',
    description: 'For biological / mineralogical specimens. Captures taxon, authority, accession.',
    fields: [
      { param: 'taxon',            key: null,             required: true,  hint: 'Scientific binomial name (e.g. "Felis catus").' },
      { param: 'authority',        key: null,             required: false, hint: 'Author + year of the taxon name (e.g. "Linnaeus, 1758").' },
      { param: 'institution',      key: null,             required: false, hint: 'Holding institution ({{Institution:…}}).' },
      { param: 'accession number', key: null,             required: false, hint: 'Catalogue / specimen number at the institution.' },
      { param: 'sex',              key: null,             required: false, hint: 'Sex of the specimen, where determinable.' },
      { param: 'discovery place',  key: 'objectLocation', required: false, hint: 'Where the specimen was collected.' },
      { param: 'cultivar',         key: null,             required: false, hint: 'Cultivar name (for cultivated plants).' },
      { param: 'photographer',     key: 'author',         required: false, hint: 'Person who took the photo of the specimen.' },
      { param: 'source',           key: 'source',         required: true,  hint: '{{own}} or URL / citation.' },
      { param: 'date',             key: 'dateTaken',      required: false, hint: 'Date the photo was taken (ISO 8601).' },
      { param: 'description',      key: 'description',    required: false, hint: 'Notes on the specimen.' },
      { param: 'permission',       key: null,             required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'other fields',     key: null,             required: false, hint: 'Free-form additional metadata.' },
    ],
    requiredColumns: ['author', 'source'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken', 'depicts'],
  },

  MusicalWork: {
    id: 'MusicalWork',
    label: '{{Musical work}}',
    name: 'Musical work',
    docsName: 'Musical work',
    useCase: 'Audio recordings of musical works. Composer, performer, label, recording date.',
    description: 'For audio recordings. Captures composer, performer, label, recording date.',
    fields: [
      { param: 'composer',         key: null,          required: false, hint: 'Composer of the work. Use {{Creator:…}} when possible.' },
      { param: 'lyrics_writer',    key: null,          required: false, hint: 'Lyricist, when separate from the composer.' },
      { param: 'performer',        key: 'author',      required: false, hint: 'Performer / ensemble. Often the same as "author" for own recordings.' },
      { param: 'title',            key: 'title',       required: false, hint: 'Title of the work.' },
      { param: 'description',      key: 'description', required: false, hint: 'Notes on the recording (e.g. movement, arrangement).' },
      { param: 'composition_date', key: null,          required: false, hint: 'When the work was composed (ISO 8601 or year).' },
      { param: 'performance_date', key: 'dateTaken',   required: false, hint: 'When this recording was performed/captured (ISO 8601).' },
      { param: 'notes',            key: null,          required: false, hint: 'Free-form notes.' },
      { param: 'record_label',     key: null,          required: false, hint: 'Record label, when commercially released.' },
      { param: 'record_ID',        key: null,          required: false, hint: 'Catalogue number from the label.' },
      { param: 'image',            key: null,          required: false, hint: 'Cover image filename, when this is the work\'s root page.' },
      { param: 'references',       key: null,          required: false, hint: 'External references / citations.' },
      { param: 'source',           key: 'source',      required: true,  hint: '{{own}} for own recordings, otherwise URL / citation.' },
      { param: 'permission',       key: null,          required: false, hint: 'Only when a separate permission template applies.' },
      { param: 'other_versions',   key: null,          required: false, hint: 'Gallery / list of related recordings.' },
      { param: 'other_fields',     key: null,          required: false, hint: 'Free-form additional metadata.' },
    ],
    requiredColumns: ['author', 'source'],
    recommendedColumns: ['title', 'author', 'description', 'license', 'categories', 'dateTaken'],
  },
};

export const DEFAULT_TEMPLATE_ID = 'Information';

// Build the docs URL for a template (full page) or one of its params (anchor).
// Centralised so the Templates tab and any other surface (e.g. a future
// per-cell tooltip) stay consistent.
export function templateDocsUrl(tmpl, param) {
  if (!tmpl) return null;
  const page = tmpl.docsName || tmpl.name;
  if (!page) return null;
  const base = `https://commons.wikimedia.org/wiki/Template:${encodeURIComponent(page)}`;
  return param ? `${base}#${encodeURIComponent(param)}` : base;
}

// --- Sub-formatters reused across all templates ---

// Neutralize the five wiki structural characters so free text placed in a
// template parameter can't break out of it or inject templates / wikilinks /
// categories (OI-27 — manifest-derived captions reach this renderer). Ordinary
// caption text has none of these, so it passes through unchanged; the stored
// caption stays raw (this only affects the rendered wikitext, not the SDC
// caption or the editable column).
function escapeTemplateValue(s) {
  return String(s).replace(/[{}[\]|]/g, (c) => (
    { '{': '&#123;', '}': '&#125;', '[': '&#91;', ']': '&#93;', '|': '&#124;' }[c]
  ));
}

function formatDescription(item) {
  // Multi-language captions (T426422). Each non-empty language emits its own
  // `{{<lang>|1=...}}` block in insertion order. The legacy single-string
  // `item.description` field is folded in as English so historical drafts
  // (and any callers that still write the bare field) round-trip cleanly.
  //
  // Order matters because Commons UIs (and humans reading the wikitext) read
  // top-down — we keep the first-inserted language first. The data path
  // ensures English lands in `descriptions.en` whenever a row carries one
  // (see setCaptionValue in src/captions.js), so the legacy `description`
  // fallback only fires for never-touched-since-the-old-shape rows.
  const langs = item.descriptions || {};
  const seen = new Set();
  const parts = [];
  for (const [lang, value] of Object.entries(langs)) {
    if (!lang) continue;
    const text = String(value || '').trim();
    if (!text) continue;
    if (seen.has(lang)) continue;
    seen.add(lang);
    parts.push(`{{${lang}|1=${escapeTemplateValue(text)}}}`);
  }
  if (!seen.has('en') && item.description) {
    const text = String(item.description).trim();
    if (text) parts.push(`{{en|1=${escapeTemplateValue(text)}}}`);
  }
  return parts.join('');
}

function formatDate(item) {
  if (!item.dateTaken) return '';
  const s = String(item.dateTaken).trim();
  // ISO date(-time) → day precision (drop the time portion). Anything else —
  // `{{other date|circa|1538}}` wikitext, plain years, Dutch period phrases —
  // passes through untruncated. The old unconditional slice(0, 10) mangled
  // those to garbage like "{{other da" (OI-01).
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/);
  return iso ? iso[1] : s;
}

function formatSource(item) {
  // Source rendering is coupled with the chosen licence (T425949):
  // - Explicit value (URL, citation, raw `{{own}}`, etc.) → pass-through
  //   (the legacy plain-text "Own work" string is normalised to `{{own}}`
  //   for back-compat).
  // - Empty + own-work licence (CC0 / CC BY 4.0 / CC BY-SA 4.0) → `{{own}}`.
  // - Empty + non-own-work licence (third-party, PD, GFDL, custom) → empty
  //   (we deliberately don't auto-emit `{{own}}` for those).
  const raw = (item?.source || '').trim();
  if (raw) {
    if (raw.toLowerCase() === 'own work') return '{{own}}';
    return raw;
  }
  if (isOwnWorkLicense(item?.license)) return '{{own}}';
  return '';
}

// Generic value extractor for non-special keys (location columns, depicts, etc.).
function genericFieldValue(item, key) {
  if (!key) return '';
  if (FIELD_HANDLERS[key]) return FIELD_HANDLERS[key](item);
  const v = item[key];
  if (v == null) return '';
  // Date columns: emit day-precision strings.
  if (key === 'dateTaken') return formatDate(item);
  // Object location / camera location are { lat, lon } pairs — render as a
  // {{location|lat|lon}} block.
  if (key === 'objectLocation' || key === 'cameraLocation' || key === 'coords') {
    if (typeof v === 'object' && v.lat != null && v.lon != null) {
      return `{{location|${v.lat}|${v.lon}}}`;
    }
    return '';
  }
  if (key === 'locationOfCreation') {
    if (v.qid) return v.label ? `${v.label} ([[d:${v.qid}|${v.qid}]])` : v.qid;
    return '';
  }
  if (key === 'depicts') {
    if (Array.isArray(v)) return v.map((d) => d.label || d.qid).filter(Boolean).join(', ');
    return '';
  }
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// Resolve a stored config (from prefs) into an executable template descriptor.
// `config` may be:
//   - undefined / null      → default Information
//   - { id: 'Information' } → builtin
//
// T426449 back-compat: users with a legacy `{ id: 'Custom', body, fields }`
// config (the custom-wikitext escape hatch that was removed) silently fall
// back to {{Information}}. The stored body stays in their prefs page so
// they can recover it manually if they ever want to.
export function resolveTemplate(config) {
  if (!config) return BUILTIN_TEMPLATES[DEFAULT_TEMPLATE_ID];
  return BUILTIN_TEMPLATES[config.id] || BUILTIN_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

// Render a template block for a given item.
//
// Writes `{{Name|param=value|...}}`, dropping params whose value is empty so
// we don't produce noisy `|institution=` lines for fields the user hasn't
// filled in. For Information, the four "must-be-present" params (description,
// date, source, author) emit an empty `|param=` so Commons bots/checkers see
// the placeholder even when the user left the field blank.
export function renderTemplateBlock(item, config) {
  const tmpl = resolveTemplate(config);
  const lines = [`{{${tmpl.name}`];
  for (const f of tmpl.fields) {
    const val = f.key ? genericFieldValue(item, f.key) : '';
    if (!val) {
      if (tmpl.id === 'Information' && (f.param === 'description' || f.param === 'date' || f.param === 'source' || f.param === 'author')) {
        lines.push(`|${f.param}=`);
        continue;
      }
      continue;
    }
    lines.push(`|${f.param}=${val}`);
  }
  lines.push('}}');
  return lines.join('\n');
}

// Which workbench column keys does this template "use"? Drives the
// "add these columns?" suggestion when a user switches templates.
export function templateColumnKeys(config) {
  const tmpl = resolveTemplate(config);
  // Union of fields (mapped) + recommendedColumns.
  const used = new Set();
  for (const f of tmpl.fields) {
    if (f.key) used.add(f.key);
  }
  for (const c of tmpl.recommendedColumns || []) used.add(c);
  return [...used];
}

// Returns the subset of templateColumnKeys that aren't currently visible.
// Caller decides whether to nag the user.
export function missingColumnsForTemplate(config, visibleKeys) {
  const need = templateColumnKeys(config);
  const have = new Set(visibleKeys || []);
  return need.filter((k) => !have.has(k));
}

// Describe how a single column key relates to the chosen template. Used by
// the Columns tab to show, per-row, *why* that column matters for the active
// template (so the user understands the column↔template wiring without
// having to switch tabs and squint at the field map).
//
// Returns:
//   { kind: 'mapped',      param: 'description' }  // column maps to a template param
//   { kind: 'recommended' }                          // builtin template's recommendedColumns
//   { kind: 'unrelated' }                            // column not used by this template
//
// The caller can prioritise mapped > recommended > unrelated when deciding
// how prominently to surface the relationship.
export function columnTemplateRelation(columnKey, config) {
  if (!columnKey) return { kind: 'unrelated' };
  const tmpl = resolveTemplate(config);

  const mapped = (tmpl.fields || []).find((f) => f.key === columnKey);
  if (mapped) return { kind: 'mapped', param: mapped.param };
  if ((tmpl.recommendedColumns || []).includes(columnKey)) {
    return { kind: 'recommended' };
  }
  return { kind: 'unrelated' };
}

// Convenience: predicate used by the "in this template" filter chip on
// the Columns tab. Returns true if the column has any relationship to the
// chosen template (mapped or recommended).
export function isColumnInTemplate(columnKey, config) {
  return columnTemplateRelation(columnKey, config).kind !== 'unrelated';
}
