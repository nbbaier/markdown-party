import { Toaster } from "@/components/ui/sonner";
import Editor from "./components/editor";

export default function App() {
  return (
    <>
      <Editor />
      <Toaster position="bottom-right" />
    </>
  );
}
