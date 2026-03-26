from PIL import Image

def remove_white_background(input_path, output_path):
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Change all near-white pixels to transparent
            if item[0] >= 220 and item[1] >= 220 and item[2] >= 220:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print("Fondo blanco eliminado con éxito!")
    except Exception as e:
        print(f"Error procesando la imagen: {e}")

if __name__ == "__main__":
    import os
    target_path = os.path.join("public", "logo completo.png")
    if os.path.exists(target_path):
        remove_white_background(target_path, target_path)
    else:
        print(f"No se encontró el archivo: {target_path}")
