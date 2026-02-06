import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./client/components/Layout";
import { LandingPage } from "./client/pages/LandingPage";
import { GistPage } from "./client/pages/GistPage";
import { AuthProvider } from "./client/contexts/AuthContext";
import "./index.css";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/:gistId" element={<GistPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
