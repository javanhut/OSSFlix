FROM docker.io/oven/bun:1 AS base

WORKDIR /usr/src/app

# Install dependencies into a temp directory for caching
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Production image
FROM base AS release

# ffmpeg is needed for the /api/stream transcoding endpoint
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy dependencies from install stage
COPY --from=install /temp/dev/node_modules node_modules

# Copy application source
COPY package.json bun.lock tsconfig.json index.ts index.html frontend.tsx styles.css App.tsx ./
COPY components/ components/
COPY constants/ constants/
COPY context/ context/
RUN mkdir -p data && chown bun:bun data
COPY images/ images/
COPY pages/ pages/
COPY scripts/ scripts/

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "index.ts"]
