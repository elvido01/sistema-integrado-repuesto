// =====================================================================
// Hermes — la conversación, en el teléfono
// ---------------------------------------------------------------------
// >>> LO QUE ESTA PANTALLA TIENE QUE LOGRAR <<<
// Que NO parezca que uno habla solo. En WhatsApp con el propio número,
// las dos partes salen del mismo lado y la conversación se vuelve
// ilegible. Aquí Hermes tiene su lado, su color y su nombre, y el usuario
// el suyo.
//
// >>> LOS TRES AGENTES <<<
// La conversación es CON Hermes. Jarvis y Comercial-Creativo aparecen
// como colaboradores dentro de una tarea, nunca como interlocutores. No
// hay un cuarto: voz, imágenes y notificaciones son capacidades del canal.
//
// >>> LO QUE NO SE ENSEÑA <<<
// Ni cadenas de razonamiento, ni prompts, ni mensajes técnicos entre
// agentes, ni rutas de almacenamiento, ni tokens.
// =====================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking,
  Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import {
  Bot, Camera, FileText, Image as ImgIcon, Mic, Paperclip, Play, Pause,
  RotateCcw, Send, Square, Trash2, X, Copy, Plus, AlertTriangle, WifiOff,
} from 'lucide-react-native';

import { useHermesChat, type MensajeChat, type MedioServidor } from '../../src/features/hermes/useHermesChat';
import { useGrabadora } from '../../src/features/hermes/useGrabadora';
import { useReproductor } from '../../src/features/hermes/useReproductor';
import * as api from '../../src/features/hermes/api';
import {
  AUTORES, ESTADOS, estadoCabecera, formatearDuracion, formatearTamano,
  nombreSeguro, type MedioLocal,
} from '../../src/features/hermes/contrato';
import { useAuthStore } from '../../src/store/useAuthStore';

const COLOR_HERMES = '#059669';

