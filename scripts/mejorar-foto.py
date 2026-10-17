# ============================================================
# Mejorar una foto de producto con Real-ESRGAN (gratis, en la PC)
# ============================================================
# (17/10/2026) Las fotos del catálogo suelen ser chicas (400-800 px) y en el
# video de 1920x1080 o en el reel se ven borrosas. Esto las agranda x4 con
# Real-ESRGAN General x4v3 y las deja a LADO px (1600 por defecto).
#
#   python mejorar-foto.py entrada.jpg salida.jpg [LADO]
#
# Corre en el procesador: la GeForce 210 de esta PC no tiene Vulkan, así que
# la versión rápida (realesrgan-ncnn-vulkan) no arranca. El modelo (ONNX de
# Qualcomm AI Hub, entrada fija 128x128) se aplica por cuadros con solape.
# Si la foto ya es grande, solo se copia. Instalado en
# C:\RepuestosMorla\herramientas\mejorar-fotos (modelo + este archivo);
# necesita: pip install onnxruntime opencv-python numpy
# ============================================================
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.path.join(AQUI, 'real_esrgan_general_x4v3-onnx-float', 'real_esrgan_general_x4v3.onnx')
CUADRO, SOLAPE, ESCALA = 128, 12, 4
YA_GRANDE = 1000  # lado mayor a partir del cual no vale la pena


def leer(ruta):
    img = cv2.imdecode(np.fromfile(ruta, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f'no se pudo leer {ruta}')
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:  # PNG con transparencia: sobre blanco, como en la tienda
        alfa = img[:, :, 3:4].astype(np.float32) / 255
        img = (img[:, :, :3].astype(np.float32) * alfa + 255 * (1 - alfa)).astype(np.uint8)
    return img


def agrandar(img):
    sesion = ort.InferenceSession(MODELO, providers=['CPUExecutionProvider'])
    nombre = sesion.get_inputs()[0].name
    h, w = img.shape[:2]
    paso = CUADRO - 2 * SOLAPE
    # Borde reflejado para que todos los cuadros sean de 128 y el centro útil cubra la foto.
    ph = (-(h) % paso) + 2 * SOLAPE
    pw = (-(w) % paso) + 2 * SOLAPE
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    rel = cv2.copyMakeBorder(rgb, SOLAPE, ph - SOLAPE, SOLAPE, pw - SOLAPE, cv2.BORDER_REFLECT_101)
    salida = np.zeros(((h + ph - 2 * SOLAPE) * ESCALA, (w + pw - 2 * SOLAPE) * ESCALA, 3), np.float32)
    for y in range(0, rel.shape[0] - 2 * SOLAPE, paso):
        for x in range(0, rel.shape[1] - 2 * SOLAPE, paso):
            cuadro = rel[y:y + CUADRO, x:x + CUADRO].transpose(2, 0, 1)[None]
            out = sesion.run(None, {nombre: np.ascontiguousarray(cuadro)})[0][0].transpose(1, 2, 0)
            s, p = SOLAPE * ESCALA, paso * ESCALA
            salida[y * ESCALA:y * ESCALA + p, x * ESCALA:x * ESCALA + p] = out[s:s + p, s:s + p]
    salida = salida[:h * ESCALA, :w * ESCALA]
    return cv2.cvtColor((np.clip(salida, 0, 1) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)


def main():
    if len(sys.argv) < 3:
        raise SystemExit('uso: python mejorar-foto.py entrada salida [LADO]')
    entrada, destino = sys.argv[1], sys.argv[2]
    lado = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
    img = leer(entrada)
    h, w = img.shape[:2]
    if max(h, w) < YA_GRANDE:
        img = agrandar(img)
    h2, w2 = img.shape[:2]
    if max(h2, w2) > lado:
        f = lado / max(h2, w2)
        img = cv2.resize(img, (round(w2 * f), round(h2 * f)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(os.path.splitext(destino)[1] or '.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 93])
    if not ok:
        raise SystemExit('no se pudo guardar')
    buf.tofile(destino)
    print(f'{w}x{h} -> {img.shape[1]}x{img.shape[0]}')


if __name__ == '__main__':
    main()
