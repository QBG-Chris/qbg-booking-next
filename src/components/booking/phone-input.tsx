"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/booking";

export function PhoneInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  function update(raw: string, position: number) {
    const formatted = formatPhone(raw);
    // Keep edits beside the same digit when formatting adds or removes punctuation.
    const digitsBeforeCaret = raw.slice(0, position).replace(/\D/g, "").length;
    let nextPosition = 0;
    let digits = 0;
    while (nextPosition < formatted.length && digits < digitsBeforeCaret) {
      if (/\d/.test(formatted[nextPosition])) digits++;
      nextPosition++;
    }
    caret.current = position === raw.length ? formatted.length : nextPosition;
    onChange(formatted);
  }

  return (
    <Input
      {...props}
      ref={input}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={(event) => {
        update(event.target.value, event.target.selectionStart ?? event.target.value.length);
      }}
      onKeyDown={(event) => {
        const { selectionStart, selectionEnd } = event.currentTarget;
        if (
          selectionStart === null ||
          selectionStart !== selectionEnd ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (event.key !== "Backspace" && event.key !== "Delete")
        )
          return;
        const backwards = event.key === "Backspace";
        let index = backwards ? selectionStart - 1 : selectionStart;
        if (!/[\s()-]/.test(value[index] ?? "")) return;
        // Deleting a separator removes the adjacent digit instead of getting stuck on the mask.
        while (index >= 0 && index < value.length && /[\s()-]/.test(value[index])) {
          index += backwards ? -1 : 1;
        }
        if (index >= 0 && index < value.length) {
          event.preventDefault();
          update(value.slice(0, index) + value.slice(index + 1), index);
        }
      }}
    />
  );
}
