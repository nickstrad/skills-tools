SELECT order_id, amount_cents FROM app.public.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents FROM app.public.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid';
