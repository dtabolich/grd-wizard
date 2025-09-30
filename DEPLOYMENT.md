# Deployment Guide

## Prerequisites

- Node.js installed on your server
- Nginx installed
- PM2 (recommended for process management)
- A domain name (optional, can use IP address)

## Step 1: Install Dependencies

```bash
npm install
npm install -g pm2  # For process management
```

## Step 2: Configure Environment

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and set your configuration:
```bash
LICENSE_WIZARD_PATH=C:\Program Files (x86)\Guardant\Software Licensing Kit\redistribute\license_activation\license_wizard.exe
HOST=https://localhost:9000
PORT=3000
```

## Step 3: Start the Application with PM2

```bash
# Start the application
pm2 start server.js --name grd-wizard

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

PM2 useful commands:
```bash
pm2 status              # Check status
pm2 logs grd-wizard     # View logs
pm2 restart grd-wizard  # Restart app
pm2 stop grd-wizard     # Stop app
```

## Step 4: Configure Nginx Reverse Proxy

### On Ubuntu/Debian:

```bash
# Copy nginx configuration
sudo cp nginx.conf /etc/nginx/sites-available/grd-wizard

# Edit the configuration (change server_name to your domain)
sudo nano /etc/nginx/sites-available/grd-wizard

# Enable the site
sudo ln -s /etc/nginx/sites-available/grd-wizard /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### On Windows (with nginx):

1. Copy `nginx.conf` content to your nginx configuration directory
2. Edit `nginx.conf` in your nginx folder
3. Add an `include` statement or merge the configuration
4. Restart nginx

## Step 5: Configure Firewall

```bash
# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS (if using SSL)
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status
```

## Step 6: Setup HTTPS (Recommended for Production)

### Using Let's Encrypt (Free SSL):

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will automatically configure HTTPS
```

## Step 7: Test Your Deployment

Visit your domain or IP address in a browser:
```
http://your-domain.com
```

Or with HTTPS after configuring SSL:
```
https://your-domain.com
```

## Troubleshooting

### Check if Node.js app is running:
```bash
pm2 status
pm2 logs grd-wizard
```

### Check nginx status:
```bash
sudo systemctl status nginx
sudo nginx -t  # Test configuration
```

### Check nginx logs:
```bash
sudo tail -f /var/log/nginx/grd-wizard-error.log
sudo tail -f /var/log/nginx/grd-wizard-access.log
```

### Check if port 3000 is in use:
```bash
netstat -tulpn | grep 3000
```

### Restart everything:
```bash
pm2 restart grd-wizard
sudo systemctl restart nginx
```

## Security Recommendations

1. **Use HTTPS in production** - Enable SSL with Let's Encrypt
2. **Configure firewall** - Only allow necessary ports
3. **Use strong passwords** - If you add authentication later
4. **Regular updates** - Keep Node.js, npm, and nginx updated
5. **Monitor logs** - Set up log rotation and monitoring
6. **Backup `.env` file** - Store securely, never commit to git

## Optional: Configure Log Rotation

Create `/etc/logrotate.d/grd-wizard`:

```
/var/log/nginx/grd-wizard-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

## Updating the Application

```bash
# Pull latest changes
git pull

# Install any new dependencies
npm install

# Restart the application
pm2 restart grd-wizard
```
