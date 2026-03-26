import React, { createContext, useContext, useState } from "react";
import { startOfDay, subDays } from "date-fns";

export type Preset = "today" | "last7Days" | "last30Days" | "allTime" | null;

interface DateRangeContextValue {
  from: Date;
  to: Date;
  activePreset: Preset;
  applyPreset: (preset: Preset) => void;
  setRange: (from: Date, to: Date, preset?: Preset) => void;
  setFrom: (date: Date) => void;
  setTo: (date: Date) => void;
  clearPreset: () => void;
}

const DateRangeContext = createContext<DateRangeContextValue>(
  {} as DateRangeContextValue,
);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const todayStart = startOfDay(new Date());
  const [from, setFromState] = useState<Date>(subDays(todayStart, 29));
  const [to, setToState] = useState<Date>(todayStart);
  const [activePreset, setActivePreset] = useState<Preset>("last30Days");

  function applyPreset(preset: Preset) {
    const now = new Date();
    const rangeEnd = startOfDay(now);
    if (preset === "today") {
      setFromState(rangeEnd);
      setToState(rangeEnd);
    } else if (preset === "last7Days") {
      setFromState(subDays(rangeEnd, 6));
      setToState(rangeEnd);
    } else if (preset === "last30Days") {
      setFromState(subDays(rangeEnd, 29));
      setToState(rangeEnd);
    }
    setActivePreset(preset);
  }

  function setFrom(date: Date) {
    setFromState(date);
  }

  function setTo(date: Date) {
    setToState(date);
  }

  function setRange(nextFrom: Date, nextTo: Date, preset: Preset = null) {
    setFromState(nextFrom);
    setToState(nextTo);
    setActivePreset(preset);
  }

  function clearPreset() {
    setActivePreset(null);
  }

  return (
    <DateRangeContext.Provider
      value={{
        from,
        to,
        activePreset,
        applyPreset,
        setRange,
        setFrom,
        setTo,
        clearPreset,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  return useContext(DateRangeContext);
}
