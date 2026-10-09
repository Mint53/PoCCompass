"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, errorMessage, type ModeDefinition, type Project, type ProjectItems } from "@/lib/api/client";
import { useToast } from "../../components/ui/ToastProvider";
import { useApp } from "../../contexts/AppContext";

type ProjectState = {
  project: Project;
  items: ProjectItems;
  mode: ModeDefinition;
  isOwner: boolean;
  /** Editors, the owner and admins may change things; viewers are read-only (SPEC 9). */
  canEdit: boolean;
  /** bumps after every evaluation / item change so the dashboard refetches */
  version: number;
  evaluating: boolean;
  reloadProject: () => Promise<void>;
  reloadItems: () => Promise<void>;
  evaluate: () => Promise<void>;
  bump: () => void;
};

const Ctx = createContext<ProjectState | null>(null);

export function useProject(): ProjectState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject must be used within ProjectProvider");
  return v;
}

export function useProjectLoader(id: string) {
  const { me, modeOf } = useApp();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<ProjectItems | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const [evaluating, setEvaluating] = useState(false);

  const reloadProject = useCallback(async () => setProject(await api.getProject(id)), [id]);
  const reloadItems = useCallback(async () => {
    setItems(await api.listItems(id));
    setVersion((v) => v + 1);
  }, [id]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, it] = await Promise.all([api.getProject(id), api.listItems(id)]);
      setProject(p);
      setItems(it);
    } catch (e) {
      setError({ message: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluate = useCallback(async () => {
    setEvaluating(true);
    try {
      const ev = await api.evaluate(id);
      const fresh = ev.task_results.filter((r) => !r.reused).length;
      toast({
        tone: "success",
        title: "AI 評価が完了しました",
        message:
          ev.task_results.length === 0
            ? "評価するタスクがありません。タスクを登録してから実行してください。"
            : `${ev.task_results.length} 件を評価しました（新たに判定 ${fresh} 件、変更なしで前回結果を再利用 ${ev.task_results.length - fresh} 件）。`,
      });
      await reloadProject();
      setVersion((v) => v + 1);
    } catch (e) {
      toast({ tone: "error", title: "AI 評価に失敗しました", message: errorMessage(e) });
    } finally {
      setEvaluating(false);
    }
  }, [id, reloadProject, toast]);

  const value = useMemo<ProjectState | null>(() => {
    if (!project || !items) return null;
    return {
      project,
      items,
      mode: modeOf(project.mode),
      isOwner: me.is_admin || project.owner_email === me.email,
      canEdit: me.is_admin || project.members.includes(me.email),
      version,
      evaluating,
      reloadProject,
      reloadItems,
      evaluate,
      bump: () => setVersion((v) => v + 1),
    };
  }, [project, items, modeOf, me, version, evaluating, reloadProject, reloadItems, evaluate]);

  return { value, error, retry: load };
}

export function ProjectProvider({ value, children }: { value: ProjectState; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
