"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Mode } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import Badge from "../components/ui/Badge";
import { useApp } from "../contexts/AppContext";
import { Scene, SceneChat, SceneCompass, SceneDecide, SceneDesign, SceneEvaluate, SceneFlow, SceneMembers, SceneReport, SceneTabs, SceneUsers } from "./Scenes";

type Section = { id: string; title: string; admin?: boolean };

const SECTIONS: Section[] = [
  { id: "overview", title: "PoC Compass でできること" },
  { id: "create", title: "1. 取り組みをつくる" },
  { id: "screens", title: "2. 画面の見かた" },
  { id: "evaluate", title: "3. タスクを登録して AI で評価する" },
  { id: "read", title: "4. ダッシュボードと羅針盤を読む" },
  { id: "decide", title: "5. 指摘に対応する" },
  { id: "report", title: "6. 判断レポートで続行・撤退を決める" },
  { id: "requests", title: "7. 要望・課題を判断する" },
  { id: "process", title: "8. 業務を整理する（AsIs / ToBe）" },
  { id: "members", title: "9. メンバーと権限" },
  { id: "chat", title: "10. AI チャットで追加・修正する" },
  { id: "admin", title: "11. 管理者向け", admin: true },
  { id: "faq", title: "よくある質問" },
];

function Block({ id, title, badge, children, scene }: { id: string; title: string; badge?: ReactNode; children: ReactNode; scene?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-5 card-shadow sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        {badge}
      </div>
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-5", scene ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start" : undefined)}>
        <div className="space-y-3 text-sm leading-7 text-slate-700 [&_b]:font-bold [&_b]:text-slate-900 [&_li]:leading-7 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
        {scene}
      </div>
    </section>
  );
}

