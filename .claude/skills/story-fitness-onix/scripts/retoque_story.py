import cv2
import numpy as np
from PIL import Image, ImageEnhance

SRC = "/mnt/user-data/uploads/IMG_0996.jpeg"
OUT = "/home/claude/IMG_0996_story.jpeg"

img = cv2.imread(SRC)  # BGR
h, w = img.shape[:2]
print("dims:", w, h)

# ---------- 1. Detectar rosto ----------
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(int(w*0.08), int(w*0.08)))
print("faces:", faces)
if len(faces):
    fx, fy, fw, fh = max(faces, key=lambda f: f[2]*f[3])
else:
    fx, fy, fw, fh = int(w*0.42), int(h*0.20), int(w*0.18), int(w*0.18)
print("face:", fx, fy, fw, fh)

def feather_mask(shape_hw, cx, cy, rx, ry, blur_frac=0.5):
    m = np.zeros(shape_hw, np.float32)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
    k = int(max(rx, ry) * blur_frac) | 1
    m = cv2.GaussianBlur(m, (k, k), 0)
    return m

# ---------- 2. Máscara de pele (para bronzeado) ----------
ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
skin = cv2.inRange(ycrcb, (0, 135, 85), (255, 180, 135)).astype(np.float32) / 255.0
skin = cv2.GaussianBlur(skin, (51, 51), 0)
# limitar pele à área do corpo (evitar pia/porcelana)
body = np.zeros((h, w), np.float32)
cv2.rectangle(body, (int(w*0.18), int(fy - fh*0.6)), (int(w*0.95), h), 1.0, -1)
body = cv2.GaussianBlur(body, (201, 201), 0)
skin *= body

# ---------- 3. Bronzeado sutil + tom saudável ----------
imgf = img.astype(np.float32)
warm = imgf.copy()
warm[:, :, 2] = np.clip(warm[:, :, 2] * 1.055 + 3, 0, 255)   # R
warm[:, :, 1] = np.clip(warm[:, :, 1] * 1.015, 0, 255)       # G
warm[:, :, 0] = np.clip(warm[:, :, 0] * 0.965, 0, 255)       # B
# leve queda de luminância na pele = bronzeado (não pálido)
warm = np.clip(warm * 0.985, 0, 255)
alpha = (skin * 0.65)[..., None]
imgf = imgf * (1 - alpha) + warm * alpha
img = np.clip(imgf, 0, 255).astype(np.uint8)

# ---------- 4. Suavização de pele no rosto (harmonizar) ----------
fcx, fcy = fx + fw / 2, fy + fh / 2
face_mask = feather_mask((h, w), fcx, fcy, fw * 0.62, fh * 0.78, 0.6)
smooth = cv2.bilateralFilter(img, d=15, sigmaColor=45, sigmaSpace=15)
# preservar detalhe: mistura 55% suavizado dentro da máscara
a = (face_mask * 0.55)[..., None]
img = np.clip(img.astype(np.float32) * (1 - a) + smooth.astype(np.float32) * a, 0, 255).astype(np.uint8)

# leve "glow" saudável no rosto (aumenta um toque de brilho e saturação local)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[:, :, 1] = np.clip(hsv[:, :, 1] + face_mask * 10, 0, 255)
hsv[:, :, 2] = np.clip(hsv[:, :, 2] + face_mask * 6, 0, 255)
img = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

# ---------- 5. Definição muscular sutil (peito, braços, abdômen) ----------
# regiões relativas ao rosto
chest_cy = fy + fh * 2.3
abs_cy = fy + fh * 4.1
arm_r_cx = fx + fw * 2.1   # braço esquerdo na foto (direito real, espelho)
arm_l_cx = fx - fw * 1.15

def_mask = np.zeros((h, w), np.float32)
def_mask = np.maximum(def_mask, feather_mask((h, w), fcx, chest_cy, fw * 1.5, fh * 1.2, 0.7))
def_mask = np.maximum(def_mask, feather_mask((h, w), fcx - fw*0.1, abs_cy, fw * 1.2, fh * 1.3, 0.7))
def_mask = np.maximum(def_mask, feather_mask((h, w), arm_r_cx, chest_cy + fh*0.4, fw * 0.85, fh * 1.6, 0.7))
def_mask = np.maximum(def_mask, feather_mask((h, w), arm_l_cx, chest_cy + fh*0.6, fw * 0.7, fh * 1.5, 0.7))

# clarity local (unsharp de baixa frequência = micro-contraste que "esculpe")
blur = cv2.GaussianBlur(img, (0, 0), 18)
clarity = cv2.addWeighted(img, 1.45, blur, -0.45, 0)
a = (def_mask * 0.6)[..., None]
img = np.clip(img.astype(np.float32) * (1 - a) + clarity.astype(np.float32) * a, 0, 255).astype(np.uint8)

# ---------- 6. Realce da marca Onix (camiseta + garrafa) ----------
logo_shirt = feather_mask((h, w), 1620, 2620, fw * 0.65, fh * 0.40, 0.5)
logo_bottle = feather_mask((h, w), 1690, 4330, fw * 0.45, fh * 0.75, 0.5)
logo_mask = np.maximum(logo_shirt, logo_bottle)
blur2 = cv2.GaussianBlur(img, (0, 0), 6)
sharp = cv2.addWeighted(img, 1.6, blur2, -0.6, 0)
bright = np.clip(sharp.astype(np.float32) * 1.06 + 4, 0, 255).astype(np.uint8)
a = (logo_mask * 0.7)[..., None]
img = np.clip(img.astype(np.float32) * (1 - a) + bright.astype(np.float32) * a, 0, 255).astype(np.uint8)

# ---------- 7. Acabamento global: contraste leve + vinheta suave ----------
pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
pil = ImageEnhance.Contrast(pil).enhance(1.05)
pil = ImageEnhance.Color(pil).enhance(1.04)
img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

Y, X = np.ogrid[:h, :w]
vig = 1 - 0.22 * (((X - w/2) / (w*0.75))**2 + ((Y - h/2) / (h*0.75))**2)
vig = np.clip(vig, 0.78, 1.0).astype(np.float32)
img = np.clip(img.astype(np.float32) * vig[..., None], 0, 255).astype(np.uint8)

cv2.imwrite(OUT, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("saved", OUT)

# preview lado a lado reduzido para inspeção
orig = cv2.imread(SRC)
small_o = cv2.resize(orig, (w//5, h//5))
small_n = cv2.resize(img, (w//5, h//5))
cv2.imwrite("/home/claude/preview.jpg", np.hstack([small_o, small_n]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print("preview ok")
