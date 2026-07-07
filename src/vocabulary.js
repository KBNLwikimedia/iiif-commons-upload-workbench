// Mock vocabularies — would come from Commons/Wikidata APIs in production.

// ===== Known Commons categories (subset relevant to Limburg / Maastricht photographer) =====
window.KNOWN_CATEGORIES = [
  "Maastricht",
  "Limburg (Netherlands)",
  "Architecture in Maastricht",
  "Brutalist architecture in the Netherlands",
  "Modernist architecture",
  "Ruins in the Netherlands",
  "Industrial heritage in Limburg",
  "Marl pits in Limburg",
  "Sint-Pietersberg",
  "Caves in the Netherlands",
  "Historical photographs of the Netherlands",
  "Black and white photographs of the Netherlands",
  "Vrijthof",
  "Cathedrals in Limburg",
  "Saint Servatius Basilica",
  "Bridges in Maastricht",
  "Maas (river)",
  "Limburg (Netherlands) at night",
  "Snow in Limburg",
  "Roermond",
  "Roermond railway station",
  "Railway stations in Limburg",
  "Clocks in the Netherlands",
  "Heerlen",
  "Brutalism in Heerlen",
  "Glaspaleis",
  "Mining heritage in Limburg",
  "Slag heaps in the Netherlands",
  "Hills in Limburg",
  "Wijck (Maastricht)",
  "Saint Pieter (Maastricht)",
  "Streets in Maastricht",
  "Markets in Maastricht",
  "Churches in Maastricht",
  "Townhouses in Limburg",
  "Aerial photographs of Limburg",
  "Panoramas of Limburg",
  "Photographs by Joris van der Berg",
  "2024 in Limburg",
  "2025 in Limburg",
  "Bicycles in the Netherlands",
  "Water in Limburg",
  "Sunsets in the Netherlands"
];

// ===== Known Wikidata items (for "depicts" / P180) =====
// {qid, label, description}
window.KNOWN_DEPICTS = [
  { qid: "Q1010",      label: "Maastricht",                 desc: "city in the Netherlands" },
  { qid: "Q187323",    label: "Saint Servatius Basilica",   desc: "Romanesque basilica in Maastricht" },
  { qid: "Q1808",      label: "Vrijthof",                   desc: "central square in Maastricht" },
  { qid: "Q105731",    label: "Sint-Pietersberg",           desc: "marl plateau on the Belgian border" },
  { qid: "Q22810",     label: "Brutalist architecture",     desc: "architectural style" },
  { qid: "Q33506",     label: "museum",                     desc: "institution" },
  { qid: "Q12280",     label: "bridge",                     desc: "structure built to span an obstacle" },
  { qid: "Q43177",     label: "marl",                       desc: "sedimentary rock" },
  { qid: "Q6256",      label: "country",                    desc: "" },
  { qid: "Q4022",      label: "river",                      desc: "natural watercourse" },
  { qid: "Q860861",    label: "sculpture",                  desc: "three-dimensional artwork" },
  { qid: "Q12132",     label: "facade",                     desc: "exterior face of a building" },
  { qid: "Q41176",     label: "building",                   desc: "structure with walls and a roof" },
  { qid: "Q207694",    label: "art museum",                 desc: "" },
  { qid: "Q39614",     label: "cemetery",                   desc: "place of burial" },
  { qid: "Q200395",    label: "ruin",                       desc: "remains of a building" },
  { qid: "Q34442",     label: "road",                       desc: "" },
  { qid: "Q1248784",   label: "airport",                    desc: "" },
  { qid: "Q11315",     label: "shopping mall",              desc: "" },
  { qid: "Q570116",    label: "tourist attraction",         desc: "" },
  { qid: "Q628179",    label: "limestone quarry",           desc: "" },
  { qid: "Q235730",    label: "panorama",                   desc: "wide-angle view" },
  { qid: "Q39816",     label: "valley",                     desc: "low area between hills" },
  { qid: "Q190928",    label: "shopping",                   desc: "" },
  { qid: "Q1065118",   label: "marl pit",                   desc: "open-air quarry for marl" },
  { qid: "Q4847311",   label: "Glaspaleis",                 desc: "modernist building in Heerlen" },
  { qid: "Q1361932",   label: "Roermond railway station",   desc: "" },
  { qid: "Q39419",     label: "clock",                      desc: "instrument for measuring time" },
  { qid: "Q132634",    label: "Romanesque architecture",    desc: "" },
  { qid: "Q11825322",  label: "Heerlen",                    desc: "city in the Netherlands" },
  { qid: "Q6498",      label: "Limburg",                    desc: "province of the Netherlands" }
];

