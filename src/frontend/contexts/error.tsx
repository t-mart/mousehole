import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
} from "react";

const MAX_ERRORS = 5;

// Not crypto.randomUUID(): that exists only in secure contexts (HTTPS or
// localhost), and Mousehole's common deployment is plain HTTP on a LAN
// address — there, randomUUID is undefined and adding an error would throw,
// silently eating the banner. The id only needs to key a React list.
let nextErrorId = 0;

type AppError = { id: string; message: string; count: number };

type ErrorContextValue = {
  addError: (message: string) => void;
  clearErrors: () => void;
  dismissError: (id: string) => void;
  errors: AppError[];
};

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export function ErrorProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [errors, setErrors] = useState<AppError[]>([]);

  const addError = useCallback((message: string) => {
    const id = String(nextErrorId++);
    setErrors((previous) => {
      // A repeat of an existing message bumps its count instead of stacking
      // an identical banner.
      const existing = previous.find((error) => error.message === message);
      if (existing) {
        return previous.map((error) =>
          error.id === existing.id
            ? { ...error, count: error.count + 1 }
            : error,
        );
      }
      const next = [...previous, { id, message, count: 1 }];
      if (next.length > MAX_ERRORS) next.shift();
      return next;
    });
    console.error(message);
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors((previous) => previous.filter((error) => error.id !== id));
  }, []);

  // A banner describes a past action's failure; once a subsequent action
  // succeeds, those failures are stale noise. Mutations call this onSuccess.
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return (
    <ErrorContext value={{ addError, clearErrors, dismissError, errors }}>
      {children}
    </ErrorContext>
  );
}

export function useErrors(): ErrorContextValue {
  const context = use(ErrorContext);
  if (!context) throw new Error("useErrors must be used within ErrorProvider");
  return context;
}
