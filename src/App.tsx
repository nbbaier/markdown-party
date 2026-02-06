import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./client/components/Layout";
import { AuthProvider } from "./client/contexts/AuthContext";
import { GistPage } from "./client/pages/GistPage";
import { LandingPage } from "./client/pages/LandingPage";
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
