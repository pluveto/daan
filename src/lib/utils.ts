import { clsx, type ClassValue } from 'clsx';
import { atomWithStorage } from 'jotai/utils';
import { twMerge } from 'tailwind-merge';

// Type guard to check if a value is serializable to JSON
function isJsonable(
  value: unknown,
): value is string | number | boolean | null | object | [] {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

// Custom atomWithStorage that handles potential JSON parsing errors and type safety
export function atomWithSafeStorage<Value>(
  key: string,
  initialValue: Value,
  storage?: Storage | undefined,
  options?:
    | {
        getOnInit?: boolean;
      }
    | undefined,
) {
  return atomWithStorage<Value>(
    key,
    initialValue,
    {
      getItem: (key, initialValue) => {
        const storedValue = (storage ?? localStorage).getItem(key);
        if (storedValue === null) {
          return initialValue;
        }
        try {
          return JSON.parse(storedValue) as Value;
        } catch (error) {
          console.error(`Error parsing localStorage key "${key}":`, error);
          return initialValue; // Fallback to initial value if parsing fails
        }
      },
      removeItem: (key) => {
        (storage ?? localStorage).removeItem(key);
      },
      setItem: (key, newValue) => {
        if (isJsonable(newValue)) {
          (storage ?? localStorage).setItem(key, JSON.stringify(newValue));
        } else {
          console.error(
            `Attempted to store non-serializable value for key "${key}":`,
            newValue,
          );
          // Optionally, store a representation or throw an error
          // For now, we just prevent storing it to avoid breaking localStorage
        }
      },
      subscribe: (key, callback, initialValue) => {
        if (
          typeof window === 'undefined' ||
          window.addEventListener === undefined
        ) {
          return () => {}; // Return no-op function when not in browser env
        }
        const listener = (e: StorageEvent) => {
          if (e.storageArea === (storage ?? localStorage) && e.key === key) {
            let newValue: Value;
            try {
              newValue =
                e.newValue === null
                  ? initialValue
                  : (JSON.parse(e.newValue) as Value);
            } catch (error) {
              console.error(
                `Error parsing storage event for key "${key}":`,
                error,
              );
              newValue = initialValue; // Fallback on error
            }
            callback(newValue);
          }
        };
        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
      },
    },
    options,
  );
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeMath(text: string): string {
  let processedText = text;
  processedText = processedText.replace(/\\\((.*?)\\\)/g, '$$$1$$');
  processedText = processedText.replace(/\\\[(.*?)\\\]/gs, '$$$$$1$$$$');

  return processedText;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
