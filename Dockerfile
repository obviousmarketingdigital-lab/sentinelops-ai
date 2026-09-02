FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# The standalone output does not trace files read at runtime, so data/ has to be
# copied explicitly or the fix history is missing from the image.
COPY --from=builder /app/data ./data

RUN addgroup -g 1001 -S nodejs \
  && adduser -S sentinel -u 1001 -G nodejs \
  && chown -R sentinel:nodejs /app/data
USER sentinel

EXPOSE 10000
ENV PORT=10000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
