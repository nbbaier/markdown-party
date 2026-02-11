import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { HeaderBar } from "./client/components/header-bar";
import { AuthProvider } from "./client/contexts/auth-context";
import { fetchWithCsrf } from "./client/lib/fetch-with-csrf";
import { DocPage } from "./client/pages/doc-page";
import "./index.css";

// DocCreator: Creates a new doc on mount and redirects
function DocCreator() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function createDoc() {
      try {
        const res = await fetchWithCsrf("/api/docs", {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to create document");
        }

        const data = (await res.json()) as {
          doc_id: string;
          edit_token: string;
        };

        if (!cancelled) {
          sessionStorage.setItem(`edit_token:${data.doc_id}`, data.edit_token);
          navigate(`/${data.doc_id}`, { replace: true });
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to create document"
          );
          setLoading(false);
        }
      }
    }

    createDoc();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="doc-creator-error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()} type="button">
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="doc-creator-loading">
        <p>Creating document...</p>
      </div>
    );
  }

  return null;
}

function AppContent() {
  return (
    <div className="app">
      <HeaderBar />
      <main className="app-main">
        <Routes>
          <Route element={<DocCreator />} path="/" />
          <Route element={<DocPage />} path="/:docId" />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
