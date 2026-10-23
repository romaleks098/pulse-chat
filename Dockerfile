# Production multi-stage Dockerfile for PulseChat
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and workspaces package files
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install dependencies
RUN npm install
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build client and server
RUN npm run build

# Runtime container
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy package files & production node_modules
COPY server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Expose server port
EXPOSE 3001

# Run server
CMD ["node", "server/dist/index.js"]
