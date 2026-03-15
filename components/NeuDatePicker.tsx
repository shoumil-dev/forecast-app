"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

interface NeuDatePickerProps {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

export default function NeuDatePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
}: NeuDatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatted = value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px" }}>
        {label}
      </p>
      <button
        className="neu-btn"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "12px 16px",
          textAlign: "left",
          fontSize: "14px",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "var(--text-primary)",
        }}
      >
        <span style={{ fontSize: "16px" }}>📅</span>
        {formatted}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            left: 0,
            zIndex: 100,
            background: "var(--bg)",
            borderRadius: "16px",
            boxShadow: "var(--neu-card)",
            padding: "16px",
          }}
        >
          <DayPicker
            mode="single"
            selected={value}
            onSelect={(day) => {
              if (day) {
                onChange(day);
                setOpen(false);
              }
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            defaultMonth={value}
          />
        </div>
      )}
    </div>
  );
}
