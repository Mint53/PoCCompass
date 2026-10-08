"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Mode, type ModeDefinition, type UserContext } from "@/lib/api/client";
import { ErrorState, LoadingState } from "../components/ui/States";

/**
 * Loads the signed-in user and the mode definitions once. Every label shown on screen
 * (仮説 / 前提・想定ニーズ / 原因仮説 ...) must come from `modeOf(mode).labels` — never hard-code them.
 */
type AppState = {
  me: UserContext;
  modes: ModeDefinition[];
  modeOf: (mode: Mode) => ModeDefinition;
  reloadModes: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<UserContext | null>(null);
  const [modes, setModes] = useState<ModeDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, m] = await Promise.all([api.me(), api.listModes()]);
      setMe(u);
      setModes(m);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<AppState | null>(() => {
    if (!me || !modes) return null;
    const byId = new Map(modes.map((m) => [m.id, m]));
    return {
      me,
      modes,
      modeOf: (mode: Mode) => byId.get(mode) ?? modes[0],
      reloadModes: async () => setModes(await api.listModes()),
    };
  }, [me, modes]);

  if (error) {
    return (
      <div className="container-like py-10">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!value) return <LoadingState title="PoC Compass を準備しています" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
