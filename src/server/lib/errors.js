// Erros tipados para o roteador mapear status HTTP.

export function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400;
  e.code = "bad_request";
  return e;
}

export function notFound(message) {
  const e = new Error(message);
  e.statusCode = 404;
  e.code = "not_found";
  return e;
}
