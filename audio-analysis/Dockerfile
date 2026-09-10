# essentia-tensorflow only ships compiled wheels for manylinux2014_x86_64 (no
# arm64 Linux wheel exists at all) — this image only ever builds/runs on
# linux/amd64, see docker-compose.yml's `platform:` pin on this service and
# the CI workflow's per-image platform list.
FROM python:3.12-slim

# libsndfile1 + ffmpeg — Essentia's audio loader (MonoLoader) uses these
# system libraries to decode compressed formats like mp3; curl — used below
# to fetch model files, and by docker-compose's healthcheck at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libsndfile1 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pretrained Discogs-EffNet genre model — downloaded at build time (not
# committed to the repo) so a rebuild always has exactly what the
# essentia.upf.edu catalog currently serves, same reasoning as this project
# not vendoring its own copy of yt-dlp.
RUN mkdir -p /app/models

# essentia.upf.edu throttles sustained downloads to a crawl after an initial
# burst (observed: stalls to a few hundred bytes/sec, independent of GH
# Actions — reproduces from any network). -C - resumes across retries instead
# of restarting from byte 0 each time, and --speed-limit/--speed-time aborts
# (and retries) a connection that's stalled rather than hanging indefinitely.
RUN curl -v \
    --retry 20 \
    --retry-delay 5 \
    --retry-all-errors \
    --speed-limit 512 \
    --speed-time 30 \
    -C - \
    -fSL \
    -o /app/models/discogs-effnet-bs64-1.pb \
    https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb

RUN curl -v \
    --retry 20 \
    --retry-delay 5 \
    --retry-all-errors \
    --speed-limit 512 \
    --speed-time 30 \
    -C - \
    -fSL \
    -o /app/models/genre_discogs400-discogs-effnet-1.pb \
    https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb

RUN curl -v \
    --retry 20 \
    --retry-delay 5 \
    --retry-all-errors \
    --speed-limit 512 \
    --speed-time 30 \
    -C - \
    -fSL \
    -o /app/models/genre_discogs400-discogs-effnet-1.json \
    https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json

COPY app.py .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
