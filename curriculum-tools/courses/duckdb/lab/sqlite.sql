CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, region TEXT, name TEXT);

INSERT INTO
  customers
VALUES
  (1, 'west', 'Ada'),
  (2, 'east', 'Lin'),
  (3, 'west', 'Sam'),
  (4, 'north', 'Jo');

CREATE TABLE invoices (invoice_id INTEGER PRIMARY KEY, amount_cents INTEGER);

INSERT INTO
  invoices
VALUES
  (1, 1200),
  (2, '2300'),
  (3, 'oops'),
  (4, NULL),
  (5, -50);
