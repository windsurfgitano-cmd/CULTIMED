import { redirect } from "next/navigation";

// La página de consulta/agendamiento fue retirada: Cultimed no agenda horas médicas.
// Redirigimos cualquier acceso (links viejos, indexación de Google) al registro.
export default function ConsultaRedirect() {
  redirect("/registro");
}
