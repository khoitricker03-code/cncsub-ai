"use client";

import { useCallback, useState } from "react";

type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

export function useUndoRedo<T>(initialValue: T, limit = 20) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialValue,
    future: [],
  });

  const commit = useCallback(
    (next: T | ((current: T) => T)) => {
      setHistory((current) => {
        const nextValue =
          typeof next === "function"
            ? (next as (value: T) => T)(current.present)
            : next;

        return {
          past: [...current.past, current.present].slice(-limit),
          present: nextValue,
          future: [],
        };
      });
    },
    [limit],
  );

  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);

      if (previous === undefined) {
        return current;
      }

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];

      if (next === undefined) {
        return current;
      }

      return {
        past: [...current.past, current.present].slice(-limit),
        present: next,
        future: current.future.slice(1),
      };
    });
  }, [limit]);

  return {
    value: history.present,
    commit,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
