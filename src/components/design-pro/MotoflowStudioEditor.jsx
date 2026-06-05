import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    AlignCenter,
    BringToFront,
    Copy,
    Image as ImageIcon,
    Layers,
    Maximize2,
    MoveHorizontal,
    MoveVertical,
    SendToBack,
    Square,
    Trash2,
    Type,
    Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_FONT = 'Arial';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'el') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeDocument(doc, width, height) {
    if (doc?.pages?.length) {
        const next = clone(doc);
        next.width = Number(next.width || width);
        next.height = Number(next.height || height);
        next.pages = next.pages.map((page, index) => ({
            id: page.id || `p${index + 1}`,
            background: page.background || '#ffffff',
            children: Array.isArray(page.children)
                ? page.children
                    .filter((child) => child && typeof child === 'object')
                    .map((child) => ({
                        id: child.id || uid(child.type || 'el'),
                        type: child.type || 'figure',
                        x: Number(child.x || 0),
                        y: Number(child.y || 0),
                        width: Number(child.width || 100),
                        height: Number(child.height || 100),
                        ...child,
                    }))
                : [],
            width: page.width || 'auto',
            height: page.height || 'auto',
            duration: page.duration || 5000,
        }));
        return next;
    }
    return {
        width,
        height,
        fonts: [],
        pages: [{
            id: 'p1',
            background: '#ffffff',
            children: [],
            width: 'auto',
            height: 'auto',
            duration: 5000,
        }],
    };
}

function getPage(doc) {
    return doc?.pages?.[0] || null;
}

function getElementLabel(el) {
    if (!el) return 'Elemento';
    if (el.name) return el.name;
    if (el.type === 'text') return String(el.text || 'Texto').slice(0, 28);
    if (el.type === 'image') return 'Imagen';
    if (el.type === 'figure') return el.subType === 'circle' ? 'Circulo' : 'Forma';
    return el.type || 'Elemento';
}

function getChildren(page) {
    return (page?.children || []).filter((el) => el && typeof el === 'object');
}

function colorToCanvas(value) {
    return value || '#111827';
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    let cursorY = y;
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
            ctx.fillText(line, x, cursorY);
            line = word;
            cursorY += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line) ctx.fillText(line, x, cursorY);
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function computeImagePlacement(img, el) {
    const w = Number(el.width || 100);
    const h = Number(el.height || 100);
    const mode = el.objectFit || 'contain';
    const baseScale = mode === 'cover'
        ? Math.max(w / img.naturalWidth, h / img.naturalHeight)
        : Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const scale = baseScale * Number(el.cropZoom || 1);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const cropX = Number(el.cropX || 0);
    const cropY = Number(el.cropY || 0);
    return {
        dw,
        dh,
        dx: (w - dw) / 2 + (cropX / 100) * w,
        dy: (h - dh) / 2 + (cropY / 100) * h,
    };
}

function drawElement(ctx, el, imageCache, options = {}) {
    if (!el || typeof el !== 'object') return;
    const x = Number(el.x || 0);
    const y = Number(el.y || 0);
    const w = Number(el.width || 100);
    const h = Number(el.height || 100);

    ctx.save();
    if (el.rotation) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((Number(el.rotation) * Math.PI) / 180);
        ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    if (el.type === 'figure') {
        ctx.fillStyle = colorToCanvas(el.fill);
        if (el.subType === 'circle') {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const radius = Math.min(Number(el.cornerRadius || 0), Math.min(w, h) / 2);
            if (radius && ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, radius);
                ctx.fill();
            } else {
                ctx.fillRect(x, y, w, h);
            }
        }
    }

    if (el.type === 'image') {
        const img = imageCache.current.get(el.src);
        if (img?.complete && img.naturalWidth > 0) {
            const opacity = Number(el.opacity ?? 1);
            const placement = computeImagePlacement(img, el);
            ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.drawImage(img, x + placement.dx, y + placement.dy, placement.dw, placement.dh);
            ctx.restore();
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#cbd5e1';
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Cargando imagen...', x + w / 2, y + h / 2 - 14);
        }
    }

    if (el.type === 'text') {
        const fontSize = Number(el.fontSize || 42);
        const weight = el.fontWeight || 700;
        ctx.font = `${weight} ${fontSize}px ${el.fontFamily || DEFAULT_FONT}`;
        ctx.fillStyle = colorToCanvas(el.fill);
        ctx.textBaseline = 'top';
        ctx.textAlign = el.align || 'left';
        const drawX = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x;
        drawWrappedText(ctx, el.text, drawX, y, w, fontSize * Number(el.lineHeight || 1.15));
    }

    if (options.selected) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#2563eb';
        const handles = [
            [x - 7, y - 7],
            [x + w - 7, y - 7],
            [x - 7, y + h - 7],
            [x + w - 7, y + h - 7],
        ];
        for (const [hx, hy] of handles) ctx.fillRect(hx, hy, 14, 14);
    }

    ctx.restore();
}

