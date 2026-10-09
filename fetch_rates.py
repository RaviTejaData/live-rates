import requests
import sqlite3
from datetime import datetime, timezone


URL = "https://api.wise.com/v4/comparisons/"
params = {"sourceCurrency": "GBP", "targetCurrency": "INR", "sendAmount": 1000}

response = requests.get(URL, params=params, timeout=10)
response.raise_for_status()
data = response.json()

rows = []
for provider in data["providers"]:
    quote = provider["quotes"][0]
    rows.append({
        "name": provider["name"],
        "rate": quote["rate"],
        "fee": quote["fee"],
        "received": quote["receivedAmount"],
        "collected": quote["dateCollected"],
    })

rows.sort(key=lambda row: row["received"], reverse=True)

for position, row in enumerate(rows, start=1):
    print(f"{position:>2}. {row['name']:<22} {row['received']:>12,.2f} INR   rate {row['rate']:.3f}   fee £{row['fee']:.2f}")

fetched_at = datetime.now(timezone.utc).isoformat()

connection = sqlite3.connect("rates.db")
connection.execute("""
    CREATE TABLE IF NOT EXISTS quotes (
        fetched_at TEXT,
        provider   TEXT,
        rate       REAL,
        fee        REAL,
        received   REAL,
        collected  TEXT
    )
""")

for row in rows:
    connection.execute(
        "INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?)",
        (fetched_at, row["name"], row["rate"], row["fee"], row["received"], row["collected"]),
    )

connection.commit()
connection.close()
print(f"Saved {len(rows)} quotes at {fetched_at}")
