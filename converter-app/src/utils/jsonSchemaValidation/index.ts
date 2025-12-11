import Ajv from 'ajv';

export const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });

/** Compile an Ajv JSON Schema validator function from a JSON Schema spec */
export function jsonSchemaToValidator(...args: Parameters<typeof ajv.compile>) {
  return ajv.compile(...args);
}