function hitTest(el, px, py) {
    if (!el || typeof el !== 'object') return false;
    const x = Number(el.x || 0);
    const y = Number(el.y || 0);
    const w = Number(el.width || 100);
    const h = Number(el.height || 100);
    return px >= x && px <= x + w && py >= y && py <= y + h;
}

function getResizeHandle(el, px, py) {
    if (!el || typeof el !== 'object') return null;
    const x = Number(el.x || 0);
    const y = Number(el.y || 0);
    const w = Number(el.width || 100);
    const h = Number(el.height || 100);
    const hitSize = 24;
    const handles = [
        ['nw', x, y],
        ['ne', x + w, y],
        ['sw', x, y + h],
        ['se', x + w, y + h],
    ];
    const match = handles.find(([, hx, hy]) => Math.abs(px - hx) <= hitSize && Math.abs(py - hy) <= hitSize);
    return match?.[0] || null;
}

function getResizedBox(drag, point) {
    const minSize = 32;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    let x = drag.x;
    let y = drag.y;
    let width = drag.width;
    let height = drag.height;

    if (drag.handle.includes('e')) width = drag.width + dx;
    if (drag.handle.includes('s')) height = drag.height + dy;
    if (drag.handle.includes('w')) {
        width = drag.width - dx;
        x = drag.x + dx;
    }
    if (drag.handle.includes('n')) {
        height = drag.height - dy;
        y = drag.y + dy;
    }

    width = Math.max(minSize, width);
    height = Math.max(minSize, height);

    if (drag.keepRatio) {
        const ratio = drag.width / drag.height || 1;
        const widthPressure = Math.abs(width - drag.width) / Math.max(drag.width, 1);
        const heightPressure = Math.abs(height - drag.height) / Math.max(drag.height, 1);
        if (widthPressure >= heightPressure) {
            height = Math.max(minSize, width / ratio);
        } else {
            width = Math.max(minSize, height * ratio);
        }
        if (drag.handle.includes('w')) x = drag.x + drag.width - width;
        if (drag.handle.includes('n')) y = drag.y + drag.height - height;
    }

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    };
}

