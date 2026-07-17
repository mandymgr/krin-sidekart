import { Link } from "react-router-dom";

const toolRoutes = [
  { label: "Playground", to: "/playground" },
];

export default function Home() {
  return (
    <nav>
      {toolRoutes.map((item) => (
        <Link key={item.to} to={item.to}>{item.label}</Link>
      ))}
    </nav>
  );
}
