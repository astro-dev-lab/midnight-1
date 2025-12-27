# Use Node 22 (Midnight requires Node ≥22.13.1)
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy app source
COPY . .

# Generate Prisma client
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations, seed, then start the server
CMD sh -c "npx prisma migrate deploy && node prisma/seed.js && node index.js"