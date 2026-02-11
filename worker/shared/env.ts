export interface WorkerBindings {
  DOC_ROOM: DurableObjectNamespace;
  SESSION_KV: KVNamespace;
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY_V1: string;
}

export interface WorkerVariables {
  userId: string;
  login: string;
  avatarUrl: string;
}

export interface WorkerEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
