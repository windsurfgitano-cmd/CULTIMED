export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function computeDV(num: number): string {
  let m = 0, s = 1, n = num;
  while (n > 0) { s = (s + (n % 10) * (9 - (m++ % 6))) % 11; n = Math.floor(n / 10); }
  return s ? String(s - 1) : "K";
}

export function isValidRut(rut: string): boolean {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  const num = parseInt(body, 10);
  if (Number.isNaN(num)) return false;
  return computeDV(num) === dv;
}

export function formatRut(rut: string): string {
  const c = cleanRut(rut);
  if (c.length < 2) return rut;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
