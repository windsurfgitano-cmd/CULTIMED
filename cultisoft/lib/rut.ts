// Chilean RUT (Rol Único Tributario) utilities

export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

function computeDV(num: number): string {
  let m = 0;
  let s = 1;
  let n = num;
  while (n > 0) {
    s = (s + (n % 10) * (9 - (m++ % 6))) % 11;
    n = Math.floor(n / 10);
  }
  return s ? String(s - 1) : "K";
}

export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const num = parseInt(body, 10);
  if (Number.isNaN(num)) return false;
  return computeDV(num) === dv;
}

export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  // Add thousand separators
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}-${dv}`;
}

export function generateRut(): string {
  const num = Math.floor(Math.random() * 20_000_000) + 5_000_000;
  return `${num}-${computeDV(num)}`;
}
