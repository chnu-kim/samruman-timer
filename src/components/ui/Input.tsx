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
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            // 데스크톱은 Button md와 같은 40px, 터치 기기에서는 44px
            "h-10 pointer-coarse:min-h-11 border rounded-control px-3 bg-background text-foreground",
            "transition-colors",
            error ? "border-red-500" : "border-border-input",
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
        )}
      </div>
    );
  },
);
