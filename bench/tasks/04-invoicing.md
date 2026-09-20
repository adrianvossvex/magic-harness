Build a small invoicing system in this repository (Node.js, ES modules, no dependencies) with a command-line interface, JSON persistence, tests and documentation. Follow every rule below exactly; the CLI output is machine-read.

Storage: one JSON file, default `data/invoicing.json` relative to the current directory; every command accepts `--data <path>`. Create the file (and its directory) on first use. Ids are integers per entity type, starting at 1.

Money: amounts are handled in integer cents internally and shown as decimal strings with exactly two decimals (`"12.30"`). Input amounts are decimal strings with at most two decimals; anything else (letters, three decimals, negative values) is an error. Rounding, wherever it is needed, is half up on the cent.

Modules (each with its own tests in test/ using node:test):
- src/money.js: parseMoney(text) -> cents, formatMoney(cents) -> string, roundCents(number) -> integer cents (half up).
- src/customers.js: addCustomer({ name, email }), a customer is { id, name, email }; email must contain "@".
- src/products.js: addProduct({ name, price, taxRate }), a product is { id, name, price (cents), taxRate (percent, integer 0-100, default 0) }.
- src/invoices.js:
  - createInvoice({ customerId, terms = 30 }) makes a draft: { id, number: null, customerId, status: "draft", terms, issued: null, due: null, lines: [], payments: [], subtotal: 0, tax: 0, total: 0, paid: 0, balance: 0 } (all amounts in cents).
  - addLine({ invoiceId, productId, quantity = 1, discount = 0 }) appends a line { productId, description (the product name), quantity (positive integer), unitPrice (cents), discount (percent, 0-100), net, tax } and recomputes the totals: net = unitPrice * quantity * (100 - discount) / 100 rounded half up; tax = net * taxRate / 100 rounded half up; subtotal = sum of net; tax = sum of line tax; total = subtotal + tax; balance = total - paid. Only drafts accept lines.
  - issue({ invoiceId, today }) turns a draft with at least one line into status "issued": number becomes `INV-<year>-<nnnn>` with the year of `today` and a four-digit counter that starts at 0001 for each year and increments per issued invoice in that year; issued = today; due = today + terms days.
  - pay({ invoiceId, amount, today }) records { amount (cents), date } on an issued invoice; partial payments are allowed; paying more than the balance is an error; when paid reaches total the status becomes "paid".
  - voidInvoice({ invoiceId }) sets status "void" on a draft or on an issued invoice without payments; anything else is an error.
  - listInvoices({ status, customerId, overdue, today } = {}); an invoice is overdue when its status is "issued" and due < today.
  - Dates are strings YYYY-MM-DD; `today` defaults to the current date.
- src/report.js:
  - aging({ today }) -> { current, days1to30, days31to60, days61to90, over90, total } summing the balance of issued invoices by how many days past due they are on `today` (not yet due -> current; 1-30 days past due -> days1to30; and so on; total is the sum of all five), in cents.
  - revenue() -> an array of { month: "YYYY-MM", invoices, total } for each month that has issued or paid invoices (by the issue date), sorted by month, totals in cents.

CLI: bin/invoice.js, run as `node bin/invoice.js <command> [options] [--data <path>]`. Every successful command prints exactly one JSON value on stdout and exits 0; money fields in that JSON (price, unitPrice, net, tax, subtotal, total, paid, balance, amount, every aging bucket and revenue total) are formatted strings like "12.30", never raw cents. Every failure prints `{ "error": "<message>" }` on stderr and exits 2; an unknown command or a missing required option prints usage on stderr and exits 1.
- `add-customer --name <n> --email <e>` prints the customer.
- `add-product --name <n> --price <amount> [--tax <percent>]` prints the product.
- `create --customer <id> [--terms <days>]` prints the draft invoice.
- `add-line --invoice <id> --product <id> [--quantity <n>] [--discount <percent>]` prints the invoice.
- `issue --invoice <id> [--today <date>]` prints the invoice.
- `pay --invoice <id> --amount <amount> [--today <date>]` prints the invoice.
- `void --invoice <id>` prints the invoice.
- `show --invoice <id>` prints the invoice.
- `list [--status <s>] [--customer <id>] [--overdue] [--today <date>]` prints an array of invoices.
- `report aging [--today <date>]` and `report revenue` print the report objects.
- `export --invoice <id>` prints (as a JSON string) the CSV text of the invoice lines with the header `description,quantity,unitPrice,discount,net,tax` followed by one row per line, money as formatted strings, rows separated by "\n", no trailing newline.

Add a "test" script to package.json so that `npm test` runs every test, and write a README.md that documents the modules, every command with an example, and the rules. npm test must pass.