const MotoflowStudioEditor = forwardRef(function MotoflowStudioEditor({ content, width, height }, ref) {
    const canvasRef = useRef(null);
    const uploadRef = useRef(null);
    const replaceUploadRef = useRef(null);
    const imageCache = useRef(new Map());
    const dragRef = useRef(null);
    const [doc, setDoc] = useState(() => normalizeDocument(content, width, height));
    const [selectedId, setSelectedId] = useState(null);
    const [zoom, setZoom] = useState(0.54);
    const [imageVersion, setImageVersion] = useState(0);

    const page = getPage(doc);
    const selected = useMemo(() => {
        return getChildren(page).find((el) => el.id === selectedId) || null;
    }, [page, selectedId]);

    const requestImage = useCallback((src) => {
        if (!src || imageCache.current.has(src)) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImageVersion((v) => v + 1);
        img.onerror = () => setImageVersion((v) => v + 1);
        imageCache.current.set(src, img);
        img.src = src;
    }, []);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !page) return;
        const ctx = canvas.getContext('2d');
        const docWidth = Number(doc.width || width || 1080);
        const docHeight = Number(doc.height || height || 1080);
        canvas.width = docWidth;
        canvas.height = docHeight;
        ctx.clearRect(0, 0, docWidth, docHeight);
        ctx.fillStyle = page.background || '#ffffff';
        ctx.fillRect(0, 0, docWidth, docHeight);
        for (const el of getChildren(page)) {
            if (el.type === 'image') requestImage(el.src);
            drawElement(ctx, el, imageCache, { selected: el.id === selectedId });
        }
    }, [doc, height, imageVersion, page, requestImage, selectedId, width]);

    useEffect(() => {
        render();
    }, [render]);

    useEffect(() => {
        setDoc(normalizeDocument(content, width, height));
        setSelectedId(null);
    }, [content, width, height]);

    const updateSelected = useCallback((patch) => {
        if (!selectedId) return;
        setDoc((prev) => {
            const next = clone(prev);
            const p = getPage(next);
            p.children = getChildren(p).map((el) => el.id === selectedId ? { ...el, ...patch } : el);
            return next;
        });
    }, [selectedId]);

    const addElement = useCallback((element) => {
        const el = {
            id: element.id || uid(element.type || 'el'),
            x: 80,
            y: 80,
            width: 420,
            height: element.type === 'text' ? 120 : 320,
            ...element,
        };
        setDoc((prev) => {
            const next = clone(prev);
            getPage(next).children.push(el);
            return next;
        });
        setSelectedId(el.id);
    }, []);

    const removeSelected = useCallback(() => {
        if (!selectedId) return;
        setDoc((prev) => {
            const next = clone(prev);
            const p = getPage(next);
            p.children = getChildren(p).filter((el) => el.id !== selectedId);
            return next;
        });
        setSelectedId(null);
    }, [selectedId]);

    const duplicateSelected = useCallback(() => {
        if (!selected) return;
        const copyEl = { ...clone(selected), id: uid(selected.type || 'el'), x: Number(selected.x || 0) + 32, y: Number(selected.y || 0) + 32, name: `${getElementLabel(selected)} copia` };
        setDoc((prev) => {
            const next = clone(prev);
            getPage(next).children.push(copyEl);
            return next;
        });
        setSelectedId(copyEl.id);
    }, [selected]);

    const moveSelectedLayer = useCallback((direction) => {
        if (!selectedId) return;
        setDoc((prev) => {
            const next = clone(prev);
            const p = getPage(next);
            p.children = getChildren(p);
            const index = p.children.findIndex((el) => el.id === selectedId);
            if (index < 0) return prev;
            const [item] = p.children.splice(index, 1);
            const target = direction === 'front' ? p.children.length : 0;
            p.children.splice(target, 0, item);
            return next;
        });
    }, [selectedId]);

    const centerSelected = useCallback(() => {
        if (!selected) return;
        const docWidth = Number(doc.width || width || 1080);
        const docHeight = Number(doc.height || height || 1080);
        updateSelected({
            x: Math.round((docWidth - Number(selected.width || 100)) / 2),
            y: Math.round((docHeight - Number(selected.height || 100)) / 2),
        });
    }, [doc.height, doc.width, height, selected, updateSelected, width]);

    const renderDocumentToCanvas = useCallback(async (pixelRatio = 1) => {
        const docWidth = Number(doc.width || width || 1080);
        const docHeight = Number(doc.height || height || 1080);
        const out = document.createElement('canvas');
        out.width = docWidth * pixelRatio;
        out.height = docHeight * pixelRatio;
        const ctx = out.getContext('2d');
        ctx.scale(pixelRatio, pixelRatio);
        ctx.fillStyle = page?.background || '#ffffff';
        ctx.fillRect(0, 0, docWidth, docHeight);
        for (const el of getChildren(page)) {
            if (el.type === 'image' && el.src) {
                await new Promise((resolve) => {
                    const cached = imageCache.current.get(el.src);
                    if (cached?.complete) return resolve();
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = resolve;
                    img.onerror = resolve;
                    imageCache.current.set(el.src, img);
                    img.src = el.src;
                });
            }
            drawElement(ctx, el, imageCache);
        }
        return out;
    }, [doc, height, page, width]);

    useImperativeHandle(ref, () => ({
        toJSON: () => clone(doc),
        toBlob: async ({ mimeType = 'image/png', pixelRatio = 1 } = {}) => {
            const canvas = await renderDocumentToCanvas(pixelRatio);
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseno.')), mimeType);
            });
        },
        getSelectedElement: () => selected,
        setSelectedElement: updateSelected,
        addElement,
    }), [addElement, doc, renderDocumentToCanvas, selected, updateSelected]);

    const canvasPoint = (event) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const docWidth = Number(doc.width || width || 1080);
        const docHeight = Number(doc.height || height || 1080);
        return {
            x: ((event.clientX - rect.left) / rect.width) * docWidth,
            y: ((event.clientY - rect.top) / rect.height) * docHeight,
        };
    };

    const onPointerDown = (event) => {
        const point = canvasPoint(event);
        const children = getChildren(page);
        const selectedElement = children.find((el) => el.id === selectedId);
        const handle = getResizeHandle(selectedElement, point.x, point.y);
        if (selectedElement && handle) {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragRef.current = {
                mode: 'resize',
                handle,
                id: selectedElement.id,
                startX: point.x,
                startY: point.y,
                x: Number(selectedElement.x || 0),
                y: Number(selectedElement.y || 0),
                width: Number(selectedElement.width || 100),
                height: Number(selectedElement.height || 100),
                keepRatio: selectedElement.type === 'image' && !event.shiftKey,
            };
            return;
        }

        const found = [...children].reverse().find((el) => hitTest(el, point.x, point.y));
        setSelectedId(found?.id || null);
        if (found) {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dragRef.current = {
                mode: 'move',
                id: found.id,
                startX: point.x,
                startY: point.y,
                x: Number(found.x || 0),
                y: Number(found.y || 0),
            };
        }
    };

    const onPointerMove = (event) => {
        if (!dragRef.current) return;
        const point = canvasPoint(event);
        const drag = dragRef.current;
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;
        const id = drag.id;
        setDoc((prev) => {
            const next = clone(prev);
            const p = getPage(next);
            p.children = getChildren(p).map((el) => {
                if (el.id !== id) return el;
                if (drag.mode === 'resize') {
                    return {
                        ...el,
                        ...getResizedBox(drag, point),
                    };
                }
                return {
                    ...el,
                    x: Math.round(drag.x + dx),
                    y: Math.round(drag.y + dy),
                };
            });
            return next;
        });
    };

    const onPointerUp = () => {
        dragRef.current = null;
    };

    const handleImageUpload = (file, replaceSelected = false) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const src = reader.result;
            try {
                const img = await loadImageElement(src);
                imageCache.current.set(src, img);
            } catch (_) {
                // aunque falle la precarga, dejamos que el canvas intente cargarla
            }
            if (replaceSelected && selected?.type === 'image') {
                updateSelected({ src, cropX: 0, cropY: 0, cropZoom: 1, objectFit: 'contain' });
                setImageVersion((v) => v + 1);
                return;
            }
            addElement({
                type: 'image',
                name: 'imagen',
                src,
                x: 120,
                y: 120,
                width: 520,
                height: 420,
                objectFit: 'contain',
                cropZoom: 1,
                cropX: 0,
                cropY: 0,
                opacity: 1,
            });
            setImageVersion((v) => v + 1);
        };
        reader.readAsDataURL(file);
        if (uploadRef.current) uploadRef.current.value = '';
    };

    return (
        <div className="h-full grid grid-cols-[300px_minmax(0,1fr)_340px] bg-slate-100">
            <aside className="bg-white border-r p-3 space-y-3 overflow-y-auto">
                <p className="text-[11px] font-black uppercase text-slate-500">Herramientas</p>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => addElement({
                        type: 'text',
                        text: 'Nuevo texto',
                        fontSize: 56,
                        fontWeight: 900,
                        fill: '#0f172a',
                        width: 540,
                        height: 120,
                    })}>
                        <Type className="h-4 w-4 mr-1" /> Texto
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => addElement({
                        type: 'figure',
                        subType: 'rect',
                        fill: '#2563eb',
                        width: 260,
                        height: 160,
                    })}>
                        <Square className="h-4 w-4 mr-1" /> Forma
                    </Button>
                </div>
                <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e.target.files?.[0])} />
                <Button className="w-full" variant="outline" size="sm" onClick={() => uploadRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> Subir imagen
                </Button>

                <div className="grid grid-cols-2 gap-2 border-t pt-3">
                    <Button variant="outline" size="sm" disabled={!selected} onClick={duplicateSelected}>
                        <Copy className="h-4 w-4 mr-1" /> Duplicar
                    </Button>
                    <Button variant="outline" size="sm" disabled={!selected} onClick={centerSelected}>
                        <AlignCenter className="h-4 w-4 mr-1" /> Centrar
                    </Button>
                    <Button variant="outline" size="sm" disabled={!selected} onClick={() => moveSelectedLayer('front')}>
                        <BringToFront className="h-4 w-4 mr-1" /> Frente
                    </Button>
                    <Button variant="outline" size="sm" disabled={!selected} onClick={() => moveSelectedLayer('back')}>
                        <SendToBack className="h-4 w-4 mr-1" /> Fondo
                    </Button>
                </div>

                <div className="border-t pt-3 space-y-2">
                    <p className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> Capas
                    </p>
                    <div className="space-y-1">
                        {[...getChildren(page)].reverse().map((el) => (
                            <button
                                key={el.id}
                                onClick={() => setSelectedId(el.id)}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs truncate border ${selectedId === el.id ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                {getElementLabel(el)}
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="min-w-0 flex flex-col">
                <div className="h-10 bg-white border-b px-3 flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.2, z - 0.08))}>-</Button>
                    <span className="text-xs font-semibold text-slate-500 w-14 text-center">{Math.round(zoom * 100)}%</span>
                    <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(1.4, z + 0.08))}>+</Button>
                </div>
                <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
                    <canvas
                        ref={canvasRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                        className="bg-white shadow-xl border border-slate-300 touch-none"
                        style={{
                            width: `${Number(doc.width || width || 1080) * zoom}px`,
                            height: `${Number(doc.height || height || 1080) * zoom}px`,
                        }}
                    />
                </div>
            </main>

            <aside className="bg-white border-l p-3 space-y-3 overflow-y-auto">
                <p className="text-[11px] font-black uppercase text-slate-500">Propiedades</p>
                {!selected ? (
                    <div className="h-40 rounded border border-dashed flex flex-col items-center justify-center text-slate-400 text-xs text-center px-4">
                        <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
                        Selecciona un elemento para editarlo.
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <Label className="text-[10px] font-bold uppercase">Nombre</Label>
                            <Input className="h-8 text-xs" value={selected.name || ''} onChange={(e) => updateSelected({ name: e.target.value })} />
                        </div>
                        {selected.type === 'text' && (
                            <>
                                <div>
                                    <Label className="text-[10px] font-bold uppercase">Texto</Label>
                                    <textarea
                                        value={selected.text || ''}
                                        onChange={(e) => updateSelected({ text: e.target.value })}
                                        className="w-full min-h-[92px] rounded border border-slate-300 p-2 text-xs"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[10px] font-bold uppercase">Tamano</Label>
                                    <Input type="number" className="h-8 text-xs" value={selected.fontSize || 42} onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })} />
                                </div>
                            </>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-[10px] font-bold uppercase">X</Label>
                                <Input type="number" className="h-8 text-xs" value={Math.round(selected.x || 0)} onChange={(e) => updateSelected({ x: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase">Y</Label>
                                <Input type="number" className="h-8 text-xs" value={Math.round(selected.y || 0)} onChange={(e) => updateSelected({ y: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase">Ancho</Label>
                                <Input type="number" className="h-8 text-xs" value={Math.round(selected.width || 100)} onChange={(e) => updateSelected({ width: Number(e.target.value) })} />
                            </div>
                            <div>
                                <Label className="text-[10px] font-bold uppercase">Alto</Label>
                                <Input type="number" className="h-8 text-xs" value={Math.round(selected.height || 100)} onChange={(e) => updateSelected({ height: Number(e.target.value) })} />
                            </div>
                        </div>
                        {(selected.type === 'text' || selected.type === 'figure') && (
                            <div>
                                <Label className="text-[10px] font-bold uppercase">Color</Label>
                                <Input type="color" className="h-9 p-1" value={selected.fill || '#111827'} onChange={(e) => updateSelected({ fill: e.target.value })} />
                            </div>
                        )}
                        {selected.type === 'image' && (
                            <div className="rounded border border-violet-100 bg-violet-50/50 p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-black uppercase text-violet-800">Edicion de imagen</p>
                                    <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => replaceUploadRef.current?.click()}>
                                        <Upload className="h-3.5 w-3.5 mr-1" /> Reemplazar
                                    </Button>
                                    <input
                                        ref={replaceUploadRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleImageUpload(e.target.files?.[0], true)}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={selected.objectFit === 'contain' ? 'default' : 'outline'}
                                        className="h-8 text-[11px]"
                                        onClick={() => updateSelected({ objectFit: 'contain', cropZoom: 1, cropX: 0, cropY: 0 })}
                                    >
                                        Ajustar
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={selected.objectFit === 'cover' ? 'default' : 'outline'}
                                        className="h-8 text-[11px]"
                                        onClick={() => updateSelected({ objectFit: 'cover', cropZoom: Math.max(1, Number(selected.cropZoom || 1)) })}
                                    >
                                        Rellenar
                                    </Button>
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold uppercase flex items-center gap-1">
                                        <Maximize2 className="h-3 w-3" /> Zoom interno
                                    </Label>
                                    <Input
                                        type="range"
                                        min="0.5"
                                        max="5"
                                        step="0.05"
                                        value={selected.cropZoom || 1}
                                        onChange={(e) => updateSelected({ cropZoom: Number(e.target.value) })}
                                    />
                                    <div className="text-[10px] text-slate-500 text-right">{Number(selected.cropZoom || 1).toFixed(2)}x</div>
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold uppercase flex items-center gap-1">
                                        <MoveHorizontal className="h-3 w-3" /> Mover dentro horizontal
                                    </Label>
                                    <Input
                                        type="range"
                                        min="-100"
                                        max="100"
                                        step="1"
                                        value={selected.cropX || 0}
                                        onChange={(e) => updateSelected({ cropX: Number(e.target.value) })}
                                    />
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold uppercase flex items-center gap-1">
                                        <MoveVertical className="h-3 w-3" /> Mover dentro vertical
                                    </Label>
                                    <Input
                                        type="range"
                                        min="-100"
                                        max="100"
                                        step="1"
                                        value={selected.cropY || 0}
                                        onChange={(e) => updateSelected({ cropY: Number(e.target.value) })}
                                    />
                                </div>

                                <div>
                                    <Label className="text-[10px] font-bold uppercase">Opacidad</Label>
                                    <Input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={selected.opacity ?? 1}
                                        onChange={(e) => updateSelected({ opacity: Number(e.target.value) })}
                                    />
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-8 text-[11px]"
                                    onClick={() => updateSelected({ objectFit: 'contain', cropZoom: 1, cropX: 0, cropY: 0, opacity: 1 })}
                                >
                                    Restablecer encuadre
                                </Button>
                            </div>
                        )}
                        <Button variant="outline" className="w-full text-red-600 hover:text-red-700" onClick={removeSelected}>
                            <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                        </Button>
                    </div>
                )}
            </aside>
        </div>
    );
});

export default MotoflowStudioEditor;
