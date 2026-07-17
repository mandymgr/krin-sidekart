import { createBrowserRouter } from "react-router-dom";
import Home from "./Home";
import About from "./About";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/about", element: <About /> },
  { path: "/team/:slug", element: <About /> },
]);
