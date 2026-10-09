// Entry for the single-file artifact build (scripts/build-futureshift-artifact.mjs).
import { createRoot } from "react-dom/client";
import FutureShift from "./FutureShift";

createRoot(document.getElementById("root")!).render(<FutureShift />);
