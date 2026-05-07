import * as http from "node:http";
import { URL } from "node:url";
import { PlannerClient } from "./caldav.js";

const PORT = Number(process.env.OWNLOOM_PLANNER_PORT ?? "8082");
const LISTEN = process.env.OWNLOOM_PLANNER_LISTEN ?? "127.0.0.1";

const client = new PlannerClient();

function htmlPage(itemsHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ownloom Planner</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#111;color:#eee;margin:0}
h1{margin:0;padding:12px 16px;background:#1a1a2e;border-bottom:1px solid #333;font-size:1.1rem}.sub{color:#aaa;font-size:.8rem;padding:8px 16px}
table{width:100%;border-collapse:collapse}td,th{padding:10px 14px;text-align:left}
th{background:#222;color:#888;font-weight:500;font-size:.7rem;text-transform:uppercase}
tr{border-bottom:1px solid #222}
tr.done td{color:#555;text-decoration:line-through}
.date{color:#999;font-size:.8rem;width:120px}
.kind{text-transform:uppercase;font-size:.6rem;letter-spacing:.05em;font-weight:600;color:#0bf;width:60px}
form{margin:0}xmp{display:none}
a{color:#0bf;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head><body>
  <h1>ownloom Planner</h1>
  <div class="sub">${new Date().toLocaleString("en-RO", { timeZone: "Europe/Bucharest" })}</div>
  <table><thead><tr><th class="kind">Kind</th><th class="date">When</th><th>Title</th><th>Categories</th></tr></thead><tbody>
  ${itemsHtml}
  </tbody></table>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rowHtml(item: Awaited<ReturnType<PlannerClient["list"]>>[number]): string {
  const cls = item.status === "done" ? "done" : "";
  const when = item.alarmAt ?? item.due ?? item.start ?? "";
  const cats = item.categories.filter((c) => c !== "reminder").join(", ");
  return `<tr class="${cls}"><td class="kind">${escapeHtml(item.kind)}</td><td class="date">${escapeHtml(when)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(cats)}</td></tr>`;
}

async function handleApi(requestUrl: URL, response: http.ServerResponse): Promise<void> {
  const view = requestUrl.searchParams.get("view") ?? "all";
  if (view !== "all" && view !== "today" && view !== "upcoming" && view !== "overdue") {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Invalid view" }));
    return;
  }
  const items = await client.list(view);
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(items, null, 2));
}

async function handleDone(requestUrl: URL, response: http.ServerResponse): Promise<void> {
  const uid = requestUrl.searchParams.get("uid");
  if (!uid) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Missing uid" }));
    return;
  }
  try {
    const item = await client.done(uid);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(item));
  } catch (error: any) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error?.message ?? String(error) }));
  }
}

export function startServer(): http.Server {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (requestUrl.pathname === "/api/items" && request.method === "GET") {
        await handleApi(requestUrl, response);
      } else if (requestUrl.pathname === "/api/done" && request.method === "POST") {
        await handleDone(requestUrl, response);
      } else {
        const items = await client.list("all");
        const html = htmlPage(items.map(rowHtml).join(""));
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
      }
    } catch (error: any) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(String(error));
    }
  });
  server.listen(PORT, LISTEN, () => {
    console.error(`ownloom planner web view at http://${LISTEN}:${PORT}/`);
  });
  return server;
}

if (import.meta.url.endsWith(process.argv[1] ?? "")) startServer();
