// Provider profiles (OI-78) — first draft / scaffolding.
//
// The tool currently supports only the KB profile; the eCodices profile is
// shown in the wizard as "coming soon" (disabled). A future version will wire
// each profile to its own title/signature derivation, metadata-label map,
// license, institution and category parent — see GitHub issue #78. For now a
// profile is just identity + branding + the manifest hosts that identify it
// (kept here so the eventual auto-detection has one home).

export const PROVIDERS = [
  {
    id: 'kb',
    name: 'Koninklijke Bibliotheek',
    blurb: 'Medieval manuscripts of the national library of the Netherlands.',
    logo: '/providers/kb.svg',
    available: true,
    hosts: ['iiif.bibliotheken.nl', 'presentation-api.dlc.services', 'dlc.services'],
  },
  {
    id: 'ecodices',
    name: 'eCodices NL',
    blurb: 'Medieval manuscripts from Dutch collections (Huis van het boek & others). Support is coming — see issue #78.',
    logo: '/providers/ecodices.png',
    available: false, // coming soon (OI-78)
    hosts: ['access.ecodices.nl'],
  },
];

export const DEFAULT_PROVIDER_ID = 'kb';

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id)
    || PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID);
}

// Classify a manifest URL by provider, matching its host against each profile's
// `hosts` (exact or subdomain). Returns the provider id, or null when the URL
// belongs to no known provider (i.e. "Other"). Used to group the recent-manifest
// list into per-collection tabs.
export function providerForUrl(url) {
  let host = '';
  try { host = new URL(url).host.toLowerCase(); } catch { return null; }
  for (const p of PROVIDERS) {
    if ((p.hosts || []).some((h) => host === h || host.endsWith('.' + h))) return p.id;
  }
  return null;
}
