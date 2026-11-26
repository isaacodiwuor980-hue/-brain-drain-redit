/** Shared matching for navigation highlighting, including nested routes. */
export function isNavActive(href: string, location: string): boolean {
  const path = location.split(/[?#]/, 1)[0];
  if (href === "/") return path === "/" || path === "";
  return path === href || path.startsWith(`${href}/`);
}
