import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, className, id: externalId, ...props }, ref) {
    const generatedId = useId();
    const id = externalId ?? generatedId;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "border rounded-lg px-3 py-2 bg-background text-foreground",
            "outline-none focus:ring-2 focus:ring-foreground/20 transition-colors",
            error ? "border-red-500" : "border-foreground/20",
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  },
);
