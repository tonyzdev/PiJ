export function offsetPage(items, offset, limit) {
  return { items: items.slice(offset, offset + limit), nextOffset: offset + limit < items.length ? offset + limit : null };
}
