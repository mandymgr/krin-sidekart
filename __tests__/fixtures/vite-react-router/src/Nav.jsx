import { Link } from "react-router-dom";

export default function Nav() {
  return (
    <nav>
      <Link to="/about">About</Link>
      <Link to="/missing-page">Missing</Link>
    </nav>
  );
}
