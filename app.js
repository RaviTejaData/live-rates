// Where the data lives. The publishable key is safe to show: it can only read quotes.
const SUPABASE_URL = "https://deuvqizffqssafjigbzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_j5KZB8bhMM7KSYmrtXiywA_YWH15UyM";

// The ten currencies the hourly job collects. To add one, add it here and in fetch_rates.py.
const CURRENCIES = [
  { code: "INR", country: "India", symbol: "₹" },
  { code: "PKR", country: "Pakistan", symbol: "₨" },
  { code: "BDT", country: "Bangladesh", symbol: "৳" },
  { code: "LKR", country: "Sri Lanka", symbol: "Rs " },
  { code: "PHP", country: "Philippines", symbol: "₱" },
  { code: "NGN", country: "Nigeria", symbol: "₦" },
  { code: "PLN", country: "Poland", symbol: "zł " },
  { code: "EUR", country: "Eurozone", symbol: "€" },
  { code: "USD", country: "United States", symbol: "$" },
  { code: "AED", country: "UAE", symbol: "AED " },
];

// Everything the page needs to remember.
const state = { currency: CURRENCIES[0], quotes: [], history: [], showAll: false };

const el = id => document.getElementById(id);

// ---------- Getting data ----------

async function ask(query) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/quotes?" + query, { headers: { apikey: SUPABASE_KEY } });
  if (!response.ok) throw new Error("Database answered " + response.status);
  return response.json();
}

// The newest batch of quotes for one currency.
async function loadQuotes(code) {
  const rows = await ask("select=*&target_currency=eq." + code + "&order=fetched_at.desc&limit=40");
  return rows.filter(row => row.fetched_at === rows[0].fetched_at);
}

// The best payout in each hourly batch, oldest first, for the chart.
async function loadHistory(code) {
  const rows = await ask("select=fetched_at,received&target_currency=eq." + code + "&order=fetched_at.desc&limit=1000");
  const bestByBatch = new Map();
  for (const row of rows) {
    const current = bestByBatch.get(row.fetched_at) || 0;
    if (row.received > current) bestByBatch.set(row.fetched_at, row.received);
  }
  return [...bestByBatch].map(([time, best]) => ({ time: new Date(time), best })).sort((a, b) => a.time - b.time);
}

// ---------- Small helpers ----------

function money(value) {
  return state.currency.symbol + value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function whole(value) {
  return state.currency.symbol + Math.round(value).toLocaleString("en-GB");
}

function ago(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp)) / 60000));
  if (minutes < 60) return minutes + " min ago";
  if (minutes < 1440) return Math.round(minutes / 60) + " hr ago";
  return Math.round(minutes / 1440) + " days ago";
}

function isOld(timestamp) {
  return Date.now() - new Date(timestamp) > 24 * 60 * 60 * 1000;
}

