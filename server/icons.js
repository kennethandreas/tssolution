'use strict';

/*
 * Line icons used on the landing page (24×24, stroke = currentColor).
 * Content stores only the icon key; markup is trusted and lives here.
 */
const ICONS = {
  factory:   { label: 'Factory',         svg: '<path d="M3 21V10l5 3V10l5 3V7l8 4v10z"/><path d="M3 21h18"/>' },
  apartment: { label: 'Apartment',       svg: '<path d="M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18"/>' },
  office:    { label: 'Office building', svg: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>' },
  public:    { label: 'Public facility', svg: '<path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 18h18"/>' },
  hospital:  { label: 'Hospital',        svg: '<rect x="4" y="4" width="16" height="17" rx="1"/><path d="M12 8v6M9 11h6M10 21v-3h4v3"/>' },
  retail:    { label: 'Retail / mall',   svg: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>' },
  thumbsUp:  { label: 'Thumbs up',       svg: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7"/>' },
  stopwatch: { label: 'Stopwatch',       svg: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>' },
  people:    { label: 'People',          svg: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14a5 5 0 0 1 5 5"/>' },
  award:     { label: 'Award',           svg: '<circle cx="12" cy="9" r="6"/><path d="M9.5 9l1.8 1.8L14.8 7.5"/><path d="M8.5 14l-1.5 7 5-2.5 5 2.5-1.5-7"/>' },
  response:  { label: 'Response time',   svg: '<path d="M12 7v5l3 2"/><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>' },
  training:  { label: 'Training',        svg: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v5"/>' },
  digital:   { label: 'Digital / mobile', svg: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M8.5 16.5a3.5 3.5 0 0 1 7 0"/>' },
  sunrise:   { label: 'Rising sun',      svg: '<path d="M5 17a7 7 0 0 1 14 0"/><path d="M2 17h20M12 7V4M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4M2.5 13.5H4M20 13.5h1.5M7 20.5h10"/>' },
  shield:    { label: 'Shield',          svg: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>' },
  check:     { label: 'Check',           svg: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
  leaf:      { label: 'Leaf',            svg: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l7-7"/>' },
  wrench:    { label: 'Wrench',          svg: '<path d="M15 4a5 5 0 0 0-5.6 6.6L3 17l4 4 6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z"/>' },
  truck:     { label: 'Truck',           svg: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>' },
  sparkle:   { label: 'Sparkle',         svg: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>' },
};

const ICON_KEYS = Object.keys(ICONS);

function iconSvg(key) {
  const icon = ICONS[key] || ICONS.check;
  return `<svg viewBox="0 0 24 24">${icon.svg}</svg>`;
}

module.exports = { ICONS, ICON_KEYS, iconSvg };
