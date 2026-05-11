import React, { useState, useEffect, useCallback } from 'react';
import { Store, Eye, EyeOff, Link2, ArrowUpDown, FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Convierte texto a URL slug (lowercase, sin acentos, guiones).
 * Réplica client-side de la función slugify() en PostgreSQL.
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // Non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing dashes
    .slice(0, 120);                  // Max 120 chars
}

const ProductEcommerceTab = ({ formData, setFormData, tenantDominio }) => {
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Auto-generate slug when "publicar" is toggled ON and slug is empty
  const handleToggleVisible = useCallback(() => {
    const newVisible = !formData.ecommerce_visible;
    const updates = { ecommerce_visible: newVisible };

    // Auto-generate slug on first activation
    if (newVisible && !formData.ecommerce_slug && formData.descripcion) {
      updates.ecommerce_slug = slugify(formData.descripcion);
      setSlugManuallyEdited(false);
    }

    setFormData(prev => ({ ...prev, ...updates }));
  }, [formData.ecommerce_visible, formData.ecommerce_slug, formData.descripcion, setFormData]);

  // Auto-update slug when description changes (only if not manually edited)
  useEffect(() => {
    if (formData.ecommerce_visible && !slugManuallyEdited && !formData.ecommerce_slug) {
      if (formData.descripcion) {
        setFormData(prev => ({
          ...prev,
          ecommerce_slug: slugify(formData.descripcion)
        }));
      }
    }
  }, [formData.descripcion, formData.ecommerce_visible, slugManuallyEdited, formData.ecommerce_slug, setFormData]);

  const handleSlugChange = (value) => {
    // Sanitize slug input in real-time
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-');
    
    setSlugManuallyEdited(true);
    setFormData(prev => ({ ...prev, ecommerce_slug: sanitized }));
  };

  const handleRegenerateSlug = () => {
    if (formData.descripcion) {
      setFormData(prev => ({
        ...prev,
        ecommerce_slug: slugify(formData.descripcion)
      }));
      setSlugManuallyEdited(false);
    }
  };

  const previewUrl = tenantDominio
    ? `${tenantDominio}/tienda/${formData.ecommerce_slug || '...'}`
    : `tu-dominio.pages.dev/tienda/${formData.ecommerce_slug || '...'}`;

  return (
    <div className="space-y-4">
      {/* Toggle publicar */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-gray-50/80">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${formData.ecommerce_visible ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'}`}>
            {formData.ecommerce_visible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {formData.ecommerce_visible ? 'Publicado en la tienda' : 'No publicado'}
            </p>
            <p className="text-[11px] text-gray-500">
              {formData.ecommerce_visible
                ? 'Este producto es visible en la tienda pública'
                : 'Activa para mostrar en la tienda online'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={formData.ecommerce_visible ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleVisible}
          className={formData.ecommerce_visible
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'border-gray-300 text-gray-600 hover:bg-gray-100'}
        >
          <Store className="w-4 h-4 mr-1.5" />
          {formData.ecommerce_visible ? 'Publicado' : 'Publicar'}
        </Button>
      </div>

      {/* Fields only shown when published */}
      {formData.ecommerce_visible && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* URL Slug */}
          <div>
            <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
              <Link2 className="w-3.5 h-3.5" />
              URL del producto (slug)
            </Label>
            <div className="flex gap-2">
              <Input
                value={formData.ecommerce_slug || ''}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="ej: goma-110-70-12-tvs"
                className="flex-1 text-sm font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRegenerateSlug}
                title="Regenerar desde descripción"
                className="px-2"
              >
                ↻
              </Button>
            </div>
            <p className="text-[10px] text-blue-500 mt-1 font-mono truncate">
              🔗 {previewUrl}
            </p>
          </div>

          {/* Descripción para la tienda */}
          <div>
            <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5" />
              Descripción para la tienda (opcional)
            </Label>
            <textarea
              value={formData.ecommerce_descripcion || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, ecommerce_descripcion: e.target.value }))}
              placeholder="Descripción detallada para los clientes. Si se deja vacío, se usa la descripción principal del producto."
              className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={2000}
            />
            <p className="text-[10px] text-gray-400 text-right">
              {(formData.ecommerce_descripcion || '').length}/2000
            </p>
          </div>

          {/* Orden */}
          <div className="max-w-[200px]">
            <Label className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              Orden de aparición
            </Label>
            <Input
              type="number"
              value={formData.ecommerce_orden || 0}
              onChange={(e) => setFormData(prev => ({ ...prev, ecommerce_orden: parseInt(e.target.value) || 0 }))}
              min={0}
              className="text-sm"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Menor número = aparece primero. 0 = orden alfabético.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductEcommerceTab;
