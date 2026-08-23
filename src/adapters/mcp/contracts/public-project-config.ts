import { z } from "zod";

const publicCapabilitiesSchema = z
  .object({
    allowWrites: z.boolean().optional(),
    writeExecutionPolicy: z.enum(["safe-by-default", "developer"]).optional(),
  })
  .strict();

const publicMcpSchema = z
  .object({
    toolSurface: z.enum(["core", "full"]).optional(),
  })
  .strict();

export const publicResolvedProjectConfigSchema = z
  .object({
    id: z.string().optional(),
    frontendFile: z.string().optional(),
    backendPath: z.string().optional(),
    destinationRoot: z.string().optional(),
    timeoutMs: z.number().optional(),
    capabilities: publicCapabilitiesSchema.optional(),
    mcp: publicMcpSchema.optional(),
  })
  .strict();

export type PublicResolvedProjectConfig = z.infer<typeof publicResolvedProjectConfigSchema>;

/**
 * Project a parsed project config onto the intentionally public MCP evidence surface.
 * Secrets, credential references, extension fields, and unknown nested capability data
 * are excluded by construction rather than sanitized after serialization.
 */
export function projectPublicResolvedConfig(
  config: Record<string, unknown>,
): PublicResolvedProjectConfig {
  const capabilities =
    typeof config.capabilities === "object" &&
    config.capabilities !== null &&
    !Array.isArray(config.capabilities)
      ? (config.capabilities as Record<string, unknown>)
      : undefined;
  const publicCapabilities = {
    ...(typeof capabilities?.allowWrites === "boolean"
      ? { allowWrites: capabilities.allowWrites }
      : {}),
    ...(capabilities?.writeExecutionPolicy === "safe-by-default" ||
    capabilities?.writeExecutionPolicy === "developer"
      ? { writeExecutionPolicy: capabilities.writeExecutionPolicy }
      : {}),
  };

  const mcpConfig =
    typeof config.mcp === "object" && config.mcp !== null && !Array.isArray(config.mcp)
      ? (config.mcp as Record<string, unknown>)
      : undefined;
  const publicMcp = {
    ...(mcpConfig?.toolSurface === "core" || mcpConfig?.toolSurface === "full"
      ? { toolSurface: mcpConfig.toolSurface }
      : {}),
  };

  return publicResolvedProjectConfigSchema.parse({
    ...(typeof config.id === "string" ? { id: config.id } : {}),
    ...(typeof config.frontendFile === "string" ? { frontendFile: config.frontendFile } : {}),
    ...(typeof config.backendPath === "string" ? { backendPath: config.backendPath } : {}),
    ...(typeof config.destinationRoot === "string"
      ? { destinationRoot: config.destinationRoot }
      : {}),
    ...(typeof config.timeoutMs === "number" ? { timeoutMs: config.timeoutMs } : {}),
    ...(Object.keys(publicCapabilities).length > 0 ? { capabilities: publicCapabilities } : {}),
    ...(Object.keys(publicMcp).length > 0 ? { mcp: publicMcp } : {}),
  });
}
