# SSL/HTTPS Setup Guide

## Option 1: Self-Signed Certificate for Localhost (Quick Setup)

Use this option for local development or internal network access with HTTPS.

### 1. Create SSL directory and generate certificate

```bash
# Create SSL directory
mkdir -p ssl

# Generate self-signed certificate (valid for 365 days)
docker run --rm -v ${PWD}/ssl:/ssl alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /ssl/localhost.key \
  -out /ssl/localhost.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

### 2. Update nginx-docker.conf

Edit `nginx-docker.conf` and change the SSL certificate paths to use self-signed:

```nginx
# Comment out Let's Encrypt lines:
# ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

# Uncomment self-signed lines:
ssl_certificate /etc/nginx/ssl/localhost.crt;
ssl_certificate_key /etc/nginx/ssl/localhost.key;
```

Also comment out the HTTP to HTTPS redirect if you want both HTTP and HTTPS:

```nginx
# Redirect HTTP to HTTPS (comment out if not using HTTPS)
# location / {
#     return 301 https://$host$request_uri;
# }
```

Or keep HTTP working by changing the HTTP server block:

```nginx
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    client_max_body_size 10M;

    location / {
        proxy_pass http://grd-wizard:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_cache_bypass $http_upgrade;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 3. Restart containers

```bash
docker-compose restart nginx
```

### 4. Access via HTTPS

```
https://localhost
```

**Note:** Your browser will show a security warning because the certificate is self-signed. This is normal. Click "Advanced" and "Proceed" to continue.

### 5. Trust the certificate (Optional, to remove browser warning)

**Windows:**
1. Double-click `ssl/localhost.crt`
2. Click "Install Certificate"
3. Choose "Local Machine"
4. Select "Place all certificates in the following store"
5. Browse to "Trusted Root Certification Authorities"
6. Click "Next" and "Finish"

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ssl/localhost.crt
```

**Linux:**
```bash
sudo cp ssl/localhost.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

---

## Option 2: Let's Encrypt Certificate (Production with Domain)

Use this option if you have a public domain name and want a trusted SSL certificate.

### Prerequisites

- A public domain name (e.g., `grd-wizard.example.com`)
- Domain DNS pointing to your server's public IP
- Ports 80 and 443 accessible from the internet

### 1. Update nginx-docker.conf

Make sure the Let's Encrypt certificate paths are active in `nginx-docker.conf`:

```nginx
# For Let's Encrypt (with domain):
ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

# For self-signed (localhost):
# ssl_certificate /etc/nginx/ssl/localhost.crt;
# ssl_certificate_key /etc/nginx/ssl/localhost.key;
```

Replace `your-domain.com` with your actual domain.

### 2. Temporarily disable HTTPS redirect

Comment out the HTTPS redirect in the HTTP server block to allow Let's Encrypt validation:

```nginx
location / {
    # return 301 https://$host$request_uri;
    proxy_pass http://grd-wizard:3000;
    # ... rest of proxy settings
}
```

### 3. Start containers

```bash
docker-compose up -d
```

### 4. Obtain certificate

Replace `your-domain.com` and `your-email@example.com` with your actual values:

```bash
docker-compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d your-domain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### 5. Re-enable HTTPS redirect

Uncomment the redirect in `nginx-docker.conf`:

```nginx
location / {
    return 301 https://$host$request_uri;
}
```

### 6. Restart nginx

```bash
docker-compose restart nginx
```

### 7. Access via HTTPS

```
https://your-domain.com
```

### Certificate Renewal

Certificates are automatically renewed by the certbot container every 12 hours. Manual renewal:

```bash
docker-compose run --rm certbot renew
docker-compose restart nginx
```

---

## Option 3: Cloudflare SSL (Recommended for Easy Setup)

If using Cloudflare Tunnel from DOCKER.md, Cloudflare provides SSL automatically:

1. Follow Cloudflare Tunnel setup in `DOCKER.md`
2. Cloudflare handles SSL termination
3. Your application gets automatic HTTPS
4. No certificate management needed

---

## Testing SSL

### Check certificate info

```bash
openssl s_client -connect localhost:443 -servername localhost < /dev/null
```

### Test from browser

1. Open https://localhost (or your domain)
2. Click the padlock icon in the address bar
3. View certificate details

### Force HTTPS only

To disable HTTP access completely, remove the entire HTTP server block (port 80) from `nginx-docker.conf`, keeping only the HTTPS block.

---

## Troubleshooting

### Browser shows "Your connection is not private"

**Self-signed certificate:** This is expected. Click "Advanced" > "Proceed to localhost".

**Let's Encrypt:** Check that:
- Certificate was generated successfully
- Domain DNS points to your server
- Certificate paths in nginx config are correct

### Certificate files not found

```bash
# Check certbot logs
docker-compose logs certbot

# Verify certificate files exist
docker-compose exec nginx ls -la /etc/letsencrypt/live/your-domain.com/
```

### Nginx won't start after enabling SSL

```bash
# Check nginx config syntax
docker-compose exec nginx nginx -t

# View nginx logs
docker-compose logs nginx
```

### Let's Encrypt validation fails

```bash
# Ensure port 80 is accessible from internet
curl -I http://your-domain.com/.well-known/acme-challenge/test

# Check certbot logs
docker-compose logs certbot
```

---

## Security Best Practices

1. **Use strong SSL protocols:** Already configured (TLSv1.2, TLSv1.3)
2. **Enable HSTS:** Already configured with `Strict-Transport-Security` header
3. **Regular updates:** Keep Docker images updated
4. **Certificate monitoring:** Set up alerts for certificate expiration
5. **Firewall rules:** Only expose necessary ports (80, 443)

---

## Mixed Content Warning

If you get mixed content warnings, ensure:

1. All resources (CSS, JS, images) use HTTPS or relative URLs
2. `X-Forwarded-Proto` header is set correctly (already configured)
3. Application respects the forwarded protocol
