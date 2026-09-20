Build a small library management system in this repository (Node.js, ES modules, no dependencies), with a command-line interface, persistence, validation, tests and documentation.

Storage: one JSON file, default `data/library.json` relative to the current directory; every command accepts `--data <path>` to use another file. Create the file on first use. Ids are integers assigned in order per entity type, starting at 1.

Modules (each with its own tests in test/ using node:test):
- src/books.js: addBook({ title, author, copies = 1 }), listBooks({ available } = {}); a book is { id, title, author, copies, available }.
- src/members.js: addMember({ name }); a member is { id, name }.
- src/loans.js: checkout({ bookId, memberId, days = 14, today }), returnLoan({ loanId, today }), listLoans({ memberId, overdue, today } = {}), report({ today }). A loan is { id, bookId, memberId, out, due, returned: null | date, fine }. Dates are strings YYYY-MM-DD; `today` defaults to the current date. Rules: checkout fails when the book has no available copy or the member already has 3 active loans; returning a loan after its due date charges a fine of 0.50 per day late, capped at 20.00; returning a loan twice fails.

CLI: bin/library.js, run as `node bin/library.js <command> [options] [--data <path>]`. Every successful command prints one JSON value on stdout and exits 0. Every failure prints `{ "error": "<message>" }` on stderr and exits 2 (unknown command or missing option: exit 1).
- `add-book --title <t> --author <a> [--copies <n>]` prints the book.
- `add-member --name <n>` prints the member.
- `checkout --book <id> --member <id> [--days <n>] [--today <YYYY-MM-DD>]` prints the loan.
- `return --loan <id> [--today <YYYY-MM-DD>]` prints the loan with its fine.
- `list-books [--available]` prints an array of books.
- `list-loans [--member <id>] [--overdue] [--today <YYYY-MM-DD>]` prints an array of loans (`--overdue` keeps only active loans whose due date is before today).
- `report [--today <YYYY-MM-DD>]` prints { books, copies, available, members, activeLoans, overdue, finesOwed } where finesOwed is the sum of the fines of every returned loan.

Add a "test" script to package.json so that `npm test` runs every test, and write a README.md that documents the modules, every command with an example, and the rules. npm test must pass.
