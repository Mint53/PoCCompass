"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, type Compass, type CompassTask } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Button from "../../../components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/ToastProvider";
import CompassChart, { stateAt } from "../components/CompassChart";
import { useProject } from "../ProjectContext";

const PLAY_INTERVAL_MS = 1500;

/** "2026-10-08" -> "10/8" */
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** SPEC §13: the screen only draws what GET /compass returns. */
export default function CompassPage() {
  const { project, mode, version, bump } = useProject();
  const { toast } = useToast();
  const lb = mode.labels;
  const cl = mode.card_labels;
  const [data, setData] = useState<Compass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await api.compass(project.id);
      setData(c);
      setFrame(c.frames.length - 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const last = data ? data.frames.length - 1 : 0;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setFrame((f) => {
        if (f >= last) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, last]);

  const selected = data?.tasks.find((t) => t.task_id === selectedId) ?? null;
  const isCurrent = frame === last;

  const next = useMemo(() => {
    if (!data) return null;
    const score = (t: CompassTask) => t.points[last]?.score ?? 101;
    return data.tasks.filter((t) => t.needs_attention && !t.feedback).sort((a, b) => score(a) - score(b))[0] ?? null;
  }, [data, last]);

  const feedback = useCallback(
    async (task: CompassTask, judgement: "agree" | "dismiss") => {
      setSending(true);
      try {
        await api.addFeedback(project.id, task.task_id, judgement);
        toast({
          tone: "success",
          message: judgement === "dismiss" ? "この指摘を除外しました。タスクの内容が変わると再び判定されます。" : "指摘のとおりと記録しました。",
        });
        setSelectedId(null);
        bump();
      } catch (e) {
        toast({ tone: "error", message: errorMessage(e) });
      } finally {
        setSending(false);
      }
    },
    [project.id, toast, bump],
  );

  const canAct = !!selected && isCurrent && selected.needs_attention && !selected.feedback;
  useEffect(() => {
    if (!canAct || !selected) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || sending) return;
      if (e.key === "a" || e.key === "A") void feedback(selected, "agree");
      if (e.key === "s" || e.key === "S") void feedback(selected, "dismiss");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAct, selected, sending, feedback]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;
  if (data.tasks.length === 0) {
    return <EmptyState title={`${lb.task}がまだ登録されていません`} description={`${lb.task}を登録して「AI で評価」を実行すると、${lb.goal}との近さがここに並びます。`} />;
  }

  const count = isCurrent ? data.attention_count : data.tasks.filter((t) => stateAt(t, frame, last) === "bad").length;
  const f = data.frames[frame];
  const pick = (id: string) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="grid gap-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 flex-col" aria-label="羅針盤">
          <div className="shrink-0">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl" aria-live="polite">
              {count > 0 ? (
                <>
                  <span className="text-rose-500">{count} 件</span>が、{lb.goal}から
                  <br />
                  ズレています
                </>
              ) : (
                <>
                  {lb.goal}から、
                  <br />
                  ぶれていません
                </>
              )}
            </h2>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-slate-500">
              <span>
                健全度 <b className="text-lg tabular-nums text-slate-900">{f.health_score ?? "—"}</b> / 100
              </span>
              {isCurrent && data.delta_vs_last_month != null && (
                <span>
                  先月より {data.delta_vs_last_month >= 0 ? "▲" : "▼"}
                  {Math.abs(data.delta_vs_last_month)}
                </span>
              )}
              {!isCurrent && <span>{shortDate(f.date)} 時点の評価</span>}
            </p>
          </div>

          <div className="min-h-[18rem] flex-1">
            <CompassChart compass={data} frame={frame} selectedId={selectedId} onSelect={pick} goalLabel={lb.goal} assumptionLabel={lb.assumption} />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (playing) return setPlaying(false);
                setFrame(0);
                setPlaying(true);
              }}
              disabled={data.frames.length < 2}
              aria-label={playing ? "再生を停止" : "推移を再生"}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-40"
            >
              {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            </button>
            <div className="relative mx-6 h-12 flex-1">
              <span className="absolute inset-x-0 top-[19px] h-0.5 bg-slate-200" aria-hidden="true" />
              {data.frames.map((fr, i) => (
                <button
                  key={`${fr.date}-${i}`}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setFrame(i);
                  }}
                  aria-label={`${fr.is_current ? "現在" : shortDate(fr.date)} の状態を見る`}
                  aria-pressed={i === frame}
                  className={cn(
                    "absolute top-0 h-12 -translate-x-1/2 rounded-md px-2 text-center text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    i === frame ? "font-bold text-slate-900" : "text-slate-500",
                  )}
                  style={{ left: data.frames.length === 1 ? "50%" : `${(i / (data.frames.length - 1)) * 100}%` }}
                >
                  <i className={cn("mx-auto mb-1 mt-3.5 block h-3 w-3 rounded-full border-2 transition-transform", i === frame ? "scale-125 border-primary bg-primary" : "border-slate-300 bg-white")} />
                  {fr.is_current ? "現在" : shortDate(fr.date)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[22rem] flex-col rounded-3xl bg-white p-6 shadow-[0_24px_48px_-24px_rgb(15_23_42/0.22)] ring-1 ring-slate-100 lg:min-h-0 lg:self-center" aria-live="polite">
          {selected ? (
            <TaskCard
              task={selected}
              frame={frame}
              last={last}
              sectorText={data.sectors.find((s) => s.id === selected.sector_id)?.text}
              labels={{ goal: lb.goal, assumption: lb.assumption, drift: cl.drift, unnecessary: cl.unnecessary }}
              canAct={canAct}
              sending={sending}
              onFeedback={(j) => void feedback(selected, j)}
              onClose={() => setSelectedId(null)}
            />
          ) : !isCurrent ? (
            <div className="m-auto text-center text-sm text-slate-600">
              <p className="text-base font-bold text-slate-900">{shortDate(f.date)} 時点を表示中</p>
              <p className="mt-1">過去の評価です。判断の操作は「現在」で行えます。</p>
              <Button className="mt-4" variant="outline" onClick={() => setFrame(last)}>
                現在に戻る
              </Button>
            </div>
          ) : next ? (
            <>
              <p className="text-sm font-bold text-rose-500">次に見ること</p>
              <h3 className="mb-3 mt-1 text-xl font-bold leading-snug text-slate-900">{next.title}</h3>
              <p className="text-sm text-slate-600">{next.reason || "AI の指摘と提案を確認できます。"}</p>
              <Button variant="dark" className="mt-auto h-12 w-full" onClick={() => setSelectedId(next.task_id)}>
                確認する
              </Button>
            </>
          ) : (
            <div className="m-auto text-center text-sm text-slate-600">
              <p className="text-base font-bold text-slate-900">{data.attention_count > 0 ? "指摘はすべて確認済みです" : "判断待ちはありません"}</p>
              <p className="mt-1">気になる点は、点をクリックして詳しく見られます。</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  frame,
  last,
  sectorText,
  labels,
  canAct,
  sending,
  onFeedback,
  onClose,
}: {
  task: CompassTask;
  frame: number;
  last: number;
  sectorText?: string;
  labels: { goal: string; assumption: string; drift: string; unnecessary: string };
  canAct: boolean;
  sending: boolean;
  onFeedback: (j: "agree" | "dismiss") => void;
  onClose: () => void;
}) {
  const pt = task.points[frame];
  const state = stateAt(task, frame, last);
  const verdictLabel = pt?.verdict === "drift" ? labels.drift : labels.unnecessary;
  const isCurrent = frame === last;
  const tag =
    state === "none"
      ? "未評価（内容を変更した場合は再評価待ち）"
      : state === "bad"
        ? verdictLabel
        : task.feedback === "dismiss" && isCurrent
          ? "除外済み"
          : `${labels.goal}に合っています`;
  return (
    <>
      <p className={cn("text-sm font-bold", state === "bad" ? "text-rose-500" : state === "ok" ? "text-primary" : "text-slate-500")}>{tag}</p>
      <h3 className="mb-1 mt-1 text-xl font-bold leading-snug text-slate-900">{task.title}</h3>
      {sectorText && (
        <p className="mb-3 text-xs text-slate-500">
          {labels.assumption}: {sectorText}
        </p>
      )}
      <div className="mt-2 flex items-baseline gap-2">
        <b className="text-4xl leading-none tabular-nums text-slate-900">{pt?.score ?? "—"}</b>
        <span className="text-xs text-slate-500">{labels.goal}との近さ（100 が最も近い）</span>
      </div>
      <div className="mb-4 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={cn("h-full rounded-full transition-[width]", state === "bad" ? "bg-rose-500" : "bg-indigo-400")} style={{ width: `${pt?.score ?? 0}%` }} />
      </div>
      {isCurrent && task.reason && <p className="text-sm text-slate-700">{task.reason}</p>}
      {isCurrent && state === "bad" && task.suggested_action && (
        <div className="mt-3 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          <p className="text-xs text-slate-500">AI の提案</p>
          {task.suggested_action}
        </div>
      )}
      {!isCurrent && <p className="text-sm text-slate-500">過去の時点の評価です。</p>}
      {isCurrent && task.feedback === "agree" && <p className="mt-3 text-sm font-bold text-primary">✓ 指摘のとおりと記録済み</p>}
      <div className="mt-auto flex gap-2 pt-5">
        {canAct ? (
          <>
            <Button variant="dark" className="h-11 flex-1" disabled={sending} onClick={() => onFeedback("agree")} title="指摘のとおり。記録だけ残す（A）">
              指摘のとおり
            </Button>
            <Button variant="outline" className="h-11 flex-1" disabled={sending} onClick={() => onFeedback("dismiss")} title="この指摘は当たらない。件数から除外する（S）">
              当たらない
            </Button>
          </>
        ) : (
          <Button variant="outline" className="h-11 flex-1" onClick={onClose}>
            閉じる
          </Button>
        )}
      </div>
      {canAct && <p className="mt-2 text-center text-xs text-slate-500">キー: A 指摘のとおり ／ S 当たらない。AI は提案のみで、データは変わりません。</p>}
    </>
  );
}
