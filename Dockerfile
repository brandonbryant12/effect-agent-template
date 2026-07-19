ARG PNPM_VERSION=10.23.0

FROM node:26-bookworm-slim AS dependencies
ARG PNPM_VERSION
RUN npm install --global "pnpm@${PNPM_VERSION}"
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
ARG PNPM_VERSION
RUN npm install --global "pnpm@${PNPM_VERSION}"
RUN groupadd --system app && useradd --system --gid app --create-home app
WORKDIR /app
COPY --from=dependencies --chown=app:app /app /app
USER app
ARG APP=@repo/server
ENV APP=$APP
CMD ["sh", "-c", "exec pnpm --filter \"$APP\" start"]
