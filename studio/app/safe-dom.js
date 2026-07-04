export function getEl(id, tag = 'div', typeAttr = null) {
  const exist = document.getElementById(id);
  if (exist) return exist;
  // create a lightweight invisible placeholder element to avoid null references
  const el = document.createElement(tag);
  el.id = id;
  el.style.display = 'none';
  if (typeAttr) el.type = typeAttr;
  // ensure placeholder supports addEventListener etc.
  document.body.appendChild(el);
  return el;
}