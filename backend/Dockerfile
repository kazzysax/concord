# Backend API. Multi-stage keeps the final image to just prod deps.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# JSON-file fallback store writes here if STORE_DRIVER=memory is ever left on
# by mistake in a container - mount a volume at this path if so, though the
# whole point of STORE_DRIVER=postgres in prod is to not need one.
RUN mkdir -p /app/data
EXPOSE 4000
CMD ["sh", "-c", "node ${APP_ENTRY:-server.js}"]
