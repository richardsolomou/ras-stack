# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.26-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS centrifugo
ARG TARGETOS
ARG TARGETARCH
ARG CENTRIFUGO_VERSION=6.9.1
ARG CENTRIFUGO_COMMIT=4603be29243501f4ac2787de17c4f0428b27864e
ARG CENTRIFUGO_SOURCE_SHA256=ba8d3d98a9cb14b7f864dc4a72801302f06a9292eb551b00cddf0c80d3188ea0
WORKDIR /src
RUN wget -q "https://github.com/centrifugal/centrifugo/archive/${CENTRIFUGO_COMMIT}.tar.gz" -O source.tar.gz \
    && echo "${CENTRIFUGO_SOURCE_SHA256}  source.tar.gz" | sha256sum -c - \
    && tar -xzf source.tar.gz \
    && cd "centrifugo-${CENTRIFUGO_COMMIT}" \
    && go get google.golang.org/grpc@v1.82.1 golang.org/x/crypto@v0.55.0 \
    && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags="-s -w -X github.com/centrifugal/centrifugo/v6/internal/build.Version=${CENTRIFUGO_VERSION}" -o /out/centrifugo . \
    && cp LICENSE /out/CENTRIFUGO-LICENSE

FROM --platform=$BUILDPLATFORM golang:1.26-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS caddy
ARG TARGETOS
ARG TARGETARCH
ARG CADDY_VERSION=2.11.4
ARG CADDY_SOURCE_SHA256=2c3d02078286a6282cdb4d1d8744077788d556659dac0b64d8ed5886a7e5aeb9
WORKDIR /src
RUN wget -q "https://github.com/caddyserver/caddy/archive/refs/tags/v${CADDY_VERSION}.tar.gz" -O source.tar.gz \
    && echo "${CADDY_SOURCE_SHA256}  source.tar.gz" | sha256sum -c - \
    && tar -xzf source.tar.gz \
    && cd "caddy-${CADDY_VERSION}" \
    && go get google.golang.org/grpc@v1.82.1 golang.org/x/text@v0.41.0 golang.org/x/crypto@v0.55.0 \
    && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags="-s -w -X github.com/caddyserver/caddy/v2.CustomVersion=v${CADDY_VERSION}" -o /out/caddy ./cmd/caddy \
    && cp LICENSE /out/CADDY-LICENSE

FROM scratch
ARG RUNTIME_VERSION=1.0.2
ARG CADDY_VERSION=2.11.4
ARG CENTRIFUGO_VERSION=6.9.1
LABEL org.opencontainers.image.title="ras-stack runtime binaries" \
      org.opencontainers.image.description="Verified static Caddy and Centrifugo binaries for ras-stack applications." \
      org.opencontainers.image.source="https://github.com/richardsolomou/ras-stack" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${RUNTIME_VERSION}" \
      dev.ras-stack.caddy.version="${CADDY_VERSION}" \
      dev.ras-stack.centrifugo.version="${CENTRIFUGO_VERSION}"
COPY --from=caddy /out/caddy /usr/local/bin/caddy
COPY --from=centrifugo /out/centrifugo /usr/local/bin/centrifugo
COPY --from=caddy /out/CADDY-LICENSE /licenses/CADDY-LICENSE
COPY --from=centrifugo /out/CENTRIFUGO-LICENSE /licenses/CENTRIFUGO-LICENSE
