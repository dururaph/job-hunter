"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
      title="Choose “Save as PDF” in the print dialog"
    >
      Download PDF
    </button>
  );
}
