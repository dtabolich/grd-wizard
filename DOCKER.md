# Docker Deployment Guide

## Prerequisites

- Docker Desktop for Windows installed
- Docker Compose installed (included with Docker Desktop)

## Quick Start

### 1. Configure Environment

Create/edit your `.env` file:

```bash
LICENSE_WIZARD_PATH=/license_wizard/license_wizard.exe
HOST=https://localhost:9000
PORT=3000
```

**Note:** The `LICENSE_WIZARD_PATH` should point to the mounted path inside the container.

### 2. Update docker-compose.yml

Edit `docker-compose.yml` and update the volume mount to point to your License Wizard installation:

```yaml
volumes:
  - "C:/Program Files (x86)/Guardant/Software Licensing Kit/redistribute/license_activation:/license_wizard:ro"
```

Change `C:/Program Files (x86)/Guardant/...` to your actual License Wizard path.

### 3. Build and Run

```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost
```

Or from another machine on the network:
```
http://YOUR_WINDOWS_IP
```

## Docker Commands

### Start/Stop

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Restart containers
docker-compose restart

# Stop and remove all data
docker-compose down -v
```

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f grd-wizard
docker-compose logs -f nginx
```

### Rebuild

```bash
# Rebuild after code changes
docker-compose build

# Rebuild and restart
docker-compose up -d --build
```

## Expose to Public Internet

### Option 1: Port Forwarding (Home/Office)

1. **Find your Windows IP address:**
   ```cmd
   ipconfig
   ```
   Look for "IPv4 Address"

2. **Configure router port forwarding:**
   - Log into your router admin panel
   - Forward external port 80 to `YOUR_WINDOWS_IP:80`
   - Forward external port 443 to `YOUR_WINDOWS_IP:443` (if using HTTPS)

3. **Configure Windows Firewall:**
   ```powershell
   # Run PowerShell as Administrator
   New-NetFirewallRule -DisplayName "Docker GRD Wizard HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   New-NetFirewallRule -DisplayName "Docker GRD Wizard HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   ```

4. **Get your public IP:**
   Visit https://whatismyipaddress.com/

5. **Access from internet:**
   ```
   http://YOUR_PUBLIC_IP
   ```

### Option 2: Cloudflare Tunnel (Recommended for Home)

No port forwarding needed, free HTTPS, and better security:

1. **Install cloudflared:**
   Download from https://github.com/cloudflare/cloudflared/releases

2. **Login to Cloudflare:**
   ```cmd
   cloudflared tunnel login
   ```

3. **Create tunnel:**
   ```cmd
   cloudflared tunnel create grd-wizard
   ```

4. **Configure tunnel:**
   Create `config.yml`:
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: C:\Users\YOUR_USER\.cloudflared\YOUR_TUNNEL_ID.json

   ingress:
     - hostname: grd-wizard.your-domain.com
       service: http://localhost:80
     - service: http_status:404
   ```

5. **Create DNS record:**
   ```cmd
   cloudflared tunnel route dns grd-wizard grd-wizard.your-domain.com
   ```

6. **Run tunnel:**
   ```cmd
   cloudflared tunnel run grd-wizard
   ```

### Option 3: ngrok (Quick Testing)

For quick temporary public access:

1. **Install ngrok:**
   Download from https://ngrok.com/download

2. **Create account and get auth token:**
   Sign up at https://dashboard.ngrok.com/

3. **Configure auth token:**
   ```cmd
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

4. **Start tunnel:**
   ```cmd
   ngrok http 80
   ```

5. **Access via ngrok URL:**
   Ngrok will display a public URL like `https://abc123.ngrok.io`

## HTTPS/SSL Configuration

### Using Let's Encrypt with Docker

1. **Install certbot:**
   ```bash
   docker-compose run --rm certbot certonly --webroot -w /var/www/certbot -d your-domain.com
   ```

2. **Update docker-compose.yml:**
   ```yaml
   nginx:
     volumes:
       - ./nginx-docker.conf:/etc/nginx/conf.d/default.conf:ro
       - ./certbot/conf:/etc/nginx/ssl:ro
       - ./certbot/www:/var/www/certbot:ro
   ```

3. **Uncomment HTTPS section in nginx-docker.conf**

4. **Restart:**
   ```bash
   docker-compose restart nginx
   ```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs grd-wizard

# Check if port is already in use
netstat -ano | findstr :3000
netstat -ano | findstr :80
```

### License Wizard not accessible

```bash
# Verify volume mount
docker-compose exec grd-wizard ls -la /license_wizard

# Check environment variable
docker-compose exec grd-wizard env | grep LICENSE_WIZARD_PATH
```

### Can't access from other machines

```bash
# Check Windows Firewall
# Open Windows Defender Firewall
# Allow port 80 and 443

# Check Docker network
docker network ls
docker network inspect grd-wizard_grd-network
```

### Nginx connection refused

```bash
# Check if grd-wizard service is running
docker-compose ps

# Test direct access to Node.js app
curl http://localhost:3000

# Restart nginx
docker-compose restart nginx
```

## Production Recommendations

1. **Use HTTPS** - Configure SSL certificates
2. **Set resource limits** - Add to docker-compose.yml:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1'
         memory: 512M
   ```
3. **Enable logging** - Add log drivers
4. **Regular backups** - Backup uploads directory
5. **Monitor containers** - Use Docker stats or monitoring tools
6. **Auto-restart** - Already configured with `restart: unless-stopped`

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build

# Clean up old images
docker system prune -a
```

## Uninstall

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes all data)
docker-compose down -v

# Remove images
docker rmi grd-wizard_grd-wizard nginx:alpine
```
