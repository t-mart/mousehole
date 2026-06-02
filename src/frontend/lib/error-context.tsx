import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
} from "react";

const MAX_ERRORS = 5;

type AppError = { id: string; message: string };

type ErrorContextValue = {
  addError: (message: string) => void;
  dismissError: (id: string) => void;
  errors: AppError[];
};

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export function ErrorProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [errors, setErrors] = useState<AppError[]>([]);

  const addError = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setErrors((previous) => {
      const next = [...previous, { id, message }];
      if (next.length > MAX_ERRORS) next.shift();
      return next;
    });
    console.error(message);
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors((previous) => previous.filter((error) => error.id !== id));
  }, []);

  return (
    <ErrorContext value={{ addError, dismissError, errors }}>
      {children}
    </ErrorContext>
  );
}

export function useErrors(): ErrorContextValue {
  const context = use(ErrorContext);
  if (!context) throw new Error("useErrors must be used within ErrorProvider");
  return context;
}
