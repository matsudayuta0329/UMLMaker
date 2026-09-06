const registry = new Map();

export function registerDiagramType(definition) {
  if (!definition?.type || !definition?.label || typeof definition.createElement !== 'function') {
    throw new Error('図タイプにはtype、label、createElementが必要です。');
  }
  registry.set(definition.type, Object.freeze(definition));
}
export const getDiagramType = (type) => registry.get(type);
export const listDiagramTypes = () => [...registry.values()];
