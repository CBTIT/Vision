import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { fetchOverviewDateBounds } from "@/lib/api";
import { useDateRange, type Preset } from "./date-range-context";

export function DateRangeFilter() {
  const {
    from,
    to,
    activePreset,
    applyPreset,
    setRange,
    setFrom,
    setTo,
    clearPreset,
  } = useDateRange();
  const [fromOpen, setFromOpen] = React.useState(false);
  const [toOpen, setToOpen] = React.useState(false);
  const [allTimeLoading, setAllTimeLoading] = React.useState(false);

  function parseYmdToLocalDate(ymd: string): Date | null {
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  async function handlePresetClick(preset: Preset) {
    if (preset !== "allTime") {
      applyPreset(preset);
      return;
    }

    setAllTimeLoading(true);
    try {
      const bounds = await fetchOverviewDateBounds();
      const fromDate = parseYmdToLocalDate(bounds.from);
      const toDate = parseYmdToLocalDate(bounds.to);
      if (!fromDate || !toDate) return;
      setRange(fromDate, toDate, "allTime");
    } finally {
      setAllTimeLoading(false);
    }
  }

  function handleFromSelect(date: Date | undefined) {
    if (!date) return;
    setFrom(date);
    clearPreset();
    setFromOpen(false);
  }

  function handleToSelect(date: Date | undefined) {
    if (!date) return;
    setTo(date);
    clearPreset();
    setToOpen(false);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "last7Days", label: "Last 7 Days" },
    { key: "last30Days", label: "Last 30 Days" },
    { key: "allTime", label: "All Time" },
  ];

  return (
    <div className="flex items-center gap-2">
      {/* Preset buttons */}
      <div className="flex items-center gap-1">
        {presets.map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={activePreset === key ? "default" : "outline"}
            onClick={() => void handlePresetClick(key)}
            disabled={allTimeLoading && key === "allTime"}
            className="text-xs h-8 px-3"
          >
            {label}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1 self-center!" />

      {/* From date picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium select-none">
          From
        </span>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 text-xs font-normal gap-1.5 min-w-27.5",
                !from && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              {from ? format(from, "dd MMM yyyy") : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={from}
              onSelect={handleFromSelect}
              defaultMonth={from}
              captionLayout="dropdown"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* To date picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium select-none">
          To
        </span>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 text-xs font-normal gap-1.5 min-w-27.5",
                !to && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              {to ? format(to, "dd MMM yyyy") : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={to}
              onSelect={handleToSelect}
              defaultMonth={to}
              captionLayout="dropdown"
              disabled={(date) => date < from}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