function Note({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" }) {
  return (
    <p className={cn("rounded-xl px-3.5 py-2.5 text-[13px] leading-6", tone === "amber" ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-slate-50 text-slate-700 ring-1 ring-slate-200")}>
      {children}
    </p>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm leading-7 text-slate-700">{children}</div>
    </details>
  );
}

const ROLES = [
  { role: "作成者", note: "取り組みを作った人。常に編集者を兼ねる", view: "○", edit: "○", members: "○", del: "○" },
  { role: "編集者", note: "メンバーとして追加された人", view: "○", edit: "○", members: "—", del: "—" },
  { role: "閲覧者", note: "見るだけの人。画面に「閲覧のみ」と出る", view: "○", edit: "—", members: "—", del: "—" },
  { role: "管理者", note: "全体の役割。全ての取り組みを扱える", view: "○", edit: "○", members: "○", del: "○" },
  { role: "全体閲覧者", note: "全体の役割。全ての取り組みを見るだけ", view: "○", edit: "—", members: "—", del: "—" },
];

export default function ManualPage() {
  const { me, modes, modeOf } = useApp();
  const [modeId, setModeId] = useState<Mode>(modes[0].id);
  const [active, setActive] = useState(SECTIONS[0].id);
  const m = modeOf(modeId);
  const l = m.labels;
  const cl = m.card_labels;
  const sections = useMemo(() => SECTIONS, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [sections]);

  return (
    <div className="space-y-5">
      <header className="stagger overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 px-6 py-7 text-white shadow-lg shadow-indigo-500/20 sm:px-8" style={{ "--i": 0 } as React.CSSProperties}>
        <p className="inline-flex items-center gap-2 text-sm font-bold text-indigo-100">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          マニュアル
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">PoC Compass の使いかた</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-indigo-50">
          {l.goal}からズレていないかを AI が見張り、続けるか・直すか・やめるかを人が決めるための道具です。最初に 1〜6 を順に読めば使い始められます。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="用語を表示するモード">
          <span className="text-xs font-semibold text-indigo-100">用語のモード:</span>
          {modes.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={x.id === modeId}
              onClick={() => setModeId(x.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40",
                x.id === modeId ? "bg-white text-primary shadow" : "bg-white/15 text-white hover:bg-white/25",
              )}
            >
              {x.name}
            </button>
          ))}
          <span className="text-xs text-indigo-100">モードによって「{l.assumption}」などの呼び方が変わります。</span>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="min-w-0 lg:sticky lg:top-20 lg:self-start" aria-label="マニュアルの目次">
          <ul className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-slate-200 lg:flex-col lg:overflow-visible lg:p-2">
            {sections.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? "true" : undefined}
                    className={cn(
                      "block whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 lg:whitespace-normal",
                      active === s.id ? "bg-accent text-primary" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <Block id="overview" title="PoC Compass でできること" scene={<Scene caption="目的から出発し、AI が照合し、人が判断する流れ"><SceneFlow l={l} /></Scene>}>
            <p>
              {l.goal}・{l.assumption}・{l.criterion}を先に決めておき、日々の{l.task}がそこからズレていないかを AI が採点します。ズレや{l.deadline}のリスクを早く見つけて、続けるか・軌道修正か・撤退かを<b>人が</b>判断するためのツールです。
            </p>
            <ul>
              <li>AI が行うのは<b>{l.task}の照合・レポート文の作成・{l.task}の抽出・チャットでの提案</b>だけです。</li>
              <li>健全度や件数は AI ではなく、決まった計算式で出します。</li>
              <li>AI がデータを勝手に書き換えることはありません。変更は必ず人が「適用」します。</li>
            </ul>
          </Block>

          <Block id="create" title="1. 取り組みをつくる" scene={<Scene caption="入力した内容が AI の判定の物差しになります"><SceneDesign l={l} /></Scene>}>
            <ol>
              <li>「取り組み一覧」の「新しい取り組み」から、モード（PoC・企画・業務改善）を選びます。</li>
              <li>タイトル・{l.goal}・{l.deadline}を入力します。開始日は省略すると今日になります。</li>
              <li>{l.assumption}と{l.criterion}を <b>それぞれ 1 つ以上</b>入力します（AI の判定に必要です）。</li>
              <li>一緒に使う人を検索して追加し、「作成する」を押します。</li>
            </ol>
            <Note>{l.goal}・{l.assumption}・{l.criterion}は具体的なほど判定が正確になります。あとから「設計」タブでいつでも直せます（直すと、全ての{l.task}が次回の評価で見直されます）。</Note>
          </Block>

          <Block id="screens" title="2. 画面の見かた" scene={<Scene caption="取り組みの上のタブで画面を切り替えます"><SceneTabs l={l} /></Scene>}>
            <ul>
              <li><b>ダッシュボード</b>: 健全度と 4 つの件数、AI からの指摘、{l.deadline}のリスク。</li>
              <li><b>羅針盤</b>: {l.goal}を中心に、{l.task}のズレを位置で見る。時間軸で過去に戻れる。</li>
              <li><b>分析</b>: 判定の内訳・健全度の構成・推移をグラフで見る。</li>
              <li><b>WBS</b>: {l.task}の開始日〜期日を帯で見る。</li>
              <li><b>設計</b>: {l.goal}・{l.assumption}・{l.criterion}を編集する。</li>
              <li><b>要望・課題</b>: 出てきた要望や課題を登録し、対応要・対応不要・未判断を人が判断して理由を残す（→ 7）。</li>
              <li><b>業務整理</b>: AsIs（現状）と ToBe（あるべき姿）の業務を入力して、担当者ごとのレーンのフロー図にする。並べて比較や、図の上での直接編集もできる（→ 8）。</li>
              <li><b>{l.task}</b> / <b>{l.evidence}</b>: 日々の登録と結果の記録。</li>
              <li><b>判断レポート</b>: 続行・軌道修正・撤退の材料と、判断の記録。</li>
              <li><b>設定</b>: メンバー・モード・削除（作成者と管理者のみ）。</li>
            </ul>
            <Note>まず試したいときは、取り組み一覧の「サンプルを作成」で、PoC・企画・業務改善の 3 モード分の記入済みサンプル（設計・{l.task}・{l.evidence}・要望・課題・AsIs/ToBe の業務）を作れます。押すたびに新しく作られます。タイトルは「【サンプル】」で始まり、作成後は設定画面から削除できます。AI の評価は自分で「AI で評価」を押して試します。</Note>
            <Note>ブラウザを全画面にしてズーム 100% にすると、ダッシュボード・羅針盤・分析・WBS・判断レポート・要望・課題・業務整理は 1 画面に収まります。内容が多いときは枠の中だけがスクロールします。</Note>
          </Block>

          <Block id="evaluate" title="3. タスクを登録して AI で評価する" scene={<Scene caption="「AI で評価」を押すと、健全度とズレの件数が出ます"><SceneEvaluate /></Scene>}>
            <ol>
              <li>「{l.task}」タブで 1 件ずつ追加します。開始日と期日を入れると WBS に出ます。</li>
              <li>週報や議事録（最大 8000 字）を貼り付けると、AI が{l.task}の<b>候補</b>を抜き出します。選んで一括登録できます（候補は保存されません）。</li>
              <li>右上の「AI で評価」を押します。<b>数十秒から 1 分ほど</b>かかります。</li>
            </ol>
            <Note>毎朝 6 時にも自動で評価されます。内容が変わっていない{l.task}は再評価せず、前回の結果を使うので速く終わります。「撤退」を記録した取り組みは自動評価の対象外になります。</Note>
          </Block>

          <Block id="read" title="4. ダッシュボードと羅針盤を読む" scene={<Scene caption="羅針盤: 中心が目的、遠い点ほどズレている"><SceneCompass l={l} /></Scene>}>
            <p><b>健全度</b>は 0〜100 の点数で、高いほど良い状態です。次の 4 つを合成して出します（重みはモードごとに違います）。</p>
            <ul>
              <li><b>目的整合</b>: {l.task}が{l.goal}に合っているか。</li>
              <li><b>検証の進み</b>: {l.assumption}の検証と{l.criterion}の達成が進んでいるか。</li>
              <li><b>期限</b>: 期間の経過に対して進捗が遅れていないか。</li>
              <li><b>ムダの少なさ</b>: 目的から外れた{l.task}が少ないか。</li>
            </ul>
            <p>ダッシュボード上段の 4 つの件数は、「{cl.drift}」「{cl.unnecessary}」「{cl.deadline_risk}」「{cl.untested}」です。数字を押すと詳細に移動します。</p>
            <p>羅針盤は、中心が{l.goal}、点が{l.task}です。<b>近いほど{l.goal}に合っています</b>。赤い点は要確認、点線の丸は未評価です。下の時間軸で過去の評価に戻れます。</p>
          </Block>

          <Block id="decide" title="5. 指摘に対応する" scene={<Scene caption="どちらを押しても、データは書き換わりません"><SceneDecide /></Scene>}>
            <p>ダッシュボードの「AI からの指摘」や羅針盤の赤い点から、AI の理由と提案を確認できます。</p>
            <ul>
              <li><b>指摘のとおり</b>: 記録だけ残します（件数はそのまま）。</li>
              <li><b>当たらない（除外）</b>: 件数から外します。{l.task}の内容を変えると、再び判定されます。</li>
            </ul>
            <p>指摘に納得したら、{l.task}を直す・やめる・{l.goal}の側を見直す、のどれかを人が選びます。</p>
          </Block>

          <Block id="report" title="6. 判断レポートで続行・撤退を決める" scene={<Scene caption="材料は AI が並べ、決めるのは人です"><SceneReport l={l} /></Scene>}>
            <ol>
              <li>先に「AI で評価」を実行して、最新の状態にします。</li>
              <li>「判断レポートを作成」を押します（数十秒かかります）。会議の前に作ると便利です。</li>
              <li>{l.decision_continue}・{l.decision_pivot}・{l.decision_stop}それぞれの「支える事実」「懸念」「その判断をとる条件」と、会議で確認すべき問いが出ます。</li>
              <li>決まったら、右の「判断の記録」で判断と理由を残します。</li>
            </ol>
            <Note tone="amber">「{l.decision_stop}」を記録すると、取り組みは「停止」になり、毎朝の自動評価の対象外になります。</Note>
          </Block>

          <Block id="requests" title="7. 要望・課題を判断する">
            <p>現場から出てきた<b>要望</b>（こうしたい）と<b>課題</b>（困っている）を溜めて、「対応するか」を人が決める場所です。{l.goal}との照合は AI ではなく人が行います。健全度・AI 評価・チャットには影響しません。</p>
            <ol>
              <li>「要望・課題」タブの入力欄で、種類（要望／課題）を選び、件名を 1 行入れて <b>Enter</b>。続けて何件でも登録できます。内容・誰からの声か・優先度を入れたいときは「詳しく」を使います。</li>
              <li>登録直後は<b>未判断</b>です。カード右の「対応要」「対応不要」で判断します。</li>
              <li>判断すると理由を書けます（任意）。あとから判断を変えたり、「戻す」で未判断に戻したりできます。</li>
            </ol>
            <ul>
              <li>上の件数タイル（すべて／未判断／対応要／対応不要）は絞り込みを兼ねます。下の帯は判断済みの割合です。</li>
              <li>検索（件名・内容・誰からの声か）、要望／課題での絞り込み、登録順／優先度順の並べ替えができます。一覧が長いときは枠の中だけがスクロールします。</li>
              <li>編集・削除のボタンは、カードにポインタを載せる（キーボードならフォーカスする）と出ます。</li>
            </ul>
          </Block>

          <Block id="process" title="8. 業務を整理する（AsIs / ToBe）">
            <p>現状（<b>AsIs</b>）とあるべき姿（<b>ToBe</b>）の業務の流れを、担当者ごとのレーンに分けたフロー図にして見比べるための画面です。図は入力から自動で描かれ、AI は使いません。</p>
            <p><b>入力する</b></p>
            <ul>
              <li>上のタブで「AsIs」「ToBe」を切り替えます。業務は「業務No・担当者・業務内容」を入れて <b>Enter</b> で追加します（下の入力欄。「詳しく追加」でも入力できます）。</li>
              <li><b>業務No</b> は同じ AsIs／ToBe の中で重複できません（20 字まで）。順番は番号順で、<code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">2</code> の次は <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">10</code> です。間に入れたいときは <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">1.1</code> のように付けます。</li>
              <li><b>担当者</b>は、すでに使われている名前を候補から選べます。担当者ごとに色分けされたレーンができます。</li>
              <li><b>次の業務No</b> は、空なら番号順の次の業務につながります。分岐するときは「4, 5」のように並べます。業務Noを変えたり業務を削除したりすると、他の業務の「次の業務No」も自動でそろいます。</li>
              <li>ToBe が空のときは、「AsIs をコピーして始める」で AsIs を写してから直せます。</li>
            </ul>
            <p><b>図を読む</b></p>
            <ul>
              <li>業務を左から右へ番号順に並べ、矢印でつなぎます。始まりの業務に「開始」、終わりの業務に「終了」が付きます。</li>
              <li><b>点線の矢印は前の業務へ戻る流れ</b>（手戻り）です。存在しない業務Noを指す「次の業務」は、一覧で黄色く表示されます。</li>
              <li>業務（図の箱または一覧の行）をクリックすると、つながる矢印と一覧の行が強調されます。</li>
              <li>図の右上の「<b>拡大</b>」で、画面いっぱいに開きます。20〜400% の拡大縮小（ボタン・ホイール）、ドラッグでの移動、「全体に合わせる」で全体表示に戻せます。Esc で閉じます。</li>
              <li>「<b>並べて比較</b>」では、AsIs と ToBe のフロー図を上下に並べ、業務の数・関わる担当者・手戻りの数の変化を表示します。</li>
            </ul>
            <p><b>図の上で直接直す</b>（編集者のみ。枠内の図も「拡大」の中も同じ操作です）</p>
            <ul>
              <li>業務の箱を<b>ドラッグ</b>: 置いたレーンの担当者に変わります。並びが変わるときは、置いた位置に合う業務Noに付け替わります（1 と 2 の間なら <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">1.1</code>）。</li>
              <li>箱の右端の <b>●</b> から別の業務へドラッグ: 矢印を追加します。</li>
              <li>矢印をクリック: 先端の ○ を別の業務へドラッグしてつなぎ直し、中央の ✕ で削除します。出ていく矢印がゼロになり番号順の次につながってしまう場合は消せません（つなぎ先の付け替えを案内します）。</li>
              <li>箱を<b>ダブルクリック</b>で編集、箱を選んで <b>Delete</b> で削除の確認、レーンの空きをダブルクリックでそのレーンの担当者入りの追加画面が開きます。</li>
              <li>保存中は図を操作できません。保存に失敗したときはメッセージが出て、図は保存済みの内容のままです。</li>
            </ul>
            <Note>閲覧者は図を見るだけです（AsIs／ToBe／並べて比較の切り替え、業務の選択、「拡大」は使えます。ドラッグ・矢印の操作や、追加・編集・削除はできません）。</Note>
          </Block>

          <Block id="members" title="9. メンバーと権限" scene={<Scene caption="名前で検索して、編集者か閲覧者として追加します"><SceneMembers /></Scene>}>
            <p>メンバーは<b>ユーザーマスタから検索して</b>追加します。メールアドレスの手入力はできません。「設定」画面（取り組みの作成時は入力画面）で、検索欄に氏名・部署・メールアドレスの一部を入れ、「編集者」か「閲覧者」のボタンで追加します。役割はあとから切り替えたり、外したりできます。</p>
            <div className="thin-scroll overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[34rem] text-left text-[13px]">
                <caption className="sr-only">役割ごとにできること</caption>
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2">役割</th>
                    <th scope="col" className="px-3 py-2 text-center">見る</th>
                    <th scope="col" className="px-3 py-2 text-center">編集する</th>
                    <th scope="col" className="px-3 py-2 text-center">メンバー・モード変更</th>
                    <th scope="col" className="px-3 py-2 text-center">削除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ROLES.map((r) => (
                    <tr key={r.role}>
                      <th scope="row" className="px-3 py-2 font-bold text-slate-900">
                        {r.role}
                        <span className="block text-[11px] font-normal text-slate-500">{r.note}</span>
                      </th>
                      {[r.view, r.edit, r.members, r.del].map((v, i) => (
                        <td key={i} className={cn("px-3 py-2 text-center font-bold", v === "○" ? "text-emerald-600" : "text-slate-300")}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul>
              <li>上の表の「作成者・編集者・閲覧者」は取り組みごとの役割、「管理者・全体閲覧者」は全体の役割です。全体の役割が「一般」の人は、取り組みごとの役割だけで決まります。</li>
              <li>「編集する」は、項目（{l.task}・{l.evidence}・要望・課題・業務を含む）の追加・変更・削除、要望・課題の判断、業務フロー図の直接編集、AI 評価、判断レポートの作成と判断の記録、{l.task}の抽出、指摘への対応、チャット、設計の変更です。</li>
              <li>閲覧者にも、全てのタブが見えます。ダッシュボード・羅針盤・分析・WBS は編集者と同じ表示で、要望・課題と業務整理は一覧・絞り込み・検索・AsIs/ToBe の切り替え・フロー図の拡大が使えます。追加・編集・削除のボタンは出ません。</li>
              <li>メンバーに入っていない一般ユーザーは、その取り組みを見ることができません（一覧にも出ません）。ただし、作成者が「<b>同じ部署の人に公開する</b>」を ON にした取り組みは、ユーザーマスタの部署が同じ人なら、メンバーでなくても一覧に出て<b>閲覧だけ</b>できます（取り組みの作成画面と設定画面の「部署への公開」。設定画面は作成者・管理者のみ変更できます）。</li>
              <li>管理者と全体閲覧者は、メンバーでなくても全ての取り組みを見られます。この「全体の役割」は、管理者がユーザー管理で人ごとに選びます（下の「11. 管理者向け」）。</li>
              <li>すでにメンバーの人は、ユーザーマスタから削除されてもアクセスできます。</li>
            </ul>
          </Block>

          <Block id="chat" title="10. AI チャットで追加・修正する" scene={<Scene caption="AI は提案するだけ。「適用する」を押すまで反映されません"><SceneChat /></Scene>}>
            <p>右下の「AI に相談」ボタンからチャットを開けます（初回だけ吹き出しのヒントが出ます。✕ で閉じると以後は出ません）（編集者・作成者・管理者のみ。閲覧者には出ません）。ボタンの横の ✕ で画面の右端の細いタブにしまえます（もう一度押すと戻ります。しまった状態はこのブラウザに記憶されます）。取り組みの内容を踏まえて、質問への回答や、追加・修正・削除の<b>提案</b>をしてくれます。</p>
            <ul>
              <li>提案は一覧で表示されます。一部だけ適用することも、破棄することもできます。</li>
              <li>適用したときの権限や入力のチェックは、画面から操作するときと同じです。</li>
              <li>モード・メンバー・判断の記録・取り組みの削除は、チャットからは行えません（設定画面・判断レポート画面で人が行います）。</li>
              <li>会話は取り組みごと・ユーザーごとに別々で、他のメンバーには見えません。</li>
            </ul>
          </Block>

          <Block
            id="admin"
            title="11. 管理者向け"
            badge={<Badge variant="brand">管理者</Badge>}
            scene={<Scene caption="ユーザーを追加すると、メンバー検索に出るようになります"><SceneUsers /></Scene>}
          >
            {!me.is_admin && <Note>この項目は管理者向けです。あなたは管理者ではないため、画面上部のメニューに「ユーザー管理」「モード設定」は表示されません。</Note>}
            <p><b>ユーザー管理</b>（ヘッダーの「ユーザー管理」）</p>
            <ul>
              <li>「ユーザーを追加」で、メールアドレス・氏名・部署・<b>役割</b>を登録します。役割は「管理者」（全てを操作・ユーザー管理とモード設定ができる）／「全体閲覧者」（全ての取り組みを見るだけ）／「一般」（メンバーに入った取り組みと、自分の部署に公開された取り組みだけ）から選びます。一覧の編集ダイアログからいつでも変更できます。</li>
              <li>自分自身の役割は変えられません。<code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">ADMIN_EMAILS</code> に登録された人は管理者に固定され、管理者が 1 人もいなくなる変更・削除はできません。「同じ部署に公開」は部署名が完全に同じ人どうしで判定されるので、部署の表記をそろえてください。</li>
              <li>メールアドレスは登録後に変更できません（変えたいときは削除して追加し直します）。</li>
              <li>検索欄で氏名・部署・メールアドレスを絞り込み、編集・削除ができます。</li>
              <li>マスタに無い人は、取り組みのメンバーに<b>新しく</b>追加できません。メンバーにしたい人は先にここへ登録してください。</li>
              <li>マスタから削除しても、すでにメンバーになっている人のアクセスは変わりません。</li>
              <li>ここへの登録は、サインインできるかどうかには影響しません。</li>
            </ul>
            <p><b>モード設定</b>（ヘッダーの「モード設定」）</p>
            <ul>
              <li>モードごとの用語・入力例・健全度の重み・AI への指針を編集できます。「既定値に戻す」もあります。</li>
              <li>管理者は、ユーザー管理で役割を「管理者」にした人と、<code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">ADMIN_EMAILS</code>（Azure の設定。最初の管理者の保険で、画面からは外せません）に登録された人です。管理者は全ての取り組みを見て編集できます。</li>
            </ul>
          </Block>

          <Block id="faq" title="よくある質問">
            <div className="space-y-2">
              <Faq q="「AI で評価」や編集のボタンが出ません。">
                <p>あなたがその取り組みの<b>閲覧者</b>になっている可能性があります（画面上部に「閲覧のみ」と出ます）。編集が必要なときは、作成者に「編集者に変更してください」と依頼してください。</p>
              </Faq>
              <Faq q="メンバーを検索しても、目的の人が出てきません。">
                <p>その人がユーザーマスタに登録されていません。管理者に「ユーザー管理」への登録を依頼してください。氏名の表記ゆれ（スペースの有無など）の場合は、メールアドレスの一部で検索すると見つかります。</p>
              </Faq>
              <Faq q="AI の評価やレポート作成が終わりません。">
                <p>数十秒から 1 分ほどかかります。{l.task}が多いと、もう少しかかることがあります。ボタンに「評価中」と出ている間は、もう一度押さずに待ってください。エラーが出たときは、時間をおいて再実行しても直らなければ管理者に連絡してください。</p>
              </Faq>
              <Faq q="取り組み一覧に自分の取り組みが出ません。">
                <p>メンバーに入っていない、または作成者が削除した可能性があります。作成者に、メンバーへの追加を依頼してください。</p>
              </Faq>
              <Faq q="更新したはずの画面が古いままです。">
                <p>ブラウザの強制再読み込み（Windows は <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[12px]">Ctrl</kbd> + <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[12px]">F5</kbd>）を試してください。</p>
              </Faq>
              <Faq q="ダッシュボードの数字が、登録したばかりの内容を反映していません。">
                <p>健全度や件数は、「AI で評価」を実行したときの結果です。{l.task}を追加・変更したあとは、ダッシュボード上部の黄色い案内から「今すぐ評価」を押してください。</p>
              </Faq>
            </div>
            <p className="pt-2 text-xs text-slate-500">
              このマニュアルは、画面上部のメニュー「マニュアル」からいつでも開けます。取り組みの中では、タブ右端の「使い方」でも短いガイドを見られます。
              <Link href="/" className="ml-2 font-semibold text-primary underline">取り組み一覧へ戻る</Link>
            </p>
          </Block>
        </div>
      </div>
    </div>
  );
}
