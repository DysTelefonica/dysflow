export type ControlPropertyBatch = ReadonlyMap<string, string | number | boolean>;

/**
 * Adapter seam for reading functional control properties from the Access
 * binary. Implementations own COM/session details; the FormIR postprocessor
 * remains pure and receives the resulting values through a lookup callback.
 */
export interface ControlPropertyReader {
  readProperties(
    formName: string,
    controlName: string,
    propertyNames: readonly string[],
  ): Promise<ControlPropertyBatch>;
}

/**
 * Default reader: returns an empty batch for every request.
 *
 * Backward-compat path — wiring this as the default in `VbaModulesAdapter`
 * preserves the historical observation: a consumer running `export_all` with
 * no injection still gets the Access `SaveAsText` output (default-valued
 * properties remain stripped), because the post-processor only injects a
 * missing property when the lookup actually returns a value for it.
 *
 * Consumers that need curated default-value preservation wire in a real
 * implementation (e.g. one that talks to the binary via CurrentProject.
 * AllForms[f].Controls[c].Properties(p).Value) at composition time.
 */
export class NoopControlPropertyReader implements ControlPropertyReader {
  async readProperties(): Promise<ControlPropertyBatch> {
    return new Map();
  }
}

export async function readControlProperties(
  reader: ControlPropertyReader,
  formName: string,
  controlName: string,
  propertyNames: readonly string[],
): Promise<Record<string, string | number | boolean>> {
  const values = await reader.readProperties(formName, controlName, propertyNames);
  return Object.fromEntries(values.entries());
}
