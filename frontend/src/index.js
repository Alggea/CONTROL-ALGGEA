import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Evita que el scroll de la rueda del mouse modifique inputs numéricos cuando
// están enfocados (causa cambios accidentales del monto al hacer scroll en la página).
if (typeof document !== "undefined") {
  document.addEventListener(
    "wheel",
    (e) => {
      const t = e.target;
      if (t && t.tagName === "INPUT" && t.type === "number" && document.activeElement === t) {
        t.blur();
      }
    },
    { passive: true }
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
