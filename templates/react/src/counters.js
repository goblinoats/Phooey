// These fields match the counter concept in src/schema.yaml.
const counter = {
  with: {
    name: { the: 'example.builder-counter/name', as: 'Text', cardinality: 'one' },
    count: { the: 'example.builder-counter/count', as: 'UnsignedInteger', cardinality: 'one' },
  },
};

export const counters = {
  predicate: counter,
  terms: {
    this: { '?': { name: 'this' } },
    name: { '?': { name: 'name' } },
    count: { '?': { name: 'count' } },
  },
};

export function addCounter(name) {
  return { claims: [{
    op: 'assert',
    application: {
      predicate: { kind: 'durable', concept: counter },
      parameters: { name, count: 0 },
    },
  }] };
}
