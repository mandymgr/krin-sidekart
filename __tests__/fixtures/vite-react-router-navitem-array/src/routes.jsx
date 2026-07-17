import { createBrowserRouter } from "react-router-dom";
import Home from "./Home.jsx";
import Playground from "./Playground.jsx";
import ProjectDetail from "./ProjectDetail.jsx";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/playground", element: <Playground /> },
  { path: "/projects/:id", element: <ProjectDetail /> },
]);
