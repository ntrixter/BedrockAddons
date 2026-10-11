// Redirects the pack's "@minecraft/server" imports to the local mock, so the
// shipping scripts can be loaded unmodified without a node_modules stub.
const MOCK = new URL("./mock-server.js", import.meta.url).href;

export function resolve(specifier, context, next) {
  if (specifier === "@minecraft/server") return { url: MOCK, shortCircuit: true };
  return next(specifier, context);
}
