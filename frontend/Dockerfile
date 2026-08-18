# Static build served by nginx. VITE_PRIVY_APP_ID must be present at BUILD
# time, not runtime - Vite inlines import.meta.env values into the bundle.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_PRIVY_APP_ID
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
