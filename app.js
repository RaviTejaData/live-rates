// Where the data lives. The publishable key is safe to show: it can only read quotes.
const SUPABASE_URL = "https://deuvqizffqssafjigbzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_j5KZB8bhMM7KSYmrtXiywA_YWH15UyM";

// The ten currencies the hourly job collects. To add one, add it here and in fetch_rates.py.
const CURRENCIES = [
  { code: "EUR", flag: "eu", country: "Europe", symbol: "€" },
  { code: "USD", flag: "us", country: "United States", symbol: "$" },
  { code: "INR", flag: "in", country: "India", symbol: "₹" },
  { code: "PKR", flag: "pk", country: "Pakistan", symbol: "₨" },
  { code: "BDT", flag: "bd", country: "Bangladesh", symbol: "৳" },
  { code: "LKR", flag: "lk", country: "Sri Lanka", symbol: "Rs\u00a0" },
  { code: "PHP", flag: "ph", country: "Philippines", symbol: "₱" },
  { code: "NGN", flag: "ng", country: "Nigeria", symbol: "₦" },
  { code: "PLN", flag: "pl", country: "Poland", symbol: "zł\u00a0" },
  { code: "AED", flag: "ae", country: "UAE", symbol: "AED\u00a0" },
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

// ---------- Flags and logos ----------

// Country flags come from flagcdn.com, a free flag image service.
function flag(code) {
  return `<img class="flag" src="https://flagcdn.com/${code}.svg" alt="" loading="lazy" onerror="this.remove()">`;
}

// Provider logos come from the same public source as the quotes.
// Names that don't follow the usual pattern are listed here.
const LOGO_NAMES = { "WorldRemit": "world-remit", "ICICI Bank": "icici", "Santander UK": "santander" };

function logo(name) {
  const slug = LOGO_NAMES[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const words = name.split(" ");
  const initials = (words[0][0] + (words[1] ? words[1][0] : words[0][1] || "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
  // If a logo is missing, the badge shows the provider's initials instead.
  return `<span class="badge"><img src="https://dq8dwmysp7hk1.cloudfront.net/logos/${slug}-mark.svg" alt="" loading="lazy" onerror="this.replaceWith('${initials}')"></span>`;
}

// ---------- Drawing the page ----------

// The currency buttons are built once. After that only the highlight moves,
// so the flags don't reload and flicker on every tap or keystroke.
function renderPills() {
  const box = el("pills");
  if (!box.children.length) {
    box.innerHTML = CURRENCIES.map(c =>
      `<button type="button" class="pill" data-code="${c.code}">${flag(c.flag)}${c.country} · ${c.code}</button>`
    ).join("");
  }
  for (const pill of box.children) {
    const on = pill.dataset.code === state.currency.code;
    pill.classList.toggle("on", on);
    pill.setAttribute("aria-pressed", on);
  }
  if (el("country").dataset.code !== state.currency.code) {
    el("country").dataset.code = state.currency.code;
    el("country").innerHTML = flag(state.currency.flag) + state.currency.country;
    el("eyebrow").textContent = "GBP to " + state.currency.code + ", compared after fees";
  }
}

// Shrinks the big number until it fits on one line, whatever the screen width.
function fitPayout() {
  const box = el("bestAmount");
  box.style.fontSize = "";
  let size = parseFloat(getComputedStyle(box).fontSize);
  while (box.scrollWidth > box.clientWidth && size > 22) {
    size -= 2;
    box.style.fontSize = size + "px";
  }
}

// The sentence at the top and the five-lane race beside it.
function renderHero(list) {
  const best = list[0];
  el("bestAmount").textContent = money(best.got);
  fitPayout();
  el("bestLine").innerHTML = "with " + logo(best.provider) + "<strong>" + safe(best.provider) + "</strong>, today's best deal. Quote checked " + ago(best.collected) + ".";
  const wise = state.quotes.find(q => q.provider === "Wise");
  el("ticker").textContent = wise
    ? "Market rate £1 = " + state.currency.symbol + wise.rate.toFixed(3)
    : "Updated " + ago(best.fetched_at);

  const top = list.slice(0, 5);
  const floor = top[top.length - 1].got;
  const span = best.got - floor;
  el("race").innerHTML = top.map((q, i) => {
    const width = span > 0 ? 45 + 55 * (q.got - floor) / span : 100;
    return `
      <div class="lane ${i === 0 ? "first" : ""}">
        <div class="lane-top"><span class="who">${logo(q.provider)}<span class="nm">${safe(q.provider)}</span></span><span>${money(q.got)}</span></div>
        <div class="bar"><i style="width:${width.toFixed(1)}%"></i></div>
      </div>`;
  }).join("");
  el("raceNote").textContent = "Top " + top.length + " of " + list.length;
}

// Four numbers worked out from the quotes and the history.
function renderInsights(list) {
  const best = list[0];
  const worst = list[list.length - 1];
  const sent = amount();
  const tiles = [];

  tiles.push(`
    <div class="tile">
      <span class="label">Cost of a bad choice</span>
      <div class="stat loss">${whole(best.got - worst.got)}</div>
      <p>That is how much less arrives with ${safe(worst.provider)}, the lowest offer, than with ${safe(best.provider)}.</p>
    </div>`);

  const wise = state.quotes.find(q => q.provider === "Wise");
  if (wise && sent > 0) {
    const cost = (1 - best.got / (sent * wise.rate)) * 100;
    tiles.push(`
      <div class="tile">
        <span class="label">Best deal against the market</span>
        <div class="stat ${cost <= 0 ? "win" : ""}">${Math.abs(cost).toFixed(2)}%</div>
        <p>${cost <= 0 ? "Better than the market rate, usually because of a promotional offer." : "The total cost of the best deal, compared with the market rate that banks trade at."}</p>
      </div>`);
  }

  const points = state.history.map(p => p.best);
  if (points.length >= 3) {
    const latest = points[points.length - 1];
    const low = Math.min(...points), high = Math.max(...points);
    const place = high > low ? (latest - low) / (high - low) * 100 : 50;
    const word = place >= 67 ? "A good moment" : place >= 34 ? "A middling moment" : "A weak moment";
    tiles.push(`
      <div class="tile">
        <span class="label">Is now a good time?</span>
        <div class="stat">${word}</div>
        <div><div class="meter"><i style="left:${place.toFixed(0)}%"></i></div>
        <div class="meter-ends"><span>Lowest ${whole(low)}</span><span>Highest ${whole(high)}</span></div></div>
        <p>Where the latest best payout sits among ${points.length} hourly readings for £1,000.</p>
      </div>`);
  } else {
    tiles.push(`
      <div class="tile">
        <span class="label">Is now a good time?</span>
        <div class="stat">Collecting</div>
        <p>This compares today with past readings. It appears once a few hours of history are saved.</p>
      </div>`);
  }

  const fresh = list.filter(q => !isOld(q.collected)).length;
  tiles.push(`
    <div class="tile">
      <span class="label">Quote freshness</span>
      <div class="stat">${fresh} of ${list.length}</div>
      <p>Quotes checked in the last 24 hours. Older ones are marked in amber in the ranking.</p>
    </div>`);

  el("insights").innerHTML = `
    <div class="wrap band">
      <h2>What the numbers say</h2>
      <p class="sub">For £${sent.toLocaleString("en-GB")} sent to ${state.currency.country}.</p>
      <div class="tiles">${tiles.join("")}</div>
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
      <div class="row ${i === 0 ? "best" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="name who">${logo(q.provider)}<span class="nm">${safe(q.provider)}</span></span>
        <span class="got">${money(q.got)}</span>
        <span class="lost"><span class="bar"><i style="width:${width}%"></i></span><span>${i === 0 ? "Best deal" : whole(lost) + " less"}</span></span>
        <span class="rate" data-label="Rate">${q.rate.toFixed(3)}</span>
        <span data-label="Fee">${q.fee ? "£" + q.fee.toFixed(2) : "No fee"}</span>
        <span class="checked ${isOld(q.collected) ? "old" : ""}" data-label="Checked">${ago(q.collected)}</span>
      </div>`;
  }).join("");
  const toggle = list.length > 8
    ? `<button type="button" class="button ghost" id="toggle">${state.showAll ? "Show top 8 only" : "Show all " + list.length + " providers"}</button>`
    : "";
  el("compare").innerHTML = `
    <div class="wrap band">
      <h2>Every provider, best to worst</h2>
      <p class="sub">The coral bar shows how much less arrives than with the best deal.</p>
      <div class="rows">
        <div class="row head"><span>#</span><span>Provider</span><span>They receive</span><span>Compared with the best</span><span>Rate</span><span>Fee</span><span>Checked</span></div>
        ${rows}
      </div>
      <div class="rows-foot">
        <span>Amber in the last column means the quote is more than a day old and may have changed.</span>
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
    const W = 1200, H = 320, left = 10, right = 150, top = 30, bottom = 40;
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
          <line x1="${left}" y1="${top}" x2="${W - right}" y2="${top}" stroke="#262A3F"></line>
          <line x1="${left}" y1="${floor}" x2="${W - right}" y2="${floor}" stroke="#3A3F5C"></line>
          <path d="${line} L${x(last).toFixed(1)} ${floor} L${left} ${floor} Z" fill="#1D1A45"></path>
          <path d="${line}" fill="none" stroke="#7566FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="${x(last).toFixed(1)}" cy="${y(last).toFixed(1)}" r="8" fill="#4FE3A1" stroke="#10121D" stroke-width="4"></circle>
          <text class="now" x="${(x(last) + 16).toFixed(1)}" y="${(y(last) + 5).toFixed(1)}">${whole(last.best)}</text>
          <text x="${left}" y="${H - 12}">${day(t0)}</text>
          <text x="${W - right}" y="${H - 12}" text-anchor="end">${day(t1)}</text>
        </svg>
      </div>`;
  }
  el("history").innerHTML = `<div class="wrap band"><h2>How the rate has moved</h2>${body}</div>`;
}

function render() {
  renderPills();
  if (!state.quotes.length) return;
  const list = ranked();
  renderHero(list);
  renderInsights(list);
  renderTable(list);
}

// ---------- Reacting to the visitor ----------

async function chooseCurrency(code) {
  state.currency = CURRENCIES.find(c => c.code === code);
  state.showAll = false;
  renderPills();
  try {
    const [quotes, history] = await Promise.all([loadQuotes(code), loadHistory(code)]);
    if (state.currency.code !== code) return;   // the visitor already tapped another currency
    state.quotes = quotes;
    state.history = history;
    render();
    renderHistory();
  } catch (error) {
    el("bestLine").textContent = "Could not load quotes just now. Please refresh in a minute.";
    console.error(error);
  }
}

el("amount").addEventListener("input", render);
window.addEventListener("resize", fitPayout);

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

chooseCurrency(CURRENCIES[0].code);
