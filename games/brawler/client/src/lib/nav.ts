export const route = () => location.pathname.split('/').filter(Boolean);

export function go(path: string) {
  history.pushState(null, '', path + location.search);
  dispatchEvent(new PopStateEvent('popstate'));
}
