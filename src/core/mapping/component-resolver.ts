import { join } from "node:path";

export interface ComponentResolution {
  folder: string;
  extension: string;
  type: "form" | "report" | "module" | "class";
}

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

  // Name-based prefix checks override type 100/generic types
  if (nameLower.startsWith("form_") || nameLower.startsWith("frm")) {
    return { folder: "forms", extension: ".form.txt", type: "form" };
  }
  if (nameLower.startsWith("report_")) {
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
