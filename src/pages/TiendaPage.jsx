import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Search, Store, Phone, ChevronLeft, ChevronRight, Filter, X, ShoppingBag, MessageCircle, ExternalLink, Package, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';
import {
  fetchTiendaConfig,
  fetchProductosTienda,
  fetchProductoPorSlug,
  fetchFiltrosTienda,
  buildWhatsAppUrl,
} from '@/services/ecommerceService';

// ─── Utility: Format price in DOP ───
const formatPrice = (price) => {
  if (!price && price !== 0) return '';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(price);
};

// ─── WhatsApp Floating Button (Now secondary, or hidden if cart exists) ───
const WhatsAppFloatingButton = ({ telefono }) => {
  if (!telefono) return null;
  const url = buildWhatsAppUrl(telefono);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-xl hover:shadow-green-500/30 transition-all duration-300 hover:scale-110 group"
      title="Escríbenos por WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
      <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        ¿Dudas generales?
      </span>
    </a>
  );
};

// ─── Cart Panel ───
const CartPanel = ({ isOpen, onClose, cart, updateQuantity, removeFromCart, telefono, configNombre }) => {
  if (!isOpen) return null;

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalAmount = cart.reduce((acc, item) => acc + (item.precio * item.quantity), 0);

  const handleCheckout = () => {
    if (!telefono) return;
    
    // Clean phone number
    const cleanPhone = telefono.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;

    // Build message
    let message = `¡Hola! Me gustaría consultar disponibilidad de la siguiente lista (Tienda: ${configNombre}):\n\n`;
    
    cart.forEach((item, index) => {
      message += `${index + 1}. *${item.descripcion}*\n`;
      message += `   Código: ${item.codigo} | Cantidad: ${item.quantity}\n`;
    });
    
    message += `\nTotal estimado: ${formatPrice(totalAmount)}\n\n¿Tienen estos productos en stock?`;

    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-800">
            <ShoppingCart className="w-5 h-5" />
            <h2 className="font-bold text-lg">Mi Lista de Consulta</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-sidebar-scroll-light">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
              <p className="font-medium text-gray-600">Tu lista está vacía</p>
              <p className="text-sm text-gray-400 mt-1 max-w-[250px]">Agrega productos al carrito para consultarlos todos juntos por WhatsApp.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex gap-4 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                  <div className="w-16 h-16 bg-white rounded-lg border border-gray-100 flex items-center justify-center flex-shrink-0">
                    {item.imagen_url ? (
                      <img src={item.imagen_url} alt="img" className="max-w-full max-h-full object-contain p-1" />
                    ) : (
                      <Package className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800 leading-tight truncate" title={item.descripcion}>
                      {item.descripcion}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">Cód: {item.codigo}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="font-bold text-gray-900 text-sm">{formatPrice(item.precio)}</p>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg h-7">
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-full flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-full flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="flex-shrink-0 p-2 h-fit text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/80 backdrop-blur">
            <div className="flex justify-between items-end mb-4 px-1">
              <span className="text-sm text-gray-500">Total estimado ({totalItems} items)</span>
              <span className="text-xl font-black text-gray-900">{formatPrice(totalAmount)}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-green-500/25 hover:-translate-y-0.5"
            >
              <MessageCircle className="w-5 h-5" />
              Enviar lista por WhatsApp
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-3">
              Al enviar, se abrirá WhatsApp con los detalles de tu lista para consultar existencias.
            </p>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Product Card ───
const ProductCard = ({ producto, telefono, onViewDetail }) => {
  const whatsappUrl = buildWhatsAppUrl(telefono, producto);

  return (
    <div
      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:shadow-blue-500/8 hover:-translate-y-1 transition-all duration-300 flex flex-col"
    >
      {/* Image */}
      <div
        className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden cursor-pointer"
        onClick={() => onViewDetail(producto)}
      >
        {producto.imagen_url ? (
          <img
            src={producto.imagen_url}
            alt={producto.descripcion}
            className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-gray-200" />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
          <span className="text-white text-xs font-medium bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
            Ver detalles
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Brand/Type badges */}
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {producto.marca_nombre && (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
              {producto.marca_nombre}
            </span>
          )}
          {producto.tipo_nombre && (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {producto.tipo_nombre}
            </span>
          )}
        </div>

        {/* Description */}
        <h3
          className="text-sm font-semibold text-gray-800 line-clamp-2 mb-1 cursor-pointer hover:text-blue-600 transition-colors"
          onClick={() => onViewDetail(producto)}
        >
          {producto.descripcion}
        </h3>
        <p className="text-[11px] text-gray-400 mb-3">Código: {producto.codigo}</p>

        {/* Price */}
        <div className="mt-auto">
          <p className="text-lg font-black text-gray-900">{formatPrice(producto.precio)}</p>
        </div>

        {/* CTA */}
        <button
          onClick={() => onViewDetail(producto)}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-200"
        >
          Ver producto
        </button>
      </div>
    </div>
  );
};

// ─── Product Detail Modal ───
const ProductDetailView = ({ producto, telefono, onBack, onAddToCart }) => {
  if (!producto) return null;

  const whatsappUrl = buildWhatsAppUrl(telefono, producto);
  const descripcionLarga = producto.ecommerce_descripcion || producto.descripcion;

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 mb-6 transition-colors group"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Volver al catálogo
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Image */}
          <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
            {producto.imagen_url ? (
              <img
                src={producto.imagen_url}
                alt={producto.descripcion}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <Package className="w-32 h-32 text-gray-200" />
            )}
          </div>

          {/* Info */}
          <div className="p-8 flex flex-col">
            {/* Badges */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {producto.marca_nombre && (
                <span className="text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-600 px-3 py-1 rounded-full">
                  {producto.marca_nombre}
                </span>
              )}
              {producto.tipo_nombre && (
                <span className="text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                  {producto.tipo_nombre}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">{producto.descripcion}</h1>
            <p className="text-xs text-gray-400 mb-4">Código: {producto.codigo}{producto.referencia ? ` | Ref: ${producto.referencia}` : ''}</p>

            {/* Description */}
            {descripcionLarga !== producto.descripcion && (
              <p className="text-sm text-gray-600 leading-relaxed mb-6 whitespace-pre-line">
                {descripcionLarga}
              </p>
            )}

            {/* Price & Add to Cart */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 mb-6">
              <p className="text-xs text-gray-500 mb-1">Precio</p>
              <p className="text-3xl font-black text-gray-900">{formatPrice(producto.precio)}</p>
              <p className="text-[11px] text-gray-400 mt-1 mb-4">ITBIS incluido</p>
              
              <button
                onClick={() => onAddToCart(producto)}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-blue-500/20"
              >
                <ShoppingCart className="w-4 h-4" />
                Agregar a la lista
              </button>
            </div>

            {/* Quick WhatsApp CTA (Individual) */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 bg-white border-2 border-green-500 text-green-600 hover:bg-green-50 text-sm font-bold py-3 rounded-xl transition-all mt-auto"
            >
              <MessageCircle className="w-4 h-4" />
              Consulta rápida (solo esto)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Search & Filters Bar ───
const SearchFilters = ({ search, setSearch, marca, setMarca, tipo, setTipo, marcas, tipos, onClear }) => {
  const hasFilters = search || marca || tipo;

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-100 p-4 mb-8 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código o referencia..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-gray-50/80 placeholder-gray-400 transition-all"
          />
        </div>

        {/* Marca filter */}
        {marcas.length > 0 && (
          <select
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-gray-50/80 text-gray-600 min-w-[140px]"
          >
            <option value="">Todas las marcas</option>
            {marcas.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {/* Tipo filter */}
        {tipos.length > 0 && (
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-gray-50/80 text-gray-600 min-w-[140px]"
          >
            <option value="">Todos los tipos</option>
            {tipos.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Pagination ───
const Pagination = ({ page, totalPages, setPage }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-10">
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
        className="p-2 rounded-xl border border-gray-200 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-gray-500 px-4">
        Página <strong className="text-gray-800">{page}</strong> de <strong className="text-gray-800">{totalPages}</strong>
      </span>
      <button
        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
        disabled={page === totalPages}
        className="p-2 rounded-xl border border-gray-200 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

// ─── Empty State ───
const EmptyState = ({ search }) => (
  <div className="text-center py-20">
    <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
      <ShoppingBag className="w-10 h-10 text-gray-300" />
    </div>
    <h3 className="text-lg font-semibold text-gray-700 mb-2">
      {search ? 'No se encontraron productos' : 'No hay productos disponibles'}
    </h3>
    <p className="text-sm text-gray-400 max-w-md mx-auto">
      {search
        ? `No hay resultados para "${search}". Intenta con otro término de búsqueda.`
        : 'Pronto agregaremos productos a nuestra tienda. ¡Vuelve pronto!'}
    </p>
  </div>
);

// ─── Loading Skeleton ───
const LoadingSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
    {[...Array(8)].map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
        <div className="aspect-square bg-gray-100" />
        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            <div className="h-4 w-14 bg-gray-100 rounded-full" />
            <div className="h-4 w-10 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-50 rounded w-1/2" />
          <div className="h-6 bg-gray-100 rounded w-1/3 mt-2" />
          <div className="h-10 bg-green-50 rounded-xl mt-3" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Tienda Not Found / Not Enabled ───
const TiendaNotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
    <div className="text-center max-w-md px-6">
      <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
        <Store className="w-12 h-12 text-gray-300" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-3">Tienda no disponible</h1>
      <p className="text-gray-500 text-sm mb-6">
        Esta tienda no está disponible en este momento. Si crees que es un error, contacta al administrador.
      </p>
      <p className="text-[11px] text-gray-300">Powered by MotoFlow</p>
    </div>
  </div>
);

// ─── MAIN COMPONENT ───
const PAGE_SIZE = 20;

const TiendaPage = () => {
  // State
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Cart State (Persisted in localStorage)
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('motoflow_ecommerce_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('motoflow_ecommerce_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = useCallback((producto) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === producto.id);
      if (exists) {
        return prev.map(item => item.id === producto.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...producto, quantity: 1 }];
    });
    setIsCartOpen(true);
  }, []);

  const updateQuantity = useCallback((id, newQuantity) => {
    if (newQuantity < 1) {
      setCart(prev => prev.filter(item => item.id !== id));
      return;
    }
    setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: newQuantity } : item));
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  }, []);

  // Products
  const [productos, setProductos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [marca, setMarca] = useState('');
  const [tipo, setTipo] = useState('');
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);

  // Detail view
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Detect hostname
  const dominio = useMemo(() => window.location.hostname, []);

  // ── Load config ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cfg = await fetchTiendaConfig(dominio);
      if (!cfg || !cfg.feat_tienda) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setConfig(cfg);
      setLoading(false);

      // Load filters
      const filtros = await fetchFiltrosTienda(dominio);
      setMarcas(filtros.marcas);
      setTipos(filtros.tipos);
    };
    load();
  }, [dominio]);

  // ── Load products ──
  const loadProducts = useCallback(async () => {
    if (!config) return;
    setLoadingProducts(true);
    const result = await fetchProductosTienda(dominio, {
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      marca,
      tipo,
    });
    setProductos(result.productos);
    setTotalCount(result.totalCount);
    setLoadingProducts(false);
  }, [config, dominio, page, debouncedSearch, marca, tipo]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, marca, tipo]);

  // Handle URL-based product detail (/tienda/slug)
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/tienda\/(.+)$/);
    if (match && match[1] && config) {
      const slug = match[1];
      fetchProductoPorSlug(dominio, slug).then(product => {
        if (product) {
          setSelectedProduct(product);
        }
      });
    }
  }, [config, dominio]);

  // Navigation helpers
  const handleViewDetail = useCallback((producto) => {
    setSelectedProduct(producto);
    if (producto.ecommerce_slug) {
      window.history.pushState({}, '', `/tienda/${producto.ecommerce_slug}`);
    }
  }, []);

  const handleBackToGrid = useCallback(() => {
    setSelectedProduct(null);
    window.history.pushState({}, '', '/tienda');
  }, []);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/tienda') {
        setSelectedProduct(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const clearFilters = () => {
    setSearch('');
    setMarca('');
    setTipo('');
    setPage(1);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Cargando tienda...</p>
        </div>
      </div>
    );
  }

  // ── Not found ──
  if (notFound) {
    return <TiendaNotFound />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
      <Helmet>
        <title>{config?.nombre ? `${config.nombre} — Tienda` : 'Tienda'}</title>
        <meta name="description" content={`Catálogo de productos de ${config?.nombre || 'nuestra tienda'}. Consulta precios y disponibilidad.`} />
        <meta property="og:title" content={`${config?.nombre || 'Tienda'} — Catálogo de Productos`} />
        <meta property="og:description" content={`Explora el catálogo de ${config?.nombre || 'nuestra tienda'} y consulta disponibilidad por WhatsApp.`} />
        {config?.logo_url && <meta property="og:image" content={config.logo_url} />}
      </Helmet>

      {/* ── Header ── */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config?.logo_url ? (
              <img src={config.logo_url} alt={config.nombre} className="h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/20">
                {config?.nombre?.charAt(0) || 'T'}
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-gray-900">{config?.nombre || 'Tienda'}</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Catálogo de productos</p>
            </div>
          </div>

          {config?.telefono && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative flex items-center justify-center p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              >
                <ShoppingCart className="w-6 h-6" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {selectedProduct ? (
          <ProductDetailView
            producto={selectedProduct}
            telefono={config?.telefono}
            onBack={handleBackToGrid}
            onAddToCart={addToCart}
          />
        ) : (
          <>
            {/* Search & Filters */}
            <SearchFilters
              search={search}
              setSearch={setSearch}
              marca={marca}
              setMarca={setMarca}
              tipo={tipo}
              setTipo={setTipo}
              marcas={marcas}
              tipos={tipos}
              onClear={clearFilters}
            />

            {/* Results count */}
            {!loadingProducts && totalCount > 0 && (
              <p className="text-xs text-gray-400 mb-5">
                Mostrando {productos.length} de {totalCount} producto{totalCount !== 1 ? 's' : ''}
              </p>
            )}

            {/* Product Grid */}
            {loadingProducts ? (
              <LoadingSkeleton />
            ) : productos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {productos.map(prod => (
                  <ProductCard
                    key={prod.id}
                    producto={prod}
                    telefono={config?.telefono}
                    onViewDetail={handleViewDetail}
                  />
                ))}
              </div>
            ) : (
              <EmptyState search={debouncedSearch} />
            )}

            {/* Pagination */}
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 mt-16 py-8 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-300">
            © {new Date().getFullYear()} {config?.nombre} — Todos los derechos reservados
          </p>
          <p className="text-[10px] text-gray-200 mt-1">
            Powered by <span className="font-semibold">MotoFlow</span>
          </p>
        </div>
      </footer>

      <CartPanel 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        telefono={config?.telefono}
        configNombre={config?.nombre}
      />
    </div>
  );
};

export default TiendaPage;
