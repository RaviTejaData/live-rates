import os
from datetime import datetime, timezone

import psycopg
import requests
from dotenv import load_dotenv

load_dotenv()

URL = "https://api.wise.com/v4/comparisons/"
SOURCE = "GBP"
TARGETS = ["INR", "PKR", "BDT", "LKR", "PHP", "NGN", "PLN", "EUR", "USD", "AED"]
SEND_AMOUNT = 1000

fetched_at = datetime.now(timezone.utc)
rows = []

for target in TARGETS:
    params = {"sourceCurrency": SOURCE, "targetCurrency": target, "sendAmount": SEND_AMOUNT}
    response = requests.get(URL, params=params, timeout=10)
    response.raise_for_status()
    providers = response.json()["providers"]

    for provider in providers:
        if not provider["quotes"]:
            continue
        quote = provider["quotes"][0]
        rows.append((
            fetched_at, SOURCE, target, provider["name"],
            quote["rate"], quote["fee"], quote["receivedAmount"], quote["dateCollected"],
        ))

    print(f"{SOURCE} to {target}: {len(providers)} providers")

with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
    with connection.cursor() as cursor:
        cursor.executemany(
            """
            insert into quotes
                (fetched_at, source_currency, target_currency, provider, rate, fee, received, collected)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )

print(f"Saved {len(rows)} quotes")
