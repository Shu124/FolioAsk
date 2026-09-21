/** Keep one semantic table; compact layouts reveal each cell's column label. */
export function responsiveTable(table: HTMLTableElement) {
  table.classList.add("responsive-table");
  const headings = [...(table.tHead?.rows[0]?.cells ?? [])].map(
    (heading) => heading.textContent ?? "",
  );
  for (const body of table.tBodies) {
    for (const row of body.rows) {
      if ([...row.cells].some((cell) => cell.colSpan > 1)) continue;
      for (const [index, cell] of [...row.cells].entries()) {
        if (cell.querySelector(".mobile-cell-label")) continue;
        const label = document.createElement("span");
        label.className = "mobile-cell-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = headings[index] ?? "";
        cell.prepend(label);
      }
    }
  }
}
