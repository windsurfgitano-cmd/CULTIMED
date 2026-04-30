import { redirect } from "next/navigation";

export default function OrderRedirect({ params }: { params: { id: string } }) {
  // Reuse the rich /checkout/[id] page for order detail
  redirect(`/checkout/${params.id}`);
}
