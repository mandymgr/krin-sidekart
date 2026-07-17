export default function InputWithPlaceholder() {
  return (
    <div>
      <h1>Search projects</h1>
      <input placeholder="Search projects..." className="w-full rounded border" />
      <p>Real, finished page content well past the minimum length threshold so this regression test isolates only the input-attribute regex fix, not the length heuristic.</p>
    </div>
  );
}
