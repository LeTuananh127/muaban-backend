# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for Nest CLI and Prisma)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy application source
COPY . .

# Build NestJS application
RUN npm run build

# Production Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifests and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Copy installed node_modules and built dist folder from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose NestJS default port
EXPOSE 3000

# Run Prisma migrations and start production server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
