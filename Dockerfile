# One image for the whole shop: the React app is built and served by Spring Boot from the same origin as /api.
#   docker build -t hat-lanh .
#   docker run -p 8080:8080 --env-file backend/.env -e DB_URL=... hat-lanh

# ---- 1. Frontend ----
FROM node:24-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Public, build-time value. Default = Cloudflare's always-pass TEST site key (no real bot protection):
# set your own site key as a build argument / Render env var before taking real customers.
ARG VITE_TURNSTILE_SITE_KEY=1x00000000000000000000BB
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npm run build

# ---- 2. Backend ----
FROM eclipse-temurin:21-jdk-alpine AS backend
WORKDIR /app
COPY backend/.mvn .mvn
COPY backend/mvnw backend/pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY backend/src src
COPY --from=frontend /app/dist src/main/resources/static
# Tests need Docker (Testcontainers) and run in development/CI, not inside the image build
RUN ./mvnw -B -q package -DskipTests && cp target/*.jar app.jar

# ---- 3. Runtime ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=backend /app/app.jar app.jar
# Free hosting tiers have ~512 MB RAM: size the heap from the container limit, keep thread stacks small
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -Xss512k -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
