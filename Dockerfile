FROM node:22.23.4-bookworm-slim
LABEL org.opencontainers.image.title="Tarbiyati · تربيتي"

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/var/lib/scienceedu
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && mkdir -p /var/lib/scienceedu \
    && chown node:node /var/lib/scienceedu
COPY server.js index.html ./
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY styles/ ./styles/
COPY pages/ ./pages/
COPY assets/ ./assets/
COPY PDFs/ ./PDFs/
COPY content/exams/ ./content/exams/
COPY tools/check-email.js tools/database-backup.js ./tools/

USER node
EXPOSE 3000
VOLUME /var/lib/scienceedu
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
