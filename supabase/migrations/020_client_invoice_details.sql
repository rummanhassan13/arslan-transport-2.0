-- Per-company invoice details: name printed on the invoice, company TRN, and
-- whether our IBAN is shown on that company's invoices.
alter table public.clients
  add column if not exists invoice_company_name text,
  add column if not exists trn text,
  add column if not exists show_iban_on_invoice boolean not null default false;
