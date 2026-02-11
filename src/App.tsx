import Editor from "./components/Editor";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <>
      <Editor />
      <Toaster position="bottom-right" />
    </>
  );
}
