// js/needleUI.js
// Pure HTML-string helpers for rendering the karat-strip needle visual and
// its Known Value / AP Answer <select> options. Extracted from
// calibration.js (AP Calibration was first to build this) so AP Interview's
// practical-score needle popup can use the literal same rendering code —
// "same scoring mechanism" means the same code path, not a lookalike copy
// that quietly drifts the next time either one is touched.
//
// No DOM queries, no Firestore, no state — just given/answer -> HTML.
// Actual scoring math lives in scoring.js (scoreNeedle/computeResult); this
// file is only the visual layer built on top of it.

import { KARAT_OPTIONS } from "./scoring.js";

// Evenly space karat options across the strip with a small inner margin
// so end markers don't get clipped by the circle's own radius.
export function karatPercent(value) {
  const idx = KARAT_OPTIONS.indexOf(value);
  const margin = 6;
  const usable = 100 - margin * 2;
  return margin + (idx / (KARAT_OPTIONS.length - 1)) * usable;
}

export function karatStripHtml(given, answer) {
  const ticks = KARAT_OPTIONS.map((opt) => {
    const pct = karatPercent(opt);
    const shortLabel = opt === "Below 18K" ? "<18" : opt.replace("K", "");
    return `<span class="tick-label" style="left:${pct}%">${shortLabel}</span>`;
  }).join("");

  const givenMarker = given
    ? `<span class="marker given" style="left:${karatPercent(given)}%" title="Known: ${given}"></span>`
    : "";
  const answerMarker = answer
    ? `<span class="marker answer" style="left:${karatPercent(answer)}%" title="AP answer: ${answer}"></span>`
    : "";

  return `
    <div class="karat-strip">
      <div class="track"></div>
      ${ticks}
      ${givenMarker}
      ${answerMarker}
    </div>
  `;
}

export function optionsHtml(selected) {
  return (
    `<option value="" disabled ${!selected ? "selected" : ""}>Select…</option>` +
    KARAT_OPTIONS.map(
      (opt) => `<option value="${opt}" ${opt === selected ? "selected" : ""}>${opt}</option>`
    ).join("")
  );
}