// ── Una burbuja ──────────────────────────────────────────────────────
const Burbuja = ({
  m, onReintentar, onDescartar, onAbrir, reproductor,
}: {
  m: MensajeChat;
  onReintentar: (id: string) => void;
  onDescartar: (id: string) => void;
  onAbrir: (medio: MedioServidor) => void;
  reproductor: ReturnType<typeof useReproductor>;
}) => {
  const mio = m.rol === 'usuario';
  const autor = mio ? AUTORES.usuario : AUTORES.hermes;

  return (
    <View className={`mb-3 px-3 ${mio ? 'items-end' : 'items-start'}`}>
      {/* El nombre SIEMPRE, no solo en el primero de una tanda. Es lo que
          impide que la conversación se lea como un monólogo. */}
      {!mio && (
        <View className="mb-1 flex-row items-center gap-1.5">
          <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: COLOR_HERMES }}>
            <Bot size={12} color="#fff" />
          </View>
          <Text className="text-[11px] font-bold text-emerald-700">{autor.nombre}</Text>
          <Text className="text-[10px] text-slate-400">{autor.rol}</Text>
        </View>
      )}

      <View
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          mio ? 'rounded-br-sm bg-blue-600' : 'rounded-bl-sm border border-slate-200 bg-white'}`}
        style={m.pendiente ? { opacity: 0.65 } : undefined}
      >
        {m.texto ? (
          <Text
            className={`text-[14px] leading-5 ${mio ? 'text-white' : 'text-slate-800'}`}
            selectable
          >
            {m.texto}
          </Text>
        ) : null}

        {/* Los adjuntos */}
        {m.medios?.map((med) => (
          <Pressable
            key={med.media_id}
            onPress={() => (med.kind === 'voice' || med.kind === 'audio'
              ? reproductor.alternar(med)
              : onAbrir(med))}
            accessibilityRole="button"
            accessibilityLabel={
              med.kind === 'image' ? 'Ampliar la imagen'
                : med.kind === 'document' ? `Abrir ${nombreSeguro(med.nombre)}`
                : 'Escuchar la nota de voz'}
            className="mt-1.5"
          >
            {med.kind === 'image' ? (
              <MiniaturaImagen medio={med} />
            ) : med.kind === 'voice' || med.kind === 'audio' ? (
              <View className={`flex-row items-center gap-2 rounded-xl px-2.5 py-2 ${
                mio ? 'bg-blue-500' : 'bg-slate-100'}`}>
                {reproductor.sonando === med.media_id
                  ? <Pause size={16} color={mio ? '#fff' : '#334155'} />
                  : <Play size={16} color={mio ? '#fff' : '#334155'} />}
                <Text className={`text-[12px] ${mio ? 'text-white' : 'text-slate-700'}`}>
                  Nota de voz · {formatearDuracion(med.duration_ms)}
                </Text>
              </View>
            ) : (
              <View className={`flex-row items-center gap-2 rounded-xl px-2.5 py-2 ${
                mio ? 'bg-blue-500' : 'bg-slate-100'}`}>
                <FileText size={16} color={mio ? '#fff' : '#334155'} />
                <View className="max-w-[180px]">
                  <Text numberOfLines={1} className={`text-[12px] font-semibold ${mio ? 'text-white' : 'text-slate-700'}`}>
                    {nombreSeguro(med.nombre)}
                  </Text>
                  <Text className={`text-[10px] ${mio ? 'text-blue-100' : 'text-slate-500'}`}>
                    {formatearTamano(med.size_bytes)}
                  </Text>
                </View>
              </View>
            )}
          </Pressable>
        ))}

        {/* La transcripción, cuando Hermes la devuelve. El audio sigue
            estando: si entendió mal, se puede volver a oír. */}
        {m.medios?.some((x) => x.transcript) && (
          <Text className={`mt-1 text-[11px] italic ${mio ? 'text-blue-100' : 'text-slate-500'}`}>
            «{m.medios.find((x) => x.transcript)?.transcript}»
          </Text>
        )}
      </View>

      {/* El estado real, del backend. Nunca de un temporizador. */}
      <View className="mt-0.5 flex-row items-center gap-2">
        {m.pendiente && (
          <Text className="text-[10px] text-amber-600">
            {m.estado === 'subiendo' ? ESTADOS.subiendo
              : m.error ? 'No se pudo enviar'
              : ESTADOS.pendiente_local}
          </Text>
        )}
        {!m.pendiente && mio && m.estado && (
          <Text className="text-[10px] text-slate-400">
            {ESTADOS[m.estado] || ''}
          </Text>
        )}
        {m.error && (
          <>
            <Pressable onPress={() => onReintentar(m.clientMessageId!)}
              accessibilityRole="button" accessibilityLabel="Reintentar el envío"
              className="flex-row items-center gap-1">
              <RotateCcw size={11} color="#2563eb" />
              <Text className="text-[10px] font-bold text-blue-600">Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => onDescartar(m.clientMessageId!)}
              accessibilityRole="button" accessibilityLabel="Descartar el mensaje">
              <Text className="text-[10px] text-slate-400">Descartar</Text>
            </Pressable>
          </>
        )}
        {!mio && !!m.texto && (
          <Pressable
            onPress={() => { Clipboard.setStringAsync(m.texto); }}
            accessibilityRole="button" accessibilityLabel="Copiar el texto"
            hitSlop={8}
          >
            <Copy size={11} color="#94a3b8" />
          </Pressable>
        )}
      </View>
    </View>
  );
};

// La miniatura pide su URL firmada al montarse y la deja caducar. No se
// guarda en el estado de la lista: es una credencial con fecha.
const MiniaturaImagen = ({ medio }: { medio: MedioServidor }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    api.urlFirmada(medio.bucket, medio.storage_path, 600)
      .then((u) => { if (vivo) setUrl(u); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [medio.bucket, medio.storage_path]);

  if (!url) {
    return <View className="h-40 w-52 items-center justify-center rounded-xl bg-slate-200">
      <ActivityIndicator size="small" />
    </View>;
  }
  return <Image source={{ uri: url }} className="h-40 w-52 rounded-xl" resizeMode="cover" />;
};

// ── LA PANTALLA ──────────────────────────────────────────────────────
export default function HermesScreen() {
  const router = useRouter();
  const perfil = useAuthStore((s) => s.profile);
  const chat = useHermesChat();
  const grab = useGrabadora();
  const reproductor = useReproductor();

  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState<MedioLocal[]>([]);
  const [menuAdjuntar, setMenuAdjuntar] = useState(false);
  const [imagenGrande, setImagenGrande] = useState<string | null>(null);
  const listaRef = useRef<FlatList<MensajeChat>>(null);

  const hayRed = true; // se refina con NetInfo si el proyecto lo incorpora

  // Al salir de la pantalla: micrófono suelto y audio callado. Un chat que
  // se queda grabando de fondo es lo que hace que se desinstale la app.
  useEffect(() => () => { grab.cancelar(); reproductor.parar(); }, []);

  const anadir = (m: MedioLocal) => setAdjuntos((a) => [...a, m]);

  const desdeCamara = async () => {
    setMenuAdjuntar(false);
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Cámara bloqueada',
        'Permite el acceso a la cámara desde los ajustes del teléfono para enviar fotos.',
        [{ text: 'Cancelar' }, { text: 'Abrir ajustes', onPress: () => Linking.openSettings() }]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    anadir({
      uri: a.uri, kind: 'image', mimeType: a.mimeType || 'image/jpeg',
      sizeBytes: a.fileSize || 0, width: a.width, height: a.height,
      nombre: a.fileName || 'foto.jpg',
    });
  };

  const desdeGaleria = async () => {
    setMenuAdjuntar(false);
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Galería bloqueada',
        'Permite el acceso a las fotos desde los ajustes del teléfono.',
        [{ text: 'Cancelar' }, { text: 'Abrir ajustes', onPress: () => Linking.openSettings() }]);
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7, allowsMultipleSelection: true, selectionLimit: 6, exif: false,
    });
    if (r.canceled) return;
    for (const a of r.assets || []) {
      anadir({
        uri: a.uri, kind: 'image', mimeType: a.mimeType || 'image/jpeg',
        sizeBytes: a.fileSize || 0, width: a.width, height: a.height,
        nombre: a.fileName || 'foto.jpg',
      });
    }
  };

  const desdeDocumentos = async () => {
    setMenuAdjuntar(false);
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'text/*',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      multiple: false, copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    anadir({
      uri: a.uri, kind: 'document', mimeType: a.mimeType || 'application/octet-stream',
      sizeBytes: a.size || 0, nombre: a.name,
    });
  };

  const grabarVoz = async () => {
    if (grab.grabando) {
      const rec = await grab.detener();
      if (rec) anadir(rec);
      return;
    }
    await grab.empezar();
  };

  const mandar = () => {
    const ok = chat.enviar(texto, adjuntos);
    if (!ok) return;
    setTexto('');
    setAdjuntos([]);
    setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const abrirMedio = async (med: MedioServidor) => {
    try {
      const url = await api.urlFirmada(med.bucket, med.storage_path, 300);
      if (med.kind === 'image') setImagenGrande(url);
      else await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir', 'Ese archivo ya no está disponible.');
    }
  };

  const cabecera = estadoCabecera(chat.conectado, hayRed, chat.procesando, false);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── CABECERA ─────────────────────────────────────────────── */}
      <View className="flex-row items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5">
        <Pressable onPress={() => router.back()} accessibilityLabel="Volver" hitSlop={10}>
          <X size={22} color="#475569" />
        </Pressable>
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: COLOR_HERMES }}>
          <Bot size={20} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-slate-800">Hermes</Text>
          <Text className="text-[11px] text-slate-500">
            Orquestador comercial · {cabecera}
          </Text>
        </View>
        <Pressable
          onPress={() => Alert.alert(
            'Nueva conversación',
            'Hermes deja de tener en cuenta lo hablado hasta ahora. El historial anterior NO se borra.',
            [{ text: 'Cancelar', style: 'cancel' },
             { text: 'Empezar', onPress: chat.empezarDeCero }])}
          accessibilityRole="button"
          accessibilityLabel="Empezar una conversación nueva"
          className="rounded-full border border-slate-200 p-1.5"
        >
          <Plus size={18} color="#475569" />
        </Pressable>
      </View>

      {!chat.conectado && (
        <View className="flex-row items-center gap-2 bg-amber-50 px-3 py-1.5">
          <WifiOff size={13} color="#b45309" />
          <Text className="flex-1 text-[11px] text-amber-800">
            Hermes no está dando señal. Lo que escribas se guarda y se manda cuando vuelva.
          </Text>
        </View>
      )}

      {/* ── LA CONVERSACIÓN ──────────────────────────────────────── */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {chat.cargando ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            ref={listaRef}
            data={chat.mensajes}
            keyExtractor={(m) => m.id}
            className="flex-1"
            contentContainerStyle={{ paddingVertical: 12 }}
            onContentSizeChange={() => listaRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View className="items-center px-8 py-16">
                <View className="mb-3 h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: COLOR_HERMES }}>
                  <Bot size={28} color="#fff" />
                </View>
                <Text className="text-center text-[13px] font-semibold text-slate-700">
                  Háblale a Hermes
                </Text>
                <Text className="mt-1 text-center text-[12px] leading-5 text-slate-500">
                  Escribe, manda una foto de una pieza o una nota de voz. Él consulta
                  MotoFlow con Jarvis y te contesta aquí.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Burbuja
                m={item}
                onReintentar={chat.reintentarMensaje}
                onDescartar={chat.descartarMensaje}
                onAbrir={abrirMedio}
                reproductor={reproductor}
              />
            )}
          />
        )}

        {chat.error ? (
          <Pressable onPress={() => chat.setError('')}
            className="mx-3 mb-1 flex-row items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
            <AlertTriangle size={14} color="#b91c1c" />
            <Text className="flex-1 text-[11px] text-red-700">{chat.error}</Text>
          </Pressable>
        ) : null}

        {/* ── ADJUNTOS PENDIENTES ────────────────────────────────── */}
        {adjuntos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            className="max-h-24 border-t border-slate-200 bg-white px-2 py-2">
            {adjuntos.map((a, i) => (
              <View key={`${a.uri}-${i}`} className="mr-2 rounded-xl border border-slate-200 p-1">
                {a.kind === 'image'
                  ? <Image source={{ uri: a.uri }} className="h-16 w-16 rounded-lg" />
                  : (
                    <View className="h-16 w-16 items-center justify-center rounded-lg bg-slate-100">
                      {a.kind === 'document' ? <FileText size={20} color="#475569" /> : <Mic size={20} color="#475569" />}
                      <Text numberOfLines={1} className="mt-0.5 max-w-[56px] text-[8px] text-slate-500">
                        {a.kind === 'document' ? nombreSeguro(a.nombre) : formatearDuracion(a.durationMs)}
                      </Text>
                    </View>
                  )}
                <Pressable
                  onPress={() => setAdjuntos((x) => x.filter((_, j) => j !== i))}
                  accessibilityRole="button" accessibilityLabel="Quitar el adjunto"
                  className="absolute -right-1 -top-1 rounded-full bg-slate-800 p-0.5"
                >
                  <X size={11} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── GRABANDO ───────────────────────────────────────────── */}
        {grab.grabando && (
          <View className="flex-row items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2">
            <View className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <Text className="flex-1 text-[12px] font-semibold text-red-700">
              Grabando · {formatearDuracion(grab.duracionMs)}
            </Text>
            <Pressable onPress={grab.cancelar} accessibilityLabel="Cancelar la grabación"
              className="rounded-lg border border-slate-300 px-2.5 py-1">
              <Text className="text-[11px] text-slate-600">Cancelar</Text>
            </Pressable>
            <Pressable onPress={grabarVoz} accessibilityLabel="Terminar de grabar"
              className="flex-row items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5">
              <Square size={12} color="#fff" />
              <Text className="text-[11px] font-bold text-white">Listo</Text>
            </Pressable>
          </View>
        )}

        {/* ── COMPOSITOR ─────────────────────────────────────────── */}
        {!grab.grabando && (
          <View className="flex-row items-end gap-1.5 border-t border-slate-200 bg-white px-2 py-2">
            <Pressable onPress={() => setMenuAdjuntar(true)}
              accessibilityRole="button" accessibilityLabel="Adjuntar un archivo"
              className="h-10 w-10 items-center justify-center rounded-full">
              <Paperclip size={20} color="#475569" />
            </Pressable>

            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escríbele a Hermes…"
              placeholderTextColor="#94a3b8"
              multiline
              accessibilityLabel="Mensaje para Hermes"
              className="max-h-28 min-h-[40px] flex-1 rounded-2xl bg-slate-100 px-3 py-2 text-[14px] text-slate-800"
            />

            {texto.trim() || adjuntos.length > 0 ? (
              <Pressable onPress={mandar}
                accessibilityRole="button" accessibilityLabel="Enviar"
                className="h-10 w-10 items-center justify-center rounded-full bg-blue-600">
                <Send size={18} color="#fff" />
              </Pressable>
            ) : (
              <Pressable onPress={grabarVoz}
                accessibilityRole="button" accessibilityLabel="Grabar una nota de voz"
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                <Mic size={20} color="#334155" />
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── MENÚ DE ADJUNTAR ─────────────────────────────────────── */}
      <Modal visible={menuAdjuntar} transparent animationType="fade"
        onRequestClose={() => setMenuAdjuntar(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setMenuAdjuntar(false)}>
          <View className="rounded-t-3xl bg-white p-4 pb-8">
            <Text className="mb-3 text-center text-[13px] font-bold text-slate-700">Adjuntar</Text>
            {[
              { icono: Camera, txt: 'Tomar una foto', fn: desdeCamara },
              { icono: ImgIcon, txt: 'Elegir de la galería', fn: desdeGaleria },
              { icono: FileText, txt: 'Documento', fn: desdeDocumentos },
            ].map(({ icono: Ico, txt, fn }) => (
              <Pressable key={txt} onPress={fn} accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-slate-100">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <Ico size={18} color="#334155" />
                </View>
                <Text className="text-[14px] text-slate-700">{txt}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── IMAGEN AMPLIADA ──────────────────────────────────────── */}
      <Modal visible={!!imagenGrande} transparent animationType="fade"
        onRequestClose={() => setImagenGrande(null)}>
        <Pressable className="flex-1 items-center justify-center bg-black/95"
          onPress={() => setImagenGrande(null)}>
          {imagenGrande && (
            <Image source={{ uri: imagenGrande }} className="h-4/5 w-full" resizeMode="contain" />
          )}
          <Text className="mt-4 text-[12px] text-white/60">Toca para cerrar</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
