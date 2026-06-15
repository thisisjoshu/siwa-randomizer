"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadNames, saveNames } from "../lib/store";

// NOTE: this is a light client-side gate, not real security — anyone who really
// wants in can read the bundle. It only stops casual/viewer edits, which is all
// this internal tool needs. Override the default via NEXT_PUBLIC_ADMIN_PASSWORD.
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "siwa-admin";
const AUTH_KEY = "siwa.admin.authed";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Hydrate auth state from sessionStorage after mount (can't read it during
    // render without a server/client mismatch).
    const init = () => {
      setAuthed(window.sessionStorage.getItem(AUTH_KEY) === "1");
      setReady(true);
    };
    init();
  }, []);

  const onAuthed = useCallback(() => {
    window.sessionStorage.setItem(AUTH_KEY, "1");
    setAuthed(true);
  }, []);

  if (!ready) return <div className="min-h-screen bg-brand-darker" />;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-brand-darker via-brand-dark to-brand px-4 py-12 text-white sm:px-6">
      {/* Background glow on its own fixed layer so it doesn't clip (and break
          position: sticky on) the content below. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-0 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/3"
          style={{
            background:
              "radial-gradient(closest-side, rgba(0,168,230,0.22), transparent 70%)",
          }}
        />
      </div>
      <Link
        href="/"
        className="eyebrow absolute right-4 top-4 z-20 text-[10px] text-white/45 transition hover:text-brand-light sm:right-6 sm:top-6 sm:text-xs"
      >
        Spinner →
      </Link>
      <div className="relative z-10">
        {authed ? <NameEditor /> : <PasswordGate onAuthed={onAuthed} />}
      </div>
    </div>
  );
}

function PasswordGate({ onAuthed }: { onAuthed: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value === ADMIN_PASSWORD) {
      onAuthed();
    } else {
      setError(true);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-cyan/15 text-2xl ring-1 ring-brand-cyan/40">
        💧
      </span>
      <p className="eyebrow mt-5 text-[11px] text-brand-light sm:text-xs">
        Solomon Water
      </p>
      <h1 className="font-display mt-2 text-4xl uppercase sm:text-5xl">Admin</h1>
      <form onSubmit={submit} className="mt-8 w-full">
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Password"
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-lg tracking-widest text-white placeholder-white/30 outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30"
        />
        {error && (
          <p className="mt-3 text-sm font-semibold text-red-300">
            Incorrect password
          </p>
        )}
        <button
          type="submit"
          className="mt-5 w-full rounded-full bg-white px-8 py-3 text-base font-bold uppercase tracking-[0.2em] text-brand-darker shadow-[0_15px_45px_-12px_rgba(0,168,230,0.7)] ring-1 ring-white/40 transition hover:scale-[1.02]"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

function NameEditor() {
  const [draft, setDraft] = useState<string[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("[]");
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [bulk, setBulk] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const scrollListToBottom = useRef(false);

  // Load the stored list from the server on mount.
  useEffect(() => {
    let active = true;
    loadNames().then((stored) => {
      if (!active) return;
      setDraft(stored);
      setSavedSnapshot(JSON.stringify(stored));
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // After adding name(s), scroll to the bottom so the newest rows are visible.
  useEffect(() => {
    if (scrollListToBottom.current) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      scrollListToBottom.current = false;
    }
  }, [draft]);

  const validCount = useMemo(
    () => draft.filter((n) => n.trim().length > 0).length,
    [draft],
  );
  const dirty = JSON.stringify(draft) !== savedSnapshot;

  const updateRow = (index: number, value: string) =>
    setDraft((d) => d.map((n, i) => (i === index ? value : n)));

  const removeRow = (index: number) =>
    setDraft((d) => d.filter((_, i) => i !== index));

  const addNamed = () => {
    const value = newName.trim();
    if (!value) return;
    scrollListToBottom.current = true;
    setDraft((d) => [...d, value]);
    setNewName("");
  };

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const cleaned = await saveNames(draft);
      setDraft(cleaned);
      setSavedSnapshot(JSON.stringify(cleaned));
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = (mode: "append" | "replace") => {
    const lines = bulk.split(/\r?\n/);
    if (mode === "append") scrollListToBottom.current = true;
    setDraft((d) => (mode === "replace" ? lines : [...d, ...lines]));
    setBulk("");
  };

  const clearAll = () => setDraft([]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-cyan/15 text-xl ring-1 ring-brand-cyan/40">
          💧
        </span>
        <div>
          <p className="eyebrow text-[10px] text-brand-light sm:text-xs">
            Solomon Water
          </p>
          <h1 className="font-display text-3xl uppercase leading-none sm:text-4xl">
            Manage Names
          </h1>
        </div>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_minmax(340px,400px)] lg:items-start">
        {/* LEFT: plain list of names — flows down the page, page scrolls */}
        <section>
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="eyebrow text-xs text-white/70">Names</h2>
            <span className="rounded-full bg-brand-cyan/15 px-3 py-1 text-xs font-bold text-brand-light ring-1 ring-brand-cyan/30">
              {validCount} in draw
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {draft.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/50">
                No names yet. Add one on the right or paste a list.
              </p>
            )}
            {draft.map((name, i) => (
              <div key={i} className="group flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-white/35">
                  {i + 1}
                </span>
                <input
                  value={name}
                  onChange={(e) => updateRow(i, e.target.value)}
                  placeholder="Name"
                  className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30"
                />
                <button
                  onClick={() => removeRow(i)}
                  aria-label={`Remove ${name || "name"}`}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-2.5 text-sm font-bold text-white/50 transition hover:border-red-400 hover:bg-red-400/10 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT: data-entry panel, fixed while the list scrolls */}
        <div className="space-y-5 lg:sticky lg:top-6">
          {/* Quick add */}
          <section className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur sm:p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-white/70">
              Add a name
            </h2>
            <p className="mt-4 text-xs text-white/50">
              Press Enter to add. The field stays ready for the next name.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNamed();
              }}
              className="mt-3 flex gap-2"
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Type a name…"
                className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30"
              />
              <button
                type="submit"
                disabled={newName.trim().length === 0}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-[0.15em] text-brand-darker transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                Add
              </button>
            </form>
          </section>

          {/* Bulk paste */}
          <details open className="group rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur sm:p-6">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-bold uppercase tracking-[0.15em] text-white/70 marker:content-none">
              <span>Bulk paste</span>
              <span className="text-brand-light transition group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-4 text-xs text-white/50">
              Paste a list with one name per line (e.g. a column copied from
              Excel or Sheets).
            </p>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={6}
              placeholder={"Jane Doe\nJohn Smith\n…"}
              className="mt-3 w-full resize-y rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => applyBulk("append")}
                disabled={bulk.trim().length === 0}
                className="rounded-full bg-white px-5 py-2 text-xs font-bold uppercase tracking-widest text-brand-darker transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Append
              </button>
              <button
                onClick={() => applyBulk("replace")}
                disabled={bulk.trim().length === 0}
                className="rounded-full border border-white/30 px-5 py-2 text-xs font-bold uppercase tracking-[0.15em] text-white transition hover:border-brand-cyan disabled:cursor-not-allowed disabled:opacity-50"
              >
                Replace all
              </button>
            </div>
          </details>

          {/* Utilities */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={clearAll}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-white/70 transition hover:border-red-400 hover:text-red-300"
            >
              Clear all
            </button>
          </div>

          {/* Save */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-brand-darker/90 px-5 py-3.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-brand-cyan/10 backdrop-blur">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {saveError ? (
                <span className="text-red-300">⚠ Save failed, try again</span>
              ) : saving ? (
                <span className="text-white/70">Saving…</span>
              ) : justSaved ? (
                <span className="text-brand-light">✓ Saved</span>
              ) : !loaded ? (
                <span className="text-white/50">Loading…</span>
              ) : dirty ? (
                <span className="flex items-center gap-2 text-amber-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                  Unsaved
                </span>
              ) : (
                <span className="text-white/50">All saved</span>
              )}
            </span>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-full bg-white px-8 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-brand-darker shadow-[0_10px_30px_-8px_rgba(0,168,230,0.7)] ring-1 ring-white/40 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
