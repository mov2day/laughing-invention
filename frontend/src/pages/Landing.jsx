import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, MousePointerClick, Code2, Shield, FileCode2, Zap, Eye, Download, GitBranch, ShieldCheck } from "lucide-react";

const frameworks = [
  { name: "Playwright", color: "#45BA4B" },
  { name: "Cypress", color: "#17202C" },
  { name: "Selenium", color: "#43B02A" },
  { name: "Karate", color: "#0A7CFF" },
];

const features = [
  { icon: MousePointerClick, title: "Frictionless recording", body: "Click the toolbar icon, hit Record, then use the app like a human. No code. No setup." },
  { icon: ShieldCheck, title: "Granular assertion control", body: "Three ways to assert — Shift+Click for a quick containsText, Assert Mode for every click, or Pick Mode to open an in-page picker where you choose the type, expected value, and selector strategy for each assertion." },
  { icon: Code2, title: "4 frameworks, one click", body: "Playwright, Cypress, Selenium, and Karate — regenerate the whole script by switching tabs. AI prompts are tuned per-framework for idiomatic output." },
  { icon: Eye, title: "Selector transparency", body: "Every step shows the full selector tree — data-testid → aria → role+text → CSS → XPath — with a stability score. Override any step, any time." },
  { icon: Shield, title: "Password redaction", body: "Input values in type=password fields are replaced with ******** before anything leaves your browser. Your credentials never touch the model." },
  { icon: Zap, title: "Local-first by default", body: "All sessions live in chrome.storage.local. No forced cloud sync. Use your own Anthropic key, or point at your self-hosted proxy." },
];

const comparison = [
  { feature: "Runs as browser extension", us: true, selenium: false, playwright: false, cypress: false },
  { feature: "Dual-mode: popup + full-tab dashboard", us: true, selenium: false, playwright: false, cypress: false },
  { feature: "AI script generation (4 frameworks)", us: true, selenium: false, playwright: "partial", cypress: false },
  { feature: "Shift+Click assertions", us: true, selenium: false, playwright: false, cypress: false },
  { feature: "Local-first, no cloud required", us: true, selenium: true, playwright: true, cypress: true },
  { feature: "Multi-priority selector scoring", us: true, selenium: false, playwright: "partial", cypress: false },
  { feature: "Exports to your repo, no vendor runner", us: true, selenium: true, playwright: true, cypress: true },
];

