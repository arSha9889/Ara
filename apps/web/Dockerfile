FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_BASE_URL=
ARG VITE_WS_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_BASE_URL=$VITE_WS_BASE_URL

RUN npm run build

FROM nginx:1.27-alpine

ENV PORT=8080 \
    NEXUS_API_UPSTREAM=http://api:8000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/40-generate-runtime-config.sh /docker-entrypoint.d/40-generate-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
