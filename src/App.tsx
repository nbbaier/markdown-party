import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./client/components/Layout";
import { AuthProvider } from "./client/contexts/auth-context";
import { GistPage } from "./client/pages/gist-page";
import { LandingPage } from "./client/pages/landing-page";
import "./index.css";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route element={<LandingPage />} path="/" />
            <Route element={<GistPage />} path="/:gistId" />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
