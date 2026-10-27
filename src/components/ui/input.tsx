import * as React from "react";

import { cn } from "@/lib/utils";
import { numericDraft } from "@/lib/numeric";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const numeric = type === "number";
    const display = (v: typeof props.value) =>
      v == null || v === 0 ? "" : (numericDraft(String(v)) ?? "");
    const [draft, setDraft] = React.useState(() => display(props.value));
    const editing = React.useRef(false);
    const lastValue = React.useRef(props.value);
    React.useEffect(() => {
      if (!editing.current && lastValue.current !== props.value) setDraft(display(props.value));
      lastValue.current = props.value;
    }, [props.value]);
    return (
      <input
        type={numeric ? "text" : type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        {...(numeric
          ? {
              inputMode: "numeric" as const,
              pattern: "[0-9]*",
              placeholder: props.placeholder ?? "Enter number",
              value: draft,
              onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
                editing.current = true;
                e.currentTarget.select();
                props.onFocus?.(e);
              },
              onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                editing.current = false;
                props.onBlur?.(e);
              },
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const next = numericDraft(e.target.value);
                if (next === null) return;
                setDraft(next);
                e.target.value = next;
                props.onChange?.(e);
              },
            }
          : {})}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
