export const orNull = (v) => (v === '' || v === undefined || v === null ? null : v);

export const nombreById = (arr, id) => {
  if (!id || !Array.isArray(arr)) return null;
  const x = arr.find((t) => String(t.id) === String(id));
  return x?.nombre ?? null;
};
