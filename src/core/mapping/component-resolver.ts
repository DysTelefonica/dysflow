import { join } from "node:path";

export interface ComponentResolution {
  folder: string;
  extension: string;
  type: "form" | "report" | "module" | "class";
}

// Report prefixes recognized by Access: legacy `report_` plus the
// `rpt` / `rpt_` shorthand used in older project templates. Mirror
// the `frm` / `form_` form-prefix pattern below. Issue #622 (#A).
//
// NOTE: `resolveComponent` currently has no production callers in
// `src/` — this is a LATENT fix that prevents the next adapter author
// from inheriting the gap. Do not remove the prefix list without
// auditing `src/adapters/vba-sync/` for new callers.
const REPORT_PREFIXES = ["report_", "rpt", "rpt_"] as const;

export function resolveComponent(name: string, vbaType?: number): ComponentResolution {
  const nameLower = name.toLowerCase();

  // If type is explicitly provided, map standard types first
  if (vbaType === 1) {
    return { folder: "modules", extension: ".bas", type: "module" };
  }
  if (vbaType === 2) {
    return { folder: "classes", extension: ".cls", type: "class" };
  }
  if (vbaType === 3) {
    return { folder: "forms", extension: ".form.txt", type: "form" };
  }

  // Name-based prefix checks override type 100/generic types. The form
  // and report prefix checks MUST run BEFORE the `vbaType === 100`
  // fallback below so that names like `rptDaily, 100` resolve to
  // reports (NOT the form-default). Reordering this block breaks the
  // ordering contract pinned by `component-resolver.test.ts` ("should
  // resolve type 100 with rpt prefix as reports — prefix wins over
  // fallback"). Issue #622 (#A).
  if (nameLower.startsWith("form_") || nameLower.startsWith("frm")) {
    return { folder: "forms", extension: ".form.txt", type: "form" };
  }
  if (REPORT_PREFIXES.some((prefix) => nameLower.startsWith(prefix))) {
    return { folder: "reports", extension: ".report.txt", type: "report" };
  }

  if (vbaType === 100) {
    // Document module fallback (defaults to form)
    return { folder: "forms", extension: ".form.txt", type: "form" };
  }

  // Default fallback for general code components
  return { folder: "modules", extension: ".bas", type: "module" };
}

export function resolveComponentPath(
  destinationRoot: string,
  name: string,
  vbaType?: number,
): string {
  const resolution = resolveComponent(name, vbaType);
  return join(destinationRoot, resolution.folder, `${name}${resolution.extension}`);
}
