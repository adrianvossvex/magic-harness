Extend this tiny todo library. Add to src/todo.js:
- toggle(id): flips the item's done flag and returns the item; throws an Error whose message contains "Unknown id" for an unknown id.
- remove(id): deletes the item and returns true, or returns false when the id is unknown.
- count(): returns the number of items.
Keep add(text) and list() working as they are (list returns a copy). Add tests for the new methods in test/ using node:test, and write a README.md that documents createStore, add, list, toggle, remove and count with a short example. npm test must stay green.
