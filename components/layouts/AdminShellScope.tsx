"use client";

import { useEffect } from "react";

// Radix primitives (Sheet, Dialog, DropdownMenu, Tooltip) portal their content
// straight to document.body, which breaks CSS custom-property inheritance
// from the [data-shell="admin"] wrapper div — the portaled content sits
// outside that div in the DOM, so it falls back to the light :root tokens
// instead of the dark admin overrides. Tagging body directly fixes every
// current and future portaled primitive at once, without each one needing
// its own portal-container plumbing.
export default function AdminShellScope() {
  useEffect(() => {
    document.body.dataset.shell = "admin";
    return () => {
      delete document.body.dataset.shell;
    };
  }, []);

  return null;
}
