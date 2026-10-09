/**
 * The only place that calls the backend. Types come from schema.d.ts, which is GENERATED from the
 * FastAPI OpenAPI (npm run gen:api). Never hand-write response types — regenerate instead.
 */
import type { components } from "./schema";

type S = components["schemas"];

export type Mode = S["Mode"];
export type ModeDefinition = S["ModeDefinition"];
export type ModeDefinitionBody = S["ModeDefinitionBody"];
export type Project = S["Project"];
export type ProjectCreate = S["ProjectCreate"];
export type ProjectUpdate = S["ProjectUpdate"];
export type ProjectItems = S["ProjectItems"];
export type Assumption = S["Assumption"];
export type Criterion = S["Criterion"];
export type Task = S["Task"];
export type Evidence = S["Evidence"];
export type DecisionItem = S["DecisionItem"];
export type Request = S["Request"];
export type ProcessStep = S["ProcessStep"];
export type ProcessVariant = S["ProcessVariant"];
export type ItemPatch = S["ItemPatch"];
export type TaskFields = S["TaskFields"];
export type Dashboard = S["Dashboard"];
export type Compass = S["Compass"];
export type CompassTask = S["CompassTask"];
export type Evaluation = S["Evaluation"];
export type Report = S["Report"];
export type ExtractedTask = S["ExtractedTask"];
export type UserContext = S["UserContext"];
export type UserRecord = S["UserRecord"];
export type UserBody = S["UserBody"];
export type UserCreate = S["UserCreate"];
export type ProjectMember = S["ProjectMember"];
export type MemberRole = S["MemberRole"];
export type Verdict = S["Verdict"];
export type ChatMessage = S["ChatMessage"];
export type ChatOperation = S["Operation"];
export type ItemCreate =
  | S["AssumptionFields"]
  | S["CriterionFields"]
  | S["TaskFields"]
  | S["EvidenceFields"]
  | S["DecisionFields"]
  | S["RequestFields"]
  | S["ProcessStepFields"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = "/api/backend";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "通信に失敗しました。ネットワーク接続を確認して再度お試しください。");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (e.g. auth redirect page)
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `サーバーエラーが発生しました（${res.status}）。時間をおいて再度お試しください。`,
    );
  }
  return json as T;
}

const p = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const api = {
  me: () => request<UserContext>("GET", "/me"),
  health: () => request<S["HealthResponse"]>("GET", "/health"),

  listModes: () => request<ModeDefinition[]>("GET", "/modes"),
  updateMode: (id: Mode, body: ModeDefinitionBody) => request<ModeDefinition>("PUT", `/modes/${id}`, body),
  resetMode: (id: Mode) => request<ModeDefinition>("POST", `/modes/${id}/reset`),

  listProjects: (mode?: Mode) => request<Project[]>("GET", `/projects${mode ? `?mode=${mode}` : ""}`),
  createProject: (body: ProjectCreate) => request<Project>("POST", "/projects", body),
  createSamples: () => request<Project[]>("POST", "/projects/samples"),
  getProject: (id: string) => request<Project>("GET", p(id)),
  updateProject: (id: string, body: ProjectUpdate) => request<Project>("PATCH", p(id), body),
  deleteProject: (id: string) => request<void>("DELETE", p(id)),
  listMembers: (id: string) => request<ProjectMember[]>("GET", `${p(id)}/members`),

  searchUsers: (q: string, limit?: number) =>
    request<UserRecord[]>("GET", `/users?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}`),
  createUser: (body: UserCreate) => request<UserRecord>("POST", "/users", body),
  updateUser: (email: string, body: UserBody) => request<UserRecord>("PUT", `/users/${encodeURIComponent(email)}`, body),
  deleteUser: (email: string) => request<void>("DELETE", `/users/${encodeURIComponent(email)}`),

  listItems: (id: string) => request<ProjectItems>("GET", `${p(id)}/items`),
  createItem: (id: string, body: ItemCreate) => request<S["Assumption"] | Task | Criterion | Evidence | DecisionItem | Request | ProcessStep>(
    "POST", `${p(id)}/items`, body),
  bulkCreateTasks: (id: string, tasks: TaskFields[]) => request<Task[]>("POST", `${p(id)}/items/bulk`, { tasks }),
  updateItem: (id: string, itemId: string, body: ItemPatch) =>
    request<unknown>("PATCH", `${p(id)}/items/${encodeURIComponent(itemId)}`, body),
  deleteItem: (id: string, itemId: string) => request<void>("DELETE", `${p(id)}/items/${encodeURIComponent(itemId)}`),
  addFeedback: (id: string, taskId: string, judgement: S["FeedbackJudgement"]) =>
    request<unknown>("POST", `${p(id)}/feedback`, { task_id: taskId, judgement }),

  dashboard: (id: string) => request<Dashboard>("GET", `${p(id)}/dashboard`),
  compass: (id: string) => request<Compass>("GET", `${p(id)}/compass`),
  evaluate: (id: string) => request<Evaluation>("POST", `${p(id)}/evaluations`),
  latestEvaluation: (id: string) => request<Evaluation | null>("GET", `${p(id)}/evaluations/latest`),

  listReports: (id: string) => request<Report[]>("GET", `${p(id)}/reports`),
  createReport: (id: string) => request<Report>("POST", `${p(id)}/reports`),
  extractTasks: (id: string, text: string) => request<S["ExtractResponse"]>("POST", `${p(id)}/tasks/extract`, { text }),

  listChat: (id: string) => request<ChatMessage[]>("GET", `${p(id)}/chat`),
  sendChat: (id: string, message: string) => request<S["ChatSendResponse"]>("POST", `${p(id)}/chat`, { message }),
  applyChat: (id: string, messageId: string, operationIndexes?: number[]) =>
    request<ChatMessage>("POST", `${p(id)}/chat/${encodeURIComponent(messageId)}/apply`, { operation_indexes: operationIndexes ?? null }),
  discardChat: (id: string, messageId: string) =>
    request<ChatMessage>("POST", `${p(id)}/chat/${encodeURIComponent(messageId)}/discard`),
  clearChat: (id: string) => request<void>("DELETE", `${p(id)}/chat`),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "予期しないエラーが発生しました。画面を再読み込みしてください。";
}
