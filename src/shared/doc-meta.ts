// Shared DocMeta response type used by both DO and API routes

export interface DocMeta {
  initialized: boolean;
  docId: string;
  ownerUserId: string | null;
  editTokenHash: string;
  githubBackend: string | null;
  createdAt: string;
  lastActivityAt: string;
}

// API response types
export interface CreateDocResponse {
  doc_id: string;
  edit_token: string;
}

export interface DocMetadataResponse {
  doc_id: string;
  owner_user_id: string | null;
  initialized: boolean;
  created_at: string;
  last_activity_at: string;
}

export interface ClaimEditResponse {
  ok: boolean;
}

export interface EditTokenResponse {
  edit_token: string;
}
