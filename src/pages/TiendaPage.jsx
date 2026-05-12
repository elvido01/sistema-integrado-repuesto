import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Search, Store, Phone, ChevronLeft, ChevronRight, Filter, X, ShoppingBag, MessageCircle, ExternalLink, Package, ShoppingCart, Plus, Minus, Trash2, ArrowRight } from 'lucide-react';
import {
  fetchTiendaConfig,
  fetchProductosTienda,
  fetchProductoPorSlug,
  fetchFiltrosTienda,
  buildWhatsAppUrl,
  registrarLeadTienda,
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

// ─── Avisarme Modal (CRM Lead) ───
const TiendaAvisarmeModal = ({ isOpen, onClose, producto, dominio }) => {
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNombre('');
      setContacto('');
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !producto) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !contacto.trim()) return;

    setSubmitting(true);
    const ok = await registrarLeadTienda(dominio, producto.id, nombre, contacto);
    setSubmitting(false);

    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">Avisarme cuando esté disponible</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-2">¡Aviso registrado!</h4>
              <p className="text-gray-500 text-sm">
                Te contactaremos al <strong>{contacto}</strong> en cuanto tengamos existencias de este producto.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-3 items-center mb-6 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="w-12 h-12 bg-white rounded-lg border border-gray-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {producto.imagen_url ? (
                    <img src={producto.imagen_url} alt="img" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Package className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate" title={producto.descripcion}>{producto.descripcion}</h4>
                  <p className="text-xs text-gray-500">Cód: {producto.codigo}</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tu Nombre</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp o Correo Electrónico</label>
                  <input
                    type="text"
                    required
                    value={contacto}
                    onChange={(e) => setContacto(e.target.value)}
                    placeholder="Ej. 809-555-1234 o juan@email.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={submitting || !nombre.trim() || !contacto.trim()}
                  className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 rounded-xl transition-all"
                >
                  {submitting ? 'Registrando...' : 'Avísenme por favor'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Product Card ───
const ProductCard = ({ producto, telefono, onViewDetail, onAvisarme }) => {
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

        {/* Agotado Badge */}
        {producto.existencia <= 0 && (
          <div className="mt-auto mb-2">
            <span className="inline-block bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider">
              AGOTADO
            </span>
          </div>
        )}

        {/* Price */}
        <div className={producto.existencia > 0 ? "mt-auto" : ""}>
          <p className="text-lg font-black text-gray-900">{formatPrice(producto.precio)}</p>
        </div>

        {/* CTA */}
        {producto.existencia > 0 ? (
          <button
            onClick={() => onViewDetail(producto)}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-200"
          >
            Ver producto
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAvisarme(producto); }}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs sm:text-sm font-semibold py-2.5 rounded-xl transition-all duration-200"
          >
            Avisarme cuando esté disponible
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Product Detail Modal ───
const ProductDetailView = ({ producto, telefono, onBack, onAddToCart, onAvisarme }) => {
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
            <div className="flex items-center gap-3 mb-4">
              <p className="text-xs text-gray-400">Código: {producto.codigo}{producto.referencia ? ` | Ref: ${producto.referencia}` : ''}</p>
              {producto.existencia <= 0 && (
                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  AGOTADO
                </span>
              )}
            </div>

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
              
              {producto.existencia > 0 ? (
                <button
                  onClick={() => onAddToCart(producto)}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Agregar a la lista
                </button>
              ) : (
                <button
                  onClick={() => onAvisarme(producto)}
                  className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg"
                >
                  Avisarme cuando esté disponible
                </button>
              )}
            </div>

            {/* Quick WhatsApp CTA (Individual) */}
            {producto.existencia > 0 && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2.5 bg-white border-2 border-green-500 text-green-600 hover:bg-green-50 text-sm font-bold py-3 rounded-xl transition-all mt-auto"
              >
                <MessageCircle className="w-4 h-4" />
                Consulta rápida (solo esto)
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Search Bar (Top) ───
const SearchBarTop = ({ search, setSearch, onClear, hasFilters }) => {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-100 p-3 mb-6 shadow-sm flex items-center gap-3">
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
      {hasFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-red-500 border border-gray-200 rounded-xl hover:bg-red-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Limpiar Filtros
        </button>
      )}
    </div>
  );
};

// ─── Sidebar Filters (Left) ───
const SidebarFilters = ({ marcas, modelos, tipos, marca, setMarca, modelo, setModelo, tipo, setTipo }) => {
  const FilterGroup = ({ title, options, selected, onSelect }) => {
    if (!options || options.length === 0) return null;
    return (
      <div className="mb-6">
        <h4 className="font-bold text-gray-900 text-sm mb-3">{title}</h4>
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="radio"
              name={title}
              checked={!selected}
              onChange={() => onSelect('')}
              className="w-3.5 h-3.5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className={`text-xs ${!selected ? 'font-bold text-blue-600' : 'text-gray-600 group-hover:text-blue-500'}`}>
              Todos
            </span>
          </label>
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name={title}
                checked={selected === opt}
                onChange={() => onSelect(opt)}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className={`text-xs ${selected === opt ? 'font-bold text-blue-600' : 'text-gray-600 group-hover:text-blue-500'}`}>
                {opt}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full lg:w-56 flex-shrink-0 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-fit sticky top-24">
      <h3 className="font-black text-gray-900 mb-4 flex items-center gap-2">
        <Filter className="w-4 h-4 text-blue-600" />
        Filtros
      </h3>
      <FilterGroup title="Modelos de Moto" options={modelos} selected={modelo} onSelect={setModelo} />
      <FilterGroup title="Marcas de Repuesto" options={marcas} selected={marca} onSelect={setMarca} />
      <FilterGroup title="Tipos" options={tipos} selected={tipo} onSelect={setTipo} />
    </div>
  );
};

const HeroCarousel = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: 1,
      title: "Todo para tu Motocicleta",
      subtitle: "Encuentra los mejores repuestos y accesorios con entrega rápida.",
      bgColor: "bg-gradient-to-r from-orange-500 to-amber-600",
      textColor: "text-white",
      image: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=1200&auto=format&fit=crop",
      action: "Ver catálogo"
    },
    {
      id: 2,
      title: "Ofertas Especiales en Llantas",
      subtitle: "Hasta 20% de descuento en llantas seleccionadas. ¡Preparate para la ruta!",
      bgColor: "bg-gradient-to-r from-blue-600 to-indigo-700",
      textColor: "text-white",
      image: "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?q=80&w=1200&auto=format&fit=crop",
      action: "Aprovechar oferta"
    },
    {
      id: 3,
      title: "Cascos y Seguridad",
      subtitle: "La mejor protección para tus viajes. Variedad de marcas y modelos.",
      bgColor: "bg-gradient-to-r from-gray-800 to-black",
      textColor: "text-white",
      image: "https://images.unsplash.com/photo-1533558701576-23c65e0272fb?q=80&w=1200&auto=format&fit=crop",
      action: "Comprar ahora"
    }
  ];

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  }, [slides.length]);

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl mb-8 group bg-gray-100 h-[250px] sm:h-[350px] lg:h-[400px] shadow-sm">
      <div 
        className="flex h-full transition-transform duration-700 ease-out" 
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="min-w-full h-full relative flex items-center">
            <div className="absolute inset-0 z-0">
              <img src={slide.image} alt={slide.title} className="w-full h-full object-cover" />
              <div className={`absolute inset-0 opacity-80 ${slide.bgColor}`}></div>
            </div>
            
            <div className="relative z-10 w-full px-8 sm:px-16 lg:px-24 flex flex-col items-start justify-center h-full">
              <span className={`inline-block py-1 px-3 rounded-full bg-white/20 backdrop-blur-sm text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-3 sm:mb-4 ${slide.textColor}`}>
                Destacado
              </span>
              <h2 className={`text-2xl sm:text-4xl lg:text-5xl font-black mb-2 sm:mb-4 max-w-2xl leading-tight ${slide.textColor}`}>
                {slide.title}
              </h2>
              <p className={`text-xs sm:text-base lg:text-lg mb-6 sm:mb-8 max-w-xl opacity-90 font-medium ${slide.textColor}`}>
                {slide.subtitle}
              </p>
              <button onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })} className="bg-white text-gray-900 hover:bg-gray-50 text-xs sm:text-sm font-bold py-2.5 sm:py-3 px-5 sm:px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5">
                {slide.action}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button 
        onClick={prevSlide}
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5 sm:w-8 sm:h-8" />
      </button>
      <button 
        onClick={nextSlide}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
      >
        <ChevronRight className="w-5 h-5 sm:w-8 sm:h-8" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`h-1.5 sm:h-2 rounded-full transition-all ${currentSlide === index ? 'w-6 sm:w-8 bg-white' : 'w-1.5 sm:w-2 bg-white/50 hover:bg-white/80'}`}
          />
        ))}
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
  const [modelo, setModelo] = useState('');
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [modelos, setModelos] = useState([]);

  // Detail view & CRM Leads
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isAvisarmeModalOpen, setIsAvisarmeModalOpen] = useState(false);
  const [avisarmeProduct, setAvisarmeProduct] = useState(null);

  const handleOpenAvisarme = useCallback((producto) => {
    setAvisarmeProduct(producto);
    setIsAvisarmeModalOpen(true);
  }, []);

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
      setModelos(filtros.modelos);
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
      modelo,
    });
    setProductos(result.productos || []);
    setTotalCount(result.totalCount || 0);
    setLoadingProducts(false);
  }, [config, dominio, page, debouncedSearch, marca, tipo, modelo]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, marca, tipo, modelo]);

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
    setModelo('');
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
            onAvisarme={handleOpenAvisarme}
          />
        ) : (
          <>
            {/* Hero Carousel */}
            {(!search && !marca && !tipo && !modelo && page === 1) && (
              <HeroCarousel />
            )}

            {/* Layout Grid: Sidebar + Main Content */}
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Sidebar */}
              <SidebarFilters 
                marcas={marcas} modelos={modelos} tipos={tipos}
                marca={marca} setMarca={setMarca}
                modelo={modelo} setModelo={setModelo}
                tipo={tipo} setTipo={setTipo}
              />

              {/* Main Column */}
              <div className="flex-1 min-w-0">
                {/* Search Bar */}
                <SearchBarTop 
                  search={search} 
                  setSearch={setSearch} 
                  onClear={clearFilters} 
                  hasFilters={!!(search || marca || tipo || modelo)}
                />

                {/* Results count */}
                {!loadingProducts && totalCount > 0 && (
                  <p className="text-xs text-gray-400 mb-5 pl-1">
                    Mostrando {productos.length} de {totalCount} producto{totalCount !== 1 ? 's' : ''}
                  </p>
                )}

                {/* Product Grid */}
                {loadingProducts ? (
                  <LoadingSkeleton />
                ) : productos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {productos.map(prod => (
                      <ProductCard
                        key={prod.id}
                        producto={prod}
                        telefono={config?.telefono}
                        onViewDetail={handleViewDetail}
                        onAvisarme={handleOpenAvisarme}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState search={debouncedSearch} />
                )}

                {/* Pagination */}
                <Pagination page={page} totalPages={totalPages} setPage={setPage} />
              </div>
            </div>
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

      <TiendaAvisarmeModal 
        isOpen={isAvisarmeModalOpen}
        onClose={() => setIsAvisarmeModalOpen(false)}
        producto={avisarmeProduct}
        dominio={dominio}
      />
    </div>
  );
};

export default TiendaPage;
