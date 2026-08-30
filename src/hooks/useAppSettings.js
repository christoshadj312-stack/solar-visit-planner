import { useEffect, useState } from "react";

export const SETTINGS_STORAGE_KEY = "solarvisitPhotovoltaics.settings.v1";
const LEGACY_SETTINGS_STORAGE_KEY = ["pv", "Vi", "sit", "Planner.settings.v1"].join("");

export const DEFAULT_APP_SETTINGS = {
  language: "el",
  theme: "light",
  notifications: false,
  holidayCalendar: "cyprus",
  customHolidays: []
};


const SETTINGS_EVENT = "solarvisit-photovoltaics-settings";

export function useAppSettings() {
  const [settings, setSettingsState] = useState(readAppSettings);

  useEffect(() => {
    function handleSettingsChange(event) {
      setSettingsState(event.detail || readAppSettings());
    }

    function handleStorageChange(event) {
      if (event.key === SETTINGS_STORAGE_KEY || event.key === LEGACY_SETTINGS_STORAGE_KEY) {
        setSettingsState(readAppSettings());
      }
    }

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.lang = settings.language === "el" ? "el" : "en";
  }, [settings.language, settings.theme]);

  function updateSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function setSettings(updater) {
    const current = readAppSettings();
    const nextSettings = typeof updater === "function" ? updater(current) : updater;
    saveAppSettings(nextSettings);
    setSettingsState(nextSettings);
  }

  return { settings, updateSetting, setSettings };
}

export function readAppSettings() {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY) || localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
  if (!stored) return DEFAULT_APP_SETTINGS;

  try {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...JSON.parse(stored)
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
}
