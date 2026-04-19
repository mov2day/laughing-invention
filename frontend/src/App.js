import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from "react-router-dom";
import "@/App.css";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import PopupPreview from "@/pages/PopupPreview";
import SettingsModal from "@/components/SettingsModal";

function TopNav() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0A0A0A]/70 border-b border-zinc-800/80">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="nav-brand">
            <span className="inline-block w-7 h-7 rounded bg-gradient-to-br from-white to-zinc-400 relative"
                  style={{ boxShadow: "inset 0 0 0 1px #27272A" }}>
              <span className="absolute inset-[5px] border border-[#0A0A0A] rounded-sm" />
            </span>
            <span className="font-display font-bold text-lg tracking-tight">TestCapture AI</span>
            <span className="font-mono text-[10px] text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5 ml-1">BETA</span>
          </Link>
          <nav className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em]">
            <NavLink to="/" end className={({ isActive }) => `px-3 py-2 rounded ${isActive ? "text-white" : "text-zinc-500 hover:text-white"}`} data-testid="nav-home">Overview</NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => `px-3 py-2 rounded ${isActive ? "text-white" : "text-zinc-500 hover:text-white"}`} data-testid="nav-dashboard">Dashboard</NavLink>
            <NavLink to="/popup" className={({ isActive }) => `px-3 py-2 rounded ${isActive ? "text-white" : "text-zinc-500 hover:text-white"}`} data-testid="nav-popup">Popup</NavLink>
            <button onClick={() => setSettingsOpen(true)} className="px-3 py-2 rounded text-zinc-500 hover:text-white" data-testid="nav-settings">Settings</button>
            <a href="/testcapture-extension.zip" download className="btn btn-primary btn-sm ml-3" data-testid="nav-download">
              ⬇ Download Extension
            </a>
          </nav>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 flex flex-col min-h-0">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/popup" element={<PopupPreview />} />
        </Routes>
      </main>
      <footer className="border-t border-zinc-800 py-6 mt-0">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between text-[11px] font-mono text-zinc-500 uppercase tracking-[0.14em]">
          <span>© {new Date().getFullYear()} TESTCAPTURE AI</span>
          <span>MV3 · LOCAL-FIRST · AI-ASSISTED</span>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </SettingsProvider>
  );
}

export default App;
