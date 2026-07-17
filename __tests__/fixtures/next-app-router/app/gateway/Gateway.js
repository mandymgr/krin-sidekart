export const NAV_ITEMS = [
  { label: "Portal", href: "/portal-broken" },
];

export default function Gateway() {
  return { type: "a", props: { href: "/gateway" } };
}
