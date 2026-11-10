import os
from flask import Flask, render_template, url_for

from content import CITY, DISTRICTS, SLIDES, MOMENTS

app = Flask(__name__)

IMG_DIR = os.path.join(app.static_folder, "img")
EXTS = ("jpg", "jpeg", "png", "webp", "avif")


def photo(key):
    """URL фото из static/img/<key>.(jpg|png|webp...) или None, если файла ещё нет."""
    for ext in EXTS:
        if os.path.exists(os.path.join(IMG_DIR, f"{key}.{ext}")):
            return url_for("static", filename=f"img/{key}.{ext}")
    return None


app.jinja_env.globals["photo"] = photo


def sponsors():
    d = os.path.join(IMG_DIR, "sponsors")
    if not os.path.isdir(d):
        return []
    return [url_for("static", filename=f"img/sponsors/{f}") for f in sorted(os.listdir(d))
            if f.lower().endswith(("png", "jpg", "jpeg", "webp", "svg", "avif"))]


@app.route("/")
def index():
    sites = []
    for i, d in enumerate(DISTRICTS, 1):
        sites.append({
            "name": d["name"], "u": d["u"], "v": d["v"], "box": d["box"],
            "photo": photo(f"district-{i}"),
        })
    # необязательные замены картинок героя: static/img/hero-map.jpg и т.д.
    assets = {}
    for key, name in (("MAP", "hero-map"), ("LAND", "hero-land"),
                      ("FORE", "hero-fore"), ("CARDS", "hero-cards")):
        u = photo(name)
        if u:
            assets[key] = u
    data = {"sites": sites, "tharsis": CITY["region"], "assets": assets}
    return render_template("index.html", city=CITY, districts=DISTRICTS,
                           s=SLIDES, data=data, sponsors=sponsors(),
                           moments={m['after']: dict(m, n=i) for i, m in enumerate(MOMENTS, 1)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
