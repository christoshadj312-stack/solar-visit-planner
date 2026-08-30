import { el as dateFnsEl, enUS } from "date-fns/locale";
import { useMemo } from "react";
import { useAppSettings } from "../hooks/useAppSettings.js";
import { el } from "./el.js";
import { en } from "./en.js";

const DICTIONARIES = { en, el };

export function useTranslation() {
  const { settings } = useAppSettings();
  const language = settings.language === "en" ? "en" : "el";
  const dictionary = DICTIONARIES[language] || DICTIONARIES.el;

  return useMemo(
    () => ({
      language,
      isGreek: language === "el",
      locale: language === "el" ? dateFnsEl : enUS,
      t: (key, params) => translate(dictionary, key, params),
      raw: (key) => getValue(dictionary, key)
    }),
    [dictionary, language]
  );
}

export function translate(dictionary, key, params = {}) {
  const value = getValue(dictionary, key);

  if (typeof value !== "string") {
    return key;
  }

  return value.replace(/{{\s*(\w+)\s*}}/g, (_, paramKey) => {
    const replacement = params[paramKey];
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
}

function getValue(dictionary, key) {
  return String(key)
    .split(".")
    .reduce((current, part) => (current && current[part] !== undefined ? current[part] : undefined), dictionary);
}
