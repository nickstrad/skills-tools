CREATE SCHEMA sales;

CREATE TABLE sales.orders (
  order_id integer PRIMARY KEY,
  ordered_on date NOT NULL,
  status text NOT NULL,
  amount_cents integer NOT NULL,
  customer_email text NOT NULL
);

INSERT INTO
  sales.orders
VALUES
  (101, '2026-09-13', 'paid', 1200, 'a@example.invalid'),
  (102, '2026-09-14', 'paid', 2300, 'b@example.invalid'),
  (103, '2026-09-14', 'pending', 800, 'c@example.invalid'),
  (104, '2026-09-14', 'paid', 1700, 'd@example.invalid'),
  (105, '2026-09-15', 'paid', 900, 'e@example.invalid');

CREATE TABLE public.orders (LIKE sales.orders INCLUDING ALL);

INSERT INTO
  public.orders
VALUES
  (999, '2026-09-14', 'paid', 99900, 'decoy@example.invalid');

CREATE ROLE reader LOGIN;

GRANT USAGE ON SCHEMA sales TO reader;

GRANT SELECT ON sales.orders, public.orders TO reader;
