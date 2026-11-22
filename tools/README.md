# herramientas

`retratos.py` convierte una foto en el dibujo de trazos que usa la escena (json de polilíneas, aguada en webp y póster en png).
necesita python 3.10 o más reciente y tres paquetes: `numpy`, `opencv-python` y `pillow`. las fotos de origen viven en `_privado/ref/` (no se publican).

## macos

```
python3 -m pip install --user numpy opencv-python pillow
python3 tools/retratos.py                 # las cinco edades
python3 tools/retratos.py adolescente     # solo una
```

## windows

```
py -3 -m pip install --user numpy opencv-python pillow
py -3 tools\retratos.py
py -3 tools\retratos.py adolescente
```

el script usa `pathlib`, lee las imágenes con `numpy.fromfile` (acepta rutas con acentos) y no llama a comandos de shell, así que se comporta igual en ambos sistemas.
la salida va a `assets/retratos/` con nombres en minúsculas.
