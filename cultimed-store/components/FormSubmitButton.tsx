"use client";

import { useFormStatus } from "react-dom";

export default function FormSubmitButton({
  children,
  pendingLabel,
  className = "btn-brass",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed${pending ? " animate-pulse" : ""}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}