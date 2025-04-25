// src/components/ui/ValidatedInput.tsx
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import React, { useCallback, useEffect, useState } from 'react';
import { LuRotateCcw, LuSave } from 'react-icons/lu'; // Using RotateCcw for revert/cancel

interface ValidatedInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur'> {
  id: string;
  label: string;
  initialValue: string | number | null | undefined; // Value from the atom
  // Receives the final, parsed value after validation passes
  onSave: (value: any) => void;
  // Returns an error message string if invalid, null otherwise
  validate?: (value: string) => string | null;
  // Optional: Parses the validated string before calling onSave
  parse?: (value: string) => any;
  // Optional: Provide specific input type if needed (e.g., "password", "number")
  type?: string;
  inputClassName?: string;
  containerClassName?: string;
  optional?: boolean; // If true, empty input is considered valid (after potential parsing)
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  id,
  label,
  initialValue,
  onSave,
  validate,
  parse,
  type = 'text',
  placeholder,
  inputClassName,
  containerClassName,
  optional = false,
  ...props
}) => {
  const stringInitialValue =
    initialValue === null || initialValue === undefined
      ? ''
      : String(initialValue);
  const [currentValue, setCurrentValue] = useState<string>(stringInitialValue);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false); // Track if user has typed

  // Update local state if the initialValue prop changes from outside
  // (e.g., after a successful save re-renders the parent)
  useEffect(() => {
    const newStringInitialValue =
      initialValue === null || initialValue === undefined
        ? ''
        : String(initialValue);
    // Only update if the component isn't 'dirty' or if the new initial value is different
    if (!isDirty || newStringInitialValue !== currentValue) {
      setCurrentValue(newStringInitialValue);
      setError(null);
      setIsDirty(false);
    }
  }, [initialValue]); // Rerun effect when initialValue changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentValue(e.target.value);
    setIsDirty(true);
    // Clear error message as soon as user starts typing again
    if (error) {
      setError(null);
    }
  };

  const handleSave = useCallback(() => {
    let valueToValidate = currentValue.trim();
    let validationError: string | null = null;

    // Run validation if provided
    if (validate) {
      validationError = validate(valueToValidate);
    }

    // Additional check for non-optional fields
    if (!optional && !valueToValidate && !validationError) {
      validationError = 'This field is required.';
    }

    if (validationError) {
      setError(validationError);
    } else {
      setError(null);
      // Parse the value if a parser function is provided
      const finalValue = parse ? parse(valueToValidate) : valueToValidate;
      onSave(finalValue);
      setIsDirty(false); // Mark as clean after successful save
    }
  }, [currentValue, validate, parse, onSave, optional]);

  const handleRevert = () => {
    setCurrentValue(stringInitialValue);
    setError(null);
    setIsDirty(false);
  };

  const hasChanged = currentValue !== stringInitialValue;

  return (
    <div className={`space-y-1 ${containerClassName ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center space-x-2">
        <Input
          id={id}
          type={type}
          value={currentValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`${inputClassName ?? ''} ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          {...props} // Pass down other props like step, min, max
        />
        {/* Show Revert button only if changed */}
        {hasChanged && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-muted/80 h-9 w-9 flex-shrink-0"
            onClick={handleRevert}
            aria-label={`Revert ${label}`}
          >
            <LuRotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant={hasChanged ? 'default' : 'outline'}
          size="icon"
          className={`h-9 w-9 flex-shrink-0`}
          onClick={handleSave}
          disabled={!hasChanged} // Disable if value hasn't changed
          aria-label={`Save ${label}`}
        >
          <LuSave className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
};
