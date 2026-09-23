// Public news will be added here after editorial approval. Keeping the source
// separate from page components lets the landing page and the journal use the
// same published materials without inventing announcements.
export const PROJECT_NEWS = [];

export function getPublishedProjectNews() {
  return PROJECT_NEWS.filter((item) => item.publishedAt);
}

export function getProjectNewsBySlug(slug) {
  return getPublishedProjectNews().find((item) => item.slug === slug) ?? null;
}
