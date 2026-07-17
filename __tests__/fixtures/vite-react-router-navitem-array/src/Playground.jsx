import { Link } from "react-router-dom";

export default function Playground() {
  const project = { id: "42" };
  return <Link to={`/projects/${project.id}`}>Open project</Link>;
}
