# Stage 1: Build the Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Rust Backend
FROM rust:1.80-alpine AS backend-builder
RUN apk add --no-cache musl-dev sqlite-dev openssl-dev pkgconfig
WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock ./
# Create dummy src/main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY backend/src ./src
RUN cargo build --release

# Stage 3: Create the runtime image
FROM alpine:3.19
# Install rclone for backups and tzdata for scheduling timezones
RUN apk add --no-cache sqlite rclone openssl libgcc tzdata curl
WORKDIR /app

# Copy the compiled Rust binary
COPY --from=backend-builder /app/target/release/backend /app/backend
# Copy the compiled frontend files
COPY --from=frontend-builder /app/dist /app/public

# Expose the default backend port
EXPOSE 3001

# Start the backend
CMD ["/app/backend"]
