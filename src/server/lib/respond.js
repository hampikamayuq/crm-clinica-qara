// Helpers de resposta padronizada: { data, error }.

export function sendData(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ data, error: null }));
}

export function sendError(res, message, code = "bad_request", status = 400) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ data: null, error: { message, code } }));
}

// Le e faz parse do corpo JSON da request (limite simples de tamanho).
export function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    const type = String(req.headers["content-type"] || "").toLowerCase();
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000);
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      if (type.includes("csv") || type.includes("text/plain")) return resolve(raw);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}
