export class SchemaError extends Error {
  constructor(label, errors) {
    const detail = errors.map((e) => `${e.path}: ${e.message}`).join('\n  ');
    super(`${label} no es valido:\n  ${detail}`);
    this.name = 'SchemaError';
    this.errors = errors;
  }
}

export function validate(schema, data, options = {}) {
  const root = options.root ?? schema;
  const errors = [];
  walk(schema, data, options.path ?? '$', root, errors);
  return errors;
}

export function assertValid(schema, data, label = 'config') {
  const errors = validate(schema, data);
  if (errors.length > 0) throw new SchemaError(label, errors);
  return data;
}

function walk(schema, data, path, root, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    if (!target) {
      errors.push({ path, message: `referencia desconocida ${schema.$ref}` });
      return;
    }
    walk(target, data, path, root, errors);
    return;
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((option) => validate(option, data, { root, path }).length === 0);
    if (!ok) {
      errors.push({ path, message: 'no coincide con ninguna de las formas permitidas' });
      return;
    }
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push({ path, message: `se esperaba ${JSON.stringify(schema.const)}` });
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    errors.push({ path, message: `valor no permitido (${JSON.stringify(schema.enum)})` });
    return;
  }

  if (schema.type && !matchesType(schema.type, data)) {
    errors.push({ path, message: `se esperaba ${formatType(schema.type)}, se recibio ${describeType(data)}` });
    return;
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ path, message: `debe ser >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ path, message: `debe ser <= ${schema.maximum}` });
    }
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ path, message: `debe tener al menos ${schema.minLength} caracteres` });
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({ path, message: `debe tener como maximo ${schema.maxLength} caracteres` });
    }
    if (schema.pattern !== undefined) {
      let pattern;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        errors.push({ path, message: `patron invalido en el schema: ${schema.pattern}` });
      }
      if (pattern && !pattern.test(data)) {
        errors.push({ path, message: `no coincide con el patron ${schema.pattern}` });
      }
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ path, message: `debe tener al menos ${schema.minItems} elementos` });
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({ path, message: `debe tener como maximo ${schema.maxItems} elementos` });
    }
    if (schema.uniqueItems === true) {
      const serialized = data.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push({ path, message: 'no debe contener elementos repetidos' });
      }
    }
    if (schema.items) {
      data.forEach((item, index) => walk(schema.items, item, `${path}[${index}]`, root, errors));
    }
  }

  if (isPlainObject(data)) {
    const keys = Object.keys(data);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({ path, message: `debe tener al menos ${schema.minProperties} propiedades` });
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      errors.push({ path, message: `debe tener como maximo ${schema.maxProperties} propiedades` });
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in data)) errors.push({ path: `${path}.${key}`, message: 'es obligatorio' });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, value] of Object.entries(data)) {
      if (key === '$schema') continue;
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        walk(properties[key], value, `${path}.${key}`, root, errors);
        continue;
      }
      if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, message: 'propiedad no permitida' });
      } else if (isPlainObject(schema.additionalProperties)) {
        walk(schema.additionalProperties, value, `${path}.${key}`, root, errors);
      }
    }
  }
}

function resolveRef(ref, root) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return null;
  const parts = ref
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = root;
  for (const part of parts) {
    if (!isPlainObject(node) || !(part in node)) return null;
    node = node[part];
  }
  return node;
}

function matchesType(type, data) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => {
    switch (item) {
      case 'object':
        return isPlainObject(data);
      case 'array':
        return Array.isArray(data);
      case 'integer':
        return Number.isInteger(data);
      case 'number':
        return typeof data === 'number' && Number.isFinite(data);
      case 'string':
        return typeof data === 'string';
      case 'boolean':
        return typeof data === 'boolean';
      case 'null':
        return data === null;
      default:
        return false;
    }
  });
}

function formatType(type) {
  return Array.isArray(type) ? type.join(' o ') : type;
}

function describeType(data) {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  if (Number.isInteger(data)) return 'integer';
  return typeof data;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
