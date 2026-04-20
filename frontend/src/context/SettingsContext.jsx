import React, { createContext, useContext, useEffect, useState } from "react";
import { getSettings, setSettings as writeAISettings } from "@/lib/ai";

const SettingsContext = createContext(null);

const DEFAULT = {
  provider: "offline",
  model: null,
  apiKey: "",       // Anthropic
  openaiKey: "",    // OpenAI
  framework: "playwright",
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT, ...getSettings() }));

  useEffect(() => { writeAISettings(settings); }, [settings]);

  const update = (patchOrReplace) => {
    if (typeof patchOrReplace === "function") setSettings(patchOrReplace);
    else setSettings((s) => ({ ...s, ...patchOrReplace }));
  };

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
