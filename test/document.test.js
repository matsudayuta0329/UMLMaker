import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, validateDocument, serializable } from '../src/core/document.js';
import '../src/core/diagram-types.js';
import { getDiagramType, listDiagramTypes } from '../src/core/registry.js';

test('creates AI-friendly class document envelope', () => {
  const doc = createDocument('class');
  assert.equal(doc.schema, 'umlmaker.document');
  assert.equal(doc.diagramType, 'class');
  assert.deepEqual(doc.elements, []);
});
test('validates registered document types', () => {
  assert.equal(validateDocument(createDocument('sequence')).diagramType, 'sequence');
  assert.throws(() => validateDocument({}), /UML Maker/);
});
test('diagram types are extensible through the registry', () => {
  assert.deepEqual(listDiagramTypes().map(x => x.type), ['class', 'sequence']);
  assert.equal(getDiagramType('class').createElement(0).kind, 'class');
});
test('serialization does not mutate editing state', () => {
  const doc = createDocument('class');
  const before = doc.metadata.updatedAt;
  const saved = serializable(doc);
  assert.equal(doc.metadata.updatedAt, before);
  assert.ok(saved.metadata.updatedAt);
});
