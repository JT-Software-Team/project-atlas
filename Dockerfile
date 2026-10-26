# Production image: builds the client and server, runs the API + static client on port 4000.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production ATLAS_DATA_DIR=/data PORT=4000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
VOLUME ["/data"]
EXPOSE 4000
USER node
CMD ["node", "server/dist/index.js"]
