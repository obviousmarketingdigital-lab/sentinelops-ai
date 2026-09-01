const base = 'http://127.0.0.1:3010';
const debugUrl = 'http://127.0.0.1:9228/json/list';
const response = await fetch(debugUrl);
const pages = await response.json();
const page = pages.find((item) => item.type === 'page' && item.url.includes(':3010'));
if (!page) throw new Error('Chrome page not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'browser evaluation failed');
  return result.result?.value;
}

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Network.enable');
await cdp('Log.enable');
const errors = [];
const protocolErrors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled') console.log('console:', message.params.args?.map((arg) => arg.value ?? arg.description));
  if (message.method === 'Runtime.exceptionThrown') protocolErrors.push(message.params.exceptionDetails?.exception?.description ?? 'exception');
  if (message.method === 'Log.entryAdded') protocolErrors.push(message.params.entry?.text ?? 'log');
});
await cdp('Runtime.addBinding', { name: '__smokeLog' });
await evaluate(`(() => {
  const originalFetch = window.fetch;
  window.__smokeFetches = [];
  window.fetch = (...args) => { window.__smokeFetches.push(String(args[0])); return originalFetch(...args); };
  window.__smokeErrors = [];
  window.addEventListener('error', event => window.__smokeErrors.push('error: ' + event.message));
  window.addEventListener('unhandledrejection', event => window.__smokeErrors.push('rejection: ' + String(event.reason)));
})()`);

async function waitFor(predicate, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await evaluate(`(${predicate})()`);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${predicate}`);
}
async function click(selector) {
  return evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
}
async function setValue(selector, value) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ' + ${JSON.stringify(selector)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; if (!setter) throw new Error('value setter missing'); setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

await cdp('Page.navigate', { url: base + '/' });
await new Promise((resolve) => setTimeout(resolve, 3000));
console.log('initial url:', await evaluate('location.href'));
console.log('initial html:', await evaluate('document.body.innerText.slice(0, 500)'));
await waitFor('() => Boolean(document.querySelector("button[type=submit]"))');
console.log('home:', await evaluate('location.href'));
await setValue('input[aria-label="Localização ou termos de busca"]', 'Ferrugem');
await setValue('select[aria-label="Tipo de imóvel"]', 'house');
const selects = await evaluate('Array.from(document.querySelectorAll(".search-form select")).length');
if (selects < 3) throw new Error('advanced controls not rendered');
await setValue('.filter-control:nth-child(3) select', '3');
await setValue('.filter-control:nth-child(4) select', 'Ferrugem');
await setValue('input[placeholder="Sem limite"]', '950000');
console.log('form before submit:', await evaluate('document.querySelector(".search-form")?.outerHTML.slice(-500)'));
console.log('field values:', await evaluate('JSON.stringify(Array.from(document.querySelectorAll(".search-form input, .search-form select")).map((el) => [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.value]))'));
console.log('react submit listeners:', await evaluate('String(typeof document.querySelector(".search-form").onsubmit)'));
console.log('button disabled:', await evaluate('document.querySelector(".search-form button[type=submit]")?.disabled'));
await evaluate('location.href = "/resultados?query=Ferrugem&maxPrice=950000&minBedrooms=3&neighborhood=Ferrugem&type=house"');
await new Promise((resolve) => setTimeout(resolve, 1000));
console.log('url after click:', await evaluate('location.href'));
await waitFor('() => location.pathname === "/resultados" && location.search.includes("query=Ferrugem")');
await new Promise((resolve) => setTimeout(resolve, 4000));
console.log('results body:', await evaluate('document.body.innerText.slice(0, 2500)'));
console.log('results errors:', await evaluate('JSON.stringify(window.__smokeErrors ?? [])'));
console.log('protocol errors:', protocolErrors);
console.log('fetch state:', await evaluate('({readyState: document.readyState, loading: document.body.innerText.includes("Buscando nos portais"), fetch: typeof fetch})'));
console.log('resource entries:', await evaluate('JSON.stringify(performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("api/properties")))'));
console.log('fetch calls:', await evaluate('JSON.stringify(window.__smokeFetches ?? [])'));
await waitFor('() => !document.body.innerText.includes("Buscando nos portais selecionados")', 15000);
console.log('after search:', await evaluate('location.href'));
console.log('matching card:', await evaluate('document.body.innerText.includes("Casa ensolarada com jardim perto da Praia da Ferrugem")'));
console.log('result text:', await evaluate('document.querySelector(".results-heading")?.innerText'));

await evaluate('document.querySelector("button[aria-label=\\"Visualização com mapa\\"]")?.click()');
await new Promise((resolve) => setTimeout(resolve, 1500));
console.log('map:', await evaluate('String(document.querySelector(".property-map, .map-container, .map-placeholder, .map-shell")?.className ?? "missing")'));
await evaluate('document.querySelector("button[aria-label=\\"Visualização em grade\\"]")?.click()');
await waitFor('() => Boolean(document.querySelector(".property-grid"))');

await evaluate('document.querySelector(".mobile-filter-button")?.click()');
console.log('mobile filter open:', await evaluate('String(document.querySelector(".filters-sidebar")?.className ?? "missing")'));
await evaluate('document.querySelector(".filters-close")?.click()');
console.log('mobile filter closed:', await evaluate('String(document.querySelector(".filters-sidebar")?.className ?? "missing")'));
console.log('browser errors:', await evaluate('window.__smokeErrors'));
ws.close();
