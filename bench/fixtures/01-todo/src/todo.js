// A tiny in-memory todo list.
export function createStore() {
  const items = [];
  return {
    add(text) { const item = { id: items.length + 1, text, done: false }; items.push(item); return item; },
    list() { return items.slice(); },
  };
}
