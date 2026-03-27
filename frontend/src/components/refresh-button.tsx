import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

const INTERVAL_SECONDS = 60;

interface RefreshButtonProps {
  onRefresh: () => void;
}

export function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const [countdown, setCountdown] = useState(INTERVAL_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCountdown(INTERVAL_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh();
          return INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onRefresh]);

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startInterval]);

  function handleClick() {
    onRefresh();
    startInterval();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="gap-1.5 text-muted-foreground"
    >
      <RotateCw className="size-3.5" />
      <span className="tabular-nums text-xs">{countdown}s</span>
    </Button>
  );
}
