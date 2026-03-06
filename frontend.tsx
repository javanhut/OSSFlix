import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import App from "./App.tsx";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
