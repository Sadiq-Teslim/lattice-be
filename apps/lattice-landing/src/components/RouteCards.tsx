import { apiGroups } from "@/lib/content";

export function RouteCards() {
  return (
    <div className="api-grid">
      {apiGroups.map((group) => (
        <article className="api-card" key={group.title}>
          <h3>{group.title}</h3>
          <div className="route-list">
            {group.routes.map((route) => (
              <div className="route-row" key={`${route.method}-${route.path}`}>
                <div>
                  <span>{route.method}</span>
                  <code>{route.path}</code>
                </div>
                <p>{route.detail}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