function safe(text) {
  return String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function amount() {
  return parseFloat(el("amount").value) || 0;
}

// Every provider with what it pays for the typed amount, best first.
function ranked() {
  const list = state.quotes.map(q => ({ ...q, got: Math.max(0, amount() - q.fee) * q.rate }));
  list.sort((a, b) => b.got - a.got);
  return list;
}

// ---------- Drawing the page ----------

function renderPills() {
  el("pills").innerHTML = CURRENCIES.map(c =>
    `<button type="button" class="pill ${c.code === state.currency.code ? "on" : ""}" data-code="${c.code}" aria-pressed="${c.code === state.currency.code}">${c.country} · ${c.code}</button>`
  ).join("");
}

function renderHero(list) {
  const best = list[0];
  const worst = list[list.length - 1];
  el("bestAmount").textContent = money(best.got);
  el("bestCode").textContent = state.currency.code;
  el("bestLine").textContent = "Best deal is " + best.provider + ": " + whole(best.got - worst.got) + " more than the lowest offer.";
  const wise = state.quotes.find(q => q.provider === "Wise");
  el("ticker").textContent = wise
    ? "Market rate: £1 = " + state.currency.symbol + wise.rate.toFixed(3)
    : "Quotes updated " + ago(best.fetched_at);
}

function renderTop3(list) {
  const tags = ["Best deal", "2nd best", "3rd best"];
  const cards = list.slice(0, 3).map((q, i) => `
    <div class="deal ${i === 0 ? "best" : ""}">
      <div class="deal-head"><strong>${safe(q.provider)}</strong><span class="tag">${tags[i]}</span></div>
      <div><span class="small">They receive</span><div class="big">${money(q.got)}</div></div>
      <div class="facts">
        <div><span class="small">Rate</span>${q.rate.toFixed(3)}</div>
        <div><span class="small">Fee</span>${q.fee ? "£" + q.fee.toFixed(2) : "No fee"}</div>
      </div>
      <span class="small">Quote checked ${ago(q.collected)}</span>
    </div>`).join("");
  el("top3").innerHTML = `
    <div class="wrap band">
      <h2>Today's top ${Math.min(3, list.length)}</h2>
      <p class="sub">For £${amount().toLocaleString("en-GB")} sent to ${state.currency.country}, these pay out the most.</p>
      <div class="cards">${cards}</div>
    </div>`;
}

function renderTable(list) {
  const best = list[0];
  const span = best.got - list[list.length - 1].got;
  const shown = state.showAll ? list : list.slice(0, 8);
  const rows = shown.map((q, i) => {
    const lost = best.got - q.got;
    const width = span > 0 ? (lost / span * 100).toFixed(1) : 0;
    return `
      <tr class="${i === 0 ? "best" : ""}">
        <td class="rank">${i + 1}</td>
        <td class="name">${safe(q.provider)}</td>
        <td class="got">${money(q.got)}</td>
        <td><div class="gap"><div class="track"><div class="fill" style="width:${width}%"></div></div><span class="gap-text">${i === 0 ? "Best deal" : whole(lost) + " less"}</span></div></td>
        <td>${q.rate.toFixed(3)}</td>
        <td>${q.fee ? "£" + q.fee.toFixed(2) : "No fee"}</td>
        <td class="${isOld(q.collected) ? "old" : ""}">${ago(q.collected)}</td>
      </tr>`;
  }).join("");
  const toggle = list.length > 8
    ? `<button type="button" class="button dark" id="toggle">${state.showAll ? "Show top 8 only" : "Show all " + list.length + " providers"}</button>`
    : "";
  el("compare").innerHTML = `
    <div class="wrap band">
      <h2>Every provider, best to worst</h2>
      <p class="sub">The orange bar shows how much less arrives than with the best deal.</p>
      <div class="table-box">
        <table>
          <thead><tr><th>#</th><th>Provider</th><th>They receive</th><th>Compared with the best</th><th>Rate</th><th>Fee</th><th>Quote checked</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="table-foot">
        <span>Orange text in the last column means the quote is more than a day old and may have changed.</span>
        ${toggle}
      </div>
    </div>`;
}

function renderHistory() {
  const points = state.history;
  let body;
  if (points.length < 2) {
    body = `<p class="sub">History is still collecting. The chart appears here once there are at least two hourly readings.</p>`;
  } else {
    const W = 1200, H = 300, left = 10, right = 150, top = 30, bottom = 40;
    const values = points.map(p => p.best);
    const low = Math.min(...values), high = Math.max(...values);
    const range = high - low || 1;
    const t0 = points[0].time, t1 = points[points.length - 1].time;
    const x = p => left + (p.time - t0) / (t1 - t0) * (W - left - right);
    const y = p => top + (high - p.best) / range * (H - top - bottom);
    const line = points.map((p, i) => (i ? "L" : "M") + x(p).toFixed(1) + " " + y(p).toFixed(1)).join(" ");
    const last = points[points.length - 1];
    const floor = H - bottom;
    const day = d => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    body = `
      <p class="sub">The best payout for £1,000 sent to ${state.currency.country}, hour by hour. Highest so far: ${whole(high)}. Lowest: ${whole(low)}.</p>
      <div class="chart-box">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Best payout for 1,000 pounds over time">
          <line x1="${left}" y1="${top}" x2="${W - right}" y2="${top}" stroke="#DCE1EE"></line>
          <line x1="${left}" y1="${floor}" x2="${W - right}" y2="${floor}" stroke="#C5CCE0"></line>
          <path d="${line} L${x(last).toFixed(1)} ${floor} L${left} ${floor} Z" fill="#E4E9F7"></path>
          <path d="${line}" fill="none" stroke="#1B3BE0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="${x(last).toFixed(1)}" cy="${y(last).toFixed(1)}" r="8" fill="#1B3BE0" stroke="white" stroke-width="4"></circle>
          <text class="now" x="${(x(last) + 16).toFixed(1)}" y="${(y(last) + 5).toFixed(1)}">${whole(last.best)}</text>
          <text x="${left}" y="${H - 12}">${day(t0)}</text>
          <text x="${W - right}" y="${H - 12}" text-anchor="end">${day(t1)}</text>
        </svg>
      </div>`;
  }
  el("history").innerHTML = `<div class="wrap band"><h2>Is today a good day to send?</h2>${body}</div>`;
}

function render() {
  renderPills();
  if (!state.quotes.length) return;
  const list = ranked();
  renderHero(list);
  renderTop3(list);
  renderTable(list);
}

// ---------- Reacting to the visitor ----------

async function chooseCurrency(code) {
  state.currency = CURRENCIES.find(c => c.code === code);
  state.showAll = false;
  renderPills();
  try {
    state.quotes = await loadQuotes(code);
    render();
    state.history = await loadHistory(code);
    renderHistory();
  } catch (error) {
    el("bestLine").textContent = "Could not load quotes just now. Please refresh in a minute.";
    console.error(error);
  }
}

el("amount").addEventListener("input", render);

el("pills").addEventListener("click", event => {
  const pill = event.target.closest(".pill");
  if (pill) chooseCurrency(pill.dataset.code);
});

el("compare").addEventListener("click", event => {
  if (event.target.id === "toggle") {
    state.showAll = !state.showAll;
    render();
  }
});

chooseCurrency("INR");