export default function Landing() {
  return (
    <div className="flex-1">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 grid-bg opacity-60"
          style={{ maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 80%)" }}
        />
        <div className="absolute inset-0 gradient-fade-bottom pointer-events-none" />
        <div className="max-w-[1400px] mx-auto px-6 pt-20 pb-24 relative">
          <div className="flex items-center gap-3 mb-8">
            <span className="inline-flex items-center gap-2 border border-zinc-800 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              MV3 · Chrome · Edge · Safari
            </span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-display font-black tracking-tighter text-5xl sm:text-6xl lg:text-7xl leading-[0.95]"
            data-testid="hero-headline"
          >
            Record what you do.<br/>
            <span className="text-zinc-500">Ship what it would cost</span><br/>
            <span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">an engineer a week to build.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-8 max-w-2xl text-zinc-400 text-lg leading-relaxed"
          >
            TestCapture AI is a Chrome extension that watches you click through a web app — then hands you a clean,
            reviewed Playwright, Cypress, Selenium, or Karate script. Local-first. No SaaS lock-in. Your code, your repo.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <a href="/testcapture-extension.zip" download className="btn btn-primary" data-testid="hero-install-btn">
              <Download size={14} /> Install Extension
            </a>
            <Link to="/dashboard" className="btn" data-testid="hero-demo-btn">
              <Play size={14} /> Try the live demo
            </Link>
            <Link to="/popup" className="btn btn-ghost" data-testid="hero-popup-btn">
              Peek the popup →
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-14 flex items-center gap-8 text-zinc-500"
          >
            <span className="micro">COMPATIBLE WITH</span>
            <div className="h-px flex-1 bg-zinc-800" />
            {frameworks.map((f) => (
              <span key={f.name} className="font-display font-semibold tracking-tight text-zinc-300">{f.name}</span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* DUAL-MODE ARCHITECTURE */}
      <section className="border-t border-zinc-800">
        <div className="max-w-[1400px] mx-auto px-6 py-20">
          <div className="mb-14 max-w-3xl">
            <span className="micro text-zinc-500">THE ARCHITECTURE</span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter mt-3">Two surfaces. One engine.</h2>
            <p className="text-zinc-400 text-lg leading-relaxed mt-5">
              The <span className="text-white">Popup</span> is for the 90% case — record, stop, copy the script, move on.
              The <span className="text-white">Dashboard</span> is for when you need to review the selector tree, edit a step,
              or swap frameworks and regenerate. Both share the same recording engine and session store.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 rounded">
            <div className="bg-[#0A0A0A] p-8">
              <div className="micro text-zinc-500 mb-6">MODE A — POPUP</div>
              <div className="font-display font-bold text-2xl tracking-tight mb-2">380 × 560 px</div>
              <p className="text-zinc-400 leading-relaxed mb-6">For quick recording runs. Live step counter, timer, one framework selector, copy/export in a single click.</p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex gap-3"><span className="step-dot click mt-1.5"/>Record / Pause / Stop</li>
                <li className="flex gap-3"><span className="step-dot type mt-1.5"/>Live step + timer</li>
                <li className="flex gap-3"><span className="step-dot navigate mt-1.5"/>Framework dropdown</li>
                <li className="flex gap-3"><span className="step-dot validate mt-1.5"/>Copy / Export / Dashboard →</li>
              </ul>
              <Link to="/popup" className="btn btn-sm mt-8">Preview popup</Link>
            </div>

            <div className="bg-[#0A0A0A] p-8 relative">
              <div className="micro text-zinc-500 mb-6">MODE B — FULL-TAB DASHBOARD</div>
              <div className="font-display font-bold text-2xl tracking-tight mb-2">Control-room layout</div>
              <p className="text-zinc-400 leading-relaxed mb-6">For deep review. Scrollable Action Timeline, syntax-highlighted Code Editor, Element Inspector with a ranked selector ladder.</p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex gap-3"><span className="step-dot click mt-1.5"/>Action Timeline with step cards</li>
                <li className="flex gap-3"><span className="step-dot validate mt-1.5"/>Code Editor · 4 framework tabs</li>
                <li className="flex gap-3"><span className="step-dot type mt-1.5"/>Element Inspector · selector stability</li>
                <li className="flex gap-3"><span className="step-dot navigate mt-1.5"/>Session history sidebar</li>
              </ul>
              <Link to="/dashboard" className="btn btn-sm btn-primary mt-8">Try interactive demo →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section className="border-t border-zinc-800">
        <div className="max-w-[1400px] mx-auto px-6 py-20">
          <div className="mb-14 max-w-3xl">
            <span className="micro text-zinc-500">THE CAPABILITIES</span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter mt-3">Built for engineers who write their own tests.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                  className="tracing-border border border-zinc-800 rounded bg-[#0F0F0F] p-7 hover:border-zinc-600 transition-colors"
                  data-testid={`feature-${i}`}
                >
                  <Icon size={20} className="text-zinc-400 mb-5" />
                  <div className="font-display font-semibold text-xl tracking-tight mb-2">{f.title}</div>
                  <p className="text-zinc-400 text-sm leading-relaxed">{f.body}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FRAMEWORK COMPARISON */}
      <section className="border-t border-zinc-800">
        <div className="max-w-[1400px] mx-auto px-6 py-20">
          <div className="mb-10 max-w-3xl">
            <span className="micro text-zinc-500">HOW IT STACKS UP</span>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter mt-3">Versus writing tests by hand.</h2>
          </div>
          <div className="overflow-x-auto border border-zinc-800 rounded">
            <table className="w-full text-sm" data-testid="comparison-table">
              <thead className="bg-[#0F0F0F] font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                <tr>
                  <th className="text-left p-4 font-normal border-b border-zinc-800">Capability</th>
                  <th className="text-center p-4 font-normal border-b border-zinc-800 text-white">TestCapture AI</th>
                  <th className="text-center p-4 font-normal border-b border-zinc-800">Selenium IDE</th>
                  <th className="text-center p-4 font-normal border-b border-zinc-800">Playwright codegen</th>
                  <th className="text-center p-4 font-normal border-b border-zinc-800">Cypress Studio</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                {comparison.map((row, idx) => (
                  <tr key={row.feature} className={idx % 2 ? "bg-[#0C0C0C]" : ""}>
                    <td className="p-4 text-zinc-300 border-b border-zinc-900">{row.feature}</td>
                    <Cell v={row.us} />
                    <Cell v={row.selenium} />
                    <Cell v={row.playwright} />
                    <Cell v={row.cypress} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800">
        <div className="max-w-[1400px] mx-auto px-6 py-24 text-center">
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter">
            Your first automated test.<br/>
            <span className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">Twelve clicks from now.</span>
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto mt-6 leading-relaxed">
            Install the unpacked extension, open any web app, and press Record. We'll take it from there.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <a href="/testcapture-extension.zip" download className="btn btn-primary" data-testid="cta-install-btn">
              <Download size={14} /> Download extension.zip
            </a>
            <Link to="/dashboard" className="btn" data-testid="cta-demo-btn">
              Explore the dashboard →
            </Link>
          </div>
          <div className="mt-12 max-w-xl mx-auto text-left border border-zinc-800 rounded p-5 bg-[#0F0F0F]">
            <div className="micro text-zinc-500 mb-3">3-STEP INSTALL</div>
            <ol className="font-mono text-[12px] text-zinc-300 leading-relaxed space-y-2">
              <li><span className="text-zinc-500">01</span>  Unzip the downloaded folder.</li>
              <li><span className="text-zinc-500">02</span>  Open <span className="text-white">chrome://extensions</span> → toggle <span className="text-white">Developer mode</span>.</li>
              <li><span className="text-zinc-500">03</span>  Click <span className="text-white">Load unpacked</span> → select the extension folder. Done.</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

function Cell({ v }) {
  if (v === true) return <td className="text-center p-4 border-b border-zinc-900 text-emerald-400">✓</td>;
  if (v === "partial") return <td className="text-center p-4 border-b border-zinc-900 text-amber-400">◐</td>;
  return <td className="text-center p-4 border-b border-zinc-900 text-zinc-600">—</td>;
}
