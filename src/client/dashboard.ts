import type { ProjectActivity } from "../server/activity";
import type { Api } from "./documents";
import { trackActiveTime } from "./active-time";
import { icon, labelWithIcon } from "./icons";
import { responsiveTable } from "./responsive-table";

export function mountDashboard(
  root: HTMLElement,
  workspaceId: string,
  api: Api,
  open: (target: { documentId?: string; threadId?: string }) => void,
) {
  root.innerHTML = `<div class="workspace-toolbar"><div><p class="eyebrow">PROJECT OVERVIEW</p><h2>Dashboard</h2></div><button>Refresh activity</button></div><p role="status" class="dashboard-status">Loading activity…</p><div class="dashboard-data" hidden></div><p class="quiet time-note">Approximate active time starts when this feature is used. Foreground use only; pauses after 60 seconds without interaction. Not time saved or a productivity score. Shared 15-second intervals count once across tabs and belong to the first project reporting them.</p>`;
  const data = root.querySelector<HTMLElement>(".dashboard-data")!;
  const status = root.querySelector<HTMLElement>(".dashboard-status")!;
  const header = root.querySelector<HTMLElement>(".workspace-toolbar")!;
  header.className = "page-heading";
  header.querySelector("h2")!.after(
    Object.assign(document.createElement("p"), {
      className: "page-description",
      textContent:
        "A clear view of your documents, conversations and recent work.",
    }),
  );
  labelWithIcon(header.querySelector("button")!, "Refresh", "Refresh activity");
  const timeNote = root.querySelector<HTMLElement>(".time-note")!;
  const methodology = document.createElement("details");
  methodology.className = "method-note";
  const summary = document.createElement("summary");
  summary.textContent = "How active time is measured";
  timeNote.before(methodology);
  methodology.append(summary, timeNote);
  const stopTracking = trackActiveTime(workspaceId, api, () => {
    status.textContent =
      "Active-time sync is temporarily unavailable. Recorded totals may be incomplete.";
  });
  let disposed = false;
  let revision = 0;
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function render(result: ProjectActivity) {
    data.replaceChildren();
    const metrics = element("div");
    metrics.className = "metric-grid";
    const seconds = Math.floor(result.activeTime.milliseconds / 1000);
    for (const [label, glyph, value] of [
      ["Active documents", "Documents", result.counts.documents],
      ["Saved answers", "Check", result.counts.answers],
      ["Conversations", "Chat", result.counts.conversations],
      [
        "Approximate active time",
        "Clock",
        seconds < 60
          ? `${seconds}s`
          : `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
      ],
    ] as const) {
      const card = element("section");
      card.className = "metric-card";
      const number = element("strong", String(value));
      number.setAttribute("aria-label", String(label));
      const metricHeading = element("div");
      metricHeading.className = "metric-heading";
      const glyphNode = element("span");
      glyphNode.className = "metric-icon";
      glyphNode.innerHTML = icon(glyph);
      metricHeading.append(element("p", label), glyphNode);
      card.append(metricHeading, number);
      metrics.append(card);
    }
    data.append(
      metrics,
      element(
        "p",
        `${result.counts.trashed} document(s) in Trash. ${result.activeTime.startedAt === undefined ? "No active time recorded yet." : `Time recording began ${new Date(result.activeTime.startedAt).toLocaleString()}.`}`,
      ),
    );
    const chart = element("section");
    chart.className = "activity-chart-card";
    chart.append(
      element("h3", "Last 7 days"),
      element("p", "Uploads and saved answers · UTC calendar days"),
    );
    const legend = element("div");
    legend.className = "chart-legend";
    legend.innerHTML =
      '<span><i class="legend-upload"></i>Uploads</span><span><i class="legend-answer"></i>Answers</span>';
    chart.append(legend);
    const bars = element("div");
    bars.className = "activity-chart";
    bars.setAttribute("role", "img");
    bars.tabIndex = 0;
    bars.setAttribute(
      "aria-label",
      "Seven-day uploads and answers. Exact values are in the activity data table below.",
    );
    const maximum = Math.max(
      1,
      ...result.days.map((day) => day.uploads + day.answers),
    );
    const details = element("details");
    details.append(element("summary", "View chart data"));
    const table = element("table");
    table.setAttribute("aria-label", "Seven-day activity data");
    table.innerHTML =
      "<thead><tr><th>Date (UTC)</th><th>Uploads</th><th>Answers</th></tr></thead>";
    const rows = table.createTBody();
    for (const day of result.days) {
      const column = element("div");
      column.className = "activity-column";
      const bar = element("div");
      bar.className = "activity-bar";
      bar.style.height = `${((day.uploads + day.answers) / maximum) * 150}px`;
      const uploadSegment = element("span");
      uploadSegment.className = "bar-uploads";
      const answerSegment = element("span");
      answerSegment.className = "bar-answers";
      uploadSegment.style.flex = String(day.uploads);
      answerSegment.style.flex = String(day.answers);
      bar.append(answerSegment, uploadSegment);
      column.append(
        element("span", String(day.uploads + day.answers)),
        bar,
        element("small", day.date.slice(5)),
      );
      bars.append(column);
      const row = rows.insertRow();
      [day.date, day.uploads, day.answers].forEach((value) => {
        row.insertCell().textContent = String(value);
      });
    }
    details.append(table);
    chart.append(bars, details);
    data.append(chart);
    data.append(element("h2", "Recent activity"));
    const scroll = element("div");
    scroll.className = "table-scroll";
    const activity = element("table");
    activity.className = "activity-table";
    activity.setAttribute("aria-label", "Recent activity");
    activity.innerHTML =
      "<thead><tr><th>Activity</th><th>Time</th><th>Open</th></tr></thead>";
    const activityRows = activity.createTBody();
    for (const item of result.recent) {
      const row = activityRows.insertRow();
      row.insertCell().textContent = item.documentId
        ? "Document"
        : "Conversation";
      row.insertCell().textContent = new Date(item.at).toLocaleString();
      const button = element("button");
      button.className = "activity-link";
      labelWithIcon(button, item.documentId ? "Documents" : "Chat", item.label);
      button.onclick = () => open(item);
      row.insertCell().append(button);
    }
    if (!result.recent.length) {
      const cell = activityRows.insertRow().insertCell();
      cell.colSpan = 3;
      cell.className = "table-empty";
      cell.textContent =
        "No activity yet. Add a public document to get started.";
    }
    responsiveTable(activity);
    scroll.append(activity);
    data.append(scroll);
  }
  async function refresh() {
    const current = ++revision;
    try {
      const result = await api<ProjectActivity>(
        `/workspaces/${workspaceId}/activity`,
      );
      if (disposed || current !== revision) return;
      render(result);
      data.hidden = false;
      status.textContent = "";
    } catch {
      if (disposed || current !== revision) return;
      data.hidden = true;
      status.textContent =
        "Activity is unavailable. Check your connection and database setup, then refresh. No estimated counts are shown.";
    }
  }
  root.querySelector("button")!.onclick = () => void refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      revision++;
      stopTracking();
    },
  };
}
