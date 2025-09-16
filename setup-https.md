# HTTPS Setup for Mobile Camera Access

## The Problem
Mobile browsers (Chrome, Safari, etc.) require HTTPS for camera access. When accessing the app via IP address (like `192.168.1.5:8080`), the browser blocks camera access for security reasons.

## Solutions

### Option 1: Use HTTPS (Recommended)
1. **Generate SSL certificates:**
   ```bash
   # Install mkcert for local certificates
   npm install -g mkcert
   
   # Create local CA
   mkcert -install
   
   # Generate certificates for your IP
   mkcert 192.168.1.5 localhost 127.0.0.1
   ```

2. **Update Vite config to use HTTPS:**
   ```javascript
   // vite.config.ts
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   import fs from 'fs'

   export default defineConfig({
     plugins: [react()],
     server: {
       https: {
         key: fs.readFileSync('192.168.1.5+2-key.pem'),
         cert: fs.readFileSync('192.168.1.5+2.pem'),
       },
       host: '0.0.0.0', // Allow external connections
       port: 8080
     }
   })
   ```

3. **Restart the dev server:**
   ```bash
   npm run dev
   ```

4. **Access via HTTPS:**
   - `https://192.168.1.5:8080` (from mobile)
   - `https://localhost:8080` (from computer)

### Option 2: Use ngrok (Quick Solution)
1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Start your dev server:**
   ```bash
   npm run dev
   ```

3. **Create HTTPS tunnel:**
   ```bash
   ngrok http 8080
   ```

4. **Use the HTTPS URL provided by ngrok**

### Option 3: Use localhost (Computer only)
- Access `http://localhost:8080` from your computer
- This works because localhost is considered secure

## Mobile Browser Settings (Alternative)
If you must use HTTP, try these browser settings:

### Chrome Mobile:
1. Go to `chrome://flags/`
2. Search for "Insecure origins treated as secure"
3. Add your IP: `http://192.168.1.5:8080`
4. Restart Chrome

### Firefox Mobile:
1. Go to `about:config`
2. Set `media.navigator.permission.disabled` to `true`
3. Set `media.navigator.permission.fake` to `true`

## Testing
After setup, the app should:
1. Show camera permission prompt on mobile
2. Allow camera access
3. Display face detection boxes
4. Work with classroom scanning

## Troubleshooting
- **Still no camera?** Check browser console for errors
- **Permission denied?** Clear browser data and try again
- **HTTPS errors?** Accept the self-signed certificate
- **Still not working?** Try a different mobile browser
