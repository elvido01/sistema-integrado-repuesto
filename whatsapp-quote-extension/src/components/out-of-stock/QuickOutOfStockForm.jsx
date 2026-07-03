import React, { useEffect, useMemo, useState } from 'react';

const emptyLine = () => ({
  lineId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productoId: null,
  codigo: '',
  descripcion: '',
  existencia: null,
  cantidad: 1,
  isFree: false,
  freeText: ''
});

function normalizeQuantity(value) {
  const qty = Math.ceil(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function formatPlainMoney(value) {
  return Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export default function QuickOutOfStockForm({
  isOpen,
  context,
  selectedCustomer,
  onClose,
  onSearchProducts,
  onSubmit,
  saving = false
}) {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [query, setQuery] = useState('');
  const [modelo, setModelo] = useState('');
  const [marca, setMarca] = useState('');
  const [includeZeroStock, setIncludeZeroStock] = useState(true);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCustomerName(selectedCustomer?.nombre || context?.customerName || '');
    setPhone(selectedCustomer?.telefono || context?.phone || '');
    setNotes('');
    setLines([emptyLine()]);
    setQuery('');
    setModelo('');
    setMarca('');
    setIncludeZeroStock(true);
    setResults([]);
    setProductSearchOpen(false);
    setError('');
  }, [isOpen, context?.customerName, context?.phone, selectedCustomer?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const term = query.trim();
    const modelTerm = modelo.trim();
    const brandTerm = marca.trim();
    const shouldSearch = productSearchOpen || term.length >= 2 || modelTerm.length >= 2 || brandTerm.length >= 2;

    if (!shouldSearch) {
      setResults([]);
      return;
    }

    let active = true;
    setSearching(true);
    onSearchProducts({
      query: term,
      modelo: modelTerm,
      marca: brandTerm,
      includeZeroStock,
      limit: 35,
      offset: 0
    })
      .then((items) => {
        if (active) setResults(items || []);
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'No se pudo buscar productos.');
          setResults([]);
        }
      })
      .finally(() => {
        if (active) setSearching(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, productSearchOpen, query, modelo, marca, includeZeroStock, onSearchProducts]);

  const validLines = useMemo(() => (
    lines.filter((line) => (
      line.isFree ? line.freeText.trim() : line.productoId
    ))
  ), [lines]);

  if (!isOpen) return null;

  const updateLine = (lineId, patch) => {
    setLines((current) => current.map((line) => (
      line.lineId === lineId ? { ...line, ...patch } : line
    )));
  };

  const addProduct = (product) => {
    setLines((current) => [
      ...current.filter((line) => line.productoId || line.freeText.trim() || line.lineId !== current[0]?.lineId),
      {
        ...emptyLine(),
        productoId: product.id,
        codigo: product.codigo || '',
        descripcion: product.descripcion || product.nombre || 'Producto',
        existencia: Number(product.existencia ?? 0),
        cantidad: 1,
        isFree: false,
        freeText: ''
      }
    ]);
    setQuery('');
    setResults([]);
    setProductSearchOpen(false);
  };

  const submit = (event) => {
    event.preventDefault();
    setError('');

    if (!customerName.trim() && !phone.trim() && !context?.externalContactId) {
      setError('Indica cliente, telefono o identificador de la conversacion.');
      return;
    }

    if (!validLines.length) {
      setError('Agrega al menos un producto o una descripcion libre.');
      return;
    }

    onSubmit({
      customerName: customerName.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      lines: validLines.map((line) => ({
        producto_id: line.isFree ? null : line.productoId,
        producto_texto: line.isFree ? line.freeText.trim() : null,
        cantidad: normalizeQuantity(line.cantidad),
        descripcion: line.descripcion,
        codigo: line.codigo
      }))
    });
  };

  return (
    <>
      <div className="mf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Solicitud de producto agotado">
        <form className="mf-oos-modal" onSubmit={submit}>
          <header className="mf-modal-header">
            <h3>Producto agotado</h3>
            <button type="button" onClick={onClose} title="Cerrar">x</button>
          </header>

          <section className="mf-oos-body">
            <div className="mf-oos-client">
              <span>{context?.channelLabel || 'Canal'}</span>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Nombre del cliente"
              />
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Telefono si aplica"
              />
              <small>{selectedCustomer?.id ? 'Cliente Motoflow asociado' : 'Contacto sin asociar'}</small>
            </div>

            <div className="mf-oos-products">
              <label htmlFor="mf-oos-search">Buscar producto</label>
              <div className="mf-oos-search-row">
                <input
                  id="mf-oos-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Codigo, referencia o descripcion"
                />
                <button
                  type="button"
                  className="mf-oos-search-icon"
                  onClick={() => setProductSearchOpen(true)}
                  title="Abrir busqueda de producto"
                  aria-label="Abrir busqueda de producto"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16.5 16.5 21 21" />
                  </svg>
                </button>
              </div>
              {searching && <p className="mf-muted">Buscando...</p>}
              {results.length > 0 && (
                <div className="mf-oos-results">
                  {results.slice(0, 8).map((product) => (
                    <button key={product.id || product.codigo} type="button" onClick={() => addProduct(product)}>
                      <span>
                        <strong>{product.codigo || 'SIN CODIGO'}</strong>
                        <small>{product.descripcion || product.nombre}</small>
                      </span>
                      <b>Exist. {Number(product.existencia ?? 0)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mf-oos-lines">
              {lines.map((line) => (
                <article key={line.lineId} className="mf-oos-line">
                  <input
                    aria-label="Cantidad"
                    type="number"
                    min="1"
                    value={line.cantidad}
                    onChange={(event) => updateLine(line.lineId, { cantidad: event.target.value })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={line.isFree}
                      onChange={(event) => updateLine(line.lineId, {
                        isFree: event.target.checked,
                        productoId: event.target.checked ? null : line.productoId,
                        descripcion: event.target.checked ? '' : line.descripcion,
                        codigo: event.target.checked ? '' : line.codigo
                      })}
                    />
                    Libre
                  </label>
                  {line.isFree ? (
                    <input
                      value={line.freeText}
                      onChange={(event) => updateLine(line.lineId, { freeText: event.target.value })}
                      placeholder="Descripcion del producto"
                    />
                  ) : (
                    <strong>{line.descripcion || 'Selecciona un producto'}</strong>
                  )}
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((current) => current.filter((item) => item.lineId !== line.lineId))}>
                      Quitar
                    </button>
                  )}
                </article>
              ))}
              <button type="button" className="mf-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>
                Agregar linea libre
              </button>
            </div>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notas para compras o seguimiento"
            />

            <div className="mf-oos-summary">
              Al guardar se usara el flujo oficial de MotoFlow para registrar la solicitud y enviar productos inventariados a compras.
            </div>

            {error && <p className="mf-notice mf-notice-error">{error}</p>}
          </section>

          <footer className="mf-modal-footer">
            <span>{validLines.length} producto(s) listo(s)</span>
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Confirmar y guardar'}</button>
          </footer>
        </form>
      </div>

      {productSearchOpen && (
        <div className="mf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Buscar producto">
          <div className="mf-product-modal">
            <header className="mf-modal-header">
              <h3>Buscar producto</h3>
              <button type="button" onClick={() => setProductSearchOpen(false)} title="Cerrar">x</button>
            </header>

            <section className="mf-modal-filters">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por codigo, ref, descripcion..."
              />
              <input
                value={modelo}
                onChange={(event) => setModelo(event.target.value)}
                placeholder="Modelo"
              />
              <input
                value={marca}
                onChange={(event) => setMarca(event.target.value)}
                placeholder="Marca"
              />
              <label>
                <input
                  type="checkbox"
                  checked={includeZeroStock}
                  onChange={(event) => setIncludeZeroStock(event.target.checked)}
                />
                Incluir existencias en cero
              </label>
            </section>

            <section className="mf-product-table-wrap">
              <table className="mf-product-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Referencia</th>
                    <th>Descripcion</th>
                    <th>Ubicacion</th>
                    <th>Exist.</th>
                    <th>Precio+Imp</th>
                    <th>Marca</th>
                  </tr>
                </thead>
                <tbody>
                  {searching && (
                    <tr>
                      <td colSpan="7" className="mf-table-state">Buscando productos...</td>
                    </tr>
                  )}
                  {!searching && results.length === 0 && (
                    <tr>
                      <td colSpan="7" className="mf-table-state">Escribe al menos 2 caracteres para buscar.</td>
                    </tr>
                  )}
                  {!searching && results.map((product) => {
                    const stock = Number(product.existencia ?? 0);
                    const price = Number(product.precio ?? product.precio1 ?? 0);
                    return (
                      <tr key={product.id || product.codigo} onDoubleClick={() => addProduct(product)}>
                        <td><button type="button" onClick={() => addProduct(product)}>{product.codigo || '-'}</button></td>
                        <td>{product.referencia || '-'}</td>
                        <td>{product.descripcion || product.nombre || '-'}</td>
                        <td>{product.ubicacion || '-'}</td>
                        <td className={stock > 0 ? 'mf-stock-ok' : 'mf-stock-zero'}>{stock}</td>
                        <td className="mf-price">{formatPlainMoney(price)}</td>
                        <td>{product.marca_nombre || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <footer className="mf-modal-footer">
              <span>Doble clic o toca el codigo para agregar.</span>
              <button type="button" onClick={() => setProductSearchOpen(false)}>Cerrar</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
