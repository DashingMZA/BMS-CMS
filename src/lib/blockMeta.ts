// Display name and badge for every block type, for the parts of the admin that
// talk *about* a block rather than render it: List View, the breadcrumb bar and
// the settings header.

export interface BlockMeta {
  badge: string;
  color: string;
  label: string;
}

const BLOCK_META: Record<string, BlockMeta> = {
  paragraph:       { badge: "¶",   color: "#94a3b8", label: "Paragraph" },
  heading:         { badge: "H",   color: "#0ea5e9", label: "Heading" },
  bulletListItem:  { badge: "•",   color: "#64748b", label: "List" },
  numberedListItem:{ badge: "#",   color: "#64748b", label: "Numbered List" },
  checkListItem:   { badge: "✓",   color: "#10b981", label: "Checklist" },
  image:           { badge: "IMG", color: "#8b5cf6", label: "Image" },
  video:           { badge: "VID", color: "#8b5cf6", label: "Video" },
  audio:           { badge: "AUD", color: "#8b5cf6", label: "Audio" },
  table:           { badge: "TBL", color: "#f59e0b", label: "Table" },
  quote:           { badge: '"',   color: "#64748b", label: "Quote" },
  codeBlock:       { badge: "</>", color: "#10b981", label: "Code" },
  button:          { badge: "BTN", color: "#0ea5e9", label: "Button" },
  spacer:          { badge: "—",   color: "#cbd5e1", label: "Spacer" },
  callout:         { badge: "📌",  color: "#f59e0b", label: "Callout" },
  infoBox:         { badge: "ℹ",   color: "#0ea5e9", label: "Info Box" },
  progressBar:     { badge: "▰",   color: "#10b981", label: "Progress" },
  countUp:         { badge: "0→",  color: "#8b5cf6", label: "Count Up" },
  countdown:       { badge: "⏱",   color: "#ef4444", label: "Countdown" },
  appInfo:         { badge: "📱",  color: "#10b981", label: "App Info" },
  plugin:          { badge: "🧩",  color: "#10b981", label: "Plugin" },
  testimonial:     { badge: "★",   color: "#f59e0b", label: "Testimonial" },
  videoEmbed:      { badge: "▶",   color: "#8b5cf6", label: "Video Embed" },
  googleMap:       { badge: "📍",  color: "#10b981", label: "Map" },
  accordion:       { badge: "≡",   color: "#0ea5e9", label: "Accordion" },
  tabs:            { badge: "⊟",   color: "#0ea5e9", label: "Tabs" },
  iconList:        { badge: "☑",   color: "#64748b", label: "Icon List" },
  tableOfContents: { badge: "≔",   color: "#64748b", label: "Table of Contents" },
  splitContent:    { badge: "⧉",   color: "#8b5cf6", label: "Split Content" },
  rowLayout:       { badge: "▦",   color: "#8b5cf6", label: "Row Layout" },
  textAdvanced:    { badge: "T+",  color: "#7c3aed", label: "Text Advanced" },
  imageAdvanced:   { badge: "IMG", color: "#ec4899", label: "Image Advanced" },
  tableAdvanced:   { badge: "▤+",  color: "#0d9488", label: "Table Advanced" },
  gallery:         { badge: "▦",   color: "#ec4899", label: "Gallery" },
  icon:            { badge: "★",   color: "#f59e0b", label: "Icon" },
  socialIcons:     { badge: "◉",   color: "#8b5cf6", label: "Social Icons" },
  starRating:      { badge: "★",   color: "#f59e0b", label: "Star Rating" },
  businessInfo:    { badge: "🏪",  color: "#059669", label: "Business Info" },
  authorBio:       { badge: "👤",  color: "#059669", label: "Author Bio" },
  slider:          { badge: "⇆",   color: "#ec4899", label: "Slider" },
  modal:           { badge: "🗖",  color: "#8b5cf6", label: "Modal / Popup" },
  lottie:          { badge: "✨",  color: "#14b8a6", label: "Lottie" },
  timeline:        { badge: "⋮",   color: "#0ea5e9", label: "Timeline" },
  downloadBox:     { badge: "⬇",   color: "#16a34a", label: "Download Box" },
  pricingTable:    { badge: "¤",   color: "#10b981", label: "Pricing Table" },
  teamMember:      { badge: "👤",  color: "#8b5cf6", label: "Team Member" },
  showMore:        { badge: "⋯",   color: "#64748b", label: "Show More" },
  htmlEmbed:       { badge: "<>",  color: "#0f172a", label: "HTML Embed" },
  imageCompare:    { badge: "◧",   color: "#ec4899", label: "Image Compare" },
  postGrid:        { badge: "▤",   color: "#0ea5e9", label: "Post Grid" },
  // Not a block in the document — a Row Layout column, which the sidebar edits
  // as a block of its own the way Kadence does.
  section:         { badge: "▥",   color: "#8b5cf6", label: "Section" },
};

export function blockMeta(type: string): BlockMeta {
  return BLOCK_META[type] ?? { badge: "?", color: "#94a3b8", label: type };
}
