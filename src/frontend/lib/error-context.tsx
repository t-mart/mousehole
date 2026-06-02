import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
} from "react";

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
    setErrors((previous) => [...previous, { id, message }]);
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
