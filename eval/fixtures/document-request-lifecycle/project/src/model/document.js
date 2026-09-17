export function previewOf(document) {
  return {
    id: document.id,
    title: document.title,
    excerpt: document.body?.blocks?.[0]?.text?.slice(0, 80) ?? '',
    labels: [...(document.labels ?? [])],
  };
}
