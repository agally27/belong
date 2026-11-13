"use client";

import { useActionState, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "./ui";

export type ActionState = { ok?: boolean; error?: string; message?: string };
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (state.error) {
    return (
      <p role="alert" className={cx("rounded-xl border border-rose-100 bg-rose-100/60 px-4 py-2.5 text-sm text-rose-700", className)}>
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className={cx("rounded-xl border border-sage-200 bg-sage-50 px-4 py-2.5 text-sm text-sage-700", className)}>
        {state.message}
      </p>
    );
  }
  return null;
}

/** A form wired to a server action, showing its error or success message. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  messageClassName,
  ...rest
}: Omit<ComponentProps<"form">, "action"> & { action: FormAction; resetOnSuccess?: boolean; messageClassName?: string }) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} {...rest}>
      {children}
      <FormMessage state={state} className={cx("mt-3", messageClassName)} />
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

/** A single-button form: runs a server action with hidden fields, optionally after confirmation. */
export function ActionButton({
  action,
  fields = {},
  children,
  variant = "outline",
  size = "sm",
  confirm,
  className,
  pendingLabel,
  ariaLabel,
}: {
  action: FormAction;
  fields?: Record<string, string>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
  className?: string;
  pendingLabel?: string;
  ariaLabel?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} className={className} pendingLabel={pendingLabel} aria-label={ariaLabel}>
        {children}
      </SubmitButton>
      {state.error && (
        <span role="alert" className="max-w-xs text-xs text-rose-700">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** A switch that submits its form immediately when toggled. */
export function AutoSwitch({ action, fields, checked, label }: { action: FormAction; fields: Record<string, string>; checked: boolean; label: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [on, setOn] = useState(checked);
  useEffect(() => setOn(checked), [checked]);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={formAction} className="flex flex-col items-end gap-1">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="value" value={on ? "true" : "false"} />
      <input
        type="checkbox"
        role="switch"
        className="switch"
        aria-label={label}
        checked={on}
        disabled={pending}
        onChange={(e) => {
          setOn(e.target.checked);
          // Wait for the hidden input to update before submitting.
          setTimeout(() => ref.current?.requestSubmit(), 0);
        }}
      />
      {state.error && (
        <span role="alert" className="max-w-[14rem] text-right text-xs text-rose-700">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Collapsible panel (used for "add" and "edit" forms). */
export function Disclosure({ summary, children, className, defaultOpen }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cx("group", className)} open={defaultOpen}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">{summary}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
