# Use Node.js 18 LTS as base image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory for local storage
RUN mkdir -p server/data

# Expose port (Cloud Run will set PORT environment variable)
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]