import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BadgePlus,
    ArrowDown,
    ArrowUp,
    Captions,
    Copy,
    Download,
    Eye,
    EyeOff,
    Film,
    FolderOpen,
    Gauge,
    Image as ImageIcon,
    Layers,
    Lock,
    Loader2,
    Monitor,
    Music,
    Pause,
    Play,
    Plus,
    RotateCw,
    Redo2,
    Save,
    Scissors,
    Smile,
    Smartphone,
    Sparkles,
    Square,
    Trash2,
    Type,
    Unlock,
    Undo2,
    Upload,
    Volume2,
    Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
    createCaptutProject,
    deleteCaptutProject,
    duplicateCaptutProject,
    getCaptutProject,
    listCaptutProjects,
    saveCaptutAudioTrack,
    saveCaptutRendered,
    saveCaptutSourceVideo,
    saveCaptutThumbnail,
    updateCaptutProject,
} from '@/services/captutProService';

const ASPECTS = {
    vertical: { label: '9:16', icon: Smartphone, className: 'aspect-[9/16] max-h-[68vh]' },
    square: { label: '1:1', icon: Square, className: 'aspect-square max-h-[66vh]' },
    landscape: { label: '16:9', icon: Monitor, className: 'aspect-video w-full' },
};

const FILTERS = [
    { key: 'none', label: 'Original', css: 'none' },
    { key: 'cinema', label: 'Cine', css: 'contrast(1.12) saturate(0.95) brightness(0.92)' },
    { key: 'vivid', label: 'Vivo', css: 'contrast(1.08) saturate(1.35)' },
    { key: 'warm', label: 'Calido', css: 'sepia(0.18) saturate(1.12) brightness(1.03)' },
    { key: 'mono', label: 'B/N', css: 'grayscale(1) contrast(1.12)' },
];

const DEFAULT_COLOR_ADJUST = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    blur: 0,
};

const buildVideoFilterCss = (presetCss, adjust = DEFAULT_COLOR_ADJUST) => {
    const base = presetCss && presetCss !== 'none' ? presetCss : '';
    const custom = [
        `brightness(${Number(adjust.brightness ?? 1)})`,
        `contrast(${Number(adjust.contrast ?? 1)})`,
        `saturate(${Number(adjust.saturation ?? 1)})`,
        `blur(${Number(adjust.blur ?? 0)}px)`,
    ].join(' ');
    return `${base} ${custom}`.trim() || 'none';
};

const DEFAULT_TEXT = {
    id: 'txt-title',
    text: 'OFERTA ESPECIAL',
    x: 50,
    y: 18,
    size: 42,
    color: '#ffffff',
    bg: '#111827',
    weight: 900,
    start: 0,
    end: 9999,
    animation: 'pop',
    visible: true,
    locked: false,
};

const STICKER_PRESETS = ['🔥', '⚡', '⭐', '💥', '✅', '💰', '🏍️', '📍'];

const ANIMATIONS = [
    { key: 'none', label: 'Sin animacion' },
    { key: 'fade', label: 'Fade' },
    { key: 'pop', label: 'Pop' },
    { key: 'slide-up', label: 'Subir' },
    { key: 'slide-left', label: 'Izquierda' },
];

const VIDEO_TEMPLATES = [
    {
        key: 'oferta-relampago',
        label: 'Oferta',
        description: 'Hook + precio + CTA',
        accent: '#06b6d4',
        sticker: '🔥',
        captions: ['Oferta por tiempo limitado', 'Escribenos ahora y separa el tuyo'],
        texts: [
            { text: 'OFERTA RELAMPAGO', y: 16, size: 44, bg: '#0f172a', animation: 'pop' },
            { text: 'PRECIO ESPECIAL HOY', y: 72, size: 34, bg: '#0891b2', animation: 'slide-up' },
        ],
    },
    {
        key: 'nuevo-producto',
        label: 'Nuevo',
        description: 'Presentacion rapida',
        accent: '#22c55e',
        sticker: '⭐',
        captions: ['Nuevo producto disponible', 'Pide mas informacion por WhatsApp'],
        texts: [
            { text: 'NUEVO EN INVENTARIO', y: 18, size: 40, bg: '#14532d', animation: 'slide-left' },
            { text: 'DISPONIBLE AHORA', y: 76, size: 34, bg: '#16a34a', animation: 'pop' },
        ],
    },
    {
        key: 'promo-moto',
        label: 'Moto',
        description: 'Repuesto destacado',
        accent: '#f59e0b',
        sticker: '🏍️',
        captions: ['Dale mantenimiento a tiempo', 'Tenemos la pieza que necesitas'],
        texts: [
            { text: 'REPUESTO DESTACADO', y: 15, size: 38, bg: '#78350f', animation: 'fade' },
            { text: 'CALIDAD Y GARANTIA', y: 74, size: 32, bg: '#d97706', animation: 'slide-up' },
        ],
    },
];

const SCRIPT_TONES = [
    { key: 'urgente', label: 'Urgente', hook: 'No lo dejes para manana', cta: 'Escribenos ahora y separa el tuyo' },
    { key: 'premium', label: 'Premium', hook: 'Calidad que se nota desde el primer uso', cta: 'Pidelo con asesoria personalizada' },
    { key: 'popular', label: 'Popular', hook: 'Este es de los mas buscados', cta: 'Pregunta disponibilidad por WhatsApp' },
];

const createDefaultTracks = (duration = 0) => [
    { id: 'clip-main', type: 'video', name: 'Clip principal', start: 0, end: duration, color: 'bg-sky-500' },
    { id: 'audio-main', type: 'audio', name: 'Audio original', start: 0, end: duration, color: 'bg-emerald-500' },
];

const createCaption = (start = 0, end = start + 3, text = 'Nuevo subtitulo') => ({
    id: `cap-${Date.now()}-${Math.round(start * 1000)}`,
    start,
    end,
    text,
});

const createSticker = (emoji = '🔥') => ({
    id: `sticker-${Date.now()}`,
    emoji,
    x: 76,
    y: 28,
    size: 64,
    rotation: -8,
    start: 0,
    end: 9999,
    animation: 'pop',
    visible: true,
    locked: false,
});

const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatSrtTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const millis = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const captionsToSrt = (captions) => captions
    .map((caption, index) => [
        String(index + 1),
        `${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}`,
        caption.text,
    ].join('\n'))
    .join('\n\n');

const parseSrtTime = (value = '') => {
    const match = value.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!match) return 0;
    const [, hours, mins, secs, millis] = match;
    return Number(hours) * 3600 + Number(mins) * 60 + Number(secs) + Number(`0.${millis.padEnd(3, '0').slice(0, 3)}`);
};

const parseSrt = (text) => text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => {
        const lines = block.split('\n').filter(Boolean);
        const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
        if (timeLineIndex === -1) return null;
        const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((part) => part.trim());
        const captionText = lines.slice(timeLineIndex + 1).join(' ').trim();
        if (!captionText) return null;
        return createCaption(parseSrtTime(startRaw), parseSrtTime(endRaw), captionText);
    })
    .filter(Boolean);

const wrapCanvasText = (ctx, text, maxWidth) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxWidth || !line) {
            line = testLine;
        } else {
            lines.push(line);
            line = word;
        }
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
};

const splitTranscriptIntoCaptionLines = (text) => {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    const sentences = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const source = sentences.length > 1 ? sentences : cleaned.split(/[,;]\s+|\s+-\s+/).filter(Boolean);

    const lines = [];
    source.forEach((chunk) => {
        const words = chunk.split(/\s+/).filter(Boolean);
        let line = '';
        words.forEach((word) => {
            const next = line ? `${line} ${word}` : word;
            if (next.length <= 46 || !line) {
                line = next;
            } else {
                lines.push(line);
                line = word;
            }
        });
        if (line) lines.push(line);
    });
    return lines;
};

const getRenderSize = (aspect) => {
    if (aspect === 'landscape') return { width: 1280, height: 720 };
    if (aspect === 'square') return { width: 1080, height: 1080 };
    return { width: 1080, height: 1920 };
};

const getLayerMotion = (item, currentTime = 0, { distance = 70 } = {}) => {
    const start = Number(item.start ?? 0);
    const end = Number(item.end ?? 9999);
    if (currentTime < start || currentTime > end) return { visible: false, opacity: 0, scale: 1, dx: 0, dy: 0 };

    const fadeIn = Math.min(0.45, Math.max(0.12, (end - start) / 4));
    const fadeOut = fadeIn;
    const inProgress = Math.min(1, Math.max(0, (currentTime - start) / fadeIn));
    const outProgress = Math.min(1, Math.max(0, (end - currentTime) / fadeOut));
    const progress = Math.min(inProgress, outProgress);
    const eased = 1 - Math.pow(1 - progress, 3);
    const animation = item.animation || 'none';

    const motion = { visible: true, opacity: 1, scale: 1, dx: 0, dy: 0 };
    if (animation === 'fade') motion.opacity = eased;
    if (animation === 'pop') {
        motion.opacity = eased;
        motion.scale = 0.82 + eased * 0.18;
    }
    if (animation === 'slide-up') {
        motion.opacity = eased;
        motion.dy = (1 - eased) * distance;
    }
    if (animation === 'slide-left') {
        motion.opacity = eased;
        motion.dx = (1 - eased) * distance;
    }
    return motion;
};

const getLayerPreviewStyle = (item, currentTime, baseTransform = 'translate(-50%, -50%)') => {
    const motion = getLayerMotion(item, currentTime, { distance: 18 });
    if (!motion.visible) return { display: 'none' };
    return {
        opacity: motion.opacity,
        transform: `${baseTransform} translate(${motion.dx}px, ${motion.dy}px) scale(${motion.scale})`,
    };
};

