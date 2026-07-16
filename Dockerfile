FROM node:26-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && groupadd --system app && useradd --system --gid app --create-home app
WORKDIR /app
COPY --from=dependencies --chown=app:app /app /app
USER app
ARG APP=@repo/server
ENV APP=$APP
CMD ["sh", "-c", "exec pnpm --filter \"$APP\" start"]
