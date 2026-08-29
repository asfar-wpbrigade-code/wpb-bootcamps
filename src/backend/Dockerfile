FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci
# Install PostgreSQL client
RUN npm install pg --save
# postgresql16-client (matching the postgres:16 image in docker-compose.yml)
# provides pg_dump/pg_restore for scripts/backup.js and scripts/restore.js -
# see docs/self-hosting.md.
#
# bash is here for people, not for the app: the base image ships busybox ash,
# so `docker compose exec backend bash` fails and anyone debugging a
# deployment has to know to type `sh` instead. Costs about a megabyte.
RUN apk add --no-cache postgresql16-client bash

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 1337

# Start the application in production mode
CMD ["npm", "run", "start"] 