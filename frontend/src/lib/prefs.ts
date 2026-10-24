"use client";

/** Lightweight UI preferences (academic-year filter, sidebar state). */
import { useEffect, useState } from "react";

const YEAR_KEY = "aops_academic_year";
const YEAR_EVENT = "aops:academic-year";

export const ACADEMIC_YEARS = ["2024-25", "2025-26", "2026-27"];

export function getAcademicYear(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(YEAR_KEY) ?? "";
}

export function setAcademicYear(year: string) {
  if (typeof window === "undefined") return;
  if (year) localStorage.setItem(YEAR_KEY, year);
  else localStorage.removeItem(YEAR_KEY);
  window.dispatchEvent(new Event(YEAR_EVENT));
}

/** "" means "all years". */
export function useAcademicYear(): [string, (y: string) => void] {
  const [year, setYearState] = useState("");
  useEffect(() => {
    setYearState(getAcademicYear());
    const onChange = () => setYearState(getAcademicYear());
    window.addEventListener(YEAR_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(YEAR_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return [year, setAcademicYear];
}
