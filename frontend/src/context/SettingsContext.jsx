import React, { createContext, useContext, useEffect, useState } from "react";

const SettingsContext = createContext(null);

const DEFAULT = {
  apiKey: "",
  model: "claude-sonnet-4-5-20250929",
  provider: "anthropic",
  framework: "playwright",
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("tc_web_settings");
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    localStorage.setItem("tc_web_settings", JSON.stringify(settings));
  }, [settings]);

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <SettingsContext.Provider value={{ settings, setSettings: update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