const drawEditedFrame = ({ canvas, video, texts, stickers = [], captions = [], currentTime = 0, filterCss, aspect, videoTransform = {} }) => {
    const { width, height } = getRenderSize(aspect);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const videoWidth = video.videoWidth || width;
    const videoHeight = video.videoHeight || height;
    const fit = videoTransform.fit || 'cover';
    const zoom = Number(videoTransform.zoom || 1);
    const baseScale = fit === 'contain'
        ? Math.min(width / videoWidth, height / videoHeight)
        : Math.max(width / videoWidth, height / videoHeight);
    const scale = baseScale * zoom;
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    const dx = (width - drawWidth) / 2 + (Number(videoTransform.x || 0) / 100) * width;
    const dy = (height - drawHeight) / 2 + (Number(videoTransform.y || 0) / 100) * height;

    ctx.save();
    ctx.filter = filterCss;
    ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
    ctx.restore();

    texts.forEach((item) => {
        if (item.visible === false) return;
        const motion = getLayerMotion(item, currentTime, { distance: height * 0.05 });
        if (!motion.visible) return;
        const x = (item.x / 100) * width + motion.dx;
        const y = (item.y / 100) * height + motion.dy;
        const fontSize = Math.max(28, item.size * 1.9);
        ctx.save();
        ctx.globalAlpha = motion.opacity;
        ctx.translate(x, y);
        ctx.scale(motion.scale, motion.scale);
        ctx.font = `${item.weight} ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(item.text);
        const padX = Math.max(24, fontSize * 0.42);
        const padY = Math.max(14, fontSize * 0.28);

        ctx.fillStyle = item.bg;
        ctx.globalAlpha = motion.opacity * 0.82;
        ctx.fillRect(-metrics.width / 2 - padX, -fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2);
        ctx.globalAlpha = motion.opacity;
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
    });

    stickers.forEach((item) => {
        if (item.visible === false) return;
        const motion = getLayerMotion(item, currentTime, { distance: height * 0.05 });
        if (!motion.visible) return;
        const x = (item.x / 100) * width + motion.dx;
        const y = (item.y / 100) * height + motion.dy;
        const size = Math.max(24, item.size * 1.8);
        ctx.save();
        ctx.globalAlpha = motion.opacity;
        ctx.translate(x, y);
        ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);
        ctx.scale(motion.scale, motion.scale);
        ctx.font = `${size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = Math.max(10, size * 0.18);
        ctx.fillText(item.emoji, 0, 0);
        ctx.restore();
    });

    const activeCaption = captions.find((caption) => currentTime >= caption.start && currentTime <= caption.end);
    if (activeCaption) {
        const fontSize = Math.round(Math.max(34, height * 0.038));
        const maxWidth = width * 0.82;
        ctx.font = `900 ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = wrapCanvasText(ctx, activeCaption.text, maxWidth);
        const lineHeight = fontSize * 1.22;
        const boxWidth = Math.min(maxWidth + fontSize, Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + fontSize);
        const boxHeight = lines.length * lineHeight + fontSize * 0.7;
        const boxX = (width - boxWidth) / 2;
        const boxY = height * 0.79 - boxHeight / 2;

        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.72;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(4, fontSize * 0.09);
        lines.forEach((line, index) => {
            const y = boxY + fontSize * 0.55 + index * lineHeight;
            ctx.strokeText(line, width / 2, y);
            ctx.fillText(line, width / 2, y);
        });
    }
};

const getRecorderMime = () => {
    const candidates = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
    ];
    return candidates.find((mime) => window.MediaRecorder?.isTypeSupported?.(mime)) || '';
};

const canvasToBlob = (canvas, type = 'image/png', quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar el archivo desde el canvas.'));
    }, type, quality);
});

export default function CaptutPro() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const renderCanvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const audioInputRef = useRef(null);
    const bgAudioRef = useRef(null);
    const srtInputRef = useRef(null);
    const renderFrameRef = useRef(null);
    const historyBaseRef = useRef('');
    const historyApplyingRef = useRef(false);
    const historyTimerRef = useRef(null);
    const mediaStateRef = useRef(null);
    const audioTrackStateRef = useRef(null);
    const { toast } = useToast();
    const { tenantId, user } = useAuth();

    const [projectId, setProjectId] = useState(null);
    const [projectName, setProjectName] = useState('Captut Pro - Nuevo video');
    const [media, setMedia] = useState(null);
    const [sourceMediaName, setSourceMediaName] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [renderedUrl, setRenderedUrl] = useState('');
    const [audioTrack, setAudioTrack] = useState(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [aspect, setAspect] = useState('vertical');
    const [filter, setFilter] = useState('cinema');
    const [colorAdjust, setColorAdjust] = useState(DEFAULT_COLOR_ADJUST);
    const [videoTransform, setVideoTransform] = useState({ fit: 'cover', zoom: 1, x: 0, y: 0 });
    const [speed, setSpeed] = useState(1);
    const [volume, setVolume] = useState(0.85);
    const [trim, setTrim] = useState({ start: 0, end: 0 });
    const [tracks, setTracks] = useState(createDefaultTracks());
    const [texts, setTexts] = useState([DEFAULT_TEXT]);
    const [selectedTextId, setSelectedTextId] = useState(DEFAULT_TEXT.id);
    const [stickers, setStickers] = useState([]);
    const [selectedStickerId, setSelectedStickerId] = useState(null);
    const [captions, setCaptions] = useState([]);
    const [selectedCaptionId, setSelectedCaptionId] = useState(null);
    const [transcriptDraft, setTranscriptDraft] = useState('');
    const [rendering, setRendering] = useState(false);
    const [renderProgress, setRenderProgress] = useState(0);
    const [savingProject, setSavingProject] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
    const [lastSavedFingerprint, setLastSavedFingerprint] = useState('');
    const autoSaveTimerRef = useRef(null);
    const [undoHistory, setUndoHistory] = useState([]);
    const [redoHistory, setRedoHistory] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [savedProjects, setSavedProjects] = useState([]);
    const [scriptBrief, setScriptBrief] = useState({
        product: '',
        price: '',
        benefit: '',
        tone: 'urgente',
    });

    const selectedText = texts.find((t) => t.id === selectedTextId) || texts[0];
    const selectedSticker = stickers.find((sticker) => sticker.id === selectedStickerId) || null;
    const selectedCaption = captions.find((caption) => caption.id === selectedCaptionId) || null;
    const activeCaption = captions.find((caption) => currentTime >= caption.start && currentTime <= caption.end);
    const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0];
    const videoFilterCss = buildVideoFilterCss(activeFilter.css, colorAdjust);
    const playableDuration = Math.max(0, (trim.end || duration) - trim.start);

    const timelineTicks = useMemo(() => {
        const total = Math.max(duration, 1);
        return Array.from({ length: 7 }, (_, i) => Math.round((total / 6) * i));
    }, [duration]);

    const buildProjectContent = useCallback(() => ({
        version: 1,
        name: projectName,
        source: media ? {
            name: media.name,
            size: media.size,
            type: media.type,
            url: sourceUrl || (media.remote ? media.url : null),
            remote: !!media.remote,
        } : {
            name: sourceMediaName || null,
            url: sourceUrl || null,
        },
        duration,
        trim,
        aspect,
        filter,
        colorAdjust,
        videoTransform,
        speed,
        volume,
        audio: audioTrack ? {
            name: audioTrack.name,
            size: audioTrack.size,
            type: audioTrack.type,
            url: audioTrack.url || null,
            volume: audioTrack.volume,
            remote: !!audioTrack.remote,
        } : null,
        texts,
        stickers,
        captions,
        transcriptDraft,
        tracks,
    }), [projectName, media, sourceMediaName, sourceUrl, duration, trim, aspect, filter, colorAdjust, videoTransform, speed, volume, audioTrack, texts, stickers, captions, transcriptDraft, tracks]);

    const projectFingerprint = useMemo(() => JSON.stringify(buildProjectContent()), [buildProjectContent]);
    const hasUnsavedChanges = projectFingerprint !== lastSavedFingerprint;

    const loadProjects = useCallback(async () => {
        if (!tenantId) return;
        setLoadingProjects(true);
        try {
            const data = await listCaptutProjects(tenantId);
            setSavedProjects(data);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setLoadingProjects(false);
        }
    }, [tenantId, toast]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        mediaStateRef.current = media;
    }, [media]);

    useEffect(() => {
        audioTrackStateRef.current = audioTrack;
    }, [audioTrack]);

    const applyEditorContent = useCallback((content = {}, record = {}) => {
        const loadedSourceUrl = record.source_url || content.source?.url || '';
        const loadedSourceName = record.source_name || content.source?.name || '';
        const nextDuration = Number(record.duration || content.duration || 0);
        const currentMedia = mediaStateRef.current;
        const currentAudio = audioTrackStateRef.current;

        setProjectName(record.name || content.name || 'Captut Pro - Proyecto');
        setMedia(loadedSourceUrl ? {
            url: loadedSourceUrl,
            name: loadedSourceName || 'Video fuente',
            size: content.source?.size || 0,
            type: content.source?.type || 'video/mp4',
            remote: true,
        } : (currentMedia?.file && currentMedia.name === loadedSourceName ? currentMedia : null));
        setSourceMediaName(loadedSourceName);
        setSourceUrl(loadedSourceUrl);
        setRenderedUrl(record.rendered_url || '');
        setDuration(nextDuration);
        setCurrentTime(0);
        setPlaying(false);
        setAspect(content.aspect || record.aspect || 'vertical');
        setFilter(content.filter || 'cinema');
        setColorAdjust(content.colorAdjust || DEFAULT_COLOR_ADJUST);
        setVideoTransform(content.videoTransform || { fit: 'cover', zoom: 1, x: 0, y: 0 });
        setSpeed(Number(content.speed || 1));
        setVolume(Number(content.volume ?? 0.85));
        setAudioTrack(content.audio?.url ? {
            url: content.audio.url,
            name: content.audio.name || 'Audio de fondo',
            size: content.audio.size || 0,
            type: content.audio.type || 'audio/mpeg',
            volume: Number(content.audio.volume ?? 0.45),
            remote: true,
        } : (currentAudio?.file && currentAudio.name === content.audio?.name ? currentAudio : null));
        setTrim(content.trim || { start: 0, end: nextDuration });
        setTracks(content.tracks?.length ? content.tracks : createDefaultTracks(nextDuration));
        setTexts(content.texts?.length ? content.texts : [DEFAULT_TEXT]);
        setSelectedTextId(content.texts?.[0]?.id || DEFAULT_TEXT.id);
        setStickers(content.stickers?.length ? content.stickers : []);
        setSelectedStickerId(content.stickers?.[0]?.id || null);
        setCaptions(content.captions?.length ? content.captions : []);
        setSelectedCaptionId(content.captions?.[0]?.id || null);
        setTranscriptDraft(content.transcriptDraft || '');
    }, []);

    const handleFile = (file) => {
        if (!file) return;
        if (!file.type.startsWith('video/')) {
            toast({ variant: 'destructive', title: 'Archivo no valido', description: 'Selecciona un video MP4, MOV o WebM.' });
            return;
        }
        const url = URL.createObjectURL(file);
        setMedia({ url, file, name: file.name, size: file.size, type: file.type, remote: false });
        setSourceMediaName(file.name);
        setSourceUrl('');
        setRenderedUrl('');
        setProjectName(file.name.replace(/\.[^.]+$/, '') || projectName);
        setCurrentTime(0);
        setPlaying(false);
    };

    const handleAudioFile = (file) => {
        if (!file) return;
        if (!file.type.startsWith('audio/')) {
            toast({ variant: 'destructive', title: 'Archivo no valido', description: 'Selecciona un audio MP3, WAV, M4A u OGG.' });
            return;
        }
        const url = URL.createObjectURL(file);
        setAudioTrack({ url, file, name: file.name, size: file.size, type: file.type, volume: 0.45, remote: false });
    };

    const handleLoadedMetadata = () => {
        const nextDuration = videoRef.current?.duration || 0;
        setDuration(nextDuration);
        setTrim({ start: 0, end: nextDuration });
        setTracks((items) => items.length ? items.map((item) => ({ ...item, start: 0, end: item.end || nextDuration })) : createDefaultTracks(nextDuration));
        setTexts((items) => items.map((item) => ({ ...item, end: !item.end || item.end > 9000 ? nextDuration : item.end })));
        setStickers((items) => items.map((item) => ({ ...item, end: !item.end || item.end > 9000 ? nextDuration : item.end })));
    };

    const updateVideoState = (patch) => {
        if (!videoRef.current) return;
        Object.assign(videoRef.current, patch);
    };

    const syncBackgroundAudio = () => {
        const audio = bgAudioRef.current;
        const video = videoRef.current;
        if (!audio || !video || !audioTrack) return;
        audio.volume = audioTrack.volume ?? 0.45;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            audio.currentTime = Math.max(0, video.currentTime - (trim.start || 0)) % audio.duration;
        }
    };

    const togglePlayback = async () => {
        if (!videoRef.current || !media) return;
        if (playing) {
            videoRef.current.pause();
            bgAudioRef.current?.pause();
            setPlaying(false);
            return;
        }
        if (videoRef.current.currentTime < trim.start || videoRef.current.currentTime >= trim.end) {
            videoRef.current.currentTime = trim.start;
        }
        syncBackgroundAudio();
        if (bgAudioRef.current) await bgAudioRef.current.play().catch(() => null);
        await videoRef.current.play();
        setPlaying(true);
    };

    const handleTimeUpdate = () => {
        const time = videoRef.current?.currentTime || 0;
        if (trim.end && time >= trim.end) {
            videoRef.current.pause();
            bgAudioRef.current?.pause();
            videoRef.current.currentTime = trim.start;
            setPlaying(false);
            setCurrentTime(trim.start);
            return;
        }
        setCurrentTime(time);
    };

    const seekTo = (value) => {
        const next = Number(value);
        if (!videoRef.current) return;
        videoRef.current.currentTime = next;
        setCurrentTime(next);
        window.setTimeout(syncBackgroundAudio, 0);
    };

    const reorderLayer = (kind, id, direction) => {
        const move = (items) => {
            const index = items.findIndex((item) => item.id === id);
            const nextIndex = index + direction;
            if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
            const next = [...items];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        };
        if (kind === 'text') setTexts(move);
        if (kind === 'sticker') setStickers(move);
    };

    const updateSelectedText = (patch) => {
        if (selectedText?.locked) return;
        setTexts((items) => items.map((item) => item.id === selectedTextId ? { ...item, ...patch } : item));
    };

    const addTextLayer = () => {
        const next = {
            ...DEFAULT_TEXT,
            id: `txt-${Date.now()}`,
            text: 'Nuevo texto',
            y: 50,
            size: 34,
            bg: '#7c3aed',
            start: currentTime || 0,
            end: duration ? Math.min(duration, (currentTime || 0) + 4) : 9999,
        };
        setTexts((items) => [...items, next]);
        setSelectedTextId(next.id);
    };

    const duplicateTextLayer = () => {
        if (!selectedText) return;
        const copy = { ...selectedText, id: `txt-${Date.now()}`, text: `${selectedText.text} copia`, y: Math.min(88, selectedText.y + 8) };
        setTexts((items) => [...items, copy]);
        setSelectedTextId(copy.id);
    };

    const removeTextLayer = () => {
        if (selectedText?.locked) return;
        setTexts((items) => {
            const next = items.filter((item) => item.id !== selectedTextId);
            setSelectedTextId(next[0]?.id || null);
            return next;
        });
    };

    const addSticker = (emoji) => {
        const next = {
            ...createSticker(emoji),
            start: currentTime || 0,
            end: duration ? Math.min(duration, (currentTime || 0) + 4) : 9999,
        };
        setStickers((items) => [...items, next]);
        setSelectedStickerId(next.id);
    };

    const applyVideoTemplate = (template) => {
        const total = duration || 12;
        const firstEnd = Math.min(total, 3.5);
        const secondStart = Math.min(total * 0.42, Math.max(2.5, firstEnd - 0.5));
        const secondEnd = Math.min(total, secondStart + 4);

        const nextTexts = template.texts.map((item, index) => ({
            ...DEFAULT_TEXT,
            ...item,
            id: `txt-template-${template.key}-${Date.now()}-${index}`,
            x: 50,
            start: index === 0 ? 0 : secondStart,
            end: index === 0 ? firstEnd : secondEnd,
            color: '#ffffff',
            bg: item.bg || template.accent,
        }));

        const nextSticker = {
            ...createSticker(template.sticker),
            id: `sticker-template-${template.key}-${Date.now()}`,
            x: 82,
            y: 24,
            start: 0,
            end: Math.min(total, 5),
            animation: 'pop',
        };

        const nextCaptions = template.captions.map((line, index) => {
            const start = index === 0 ? 0.4 : Math.min(total - 0.5, secondStart);
            return createCaption(start, Math.min(total, start + 2.6), line);
        });

        setTexts(nextTexts);
        setStickers([nextSticker]);
        setCaptions(nextCaptions);
        setSelectedTextId(nextTexts[0]?.id || null);
        setSelectedStickerId(nextSticker.id);
        setSelectedCaptionId(nextCaptions[0]?.id || null);
        toast({ title: 'Plantilla aplicada', description: `${template.label} lista para editar.` });
    };

    const generateScriptFromBrief = () => {
        const product = scriptBrief.product.trim() || 'PRODUCTO DESTACADO';
        const price = scriptBrief.price.trim();
        const benefit = scriptBrief.benefit.trim() || 'listo para entrega inmediata';
        const tone = SCRIPT_TONES.find((item) => item.key === scriptBrief.tone) || SCRIPT_TONES[0];
        const total = duration || 14;
        const priceLine = price ? `RD$ ${price.replace(/^RD\$?\s*/i, '')}` : 'PRECIO ESPECIAL';

        const nextTexts = [
            {
                ...DEFAULT_TEXT,
                id: `txt-ai-hook-${Date.now()}`,
                text: tone.hook.toUpperCase(),
                y: 15,
                size: 34,
                bg: '#0f172a',
                start: 0,
                end: Math.min(total, 3),
                animation: 'pop',
            },
            {
                ...DEFAULT_TEXT,
                id: `txt-ai-product-${Date.now()}`,
                text: product.toUpperCase(),
                y: 52,
                size: 38,
                bg: '#0891b2',
                start: Math.min(total, 2.4),
                end: Math.min(total, 7),
                animation: 'slide-left',
            },
            {
                ...DEFAULT_TEXT,
                id: `txt-ai-price-${Date.now()}`,
                text: priceLine.toUpperCase(),
                y: 76,
                size: 36,
                bg: '#16a34a',
                start: Math.min(total, 6),
                end: Math.min(total, 10.5),
                animation: 'slide-up',
            },
        ];

        const nextCaptions = [
            createCaption(0.3, Math.min(total, 2.5), tone.hook),
            createCaption(Math.min(total, 2.8), Math.min(total, 5.4), `${product}: ${benefit}`),
            createCaption(Math.min(total, 6), Math.min(total, 8.8), price ? `Precio especial: RD$ ${price.replace(/^RD\$?\s*/i, '')}` : 'Tenemos precio especial disponible'),
            createCaption(Math.min(total, 9), Math.min(total, 12.2), tone.cta),
        ];

        const nextSticker = {
            ...createSticker(scriptBrief.tone === 'premium' ? '⭐' : scriptBrief.tone === 'popular' ? '✅' : '🔥'),
            id: `sticker-ai-${Date.now()}`,
            x: 82,
            y: 22,
            start: 0,
            end: Math.min(total, 5.5),
            animation: 'pop',
        };

        setTexts(nextTexts);
        setCaptions(nextCaptions);
        setStickers([nextSticker]);
        setSelectedTextId(nextTexts[0].id);
        setSelectedCaptionId(nextCaptions[0].id);
        setSelectedStickerId(nextSticker.id);
        toast({ title: 'Guion generado', description: 'Capas y subtitulos listos para ajustar.' });
    };

    const updateSelectedSticker = (patch) => {
        if (selectedSticker?.locked) return;
        setStickers((items) => items.map((item) => item.id === selectedStickerId ? { ...item, ...patch } : item));
    };

    const removeSelectedSticker = () => {
        if (selectedSticker?.locked) return;
        setStickers((items) => {
            const next = items.filter((item) => item.id !== selectedStickerId);
            setSelectedStickerId(next[0]?.id || null);
            return next;
        });
    };

    const addCaptionAtPlayhead = () => {
        const start = Math.max(trim.start || 0, currentTime || 0);
        const end = Math.min(trim.end || duration || start + 3, start + 3);
        const next = createCaption(start, end <= start ? start + 3 : end);
        setCaptions((items) => [...items, next].sort((a, b) => a.start - b.start));
        setSelectedCaptionId(next.id);
    };

    const updateSelectedCaption = (patch) => {
        setCaptions((items) => items
            .map((item) => item.id === selectedCaptionId ? { ...item, ...patch } : item)
            .sort((a, b) => a.start - b.start));
    };

    const removeSelectedCaption = () => {
        setCaptions((items) => {
            const next = items.filter((item) => item.id !== selectedCaptionId);
            setSelectedCaptionId(next[0]?.id || null);
            return next;
        });
    };

    const importSrtFile = async (file) => {
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = parseSrt(text);
            if (!parsed.length) throw new Error('No se encontraron subtitulos validos en el archivo.');
            setCaptions(parsed);
            setSelectedCaptionId(parsed[0].id);
            toast({ title: 'Subtitulos importados', description: `${parsed.length} lineas cargadas desde SRT.` });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error SRT', description: e.message });
        } finally {
            if (srtInputRef.current) srtInputRef.current.value = '';
        }
    };

    const generateCaptionsFromTranscript = () => {
        const lines = splitTranscriptIntoCaptionLines(transcriptDraft);
        if (!lines.length) {
            toast({ variant: 'destructive', title: 'Sin texto', description: 'Pega una transcripcion o guion para crear subtitulos.' });
            return;
        }

        const startAt = trim.start || 0;
        const endAt = trim.end || duration || Math.max(8, lines.length * 2.4);
        const total = Math.max(1, endAt - startAt);
        const segment = total / lines.length;
        const generated = lines.map((line, index) => {
            const start = startAt + segment * index;
            const end = index === lines.length - 1 ? endAt : Math.min(endAt, start + segment * 0.9);
            return createCaption(start, Math.max(start + 0.8, end), line);
        });

        setCaptions(generated);
        setSelectedCaptionId(generated[0]?.id || null);
        toast({ title: 'Subtitulos generados', description: `${generated.length} lineas distribuidas en la timeline.` });
    };

    const exportSrt = () => {
        if (!captions.length) {
            toast({ variant: 'destructive', title: 'Sin subtitulos', description: 'Crea o importa subtitulos antes de exportar.' });
            return;
        }
        const blob = new Blob([captionsToSrt(captions)], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${projectName.replace(/[^a-z0-9_-]/gi, '_')}.srt`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const splitAtPlayhead = () => {
        if (!duration || currentTime <= trim.start || currentTime >= trim.end) return;
        const left = { id: `clip-${Date.now()}-a`, type: 'video', name: 'Clip A', start: trim.start, end: currentTime, color: 'bg-sky-500' };
        const right = { id: `clip-${Date.now()}-b`, type: 'video', name: 'Clip B', start: currentTime, end: trim.end, color: 'bg-indigo-500' };
        setTracks((items) => [left, right, ...items.filter((item) => item.type !== 'video')]);
        toast({ title: 'Clip dividido', description: `Corte en ${formatTime(currentTime)}.` });
    };

    const persistProject = async ({ uploadThumbnail = false } = {}) => {
        const content = buildProjectContent();
        localStorage.setItem('motoflow:captut-pro:last-project', JSON.stringify({ ...content, saved_at: new Date().toISOString() }));

        if (!tenantId) {
            setLastSavedFingerprint(JSON.stringify(content));
            setAutoSaveStatus('local');
            return null;
        }

        const patch = {
            name: projectName,
            aspect,
            duration,
            source_name: content.source?.name || null,
            source_url: sourceUrl || content.source?.url || null,
            content,
            status: 'borrador',
        };
        const saved = projectId
            ? await updateCaptutProject(projectId, patch)
            : await createCaptutProject({
                tenantId,
                userId: user?.id,
                name: projectName,
                aspect,
                duration,
                sourceName: content.source?.name || null,
                content,
            });

        setProjectId(saved.id);
        let savedForReturn = saved;
        let contentForUpdates = content;

        if (media?.file && !sourceUrl) {
            const uploaded = await saveCaptutSourceVideo(tenantId, saved.id, media.file);
            setSourceUrl(uploaded.url);
            const updatedContent = {
                ...content,
                source: {
                    ...content.source,
                    url: uploaded.url,
                    remote: true,
                },
            };
            contentForUpdates = updatedContent;
            savedForReturn = await updateCaptutProject(saved.id, {
                source_url: uploaded.url,
                source_path: uploaded.path,
                source_name: media.name,
                content: updatedContent,
            });
        }

        if (audioTrack?.file && !audioTrack.remote) {
            const uploadedAudio = await saveCaptutAudioTrack(tenantId, saved.id, audioTrack.file);
            const updatedAudio = {
                ...audioTrack,
                url: uploadedAudio.url,
                remote: true,
                file: undefined,
            };
            contentForUpdates = {
                ...contentForUpdates,
                audio: {
                    name: audioTrack.name,
                    size: audioTrack.size,
                    type: audioTrack.type,
                    url: uploadedAudio.url,
                    volume: audioTrack.volume,
                    remote: true,
                },
            };
            setAudioTrack(updatedAudio);
            savedForReturn = await updateCaptutProject(saved.id, {
                content: contentForUpdates,
            });
        }

        if (uploadThumbnail && media && videoRef.current && canvasRef.current) {
            drawEditedFrame({ canvas: canvasRef.current, video: videoRef.current, texts, stickers, captions, currentTime, filterCss: videoFilterCss, aspect, videoTransform });
            const thumbBlob = await canvasToBlob(canvasRef.current, 'image/png');
            await saveCaptutThumbnail(tenantId, saved.id, thumbBlob);
        }

        await loadProjects();
        setLastSavedFingerprint(JSON.stringify(contentForUpdates));
        setAutoSaveStatus('saved');
        return savedForReturn;
    };

    useEffect(() => {
        const snapshot = JSON.parse(projectFingerprint);
        localStorage.setItem('motoflow:captut-pro:last-project', JSON.stringify({ ...snapshot, saved_at: new Date().toISOString() }));

        if (!hasUnsavedChanges) {
            setAutoSaveStatus(projectId ? 'saved' : 'local');
            return undefined;
        }

        if (!projectId || !tenantId) {
            setAutoSaveStatus('local');
            return undefined;
        }

        if (savingProject || rendering) {
            setAutoSaveStatus('pending');
            return undefined;
        }

        setAutoSaveStatus('pending');
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                setAutoSaveStatus('saving');
                await persistProject({ uploadThumbnail: false });
            } catch (e) {
                setAutoSaveStatus('error');
            }
        }, 2500);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [hasUnsavedChanges, projectFingerprint, projectId, tenantId, savingProject, rendering]);

    useEffect(() => {
        if (!historyBaseRef.current) {
            historyBaseRef.current = projectFingerprint;
            return undefined;
        }

        if (historyApplyingRef.current) {
            historyApplyingRef.current = false;
            return undefined;
        }

        if (historyBaseRef.current === projectFingerprint) return undefined;

        if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        historyTimerRef.current = setTimeout(() => {
            const previous = historyBaseRef.current;
            setUndoHistory((items) => [...items, previous].slice(-30));
            setRedoHistory([]);
            historyBaseRef.current = projectFingerprint;
        }, 700);

        return () => {
            if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
        };
    }, [projectFingerprint]);

    const restoreHistorySnapshot = (fingerprint) => {
        const content = JSON.parse(fingerprint);
        historyApplyingRef.current = true;
        applyEditorContent(content);
        historyBaseRef.current = fingerprint;
    };

    const undoEdit = () => {
        if (!undoHistory.length) return;
        const previous = undoHistory[undoHistory.length - 1];
        setUndoHistory((items) => items.slice(0, -1));
        setRedoHistory((items) => [projectFingerprint, ...items].slice(0, 30));
        restoreHistorySnapshot(previous);
    };

    const redoEdit = () => {
        if (!redoHistory.length) return;
        const next = redoHistory[0];
        setRedoHistory((items) => items.slice(1));
        setUndoHistory((items) => [...items, projectFingerprint].slice(-30));
        restoreHistorySnapshot(next);
    };

    const saveProject = async () => {
        setSavingProject(true);
        try {
            const saved = await persistProject({ uploadThumbnail: true });
            toast({
                title: 'Proyecto guardado',
                description: saved ? 'Captut Pro sincronizo el borrador y su miniatura.' : 'Quedo guardado localmente en este navegador.',
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error al guardar', description: e.message });
        } finally {
            setSavingProject(false);
        }
    };

    const downloadProject = () => {
        const project = { ...buildProjectContent(), exported_at: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${projectName.replace(/[^a-z0-9_-]/gi, '_')}.captut.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const openSavedProject = async (project) => {
        try {
            const full = await getCaptutProject(project.id);
            const content = full.content || {};
            setProjectId(full.id);
            applyEditorContent(content, full);
            historyBaseRef.current = '';
            setUndoHistory([]);
            setRedoHistory([]);
            setLastSavedFingerprint(JSON.stringify(content));
            setAutoSaveStatus('saved');
            toast({
                title: 'Proyecto cargado',
                description: full.source_url || content.source?.url ? 'Video fuente cargado desde Storage.' : 'Reimporta el video fuente para previsualizar y exportar.',
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const newProject = () => {
        setProjectId(null);
        setProjectName('Captut Pro - Nuevo video');
        setMedia(null);
        setSourceMediaName('');
        setSourceUrl('');
        setRenderedUrl('');
        setDuration(0);
        setCurrentTime(0);
        setPlaying(false);
        setAspect('vertical');
        setFilter('cinema');
        setColorAdjust(DEFAULT_COLOR_ADJUST);
        setVideoTransform({ fit: 'cover', zoom: 1, x: 0, y: 0 });
        setSpeed(1);
        setVolume(0.85);
        setAudioTrack(null);
        setTrim({ start: 0, end: 0 });
        setTracks(createDefaultTracks());
        setTexts([DEFAULT_TEXT]);
        setSelectedTextId(DEFAULT_TEXT.id);
        setStickers([]);
        setSelectedStickerId(null);
        setCaptions([]);
        setSelectedCaptionId(null);
        setTranscriptDraft('');
        setLastSavedFingerprint('');
        setAutoSaveStatus('idle');
        historyBaseRef.current = '';
        setUndoHistory([]);
        setRedoHistory([]);
    };

    const duplicateSavedProject = async (project) => {
        try {
            const duplicated = await duplicateCaptutProject(project.id, { userId: user?.id || null });
            await loadProjects();
            toast({
                title: 'Proyecto duplicado',
                description: `${duplicated.name} quedo listo como borrador.`,
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo duplicar', description: e.message });
        }
    };

    const deleteSavedProject = async (project) => {
        const ok = window.confirm(`Eliminar "${project.name}"? Esta accion borra el proyecto guardado.`);
        if (!ok) return;

        try {
            await deleteCaptutProject(project.id);
            await loadProjects();
            if (projectId === project.id) newProject();
            toast({
                title: 'Proyecto eliminado',
                description: 'La biblioteca de Captut Pro fue actualizada.',
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message });
        }
    };

    const captureFrame = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !media) return;
        drawEditedFrame({ canvas, video, texts, stickers, captions, currentTime, filterCss: videoFilterCss, aspect, videoTransform });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${projectName.replace(/[^a-z0-9_-]/gi, '_')}_frame.png`;
        link.click();
    };

    const exportRenderedVideo = async () => {
        const video = videoRef.current;
        const canvas = renderCanvasRef.current;
        if (!video || !canvas || !media) return;
        if (!window.MediaRecorder || !canvas.captureStream) {
            toast({ variant: 'destructive', title: 'Exportacion no soportada', description: 'Este navegador no soporta MediaRecorder con canvas.' });
            return;
        }

        const mimeType = getRecorderMime();
        if (!mimeType) {
            toast({ variant: 'destructive', title: 'Exportacion no soportada', description: 'No se encontro un codec de video disponible en este navegador.' });
            return;
        }

        const wasPlaying = !video.paused;
        video.pause();
        setPlaying(false);
        setRendering(true);
        setRenderProgress(0);

        try {
            const seekTarget = trim.start;
            video.playbackRate = speed;
            video.volume = volume;
            if (Math.abs(video.currentTime - seekTarget) > 0.05) {
                video.currentTime = seekTarget;
                await new Promise((resolve) => {
                    const timer = window.setTimeout(resolve, 1200);
                    const onSeeked = () => {
                        window.clearTimeout(timer);
                        video.removeEventListener('seeked', onSeeked);
                        resolve();
                    };
                    video.addEventListener('seeked', onSeeked);
                });
            }

            drawEditedFrame({ canvas, video, texts, stickers, captions, currentTime: video.currentTime, filterCss: videoFilterCss, aspect, videoTransform });
            const canvasStream = canvas.captureStream(30);
            const outputStream = new MediaStream(canvasStream.getVideoTracks());

            const sourceStream = video.captureStream?.() || video.mozCaptureStream?.();
            sourceStream?.getAudioTracks?.().forEach((track) => outputStream.addTrack(track));

            let renderBgAudio = null;
            if (audioTrack?.url) {
                renderBgAudio = new Audio(audioTrack.url);
                renderBgAudio.crossOrigin = audioTrack.remote ? 'anonymous' : '';
                renderBgAudio.loop = true;
                renderBgAudio.volume = audioTrack.volume ?? 0.45;
                const audioStream = renderBgAudio.captureStream?.() || renderBgAudio.mozCaptureStream?.();
                audioStream?.getAudioTracks?.().forEach((track) => outputStream.addTrack(track));
            }

            const chunks = [];
            const recorder = new MediaRecorder(outputStream, {
                mimeType,
                videoBitsPerSecond: 8_000_000,
                audioBitsPerSecond: 192_000,
            });

            const finished = new Promise((resolve, reject) => {
                recorder.ondataavailable = (event) => {
                    if (event.data?.size) chunks.push(event.data);
                };
                recorder.onerror = () => reject(recorder.error || new Error('No se pudo renderizar el video.'));
                recorder.onstop = resolve;
            });

            const renderFrame = () => {
                drawEditedFrame({ canvas, video, texts, stickers, captions, currentTime: video.currentTime, filterCss: videoFilterCss, aspect, videoTransform });
                const progress = playableDuration > 0 ? ((video.currentTime - trim.start) / playableDuration) * 100 : 100;
                setRenderProgress(Math.max(0, Math.min(100, progress)));

                if (video.currentTime >= trim.end || video.ended) {
                    video.pause();
                    if (recorder.state !== 'inactive') recorder.stop();
                    return;
                }
                renderFrameRef.current = requestAnimationFrame(renderFrame);
            };

            recorder.start(250);
            await renderBgAudio?.play?.().catch(() => null);
            await video.play();
            renderFrameRef.current = requestAnimationFrame(renderFrame);
            await finished;
            renderBgAudio?.pause?.();

            if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
            canvasStream.getTracks().forEach((track) => track.stop());
            outputStream.getTracks().forEach((track) => track.stop());

            const blob = new Blob(chunks, { type: mimeType });
            const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${projectName.replace(/[^a-z0-9_-]/gi, '_')}.${extension}`;
            link.click();
            URL.revokeObjectURL(link.href);

            let renderedUrl = null;
            if (tenantId) {
                const saved = await persistProject({ uploadThumbnail: true });
                if (saved?.id) {
                    renderedUrl = await saveCaptutRendered(tenantId, saved.id, blob, { extension });
                    setRenderedUrl(renderedUrl);
                    await loadProjects();
                }
            }

            toast({
                title: `Video exportado .${extension}`,
                description: renderedUrl
                    ? 'Render descargado y guardado en Captut Pro.'
                    : mimeType.includes('mp4') ? 'Render final descargado.' : 'Tu navegador no ofrecio MP4; se descargo WebM.',
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error al exportar', description: e.message });
        } finally {
            if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
            setRendering(false);
            setRenderProgress(0);
            video.currentTime = trim.start;
            if (wasPlaying) togglePlayback();
        }
    };

    const saveStateLabel = {
        idle: projectId ? 'Guardado' : 'Nuevo proyecto',
        local: projectId ? 'Respaldo local' : 'Respaldo local',
        pending: 'Cambios pendientes',
        saving: 'Autoguardando...',
        saved: 'Guardado',
        error: 'Error al autoguardar',
    }[autoSaveStatus] || 'Guardado';

    const saveStateClass = {
        idle: 'border-slate-700 text-slate-400',
        local: 'border-amber-500/40 text-amber-300',
        pending: 'border-cyan-500/40 text-cyan-300',
        saving: 'border-cyan-500/40 text-cyan-300',
        saved: 'border-emerald-500/40 text-emerald-300',
        error: 'border-rose-500/40 text-rose-300',
    }[autoSaveStatus] || 'border-slate-700 text-slate-400';

    return (
        <div className="bg-slate-950 text-slate-100 border border-slate-800 rounded-lg overflow-hidden shadow-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-white text-slate-950 flex items-center justify-center">
                        <Film className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <Input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="h-8 bg-transparent border-slate-700 text-slate-50 font-bold"
                        />
                        <div className="mt-1 flex items-center gap-2 min-w-0">
                            <p className="text-[11px] text-slate-400 truncate">{media?.name || sourceMediaName || 'Importa un video para empezar a editar'}</p>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${saveStateClass}`}>
                                {autoSaveStatus === 'saving' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                                {saveStateLabel}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                    <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleAudioFile(e.target.files?.[0])} />
                    <input ref={srtInputRef} type="file" accept=".srt,text/plain" className="hidden" onChange={(e) => importSrtFile(e.target.files?.[0])} />
                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Importar
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={newProject}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo
                    </Button>
                    <Button size="sm" variant="outline" title="Deshacer" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={undoEdit} disabled={!undoHistory.length}>
                        <Undo2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" title="Rehacer" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={redoEdit} disabled={!redoHistory.length}>
                        <Redo2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={saveProject} disabled={savingProject}>
                        {savingProject ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Guardar
                    </Button>
                    <Button size="sm" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={exportRenderedVideo} disabled={!media || rendering}>
                        {rendering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Film className="h-4 w-4 mr-2" />}
                        {rendering ? `${Math.round(renderProgress)}%` : 'Exportar video'}
                    </Button>
                    <Button size="sm" className="bg-slate-100 text-slate-950 hover:bg-white" onClick={downloadProject}>
                        <Download className="h-4 w-4 mr-2" />
                        Proyecto
                    </Button>
                    {renderedUrl && (
                        <Button size="sm" variant="outline" className="border-emerald-700 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900" onClick={() => window.open(renderedUrl, '_blank', 'noopener,noreferrer')}>
                            <Play className="h-4 w-4 mr-2" />
                            Render
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_300px] min-h-[720px]">
                <aside className="border-r border-slate-800 bg-slate-900/80 p-3 space-y-3">
                    <ToolSection title="Media" icon={Upload}>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full min-h-[116px] rounded-lg border border-dashed border-slate-600 bg-slate-950/70 hover:border-cyan-400 flex flex-col items-center justify-center text-slate-300"
                        >
                            <BadgePlus className="h-7 w-7 mb-2" />
                            <span className="text-sm font-semibold">Subir video</span>
                            <span className="text-[11px] text-slate-500 mt-1">MP4, MOV, WebM</span>
                        </button>
                        {media && (
                            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                                <p className="text-xs font-semibold truncate">{media.name}</p>
                                <p className="text-[10px] text-slate-500 mt-1">{(media.size / 1024 / 1024).toFixed(1)} MB · {formatTime(duration)}</p>
                            </div>
                        )}
                    </ToolSection>

                    <ToolSection title="Musica" icon={Music}>
                        <Button size="sm" variant="outline" className="w-full border-slate-700 bg-slate-950 text-slate-100" onClick={() => audioInputRef.current?.click()}>
                            <Upload className="h-4 w-4 mr-2" />
                            Subir audio
                        </Button>
                        {audioTrack ? (
                            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                                <p className="text-xs font-semibold truncate">{audioTrack.name}</p>
                                <p className="text-[10px] text-slate-500 mt-1">{audioTrack.remote ? 'Guardado en Storage' : 'Pendiente de guardar'} - {(Number(audioTrack.size || 0) / 1024 / 1024).toFixed(1)} MB</p>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 px-2 py-2">Sin musica de fondo.</p>
                        )}
                    </ToolSection>

                    <ToolSection title="Mis proyectos" icon={FolderOpen}>
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                            {loadingProjects && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 px-2 py-3">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Cargando...
                                </div>
                            )}
                            {!loadingProjects && savedProjects.length === 0 && (
                                <p className="text-xs text-slate-500 px-2 py-3">No hay proyectos guardados.</p>
                            )}
                            {savedProjects.map((project) => (
                                <div
                                    key={project.id}
                                    className={`w-full rounded-md border p-2 hover:border-cyan-400 ${projectId === project.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-800 bg-slate-950'}`}
                                >
                                    <div className="flex gap-2 items-start">
                                        <div className="h-10 w-10 rounded bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                            {project.thumbnail_url ? (
                                                <img src={project.thumbnail_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <Film className="h-4 w-4 text-slate-600" />
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openSavedProject(project)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="flex items-center gap-1">
                                                <p className="text-xs font-semibold text-slate-100 truncate">{project.name}</p>
                                                {project.rendered_url && (
                                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">Render</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                                {project.source_name || 'Sin video fuente'} - {formatTime(Number(project.duration || 0))}
                                            </p>
                                        </button>
                                        <div className="flex shrink-0 gap-1">
                                            <button
                                                type="button"
                                                title="Duplicar proyecto"
                                                onClick={() => duplicateSavedProject(project)}
                                                className="h-7 w-7 rounded border border-slate-800 bg-slate-900 text-slate-300 hover:border-cyan-400 hover:text-cyan-200 flex items-center justify-center"
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                title="Eliminar proyecto"
                                                onClick={() => deleteSavedProject(project)}
                                                className="h-7 w-7 rounded border border-slate-800 bg-slate-900 text-slate-400 hover:border-rose-400 hover:text-rose-300 flex items-center justify-center"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ToolSection>

                    <ToolSection title="Plantillas" icon={Wand2}>
                        <div className="space-y-1">
                            {VIDEO_TEMPLATES.map((template) => (
                                <button
                                    key={template.key}
                                    onClick={() => applyVideoTemplate(template)}
                                    className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-left hover:border-cyan-400"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="h-7 w-7 rounded flex items-center justify-center text-base" style={{ backgroundColor: `${template.accent}26` }}>
                                            {template.sticker}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-slate-100">{template.label}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{template.description}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </ToolSection>

                    <ToolSection title="Guion IA" icon={Sparkles}>
                        <div className="space-y-2">
                            <Input
                                value={scriptBrief.product}
                                onChange={(e) => setScriptBrief((brief) => ({ ...brief, product: e.target.value }))}
                                placeholder="Producto"
                                className="h-8 bg-slate-950 border-slate-700 text-slate-100 text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    value={scriptBrief.price}
                                    onChange={(e) => setScriptBrief((brief) => ({ ...brief, price: e.target.value }))}
                                    placeholder="Precio"
                                    className="h-8 bg-slate-950 border-slate-700 text-slate-100 text-xs"
                                />
                                <select
                                    value={scriptBrief.tone}
                                    onChange={(e) => setScriptBrief((brief) => ({ ...brief, tone: e.target.value }))}
                                    className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                                >
                                    {SCRIPT_TONES.map((tone) => (
                                        <option key={tone.key} value={tone.key}>{tone.label}</option>
                                    ))}
                                </select>
                            </div>
                            <Textarea
                                value={scriptBrief.benefit}
                                onChange={(e) => setScriptBrief((brief) => ({ ...brief, benefit: e.target.value }))}
                                placeholder="Beneficio o detalle clave"
                                className="min-h-[58px] bg-slate-950 border-slate-700 text-slate-100 text-xs"
                            />
                            <Button size="sm" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={generateScriptFromBrief}>
                                <Wand2 className="h-4 w-4 mr-2" />
                                Generar guion
                            </Button>
                        </div>
                    </ToolSection>

                    <ToolSection title="Texto" icon={Type}>
                        <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={addTextLayer}>
                                <Plus className="h-4 w-4 mr-1" /> Texto
                            </Button>
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={duplicateTextLayer}>
                                <Copy className="h-4 w-4 mr-1" /> Copiar
                            </Button>
                        </div>
                        <div className="space-y-1">
                            {texts.map((item, index) => (
                                <div
                                    key={item.id}
                                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${selectedTextId === item.id ? 'border-cyan-400 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                                >
                                    <button type="button" onClick={() => setSelectedTextId(item.id)} className="min-w-0 flex-1 text-left">
                                        <Captions className="inline h-3.5 w-3.5 mr-2" />
                                        <span className={`truncate ${item.visible === false ? 'text-slate-600 line-through' : ''}`}>{item.text || 'Texto vacio'}</span>
                                    </button>
                                    <button type="button" title="Mostrar/ocultar" onClick={() => setTexts((items) => items.map((layer) => layer.id === item.id ? { ...layer, visible: layer.visible === false } : layer))} className="h-6 w-6 rounded hover:bg-slate-800 inline-flex items-center justify-center">
                                        {item.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                    <button type="button" title="Bloquear/desbloquear" onClick={() => setTexts((items) => items.map((layer) => layer.id === item.id ? { ...layer, locked: !layer.locked } : layer))} className="h-6 w-6 rounded hover:bg-slate-800 inline-flex items-center justify-center">
                                        {item.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                    </button>
                                    <button type="button" title="Bajar capa" disabled={index === 0} onClick={() => reorderLayer('text', item.id, -1)} className="h-6 w-6 rounded hover:bg-slate-800 disabled:opacity-30 inline-flex items-center justify-center">
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" title="Subir capa" disabled={index === texts.length - 1} onClick={() => reorderLayer('text', item.id, 1)} className="h-6 w-6 rounded hover:bg-slate-800 disabled:opacity-30 inline-flex items-center justify-center">
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </ToolSection>

                    <ToolSection title="Subtitulos" icon={Captions}>
                        <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={addCaptionAtPlayhead}>
                                <Plus className="h-4 w-4 mr-1" /> Linea
                            </Button>
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={() => srtInputRef.current?.click()}>
                                <Upload className="h-4 w-4 mr-1" /> SRT
                            </Button>
                        </div>
                        <Textarea
                            value={transcriptDraft}
                            onChange={(e) => setTranscriptDraft(e.target.value)}
                            placeholder="Pega aqui una transcripcion o guion..."
                            className="min-h-[64px] bg-slate-950 border-slate-700 text-slate-100 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={generateCaptionsFromTranscript}>
                                <Wand2 className="h-4 w-4 mr-1" /> Crear
                            </Button>
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={exportSrt}>
                                <Download className="h-4 w-4 mr-1" /> SRT
                            </Button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                            {captions.length === 0 && (
                                <p className="text-xs text-slate-500 px-2 py-2">Sin subtitulos.</p>
                            )}
                            {captions.map((caption) => (
                                <button
                                    key={caption.id}
                                    onClick={() => {
                                        setSelectedCaptionId(caption.id);
                                        seekTo(caption.start);
                                    }}
                                    className={`w-full text-left px-2 py-2 rounded-md border text-xs ${selectedCaptionId === caption.id ? 'border-cyan-400 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                                >
                                    <span className="font-mono text-[10px] text-slate-500">{formatTime(caption.start)} - {formatTime(caption.end)}</span>
                                    <p className="truncate mt-0.5">{caption.text}</p>
                                </button>
                            ))}
                        </div>
                    </ToolSection>

                    <ToolSection title="Stickers" icon={Smile}>
                        <div className="grid grid-cols-4 gap-2">
                            {STICKER_PRESETS.map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => addSticker(emoji)}
                                    className="h-10 rounded-md border border-slate-700 bg-slate-950 text-xl hover:border-cyan-400"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                            {stickers.length === 0 && (
                                <p className="text-xs text-slate-500 px-2 py-2">Sin stickers.</p>
                            )}
                            {stickers.map((sticker, index) => (
                                <div
                                    key={sticker.id}
                                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${selectedStickerId === sticker.id ? 'border-cyan-400 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-300'}`}
                                >
                                    <button type="button" onClick={() => setSelectedStickerId(sticker.id)} className="min-w-0 flex-1 text-left">
                                        <span className={`mr-2 text-base ${sticker.visible === false ? 'opacity-30' : ''}`}>{sticker.emoji}</span>
                                        <span className={sticker.visible === false ? 'text-slate-600 line-through' : ''}>Sticker {Math.round(sticker.x)}%, {Math.round(sticker.y)}%</span>
                                    </button>
                                    <button type="button" title="Mostrar/ocultar" onClick={() => setStickers((items) => items.map((layer) => layer.id === sticker.id ? { ...layer, visible: layer.visible === false } : layer))} className="h-6 w-6 rounded hover:bg-slate-800 inline-flex items-center justify-center">
                                        {sticker.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                    <button type="button" title="Bloquear/desbloquear" onClick={() => setStickers((items) => items.map((layer) => layer.id === sticker.id ? { ...layer, locked: !layer.locked } : layer))} className="h-6 w-6 rounded hover:bg-slate-800 inline-flex items-center justify-center">
                                        {sticker.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                    </button>
                                    <button type="button" title="Bajar capa" disabled={index === 0} onClick={() => reorderLayer('sticker', sticker.id, -1)} className="h-6 w-6 rounded hover:bg-slate-800 disabled:opacity-30 inline-flex items-center justify-center">
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" title="Subir capa" disabled={index === stickers.length - 1} onClick={() => reorderLayer('sticker', sticker.id, 1)} className="h-6 w-6 rounded hover:bg-slate-800 disabled:opacity-30 inline-flex items-center justify-center">
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </ToolSection>

                    <ToolSection title="Efectos" icon={Sparkles}>
                        <div className="grid grid-cols-2 gap-2">
                            {FILTERS.map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => setFilter(item.key)}
                                    className={`h-10 rounded-md border text-xs font-semibold ${filter === item.key ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </ToolSection>
                </aside>

                <main className="bg-slate-950 p-4 flex flex-col min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
                            {Object.entries(ASPECTS).map(([key, item]) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setAspect(key)}
                                        className={`h-8 px-3 rounded-md text-xs font-bold flex items-center gap-1.5 ${aspect === key ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{formatTime(currentTime)}</span>
                            <span>/</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[420px] flex items-center justify-center">
                        <div className={`relative overflow-hidden rounded-lg bg-black shadow-2xl border border-slate-800 ${ASPECTS[aspect].className}`}>
                            {media ? (
                                <video
                                    ref={videoRef}
                                    src={media.url}
                                    crossOrigin={media.remote ? 'anonymous' : undefined}
                                    className="h-full w-full"
                                    style={{
                                        filter: videoFilterCss,
                                        objectFit: videoTransform.fit === 'contain' ? 'contain' : 'cover',
                                        transform: `translate(${videoTransform.x || 0}%, ${videoTransform.y || 0}%) scale(${videoTransform.zoom || 1})`,
                                    }}
                                    onLoadedMetadata={handleLoadedMetadata}
                                    onTimeUpdate={handleTimeUpdate}
                                    onPlay={() => setPlaying(true)}
                                    onPause={() => setPlaying(false)}
                                    playbackRate={speed}
                                    volume={volume}
                                />
                            ) : (
                                <div className="h-full w-full min-h-[420px] flex flex-col items-center justify-center text-slate-500">
                                    <ImageIcon className="h-14 w-14 mb-3" />
                                    <p className="text-sm font-semibold">Preview del video</p>
                                </div>
                            )}
                            {texts.filter((item) => item.visible !== false).map((item) => (
                                <button
                                    key={item.id}
                                    disabled={item.locked}
                                    onClick={() => setSelectedTextId(item.id)}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 px-4 py-2 text-center leading-tight shadow-lg ${item.locked ? 'cursor-default' : ''} ${selectedTextId === item.id ? 'ring-2 ring-cyan-300' : ''}`}
                                    style={{
                                        left: `${item.x}%`,
                                        top: `${item.y}%`,
                                        fontSize: `${item.size}px`,
                                        color: item.color,
                                        background: `${item.bg}cc`,
                                        fontWeight: item.weight,
                                        ...getLayerPreviewStyle(item, currentTime),
                                    }}
                                >
                                    {item.text}
                                </button>
                            ))}
                            {stickers.filter((item) => item.visible !== false).map((item) => (
                                <button
                                    key={item.id}
                                    disabled={item.locked}
                                    onClick={() => setSelectedStickerId(item.id)}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-2xl ${item.locked ? 'cursor-default' : ''} ${selectedStickerId === item.id ? 'ring-2 ring-cyan-300 rounded-md' : ''}`}
                                    style={{
                                        left: `${item.x}%`,
                                        top: `${item.y}%`,
                                        fontSize: `${item.size}px`,
                                        ...getLayerPreviewStyle(item, currentTime, `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`),
                                    }}
                                >
                                    {item.emoji}
                                </button>
                            ))}
                            {activeCaption && (
                                <button
                                    onClick={() => setSelectedCaptionId(activeCaption.id)}
                                    className="absolute left-1/2 bottom-[12%] w-[82%] -translate-x-1/2 rounded bg-black/75 px-4 py-2 text-center text-white shadow-lg ring-cyan-300 hover:ring-2"
                                >
                                    <span className="text-xl font-black leading-tight drop-shadow md:text-2xl">{activeCaption.text}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <Button size="icon" className="h-9 w-9 bg-cyan-400 text-slate-950 hover:bg-cyan-300" onClick={togglePlayback} disabled={!media}>
                                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={splitAtPlayhead} disabled={!media}>
                                <Scissors className="h-4 w-4 mr-2" />
                                Dividir
                            </Button>
                            <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={captureFrame} disabled={!media}>
                                <Download className="h-4 w-4 mr-2" />
                                Frame PNG
                            </Button>
                            <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                step="0.05"
                                value={currentTime}
                                onChange={(e) => seekTo(e.target.value)}
                                className="flex-1 accent-cyan-400"
                                disabled={!media}
                            />
                        </div>

                        <div className="relative h-6 mb-2 border-y border-slate-800 text-[10px] text-slate-500">
                            {timelineTicks.map((tick) => (
                                <span key={tick} className="absolute top-1" style={{ left: `${duration ? (tick / duration) * 100 : 0}%` }}>
                                    {formatTime(tick)}
                                </span>
                            ))}
                            <span className="absolute top-0 bottom-0 w-0.5 bg-cyan-300" style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
                        </div>

                        <div className="space-y-2">
                            {tracks.map((track) => (
                                <div key={track.id} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center">
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                        <Layers className="h-3.5 w-3.5" />
                                        {track.name}
                                    </div>
                                    <div className="h-8 rounded bg-slate-950 border border-slate-800 relative overflow-hidden">
                                        <div
                                            className={`absolute top-1 bottom-1 rounded ${track.color}`}
                                            style={{
                                                left: `${duration ? (track.start / duration) * 100 : 0}%`,
                                                width: `${duration ? Math.max(2, ((track.end - track.start) / duration) * 100) : 0}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {captions.length > 0 && (
                                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center">
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                        <Captions className="h-3.5 w-3.5" />
                                        Subtitulos
                                    </div>
                                    <div className="h-8 rounded bg-slate-950 border border-slate-800 relative overflow-hidden">
                                        {captions.map((caption) => (
                                            <button
                                                key={caption.id}
                                                onClick={() => {
                                                    setSelectedCaptionId(caption.id);
                                                    seekTo(caption.start);
                                                }}
                                                className={`absolute top-1 bottom-1 rounded ${selectedCaptionId === caption.id ? 'bg-cyan-300' : 'bg-amber-400'}`}
                                                style={{
                                                    left: `${duration ? (caption.start / duration) * 100 : 0}%`,
                                                    width: `${duration ? Math.max(2, ((caption.end - caption.start) / duration) * 100) : 0}%`,
                                                }}
                                                title={caption.text}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {(texts.length > 0 || stickers.length > 0) && (
                                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center">
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                        <Layers className="h-3.5 w-3.5" />
                                        Capas
                                    </div>
                                    <div className="h-8 rounded bg-slate-950 border border-slate-800 relative overflow-hidden">
                                        {[...texts.map((item) => ({ ...item, kind: 'text' })), ...stickers.map((item) => ({ ...item, kind: 'sticker' }))].map((layer) => {
                                            const start = Number(layer.start ?? 0);
                                            const end = Number(layer.end ?? (duration || 0));
                                            return (
                                                <button
                                                    key={`${layer.kind}-${layer.id}`}
                                                    onClick={() => {
                                                        if (layer.kind === 'text') setSelectedTextId(layer.id);
                                                        if (layer.kind === 'sticker') setSelectedStickerId(layer.id);
                                                        seekTo(start);
                                                    }}
                                                    className={`absolute top-1 bottom-1 rounded ${layer.kind === 'text' ? 'bg-violet-400' : 'bg-pink-400'}`}
                                                    style={{
                                                        left: `${duration ? (start / duration) * 100 : 0}%`,
                                                        width: `${duration ? Math.max(2, ((end - start) / duration) * 100) : 0}%`,
                                                    }}
                                                    title={layer.kind === 'text' ? layer.text : layer.emoji}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <aside className="border-l border-slate-800 bg-slate-900/80 p-3 space-y-4">
                    <ToolSection title="Ajustes de clip" icon={Film}>
                        <RangeField label="Inicio" min={0} max={duration || 0} value={trim.start} onChange={(value) => setTrim((t) => ({ ...t, start: Math.min(value, t.end) }))} />
                        <RangeField label="Final" min={0} max={duration || 0} value={trim.end || duration} onChange={(value) => setTrim((t) => ({ ...t, end: Math.max(value, t.start) }))} />
                        <div className="rounded-md bg-slate-950 border border-slate-800 p-2 text-xs text-slate-400">
                            Duracion editable: <b className="text-slate-100">{formatTime(playableDuration)}</b>
                        </div>
                    </ToolSection>

                    <ToolSection title="Audio y velocidad" icon={Volume2}>
                        <RangeField label="Volumen" min={0} max={1} step={0.01} value={volume} onChange={(value) => { setVolume(value); updateVideoState({ volume: value }); }} display={`${Math.round(volume * 100)}%`} />
                        {audioTrack && (
                            <RangeField
                                label="Musica"
                                min={0}
                                max={1}
                                step={0.01}
                                value={audioTrack.volume ?? 0.45}
                                onChange={(value) => {
                                    setAudioTrack((track) => track ? { ...track, volume: value } : track);
                                    if (bgAudioRef.current) bgAudioRef.current.volume = value;
                                }}
                                display={`${Math.round((audioTrack.volume ?? 0.45) * 100)}%`}
                            />
                        )}
                        <RangeField label="Velocidad" min={0.25} max={2} step={0.25} value={speed} onChange={(value) => { setSpeed(value); updateVideoState({ playbackRate: value }); }} display={`${speed}x`} icon={Gauge} />
                    </ToolSection>

                    <ToolSection title="Encuadre video" icon={Monitor}>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className={`${videoTransform.fit === 'cover' ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-100'}`}
                                onClick={() => setVideoTransform((value) => ({ ...value, fit: 'cover' }))}
                            >
                                Llenar
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className={`${videoTransform.fit === 'contain' ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-100'}`}
                                onClick={() => setVideoTransform((value) => ({ ...value, fit: 'contain' }))}
                            >
                                Ajustar
                            </Button>
                        </div>
                        <RangeField label="Zoom" min={0.5} max={2.5} step={0.05} value={videoTransform.zoom || 1} onChange={(value) => setVideoTransform((prev) => ({ ...prev, zoom: value }))} display={`${Number(videoTransform.zoom || 1).toFixed(2)}x`} />
                        <RangeField label="Mover X" min={-50} max={50} step={1} value={videoTransform.x || 0} onChange={(value) => setVideoTransform((prev) => ({ ...prev, x: value }))} display={`${videoTransform.x || 0}%`} />
                        <RangeField label="Mover Y" min={-50} max={50} step={1} value={videoTransform.y || 0} onChange={(value) => setVideoTransform((prev) => ({ ...prev, y: value }))} display={`${videoTransform.y || 0}%`} />
                        <Button size="sm" variant="outline" className="w-full border-slate-700 bg-slate-950 text-slate-100" onClick={() => setVideoTransform({ fit: 'cover', zoom: 1, x: 0, y: 0 })}>
                            Reiniciar encuadre
                        </Button>
                    </ToolSection>

                    <ToolSection title="Color video" icon={Sparkles}>
                        <RangeField
                            label="Brillo"
                            min={0.5}
                            max={1.5}
                            step={0.01}
                            value={colorAdjust.brightness}
                            onChange={(value) => setColorAdjust((prev) => ({ ...prev, brightness: value }))}
                            display={`${Math.round(colorAdjust.brightness * 100)}%`}
                        />
                        <RangeField
                            label="Contraste"
                            min={0.5}
                            max={1.6}
                            step={0.01}
                            value={colorAdjust.contrast}
                            onChange={(value) => setColorAdjust((prev) => ({ ...prev, contrast: value }))}
                            display={`${Math.round(colorAdjust.contrast * 100)}%`}
                        />
                        <RangeField
                            label="Saturacion"
                            min={0}
                            max={2}
                            step={0.01}
                            value={colorAdjust.saturation}
                            onChange={(value) => setColorAdjust((prev) => ({ ...prev, saturation: value }))}
                            display={`${Math.round(colorAdjust.saturation * 100)}%`}
                        />
                        <RangeField
                            label="Suavizado"
                            min={0}
                            max={6}
                            step={0.1}
                            value={colorAdjust.blur}
                            onChange={(value) => setColorAdjust((prev) => ({ ...prev, blur: value }))}
                            display={`${Number(colorAdjust.blur).toFixed(1)}px`}
                        />
                        <Button size="sm" variant="outline" className="w-full border-slate-700 bg-slate-950 text-slate-100" onClick={() => setColorAdjust(DEFAULT_COLOR_ADJUST)}>
                            Reiniciar color
                        </Button>
                    </ToolSection>

                    <ToolSection title="Propiedades subtitulo" icon={Captions}>
                        {selectedCaption ? (
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs text-slate-400">Texto</Label>
                                    <Textarea
                                        value={selectedCaption.text}
                                        onChange={(e) => updateSelectedCaption({ text: e.target.value })}
                                        className="mt-1 bg-slate-950 border-slate-700 text-slate-100 min-h-[74px]"
                                    />
                                </div>
                                <RangeField
                                    label="Inicio"
                                    min={0}
                                    max={duration || 0}
                                    step={0.05}
                                    value={selectedCaption.start}
                                    onChange={(value) => updateSelectedCaption({ start: Math.min(value, selectedCaption.end - 0.05) })}
                                />
                                <RangeField
                                    label="Final"
                                    min={0}
                                    max={duration || 0}
                                    step={0.05}
                                    value={selectedCaption.end}
                                    onChange={(value) => updateSelectedCaption({ end: Math.max(value, selectedCaption.start + 0.05) })}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-slate-700 bg-slate-950 text-slate-100"
                                        onClick={() => seekTo(selectedCaption.start)}
                                    >
                                        <Play className="h-4 w-4 mr-1" />
                                        Ver
                                    </Button>
                                    <Button variant="outline" size="sm" className="border-red-800 bg-red-950/30 text-red-200 hover:bg-red-950" onClick={removeSelectedCaption}>
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Eliminar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Agrega o importa subtitulos para editarlos.</p>
                        )}
                    </ToolSection>

                    <ToolSection title="Propiedades sticker" icon={Smile}>
                        {selectedSticker ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={() => setStickers((items) => items.map((item) => item.id === selectedSticker.id ? { ...item, visible: item.visible === false } : item))}>
                                        {selectedSticker.visible === false ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                                        Visible
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={() => setStickers((items) => items.map((item) => item.id === selectedSticker.id ? { ...item, locked: !item.locked } : item))}>
                                        {selectedSticker.locked ? <Lock className="h-4 w-4 mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
                                        Bloqueo
                                    </Button>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-400">Sticker</Label>
                                    <Input
                                        value={selectedSticker.emoji}
                                        disabled={selectedSticker.locked}
                                        onChange={(e) => updateSelectedSticker({ emoji: e.target.value.slice(0, 4) || '⭐' })}
                                        className="mt-1 bg-slate-950 border-slate-700 text-slate-100 text-center text-lg"
                                    />
                                </div>
                                <RangeField label="X" min={5} max={95} value={selectedSticker.x} onChange={(value) => updateSelectedSticker({ x: value })} display={`${selectedSticker.x}%`} />
                                <RangeField label="Y" min={5} max={95} value={selectedSticker.y} onChange={(value) => updateSelectedSticker({ y: value })} display={`${selectedSticker.y}%`} />
                                <RangeField label="Tamano" min={24} max={120} value={selectedSticker.size} onChange={(value) => updateSelectedSticker({ size: value })} display={`${selectedSticker.size}px`} />
                                <RangeField label="Rotacion" min={-45} max={45} value={selectedSticker.rotation || 0} onChange={(value) => updateSelectedSticker({ rotation: value })} display={`${selectedSticker.rotation || 0}°`} icon={RotateCw} />
                                <RangeField label="Inicio" min={0} max={Math.max(duration || 0, Number(selectedSticker.end ?? 0))} step={0.05} value={Number(selectedSticker.start ?? 0)} onChange={(value) => updateSelectedSticker({ start: Math.min(value, Number(selectedSticker.end ?? (duration || 9999)) - 0.05) })} />
                                <RangeField label="Final" min={0} max={Math.max(duration || 0, Number(selectedSticker.end ?? 0))} step={0.05} value={Number(selectedSticker.end ?? (duration || 0))} onChange={(value) => updateSelectedSticker({ end: Math.max(value, Number(selectedSticker.start ?? 0) + 0.05) })} />
                                <AnimationPicker value={selectedSticker.animation || 'none'} onChange={(value) => updateSelectedSticker({ animation: value })} />
                                <Button variant="outline" size="sm" className="w-full border-red-800 bg-red-950/30 text-red-200 hover:bg-red-950" onClick={removeSelectedSticker} disabled={selectedSticker.locked}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar sticker
                                </Button>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Agrega un sticker para editarlo.</p>
                        )}
                    </ToolSection>

                    <ToolSection title="Propiedades de texto" icon={Type}>
                        {selectedText ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={() => setTexts((items) => items.map((item) => item.id === selectedText.id ? { ...item, visible: item.visible === false } : item))}>
                                        {selectedText.visible === false ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                                        Visible
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-slate-700 bg-slate-950 text-slate-100" onClick={() => setTexts((items) => items.map((item) => item.id === selectedText.id ? { ...item, locked: !item.locked } : item))}>
                                        {selectedText.locked ? <Lock className="h-4 w-4 mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
                                        Bloqueo
                                    </Button>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-400">Contenido</Label>
                                    <Textarea value={selectedText.text} disabled={selectedText.locked} onChange={(e) => updateSelectedText({ text: e.target.value })} className="mt-1 bg-slate-950 border-slate-700 text-slate-100 min-h-[74px]" />
                                </div>
                                <RangeField label="X" min={5} max={95} value={selectedText.x} onChange={(value) => updateSelectedText({ x: value })} display={`${selectedText.x}%`} />
                                <RangeField label="Y" min={5} max={95} value={selectedText.y} onChange={(value) => updateSelectedText({ y: value })} display={`${selectedText.y}%`} />
                                <RangeField label="Tamano" min={16} max={74} value={selectedText.size} onChange={(value) => updateSelectedText({ size: value })} display={`${selectedText.size}px`} />
                                <RangeField label="Inicio" min={0} max={Math.max(duration || 0, Number(selectedText.end ?? 0))} step={0.05} value={Number(selectedText.start ?? 0)} onChange={(value) => updateSelectedText({ start: Math.min(value, Number(selectedText.end ?? (duration || 9999)) - 0.05) })} />
                                <RangeField label="Final" min={0} max={Math.max(duration || 0, Number(selectedText.end ?? 0))} step={0.05} value={Number(selectedText.end ?? (duration || 0))} onChange={(value) => updateSelectedText({ end: Math.max(value, Number(selectedText.start ?? 0) + 0.05) })} />
                                <AnimationPicker value={selectedText.animation || 'none'} onChange={(value) => updateSelectedText({ animation: value })} />
                                <div className="grid grid-cols-2 gap-2">
                                    <ColorField label="Texto" value={selectedText.color} onChange={(value) => updateSelectedText({ color: value })} />
                                    <ColorField label="Fondo" value={selectedText.bg} onChange={(value) => updateSelectedText({ bg: value })} />
                                </div>
                                <Button variant="outline" size="sm" className="w-full border-red-800 bg-red-950/30 text-red-200 hover:bg-red-950" onClick={removeTextLayer} disabled={selectedText.locked}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar capa
                                </Button>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Agrega una capa de texto para editarla.</p>
                        )}
                    </ToolSection>
                </aside>
            </div>
            {audioTrack?.url && (
                <audio ref={bgAudioRef} src={audioTrack.url} crossOrigin={audioTrack.remote ? 'anonymous' : undefined} loop className="hidden" />
            )}
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={renderCanvasRef} className="hidden" />
        </div>
    );
}

function ToolSection({ title, icon: Icon, children }) {
    return (
        <section>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                <Icon className="h-4 w-4 text-cyan-300" />
                {title}
            </div>
            <div className="space-y-2">{children}</div>
        </section>
    );
}

function RangeField({ label, min, max, step = 1, value, onChange, display, icon: Icon }) {
    return (
        <div>
            <div className="flex items-center justify-between text-xs mb-1">
                <Label className="text-slate-400 flex items-center gap-1">
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {label}
                </Label>
                <span className="text-slate-200 font-mono">{display || formatTime(value)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={Number.isFinite(value) ? value : 0}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-cyan-400"
            />
        </div>
    );
}

function AnimationPicker({ value, onChange }) {
    return (
        <div>
            <Label className="text-xs text-slate-400">Animacion</Label>
            <div className="mt-1 grid grid-cols-2 gap-1">
                {ANIMATIONS.map((animation) => (
                    <button
                        key={animation.key}
                        type="button"
                        onClick={() => onChange(animation.key)}
                        className={`h-8 rounded border text-[11px] font-semibold ${value === animation.key ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'}`}
                    >
                        {animation.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ColorField({ label, value, onChange }) {
    return (
        <label className="text-xs text-slate-400">
            {label}
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-950"
            />
        </label>
    );
}
