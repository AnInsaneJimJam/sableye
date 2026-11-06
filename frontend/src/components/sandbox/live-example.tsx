"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type Values = Record<string, string | number>;
type ExampleContext = {
  values: Values;
  setValues: Dispatch<SetStateAction<Values>>;
};
const Context = createContext<ExampleContext | null>(null);

/** Share demo fields with the code preview, scoped to a single product visit. */
export function LiveExample({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Values>({});
  return (
    <Context.Provider value={{ values, setValues }}>
      {children}
    </Context.Provider>
  );
}

/** An editable demo field and its code preview use the same state. */
export function useDemoField<T extends string | number>(
  name: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  const [local, setLocal] = useState(initial);
  if (!context) return [local, setLocal];
  return [
    (context.values[name] ?? initial) as T,
    (next) =>
      context.setValues((previous) => ({
        ...previous,
        [name]:
          typeof next === "function"
            ? next((previous[name] ?? initial) as T)
            : next,
      })),
  ];
}

/** Publish resolved demo data, such as the current signed subscription plan. */
export function useDemoCodeValues(values: Values) {
  const context = useContext(Context);
  const setValues = context?.setValues;
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!setValues) return;
    const incoming = JSON.parse(serialized) as Values;
    setValues((previous) =>
      Object.entries(incoming).every(([key, value]) => previous[key] === value)
        ? previous
        : { ...previous, ...incoming },
    );
  }, [serialized, setValues]);
}

/** Current fields for building a copyable example without querying the page DOM. */
export function useDemoValues() {
  return useContext(Context)?.values ?? {};
}
