const paths = {
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/>',
  Upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  Download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  Trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  Restore: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  Search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  Refresh:
    '<path d="M20 7a9 9 0 0 0-16 2M20 3v5h-5M4 17a9 9 0 0 0 16-2M4 21v-5h5"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  User: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  Palette:
    '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4c-2-1-1-3 1-3h2c5 0 3-11-6-11Z"/><path d="M7 10h.01M10 6h.01M15 7h.01"/>',
  Usage: '<path d="M5 20V10m7 10V4m7 16v-7M3 20h18"/>',
  Logout: '<path d="M9 3H4v18h5M9 12h12m-4-4 4 4-4 4"/>',
  Moon: '<path d="M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10Z"/>',
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  Menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  Send: '<path d="m21 3-6 18-4-8-8-4Z"/><path d="m11 13 10-10"/>',
  Source: '<path d="M14 4h6v6m0-6-9 9M10 4H4v16h16v-6"/>',
  Check: '<path d="m5 12 4 4L19 6"/>',
  Save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
  Lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  Eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  EyeOff:
    '<path d="m3 3 18 18M9 5a12 12 0 0 1 13 7 16 16 0 0 1-4 4M6 6a17 17 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1"/>',
  Close: '<path d="m6 6 12 12M6 18 18 6"/>',
  Dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  Documents:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  Chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
  Settings:
    '<path d="m12 2 3 2 4 1 1 4 2 3-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-3 1-4 4-1Z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(name: keyof typeof paths) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

/** Icon geometry is static; user-provided labels always remain plain text. */
export function labelWithIcon(
  node: HTMLElement,
  name: keyof typeof paths,
  label: string,
) {
  node.innerHTML = icon(name);
  const text = document.createElement("span");
  text.textContent = label;
  node.append(text);
}
