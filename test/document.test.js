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
test('migrates version 1 class members into structured schema version 2', () => {
  const legacy = createDocument('class');
  legacy.schemaVersion = 1;
  legacy.elements = [{ attributes: ['# name: string'], operations: ['+ save(id: string): boolean'] }];
  const migrated = validateDocument(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.elements[0].attributes[0], { id: migrated.elements[0].attributes[0].id, name: 'name', type: 'string', visibility: 'protected' });
  assert.equal(migrated.elements[0].operations[0].returnType, 'boolean');
  assert.deepEqual(migrated.elements[0].operations[0].parameters.map(({ name, type }) => ({ name, type })), [{ name: 'id', type: 'string' }]);
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
