"use client";

import { useEffect } from "react";

/**
 * Click-to-edit for the Customizer preview.
 *
 * Listens for clicks anywhere in the preview, finds the closest
 * `[data-bms-slot]` or `[data-bms-row]` marker, and tells the Customizer
 * (the parent frame) which section/item was clicked so it can open the
 * matching settings screen. Clicks never navigate — the preview is a canvas,
 * not a browser.
 *
 * Slot ids look like `hdr:desktop:main:left:logo` or `ftr:main:center:widget1`;
 * row ids look like `hdr:desktop:main` or `ftr:main`.
 */
export default function ClickToEdit() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("[data-bms-slot],[data-bms-row]");
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();

      const slot = el.getAttribute("data-bms-slot");
      const row = el.getAttribute("data-bms-row");
      let section: string | null = null;
      let item: string | null = null;

      if (slot) {
        const parts = slot.split(":");
        // hdr:<dev>:<row>:<col>:<item> or ftr:<row>:<col>:<item>
        if (parts[0] === "hdr") {
          section = "header";
          item = parts[4] ?? null;
        } else if (parts[0] === "ftr") {
          section = "footer";
          item = parts[3] ?? null;
        }
      } else if (row) {
        const parts = row.split(":");
        // hdr:<dev>:<row> or ftr:<row>
        section = parts[0] === "hdr" ? "header" : parts[0] === "ftr" ? "footer" : null;
      }

      if (section) {
        window.parent.postMessage({ __bms: "click-edit", section, item }, "*");
      }
    };

    // Capture phase: beat the preview's own link handlers so a click on a
    // menu item opens its settings instead of navigating.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <style>{`
      [data-bms-slot],[data-bms-row]{cursor:pointer}
      [data-bms-slot]:hover,[data-bms-row]:hover{outline:2px dashed rgba(37,99,235,.5);outline-offset:2px}
    `}</style>
  );
}
