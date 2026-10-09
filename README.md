# Live Rates

Compare what banks and money transfer services really pay out when you send pounds abroad, after fees.

**Live site:** https://live.ravidata.com

Live Rates collects quotes from around 18 providers every hour for ten currencies, stores them in a database, and shows who pays out the most. It never handles money. It only compares.

## What it does

- **Ranks providers by what arrives.** The best exchange rate is not always the best deal, because fees differ. The ranking uses the amount received after fees.
- **Works for any amount.** Type how many pounds you want to send and the ranking updates as you type.
- **Covers ten currencies from GBP:** EUR, USD, INR, PKR, BDT, LKR, PHP, NGN, PLN and AED.
- **Analyses the quotes:**
  - the cost of choosing the worst provider instead of the best
  - the best deal's total cost against the mid-market rate
  - where the latest payout sits between the lowest and highest readings collected so far
  - how many quotes were checked in the last 24 hours
- **Charts the history** of the best payout, hour by hour.
- **Flags stale quotes**, so an old number is never presented as current.

## How it works

```mermaid
flowchart LR
    A[Public comparison API] -->|hourly| B[fetch_rates.py<br>on GitHub Actions]
    B -->|insert rows| C[(Supabase Postgres<br>quotes table)]
    C -->|read-only REST| D[Web page<br>on GitHub Pages]
    D --> E[Visitor's browser]
```

1. **Collect.** A GitHub Actions workflow runs `fetch_rates.py` every hour. The script calls a public comparison endpoint once per currency and reads each provider's rate, fee and amount received for a £1,000 transfer.
2. **Store.** Each run appends one batch of rows to a `quotes` table in Supabase (Postgres). Every row records when the script ran and when the source last checked that provider.
3. **Serve.** The web page is plain HTML, CSS and JavaScript hosted on GitHub Pages. It reads the latest batch and the history straight from Supabase's REST interface. There is no application server.

## Tech stack

| Part | Tool |
|---|---|
| Collection | Python, `requests`, `psycopg` |
| Scheduling | GitHub Actions (cron) |
| Storage | Supabase (Postgres) with row level security |
| Front end | HTML, CSS, JavaScript, no framework |
| Hosting | GitHub Pages with a custom domain |

## Project layout

```
.github/workflows/fetch.yml   Hourly schedule that runs the collector
fetch_rates.py                Fetches quotes and saves them to the database
requirements.txt              Python packages for the collector
index.html                    Page content
style.css                     Page styling
app.js                        Loads the data, ranks providers, draws the page
```

## Data model

One table, `quotes`, with one row per provider, per currency, per hourly run.

| Column | Type | Meaning |
|---|---|---|
| `id` | bigint | Row number |
| `fetched_at` | timestamptz | When the collector ran |
| `source_currency` | text | Always `GBP` for now |
| `target_currency` | text | For example `INR` |
| `provider` | text | Provider name |
| `rate` | double precision | Exchange rate offered |
| `fee` | double precision | Fee in pounds for a £1,000 transfer |
| `received` | double precision | Amount received for £1,000 |
| `collected` | timestamptz | When the source last checked this provider |

Row level security is switched on. The public can read the table and nothing else. Writes use a database connection that only the collector has.

## Run the collector yourself

You need Python 3.10 or newer and a Postgres database.

1. Create the table:

   ```sql
   create table quotes (
       id              bigint generated always as identity primary key,
       fetched_at      timestamptz not null,
       source_currency text not null,
       target_currency text not null,
       provider        text not null,
       rate            double precision,
       fee             double precision,
       received        double precision,
       collected       timestamptz
   );

   alter table quotes enable row level security;

   create policy "Anyone can read quotes"
       on quotes for select
       using (true);
   ```

2. Install the packages and set the connection string:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   echo "DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres" > .env
   ```

3. Run it:

   ```bash
   python fetch_rates.py
   ```

To run it on a schedule, add `DATABASE_URL` as a repository secret in GitHub. The workflow in `.github/workflows/fetch.yml` does the rest.

To view the page against your own database, change `SUPABASE_URL` and `SUPABASE_KEY` at the top of `app.js`, then open `index.html` in a browser. Use the publishable key there, never the secret one.

## Known limits

- **Amounts other than £1,000 are estimates.** Quotes are collected for £1,000, and other amounts are worked out as (amount minus fee) times rate. Real fees can change with the amount and the payment method.
- **Quote freshness depends on the source.** Most quotes are refreshed about hourly, but some banks are only checked every few days. These are marked on the page.
- **The schedule is not exact.** GitHub Actions can start scheduled runs late.
- **History queries are capped** at the most recent 1,000 rows per currency.

## Planned

- Email alerts when a rate reaches a target
- Exact quotes for any amount
- Links through to each provider
- A longer history view with daily summaries

## Disclaimer

Live Rates is an information tool. It is not financial advice and it does not send, hold or receive money. Always confirm the final rate and fee with the provider before you send. Provider names and logos belong to their owners and are shown only to identify each service.

## Author

Ravi Teja · [GitHub](https://github.com/RaviTejaData) · [LinkedIn](https://linkedin.com/in/ravi-teja-2991233b2) · [ravidata.com](https://ravidata.com)
