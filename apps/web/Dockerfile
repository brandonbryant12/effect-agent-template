ARG PNPM_VERSION=10.23.0

FROM node:26-bookworm-slim AS build
ARG PNPM_VERSION
RUN npm install --global "pnpm@${PNPM_VERSION}"
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@repo/web...

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
