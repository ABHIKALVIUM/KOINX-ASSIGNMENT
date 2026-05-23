FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE=http://localhost:3001/api
ENV VITE_API_BASE=$VITE_API_BASE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Nginx production image ──
FROM nginx:alpine AS runner

# Copy built production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our clean Nginx routing configuration 
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]