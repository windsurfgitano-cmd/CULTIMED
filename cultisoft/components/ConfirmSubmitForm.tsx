"use client";

export default function ConfirmSubmitForm({
  action,
  confirmMessage,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  confirmMessage: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}