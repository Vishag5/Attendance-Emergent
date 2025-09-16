const { execSync } = require('child_process');
const fs = require('fs');

console.log('Generating SSL certificates...');

try {
  // Try to use mkcert if available
  execSync('mkcert -install', { stdio: 'inherit' });
  execSync('mkcert 192.168.1.5 localhost 127.0.0.1', { stdio: 'inherit' });
  console.log('✅ SSL certificates generated successfully!');
} catch (error) {
  console.log('❌ mkcert not available, using Vite built-in HTTPS...');
  console.log('This should work automatically with the current Vite config.');
}
