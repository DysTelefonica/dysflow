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

export async function readControlProperties(
  reader: ControlPropertyReader,
  formName: string,
  controlName: string,
  propertyNames: readonly string[],
): Promise<Record<string, string | number | boolean>> {
  const values = await reader.readProperties(formName, controlName, propertyNames);
  return Object.fromEntries(values.entries());
}