// ===== Wikidata properties for the column-add picker =====
// (P-numbers + label + datatype)
window.KNOWN_PROPERTIES = [
  { pid: "P180",  label: "depicts",            datatype: "wikibase-item",  desc: "what the image shows" },
  { pid: "P170",  label: "creator",            datatype: "wikibase-item",  desc: "person who created the work" },
  { pid: "P186",  label: "made from material", datatype: "wikibase-item",  desc: "" },
  { pid: "P1071", label: "location of creation", datatype: "wikibase-item", desc: "where the photo was taken" },
  { pid: "P571",  label: "inception",          datatype: "time",           desc: "date created" },
  { pid: "P195",  label: "collection",         datatype: "wikibase-item",  desc: "collection / archive" },
  { pid: "P276",  label: "location",           datatype: "wikibase-item",  desc: "subject location" },
  { pid: "P462",  label: "color",              datatype: "wikibase-item",  desc: "" },
  { pid: "P2079", label: "fabrication method", datatype: "wikibase-item",  desc: "" },
  { pid: "P1684", label: "inscription",        datatype: "monolingualtext", desc: "" },
  { pid: "P973",  label: "described at URL",   datatype: "url",            desc: "" },
  { pid: "P31",   label: "instance of",        datatype: "wikibase-item",  desc: "" },
  { pid: "P361",  label: "part of",            datatype: "wikibase-item",  desc: "" },
  { pid: "P17",   label: "country",            datatype: "wikibase-item",  desc: "" },
  { pid: "P825",  label: "dedicated to",       datatype: "wikibase-item",  desc: "" }
];

// ===== Helpers =====

// Fuzzy-match — substring + token-prefix scoring. Good enough for a prototype.
window.matchVocab = function(items, query, getText, max = 10) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return items.slice(0, max);
  const scored = [];
  for (const it of items) {
    const text = String(getText(it) || "").toLowerCase();
    if (!text.includes(q)) continue;
    let score = 0;
    if (text === q) score = 100;
    else if (text.startsWith(q)) score = 80;
    else if (text.split(/[\s_\-()]/).some(t => t.startsWith(q))) score = 60;
    else score = 30;
    scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score || a.it.toString().length - b.it.toString().length);
  return scored.slice(0, max).map(s => s.it);
};

// Is this category recognised in the vocabulary (case-insensitive)?
window.isKnownCategory = (name) => {
  const n = String(name || "").trim().toLowerCase();
  return window.KNOWN_CATEGORIES.some(c => c.toLowerCase() === n);
};

// ===== Category display helpers =====
// Internal storage uses bare names ("Mountains") because that's what Commons
// hands back via the API and what the user-store JSON pages persist. UI
// surfaces (chips, table cells, autocomplete) prefer the prefixed form
// "Category:Mountains" because that matches Commons wikitext convention
// (`[[Category:Mountains]]`) and reduces ambiguity when a category name
// happens to look like an unrelated word. See T425912.
window.stripCategoryPrefix = (name) => {
  const s = String(name || "");
  // Match leading "Category:" or its localized aliases? Commons only uses
  // the English "Category:" canonically — keep it simple.
  return s.replace(/^\s*Category\s*:\s*/i, "").trim();
};
window.formatCategory = (name) => {
  const bare = window.stripCategoryPrefix(name);
  return bare ? `Category:${bare}` : "";
};

window.findDepict = (qid) => window.KNOWN_DEPICTS.find(d => d.qid === qid);
